/**
 * 记忆管理器 - 统一的记忆操作接口
 *
 * 支持:
 * - 工作记忆 (WorkingMemory)
 * - 情景记忆 (EpisodicMemory) - 集成 Qdrant 向量搜索
 * - 语义记忆 (SemanticMemory) - 集成 Qdrant + Neo4j
 */

import { randomUUID } from 'crypto';
import {
  BaseMemory,
  MemoryItem,
  MemoryConfig,
  createMemoryConfig,
  createMemoryItem,
} from './base.js';
import { WorkingMemory } from './types/working.js';
import { EpisodicMemory, EpisodicMemoryOptions } from './types/episodic.js';
import { SemanticMemory, SemanticMemoryOptions, Entity, Relation } from './types/semantic.js';

/**
 * 记忆管理器选项
 */
export interface MemoryManagerOptions {
  config?: Partial<MemoryConfig>;
  userId?: string;
  enableWorking?: boolean;
  enableEpisodic?: boolean;
  enableSemantic?: boolean;
  // 数据库选项
  enableVectorStore?: boolean;
  enableGraphStore?: boolean;
  episodicOptions?: EpisodicMemoryOptions;
  semanticOptions?: SemanticMemoryOptions;
}

/**
 * 记忆管理器统计信息
 */
export interface MemoryManagerStats {
  userId: string;
  enabledTypes: string[];
  totalMemories: number;
  memoriesByType: Record<string, unknown>;
  config: {
    maxCapacity: number;
    importanceThreshold: number;
    decayFactor: number;
  };
}

/**
 * 记忆管理器
 *
 * 负责：
 * - 记忆生命周期管理
 * - 记忆优先级和重要性评估
 * - 记忆遗忘和清理机制
 * - 多类型记忆的协调管理
 * - 数据库存储集成（Qdrant + Neo4j）
 */
export class MemoryManager {
  readonly config: MemoryConfig;
  readonly userId: string;
  private memoryTypes: Map<string, BaseMemory> = new Map();
  private semanticMemory: SemanticMemory | null = null;
  private episodicMemory: EpisodicMemory | null = null;

  constructor(options: MemoryManagerOptions = {}) {
    this.config = createMemoryConfig(options.config);
    this.userId = options.userId ?? 'default_user';

    // 初始化各类型记忆
    if (options.enableWorking !== false) {
      this.memoryTypes.set('working', new WorkingMemory(this.config));
    }

    if (options.enableEpisodic !== false) {
      this.episodicMemory = new EpisodicMemory(this.config, {
        enableVectorStore: options.enableVectorStore ?? true,
        ...options.episodicOptions,
      });
      this.memoryTypes.set('episodic', this.episodicMemory as unknown as BaseMemory);
    }

    if (options.enableSemantic !== false) {
      this.semanticMemory = new SemanticMemory(this.config, {
        enableVectorStore: options.enableVectorStore ?? true,
        enableGraphStore: options.enableGraphStore ?? true,
        ...options.semanticOptions,
      });
      this.memoryTypes.set('semantic', this.semanticMemory as unknown as BaseMemory);
    }

    console.log(`MemoryManager 初始化完成，启用记忆类型: ${[...this.memoryTypes.keys()].join(', ')}`);
  }

  /**
   * 添加记忆（异步，支持向量存储）
   */
  async addMemory(
    content: string,
    options: {
      memoryType?: string;
      importance?: number;
      metadata?: Record<string, unknown>;
      autoClassify?: boolean;
    } = {}
  ): Promise<string> {
    const { importance, metadata, autoClassify = true } = options;
    let { memoryType } = options;

    // 自动分类记忆类型
    if (autoClassify && !memoryType) {
      memoryType = this.classifyMemoryType(content, metadata);
    }

    memoryType = memoryType ?? 'working';

    // 计算重要性
    const calculatedImportance = importance ?? this.calculateImportance(content, metadata);

    // 创建记忆项
    const memoryItem = createMemoryItem(content, memoryType, this.userId, {
      id: randomUUID(),
      importance: calculatedImportance,
      metadata,
    });

    // 添加到对应的记忆类型
    if (memoryType === 'semantic' && this.semanticMemory) {
      return await this.semanticMemory.add(memoryItem);
    } else if (memoryType === 'episodic' && this.episodicMemory) {
      return await this.episodicMemory.add(memoryItem);
    } else {
      const memory = this.memoryTypes.get(memoryType);
      if (!memory) {
        throw new Error(`不支持的记忆类型: ${memoryType}`);
      }
      return memory.add(memoryItem);
    }
  }

