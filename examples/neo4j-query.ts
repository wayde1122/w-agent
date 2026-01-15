/**
 * Neo4j 数据库查询工具
 *
 * 运行命令：npx tsx examples/neo4j-query.ts
 *
 * 可以查询数据库内容，也可以添加测试数据
 */

import { config } from "dotenv";
config();

import neo4jDriver, { Driver, Session } from "neo4j-driver";

// 从环境变量获取配置
const NEO4J_URI = process.env.NEO4J_URI ?? "bolt://localhost:7687";
const NEO4J_USERNAME = process.env.NEO4J_USERNAME ?? "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD ?? "";

async function main() {
  console.log("🔍 Neo4j 数据库查询工具\n");
  console.log("=".repeat(50));
  console.log(`连接: ${NEO4J_URI}`);

  // 创建驱动
  const driver: Driver = neo4jDriver.driver(
    NEO4J_URI,
    neo4jDriver.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
  );

  try {
    // 验证连接
    await driver.verifyConnectivity();
    console.log("✅ 连接成功\n");

    // 获取操作参数
    const action = process.argv[2] ?? "stats";

    switch (action) {
      case "stats":
        await showStats(driver);
        break;
      case "nodes":
        await showAllNodes(driver);
        break;
      case "relationships":
      case "rels":
        await showAllRelationships(driver);
        break;
      case "query":
        const cypher = process.argv[3];
        if (!cypher) {
          console.log(
            '用法: npx tsx examples/neo4j-query.ts query "MATCH (n) RETURN n LIMIT 10"'
          );
        } else {
          await runCypher(driver, cypher);
        }
        break;
      case "seed":
        await seedTestData(driver);
        break;
      case "clear":
        await clearDatabase(driver);
        break;
      case "help":
      default:
        showHelp();
    }
  } catch (error) {
    console.error("❌ 错误:", error);
  } finally {
    await driver.close();
    console.log("\n✅ 连接已关闭");
  }
}

/**
 * 显示帮助
 */
function showHelp() {
  console.log(`
用法: npx tsx examples/neo4j-query.ts <命令>

命令:
  stats           显示数据库统计信息 (默认)
  nodes           显示所有节点
  relationships   显示所有关系
  rels            同 relationships
  query "<cypher>" 执行自定义 Cypher 查询
  seed            添加测试数据
  clear           清空数据库
  help            显示帮助

示例:
  npx tsx examples/neo4j-query.ts stats
  npx tsx examples/neo4j-query.ts nodes
  npx tsx examples/neo4j-query.ts query "MATCH (n:Concept) RETURN n"
  npx tsx examples/neo4j-query.ts seed
`);
}

/**
 * 显示统计信息
 */
async function showStats(driver: Driver) {
  const session = driver.session();
  try {
    console.log("📊 数据库统计:\n");

    // 节点数量
    const nodeResult = await session.run("MATCH (n) RETURN count(n) as count");
    const nodeCount = nodeResult.records[0]?.get("count")?.toNumber?.() ?? 0;
    console.log(`   节点总数: ${nodeCount}`);

    // 关系数量
    const relResult = await session.run(
      "MATCH ()-[r]->() RETURN count(r) as count"
    );
    const relCount = relResult.records[0]?.get("count")?.toNumber?.() ?? 0;
    console.log(`   关系总数: ${relCount}`);

    // 节点标签
    const labelResult = await session.run(
      "CALL db.labels() YIELD label RETURN collect(label) as labels"
    );
    const labels = labelResult.records[0]?.get("labels") ?? [];
    console.log(
      `   节点类型: ${labels.length > 0 ? labels.join(", ") : "(无)"}`
    );

    // 关系类型
    const typeResult = await session.run(
      "CALL db.relationshipTypes() YIELD relationshipType RETURN collect(relationshipType) as types"
    );
    const types = typeResult.records[0]?.get("types") ?? [];
    console.log(`   关系类型: ${types.length > 0 ? types.join(", ") : "(无)"}`);

    // 各类型节点数量
    if (labels.length > 0) {
      console.log("\n   各类型节点数量:");
      for (const label of labels) {
        const countResult = await session.run(
          `MATCH (n:\`${label}\`) RETURN count(n) as count`
        );
        const count = countResult.records[0]?.get("count")?.toNumber?.() ?? 0;
        console.log(`     - ${label}: ${count}`);
      }
    }
  } finally {
    await session.close();
  }
}

/**
 * 显示所有节点
 */
async function showAllNodes(driver: Driver) {
  const session = driver.session();
  try {
    console.log("🏷️ 所有节点:\n");

    const result = await session.run(`
      MATCH (n)
      RETURN labels(n) as labels, properties(n) as props
      ORDER BY labels(n)[0], n.name
      LIMIT 100
    `);

    if (result.records.length === 0) {
      console.log("   (数据库为空)");
      return;
    }

    for (const record of result.records) {
      const labels = record.get("labels");
      const props = record.get("props");
      const name = props.name ?? props.id ?? "(无名称)";
      console.log(`   [${labels.join(", ")}] ${name}`);

      // 显示其他属性
      const otherProps = Object.entries(props).filter(
        ([k]) => k !== "name" && k !== "id"
      );
      if (otherProps.length > 0) {
        for (const [key, value] of otherProps) {
          console.log(`      ${key}: ${JSON.stringify(value)}`);
        }
      }
    }

    console.log(`\n   共 ${result.records.length} 个节点`);
  } finally {
    await session.close();
  }
}

