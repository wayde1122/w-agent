/**
 * SimpleAgent - 简单对话 Agent，支持可选的工具调用
 */

import { Agent, AgentOptions } from '../core/agent.js';
import { Message } from '../core/message.js';
import { ChatMessage } from '../core/llm.js';
import { ToolRegistry } from '../tools/registry.js';
import { Tool, ToolParameters } from '../tools/base.js';

/**
 * SimpleAgent 选项
 */
export interface SimpleAgentOptions extends AgentOptions {
  toolRegistry?: ToolRegistry;
  enableToolCalling?: boolean;
}

/**
 * 工具调用解析结果
 */
interface ToolCall {
  toolName: string;
  parameters: string;
  original: string;
}

/**
 * SimpleAgent - 简单的对话 Agent
 *
 * 特点：
 * - 基础对话能力
 * - 可选的工具调用支持
 * - 消息历史管理
 */
export class SimpleAgent extends Agent {
  private toolRegistry?: ToolRegistry;
  private enableToolCalling: boolean;

  constructor(options: SimpleAgentOptions) {
    super(options);
    this.toolRegistry = options.toolRegistry;
    this.enableToolCalling = options.enableToolCalling !== false && !!options.toolRegistry;
  }

  /**
   * 构建增强的系统提示词
   */
  private getEnhancedSystemPrompt(): string {
    const basePrompt = this.systemPrompt ?? '你是一个有用的AI助手。';

    if (!this.enableToolCalling || !this.toolRegistry) {
      return basePrompt;
    }

    const toolsDescription = this.toolRegistry.getToolsDescription();
    if (!toolsDescription || toolsDescription === '暂无可用工具') {
      return basePrompt;
    }

    let toolsSection = '\n\n## 可用工具\n';
    toolsSection += '你可以使用以下工具来帮助回答问题：\n';
    toolsSection += toolsDescription + '\n';

    toolsSection += '\n## 工具调用格式\n';
    toolsSection += '当需要使用工具时，请使用以下格式：\n';
    toolsSection += '`[TOOL_CALL:{tool_name}:{parameters}]`\n\n';

    toolsSection += '### 参数格式说明\n';
    toolsSection += '1. **多个参数**：使用 `key=value` 格式，用逗号分隔\n';
    toolsSection += '   示例：`[TOOL_CALL:calculator_multiply:a=12,b=8]`\n\n';
    toolsSection += '2. **单个参数**：直接使用 `key=value`\n';
    toolsSection += '   示例：`[TOOL_CALL:search:query=Python编程]`\n\n';
    toolsSection += '3. **简单查询**：可以直接传入文本\n';
    toolsSection += '   示例：`[TOOL_CALL:search:Python编程]`\n\n';

    return basePrompt + toolsSection;
  }

