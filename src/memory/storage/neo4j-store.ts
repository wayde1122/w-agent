/**
 * Neo4j 图数据库存储实现
 */

import neo4j, { Driver, Session } from 'neo4j-driver';

/**
 * Neo4j 配置选项
 */
export interface Neo4jConfig {
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
  maxConnectionPoolSize?: number;
  connectionTimeout?: number;
}

/**
 * 实体数据
 */
export interface EntityData {
  id: string;
  name: string;
  type: string;
  properties?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * 关系数据
 */
export interface RelationshipData {
  relationship: Record<string, unknown>;
  otherEntity: Record<string, unknown>;
  direction: 'outgoing' | 'incoming';
}

/**
 * Neo4j 图存储类
 */
export class Neo4jGraphStore {
  private driver: Driver;
  private database: string;
  private initialized = false;

  constructor(config: Neo4jConfig = {}) {
    const uri = config.uri ?? process.env.NEO4J_URI ?? 'bolt://localhost:7687';
    const username = config.username ?? process.env.NEO4J_USERNAME ?? 'neo4j';
    const password = config.password ?? process.env.NEO4J_PASSWORD ?? '';
    this.database = config.database ?? process.env.NEO4J_DATABASE ?? 'neo4j';

    // 初始化驱动
    this.driver = neo4j.driver(uri, neo4j.auth.basic(username, password), {
      maxConnectionPoolSize: config.maxConnectionPoolSize ?? 50,
      connectionTimeout: config.connectionTimeout ?? 30000,
    });

    // 检查连接类型
    if (uri.includes('neo4j.io') || uri.includes('aura')) {
      console.log(`✅ 连接到 Neo4j 云服务: ${uri}`);
    } else {
      console.log(`✅ 连接到 Neo4j 服务: ${uri}`);
    }
  }

  /**
   * 初始化索引
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const session = this.driver.session({ database: this.database });

    try {
      // 验证连接
      await this.driver.verifyConnectivity();

      // 创建索引
      const indexes = [
        'CREATE INDEX entity_id_index IF NOT EXISTS FOR (e:Entity) ON (e.id)',
        'CREATE INDEX entity_name_index IF NOT EXISTS FOR (e:Entity) ON (e.name)',
        'CREATE INDEX entity_type_index IF NOT EXISTS FOR (e:Entity) ON (e.type)',
        'CREATE INDEX memory_id_index IF NOT EXISTS FOR (m:Memory) ON (m.id)',
        'CREATE INDEX memory_type_index IF NOT EXISTS FOR (m:Memory) ON (m.memory_type)',
      ];

      for (const indexQuery of indexes) {
        try {
          await session.run(indexQuery);
        } catch {
          // 索引可能已存在，忽略
        }
      }

      console.log('✅ Neo4j 索引创建完成');
      this.initialized = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Neo4j 初始化失败: ${message}`);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * 获取会话
   */
  private getSession(): Session {
    return this.driver.session({ database: this.database });
  }

