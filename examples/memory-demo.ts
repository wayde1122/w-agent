/**
 * 记忆系统集成示例 - 展示如何使用 Qdrant 和 Neo4j
 *
 * 运行命令：npx ts-node --esm examples/memory-demo.ts
 */

import { config } from 'dotenv';

// 加载环境变量
config();

import {
  MemoryManager,
  SemanticMemory,
  EpisodicMemory,
  createMemoryConfig,
  createMemoryItem,
} from '../src/index.js';

async function demoSemanticMemory() {
  console.log('\n🧠 语义记忆示例 (Qdrant + Neo4j)');
  console.log('='.repeat(50));

  const config = createMemoryConfig();

  // 启用数据库存储
  const memory = new SemanticMemory(config, {
    enableVectorStore: true,
    enableGraphStore: true,
    vectorCollectionName: 'semantic_demo',
  });

  try {
    // 添加知识
    console.log('\n📥 添加语义知识...');
    await memory.add(
      createMemoryItem('人工智能是计算机科学的一个分支，致力于创建智能机器', 'semantic', 'demo_user')
    );
    await memory.add(
      createMemoryItem('机器学习是人工智能的子领域，使系统能够从数据中学习', 'semantic', 'demo_user')
    );
    await memory.add(
      createMemoryItem('深度学习使用神经网络来学习数据的复杂模式', 'semantic', 'demo_user')
    );

    // 添加实体和关系到知识图谱
    console.log('\n📊 构建知识图谱...');
    await memory.addEntity({
      entityId: 'ai',
      name: '人工智能',
      entityType: 'Concept',
      properties: { description: '让计算机模拟人类智能' },
    });
    await memory.addEntity({
      entityId: 'ml',
      name: '机器学习',
      entityType: 'Concept',
      properties: { description: '从数据中学习的算法' },
    });
    await memory.addEntity({
      entityId: 'dl',
      name: '深度学习',
      entityType: 'Concept',
      properties: { description: '使用神经网络的机器学习' },
    });

    await memory.addRelation({
      fromEntity: 'ml',
      toEntity: 'ai',
      relationType: 'SUBSET_OF',
    });
    await memory.addRelation({
      fromEntity: 'dl',
      toEntity: 'ml',
      relationType: 'SUBSET_OF',
    });

    // 语义搜索
    console.log('\n🔍 语义搜索...');
    const results = await memory.retrieve('什么是机器学习', 5, { useVectorSearch: true });
    console.log(`找到 ${results.length} 条相关记忆:`);
    for (const result of results) {
      const score = result.metadata.relevanceScore ?? 'N/A';
      console.log(`  - [${score}] ${result.content.substring(0, 50)}...`);
    }

    // 图谱查询
    console.log('\n🔗 查找相关实体...');
    const relatedEntities = await memory.findRelatedEntities('dl', { maxDepth: 2 });
    console.log('深度学习的相关实体:');
    for (const entity of relatedEntities) {
      console.log(`  - ${entity.name} (距离: ${entity.distance})`);
    }

    // 统计信息
    const stats = await memory.getStats();
    console.log('\n📈 统计信息:', JSON.stringify(stats, null, 2));

    // 清理
    console.log('\n🧹 清理示例数据...');
    await memory.clear();
    await memory.close();
  } catch (error) {
    console.error('❌ 语义记忆示例出错:', error);
  }
}

