# w-agent

A TypeScript Agent Framework - Node.js port of HelloAgents

一个功能完整的 AI Agent 框架，支持多种 Agent 模式、工具调用和记忆管理。

## 文档入口

- 快速上手：`QUICKSTART.md`
- 架构与设计：`ARCHITECTURE.md`

## 特性

- **多种 Agent 模式**
  - `SimpleAgent` - 简单对话 Agent，支持可选工具调用
  - `ReActAgent` - 推理与行动结合的 Agent (Thought-Action-Observation)
  - `PlanSolveAgent` - 计划与执行 Agent (Plan-Execute-Summarize)
  - `FunctionCallAgent` - OpenAI 原生函数调用 Agent

- **工具系统**
  - 灵活的工具基类
  - 工具注册表管理
  - 支持可展开工具
  - OpenAI Function Calling Schema 生成

- **记忆系统**
  - 工作记忆 (Working Memory) - 短期上下文
  - 情景记忆 (Episodic Memory) - 事件和经历
  - 语义记忆 (Semantic Memory) - 知识和概念
  - 记忆整合和遗忘机制

- **数据库存储**
  - Qdrant 向量数据库 - 语义搜索和相似度检索
  - Neo4j 图数据库 - 知识图谱和关系推理
  - 多种 Embedding 模型支持 (OpenAI、DashScope、本地)

- **LLM 支持**
  - 基于 OpenAI SDK
  - 支持多种提供商：OpenAI、DeepSeek、通义千问、ModelScope、Kimi、智谱、Ollama、vLLM
  - 自动检测 Provider
  - 流式和非流式响应

## 安装

```bash
npm install
```

## 配置

创建 `.env` 文件配置 LLM：

```env
LLM_MODEL_ID=gpt-3.5-turbo
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1

# Embedding 配置
EMBED_MODEL_TYPE=dashscope
EMBED_MODEL_NAME=text-embedding-v3
EMBED_API_KEY=your-embed-api-key
EMBED_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Qdrant 配置
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-qdrant-api-key

# Neo4j 配置
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
```

或使用特定提供商的环境变量：

```env
OPENAI_API_KEY=sk-xxx
# 或
DEEPSEEK_API_KEY=sk-xxx
# 或
DASHSCOPE_API_KEY=sk-xxx
```

## 快速开始

### SimpleAgent 示例

```typescript
import { HelloAgentsLLM, SimpleAgent } from 'w-agent';

const llm = new HelloAgentsLLM();

const agent = new SimpleAgent({
  name: 'MyBot',
  llm,
  systemPrompt: '你是一个友好的AI助手。',
});

const response = await agent.run('你好！');
console.log(response);
```

### 带工具的 Agent

```typescript
import { HelloAgentsLLM, SimpleAgent, CalculatorTool, ToolRegistry } from 'w-agent';

const llm = new HelloAgentsLLM();
const toolRegistry = new ToolRegistry();
toolRegistry.registerTool(new CalculatorTool());

const agent = new SimpleAgent({
  name: 'CalculatorBot',
  llm,
  toolRegistry,
  enableToolCalling: true,
});

const response = await agent.run('请计算 (15 + 25) * 3');
console.log(response);
```

### ReActAgent 示例

```typescript
import { HelloAgentsLLM, ReActAgent, SearchTool } from 'w-agent';

const llm = new HelloAgentsLLM();

const agent = new ReActAgent({
  name: 'ResearchBot',
  llm,
  maxSteps: 5,
});

agent.addTool(new SearchTool());

const response = await agent.run('什么是机器学习？');
console.log(response);
```

### 记忆系统示例

```typescript
import { MemoryManager } from 'w-agent';

const manager = new MemoryManager({ userId: 'user1' });

// 添加记忆
manager.addMemory('用户喜欢Python编程');
manager.addMemory('今天学习了机器学习', { memoryType: 'episodic' });

// 检索记忆
const memories = manager.retrieveMemories('Python', { limit: 5 });

// 记忆整合
manager.consolidateMemories('working', 'episodic', 0.7);
```

### 向量数据库 (Qdrant) 示例

```typescript
import { QdrantVectorStore, getEmbedding } from 'w-agent';

// 初始化
const qdrant = new QdrantVectorStore({
  collectionName: 'my_collection',
  vectorSize: 1024,
});

const embedder = getEmbedding();

// 添加向量
const texts = ['人工智能', '机器学习', '深度学习'];
const vectors = await embedder.encode(texts);
const metadata = texts.map((text) => ({ text, category: 'AI' }));
await qdrant.addVectors(vectors, metadata);

// 语义搜索
const queryVector = (await embedder.encode('什么是AI？'))[0];
const results = await qdrant.searchSimilar(queryVector, 5);
```

### 图数据库 (Neo4j) 示例

```typescript
import { Neo4jGraphStore } from 'w-agent';

// 初始化
const neo4j = new Neo4jGraphStore();

// 添加实体
await neo4j.addEntity('ai', '人工智能', 'Concept');
await neo4j.addEntity('ml', '机器学习', 'Concept');

// 添加关系
await neo4j.addRelationship('ml', 'ai', 'SUBSET_OF');

// 查找相关实体
const related = await neo4j.findRelatedEntities('ai', { maxDepth: 2 });

// 关闭连接
await neo4j.close();
```

## 项目结构

```
w-agent/
├── src/
│   ├── core/           # 核心模块
│   │   ├── agent.ts    # Agent 基类
│   │   ├── llm.ts      # LLM 客户端
│   │   ├── message.ts  # 消息系统
│   │   ├── config.ts   # 配置管理
│   │   └── exceptions.ts
│   ├── agents/         # Agent 实现
│   │   ├── simple-agent.ts
│   │   ├── react-agent.ts
│   │   ├── plan-solve-agent.ts
│   │   └── function-call-agent.ts
│   ├── tools/          # 工具系统
│   │   ├── base.ts
│   │   ├── registry.ts
│   │   └── builtin/
│   ├── memory/         # 记忆系统
│   │   ├── base.ts
│   │   ├── manager.ts
│   │   ├── types/
│   │   └── storage/    # 数据库存储
│   │       ├── embedding.ts
│   │       ├── qdrant-store.ts
│   │       └── neo4j-store.ts
│   └── index.ts
├── examples/           # 示例代码
├── test/              # 测试
└── package.json
```

## 开发

```bash
# 安装依赖
npm install

# 构建
npm run build

# 运行测试
npm test

# 类型检查
npm run typecheck
```

## 运行示例

```bash
# 编译后运行
npm run build
node dist/examples/simple-agent-demo.js

# 或使用 ts-node
npx ts-node examples/simple-agent-demo.ts
```

## 开源使用建议（GitHub）

- **不要提交 `.env`**：用 `env.example` 做模板，敏感信息只放本地环境。
- **想验证 RAG 是否走到 Qdrant**：运行 MemoryAgent 示例时观察日志 `🔍 Qdrant 搜索返回 X 个结果`。

## License

MIT