  /**
   * 检索记忆（异步，支持向量搜索）
   */
  async retrieveMemories(
    query: string,
    options: {
      memoryTypes?: string[];
      limit?: number;
      minImportance?: number;
      useVectorSearch?: boolean;
    } = {}
  ): Promise<MemoryItem[]> {
    const { limit = 10, minImportance = 0, useVectorSearch = true } = options;
    let { memoryTypes } = options;

    if (!memoryTypes || memoryTypes.length === 0) {
      memoryTypes = [...this.memoryTypes.keys()];
    }

    // 从各个记忆类型中检索
    const allResults: MemoryItem[] = [];
    const perTypeLimit = Math.max(1, Math.floor(limit / memoryTypes.length));

    for (const typeName of memoryTypes) {
      try {
        if (typeName === 'semantic' && this.semanticMemory) {
          const typeResults = await this.semanticMemory.retrieve(query, perTypeLimit, {
            minImportance,
            userId: this.userId,
            useVectorSearch,
          });
          allResults.push(...typeResults);
        } else if (typeName === 'episodic' && this.episodicMemory) {
          const typeResults = await this.episodicMemory.retrieve(query, perTypeLimit, {
            minImportance,
            userId: this.userId,
            useVectorSearch,
          });
          allResults.push(...typeResults);
        } else {
          const memory = this.memoryTypes.get(typeName);
          if (memory) {
            const result = memory.retrieve(query, perTypeLimit, {
              minImportance,
              userId: this.userId,
            });
            // 处理同步和异步结果
            const typeResults = Array.isArray(result) ? result : await result;
            allResults.push(...typeResults);
          }
        }
      } catch (error) {
        console.warn(`检索 ${typeName} 记忆时出错:`, error);
      }
    }

    // 按重要性排序
    allResults.sort((a, b) => b.importance - a.importance);

    return allResults.slice(0, limit);
  }

  /**
   * 更新记忆
   */
  async updateMemory(
    memoryId: string,
    updates: { content?: string; importance?: number; metadata?: Record<string, unknown> }
  ): Promise<boolean> {
    // 检查 semantic memory
    if (this.semanticMemory && this.semanticMemory.hasMemory(memoryId)) {
      return this.semanticMemory.update(memoryId, updates);
    }

    // 检查 episodic memory
    if (this.episodicMemory && this.episodicMemory.hasMemory(memoryId)) {
      return await this.episodicMemory.update(memoryId, updates);
    }

    // 检查其他类型
    for (const memory of this.memoryTypes.values()) {
      if (memory.hasMemory(memoryId)) {
        return memory.update(memoryId, updates);
      }
    }

    console.warn(`未找到记忆: ${memoryId}`);
    return false;
  }

  /**
   * 删除记忆
   */
  async removeMemory(memoryId: string): Promise<boolean> {
    // 检查 semantic memory
    if (this.semanticMemory && this.semanticMemory.hasMemory(memoryId)) {
      return await this.semanticMemory.remove(memoryId);
    }

    // 检查 episodic memory
    if (this.episodicMemory && this.episodicMemory.hasMemory(memoryId)) {
      return await this.episodicMemory.remove(memoryId);
    }

    // 检查其他类型
    for (const memory of this.memoryTypes.values()) {
      if (memory.hasMemory(memoryId)) {
        return memory.remove(memoryId);
      }
    }

    console.warn(`未找到记忆: ${memoryId}`);
    return false;
  }

  /**
   * 添加实体到知识图谱（通过 SemanticMemory）
   */
  async addEntity(entity: Entity): Promise<boolean> {
    if (!this.semanticMemory) {
      console.warn('SemanticMemory 未启用');
      return false;
    }
    return await this.semanticMemory.addEntity(entity);
  }

  /**
   * 添加关系到知识图谱（通过 SemanticMemory）
   */
  async addRelation(relation: Relation): Promise<boolean> {
    if (!this.semanticMemory) {
      console.warn('SemanticMemory 未启用');
      return false;
    }
    return await this.semanticMemory.addRelation(relation);
  }

  /**
   * 查找相关实体
   */
  async findRelatedEntities(
    entityId: string,
    options: { maxDepth?: number; limit?: number } = {}
  ): Promise<Array<Entity & { distance: number; relationshipPath: string[] }>> {
    if (!this.semanticMemory) {
      console.warn('SemanticMemory 未启用');
      return [];
    }
    return await this.semanticMemory.findRelatedEntities(entityId, options);
  }

  /**
   * 搜索实体
   */
  async searchEntities(
    namePattern: string,
    options: { entityTypes?: string[]; limit?: number } = {}
  ): Promise<Entity[]> {
    if (!this.semanticMemory) {
      console.warn('SemanticMemory 未启用');
      return [];
    }
    return await this.semanticMemory.searchEntities(namePattern, options);
  }

  /**
   * 记忆遗忘机制
   */
  forgetMemories(
    strategy: 'importance_based' | 'time_based' | 'capacity_based' = 'importance_based',
    threshold = 0.1,
    maxAgeDays = 30
  ): number {
    let totalForgotten = 0;

    // 针对 EpisodicMemory 的遗忘
    if (this.episodicMemory) {
      totalForgotten += this.episodicMemory.forget(strategy, threshold, maxAgeDays);
    }

    console.log(`记忆遗忘完成: ${totalForgotten} 条记忆`);
    return totalForgotten;
  }

