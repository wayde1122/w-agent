/**
 * Memory 模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMemoryConfig,
  createMemoryItem,
  MemoryConfig,
} from '../src/memory/base.js';
import { WorkingMemory } from '../src/memory/types/working.js';
import { EpisodicMemory } from '../src/memory/types/episodic.js';
import { SemanticMemory } from '../src/memory/types/semantic.js';
import { MemoryManager } from '../src/memory/manager.js';

describe('Memory Config', () => {
  it('should create default config', () => {
    const config = createMemoryConfig();
    expect(config.maxCapacity).toBe(100);
    expect(config.importanceThreshold).toBe(0.1);
    expect(config.workingMemoryCapacity).toBe(10);
  });

  it('should create custom config', () => {
    const config = createMemoryConfig({
      maxCapacity: 50,
      workingMemoryCapacity: 5,
    });
    expect(config.maxCapacity).toBe(50);
    expect(config.workingMemoryCapacity).toBe(5);
  });
});

describe('Memory Item', () => {
  it('should create memory item', () => {
    const item = createMemoryItem('Test content', 'working', 'user1');
    expect(item.content).toBe('Test content');
    expect(item.memoryType).toBe('working');
    expect(item.userId).toBe('user1');
    expect(item.importance).toBe(0.5);
    expect(item.id).toBeDefined();
    expect(item.timestamp).toBeInstanceOf(Date);
  });

  it('should create memory item with custom options', () => {
    const item = createMemoryItem('Test', 'semantic', 'user2', {
      importance: 0.9,
      metadata: { source: 'test' },
    });
    expect(item.importance).toBe(0.9);
    expect(item.metadata).toEqual({ source: 'test' });
  });
});

describe('WorkingMemory', () => {
  let memory: WorkingMemory;
  let config: MemoryConfig;

  beforeEach(() => {
    config = createMemoryConfig({ workingMemoryCapacity: 5 });
    memory = new WorkingMemory(config);
  });

  it('should add and retrieve memory', () => {
    const item = createMemoryItem('Test content', 'working', 'user1');
    memory.add(item);

    const results = memory.retrieve('Test', 10);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Test content');
  });

  it('should respect capacity limit', () => {
    for (let i = 0; i < 10; i++) {
      memory.add(createMemoryItem(`Memory ${i}`, 'working', 'user1'));
    }

    const stats = memory.getStats();
    expect(stats.count).toBeLessThanOrEqual(5);
  });

  it('should update memory', () => {
    const item = createMemoryItem('Original', 'working', 'user1');
    memory.add(item);

    const updated = memory.update(item.id, { content: 'Updated' });
    expect(updated).toBe(true);

    const results = memory.retrieve('Updated', 10);
    expect(results[0].content).toBe('Updated');
  });

  it('should remove memory', () => {
    const item = createMemoryItem('To remove', 'working', 'user1');
    memory.add(item);

    const removed = memory.remove(item.id);
    expect(removed).toBe(true);
    expect(memory.hasMemory(item.id)).toBe(false);
  });

  it('should clear all memories', () => {
    memory.add(createMemoryItem('Test 1', 'working', 'user1'));
    memory.add(createMemoryItem('Test 2', 'working', 'user1'));

    memory.clear();
    expect(memory.getStats().count).toBe(0);
  });
});

describe('EpisodicMemory', () => {
  let memory: EpisodicMemory;

  beforeEach(() => {
    const config = createMemoryConfig();
    // 禁用向量存储以加快测试
    memory = new EpisodicMemory(config, { enableVectorStore: false });
  });

  it('should add and retrieve memories', async () => {
    await memory.add(createMemoryItem('First event', 'episodic', 'user1'));
    await memory.add(createMemoryItem('Second event', 'episodic', 'user1'));

    const results = await memory.retrieve('event', 10);
    expect(results).toHaveLength(2);
    // Both events should be retrieved
    const contents = results.map((r) => r.content);
    expect(contents).toContain('First event');
    expect(contents).toContain('Second event');
  });

  it('should forget low importance memories', async () => {
    await memory.add(createMemoryItem('Important', 'episodic', 'user1', { importance: 0.9 }));
    await memory.add(
      createMemoryItem('Not important', 'episodic', 'user1', { importance: 0.05 })
    );

    const forgotten = memory.forget('importance_based', 0.1);
    expect(forgotten).toBe(1);

    const results = memory.getAll();
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Important');
  });
});

describe('SemanticMemory', () => {
  let memory: SemanticMemory;

  beforeEach(() => {
    const config = createMemoryConfig();
    // 禁用数据库存储以加快测试
    memory = new SemanticMemory(config, {
      enableVectorStore: false,
      enableGraphStore: false,
    });
  });

  it('should index and retrieve by concepts', async () => {
    await memory.add(
      createMemoryItem('Python is a programming language', 'semantic', 'user1')
    );
    await memory.add(
      createMemoryItem('JavaScript is used for web development', 'semantic', 'user1')
    );

    const results = await memory.retrieve('Python programming', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Python');
  });

  it('should update and re-index', async () => {
    const item = createMemoryItem('Original concept', 'semantic', 'user1');
    await memory.add(item);

    memory.update(item.id, { content: 'Updated knowledge about AI technology' });

    // 使用更新后的关键词搜索
    const results = await memory.retrieve('Updated knowledge', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Updated');
  });
});

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    manager = new MemoryManager({
      userId: 'test_user',
      // 禁用数据库存储以加快测试
      enableVectorStore: false,
      enableGraphStore: false,
    });
  });

  it('should add memory with auto classification', async () => {
    // Should be classified as episodic
    await manager.addMemory('昨天我学习了新知识');

    // Should be classified as semantic
    await manager.addMemory('Python的定义是一种编程语言');

    const stats = await manager.getStats();
    expect(stats.totalMemories).toBe(2);
  });

  it('should retrieve memories across types', async () => {
    await manager.addMemory('Python 相关内容', { memoryType: 'working' });
    await manager.addMemory('Python 的历史', { memoryType: 'episodic' });
    await manager.addMemory('Python 是编程语言', { memoryType: 'semantic' });

    const results = await manager.retrieveMemories('Python', { limit: 10 });
    expect(results.length).toBe(3);
  });

  it('should consolidate memories', async () => {
    await manager.addMemory('Important task', {
      memoryType: 'working',
      importance: 0.8,
    });

    const consolidated = await manager.consolidateMemories('working', 'episodic', 0.7);
    expect(consolidated).toBe(1);

    const stats = await manager.getStats();
    expect((stats.memoriesByType.working as { count: number }).count).toBe(0);
    expect((stats.memoriesByType.episodic as { count: number }).count).toBe(1);
  });

  it('should clear all memories', async () => {
    await manager.addMemory('Test 1');
    await manager.addMemory('Test 2');
    await manager.addMemory('Test 3');

    await manager.clearAllMemories();

    const stats = await manager.getStats();
    expect(stats.totalMemories).toBe(0);
  });

  it('should get stats', async () => {
    await manager.addMemory('Test', { memoryType: 'working' });

    const stats = await manager.getStats();
    expect(stats.userId).toBe('test_user');
    expect(stats.enabledTypes).toContain('working');
    expect(stats.enabledTypes).toContain('episodic');
    expect(stats.enabledTypes).toContain('semantic');
  });
});
