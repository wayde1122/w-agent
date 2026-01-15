/**
 * PlanSolveAgent 示例
 *
 * 演示 Plan and Solve 模式的 Agent，适合复杂多步骤任务
 */

import 'dotenv/config';
import { HelloAgentsLLM, PlanSolveAgent } from '../src/index.js';

async function main() {
  // 创建 LLM 客户端
  const llm = new HelloAgentsLLM();

  console.log('=== Plan and Solve Agent 示例 ===\n');

  // 创建 Agent
  const agent = new PlanSolveAgent({
    name: 'PlanBot',
    llm,
  });

  // 复杂数学问题
  const question = `
    小明有 500 元。他先花了 20% 买书，
    然后用剩余的钱的一半买了文具，
    最后又花了 50 元吃饭。
    请问小明还剩多少钱？
  `;

  console.log(`问题: ${question}\n`);

  const response = await agent.run(question);

  console.log(`\n最终答案: ${response}`);
}

main().catch(console.error);