  /**
   * 添加实体节点
   */
  async addEntity(
    entityId: string,
    name: string,
    entityType: string,
    properties: Record<string, unknown> = {}
  ): Promise<boolean> {
    await this.initialize();

    const session = this.getSession();

    try {
      const props = {
        ...properties,
        id: entityId,
        name,
        type: entityType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const query = `
        MERGE (e:Entity {id: $entityId})
        SET e += $properties
        RETURN e
      `;

      const result = await session.run(query, { entityId, properties: props });

      if (result.records.length > 0) {
        console.log(`✅ 添加实体: ${name} (${entityType})`);
        return true;
      }
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 添加实体失败: ${message}`);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 添加实体间关系
   */
  async addRelationship(
    fromEntityId: string,
    toEntityId: string,
    relationshipType: string,
    properties: Record<string, unknown> = {}
  ): Promise<boolean> {
    await this.initialize();

    const session = this.getSession();

    try {
      const props = {
        ...properties,
        type: relationshipType,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 注意：动态关系类型需要用字符串拼接
      const query = `
        MATCH (from:Entity {id: $fromId})
        MATCH (to:Entity {id: $toId})
        MERGE (from)-[r:${relationshipType}]->(to)
        SET r += $properties
        RETURN r
      `;

      const result = await session.run(query, {
        fromId: fromEntityId,
        toId: toEntityId,
        properties: props,
      });

      if (result.records.length > 0) {
        console.log(`✅ 添加关系: ${fromEntityId} -${relationshipType}-> ${toEntityId}`);
        return true;
      }
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 添加关系失败: ${message}`);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 查找相关实体
   */
  async findRelatedEntities(
    entityId: string,
    options: {
      relationshipTypes?: string[];
      maxDepth?: number;
      limit?: number;
    } = {}
  ): Promise<Array<EntityData & { distance: number; relationshipPath: string[] }>> {
    await this.initialize();

    const { relationshipTypes, maxDepth = 2, limit = 50 } = options;
    const session = this.getSession();

    try {
      // 构建关系类型过滤
      let relFilter = '';
      if (relationshipTypes && relationshipTypes.length > 0) {
        relFilter = `:${relationshipTypes.join('|')}`;
      }

      const query = `
        MATCH path = (start:Entity {id: $entityId})-[r${relFilter}*1..${maxDepth}]-(related:Entity)
        WHERE start.id <> related.id
        RETURN DISTINCT related,
               length(path) as distance,
               [rel in relationships(path) | type(rel)] as relationship_path
        ORDER BY distance, related.name
        LIMIT $limit
      `;

      const result = await session.run(query, { entityId, limit: neo4j.int(limit) });

      const entities = result.records.map((record) => {
        const entity = record.get('related').properties;
        return {
          ...entity,
          distance: record.get('distance').toNumber(),
          relationshipPath: record.get('relationship_path'),
        };
      });

      console.log(`🔍 找到 ${entities.length} 个相关实体`);
      return entities;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 查找相关实体失败: ${message}`);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 按名称搜索实体
   */
  async searchEntitiesByName(
    namePattern: string,
    options: {
      entityTypes?: string[];
      limit?: number;
    } = {}
  ): Promise<EntityData[]> {
    await this.initialize();

    const { entityTypes, limit = 20 } = options;
    const session = this.getSession();

    try {
      let typeFilter = '';
      const params: Record<string, unknown> = {
        pattern: `(?i).*${namePattern}.*`,
        limit: neo4j.int(limit),
      };

      if (entityTypes && entityTypes.length > 0) {
        typeFilter = 'AND e.type IN $types';
        params.types = entityTypes;
      }

      const query = `
        MATCH (e:Entity)
        WHERE e.name =~ $pattern ${typeFilter}
        RETURN e
        ORDER BY e.name
        LIMIT $limit
      `;

      const result = await session.run(query, params);

      const entities = result.records.map((record) => record.get('e').properties);

      console.log(`🔍 按名称搜索到 ${entities.length} 个实体`);
      return entities;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 按名称搜索实体失败: ${message}`);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 获取实体的所有关系
   */
  async getEntityRelationships(entityId: string): Promise<RelationshipData[]> {
    await this.initialize();

    const session = this.getSession();

    try {
      const query = `
        MATCH (e:Entity {id: $entityId})-[r]-(other:Entity)
        RETURN r, other,
               CASE WHEN startNode(r).id = $entityId THEN 'outgoing' ELSE 'incoming' END as direction
      `;

      const result = await session.run(query, { entityId });

      return result.records.map((record) => ({
        relationship: record.get('r').properties,
        otherEntity: record.get('other').properties,
        direction: record.get('direction') as 'outgoing' | 'incoming',
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 获取实体关系失败: ${message}`);
      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * 删除实体及其所有关系
   */
  async deleteEntity(entityId: string): Promise<boolean> {
    await this.initialize();

    const session = this.getSession();

    try {
      const query = `
        MATCH (e:Entity {id: $entityId})
        DETACH DELETE e
      `;

      const result = await session.run(query, { entityId });
      const summary = result.summary;
      const deletedCount = summary.counters.updates().nodesDeleted;

      console.log(`✅ 删除实体: ${entityId} (删除 ${deletedCount} 个节点)`);
      return deletedCount > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 删除实体失败: ${message}`);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<boolean> {
    const session = this.getSession();

    try {
      const query = 'MATCH (n) DETACH DELETE n';
      const result = await session.run(query);
      const summary = result.summary;
      const deletedNodes = summary.counters.updates().nodesDeleted;
      const deletedRels = summary.counters.updates().relationshipsDeleted;

      console.log(`✅ 清空 Neo4j 数据库: 删除 ${deletedNodes} 个节点, ${deletedRels} 个关系`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 清空数据库失败: ${message}`);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 获取统计信息
   */
  async getStats(): Promise<Record<string, number>> {
    const session = this.getSession();

    try {
      const queries: Record<string, string> = {
        total_nodes: 'MATCH (n) RETURN count(n) as count',
        total_relationships: 'MATCH ()-[r]->() RETURN count(r) as count',
        entity_nodes: 'MATCH (n:Entity) RETURN count(n) as count',
        memory_nodes: 'MATCH (n:Memory) RETURN count(n) as count',
      };

      const stats: Record<string, number> = {};

      for (const [key, query] of Object.entries(queries)) {
        const result = await session.run(query);
        const record = result.records[0];
        stats[key] = record ? record.get('count').toNumber() : 0;
      }

      return stats;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ 获取统计信息失败: ${message}`);
      return {};
    } finally {
      await session.close();
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<boolean> {
    const session = this.getSession();

    try {
      const result = await session.run('RETURN 1 as health');
      const record = result.records[0];
      return record?.get('health').toNumber() === 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`❌ Neo4j 健康检查失败: ${message}`);
      return false;
    } finally {
      await session.close();
    }
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    await this.driver.close();
  }
}

// 单例实例
let neo4jInstance: Neo4jGraphStore | null = null;

/**
 * 获取 Neo4j 实例（单例）
 */
export function getNeo4jInstance(config?: Neo4jConfig): Neo4jGraphStore {
  if (!neo4jInstance) {
    neo4jInstance = new Neo4jGraphStore(config);
  }
  return neo4jInstance;
}
