/**
 * Embedding 模块 - 文本向量化
 *
 * 使用 OpenAI 兼容的 Embedding API
 */

import OpenAI from "openai";

/**
 * Embedding 模型配置
 */
export interface EmbeddingConfig {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  dimensions?: number;
}

/**
 * Embedding 模型接口
 */
export interface EmbeddingModel {
  encode(texts: string | string[]): Promise<number[][]>;
  readonly dimension: number;
}

/**
 * OpenAI 兼容的 Embedding 实现
 */
export class OpenAIEmbedding implements EmbeddingModel {
  private client: OpenAI;
  private model: string;
  private _dimension: number;

  constructor(config: EmbeddingConfig = {}) {
    const apiKey =
      config.apiKey ?? process.env.EMBED_API_KEY ?? process.env.LLM_API_KEY;
    const baseURL =
      config.baseURL ?? process.env.EMBED_BASE_URL ?? process.env.LLM_BASE_URL;

    if (!apiKey) {
      throw new Error("Embedding API Key 未配置");
    }

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });

    this.model =
      config.model ?? process.env.EMBED_MODEL_NAME ?? "text-embedding-3-small";
    this._dimension = config.dimensions ?? 1536; // OpenAI 默认维度
  }

  /**
   * 编码文本为向量
   */
  async encode(texts: string | string[]): Promise<number[][]> {
    const input = Array.isArray(texts) ? texts : [texts];

    try {
      const response = await this.client.embeddings.create({
        model: this.model,
        input,
      });

      const embeddings = response.data.map((item) => item.embedding);

      // 更新维度
      if (embeddings.length > 0) {
        this._dimension = embeddings[0].length;
      }

      return embeddings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Embedding 生成失败: ${message}`);
    }
  }

  get dimension(): number {
    return this._dimension;
  }
}

/**
 * DashScope (通义千问) Embedding 实现
 */
export class DashScopeEmbedding implements EmbeddingModel {
  private apiKey: string;
  private baseURL: string;
  private model: string;
  private _dimension: number;

  constructor(config: EmbeddingConfig = {}) {
    this.apiKey =
      config.apiKey ??
      process.env.EMBED_API_KEY ??
      process.env.DASHSCOPE_API_KEY ??
      "";
    this.baseURL =
      config.baseURL ??
      process.env.EMBED_BASE_URL ??
      "https://dashscope.aliyuncs.com/compatible-mode/v1";
    this.model =
      config.model ?? process.env.EMBED_MODEL_NAME ?? "text-embedding-v3";
    this._dimension = config.dimensions ?? 1024;

    if (!this.apiKey) {
      throw new Error("DashScope API Key 未配置");
    }
  }

  /**
   * 编码文本为向量
   */
  async encode(texts: string | string[]): Promise<number[][]> {
    const input = Array.isArray(texts) ? texts : [texts];

    try {
      const response = await fetch(`${this.baseURL}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          input,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = (await response.json()) as {
        data: Array<{ embedding: number[] }>;
      };

      const embeddings = data.data.map((item) => item.embedding);

      if (embeddings.length > 0) {
        this._dimension = embeddings[0].length;
      }

      return embeddings;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`DashScope Embedding 生成失败: ${message}`);
    }
  }

  get dimension(): number {
    return this._dimension;
  }
}

/**
 * 简单的 TF-IDF Embedding (兜底方案)
 */
export class SimpleEmbedding implements EmbeddingModel {
  private _dimension: number;

  constructor(dimension = 384) {
    this._dimension = dimension;
  }

  /**
   * 简单的哈希向量化
   */
  async encode(texts: string | string[]): Promise<number[][]> {
    const input = Array.isArray(texts) ? texts : [texts];

    return input.map((text) => this.hashEncode(text));
  }

  /**
   * 基于哈希的简单向量化
   */
  private hashEncode(text: string): number[] {
    const vector = new Array(this._dimension).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (const word of words) {
      // 简单哈希
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = (hash * 31 + word.charCodeAt(i)) % this._dimension;
      }
      vector[hash] += 1;
    }

    // 归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= norm;
      }
    }

    return vector;
  }

  get dimension(): number {
    return this._dimension;
  }
}

// 全局 Embedding 实例
let globalEmbedding: EmbeddingModel | null = null;

/**
 * 获取全局 Embedding 实例
 */
export function getEmbedding(): EmbeddingModel {
  if (globalEmbedding) {
    return globalEmbedding;
  }

  const modelType = process.env.EMBED_MODEL_TYPE ?? "dashscope";

  try {
    if (modelType === "openai") {
      globalEmbedding = new OpenAIEmbedding();
    } else if (modelType === "dashscope") {
      globalEmbedding = new DashScopeEmbedding();
    } else {
      globalEmbedding = new SimpleEmbedding();
    }
  } catch {
    // 回退到简单实现
    console.warn("⚠️ Embedding 模型初始化失败，使用简单哈希实现");
    globalEmbedding = new SimpleEmbedding();
  }

  return globalEmbedding;
}

/**
 * 获取向量维度
 */
export function getEmbeddingDimension(defaultDim = 384): number {
  try {
    return getEmbedding().dimension;
  } catch {
    return defaultDim;
  }
}

/**
 * 刷新 Embedding 实例
 */
export function refreshEmbedding(): EmbeddingModel {
  globalEmbedding = null;
  return getEmbedding();
}
