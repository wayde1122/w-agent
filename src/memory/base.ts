/**
 * 记忆系统基础类和配置
 */

import { z } from 'zod';
import { randomUUID } from 'crypto';

/**
 * 记忆项 Schema
 */
export const MemoryItemSchema = z.object({
  id: z.string(),
  content: z.string(),
  memoryType: z.string(),
  userId: z.string(),
  timestamp: z.date(),
  importance: z.number().min(0).max(1).default(0.5),
  metadata: z.record(z.unknown()).default({}),
});

export type MemoryItem = z.infer<typeof MemoryItemSchema>;

/**
 * 记忆配置 Schema
 */
export const MemoryConfigSchema = z.object({
  // 存储路径
  storagePath: z.string().default('./memory_data'),

  // 基础配置
  maxCapacity: z.number().default(100),
  importanceThreshold: z.number().default(0.1),
  decayFactor: z.number().default(0.95),

  // 工作记忆配置
  workingMemoryCapacity: z.number().default(10),
  workingMemoryTokens: z.number().default(2000),
  workingMemoryTtlMinutes: z.number().default(120),

  // 感知记忆配置
  perceptualMemoryModalities: z.array(z.string()).default(['text', 'image', 'audio', 'video']),
});

export type MemoryConfig = z.infer<typeof MemoryConfigSchema>;

/**
 * 创建默认记忆配置
 */
export function createMemoryConfig(options: Partial<MemoryConfig> = {}): MemoryConfig {
  return MemoryConfigSchema.parse(options);
}

/**
 * 创建记忆项
 */
export function createMemoryItem(
  content: string,
  memoryType: string,
  userId: string,
  options: Partial<MemoryItem> = {}
): MemoryItem {
  return MemoryItemSchema.parse({
    id: options.id ?? randomUUID(),
    content,
    memoryType,
    userId,
    timestamp: options.timestamp ?? new Date(),
    importance: options.importance ?? 0.5,
    metadata: options.metadata ?? {},
  });
}

/**
 * 记忆统计信息
 */
export interface MemoryStats {
  count: number;
  totalCount?: number;
  memoryType: string;
  oldestTimestamp?: Date;
  newestTimestamp?: Date;
  averageImportance?: number;
}

/**
 * 记忆基类
 *
 * 支持同步和异步操作，子类可以根据需要实现
 */
export abstract class BaseMemory {
  readonly config: MemoryConfig;
  readonly memoryType: string;

  constructor(config: MemoryConfig) {
    this.config = config;
    this.memoryType = this.constructor.name.toLowerCase().replace('memory', '');
  }

  /**
   * 添加记忆项（支持同步或异步）
   */
  abstract add(item: MemoryItem): string | Promise<string>;

  /**
   * 检索相关记忆（支持同步或异步）
   */
  abstract retrieve(
    query: string,
    limit?: number,
    options?: { minImportance?: number; userId?: string; [key: string]: unknown }
  ): MemoryItem[] | Promise<MemoryItem[]>;

  /**
   * 更新记忆（支持同步或异步）
   */
  abstract update(
    memoryId: string,
    updates: { content?: string; importance?: number; metadata?: Record<string, unknown> }
  ): boolean | Promise<boolean>;

  /**
   * 删除记忆（支持同步或异步）
   */
  abstract remove(memoryId: string): boolean | Promise<boolean>;

  /**
   * 检查记忆是否存在
   */
  abstract hasMemory(memoryId: string): boolean;

  /**
   * 清空所有记忆（支持同步或异步）
   */
  abstract clear(): void | Promise<void>;

  /**
   * 获取统计信息（支持同步或异步）
   */
  abstract getStats(): MemoryStats | Promise<MemoryStats>;

  /**
   * 获取所有记忆
   */
  abstract getAll(): MemoryItem[];

  /**
   * 生成记忆 ID
   */
  protected generateId(): string {
    return randomUUID();
  }

  /**
   * 计算记忆重要性
   */
  protected calculateImportance(content: string, baseImportance = 0.5): number {
    let importance = baseImportance;

    // 基于内容长度
    if (content.length > 100) {
      importance += 0.1;
    }

    // 基于关键词
    const importantKeywords = ['重要', '关键', '必须', '注意', '警告', '错误'];
    if (importantKeywords.some((keyword) => content.includes(keyword))) {
      importance += 0.2;
    }

    return Math.max(0, Math.min(1, importance));
  }

  toString(): string {
    return `${this.constructor.name}()`;
  }
}
