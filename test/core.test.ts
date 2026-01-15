/**
 * Core 模块测试
 */

import { describe, it, expect } from 'vitest';
import {
  HelloAgentsError,
  LLMError,
  AgentError,
  ConfigError,
  ToolError,
  MemoryError,
} from '../src/core/exceptions.js';
import { createConfig, createConfigFromEnv, defaultConfig } from '../src/core/config.js';
import { Message, messagesToOpenAI } from '../src/core/message.js';

describe('Exceptions', () => {
  it('should create HelloAgentsError', () => {
    const error = new HelloAgentsError('test error');
    expect(error.name).toBe('HelloAgentsError');
    expect(error.message).toBe('test error');
    expect(error instanceof Error).toBe(true);
  });

  it('should create LLMError', () => {
    const error = new LLMError('llm error');
    expect(error.name).toBe('LLMError');
    expect(error instanceof HelloAgentsError).toBe(true);
  });

  it('should create AgentError', () => {
    const error = new AgentError('agent error');
    expect(error.name).toBe('AgentError');
    expect(error instanceof HelloAgentsError).toBe(true);
  });

  it('should create ConfigError', () => {
    const error = new ConfigError('config error');
    expect(error.name).toBe('ConfigError');
    expect(error instanceof HelloAgentsError).toBe(true);
  });

  it('should create ToolError', () => {
    const error = new ToolError('tool error');
    expect(error.name).toBe('ToolError');
    expect(error instanceof HelloAgentsError).toBe(true);
  });

  it('should create MemoryError', () => {
    const error = new MemoryError('memory error');
    expect(error.name).toBe('MemoryError');
    expect(error instanceof HelloAgentsError).toBe(true);
  });
});

describe('Config', () => {
  it('should create default config', () => {
    const config = createConfig();
    expect(config.defaultModel).toBe('gpt-3.5-turbo');
    expect(config.defaultProvider).toBe('openai');
    expect(config.temperature).toBe(0.7);
    expect(config.debug).toBe(false);
    expect(config.logLevel).toBe('INFO');
    expect(config.maxHistoryLength).toBe(100);
  });

  it('should create config with custom options', () => {
    const config = createConfig({
      defaultModel: 'gpt-4',
      temperature: 0.5,
      debug: true,
      maxHistoryLength: 50,
    });
    expect(config.defaultModel).toBe('gpt-4');
    expect(config.temperature).toBe(0.5);
    expect(config.debug).toBe(true);
    expect(config.maxHistoryLength).toBe(50);
  });

  it('should have defaultConfig instance', () => {
    expect(defaultConfig).toBeDefined();
    expect(defaultConfig.defaultModel).toBe('gpt-3.5-turbo');
  });
});

describe('Message', () => {
  it('should create a message', () => {
    const msg = new Message('Hello', 'user');
    expect(msg.content).toBe('Hello');
    expect(msg.role).toBe('user');
    expect(msg.timestamp).toBeInstanceOf(Date);
  });

  it('should create message with metadata', () => {
    const msg = new Message('Hello', 'assistant', { source: 'test' });
    expect(msg.metadata).toEqual({ source: 'test' });
  });

  it('should convert to dict', () => {
    const msg = new Message('Hello', 'user');
    const dict = msg.toDict();
    expect(dict).toEqual({ role: 'user', content: 'Hello' });
  });

  it('should convert to string', () => {
    const msg = new Message('Hello', 'user');
    expect(msg.toString()).toBe('[user] Hello');
  });

  it('should convert messages to OpenAI format', () => {
    const messages = [
      new Message('System prompt', 'system'),
      new Message('Hello', 'user'),
      new Message('Hi there!', 'assistant'),
    ];

    const openaiMessages = messagesToOpenAI(messages);
    expect(openaiMessages).toHaveLength(3);
    expect(openaiMessages[0]).toEqual({ role: 'system', content: 'System prompt' });
    expect(openaiMessages[1]).toEqual({ role: 'user', content: 'Hello' });
    expect(openaiMessages[2]).toEqual({ role: 'assistant', content: 'Hi there!' });
  });
});
