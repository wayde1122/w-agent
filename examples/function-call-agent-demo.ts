/**
 * FunctionCallAgent 示例
 *
 * 演示使用 OpenAI 原生函数调用的 Agent
 */

import 'dotenv/config';
import {
  HelloAgentsLLM,
  FunctionCallAgent,
  CalculatorTool,
  SearchTool,
  ToolRegistry,
} from '../src/index.js';

async function main() {
  // 创建 LLM 客户端
  const llm = new HelloAgentsLLM();

  console.log('=== Function Call Agent 示例 ===\n');

  // 创建工具注册表
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerTool(new CalculatorTool());
  toolRegistry.registerTool(new SearchTool());

  // 创建 Agent
  const agent = new FunctionCallAgent({
    name: 'FunctionBot',
    llm,
    toolRegistry,
    enableToolCalling: true,
    maxToolIterations: 3,
  });

  // 示例 1: 数学计算
  console.log('--- 示例 1: 数学计算 ---\n');
  const response1 = await agent.run('请计算 sqrt(144) + 2^3 的结果');
  console.log(`回答: ${response1}\n`);

  // 示例 2: 信息搜索
  console.log('--- 示例 2: 信息搜索 ---\n');
  const response2 = await agent.run('请搜索一下 Python 编程语言的相关信息');
  console.log(`回答: ${response2}\n`);

  // 示例 3: 组合使用
  console.log('--- 示例 3: 组合任务 ---\n');
  const response3 = await agent.run(
    '请先搜索一下 AI 相关信息，然后帮我计算 100 * 1.5 的结果'
  );
  console.log(`回答: ${response3}\n`);
}

main().catch(console.error);
