/**
 * UnifiedAgent - 基于 ToolExecutor 的统一 Agent 实现
 *
 * 推荐的 Agent 入口，特点：
 * - 支持 OpenAI 原生 tool calling（优先）和文本协议（fallback）
 * - 多轮工具调用循环
 * - 可观测的执行追踪
 * - 统一的 Logger 注入
 */

import { Agent, AgentOptions } from '../core/agent.js';
import { Message } from '../core/message.js';
import { ChatMessage } from '../core/llm.js';
import { ToolRegistry, ToolRegistryOptions } from '../tools/registry.js';
import { Tool, FunctionSchema } from '../tools/base.js';
import { ToolExecutor, createToolExecutor } from '../tools/executor.js';
import {
  runToolCallingLoop,
  LoopResult,
  ToolCallingStep,
} from '../core/tool-calling-loop.js';

/**
 * UnifiedAgent 选项
 */
export interface UnifiedAgentOptions extends AgentOptions {
  /** 工具注册表（可选，不传则自动创建） */
  toolRegistry?: ToolRegistry;
  /** 启用工具调用 */
  enableToolCalling?: boolean;
  /** 使用原生 tool calling（需 LLM 支持，默认 true） */
  useNativeToolCalling?: boolean;
  /** 最大工具调用步数 */
  maxToolSteps?: number;
  /** 是否保留执行追踪（默认 false） */
  keepTrace?: boolean;
}

/**
 * 运行结果（含追踪信息）
 */
export interface UnifiedAgentResult {
  /** 最终文本输出 */
  text: string;
  /** 执行追踪（如果 keepTrace=true） */
  trace?: ToolCallingStep[];
  /** 使用的工具调用步数 */
  toolStepsUsed: number;
  /** 是否达到最大步数 */
  reachedMaxSteps: boolean;
}

/**
 * UnifiedAgent - 推荐的统一 Agent 实现
 */
export class UnifiedAgent extends Agent {
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private enableToolCalling: boolean;
  private useNativeToolCalling: boolean;
  private maxToolSteps: number;
  private keepTrace: boolean;

  /** 最近一次运行的追踪（如果 keepTrace=true） */
  private lastTrace?: ToolCallingStep[];

  constructor(options: UnifiedAgentOptions) {
    super(options);

    // 初始化工具注册表
    const registryOptions: ToolRegistryOptions = { logger: this.logger };
    this.toolRegistry = options.toolRegistry ?? new ToolRegistry(registryOptions);

    // 初始化工具执行器
    this.toolExecutor = createToolExecutor({
      registry: this.toolRegistry,
      logger: this.logger,
    });

    this.enableToolCalling = options.enableToolCalling ?? true;
    this.useNativeToolCalling = options.useNativeToolCalling ?? true;
    this.maxToolSteps = options.maxToolSteps ?? 5;
    this.keepTrace = options.keepTrace ?? false;

    this.logger.info(`UnifiedAgent 初始化完成: ${this.name}`);
    this.logger.debug(`工具调用: ${this.enableToolCalling}, 原生模式: ${this.useNativeToolCalling}`);
  }

  /**
   * 添加工具
   */
  addTool(tool: Tool): void {
    this.toolRegistry.registerTool(tool);
  }

  /**
   * 移除工具
   */
  removeTool(toolName: string): void {
    this.toolRegistry.unregister(toolName);
  }

  /**
   * 列出所有工具
   */
  listTools(): string[] {
    return this.toolRegistry.listTools();
  }

  /**
   * 检查是否有工具
   */
  hasTools(): boolean {
    return this.toolRegistry.size > 0;
  }

  /**
   * 运行 Agent
   */
  async run(input: string): Promise<string> {
    const result = await this.runWithResult(input);
    return result.text;
  }

  /**
   * 运行 Agent（返回详细结果）
   */
  async runWithResult(input: string): Promise<UnifiedAgentResult> {
    this.logger.debug(`处理输入: ${input.substring(0, 100)}...`);

    // 构建消息
    const messages = this.buildMessages(input);

    // 获取工具 schema
    const toolSchemas = this.getToolSchemas();

    let result: LoopResult;

    if (this.enableToolCalling && toolSchemas.length > 0) {
      // 使用工具调用循环
      result = await runToolCallingLoop(messages, toolSchemas, {
        llm: this.llm,
        executor: this.toolExecutor,
        maxSteps: this.maxToolSteps,
        logger: this.logger,
        useNativeToolCalling: this.useNativeToolCalling,
      });
    } else {
      // 无工具，直接调用 LLM
      const response = await this.llm.invoke(messages);
      result = {
        finalText: response,
        trace: [],
        stepsUsed: 0,
        reachedMaxSteps: false,
      };
    }

    // 保存追踪
    if (this.keepTrace) {
      this.lastTrace = result.trace;
    }

    // 更新历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(result.finalText, 'assistant'));

    return {
      text: result.finalText,
      trace: this.keepTrace ? result.trace : undefined,
      toolStepsUsed: result.stepsUsed,
      reachedMaxSteps: result.reachedMaxSteps,
    };
  }

  /**
   * 获取最近一次运行的追踪
   */
  getLastTrace(): ToolCallingStep[] | undefined {
    return this.lastTrace;
  }

  /**
   * 构建消息列表
   */
  private buildMessages(input: string): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 系统提示词
    let systemPrompt = this.systemPrompt ?? '你是一个有用的 AI 助手。';

    // 如果使用文本协议，添加工具使用说明
    if (this.enableToolCalling && !this.useNativeToolCalling && this.hasTools()) {
      const toolsDesc = this.toolRegistry.getToolsDescription();
      systemPrompt += '\n\n## 可用工具\n' + toolsDesc;
      systemPrompt += '\n\n## 工具调用格式\n';
      systemPrompt += '当需要使用工具时，请使用以下格式：\n';
      systemPrompt += '```\n[[TOOL_CALL]]\n{"name":"工具名","arguments":{"参数名":"参数值"}}\n[[/TOOL_CALL]]\n```\n';
    }

    messages.push({ role: 'system', content: systemPrompt });

    // 历史消息
    for (const msg of this.history) {
      messages.push({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      });
    }

    // 当前输入
    messages.push({ role: 'user', content: input });

    return messages;
  }

  /**
   * 获取工具 Schema
   */
  private getToolSchemas(): FunctionSchema[] {
    if (!this.enableToolCalling) {
      return [];
    }
    return this.toolRegistry.getAllToolSchemas();
  }

  /**
   * 流式运行 Agent（不支持工具调用）
   */
  async *streamRun(input: string): AsyncGenerator<string, void, unknown> {
    const messages = this.buildMessages(input);

    let fullResponse = '';
    for await (const chunk of this.llm.streamInvoke(messages)) {
      fullResponse += chunk;
      yield chunk;
    }

    // 更新历史
    this.addMessage(new Message(input, 'user'));
    this.addMessage(new Message(fullResponse, 'assistant'));
  }
}
