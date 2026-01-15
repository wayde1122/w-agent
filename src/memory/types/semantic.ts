/**
 * 语义记忆 - 知识和概念存储
 *
 * 结合向量检索和知识图谱的混合语义记忆：
 * - Qdrant 向量数据库进行语义相似度搜索
 * - Neo4j 图数据库存储实体关系
 */

import {
  BaseMemory,
  MemoryItem,
  MemoryConfig,
  MemoryStats,
  createMemoryItem,
} from "../base.js";
import { QdrantVectorStore } from "../storage/qdrant-store.js";
import { Neo4jGraphStore } from "../storage/neo4j-store.js";
import { getEmbedding, EmbeddingModel } from "../storage/embedding.js";
import { getDatabaseConfig } from "../../core/database-config.js";

/**
 * 实体类
 */
export interface Entity {
  entityId: string;
  name: string;
  entityType: string; // PERSON, ORG, PRODUCT, SKILL, CONCEPT 等
  description?: string;
  properties?: Record<string, unknown>;
  frequency?: number;
}

/**
 * 关系类
 */
export interface Relation {
  fromEntity: string;
  toEntity: string;
  relationType: string;
  strength?: number;
  evidence?: string;
  properties?: Record<string, unknown>;
}

/**
 * 语义记忆选项
 */
export interface SemanticMemoryOptions {
  enableVectorStore?: boolean; // 启用 Qdrant 向量存储
  enableGraphStore?: boolean; // 启用 Neo4j 图存储
  vectorCollectionName?: string;
}

/**
 * 语义记忆类
 *
 * 存储事实、概念和一般知识
 * 特点：结构化、可关联、长期保存
 */
export class SemanticMemory extends BaseMemory {
  private memories: Map<string, MemoryItem> = new Map();
  private conceptIndex: Map<string, Set<string>> = new Map();

  // 数据库存储
  private vectorStore: QdrantVectorStore | null = null;
  private graphStore: Neo4jGraphStore | null = null;
  private embedder: EmbeddingModel | null = null;

  // 实体和关系缓存
  private entities: Map<string, Entity> = new Map();
  private relations: Relation[] = [];

  // 配置
  private enableVectorStore: boolean;
  private enableGraphStore: boolean;

  constructor(config: MemoryConfig, options: SemanticMemoryOptions = {}) {
    super(config);

    this.enableVectorStore = options.enableVectorStore ?? true;
    this.enableGraphStore = options.enableGraphStore ?? true;

    // 初始化数据库连接
    this.initDatabases(options);
  }

  /**
   * 初始化数据库连接
   */
  private async initDatabases(options: SemanticMemoryOptions): Promise<void> {
    const dbConfig = getDatabaseConfig();

    // 初始化 Embedding
    try {
      this.embedder = getEmbedding();
      console.log("✅ Embedding 模型就绪");
    } catch (e) {
      console.warn("⚠️ Embedding 初始化失败，使用简单匹配");
    }

    // 初始化 Qdrant
    if (this.enableVectorStore) {
      try {
        const qdrantConfig = dbConfig.getQdrantConfig();
        this.vectorStore = new QdrantVectorStore({
          ...qdrantConfig,
          collectionName: options.vectorCollectionName ?? "semantic_memories",
          vectorSize: this.embedder?.dimension ?? 1024,
        });
        console.log("✅ Qdrant 向量数据库就绪");
      } catch (e) {
        console.warn("⚠️ Qdrant 初始化失败:", e);
        this.vectorStore = null;
      }
    }

    // 初始化 Neo4j
    if (this.enableGraphStore) {
      try {
        const neo4jConfig = dbConfig.getNeo4jConfig();
        this.graphStore = new Neo4jGraphStore(neo4jConfig);
        console.log("✅ Neo4j 图数据库就绪");
      } catch (e) {
        console.warn("⚠️ Neo4j 初始化失败:", e);
        this.graphStore = null;
      }
    }
  }

