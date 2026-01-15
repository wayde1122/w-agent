/**
 * ReActAgent 示例
 *
 * 演示 ReAct (Reasoning and Acting) 模式的 Agent
 */

import 'dotenv/config';
import { HelloAgentsLLM, ReActAgent, CalculatorTool, SearchTool } from '../src/index.js';

async function main() {
  // 创建 LLM 客户端
  const llm = new HelloAgentsLLM();

  console.log('=== ReAct Agent 示例 ===\n');

  // 创建 ReAct Agent
  const agent = new ReActAgent({
    name: 'ReActBot',
    llm,
    maxSteps: 5,
  });

  // 添加工具
  agent.addTool(new CalculatorTool());
  agent.addTool(new SearchTool());

  // 运行 Agent
  console.log('问题: 如果我有 100 元，买了 3 本书，每本 25 元，还剩多少钱？\n');

  const response = await agent.run('如果我有 100 元，买了 3 本书，每本 25 元，还剩多少钱？');

  console.log(`\n最终答案: ${response}`);
}

main().catch(console.error);
