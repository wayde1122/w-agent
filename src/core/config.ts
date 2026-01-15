/**
 * 配置管理 - HelloAgents 配置类
 */

import { z } from 'zod';
import { Logger, LogLevel, createLogger as createLoggerFromLevel, silentLogger } from './logger.js';

/**
 * 配置 Schema（不包含 logger，因为 logger 是运行时对象）
 */
export const ConfigSchema = z.object({
  // LLM 配置
  defaultModel: z.string().default('gpt-3.5-turbo'),
  defaultProvider: z.string().default('openai'),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().optional(),
  timeout: z.number().default(60000),

  // 系统配置
  debug: z.boolean().default(false),
  logLevel: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR', 'SILENT']).default('SILENT'),

  // 历史记录配置
  maxHistoryLength: z.number().default(100),
});

/**
 * 运行时配置（包含 logger）
 */
export interface RuntimeConfig extends z.output<typeof ConfigSchema> {
  logger: Logger;
}

export type ConfigOptions = z.input<typeof ConfigSchema> & {
  /** 可选注入 Logger，不传则根据 logLevel 自动创建 */
  logger?: Logger;
};
export type Config = z.output<typeof ConfigSchema>;

/**
 * 创建配置对象（不含 logger）
 */
export function createConfig(options: Partial<ConfigOptions> = {}): Config {
  return ConfigSchema.parse(options);
}

/**
 * 创建运行时配置（含 logger）
 */
export function createRuntimeConfig(options: Partial<ConfigOptions> = {}): RuntimeConfig {
  const config = ConfigSchema.parse(options);
  const logger = options.logger ?? createLoggerFromLevel(config.logLevel as LogLevel);
  return { ...config, logger };
}

/**
 * 从环境变量创建配置
 */
export function createConfigFromEnv(): Config {
  return ConfigSchema.parse({
    debug: process.env.DEBUG?.toLowerCase() === 'true',
    logLevel: process.env.LOG_LEVEL ?? 'SILENT',
    temperature: process.env.TEMPERATURE ? parseFloat(process.env.TEMPERATURE) : undefined,
    maxTokens: process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : undefined,
    timeout: process.env.LLM_TIMEOUT ? parseInt(process.env.LLM_TIMEOUT, 10) * 1000 : undefined,
  });
}

/**
 * 从环境变量创建运行时配置（含 logger）
 */
export function createRuntimeConfigFromEnv(logger?: Logger): RuntimeConfig {
  const config = createConfigFromEnv();
  return {
    ...config,
    logger: logger ?? createLoggerFromLevel(config.logLevel as LogLevel),
  };
}

/**
 * 默认配置实例
 */
export const defaultConfig = createConfig();

/**
 * 默认运行时配置实例（静默 logger）
 */
export const defaultRuntimeConfig: RuntimeConfig = {
  ...defaultConfig,
  logger: silentLogger,
};
