/**
 * 情景记忆 - 事件和经历存储
 *
 * 使用 Qdrant 向量数据库进行语义搜索
 * 按时间序列组织，支持上下文丰富的记忆
 */

import {
  BaseMemory,
  MemoryItem,
  MemoryConfig,
  MemoryStats,
  createMemoryItem,
} from "../base.js";
import { QdrantVectorStore } from "../storage/qdrant-store.js";
import { getEmbedding, EmbeddingModel } from "../storage/embedding.js";
import { getDatabaseConfig } from "../../core/database-config.js";

/**
 * 情景记忆中的单个情景
 */
export interface Episode {
  episodeId: string;
  userId: string;
  sessionId: string;
  timestamp: Date;
  content: string;
  context: Record<string, unknown>;
  outcome?: string;
  importance: number;
}

/**
 * 情景记忆选项
 */
export interface EpisodicMemoryOptions {
  enableVectorStore?: boolean;
  vectorCollectionName?: string;
}

/**
 * 情景记忆类
 *
 * 存储具体的事件、经历和对话
 * 特点：按时间顺序、包含上下文、长期保存
 */
export class EpisodicMemory extends BaseMemory {
  private memories: Map<string, MemoryItem> = new Map();
  private episodes: Episode[] = [];
  private sessions: Map<string, string[]> = new Map(); // sessionId -> episodeIds

  // 数据库存储
  private vectorStore: QdrantVectorStore | null = null;
  private embedder: EmbeddingModel | null = null;
  private enableVectorStore: boolean;

  constructor(config: MemoryConfig, options: EpisodicMemoryOptions = {}) {
    super(config);
    this.enableVectorStore = options.enableVectorStore ?? true;

    // 初始化数据库
    this.initDatabases(options);
  }

  /**
   * 初始化数据库连接
   */
  private async initDatabases(options: EpisodicMemoryOptions): Promise<void> {
    // 初始化 Embedding
    try {
      this.embedder = getEmbedding();
      console.log("✅ EpisodicMemory: Embedding 模型就绪");
    } catch (e) {
      console.warn("⚠️ EpisodicMemory: Embedding 初始化失败");
    }

    // 初始化 Qdrant
    if (this.enableVectorStore) {
      try {
        const dbConfig = getDatabaseConfig();
        const qdrantConfig = dbConfig.getQdrantConfig();
        this.vectorStore = new QdrantVectorStore({
          ...qdrantConfig,
          collectionName: options.vectorCollectionName ?? "episodic_memories",
          vectorSize: this.embedder?.dimension ?? 1024,
        });
        console.log("✅ EpisodicMemory: Qdrant 向量数据库就绪");
      } catch (e) {
        console.warn("⚠️ EpisodicMemory: Qdrant 初始化失败:", e);
        this.vectorStore = null;
      }
    }
  }