  /**
   * 添加记忆
   */
  async add(item: MemoryItem): Promise<string> {
    // 存入内存缓存
    this.memories.set(item.id, item);
    this.indexConcepts(item);

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
              memory_type: "semantic",
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
        console.warn("⚠️ 向量存储失败:", e);
      }
    }

    // 检查容量
    if (this.memories.size > this.config.maxCapacity) {
      this.forgetLowImportance();
    }

    return item.id;
  }

  /**
   * 检索记忆（混合检索：向量 + 关键词 + 图）
   */
  async retrieve(
    query: string,
    limit = 5,
    options: {
      minImportance?: number;
      userId?: string;
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
        const filter: Record<string, unknown> = { memory_type: "semantic" };
        if (options.userId) {
          filter.user_id = options.userId;
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
              if (
                options.minImportance &&
                memory.importance < options.minImportance
              ) {
                continue;
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
        console.warn("⚠️ 向量搜索失败:", e);
      }
    }

    // 2. 概念索引检索（回退方案）
    if (results.length < limit) {
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/);

      const candidateIds = new Set<string>();
      for (const word of queryWords) {
        const ids = this.conceptIndex.get(word);
        if (ids) {
          for (const id of ids) {
            if (!seen.has(id)) {
              candidateIds.add(id);
            }
          }
        }
      }

      for (const id of candidateIds) {
        if (results.length >= limit) break;

        const memory = this.memories.get(id);
        if (!memory) continue;

        if (options.userId && memory.userId !== options.userId) continue;
        if (options.minImportance && memory.importance < options.minImportance)
          continue;

        const score = this.calculateRelevance(memory.content, queryLower);
        if (score > 0) {
          seen.add(id);
          results.push({
            ...memory,
            metadata: {
              ...memory.metadata,
              relevanceScore: score,
              source: "keyword",
            },
          });
        }
      }
    }

    // 排序
    results.sort((a, b) => {
      const scoreA = (a.metadata.relevanceScore as number) ?? 0;
      const scoreB = (b.metadata.relevanceScore as number) ?? 0;
      return scoreB * b.importance - scoreA * a.importance;
    });

    return results.slice(0, limit);
  }

  /**
   * 添加实体到知识图谱
   */
  async addEntity(entity: Entity): Promise<boolean> {
    // 存入内存缓存
    this.entities.set(entity.entityId, entity);

    // 存入 Neo4j
    if (this.graphStore) {
      try {
        return await this.graphStore.addEntity(
          entity.entityId,
          entity.name,
          entity.entityType,
          entity.properties
        );
      } catch (e) {
        console.warn("⚠️ 实体存储失败:", e);
      }
    }

    return true;
  }

  /**
   * 添加关系到知识图谱
   */
  async addRelation(relation: Relation): Promise<boolean> {
    // 存入内存缓存
    this.relations.push(relation);

    // 存入 Neo4j
    if (this.graphStore) {
      try {
        return await this.graphStore.addRelationship(
          relation.fromEntity,
          relation.toEntity,
          relation.relationType,
          relation.properties
        );
      } catch (e) {
        console.warn("⚠️ 关系存储失败:", e);
      }
    }

    return true;
  }

  /**
   * 查找相关实体
   */
  async findRelatedEntities(
    entityId: string,
    options: { maxDepth?: number; limit?: number } = {}
  ): Promise<Array<Entity & { distance: number; relationshipPath: string[] }>> {
    if (this.graphStore) {
      try {
        const results = await this.graphStore.findRelatedEntities(
          entityId,
          options
        );
        // 转换 EntityData 到 Entity
        return results.map((r) => ({
          entityId: r.id,
          name: r.name,
          entityType: r.type,
          properties: r.properties,
          distance: r.distance,
          relationshipPath: r.relationshipPath,
        }));
      } catch (e) {
        console.warn("⚠️ 图查询失败:", e);
      }
    }

    return [];
  }

  /**
   * 按名称搜索实体
   */
  async searchEntities(
    namePattern: string,
    options: { entityTypes?: string[]; limit?: number } = {}
  ): Promise<Entity[]> {
    if (this.graphStore) {
      try {
        const results = await this.graphStore.searchEntitiesByName(
          namePattern,
          options
        );
        // 转换 EntityData 到 Entity
        return results.map((r) => ({
          entityId: r.id,
          name: r.name,
          entityType: r.type,
          properties: r.properties,
        }));
      } catch (e) {
        console.warn("⚠️ 实体搜索失败:", e);
      }
    }

    // 回退到内存搜索
    const results: Entity[] = [];
    const pattern = namePattern.toLowerCase();

    for (const entity of this.entities.values()) {
      if (entity.name.toLowerCase().includes(pattern)) {
        if (
          options.entityTypes &&
          !options.entityTypes.includes(entity.entityType)
        ) {
          continue;
        }
        results.push(entity);
        if (options.limit && results.length >= options.limit) {
          break;
        }
      }
    }

    return results;
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
        memoryType: 'semantic',
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
   * 更新记忆
   */
  update(
    memoryId: string,
    updates: {
      content?: string;
      importance?: number;
      metadata?: Record<string, unknown>;
    }
  ): boolean {
    const memory = this.memories.get(memoryId);
    if (!memory) {
      return false;
    }

    if (updates.content) {
      this.removeFromIndex(memory);
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

    if (updates.content) {
      this.indexConcepts(updatedMemory);
    }

    return true;
  }

  /**
   * 删除记忆
   */
  async remove(memoryId: string): Promise<boolean> {
    const memory = this.memories.get(memoryId);
    if (memory) {
      this.removeFromIndex(memory);
    }

    // 从 Qdrant 删除
    if (this.vectorStore) {
      try {
        await this.vectorStore.deleteMemories([memoryId]);
      } catch (e) {
        console.warn("⚠️ 向量删除失败:", e);
      }
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
    this.conceptIndex.clear();
    this.entities.clear();
    this.relations = [];

    // 清空 Qdrant
    if (this.vectorStore) {
      try {
        await this.vectorStore.clearCollection();
      } catch (e) {
        console.warn("⚠️ 向量清空失败:", e);
      }
    }

    // 清空 Neo4j
    if (this.graphStore) {
      try {
        await this.graphStore.clearAll();
      } catch (e) {
        console.warn("⚠️ 图清空失败:", e);
      }
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<
    MemoryStats & {
      entityCount?: number;
      relationCount?: number;
      vectorStore?: Record<string, unknown>;
    }
  > {
    const memories = [...this.memories.values()];

    const stats: MemoryStats & {
      entityCount?: number;
      relationCount?: number;
      vectorStore?: Record<string, unknown>;
    } = {
      count: memories.length,
      memoryType: "semantic",
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
      entityCount: this.entities.size,
      relationCount: this.relations.length,
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
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.graphStore) {
      await this.graphStore.close();
    }
  }

  /**
   * 为记忆内容建立概念索引
   */
  private indexConcepts(memory: MemoryItem): void {
    const words = memory.content.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 2) {
        if (!this.conceptIndex.has(word)) {
          this.conceptIndex.set(word, new Set());
        }
        this.conceptIndex.get(word)!.add(memory.id);
      }
    }
  }

  /**
   * 从索引中移除记忆
   */
  private removeFromIndex(memory: MemoryItem): void {
    const words = memory.content.toLowerCase().split(/\s+/);
    for (const word of words) {
      const ids = this.conceptIndex.get(word);
      if (ids) {
        ids.delete(memory.id);
        if (ids.size === 0) {
          this.conceptIndex.delete(word);
        }
      }
    }
  }

  /**
   * 计算相关性分数
   */
  private calculateRelevance(content: string, query: string): number {
    const contentLower = content.toLowerCase();
    const queryWords = query.split(/\s+/);

    let matches = 0;
    for (const word of queryWords) {
      if (contentLower.includes(word)) {
        matches++;
      }
    }

    return matches / queryWords.length;
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
      const memory = this.memories.get(lowestId);
      if (memory) {
        this.removeFromIndex(memory);
      }
      this.memories.delete(lowestId);
    }
  }
}
