/**
 * 异常体系 - HelloAgents 错误类定义
 */

/**
 * HelloAgents 基础异常类
 */
export class HelloAgentsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HelloAgentsError';
    Object.setPrototypeOf(this, HelloAgentsError.prototype);
  }
}

/**
 * LLM 相关异常
 */
export class LLMError extends HelloAgentsError {
  constructor(message: string) {
    super(message);
    this.name = 'LLMError';
    Object.setPrototypeOf(this, LLMError.prototype);
  }
}

/**
 * Agent 相关异常
 */
export class AgentError extends HelloAgentsError {
  constructor(message: string) {
    super(message);
    this.name = 'AgentError';
    Object.setPrototypeOf(this, AgentError.prototype);
  }
}

/**
 * 配置相关异常
 */
export class ConfigError extends HelloAgentsError {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
    Object.setPrototypeOf(this, ConfigError.prototype);
  }
}

/**
 * 工具相关异常
 */
export class ToolError extends HelloAgentsError {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
    Object.setPrototypeOf(this, ToolError.prototype);
  }
}

/**
 * 记忆系统相关异常
 */
export class MemoryError extends HelloAgentsError {
  constructor(message: string) {
    super(message);
    this.name = 'MemoryError';
    Object.setPrototypeOf(this, MemoryError.prototype);
  }
}
