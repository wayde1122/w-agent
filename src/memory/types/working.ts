/**
 * 工作记忆 - 短期记忆存储
 */

import { BaseMemory, MemoryItem, MemoryConfig, MemoryStats, createMemoryItem } from '../base.js';

/**
 * 工作记忆类
 *
 * 存储临时的、短期的记忆内容
 * 特点：容量有限、会过期、用于当前任务上下文
 */
export class WorkingMemory extends BaseMemory {
  private memories: Map<string, MemoryItem> = new Map();

  constructor(config: MemoryConfig) {
    super(config);
  }

  /**
   * 添加记忆
   */
  add(item: MemoryItem): string {
    // 检查容量
    if (this.memories.size >= this.config.workingMemoryCapacity) {
      this.evictOldest();
    }

    this.memories.set(item.id, item);
    return item.id;
  }

  /**
   * 检索记忆
   */
  retrieve(
    query: string,
    limit = 5,
    options: { minImportance?: number; userId?: string } = {}
  ): MemoryItem[] {
    const results: MemoryItem[] = [];
    const queryLower = query.toLowerCase();

    for (const memory of this.memories.values()) {
      // 过滤用户
      if (options.userId && memory.userId !== options.userId) {
        continue;
      }

      // 过滤重要性
      if (options.minImportance && memory.importance < options.minImportance) {
        continue;
      }

      // 检查过期
      if (this.isExpired(memory)) {
        continue;
      }

      // 简单的关键词匹配
      if (memory.content.toLowerCase().includes(queryLower)) {
        results.push(memory);
      }
    }

    // 按重要性排序
    results.sort((a, b) => b.importance - a.importance);

    return results.slice(0, limit);
  }

  /**
   * 更新记忆
   */
  update(
    memoryId: string,
    updates: { content?: string; importance?: number; metadata?: Record<string, unknown> }
  ): boolean {
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
    return true;
  }

  /**
   * 删除记忆
   */
  remove(memoryId: string): boolean {
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
  clear(): void {
    this.memories.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): MemoryStats {
    const memories = [...this.memories.values()];
    const activeMemories = memories.filter((m) => !this.isExpired(m));

    return {
      count: activeMemories.length,
      totalCount: memories.length,
      memoryType: 'working',
      oldestTimestamp: memories.length > 0
        ? new Date(Math.min(...memories.map((m) => m.timestamp.getTime())))
        : undefined,
      newestTimestamp: memories.length > 0
        ? new Date(Math.max(...memories.map((m) => m.timestamp.getTime())))
        : undefined,
      averageImportance: activeMemories.length > 0
        ? activeMemories.reduce((sum, m) => sum + m.importance, 0) / activeMemories.length
        : undefined,
    };
  }

  /**
   * 获取所有记忆
   */
  getAll(): MemoryItem[] {
    return [...this.memories.values()].filter((m) => !this.isExpired(m));
  }

  /**
   * 检查记忆是否过期
   */
  private isExpired(memory: MemoryItem): boolean {
    const ttlMs = this.config.workingMemoryTtlMinutes * 60 * 1000;
    const age = Date.now() - memory.timestamp.getTime();
    return age > ttlMs;
  }

  /**
   * 驱逐最旧的记忆
   */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, memory] of this.memories) {
      if (memory.timestamp.getTime() < oldestTime) {
        oldestTime = memory.timestamp.getTime();
        oldestId = id;
      }
    }

    if (oldestId) {
      this.memories.delete(oldestId);
    }
  }
}