  /**
   * 记忆整合 - 将重要的短期记忆转换为长期记忆
   */
  async consolidateMemories(
    fromType = 'working',
    toType = 'episodic',
    importanceThreshold = 0.7
  ): Promise<number> {
    const source = this.memoryTypes.get(fromType);

    if (!source) {
      console.warn(`源记忆类型不存在: ${fromType}`);
      return 0;
    }

    // 获取高重要性的源记忆
    const allMemories = source.getAll();
    const candidates = allMemories.filter((m) => m.importance >= importanceThreshold);

    let consolidatedCount = 0;
    for (const memory of candidates) {
      if (source.remove(memory.id)) {
        const newMemory = createMemoryItem(memory.content, toType, memory.userId, {
          importance: Math.min(1, memory.importance * 1.1),
          metadata: { ...memory.metadata, consolidatedFrom: fromType },
        });

        // 添加到目标类型
        if (toType === 'semantic' && this.semanticMemory) {
          await this.semanticMemory.add(newMemory);
        } else if (toType === 'episodic' && this.episodicMemory) {
          await this.episodicMemory.add(newMemory);
        } else {
          const target = this.memoryTypes.get(toType);
          if (target) {
            target.add(newMemory);
          }
        }
        consolidatedCount++;
      }
    }

    console.log(`记忆整合完成: ${consolidatedCount} 条记忆从 ${fromType} 转移到 ${toType}`);
    return consolidatedCount;
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<MemoryManagerStats> {
    const stats: MemoryManagerStats = {
      userId: this.userId,
      enabledTypes: [...this.memoryTypes.keys()],
      totalMemories: 0,
      memoriesByType: {},
      config: {
        maxCapacity: this.config.maxCapacity,
        importanceThreshold: this.config.importanceThreshold,
        decayFactor: this.config.decayFactor,
      },
    };

    for (const [typeName, memory] of this.memoryTypes) {
      let typeStats;
      if (typeName === 'semantic' && this.semanticMemory) {
        typeStats = await this.semanticMemory.getStats();
      } else if (typeName === 'episodic' && this.episodicMemory) {
        typeStats = await this.episodicMemory.getStats();
      } else {
        const result = memory.getStats();
        typeStats = result instanceof Promise ? await result : result;
      }
      stats.memoriesByType[typeName] = typeStats;
      stats.totalMemories += typeStats.count;
    }

    return stats;
  }

  /**
   * 清空所有记忆
   */
  async clearAllMemories(): Promise<void> {
    for (const [typeName, memory] of this.memoryTypes) {
      if (typeName === 'semantic' && this.semanticMemory) {
        await this.semanticMemory.clear();
      } else if (typeName === 'episodic' && this.episodicMemory) {
        await this.episodicMemory.clear();
      } else {
        memory.clear();
      }
    }
    console.log('所有记忆已清空');
  }

  /**
   * 关闭数据库连接
   */
  async close(): Promise<void> {
    if (this.semanticMemory) {
      await this.semanticMemory.close();
    }
  }

  /**
   * 自动分类记忆类型
   */
  private classifyMemoryType(content: string, metadata?: Record<string, unknown>): string {
    if (metadata?.type && typeof metadata.type === 'string') {
      return metadata.type;
    }

    if (this.isEpisodicContent(content)) {
      return 'episodic';
    }

    if (this.isSemanticContent(content)) {
      return 'semantic';
    }

    return 'working';
  }

  /**
   * 判断是否为情景记忆内容
   */
  private isEpisodicContent(content: string): boolean {
    const episodicKeywords = ['昨天', '今天', '明天', '上次', '记得', '发生', '经历'];
    return episodicKeywords.some((keyword) => content.includes(keyword));
  }

  /**
   * 判断是否为语义记忆内容
   */
  private isSemanticContent(content: string): boolean {
    const semanticKeywords = ['定义', '概念', '规则', '知识', '原理', '方法'];
    return semanticKeywords.some((keyword) => content.includes(keyword));
  }

  /**
   * 计算记忆重要性
   */
  private calculateImportance(content: string, metadata?: Record<string, unknown>): number {
    let importance = 0.5;

    // 基于内容长度
    if (content.length > 100) {
      importance += 0.1;
    }

    // 基于关键词
    const importantKeywords = ['重要', '关键', '必须', '注意', '警告', '错误'];
    if (importantKeywords.some((keyword) => content.includes(keyword))) {
      importance += 0.2;
    }

    // 基于元数据
    if (metadata) {
      if (metadata.priority === 'high') {
        importance += 0.3;
      } else if (metadata.priority === 'low') {
        importance -= 0.2;
      }
    }

    return Math.max(0, Math.min(1, importance));
  }

  toString(): string {
    return `MemoryManager(user=${this.userId}, types=${[...this.memoryTypes.keys()].join(', ')})`;
  }
}
