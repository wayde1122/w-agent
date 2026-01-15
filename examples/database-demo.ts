/**
 * 数据库集成示例 - Qdrant 向量数据库 + Neo4j 图数据库
 *
 * 运行前请确保：
 * 1. 配置 .env 文件中的数据库连接信息
 * 2. Qdrant 和 Neo4j 服务已启动（本地或云端）
 *
 * 运行命令：npx ts-node --esm examples/database-demo.ts
 */

import { config } from 'dotenv';

// 必须在导入其他模块前加载环境变量
const result = config();
if (result.error) {
  console.error('❌ 加载 .env 文件失败:', result.error.message);
}

// 调试：打印环境变量
console.log('🔧 环境变量检查:');
console.log(`   EMBED_MODEL_TYPE: ${process.env.EMBED_MODEL_TYPE ?? '未设置'}`);
console.log(`   EMBED_API_KEY: ${process.env.EMBED_API_KEY ? '已设置' : '未设置'}`);
console.log(`   QDRANT_URL: ${process.env.QDRANT_URL ?? '未设置'}`);
console.log(`   NEO4J_URI: ${process.env.NEO4J_URI ?? '未设置'}`);

import {
  QdrantVectorStore,
  Neo4jGraphStore,
  DashScopeEmbedding,
  refreshEmbedding,
} from '../src/index.js';

async function demoQdrant() {
  console.log('\n🔷 Qdrant 向量数据库示例\n');
  console.log('='.repeat(50));

  try {
    // 初始化 Embedding（刷新以确保使用新的环境变量）
    const embedder = refreshEmbedding();
    const vectorSize = embedder.dimension;
    console.log(`📐 Embedding 维度: ${vectorSize}`);

    // 初始化 Qdrant（使用 Embedding 的维度）
    const qdrant = new QdrantVectorStore({
      collectionName: 'demo_collection',
      vectorSize,
    });

    // 先清理旧集合（可能维度不匹配）
    console.log('\n🧹 清理旧集合...');
    await qdrant.clearCollection();

    // 示例文本
    const texts = [
      '人工智能是计算机科学的一个分支，致力于创建能够执行通常需要人类智能的任务的系统。',
      '机器学习是人工智能的一个子集，它使系统能够从数据中学习和改进。',
      '深度学习是机器学习的一种方法，使用多层神经网络来学习数据的复杂模式。',
      'TypeScript 是 JavaScript 的超集，添加了可选的静态类型和基于类的面向对象编程。',
      'Node.js 是一个基于 Chrome V8 引擎的 JavaScript 运行时环境。',
    ];

    // 生成向量
    console.log('\n📊 生成文本向量...');
    const vectors = await embedder.encode(texts);
    console.log(`✅ 生成了 ${vectors.length} 个向量，维度: ${vectors[0].length}`);

    // 添加向量到 Qdrant
    console.log('\n📥 添加向量到 Qdrant...');
    const metadata = texts.map((text, i) => ({
      text,
      category: i < 3 ? 'AI' : 'Programming',
      index: i,
    }));

    await qdrant.addVectors(vectors, metadata);

    // 搜索相似向量
    console.log('\n🔍 搜索相似内容...');
    const queryText = '什么是人工智能？';
    const queryVector = (await embedder.encode(queryText))[0];
    const results = await qdrant.searchSimilar(queryVector, 3);

    console.log(`\n查询: "${queryText}"`);
    console.log('\n搜索结果:');
    results.forEach((result, i) => {
      console.log(`\n${i + 1}. 相似度: ${result.score.toFixed(4)}`);
      console.log(`   内容: ${result.metadata.text}`);
      console.log(`   类别: ${result.metadata.category}`);
    });

    // 按类别过滤搜索
    console.log('\n🔍 按类别过滤搜索 (Programming)...');
    const filteredResults = await qdrant.searchSimilar(queryVector, 3, undefined, {
      category: 'Programming',
    });

    console.log('\n过滤后的搜索结果:');
    filteredResults.forEach((result, i) => {
      console.log(`\n${i + 1}. 相似度: ${result.score.toFixed(4)}`);
      console.log(`   内容: ${result.metadata.text}`);
    });

    // 获取集合信息
    console.log('\n📈 集合信息:');
    const info = await qdrant.getCollectionInfo();
    console.log(JSON.stringify(info, null, 2));

    // 清理
    console.log('\n🧹 清理示例数据...');
    await qdrant.clearCollection();
    console.log('✅ 清理完成');
  } catch (error) {
    console.error('❌ Qdrant 示例出错:', error);
    console.log('\n💡 提示: 请确保 Qdrant 服务已启动');
    console.log('   本地: docker run -p 6333:6333 qdrant/qdrant');
    console.log('   或配置云服务 URL 和 API Key');
  }
}

