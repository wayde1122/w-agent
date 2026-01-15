/**
 * 消息系统 - 定义消息类型和结构
 */

import { z } from 'zod';

/**
 * 消息角色类型
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * 消息 Schema
 */
export const MessageSchema = z.object({
  content: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'tool']),
  timestamp: z.date().default(() => new Date()),
  metadata: z.record(z.unknown()).optional(),
});

export type MessageInput = z.input<typeof MessageSchema>;
export type MessageData = z.output<typeof MessageSchema>;

/**
 * 消息类
 */
export class Message {
  readonly content: string;
  readonly role: MessageRole;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;

  constructor(content: string, role: MessageRole, metadata?: Record<string, unknown>) {
    this.content = content;
    this.role = role;
    this.timestamp = new Date();
    this.metadata = metadata;
  }

  /**
   * 转换为 OpenAI API 格式
   */
  toDict(): { role: string; content: string } {
    return {
      role: this.role,
      content: this.content,
    };
  }

  /**
   * 转换为字符串表示
   */
  toString(): string {
    return `[${this.role}] ${this.content}`;
  }

  /**
   * 从普通对象创建消息
   */
  static fromObject(obj: MessageInput): Message {
    const parsed = MessageSchema.parse(obj);
    const msg = new Message(parsed.content, parsed.role, parsed.metadata);
    return msg;
  }
}

/**
 * OpenAI 消息格式类型
 */
export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

/**
 * 将消息数组转换为 OpenAI 格式
 */
export function messagesToOpenAI(messages: Message[]): OpenAIMessage[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}
