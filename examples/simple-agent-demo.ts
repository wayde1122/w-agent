/**
 * SimpleAgent 示例
 *
 * 演示如何使用 SimpleAgent 进行基础对话和工具调用
 */

import 'dotenv/config';
import { HelloAgentsLLM, SimpleAgent, CalculatorTool, SearchTool, ToolRegistry } from '../src/index.js';

async function main() {
  // 创建 LLM 客户端
  const llm = new HelloAgentsLLM({
    // 从环境变量自动读取配置
    // 也可以手动指定：
    // model: 'gpt-3.5-turbo',
    // apiKey: 'your-api-key',
    // baseURL: 'https://api.openai.com/v1',
  });

  console.log('=== 示例 1: 基础对话 ===\n');

  // 创建简单 Agent（不使用工具）
  const simpleAgent = new SimpleAgent({
    name: 'SimpleBot',
    llm,
    systemPrompt: '你是一个友好的AI助手，用中文回答问题。',
  });

  const response1 = await simpleAgent.run('你好！请介绍一下你自己。');
  console.log(`回答: ${response1}\n`);

  console.log('=== 示例 2: 带工具的对话 ===\n');

  // 创建工具注册表
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerTool(new CalculatorTool());
  toolRegistry.registerTool(new SearchTool());

  // 创建带工具的 Agent
  const toolAgent = new SimpleAgent({
    name: 'ToolBot',
    llm,
    systemPrompt: '你是一个智能助手，可以使用工具来帮助回答问题。',
    toolRegistry,
    enableToolCalling: true,
  });

  const response2 = await toolAgent.run('请帮我计算 (15 + 25) * 3 的结果');
  console.log(`回答: ${response2}\n`);

  console.log('=== 示例 3: 多轮对话 ===\n');

  // 多轮对话会自动维护历史记录
  const chatAgent = new SimpleAgent({
    name: 'ChatBot',
    llm,
    systemPrompt: '你是一个记忆力很好的助手，会记住用户告诉你的信息。',
  });

  await chatAgent.run('我叫小明，今年25岁。');
  const response3 = await chatAgent.run('你还记得我的名字和年龄吗？');
  console.log(`回答: ${response3}\n`);

  // 显示对话历史
  console.log('对话历史:');
  for (const msg of chatAgent.getHistory()) {
    console.log(`  [${msg.role}] ${msg.content.substring(0, 50)}...`);
  }
}

main().catch(console.error);
