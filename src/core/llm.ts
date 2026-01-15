/**
 * HelloAgents LLM 客户端 - 基于 OpenAI SDK
 */

import OpenAI from 'openai';
import { LLMError } from './exceptions.js';

/**
 * 支持的 LLM 提供商
 */
export type LLMProvider =
  | 'openai'
  | 'deepseek'
  | 'qwen'
  | 'modelscope'
  | 'kimi'
  | 'zhipu'
  | 'ollama'
  | 'vllm'
  | 'local'
  | 'auto'
  | 'custom';

/**
 * LLM 配置选项
 */
export interface LLMOptions {
  model?: string;
  apiKey?: string;
  baseURL?: string;
  provider?: LLMProvider;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

/**
 * 消息格式
 */
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
}

/**
 * Provider 配置映射
 */
const PROVIDER_CONFIGS: Record<string, { baseURL: string; defaultModel: string; envKey: string }> = {
  openai: {
    baseURL: 'https://api.openai.com/v1',
    defaultModel: 'gpt-3.5-turbo',
    envKey: 'OPENAI_API_KEY',
  },
  deepseek: {
    baseURL: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat',
    envKey: 'DEEPSEEK_API_KEY',
  },
  qwen: {
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModel: 'qwen-plus',
    envKey: 'DASHSCOPE_API_KEY',
  },
  modelscope: {
    baseURL: 'https://api-inference.modelscope.cn/v1/',
    defaultModel: 'Qwen/Qwen2.5-72B-Instruct',
    envKey: 'MODELSCOPE_API_KEY',
  },
  kimi: {
    baseURL: 'https://api.moonshot.cn/v1',
    defaultModel: 'moonshot-v1-8k',
    envKey: 'KIMI_API_KEY',
  },
  zhipu: {
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4',
    envKey: 'ZHIPU_API_KEY',
  },
  ollama: {
    baseURL: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    envKey: 'OLLAMA_API_KEY',
  },
  vllm: {
    baseURL: 'http://localhost:8000/v1',
    defaultModel: 'meta-llama/Llama-2-7b-chat-hf',
    envKey: 'VLLM_API_KEY',
  },
  local: {
    baseURL: 'http://localhost:8000/v1',
    defaultModel: 'local-model',
    envKey: 'LLM_API_KEY',
  },
};

/**
 * HelloAgents LLM 客户端
 *
 * 用于调用任何兼容 OpenAI 接口的服务
 */
export class HelloAgentsLLM {
  readonly model: string;
  readonly provider: LLMProvider;
  readonly temperature: number;
  readonly maxTokens?: number;
  readonly timeout: number;

  private readonly client: OpenAI;
  private readonly apiKey: string;
  private readonly baseURL: string;

