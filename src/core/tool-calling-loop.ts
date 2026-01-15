/**
 * ToolCallingLoop - 工具调用循环
 *
 * 实现多轮工具调用：
 * 模型产出工具调用 → 执行工具 → 把结果作为 tool message 追加 → 继续让模型整合
 * 直到无工具调用或达到 maxSteps
 */

import OpenAI from "openai";
import { HelloAgentsLLM, ChatMessage } from "./llm.js";
import {
  ToolExecutor,
  ToolCallRequest,
  ToolCallResult,
} from "../tools/executor.js";
import { FunctionSchema } from "../tools/base.js";
import { Logger, silentLogger } from "./logger.js";

/**
 * 单步执行记录
 */
export interface ToolCallingStep {
  /** 步骤编号 */
  step: number;
  /** 本步的工具调用 */
  toolCalls: ToolCallRequest[];
  /** 工具执行结果 */
  results: ToolCallResult[];
  /** LLM 本轮的文本输出（如有） */
  llmContent?: string;
}

/**
 * 循环执行结果
 */
export interface LoopResult {
  /** 最终文本输出 */
  finalText: string;
  /** 执行追踪 */
  trace: ToolCallingStep[];
  /** 使用的步数 */
  stepsUsed: number;
  /** 是否因达到 maxSteps 而终止 */
  reachedMaxSteps: boolean;
}

/**
 * 工具调用循环配置
 */
export interface ToolCallingLoopOptions {
  /** LLM 客户端 */
  llm: HelloAgentsLLM;
  /** 工具执行器 */
  executor: ToolExecutor;
  /** 最大步数 */
  maxSteps?: number;
  /** Logger */
  logger?: Logger;
  /** 是否使用原生 tool calling（需 LLM 支持） */
  useNativeToolCalling?: boolean;
  /** temperature 覆盖 */
  temperature?: number;
}

/**
 * 默认最大步数
 */
const DEFAULT_MAX_STEPS = 5;

/**
 * 运行工具调用循环（原生 tool calling 模式）
 */
export async function runToolCallingLoop(
  messages: ChatMessage[],
  toolSchemas: FunctionSchema[],
  options: ToolCallingLoopOptions
): Promise<LoopResult> {
  const {
    llm,
    executor,
    maxSteps = DEFAULT_MAX_STEPS,
    logger = silentLogger,
    useNativeToolCalling = true,
    temperature,
  } = options;

  const trace: ToolCallingStep[] = [];
  let stepsUsed = 0;
  let reachedMaxSteps = false;

  // 构建 OpenAI 格式的消息
  const openaiMessages: OpenAI.ChatCompletionMessageParam[] = messages.map(
    (m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })
  );

  const client = llm.getClient();

  while (stepsUsed < maxSteps) {
    stepsUsed++;
    logger.debug(`工具调用循环: 第 ${stepsUsed} 步`);

    let toolCalls: ToolCallRequest[] = [];
    let llmContent = "";

    if (useNativeToolCalling && toolSchemas.length > 0) {
      // 原生 tool calling 模式
      const response = await client.chat.completions.create({
        model: llm.model,
        messages: openaiMessages,
        tools: toolSchemas as OpenAI.ChatCompletionTool[],
        tool_choice: "auto",
        temperature: temperature ?? llm.temperature,
        max_tokens: llm.maxTokens,
      });

      const choice = response.choices[0];
      const assistantMessage = choice.message;
      llmContent = assistantMessage.content ?? "";

      // 检查是否有工具调用
      if (
        assistantMessage.tool_calls &&
        assistantMessage.tool_calls.length > 0
      ) {
        toolCalls = executor.parseFromOpenAIResponse({
          ...response,
          choices: [{ ...choice, message: assistantMessage }],
        } as OpenAI.ChatCompletion);

        // 添加 assistant 消息（含 tool_calls）
        openaiMessages.push({
          role: "assistant",
          content: llmContent,
          tool_calls: assistantMessage.tool_calls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: {
              name: tc.function.name,
              arguments: tc.function.arguments,
            },
          })),
        });
      }
    } else {
      // 文本协议模式
      const response = await llm.invoke(openaiMessages as ChatMessage[], {
        temperature,
      });
      llmContent = response;
      toolCalls = executor.parseFromText(response);

      if (toolCalls.length > 0) {
        // 添加 assistant 消息
        openaiMessages.push({
          role: "assistant",
          content: llmContent,
        });
      }
    }

    // 如果没有工具调用，循环结束
    if (toolCalls.length === 0) {
      logger.debug(`第 ${stepsUsed} 步无工具调用，循环结束`);
      trace.push({
        step: stepsUsed,
        toolCalls: [],
        results: [],
        llmContent,
      });
      return {
        finalText: llmContent,
        trace,
        stepsUsed,
        reachedMaxSteps: false,
      };
    }

    // 执行工具调用
    logger.debug(`第 ${stepsUsed} 步执行 ${toolCalls.length} 个工具调用`);
    const results = await executor.executeAll(toolCalls);

    // 记录本步
    trace.push({
      step: stepsUsed,
      toolCalls,
      results,
      llmContent,
    });

    // 添加工具结果到消息
    if (useNativeToolCalling) {
      for (const result of results) {
        openaiMessages.push(executor.formatAsToolMessage(result));
      }
    } else {
      // 文本协议：将结果作为 user 消息追加
      const resultsText = results
        .map((r) => executor.formatAsText(r))
        .join("\n\n");
      openaiMessages.push({
        role: "user",
        content: `工具执行结果：\n${resultsText}\n\n请基于这些结果继续回答。`,
      });
    }
  }

  // 达到 maxSteps，强制获取最终答案
  logger.warn(`达到最大步数 ${maxSteps}，强制获取最终答案`);
  reachedMaxSteps = true;

  let finalText = "";
  if (useNativeToolCalling && toolSchemas.length > 0) {
    const response = await client.chat.completions.create({
      model: llm.model,
      messages: openaiMessages,
      tools: toolSchemas as OpenAI.ChatCompletionTool[],
      tool_choice: "none", // 强制不调用工具
      temperature: temperature ?? llm.temperature,
      max_tokens: llm.maxTokens,
    });
    finalText = response.choices[0].message.content ?? "";
  } else {
    finalText = await llm.invoke(openaiMessages as ChatMessage[], {
      temperature,
    });
  }

  return {
    finalText,
    trace,
    stepsUsed,
    reachedMaxSteps,
  };
}

/**
 * 简化版：单次工具调用（不循环）
 */
export async function runSingleToolCall(
  messages: ChatMessage[],
  toolSchemas: FunctionSchema[],
  options: Omit<ToolCallingLoopOptions, "maxSteps">
): Promise<LoopResult> {
  return runToolCallingLoop(messages, toolSchemas, { ...options, maxSteps: 1 });
}
