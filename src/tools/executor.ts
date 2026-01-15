/**
 * ToolExecutor - 统一的工具执行器
 *
 * 提供：
 * 1. 工具调用的解析（支持 OpenAI tool_calls 和 JSON 块协议）
 * 2. 工具执行与结果封装
 * 3. 可观测的执行追踪
 */

import OpenAI from "openai";
import { ToolRegistry } from "./registry.js";
import { ToolParameters } from "./base.js";
import { Logger, silentLogger } from "../core/logger.js";

/**
 * 工具调用请求
 */
export interface ToolCallRequest {
  /** 调用 ID（用于关联结果） */
  id: string;
  /** 工具名称 */
  name: string;
  /** 工具参数 */
  arguments: Record<string, unknown>;
}

/**
 * 工具调用结果
 */
export interface ToolCallResult {
  /** 调用 ID */
  id: string;
  /** 工具名称 */
  name: string;
  /** 执行输出 */
  output: string;
  /** 错误信息（如有） */
  error?: string;
  /** 是否成功 */
  success: boolean;
}

/**
 * ToolExecutor 配置
 */
export interface ToolExecutorOptions {
  /** 工具注册表 */
  registry: ToolRegistry;
  /** Logger */
  logger?: Logger;
}

/**
 * JSON 块协议格式
 *
 * 用于不支持原生 tool calling 的 LLM：
 * ```
 * [[TOOL_CALL]]
 * {"name":"search","arguments":{"query":"TypeScript"}}
 * [[/TOOL_CALL]]
 * ```
 */
const JSON_BLOCK_PATTERN =
  /\[\[TOOL_CALL\]\]\s*([\s\S]*?)\s*\[\[\/TOOL_CALL\]\]/g;

/**
 * 旧版文本协议（兼容）
 *
 * 格式：[TOOL_CALL:工具名:参数]
 */
const LEGACY_PATTERN = /\[TOOL_CALL:([^:]+):([^\]]+)\]/g;

/**
 * 工具执行器
 */
export class ToolExecutor {
  private readonly registry: ToolRegistry;
  private readonly logger: Logger;
  private callCounter = 0;

  constructor(options: ToolExecutorOptions) {
    this.registry = options.registry;
    this.logger = options.logger ?? silentLogger;
  }

  /**
   * 执行单个工具调用
   */
  async execute(call: ToolCallRequest): Promise<ToolCallResult> {
    this.logger.debug(
      `执行工具: ${call.name}, 参数: ${JSON.stringify(call.arguments)}`
    );

    try {
      const result = await this.registry.executeTool(
        call.name,
        call.arguments as ToolParameters
      );
      this.logger.debug(`工具 ${call.name} 执行成功`);

      return {
        id: call.id,
        name: call.name,
        output: result,
        success: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`工具 ${call.name} 执行失败: ${errorMsg}`);

      return {
        id: call.id,
        name: call.name,
        output: "",
        error: errorMsg,
        success: false,
      };
    }
  }

  /**
   * 批量执行工具调用
   */
  async executeAll(calls: ToolCallRequest[]): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];
    for (const call of calls) {
      const result = await this.execute(call);
      results.push(result);
    }
    return results;
  }

  /**
   * 从 OpenAI ChatCompletion 响应解析工具调用
   */
  parseFromOpenAIResponse(response: OpenAI.ChatCompletion): ToolCallRequest[] {
    const message = response.choices[0]?.message;
    if (!message?.tool_calls || message.tool_calls.length === 0) {
      return [];
    }

    return message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.parseArguments(tc.function.arguments),
    }));
  }

  /**
   * 从文本响应解析工具调用（支持 JSON 块协议和旧版协议）
   */
  parseFromText(text: string): ToolCallRequest[] {
    const calls: ToolCallRequest[] = [];

    // 1. 优先尝试 JSON 块协议
    let match;
    JSON_BLOCK_PATTERN.lastIndex = 0;
    while ((match = JSON_BLOCK_PATTERN.exec(text)) !== null) {
      try {
        const jsonStr = match[1].trim();
        const parsed = JSON.parse(jsonStr);
        if (parsed.name) {
          calls.push({
            id: this.generateCallId(),
            name: parsed.name,
            arguments: parsed.arguments ?? {},
          });
        }
      } catch (e) {
        this.logger.warn(`解析 JSON 块失败: ${e}`);
      }
    }

    // 如果 JSON 块协议有结果，直接返回
    if (calls.length > 0) {
      return calls;
    }

    // 2. 回退到旧版文本协议
    LEGACY_PATTERN.lastIndex = 0;
    while ((match = LEGACY_PATTERN.exec(text)) !== null) {
      const toolName = match[1].trim();
      const paramStr = match[2].trim();
      calls.push({
        id: this.generateCallId(),
        name: toolName,
        arguments: this.parseLegacyParameters(paramStr),
      });
    }

    return calls;
  }

  /**
   * 解析 JSON 字符串参数
   */
  private parseArguments(argsStr: string | undefined): Record<string, unknown> {
    if (!argsStr) {
      return {};
    }
    try {
      const parsed = JSON.parse(argsStr);
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * 解析旧版参数格式
   *
   * 支持：
   * - key=value,key2=value2
   * - 单一文本参数
   */
  private parseLegacyParameters(paramStr: string): Record<string, unknown> {
    const params: Record<string, unknown> = {};

    // 尝试 JSON
    if (paramStr.trim().startsWith("{")) {
      try {
        return JSON.parse(paramStr);
      } catch {
        // 继续其他解析
      }
    }

    // key=value 格式
    if (paramStr.includes("=")) {
      const pairs = paramStr.split(",");
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split("=");
        if (key && valueParts.length > 0) {
          params[key.trim()] = this.parseValue(valueParts.join("=").trim());
        }
      }
      return params;
    }

    // 单一参数
    params.input = paramStr;
    params.query = paramStr;
    params.expression = paramStr;
    return params;
  }

  /**
   * 解析参数值类型
   */
  private parseValue(value: string): string | number | boolean {
    // 数字
    const num = parseFloat(value);
    if (!isNaN(num) && value === String(num)) {
      return num;
    }
    // 布尔
    if (value.toLowerCase() === "true") return true;
    if (value.toLowerCase() === "false") return false;
    // 字符串
    return value;
  }

  /**
   * 生成唯一调用 ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${++this.callCounter}`;
  }

  /**
   * 将工具调用结果格式化为 OpenAI tool message 格式
   */
  formatAsToolMessage(
    result: ToolCallResult
  ): OpenAI.ChatCompletionToolMessageParam {
    return {
      role: "tool",
      tool_call_id: result.id,
      content: result.success ? result.output : `错误: ${result.error}`,
    };
  }

  /**
   * 将工具调用结果格式化为文本（用于文本协议）
   */
  formatAsText(result: ToolCallResult): string {
    if (result.success) {
      return `[工具 ${result.name} 返回]: ${result.output}`;
    }
    return `[工具 ${result.name} 执行失败]: ${result.error}`;
  }
}

/**
 * 创建 ToolExecutor 实例
 */
export function createToolExecutor(options: ToolExecutorOptions): ToolExecutor {
  return new ToolExecutor(options);
}
