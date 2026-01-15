/**
 * FunctionCallAgent - 使用 OpenAI 函数调用范式的 Agent
 */

import { Agent, AgentOptions } from '../core/agent.js';
import { Message } from '../core/message.js';
import { ChatMessage } from '../core/llm.js';
import { ToolRegistry } from '../tools/registry.js';
import { Tool, FunctionSchema, ToolParameters } from '../tools/base.js';
import OpenAI from 'openai';

/**
 * FunctionCallAgent 选项
 */
export interface FunctionCallAgentOptions extends AgentOptions {
  toolRegistry?: ToolRegistry;
  enableToolCalling?: boolean;
  defaultToolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  maxToolIterations?: number;
}

/**
 * FunctionCallAgent - 基于 OpenAI 原生函数调用机制的 Agent
 */
export class FunctionCallAgent extends Agent {
  private toolRegistry?: ToolRegistry;
  private enableToolCalling: boolean;
  private defaultToolChoice: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  private maxToolIterations: number;

  constructor(options: FunctionCallAgentOptions) {
    super(options);
    this.toolRegistry = options.toolRegistry;
    this.enableToolCalling = options.enableToolCalling !== false && !!options.toolRegistry;
    this.defaultToolChoice = options.defaultToolChoice ?? 'auto';
    this.maxToolIterations = options.maxToolIterations ?? 3;
  }

  /**
   * 构建系统提示词
   */
  private getSystemPrompt(): string {
    const basePrompt =
      this.systemPrompt ?? '你是一个可靠的AI助理，能够在需要时调用工具完成任务。';

    if (!this.enableToolCalling || !this.toolRegistry) {
      return basePrompt;
    }

    const toolsDescription = this.toolRegistry.getToolsDescription();
    if (!toolsDescription || toolsDescription === '暂无可用工具') {
      return basePrompt;
    }

    let prompt = basePrompt + '\n\n## 可用工具\n';
    prompt += '当你判断需要外部信息或执行动作时，可以直接通过函数调用使用以下工具：\n';
    prompt += toolsDescription + '\n';
    prompt += '\n请主动决定是否调用工具，合理利用多次调用来获得完备答案。';

    return prompt;
  }

  /**
   * 构建工具 Schema
   */
  private buildToolSchemas(): FunctionSchema[] {
    if (!this.enableToolCalling || !this.toolRegistry) {
      return [];
    }

    return this.toolRegistry.getAllToolSchemas();
  }

