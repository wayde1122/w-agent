/**
 * 配置管理 - HelloAgents 配置类
 */

import { z } from 'zod';

/**
 * 配置 Schema
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
  logLevel: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']).default('INFO'),

  // 历史记录配置
  maxHistoryLength: z.number().default(100),
});

export type ConfigOptions = z.input<typeof ConfigSchema>;
export type Config = z.output<typeof ConfigSchema>;

/**
 * 创建配置对象
 */
export function createConfig(options: Partial<ConfigOptions> = {}): Config {
  return ConfigSchema.parse(options);
}

/**
 * 从环境变量创建配置
 */
export function createConfigFromEnv(): Config {
  return ConfigSchema.parse({
    debug: process.env.DEBUG?.toLowerCase() === 'true',
    logLevel: process.env.LOG_LEVEL ?? 'INFO',
    temperature: process.env.TEMPERATURE ? parseFloat(process.env.TEMPERATURE) : undefined,
    maxTokens: process.env.MAX_TOKENS ? parseInt(process.env.MAX_TOKENS, 10) : undefined,
    timeout: process.env.LLM_TIMEOUT ? parseInt(process.env.LLM_TIMEOUT, 10) * 1000 : undefined,
  });
}

/**
 * 默认配置实例
 */
export const defaultConfig = createConfig();
