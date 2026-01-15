/**
 * MemoryAgent 示例 - 具有记忆和 RAG 功能的对话 Agent
 *
 * 运行命令：npx tsx examples/memory-agent-demo.ts
 */

import 'dotenv/config';
import {
  HelloAgentsLLM,
  MemoryAgent,
  CalculatorTool,
  SearchTool,
  ToolRegistry,
} from '../src/index.js';

async function main() {
  console.log('🚀 MemoryAgent 示例 - 具有记忆和 RAG 功能的智能对话\n');
  console.log('='.repeat(60));

  // 创建 LLM 客户端
  const llm = new HelloAgentsLLM();

  // 创建工具注册表
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerTool(new CalculatorTool());
  toolRegistry.registerTool(new SearchTool());

  // 创建 MemoryAgent
  const agent = new MemoryAgent({
    name: 'MemoryBot',
    llm,
    systemPrompt: `你是一个具有记忆能力的智能助手。
你可以：
1. 记住用户告诉你的信息
2. 从记忆中检索相关知识来回答问题
3. 使用工具帮助完成任务

请尽量利用记忆中的信息来提供更个性化的回答。`,
    userId: 'demo_user',
    toolRegistry,
    enableToolCalling: true,
    enableRAG: true,
    enableKnowledgeGraph: true,
    ragTopK: 5,
    autoSaveConversation: true,
  });

  try {
    // === 示例 1: 添加知识 ===
    console.log('\n📚 示例 1: 添加知识到记忆\n');
    console.log('-'.repeat(40));

    await agent.addKnowledge(
      'TypeScript 是 JavaScript 的超集，添加了静态类型系统和其他特性。',
      { category: 'programming' }
    );
    await agent.addKnowledge(
      'Node.js 是一个基于 Chrome V8 引擎的 JavaScript 运行时。',
      { category: 'programming' }
    );
    await agent.addKnowledge(
      '向量数据库（如 Qdrant）用于存储和检索高维向量，适合语义搜索。',
      { category: 'database' }
    );
    await agent.addKnowledge(
      '图数据库（如 Neo4j）用于存储和查询实体之间的关系。',
      { category: 'database' }
    );

    console.log('✅ 已添加 4 条知识到记忆');

    // === 示例 2: 添加知识图谱 ===
    console.log('\n🔗 示例 2: 构建知识图谱\n');
    console.log('-'.repeat(40));

    await agent.addEntity('ts', 'TypeScript', 'Language', {
      description: '静态类型的 JavaScript 超集',
    });
    await agent.addEntity('js', 'JavaScript', 'Language', {
      description: '动态类型的脚本语言',
    });
    await agent.addEntity('nodejs', 'Node.js', 'Runtime', {
      description: 'JavaScript 运行时环境',
    });

    await agent.addRelation('ts', 'js', 'SUPERSET_OF');
    await agent.addRelation('nodejs', 'js', 'RUNS');

    console.log('✅ 已添加 3 个实体和 2 个关系');

    // === 示例 3: 对话并利用记忆 ===
    console.log('\n💬 示例 3: 对话（利用 RAG 检索）\n');
    console.log('-'.repeat(40));

    const questions = [
      '什么是 TypeScript？它和 JavaScript 有什么关系？',
      '向量数据库有什么用途？',
      '帮我计算 (15 + 25) * 2',
    ];

    for (const question of questions) {
      console.log(`\n👤 用户: ${question}`);
      const response = await agent.run(question);
      console.log(`\n🤖 助手: ${response}`);
      console.log('-'.repeat(40));
    }

    // === 示例 4: 记忆持久化 ===
    console.log('\n📊 示例 4: 查看记忆统计\n');
    console.log('-'.repeat(40));

    const stats = await agent.getMemoryStats();
    console.log('记忆统计:', JSON.stringify(stats, null, 2));

    // === 示例 5: 搜索记忆 ===
    console.log('\n🔍 示例 5: 搜索记忆\n');
    console.log('-'.repeat(40));

    const searchResults = await agent.searchMemories('数据库', { limit: 3 });
    console.log(`找到 ${searchResults.length} 条相关记忆:`);
    for (const result of searchResults) {
      console.log(`  - [${result.memoryType}] ${result.content.substring(0, 60)}...`);
    }

    // === 示例 6: 多轮对话记忆 ===
    console.log('\n💭 示例 6: 多轮对话（测试对话记忆）\n');
    console.log('-'.repeat(40));

    console.log('\n👤 用户: 我叫小明，今年学习编程');
    await agent.run('我叫小明，今年学习编程');

    console.log('\n👤 用户: 我对 TypeScript 特别感兴趣');
    await agent.run('我对 TypeScript 特别感兴趣');

    console.log('\n👤 用户: 你还记得我的名字和兴趣吗？');
    const response = await agent.run('你还记得我的名字和兴趣吗？');
    console.log(`\n🤖 助手: ${response}`);

    // 清理
    console.log('\n🧹 清理资源...');
    // await agent.clearMemories(); // 取消注释以清空记忆
    await agent.close();

    console.log('\n🎉 示例完成！');
  } catch (error) {
    console.error('❌ 错误:', error);
    await agent.close();
  }
}

// 交互式对话模式
async function interactiveMode() {
  console.log('🚀 MemoryAgent 交互模式\n');
  console.log('输入 "exit" 退出，"stats" 查看统计，"clear" 清空记忆\n');

  const llm = new HelloAgentsLLM();
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerTool(new CalculatorTool());
  toolRegistry.registerTool(new SearchTool());

  const agent = new MemoryAgent({
    name: 'MemoryBot',
    llm,
    systemPrompt: '你是一个有记忆能力的智能助手，请记住用户告诉你的信息。',
    userId: 'interactive_user',
    toolRegistry,
    enableToolCalling: true,
    enableRAG: true,
    enableKnowledgeGraph: true,
  });

  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const askQuestion = () => {
    rl.question('\n👤 你: ', async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === 'exit') {
        await agent.close();
        rl.close();
        console.log('\n👋 再见！');
        return;
      }

      if (trimmed.toLowerCase() === 'stats') {
        const stats = await agent.getMemoryStats();
        console.log('\n📊 记忆统计:', JSON.stringify(stats, null, 2));
        askQuestion();
        return;
      }

      if (trimmed.toLowerCase() === 'clear') {
        await agent.clearMemories();
        console.log('\n🧹 记忆已清空');
        askQuestion();
        return;
      }

      try {
        const response = await agent.run(trimmed);
        console.log(`\n🤖 助手: ${response}`);
      } catch (e) {
        console.error('❌ 错误:', e);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// 检查命令行参数
const args = process.argv.slice(2);
if (args.includes('--interactive') || args.includes('-i')) {
  interactiveMode();
} else {
  main().catch(console.error);
}