async function demoNeo4j() {
  console.log('\n🔷 Neo4j 图数据库示例\n');
  console.log('='.repeat(50));

  try {
    // 初始化 Neo4j
    const neo4j = new Neo4jGraphStore();

    // 添加实体
    console.log('\n📥 添加知识图谱实体...');

    // 添加概念实体
    await neo4j.addEntity('ai', '人工智能', 'Concept', {
      description: '让计算机模拟人类智能的技术',
    });
    await neo4j.addEntity('ml', '机器学习', 'Concept', {
      description: '从数据中学习的算法',
    });
    await neo4j.addEntity('dl', '深度学习', 'Concept', {
      description: '使用神经网络的机器学习',
    });
    await neo4j.addEntity('nlp', '自然语言处理', 'Concept', {
      description: '处理人类语言的技术',
    });
    await neo4j.addEntity('cv', '计算机视觉', 'Concept', {
      description: '让计算机理解图像的技术',
    });

    // 添加应用实体
    await neo4j.addEntity('chatbot', '聊天机器人', 'Application', {
      description: '对话式AI应用',
    });
    await neo4j.addEntity('image_recognition', '图像识别', 'Application', {
      description: '识别图像内容的应用',
    });

    // 添加关系
    console.log('\n🔗 添加实体关系...');
    await neo4j.addRelationship('ml', 'ai', 'SUBSET_OF');
    await neo4j.addRelationship('dl', 'ml', 'SUBSET_OF');
    await neo4j.addRelationship('nlp', 'ai', 'BRANCH_OF');
    await neo4j.addRelationship('cv', 'ai', 'BRANCH_OF');
    await neo4j.addRelationship('dl', 'nlp', 'ENABLES');
    await neo4j.addRelationship('dl', 'cv', 'ENABLES');
    await neo4j.addRelationship('nlp', 'chatbot', 'USED_IN');
    await neo4j.addRelationship('cv', 'image_recognition', 'USED_IN');

    // 查询相关实体
    console.log('\n🔍 查找与"深度学习"相关的实体...');
    const relatedEntities = await neo4j.findRelatedEntities('dl', {
      maxDepth: 2,
      limit: 10,
    });

    console.log('\n相关实体:');
    relatedEntities.forEach((entity) => {
      console.log(
        `- ${entity.name} (${entity.type}) - 距离: ${entity.distance}, 路径: ${entity.relationshipPath?.join(' -> ')}`
      );
    });

    // 按名称搜索
    console.log('\n🔍 搜索名称包含"学习"的实体...');
    const searchResults = await neo4j.searchEntitiesByName('学习');

    console.log('\n搜索结果:');
    searchResults.forEach((entity) => {
      console.log(`- ${entity.name} (${entity.type})`);
    });

    // 获取实体关系
    console.log('\n🔍 获取"人工智能"的所有关系...');
    const relationships = await neo4j.getEntityRelationships('ai');

    console.log('\n关系列表:');
    relationships.forEach((rel) => {
      const direction = rel.direction === 'outgoing' ? '->' : '<-';
      const otherEntity = rel.otherEntity as { name?: string };
      console.log(`- ${direction} ${rel.relationship.type}: ${otherEntity.name ?? 'unknown'}`);
    });

    // 获取统计信息
    console.log('\n📈 数据库统计:');
    const stats = await neo4j.getStats();
    console.log(JSON.stringify(stats, null, 2));

    // 清理
    console.log('\n🧹 清理示例数据...');
    await neo4j.clearAll();
    console.log('✅ 清理完成');

    // 关闭连接
    await neo4j.close();
  } catch (error) {
    console.error('❌ Neo4j 示例出错:', error);
    console.log('\n💡 提示: 请确保 Neo4j 服务已启动');
    console.log('   本地: docker run -p 7474:7474 -p 7687:7687 neo4j:5');
    console.log('   或配置云服务 URI 和认证信息');
  }
}

async function main() {
  console.log('🚀 数据库集成示例');
  console.log('='.repeat(50));
  console.log('\n此示例展示如何使用:');
  console.log('- Qdrant 向量数据库进行语义搜索');
  console.log('- Neo4j 图数据库构建知识图谱\n');

  // 运行 Qdrant 示例
  await demoQdrant();

  // 运行 Neo4j 示例
  await demoNeo4j();

  console.log('\n🎉 示例完成！');
}

// 执行
main().catch(console.error);