/**
 * 显示所有关系
 */
async function showAllRelationships(driver: Driver) {
  const session = driver.session();
  try {
    console.log("🔗 所有关系:\n");

    const result = await session.run(`
      MATCH (a)-[r]->(b)
      RETURN a.name as from, type(r) as type, b.name as to, properties(r) as props
      ORDER BY type(r), a.name
      LIMIT 100
    `);

    if (result.records.length === 0) {
      console.log("   (无关系)");
      return;
    }

    for (const record of result.records) {
      const from = record.get("from") ?? "(未知)";
      const type = record.get("type");
      const to = record.get("to") ?? "(未知)";
      const props = record.get("props");

      let line = `   ${from} -[${type}]-> ${to}`;
      if (props && Object.keys(props).length > 0) {
        line += ` ${JSON.stringify(props)}`;
      }
      console.log(line);
    }

    console.log(`\n   共 ${result.records.length} 个关系`);
  } finally {
    await session.close();
  }
}

/**
 * 执行自定义 Cypher 查询
 */
async function runCypher(driver: Driver, cypher: string) {
  const session = driver.session();
  try {
    console.log(`📝 执行查询: ${cypher}\n`);

    const result = await session.run(cypher);

    if (result.records.length === 0) {
      console.log("   (无结果)");
      return;
    }

    // 获取列名
    const keys = result.records[0].keys;
    console.log(`   列: ${keys.join(", ")}\n`);

    // 显示结果
    for (const record of result.records) {
      const row: Record<string, unknown> = {};
      for (const key of keys) {
        const value = record.get(key);
        // 处理 Neo4j 节点/关系对象
        if (value && typeof value === "object" && "properties" in value) {
          row[key] = value.properties;
        } else {
          row[key] = value;
        }
      }
      console.log(`   ${JSON.stringify(row)}`);
    }

    console.log(`\n   共 ${result.records.length} 条结果`);
  } finally {
    await session.close();
  }
}

/**
 * 添加测试数据
 */
async function seedTestData(driver: Driver) {
  const session = driver.session();
  try {
    console.log("🌱 添加测试数据...\n");

    // 添加概念节点
    await session.run(`
      CREATE (ai:Concept {id: 'ai', name: '人工智能', description: '让计算机模拟人类智能的技术'})
      CREATE (ml:Concept {id: 'ml', name: '机器学习', description: '从数据中学习的算法'})
      CREATE (dl:Concept {id: 'dl', name: '深度学习', description: '使用神经网络的机器学习'})
      CREATE (nlp:Concept {id: 'nlp', name: '自然语言处理', description: '处理人类语言的技术'})
      CREATE (cv:Concept {id: 'cv', name: '计算机视觉', description: '让计算机理解图像的技术'})
      
      CREATE (ml)-[:SUBSET_OF]->(ai)
      CREATE (dl)-[:SUBSET_OF]->(ml)
      CREATE (nlp)-[:BRANCH_OF]->(ai)
      CREATE (cv)-[:BRANCH_OF]->(ai)
      CREATE (dl)-[:ENABLES]->(nlp)
      CREATE (dl)-[:ENABLES]->(cv)
    `);

    console.log("   ✅ 添加了 5 个概念节点");
    console.log("   ✅ 添加了 6 个关系");

    // 添加应用节点
    await session.run(`
      CREATE (chatbot:Application {id: 'chatbot', name: '聊天机器人', description: '对话式AI应用'})
      CREATE (imgrecog:Application {id: 'imgrecog', name: '图像识别', description: '识别图像内容的应用'})
      
      WITH chatbot, imgrecog
      MATCH (nlp:Concept {id: 'nlp'})
      MATCH (cv:Concept {id: 'cv'})
      CREATE (nlp)-[:USED_IN]->(chatbot)
      CREATE (cv)-[:USED_IN]->(imgrecog)
    `);

    console.log("   ✅ 添加了 2 个应用节点");
    console.log("   ✅ 添加了 2 个关系");

    console.log("\n✅ 测试数据添加完成");
  } finally {
    await session.close();
  }
}

/**
 * 清空数据库
 */
async function clearDatabase(driver: Driver) {
  const session = driver.session();
  try {
    console.log("🗑️ 清空数据库...\n");

    const result = await session.run(
      "MATCH (n) DETACH DELETE n RETURN count(n) as count"
    );
    const count = result.records[0]?.get("count")?.toNumber?.() ?? 0;

    console.log(`   ✅ 删除了 ${count} 个节点及其关系`);
  } finally {
    await session.close();
  }
}

// 执行
main().catch(console.error);