  constructor(options: LLMOptions = {}) {
    // 自动检测 provider
    this.provider = options.provider ?? this.autoDetectProvider(options.apiKey, options.baseURL);

    // 解析凭证
    const credentials = this.resolveCredentials(options.apiKey, options.baseURL);
    this.apiKey = credentials.apiKey;
    this.baseURL = credentials.baseURL;

    // 设置模型
    this.model = options.model ?? process.env.LLM_MODEL_ID ?? this.getDefaultModel();

    // 其他参数
    this.temperature = options.temperature ?? 0.7;
    this.maxTokens = options.maxTokens;
    this.timeout = options.timeout ?? parseInt(process.env.LLM_TIMEOUT ?? '60', 10) * 1000;

    // 验证必要参数
    if (!this.apiKey || !this.baseURL) {
      throw new LLMError('API 密钥和服务地址必须提供或在环境变量中定义');
    }

    // 创建 OpenAI 客户端
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL,
      timeout: this.timeout,
    });
  }

  /**
   * 自动检测 LLM 提供商
   */
  private autoDetectProvider(apiKey?: string, baseURL?: string): LLMProvider {
    // 检查特定提供商的环境变量
    if (process.env.OPENAI_API_KEY) return 'openai';
    if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
    if (process.env.DASHSCOPE_API_KEY) return 'qwen';
    if (process.env.MODELSCOPE_API_KEY) return 'modelscope';
    if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) return 'kimi';
    if (process.env.ZHIPU_API_KEY || process.env.GLM_API_KEY) return 'zhipu';
    if (process.env.OLLAMA_API_KEY || process.env.OLLAMA_HOST) return 'ollama';
    if (process.env.VLLM_API_KEY || process.env.VLLM_HOST) return 'vllm';

    // 根据 API Key 格式判断
    const actualApiKey = apiKey ?? process.env.LLM_API_KEY;
    if (actualApiKey) {
      if (actualApiKey.startsWith('ms-')) return 'modelscope';
      if (actualApiKey.toLowerCase() === 'ollama') return 'ollama';
      if (actualApiKey.toLowerCase() === 'vllm') return 'vllm';
      if (actualApiKey.toLowerCase() === 'local') return 'local';
    }

    // 根据 baseURL 判断
    const actualBaseURL = baseURL ?? process.env.LLM_BASE_URL;
    if (actualBaseURL) {
      const url = actualBaseURL.toLowerCase();
      if (url.includes('api.openai.com')) return 'openai';
      if (url.includes('api.deepseek.com')) return 'deepseek';
      if (url.includes('dashscope.aliyuncs.com')) return 'qwen';
      if (url.includes('api-inference.modelscope.cn')) return 'modelscope';
      if (url.includes('api.moonshot.cn')) return 'kimi';
      if (url.includes('open.bigmodel.cn')) return 'zhipu';
      if (url.includes('localhost') || url.includes('127.0.0.1')) {
        if (url.includes(':11434')) return 'ollama';
        if (url.includes(':8000')) return 'vllm';
        return 'local';
      }
    }

    return 'auto';
  }

  /**
   * 解析 API 凭证
   */
  private resolveCredentials(
    apiKey?: string,
    baseURL?: string
  ): { apiKey: string; baseURL: string } {
    const config = PROVIDER_CONFIGS[this.provider];

    if (config) {
      return {
        apiKey: apiKey ?? process.env[config.envKey] ?? process.env.LLM_API_KEY ?? '',
        baseURL: baseURL ?? process.env.LLM_BASE_URL ?? config.baseURL,
      };
    }

    // auto 或 custom
    return {
      apiKey: apiKey ?? process.env.LLM_API_KEY ?? '',
      baseURL: baseURL ?? process.env.LLM_BASE_URL ?? '',
    };
  }

  /**
   * 获取默认模型
   */
  private getDefaultModel(): string {
    const config = PROVIDER_CONFIGS[this.provider];
    if (config) {
      return config.defaultModel;
    }

    // 根据 baseURL 推断
    const baseURL = this.baseURL.toLowerCase();
    if (baseURL.includes('modelscope')) return 'Qwen/Qwen2.5-72B-Instruct';
    if (baseURL.includes('deepseek')) return 'deepseek-chat';
    if (baseURL.includes('dashscope')) return 'qwen-plus';
    if (baseURL.includes('moonshot')) return 'moonshot-v1-8k';
    if (baseURL.includes('bigmodel')) return 'glm-4';
    if (baseURL.includes(':11434')) return 'llama3.2';

    return 'gpt-3.5-turbo';
  }

  /**
   * 流式调用 LLM
   */
  async *think(
    messages: ChatMessage[],
    temperature?: number
  ): AsyncGenerator<string, void, unknown> {
    console.log(`🧠 正在调用 ${this.model} 模型...`);

    try {
      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        temperature: temperature ?? this.temperature,
        max_tokens: this.maxTokens,
        stream: true,
      });

      console.log('✅ 大语言模型响应成功:');

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content ?? '';
        if (content) {
          process.stdout.write(content);
          yield content;
        }
      }

      console.log(); // 换行
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 调用 LLM API 时发生错误: ${message}`);
      throw new LLMError(`LLM 调用失败: ${message}`);
    }
  }

  /**
   * 非流式调用 LLM
   */
  async invoke(messages: ChatMessage[], options: { temperature?: number } = {}): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        temperature: options.temperature ?? this.temperature,
        max_tokens: this.maxTokens,
      });

      return response.choices[0]?.message?.content ?? '';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LLMError(`LLM 调用失败: ${message}`);
    }
  }

  /**
   * 流式调用 LLM（别名方法）
   */
  async *streamInvoke(
    messages: ChatMessage[],
    options: { temperature?: number } = {}
  ): AsyncGenerator<string, void, unknown> {
    yield* this.think(messages, options.temperature);
  }

  /**
   * 获取底层 OpenAI 客户端
   */
  getClient(): OpenAI {
    return this.client;
  }
}
