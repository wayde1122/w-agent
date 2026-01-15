/**
 * 数据库配置管理
 * 支持 Qdrant 向量数据库和 Neo4j 图数据库的配置
 */

import { z } from 'zod';
import { config as loadEnv } from 'dotenv';

// 加载环境变量
loadEnv();

/**
 * Qdrant 配置 Schema
 */
export const QdrantConfigSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string().optional(),
  collectionName: z.string().default('hello_agents_vectors'),
  vectorSize: z.number().default(1024),
  distance: z.enum(['Cosine', 'Dot', 'Euclid']).default('Cosine'),
  timeout: z.number().default(30000),
});

export type QdrantConfig = z.infer<typeof QdrantConfigSchema>;

/**
 * Neo4j 配置 Schema
 */
export const Neo4jConfigSchema = z.object({
  uri: z.string().default('bolt://localhost:7687'),
  username: z.string().default('neo4j'),
  password: z.string().default(''),
  database: z.string().default('neo4j'),
  maxConnectionPoolSize: z.number().default(50),
  connectionTimeout: z.number().default(30000),
});

export type Neo4jConfig = z.infer<typeof Neo4jConfigSchema>;

/**
 * Embedding 配置 Schema
 */
export const EmbeddingConfigSchema = z.object({
  modelType: z.enum(['dashscope', 'openai', 'simple']).default('dashscope'),
  modelName: z.string().optional(),
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  dimensions: z.number().default(1024),
});

export type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

/**
 * 数据库配置类
 */
export class DatabaseConfig {
  public qdrant: QdrantConfig;
  public neo4j: Neo4jConfig;
  public embedding: EmbeddingConfig;

  constructor(options?: {
    qdrant?: Partial<QdrantConfig>;
    neo4j?: Partial<Neo4jConfig>;
    embedding?: Partial<EmbeddingConfig>;
  }) {
    this.qdrant = QdrantConfigSchema.parse(options?.qdrant ?? {});
    this.neo4j = Neo4jConfigSchema.parse(options?.neo4j ?? {});
    this.embedding = EmbeddingConfigSchema.parse(options?.embedding ?? {});
  }

  /**
   * 从环境变量创建配置
   */
  static fromEnv(): DatabaseConfig {
    return new DatabaseConfig({
      qdrant: {
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
        collectionName: process.env.QDRANT_COLLECTION ?? 'hello_agents_vectors',
        vectorSize: parseInt(process.env.QDRANT_VECTOR_SIZE ?? '1024', 10),
        distance: (process.env.QDRANT_DISTANCE as 'Cosine' | 'Dot' | 'Euclid') ?? 'Cosine',
        timeout: parseInt(process.env.QDRANT_TIMEOUT ?? '30000', 10),
      },
      neo4j: {
        uri: process.env.NEO4J_URI ?? 'bolt://localhost:7687',
        username: process.env.NEO4J_USERNAME ?? 'neo4j',
        password: process.env.NEO4J_PASSWORD ?? '',
        database: process.env.NEO4J_DATABASE ?? 'neo4j',
        maxConnectionPoolSize: parseInt(process.env.NEO4J_MAX_CONNECTION_POOL_SIZE ?? '50', 10),
        connectionTimeout: parseInt(process.env.NEO4J_CONNECTION_TIMEOUT ?? '30000', 10),
      },
      embedding: {
        modelType:
          (process.env.EMBED_MODEL_TYPE as 'dashscope' | 'openai' | 'simple') ?? 'dashscope',
        modelName: process.env.EMBED_MODEL_NAME,
        apiKey: process.env.EMBED_API_KEY,
        baseURL: process.env.EMBED_BASE_URL,
        dimensions: parseInt(process.env.EMBED_DIMENSIONS ?? '1024', 10),
      },
    });
  }

  /**
   * 获取 Qdrant 配置
   */
  getQdrantConfig(): QdrantConfig {
    return { ...this.qdrant };
  }

  /**
   * 获取 Neo4j 配置
   */
  getNeo4jConfig(): Neo4jConfig {
    return { ...this.neo4j };
  }

  /**
   * 获取 Embedding 配置
   */
  getEmbeddingConfig(): EmbeddingConfig {
    return { ...this.embedding };
  }

  /**
   * 验证数据库连接
   */
  async validateConnections(): Promise<{ qdrant: boolean; neo4j: boolean }> {
    const results = { qdrant: false, neo4j: false };

    // 验证 Qdrant
    try {
      const { QdrantVectorStore } = await import('../memory/storage/qdrant-store.js');
      const qdrantStore = new QdrantVectorStore(this.qdrant);
      results.qdrant = await qdrantStore.healthCheck();
      console.log(`✅ Qdrant 连接验证: ${results.qdrant ? '成功' : '失败'}`);
    } catch (e) {
      console.error(`❌ Qdrant 连接验证失败: ${e}`);
    }

    // 验证 Neo4j
    try {
      const { Neo4jGraphStore } = await import('../memory/storage/neo4j-store.js');
      const neo4jStore = new Neo4jGraphStore(this.neo4j);
      results.neo4j = await neo4jStore.healthCheck();
      console.log(`✅ Neo4j 连接验证: ${results.neo4j ? '成功' : '失败'}`);
      await neo4jStore.close();
    } catch (e) {
      console.error(`❌ Neo4j 连接验证失败: ${e}`);
    }

    return results;
  }
}

// 全局配置实例
let globalDbConfig: DatabaseConfig | null = null;

/**
 * 获取数据库配置（单例）
 */
export function getDatabaseConfig(): DatabaseConfig {
  if (!globalDbConfig) {
    globalDbConfig = DatabaseConfig.fromEnv();
  }
  return globalDbConfig;
}

/**
 * 更新数据库配置
 */
export function updateDatabaseConfig(options: {
  qdrant?: Partial<QdrantConfig>;
  neo4j?: Partial<Neo4jConfig>;
  embedding?: Partial<EmbeddingConfig>;
}): void {
  const current = getDatabaseConfig();

  if (options.qdrant) {
    current.qdrant = QdrantConfigSchema.parse({ ...current.qdrant, ...options.qdrant });
  }
  if (options.neo4j) {
    current.neo4j = Neo4jConfigSchema.parse({ ...current.neo4j, ...options.neo4j });
  }
  if (options.embedding) {
    current.embedding = EmbeddingConfigSchema.parse({ ...current.embedding, ...options.embedding });
  }

  console.log('✅ 数据库配置已更新');
}
