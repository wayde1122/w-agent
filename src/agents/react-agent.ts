/**
 * ReActAgent - 推理与行动结合的智能体
 */

import { Agent, AgentOptions } from '../core/agent.js';
import { Message } from '../core/message.js';
import { ChatMessage } from '../core/llm.js';
import { ToolRegistry } from '../tools/registry.js';
import { Tool } from '../tools/base.js';

/**
 * 默认 ReAct 提示词模板
 */
const DEFAULT_REACT_PROMPT = `你是一个具备推理和行动能力的AI助手。你可以通过思考分析问题，然后调用合适的工具来获取信息，最终给出准确的答案。

## 可用工具
{tools}

## 工作流程
请严格按照以下格式进行回应，每次只能执行一个步骤：

Thought: 分析问题，确定需要什么信息，制定研究策略。
Action: 选择合适的工具获取信息，格式为：
- \`{tool_name}[{tool_input}]\`：调用工具获取信息。
- \`Finish[研究结论]\`：当你有足够信息得出结论时。

## 重要提醒
1. 每次回应必须包含Thought和Action两部分
2. 工具调用的格式必须严格遵循：工具名[参数]
3. 只有当你确信有足够信息回答问题时，才使用Finish
4. 如果工具返回的信息不够，继续使用其他工具或相同工具的不同参数

## 当前任务
**Question:** {question}

## 执行历史
{history}

现在开始你的推理和行动：`;

/**
 * ReActAgent 选项
 */
export interface ReActAgentOptions extends AgentOptions {
  toolRegistry?: ToolRegistry;
  maxSteps?: number;
  customPrompt?: string;
}

/**
 * ReActAgent - ReAct (Reasoning and Acting) Agent
 *
 * 结合推理和行动的智能体，能够：
 * 1. 分析问题并制定行动计划
 * 2. 调用外部工具获取信息
 * 3. 基于观察结果进行推理
 * 4. 迭代执行直到得出最终答案
 */
export class ReActAgent extends Agent {
  private toolRegistry: ToolRegistry;
  private maxSteps: number;
  private promptTemplate: string;
  private currentHistory: string[] = [];

  constructor(options: ReActAgentOptions) {
    super(options);
    this.toolRegistry = options.toolRegistry ?? new ToolRegistry();
    this.maxSteps = options.maxSteps ?? 5;
    this.promptTemplate = options.customPrompt ?? DEFAULT_REACT_PROMPT;
  }

  /**
   * 添加工具
   */
  addTool(tool: Tool): void {
    this.toolRegistry.registerTool(tool);
  }

  /**
   * 运行 Agent
   */
  async run(input: string): Promise<string> {
    this.currentHistory = [];
    let currentStep = 0;

    this.logger.info(`${this.name} 开始处理问题: ${input}`);

    while (currentStep < this.maxSteps) {
      currentStep++;
      this.logger.debug(`第 ${currentStep} 步`);

      // 构建提示词
      const toolsDesc = this.toolRegistry.getToolsDescription();
      const historyStr = this.currentHistory.join('\n');
      const prompt = this.promptTemplate
        .replace('{tools}', toolsDesc)
        .replace('{question}', input)
        .replace('{history}', historyStr);

      // 调用 LLM
      const messages: ChatMessage[] = [{ role: 'user', content: prompt }];
      const responseText = await this.llm.invoke(messages);

      if (!responseText) {
        this.logger.error('LLM未能返回有效响应');
        break;
      }

      // 解析输出
      const { thought, action } = this.parseOutput(responseText);

      if (thought) {
        this.logger.debug(`思考: ${thought}`);
      }

      if (!action) {
        this.logger.warn('未能解析出有效的Action，流程终止');
        break;
      }

      // 检查是否完成
      if (action.startsWith('Finish')) {
        const finalAnswer = this.parseActionInput(action);
        this.logger.info(`最终答案: ${finalAnswer}`);

        // 保存到历史记录
        this.addMessage(new Message(input, 'user'));
        this.addMessage(new Message(finalAnswer, 'assistant'));

        return finalAnswer;
      }

      // 执行工具调用
      const { toolName, toolInput } = this.parseAction(action);
      if (!toolName || toolInput === null) {
        this.currentHistory.push('Observation: 无效的Action格式，请检查。');
        continue;
      }

      this.logger.debug(`行动: ${toolName}[${toolInput}]`);

      // 调用工具
      const observation = await this.toolRegistry.executeTool(toolName, toolInput);
      this.logger.debug(`观察: ${observation}`);

      // 更新历史
      this.currentHistory.push(`Action: ${action}`);
      this.currentHistory.push(`Observation: ${observation}`);
    }

    this.logger.warn('已达到最大步数，流程终止');
    const finalAnswer = '抱歉，我无法在限定步数内完成这个任务。';

    // 保存到历史记录
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(finalAnswer, 'assistant'));

    return finalAnswer;
  }

  /**
   * 解析 LLM 输出
   */
  private parseOutput(text: string): { thought: string | null; action: string | null } {
    const thoughtMatch = text.match(/Thought:\s*(.*)/);
    const actionMatch = text.match(/Action:\s*(.*)/);

    return {
      thought: thoughtMatch ? thoughtMatch[1].trim() : null,
      action: actionMatch ? actionMatch[1].trim() : null,
    };
  }

  /**
   * 解析行动文本
   */
  private parseAction(actionText: string): { toolName: string | null; toolInput: string | null } {
    const match = actionText.match(/(\w+)\[(.*)\]/);
    if (match) {
      return {
        toolName: match[1],
        toolInput: match[2],
      };
    }
    return { toolName: null, toolInput: null };
  }

  /**
   * 解析行动输入
   */
  private parseActionInput(actionText: string): string {
    const match = actionText.match(/\w+\[(.*)\]/);
    return match ? match[1] : '';
  }
}