async function demoEpisodicMemory() {
  console.log('\n📝 情景记忆示例 (Qdrant)');
  console.log('='.repeat(50));

  const config = createMemoryConfig();

  // 启用向量存储
  const memory = new EpisodicMemory(config, {
    enableVectorStore: true,
    vectorCollectionName: 'episodic_demo',
  });

  try {
    // 添加事件记忆
    console.log('\n📥 添加情景记忆...');
    await memory.add(
      createMemoryItem('用户询问了关于 TypeScript 的问题', 'episodic', 'demo_user', {
        metadata: { sessionId: 'session_001', context: { topic: 'programming' } },
      })
    );
    await memory.add(
      createMemoryItem('成功解决了用户的代码问题', 'episodic', 'demo_user', {
        metadata: { sessionId: 'session_001', outcome: 'success' },
      })
    );
    await memory.add(
      createMemoryItem('用户讨论了机器学习项目', 'episodic', 'demo_user', {
        metadata: { sessionId: 'session_002', context: { topic: 'AI' } },
      })
    );

    // 搜索相关事件
    console.log('\n🔍 搜索相关事件...');
    const results = await memory.retrieve('TypeScript 问题', 5);
    console.log(`找到 ${results.length} 条相关事件:`);
    for (const result of results) {
      console.log(`  - ${result.content}`);
    }

    // 获取最近记忆
    console.log('\n⏰ 最近的记忆:');
    const recent = memory.getRecentMemories(5);
    for (const mem of recent) {
      console.log(`  - [${mem.timestamp.toISOString()}] ${mem.content}`);
    }

    // 统计信息
    const stats = await memory.getStats();
    console.log('\n📈 统计信息:', JSON.stringify(stats, null, 2));

    // 清理
    console.log('\n🧹 清理示例数据...');
    await memory.clear();
  } catch (error) {
    console.error('❌ 情景记忆示例出错:', error);
  }
}

async function demoMemoryManager() {
  console.log('\n🎯 记忆管理器示例');
  console.log('='.repeat(50));

  // 创建记忆管理器
  const manager = new MemoryManager({
    userId: 'demo_user',
    enableVectorStore: true,
    enableGraphStore: true,
  });

  try {
    // 添加不同类型的记忆（自动分类）
    console.log('\n📥 添加记忆（自动分类）...');
    await manager.addMemory('昨天我学习了 TypeScript 的新特性');
    await manager.addMemory('TypeScript 的定义是 JavaScript 的超集');
    await manager.addMemory('当前任务：完成记忆系统集成');

    // 跨类型检索
    console.log('\n🔍 跨类型检索...');
    const results = await manager.retrieveMemories('TypeScript', { limit: 10 });
    console.log(`找到 ${results.length} 条相关记忆:`);
    for (const result of results) {
      console.log(`  - [${result.memoryType}] ${result.content}`);
    }

    // 添加实体（通过管理器）
    console.log('\n📊 添加知识图谱实体...');
    await manager.addEntity({
      entityId: 'typescript',
      name: 'TypeScript',
      entityType: 'Technology',
      properties: { category: 'programming_language' },
    });

    // 获取统计
    const stats = await manager.getStats();
    console.log('\n📈 管理器统计:', JSON.stringify(stats, null, 2));

    // 清理
    console.log('\n🧹 清理所有记忆...');
    await manager.clearAllMemories();
    await manager.close();
  } catch (error) {
    console.error('❌ 记忆管理器示例出错:', error);
  }
}

async function main() {
  console.log('🚀 记忆系统集成示例');
  console.log('='.repeat(50));
  console.log('\n此示例展示如何使用:');
  console.log('- SemanticMemory: Qdrant 向量搜索 + Neo4j 知识图谱');
  console.log('- EpisodicMemory: Qdrant 向量搜索');
  console.log('- MemoryManager: 统一的记忆管理接口\n');

  // 检查环境变量
  console.log('🔧 环境变量检查:');
  console.log(`   EMBED_MODEL_TYPE: ${process.env.EMBED_MODEL_TYPE ?? '未设置'}`);
  console.log(`   QDRANT_URL: ${process.env.QDRANT_URL ? '已设置' : '未设置'}`);
  console.log(`   NEO4J_URI: ${process.env.NEO4J_URI ? '已设置' : '未设置'}`);

  // 运行示例
  await demoSemanticMemory();
  await demoEpisodicMemory();
  await demoMemoryManager();

  console.log('\n🎉 示例完成！');
}

// 执行
main().catch(console.error);
