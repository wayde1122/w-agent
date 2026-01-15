/**
 * PlanSolveAgent - 分解规划与逐步执行的智能体
 */

import { Agent, AgentOptions } from '../core/agent.js';
import { Message } from '../core/message.js';
import { HelloAgentsLLM, ChatMessage } from '../core/llm.js';

/**
 * 默认规划器提示词模板
 */
const DEFAULT_PLANNER_PROMPT = `
你是一个顶级的AI规划专家。你的任务是将用户提出的复杂问题分解成一个由多个简单步骤组成的行动计划。
请确保计划中的每个步骤都是一个独立的、可执行的子任务，并且严格按照逻辑顺序排列。
你的输出必须是一个JSON数组，其中每个元素都是一个描述子任务的字符串。

问题: {question}

请严格按照以下格式输出你的计划:
\`\`\`json
["步骤1", "步骤2", "步骤3"]
\`\`\`
`;

/**
 * 默认执行器提示词模板
 */
const DEFAULT_EXECUTOR_PROMPT = `
你是一位顶级的AI执行专家。你的任务是严格按照给定的计划，一步步地解决问题。
你将收到原始问题、完整的计划、以及到目前为止已经完成的步骤和结果。
请你专注于解决"当前步骤"，并仅输出该步骤的最终答案，不要输出任何额外的解释或对话。

# 原始问题:
{question}

# 完整计划:
{plan}

# 历史步骤与结果:
{history}

# 当前步骤:
{current_step}

请仅输出针对"当前步骤"的回答:
`;

/**
 * 规划器类
 */
class Planner {
  private llmClient: HelloAgentsLLM;
  private promptTemplate: string;

  constructor(llmClient: HelloAgentsLLM, promptTemplate?: string) {
    this.llmClient = llmClient;
    this.promptTemplate = promptTemplate ?? DEFAULT_PLANNER_PROMPT;
  }

  /**
   * 生成执行计划
   */
  async plan(question: string): Promise<string[]> {
    const prompt = this.promptTemplate.replace('{question}', question);
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

    console.log('--- 正在生成计划 ---');
    const responseText = await this.llmClient.invoke(messages);
    console.log(`✅ 计划已生成:\n${responseText}`);

    try {
      // 提取 JSON 数组
      const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[1]);
        return Array.isArray(plan) ? plan : [];
      }

      // 尝试直接解析为 JSON
      const plan = JSON.parse(responseText);
      return Array.isArray(plan) ? plan : [];
    } catch (error) {
      console.error(`❌ 解析计划时出错: ${error}`);
      console.log(`原始响应: ${responseText}`);
      return [];
    }
  }
}

/**
 * 执行器类
 */
class Executor {
  private llmClient: HelloAgentsLLM;
  private promptTemplate: string;

  constructor(llmClient: HelloAgentsLLM, promptTemplate?: string) {
    this.llmClient = llmClient;
    this.promptTemplate = promptTemplate ?? DEFAULT_EXECUTOR_PROMPT;
  }

  /**
   * 按计划执行任务
   */
  async execute(question: string, plan: string[]): Promise<string> {
    let history = '';
    let finalAnswer = '';

    console.log('\n--- 正在执行计划 ---');

    for (let i = 0; i < plan.length; i++) {
      const step = plan[i];
      console.log(`\n-> 正在执行步骤 ${i + 1}/${plan.length}: ${step}`);

      const prompt = this.promptTemplate
        .replace('{question}', question)
        .replace('{plan}', JSON.stringify(plan, null, 2))
        .replace('{history}', history || '无')
        .replace('{current_step}', step);

      const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
      const responseText = await this.llmClient.invoke(messages);

      history += `步骤 ${i + 1}: ${step}\n结果: ${responseText}\n\n`;
      finalAnswer = responseText;

      console.log(`✅ 步骤 ${i + 1} 已完成，结果: ${finalAnswer}`);
    }

    return finalAnswer;
  }
}

/**
 * PlanSolveAgent 选项
 */
export interface PlanSolveAgentOptions extends AgentOptions {
  customPrompts?: {
    planner?: string;
    executor?: string;
  };
}

/**
 * PlanSolveAgent - 分解规划与逐步执行的智能体
 *
 * 这个 Agent 能够：
 * 1. 将复杂问题分解为简单步骤
 * 2. 按照计划逐步执行
 * 3. 维护执行历史和上下文
 * 4. 得出最终答案
 *
 * 特别适合多步骤推理、数学问题、复杂分析等任务。
 */
export class PlanSolveAgent extends Agent {
  private planner: Planner;
  private executor: Executor;

  constructor(options: PlanSolveAgentOptions) {
    super(options);

    const plannerPrompt = options.customPrompts?.planner;
    const executorPrompt = options.customPrompts?.executor;

    this.planner = new Planner(this.llm, plannerPrompt);
    this.executor = new Executor(this.llm, executorPrompt);
  }

  /**
   * 运行 Agent
   */
  async run(input: string): Promise<string> {
    console.log(`\n🤖 ${this.name} 开始处理问题: ${input}`);

    // 1. 生成计划
    const plan = await this.planner.plan(input);
    if (plan.length === 0) {
      const finalAnswer = '无法生成有效的行动计划，任务终止。';
      console.log(`\n--- 任务终止 ---\n${finalAnswer}`);

      // 保存到历史记录
      this.addMessage(new Message(input, 'user'));
      this.addMessage(new Message(finalAnswer, 'assistant'));

      return finalAnswer;
    }

    // 2. 执行计划
    const finalAnswer = await this.executor.execute(input, plan);
    console.log(`\n--- 任务完成 ---\n最终答案: ${finalAnswer}`);

    // 保存到历史记录
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(finalAnswer, 'assistant'));

    return finalAnswer;
  }
}