  /**
   * 添加记忆
   */
  async add(item: MemoryItem): Promise<string> {
    // 存入内存缓存
    this.memories.set(item.id, item);

    // 提取情景信息
    const sessionId = (item.metadata.sessionId as string) ?? "default_session";
    const context = (item.metadata.context as Record<string, unknown>) ?? {};
    const outcome = item.metadata.outcome as string | undefined;

    // 创建情景
    const episode: Episode = {
      episodeId: item.id,
      userId: item.userId,
      sessionId,
      timestamp: item.timestamp,
      content: item.content,
      context,
      outcome,
      importance: item.importance,
    };
    this.episodes.push(episode);

    // 更新会话索引
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, []);
    }
    this.sessions.get(sessionId)!.push(item.id);

    // 存入 Qdrant 向量数据库
    if (this.vectorStore && this.embedder) {
      try {
        const embedding = await this.embedder.encode(item.content);
        await this.vectorStore.addVectors(
          [embedding[0]],
          [
            {
              memory_id: item.id,
              user_id: item.userId,
              memory_type: "episodic",
              session_id: sessionId,
              content: item.content,
              importance: item.importance,
              timestamp: item.timestamp.getTime(),
              // 存储完整 metadata 以支持重启后恢复
              ...item.metadata,
            },
          ],
          [item.id]
        );
      } catch (e) {
        console.warn("⚠️ EpisodicMemory: 向量存储失败:", e);
      }
    }

    // 检查容量
    if (this.memories.size > this.config.maxCapacity) {
      this.forgetLowImportance();
    }

    return item.id;
  }

  /**
   * 检索记忆（向量搜索 + 时间过滤）
   */
  async retrieve(
    query: string,
    limit = 5,
    options: {
      minImportance?: number;
      userId?: string;
      sessionId?: string;
      timeRange?: { start: Date; end: Date };
      useVectorSearch?: boolean;
    } = {}
  ): Promise<MemoryItem[]> {
    const results: MemoryItem[] = [];
    const seen = new Set<string>();
    const useVector = options.useVectorSearch ?? true;

    // 1. 向量检索（Qdrant）
    if (useVector && this.vectorStore && this.embedder) {
      try {
        const queryVec = await this.embedder.encode(query);
        const filter: Record<string, unknown> = { memory_type: "episodic" };
        if (options.userId) {
          filter.user_id = options.userId;
        }
        if (options.sessionId) {
          filter.session_id = options.sessionId;
        }

        const hits = await this.vectorStore.searchSimilar(
          queryVec[0],
          limit * 2,
          undefined,
          filter
        );

        for (const hit of hits) {
          const memId = hit.metadata.memory_id as string;
          if (memId && !seen.has(memId)) {
            seen.add(memId);
            
            // 优先从本地 Map 获取，如果没有则从 payload 重建
            let memory = this.memories.get(memId);
            if (!memory) {
              // 从 Qdrant payload 重建 MemoryItem
              memory = this.rebuildFromPayload(hit.metadata);
              if (memory) {
                // 重建后加入本地缓存
                this.memories.set(memory.id, memory);
              }
            }
            
            if (memory) {
              // 重要性过滤
              if (
                options.minImportance &&
                memory.importance < options.minImportance
              ) {
                continue;
              }
              // 时间范围过滤
              if (options.timeRange) {
                if (
                  memory.timestamp < options.timeRange.start ||
                  memory.timestamp > options.timeRange.end
                ) {
                  continue;
                }
              }
              results.push({
                ...memory,
                metadata: {
                  ...memory.metadata,
                  relevanceScore: hit.score,
                  source: "vector",
                },
              });
            }
          }
        }
      } catch (e) {
        console.warn("⚠️ EpisodicMemory: 向量搜索失败:", e);
      }
    }

    // 2. 回退到关键词搜索
    if (results.length < limit) {
      const queryLower = query.toLowerCase();

      for (const memory of this.memories.values()) {
        if (seen.has(memory.id)) continue;
        if (results.length >= limit) break;

        // 过滤条件
        if (options.userId && memory.userId !== options.userId) continue;
        if (options.minImportance && memory.importance < options.minImportance)
          continue;
        if (
          options.sessionId &&
          memory.metadata.sessionId !== options.sessionId
        )
          continue;
        if (options.timeRange) {
          if (
            memory.timestamp < options.timeRange.start ||
            memory.timestamp > options.timeRange.end
          ) {
            continue;
          }
        }

        // 关键词匹配
        if (memory.content.toLowerCase().includes(queryLower)) {
          seen.add(memory.id);
          results.push({
            ...memory,
            metadata: { ...memory.metadata, source: "keyword" },
          });
        }
      }
    }

    // 按时间倒序排列
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return results.slice(0, limit);
  }

  /**
   * 获取会话的所有记忆
   */
  getSessionMemories(sessionId: string): MemoryItem[] {
    const episodeIds = this.sessions.get(sessionId) ?? [];
    return episodeIds
      .map((id) => this.memories.get(id))
      .filter((m): m is MemoryItem => m !== undefined);
  }

  /**
   * 获取最近的记忆
   */
  getRecentMemories(limit = 10, userId?: string): MemoryItem[] {
    const memories = [...this.memories.values()];

    const filtered = userId
      ? memories.filter((m) => m.userId === userId)
      : memories;

    return filtered
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * 更新记忆
   */
  async update(
    memoryId: string,
    updates: {
      content?: string;
      importance?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<boolean> {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return false;
    }

    const updatedMemory = createMemoryItem(
      updates.content ?? memory.content,
      memory.memoryType,
      memory.userId,
      {
        id: memory.id,
        timestamp: memory.timestamp,
        importance: updates.importance ?? memory.importance,
        metadata: { ...memory.metadata, ...updates.metadata },
      }
    );

    this.memories.set(memoryId, updatedMemory);

    // 如果内容更新，重新嵌入并更新向量
    if (updates.content && this.vectorStore && this.embedder) {
      try {
        const embedding = await this.embedder.encode(updatedMemory.content);
        await this.vectorStore.addVectors(
          [embedding[0]],
          [
            {
              memory_id: memoryId,
              user_id: updatedMemory.userId,
              memory_type: "episodic",
              content: updatedMemory.content,
              importance: updatedMemory.importance,
            },
          ],
          [memoryId]
        );
      } catch (e) {
        console.warn("⚠️ EpisodicMemory: 向量更新失败:", e);
      }
    }

    return true;
  }

  /**
   * 删除记忆
   */
  async remove(memoryId: string): Promise<boolean> {
    // 从 Qdrant 删除
    if (this.vectorStore) {
      try {
        await this.vectorStore.deleteMemories([memoryId]);
      } catch (e) {
        console.warn("⚠️ EpisodicMemory: 向量删除失败:", e);
      }
    }

    // 从会话索引中删除
    for (const [sessionId, ids] of this.sessions) {
      const index = ids.indexOf(memoryId);
      if (index > -1) {
        ids.splice(index, 1);
        if (ids.length === 0) {
          this.sessions.delete(sessionId);
        }
        break;
      }
    }

    // 从情景列表中删除
    const episodeIndex = this.episodes.findIndex(
      (e) => e.episodeId === memoryId
    );
    if (episodeIndex > -1) {
      this.episodes.splice(episodeIndex, 1);
    }

    return this.memories.delete(memoryId);
  }

  /**
   * 检查记忆是否存在
   */
  hasMemory(memoryId: string): boolean {
    return this.memories.has(memoryId);
  }

  /**
   * 清空记忆
   */
  async clear(): Promise<void> {
    this.memories.clear();
    this.episodes = [];
    this.sessions.clear();

    // 清空 Qdrant
    if (this.vectorStore) {
      try {
        await this.vectorStore.clearCollection();
      } catch (e) {
        console.warn("⚠️ EpisodicMemory: 向量清空失败:", e);
      }
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<
    MemoryStats & {
      episodeCount?: number;
      sessionCount?: number;
      vectorStore?: Record<string, unknown>;
    }
  > {
    const memories = [...this.memories.values()];

    const stats: MemoryStats & {
      episodeCount?: number;
      sessionCount?: number;
      vectorStore?: Record<string, unknown>;
    } = {
      count: memories.length,
      memoryType: "episodic",
      oldestTimestamp:
        memories.length > 0
          ? new Date(Math.min(...memories.map((m) => m.timestamp.getTime())))
          : undefined,
      newestTimestamp:
        memories.length > 0
          ? new Date(Math.max(...memories.map((m) => m.timestamp.getTime())))
          : undefined,
      averageImportance:
        memories.length > 0
          ? memories.reduce((sum, m) => sum + m.importance, 0) / memories.length
          : undefined,
      episodeCount: this.episodes.length,
      sessionCount: this.sessions.size,
    };

    // 获取 Qdrant 统计
    if (this.vectorStore) {
      try {
        stats.vectorStore = await this.vectorStore.getCollectionInfo();
      } catch {
        // ignore
      }
    }

    return stats;
  }

  /**
   * 获取所有记忆
   */
  getAll(): MemoryItem[] {
    return [...this.memories.values()];
  }

  /**
   * 从 Qdrant payload 重建 MemoryItem
   * 当本地 Map 为空（重启后）时使用
   */
  private rebuildFromPayload(payload: Record<string, unknown>): MemoryItem | undefined {
    try {
      const memoryId = payload.memory_id as string;
      const content = payload.content as string;
      const userId = payload.user_id as string;
      const importance = (payload.importance as number) ?? 0.5;
      const timestamp = payload.timestamp 
        ? new Date(payload.timestamp as string | number)
        : new Date();

      if (!memoryId || !content) {
        return undefined;
      }

      // 重建 metadata（排除已知字段）
      const metadata: Record<string, unknown> = {};
      const knownFields = ['memory_id', 'content', 'user_id', 'importance', 'timestamp', 'memory_type'];
      for (const [key, value] of Object.entries(payload)) {
        if (!knownFields.includes(key)) {
          metadata[key] = value;
        }
      }

      const memory: MemoryItem = {
        id: memoryId,
        content,
        memoryType: 'episodic',
        userId: userId ?? 'unknown',
        timestamp,
        importance,
        metadata,
      };

      console.log(`🔄 从 Qdrant 恢复记忆: ${memoryId.substring(0, 8)}...`);
      return memory;
    } catch (e) {
      console.warn('⚠️ 重建记忆失败:', e);
      return undefined;
    }
  }

  /**
   * 遗忘
   */
  forget(
    strategy:
      | "importance_based"
      | "time_based"
      | "capacity_based" = "importance_based",
    threshold = 0.1,
    _maxAgeDays = 30
  ): number {
    let forgotten = 0;

    if (strategy === "importance_based") {
      for (const [id, memory] of this.memories) {
        if (memory.importance < threshold) {
          this.remove(id);
          forgotten++;
        }
      }
    }

    return forgotten;
  }

  /**
   * 遗忘低重要性记忆
   */
  private forgetLowImportance(): void {
    let lowestId: string | null = null;
    let lowestImportance = Infinity;

    for (const [id, memory] of this.memories) {
      if (memory.importance < lowestImportance) {
        lowestImportance = memory.importance;
        lowestId = id;
      }
    }

    if (lowestId) {
      this.remove(lowestId);
    }
  }
}