  /**
   * 解析工具调用
   */
  private parseToolCalls(text: string): ToolCall[] {
    const pattern = /\[TOOL_CALL:([^:]+):([^\]]+)\]/g;
    const toolCalls: ToolCall[] = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      toolCalls.push({
        toolName: match[1].trim(),
        parameters: match[2].trim(),
        original: match[0],
      });
    }

    return toolCalls;
  }

  /**
   * 解析工具参数
   */
  private parseToolParameters(_toolName: string, parameters: string): ToolParameters {
    const paramDict: ToolParameters = {};

    // 尝试解析 JSON 格式
    if (parameters.trim().startsWith('{')) {
      try {
        return JSON.parse(parameters);
      } catch {
        // JSON 解析失败，继续使用其他方式
      }
    }

    if (parameters.includes('=')) {
      if (parameters.includes(',')) {
        // 多个参数：key=value,key2=value2
        const pairs = parameters.split(',');
        for (const pair of pairs) {
          if (pair.includes('=')) {
            const [key, value] = pair.split('=', 2);
            paramDict[key.trim()] = this.parseValue(value.trim());
          }
        }
      } else {
        // 单个参数：key=value
        const [key, value] = parameters.split('=', 2);
        paramDict[key.trim()] = this.parseValue(value.trim());
      }
    } else {
      // 简单参数
      paramDict.input = parameters;
    }

    return paramDict;
  }

  /**
   * 解析参数值
   */
  private parseValue(value: string): string | number | boolean {
    // 尝试解析为数字
    const num = parseFloat(value);
    if (!isNaN(num) && value === String(num)) {
      return num;
    }

    // 尝试解析为布尔值
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    return value;
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolName: string, parameters: string): Promise<string> {
    if (!this.toolRegistry) {
      return '❌ 错误：未配置工具注册表';
    }

    try {
      const tool = this.toolRegistry.getTool(toolName);
      if (!tool) {
        return `❌ 错误：未找到工具 '${toolName}'`;
      }

      const paramDict = this.parseToolParameters(toolName, parameters);
      const result = await tool.run(paramDict);
      return `🔧 工具 ${toolName} 执行结果：\n${result}`;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return `❌ 工具调用失败：${message}`;
    }
  }

  /**
   * 运行 Agent
   */
  async run(input: string, options: { maxToolIterations?: number } = {}): Promise<string> {
    const maxToolIterations = options.maxToolIterations ?? 3;

    // 构建消息列表
    const messages: ChatMessage[] = [];

    // 添加系统消息
    const enhancedSystemPrompt = this.getEnhancedSystemPrompt();
    messages.push({ role: 'system', content: enhancedSystemPrompt });

    // 添加历史消息
    for (const msg of this.history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    // 添加当前用户消息
    messages.push({ role: 'user', content: input });

    // 如果没有启用工具调用，直接返回
    if (!this.enableToolCalling) {
      const response = await this.llm.invoke(messages);
      this.addMessage(new Message(input, 'user'));
      this.addMessage(new Message(response, 'assistant'));
      return response;
    }

    // 迭代处理，支持多轮工具调用
    let currentIteration = 0;
    let finalResponse = '';

    while (currentIteration < maxToolIterations) {
      const response = await this.llm.invoke(messages);
      const toolCalls = this.parseToolCalls(response);

      if (toolCalls.length > 0) {
        // 执行所有工具调用
        const toolResults: string[] = [];
        let cleanResponse = response;

        for (const call of toolCalls) {
          const result = await this.executeToolCall(call.toolName, call.parameters);
          toolResults.push(result);
          cleanResponse = cleanResponse.replace(call.original, '');
        }

        // 添加工具结果到消息
        messages.push({ role: 'assistant', content: cleanResponse });
        messages.push({
          role: 'user',
          content: `工具执行结果：\n${toolResults.join('\n\n')}\n\n请基于这些结果给出完整的回答。`,
        });

        currentIteration++;
        continue;
      }

      // 没有工具调用，这是最终回答
      finalResponse = response;
      break;
    }

    // 如果超过最大迭代次数
    if (currentIteration >= maxToolIterations && !finalResponse) {
      finalResponse = await this.llm.invoke(messages);
    }

    // 保存到历史记录
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(finalResponse, 'assistant'));

    return finalResponse;
  }

  /**
   * 添加工具
   */
  addTool(tool: Tool, autoExpand = true): void {
    if (!this.toolRegistry) {
      this.toolRegistry = new ToolRegistry();
      this.enableToolCalling = true;
    }

    this.toolRegistry.registerTool(tool, autoExpand);
  }

  /**
   * 移除工具
   */
  removeTool(toolName: string): void {
    if (this.toolRegistry) {
      this.toolRegistry.unregister(toolName);
    }
  }

  /**
   * 列出所有工具
   */
  listTools(): string[] {
    if (this.toolRegistry) {
      return this.toolRegistry.listTools();
    }
    return [];
  }

  /**
   * 检查是否有工具
   */
  hasTools(): boolean {
    return this.enableToolCalling && !!this.toolRegistry;
  }

  /**
   * 流式运行 Agent
   */
  async *streamRun(input: string): AsyncGenerator<string, void, unknown> {
    // 构建消息列表
    const messages: ChatMessage[] = [];

    if (this.systemPrompt) {
      messages.push({ role: 'system', content: this.systemPrompt });
    }

    for (const msg of this.history) {
      messages.push({ role: msg.role, content: msg.content });
    }

    messages.push({ role: 'user', content: input });

    // 流式调用 LLM
    let fullResponse = '';
    for await (const chunk of this.llm.streamInvoke(messages)) {
      fullResponse += chunk;
      yield chunk;
    }

    // 保存到历史记录
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(fullResponse, 'assistant'));
  }
}
