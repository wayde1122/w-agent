/**
 * Qdrant 向量数据库存储实现
 */

import { QdrantClient } from "@qdrant/js-client-rest";

/**
 * Qdrant 配置选项
 */
export interface QdrantConfig {
  url?: string;
  apiKey?: string;
  collectionName?: string;
  vectorSize?: number;
  distance?: "Cosine" | "Dot" | "Euclid";
  timeout?: number;
}

/**
 * 向量搜索结果
 */
export interface VectorSearchResult {
  id: string | number;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * Qdrant 向量存储类
 */
export class QdrantVectorStore {
  private client: QdrantClient;
  private collectionName: string;
  private vectorSize: number;
  private distance: "Cosine" | "Dot" | "Euclid";
  private initialized = false;

  constructor(config: QdrantConfig = {}) {
    const url = config.url ?? process.env.QDRANT_URL;
    const apiKey = config.apiKey ?? process.env.QDRANT_API_KEY;

    this.collectionName = config.collectionName ?? "hello_agents_vectors";
    this.vectorSize = config.vectorSize ?? 1024;
    this.distance = config.distance ?? "Cosine";

    // 初始化客户端
    if (url && apiKey) {
      // 云服务
      this.client = new QdrantClient({
        url,
        apiKey,
        timeout: config.timeout ?? 30000,
      });
      console.log(`✅ 连接到 Qdrant 云服务: ${url}`);
    } else if (url) {
      // 自定义 URL
      this.client = new QdrantClient({
        url,
        timeout: config.timeout ?? 30000,
      });
      console.log(`✅ 连接到 Qdrant 服务: ${url}`);
    } else {
      // 本地服务
      this.client = new QdrantClient({
        host: "localhost",
        port: 6333,
        timeout: config.timeout ?? 30000,
      });
      console.log("✅ 连接到本地 Qdrant 服务: localhost:6333");
    }
  }

  /**
   * 初始化集合
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      const collections = await this.client.getCollections();
      const exists = collections.collections.some(
        (c) => c.name === this.collectionName
      );

      if (!exists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: this.distance,
          },
        });
        console.log(`✅ 创建 Qdrant 集合: ${this.collectionName}`);

        // 创建常用过滤字段的索引
        await this.createPayloadIndexes();
      } else {
        console.log(`✅ 使用现有 Qdrant 集合: ${this.collectionName}`);
      }

      this.initialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Qdrant 初始化失败: ${message}`);
      throw error;
    }
  }

  /**
   * 创建 Payload 索引以支持过滤搜索
   */
  private async createPayloadIndexes(): Promise<void> {
    const indexFields = [
      { name: "memory_type", type: "keyword" as const },
      { name: "category", type: "keyword" as const },
      { name: "user_id", type: "keyword" as const },
      { name: "memory_id", type: "keyword" as const },
      { name: "timestamp", type: "integer" as const },
    ];

    for (const field of indexFields) {
      try {
        await this.client.createPayloadIndex(this.collectionName, {
          field_name: field.name,
          field_schema: field.type,
        });
      } catch {
        // 索引可能已存在，忽略
      }
    }
  }

  /**
   * 添加向量
   */
  async addVectors(
    vectors: number[][],
    metadata: Array<Record<string, unknown>>,
    ids?: string[]
  ): Promise<boolean> {
    await this.initialize();

    if (vectors.length === 0) {
      console.warn("⚠️ 向量列表为空");
      return false;
    }

    try {
      const points = vectors.map((vector, i) => {
        const id = ids?.[i] ?? crypto.randomUUID();
        const payload = {
          ...metadata[i],
          timestamp: Date.now(),
          added_at: new Date().toISOString(),
        };

        return {
          id,
          vector,
          payload,
        };
      });

      await this.client.upsert(this.collectionName, {
        wait: true,
        points,
      });

      console.log(`✅ 成功添加 ${points.length} 个向量到 Qdrant`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 添加向量失败: ${message}`);
      return false;
    }
  }

  /**
   * 搜索相似向量
   */
  async searchSimilar(
    queryVector: number[],
    limit = 10,
    scoreThreshold?: number,
    filter?: Record<string, unknown>
  ): Promise<VectorSearchResult[]> {
    await this.initialize();

    try {
      // 构建过滤器（Qdrant REST API 格式）
      let qdrantFilter = undefined;
      if (filter && Object.keys(filter).length > 0) {
        const must = Object.entries(filter).map(([key, value]) => ({
          key,
          match: { value: value as string | number | boolean },
        }));
        qdrantFilter = { must };
      }

      const response = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit,
        score_threshold: scoreThreshold,
        filter: qdrantFilter as Parameters<
          typeof this.client.search
        >[1]["filter"],
        with_payload: true,
      });

      const results: VectorSearchResult[] = response.map((hit) => ({
        id: hit.id,
        score: hit.score,
        metadata: (hit.payload as Record<string, unknown>) ?? {},
      }));

      console.log(`🔍 Qdrant 搜索返回 ${results.length} 个结果`);

      // 可选：打印搜索返回的前几条结果（用于确认 RAG/向量检索是否生效）
      // 开关：QDRANT_SEARCH_LOG=true/1 或 QDRANT_SEARCH_LOG_TOPN=数字
      return results;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 向量搜索失败: ${message}`);
      return [];
    }
  }

  /**
   * 删除向量
   */
  async deleteVectors(ids: Array<string | number>): Promise<boolean> {
    await this.initialize();

    if (ids.length === 0) return true;

    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: ids,
      });

      console.log(`✅ 成功删除 ${ids.length} 个向量`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 删除向量失败: ${message}`);
      return false;
    }
  }

  /**
   * 按 memory_id 删除记忆
   */
  async deleteMemories(memoryIds: string[]): Promise<boolean> {
    await this.initialize();

    if (memoryIds.length === 0) return true;

    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter: {
          should: memoryIds.map((mid) => ({
            key: "memory_id",
            match: { value: mid },
          })),
        },
      });

      console.log(`✅ 成功按 memory_id 删除 ${memoryIds.length} 个向量`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 删除记忆失败: ${message}`);
      return false;
    }
  }

  /**
   * 清空集合
   */
  async clearCollection(): Promise<boolean> {
    try {
      await this.client.deleteCollection(this.collectionName);
      this.initialized = false;
      await this.initialize();

      console.log(`✅ 成功清空 Qdrant 集合: ${this.collectionName}`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 清空集合失败: ${message}`);
      return false;
    }
  }

  /**
   * 获取集合信息
   */
  async getCollectionInfo(): Promise<Record<string, unknown>> {
    await this.initialize();

    try {
      const info = await this.client.getCollection(this.collectionName);

      return {
        name: this.collectionName,
        vectors_count: info.indexed_vectors_count ?? 0,
        points_count: info.points_count ?? 0,
        config: {
          vector_size: this.vectorSize,
          distance: this.distance,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 获取集合信息失败: ${message}`);
      return {};
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Qdrant 健康检查失败: ${message}`);
      return false;
    }
  }
}

// 连接管理器 - 单例模式
const instances = new Map<string, QdrantVectorStore>();

/**
 * 获取 Qdrant 实例（单例）
 */
export function getQdrantInstance(
  config: QdrantConfig = {}
): QdrantVectorStore {
  const key = `${config.url ?? "local"}_${config.collectionName ?? "default"}`;

  if (!instances.has(key)) {
    instances.set(key, new QdrantVectorStore(config));
  }

  return instances.get(key)!;
}