  /**
   * 解析函数调用参数
   */
  private parseFunctionCallArguments(args: string | undefined): ToolParameters {
    if (!args) {
      return {};
    }

    try {
      const parsed = JSON.parse(args);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * 转换参数类型
   */
  private convertParameterTypes(
    toolName: string,
    paramDict: ToolParameters
  ): ToolParameters {
    if (!this.toolRegistry) {
      return paramDict;
    }

    const tool = this.toolRegistry.getTool(toolName);
    if (!tool) {
      return paramDict;
    }

    let toolParams;
    try {
      toolParams = tool.getParameters();
    } catch {
      return paramDict;
    }

    const typeMapping = new Map(toolParams.map((p) => [p.name, p.type]));
    const converted: ToolParameters = {};

    for (const [key, value] of Object.entries(paramDict)) {
      const paramType = typeMapping.get(key);
      if (!paramType) {
        converted[key] = value;
        continue;
      }

      try {
        if (paramType === 'number' || paramType === 'integer') {
          converted[key] = Number(value);
        } else if (paramType === 'boolean') {
          if (typeof value === 'boolean') {
            converted[key] = value;
          } else if (typeof value === 'string') {
            converted[key] = value.toLowerCase() === 'true' || value === '1';
          } else {
            converted[key] = Boolean(value);
          }
        } else {
          converted[key] = value;
        }
      } catch {
        converted[key] = value;
      }
    }

    return converted;
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolName: string, args: ToolParameters): Promise<string> {
    if (!this.toolRegistry) {
      return '❌ 错误：未配置工具注册表';
    }

    const tool = this.toolRegistry.getTool(toolName);
    if (tool) {
      try {
        const typedArgs = this.convertParameterTypes(toolName, args);
        return await tool.run(typedArgs);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ 工具调用失败：${message}`;
      }
    }

    const func = this.toolRegistry.getFunction(toolName);
    if (func) {
      try {
        const input = (args.input as string) ?? '';
        return await func(input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `❌ 工具调用失败：${message}`;
      }
    }

    return `❌ 错误：未找到工具 '${toolName}'`;
  }

  /**
   * 运行 Agent
   */
  async run(
    input: string,
    options: {
      maxToolIterations?: number;
      toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
    } = {}
  ): Promise<string> {
    const messages: Array<OpenAI.ChatCompletionMessageParam> = [];
    const systemPrompt = this.getSystemPrompt();
    messages.push({ role: 'system', content: systemPrompt });

    // 添加历史消息
    for (const msg of this.history) {
      messages.push({ role: msg.role as 'user' | 'assistant', content: msg.content });
    }

    messages.push({ role: 'user', content: input });

    const toolSchemas = this.buildToolSchemas();
    if (toolSchemas.length === 0) {
      const response = await this.llm.invoke(messages as ChatMessage[]);
      this.addMessage(new Message(input, 'user'));
      this.addMessage(new Message(response, 'assistant'));
      return response;
    }

    const iterationsLimit = options.maxToolIterations ?? this.maxToolIterations;
    const effectiveToolChoice = options.toolChoice ?? this.defaultToolChoice;

    let currentIteration = 0;
    let finalResponse = '';

    const client = this.llm.getClient();

    while (currentIteration < iterationsLimit) {
      const response = await client.chat.completions.create({
        model: this.llm.model,
        messages,
        tools: toolSchemas as OpenAI.ChatCompletionTool[],
        tool_choice: effectiveToolChoice as OpenAI.ChatCompletionToolChoiceOption,
        temperature: this.llm.temperature,
        max_tokens: this.llm.maxTokens,
      });

      const choice = response.choices[0];
      const assistantMessage = choice.message;
      const content = assistantMessage.content ?? '';
      const toolCalls = assistantMessage.tool_calls ?? [];

      if (toolCalls.length > 0) {
        // 添加助手消息
        messages.push({
          role: 'assistant',
          content,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });

        // 执行工具调用并添加结果
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          const args = this.parseFunctionCallArguments(toolCall.function.arguments);
          const result = await this.executeToolCall(toolName, args);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }

        currentIteration++;
        continue;
      }

      // 没有工具调用
      finalResponse = content;
      break;
    }

    // 如果超过最大迭代次数
    if (currentIteration >= iterationsLimit && !finalResponse) {
      const response = await client.chat.completions.create({
        model: this.llm.model,
        messages,
        tools: toolSchemas as OpenAI.ChatCompletionTool[],
        tool_choice: 'none',
        temperature: this.llm.temperature,
        max_tokens: this.llm.maxTokens,
      });

      finalResponse = response.choices[0].message.content ?? '';
    }

    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(finalResponse, 'assistant'));
    return finalResponse;
  }

  /**
   * 添加工具
   */
  addTool(tool: Tool): void {
    if (!this.toolRegistry) {
      this.toolRegistry = new ToolRegistry();
      this.enableToolCalling = true;
    }

    if (tool.expandable) {
      const expandedTools = tool.getExpandedTools();
      if (expandedTools) {
        for (const expandedTool of expandedTools) {
          this.toolRegistry.registerTool(expandedTool);
        }
        this.logger.debug(`工具 '${tool.name}' 已展开为 ${expandedTools.length} 个独立工具`);
        return;
      }
    }

    this.toolRegistry.registerTool(tool);
  }

  /**
   * 移除工具
   */
  removeTool(toolName: string): boolean {
    if (this.toolRegistry) {
      const before = new Set(this.toolRegistry.listTools());
      this.toolRegistry.unregister(toolName);
      const after = new Set(this.toolRegistry.listTools());
      return before.has(toolName) && !after.has(toolName);
    }
    return false;
  }

  /**
   * 列出工具
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
}
