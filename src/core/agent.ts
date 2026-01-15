/**
 * Agent 基类 - 所有 Agent 的抽象基类
 */

import { Message } from "./message.js";
import { HelloAgentsLLM } from "./llm.js";
import { Config, createConfig } from "./config.js";
import { Logger, silentLogger } from "./logger.js";

/**
 * Agent 构造选项
 */
export interface AgentOptions {
  name: string;
  llm: HelloAgentsLLM;
  systemPrompt?: string;
  config?: Partial<Config>;
  /** 可选注入 Logger */
  logger?: Logger;
}

/**
 * Agent 抽象基类
 */
export abstract class Agent {
  readonly name: string;
  readonly llm: HelloAgentsLLM;
  readonly systemPrompt?: string;
  readonly config: Config;
  readonly logger: Logger;

  protected history: Message[] = [];

  constructor(options: AgentOptions) {
    this.name = options.name;
    this.llm = options.llm;
    this.systemPrompt = options.systemPrompt;
    this.config = createConfig(options.config);
    this.logger = options.logger ?? silentLogger;
  }

  /**
   * 运行 Agent（抽象方法，子类必须实现）
   */
  abstract run(
    input: string,
    options?: Record<string, unknown>
  ): Promise<string>;

  /**
   * 添加消息到历史记录
   */
  addMessage(message: Message): void {
    this.history.push(message);

    // 限制历史记录长度
    if (this.history.length > this.config.maxHistoryLength) {
      this.history = this.history.slice(-this.config.maxHistoryLength);
    }
  }

  /**
   * 清空历史记录
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * 获取历史记录副本
   */
  getHistory(): Message[] {
    return [...this.history];
  }

  /**
   * 获取历史记录长度
   */
  getHistoryLength(): number {
    return this.history.length;
  }

  /**
   * 字符串表示
   */
  toString(): string {
    return `Agent(name=${this.name}, provider=${this.llm.provider})`;
  }
}
