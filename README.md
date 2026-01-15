# w-agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org/)

A TypeScript Agent Framework - Node.js port of HelloAgents

一个功能完整的 AI Agent 框架，支持多种 Agent 模式、工具调用和记忆管理。

## 文档入口

- 快速上手：[QUICKSTART.md](./QUICKSTART.md)
- 架构与设计：[ARCHITECTURE.md](./ARCHITECTURE.md)
- 更新日志：[CHANGELOG.md](./CHANGELOG.md)

## 特性

### 多种 Agent 模式

| Agent               | 描述                                        | 适用场景                   |
| ------------------- | ------------------------------------------- | -------------------------- |
| `UnifiedAgent`      | **推荐** 基于 ToolExecutor 的统一 Agent     | 通用场景，支持多轮工具调用 |
| `SimpleAgent`       | 简单对话 Agent                              | 快速原型，简单对话         |
| `ReActAgent`        | 推理与行动结合 (Thought-Action-Observation) | 需要推理过程的任务         |
| `PlanSolveAgent`    | 计划与执行 (Plan-Execute-Summarize)         | 复杂多步骤任务             |
| `FunctionCallAgent` | OpenAI 原生函数调用                         | 需要原生 function calling  |
| `MemoryAgent`       | 具有记忆和 RAG 功能                         | 需要长期记忆的对话         |

### 工具系统

- 灵活的工具基类（`Tool`、`SimpleTool`、`ExpandableTool`）
- 工具注册表管理（`ToolRegistry`）
- 统一工具执行器（`ToolExecutor`）- 支持多轮工具调用循环
- OpenAI Function Calling Schema 自动生成
- 内置工具：`CalculatorTool`、`SearchTool`（**注意：SearchTool 是 mock 实现**）

### 记忆系统

- **工作记忆** (Working Memory) - 短期上下文
- **情景记忆** (Episodic Memory) - 事件和经历
- **语义记忆** (Semantic Memory) - 知识和概念
- 记忆整合和遗忘机制

### 数据库存储

- **Qdrant** 向量数据库 - 语义搜索和相似度检索
- **Neo4j** 图数据库 - 知识图谱和关系推理
- 多种 Embedding 模型支持 (OpenAI、DashScope、本地)

### LLM 支持

- 基于 OpenAI SDK
- 支持多种提供商：OpenAI、DeepSeek、通义千问、ModelScope、Kimi、智谱、Ollama、vLLM
- 自动检测 Provider
- 流式和非流式响应

### 日志系统

- 可插拔的 Logger 接口
- 内置 `ConsoleLogger` 和 `SilentLogger`
- 支持 DEBUG / INFO / WARN / ERROR 级别
- 默认静默，按需启用

## 安装

```bash
# 本地开发
git clone https://github.com/wayde1122/w-agent.git
cd w-agent
npm install
```

## 配置

创建 `.env` 文件配置 LLM（可从 `env.example` 复制）：

```env
LLM_MODEL_ID=gpt-4o-mini
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1

# Embedding 配置
EMBED_MODEL_TYPE=dashscope
EMBED_MODEL_NAME=text-embedding-v3
EMBED_API_KEY=your-embed-api-key
EMBED_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Qdrant 配置（可选）
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-qdrant-api-key

# Neo4j 配置（可选）
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

### UnifiedAgent 示例（推荐）

```typescript
import {
  HelloAgentsLLM,
  UnifiedAgent,
  CalculatorTool,
  ConsoleLogger,
} from "w-agent";

const llm = new HelloAgentsLLM();
const logger = new ConsoleLogger("INFO"); // 可选：启用日志输出

const agent = new UnifiedAgent({
  name: "SmartBot",
  llm,
  logger,
  maxToolSteps: 5, // 最大工具调用轮数
  useNativeToolCalling: true, // 使用 OpenAI 原生 tool calling
  keepTrace: true, // 保留执行追踪
});

agent.addTool(new CalculatorTool());

// 运行并获取详细结果
const result = await agent.runWithResult("请计算 (15 + 25) * 3");
console.log("答案:", result.text);
console.log("工具调用步数:", result.toolStepsUsed);
if (result.trace) {
  console.log("执行追踪:", result.trace);
}
```

### SimpleAgent 示例

```typescript
import { HelloAgentsLLM, SimpleAgent } from "w-agent";

const llm = new HelloAgentsLLM();

const agent = new SimpleAgent({
  name: "MyBot",
  llm,
  systemPrompt: "你是一个友好的AI助手。",
});

const response = await agent.run("你好！");
console.log(response);
```

### 带工具的 Agent

```typescript
import {
  HelloAgentsLLM,
  SimpleAgent,
  CalculatorTool,
  ToolRegistry,
} from "w-agent";

const llm = new HelloAgentsLLM();
const toolRegistry = new ToolRegistry();
toolRegistry.registerTool(new CalculatorTool());

const agent = new SimpleAgent({
  name: "CalculatorBot",
  llm,
  toolRegistry,
  enableToolCalling: true,
});

const response = await agent.run("请计算 (15 + 25) * 3");
console.log(response);
```

### ReActAgent 示例

```typescript
import { HelloAgentsLLM, ReActAgent, SearchTool } from "w-agent";

const llm = new HelloAgentsLLM();

const agent = new ReActAgent({
  name: "ResearchBot",
  llm,
  maxSteps: 5,
});

// 注意：SearchTool 是 mock 实现，不会真正联网搜索
agent.addTool(new SearchTool());

const response = await agent.run("什么是机器学习？");
console.log(response);
```

### PlanSolveAgent 示例

```typescript
import { HelloAgentsLLM, PlanSolveAgent } from "w-agent";

const llm = new HelloAgentsLLM();

const agent = new PlanSolveAgent({
  name: "PlanBot",
  llm,
});

// 复杂多步骤问题
const question = `
  小明有 500 元。他先花了 20% 买书，
  然后用剩余的钱的一半买了文具，
  最后又花了 50 元吃饭。
  请问小明还剩多少钱？
`;

const response = await agent.run(question);
console.log(response);
```

### FunctionCallAgent 示例

```typescript
import {
  HelloAgentsLLM,
  FunctionCallAgent,
  CalculatorTool,
  SearchTool,
  ToolRegistry,
} from "w-agent";

const llm = new HelloAgentsLLM();
const toolRegistry = new ToolRegistry();
toolRegistry.registerTool(new CalculatorTool());
toolRegistry.registerTool(new SearchTool());

const agent = new FunctionCallAgent({
  name: "FunctionBot",
  llm,
  toolRegistry,
  enableToolCalling: true,
  maxToolIterations: 3,
});

const response = await agent.run("请计算 sqrt(144) + 2^3 的结果");
console.log(response);
```

### MemoryAgent 示例

```typescript
import {
  HelloAgentsLLM,
  MemoryAgent,
  CalculatorTool,
  ToolRegistry,
} from "w-agent";

const llm = new HelloAgentsLLM();
const toolRegistry = new ToolRegistry();
toolRegistry.registerTool(new CalculatorTool());

const agent = new MemoryAgent({
  name: "MemoryBot",
  llm,
  systemPrompt: "你是一个具有记忆能力的智能助手。",
  userId: "user1",
  toolRegistry,
  enableToolCalling: true,
  enableRAG: true, // 启用 RAG 检索
  enableKnowledgeGraph: true, // 启用知识图谱
  ragTopK: 5,
  autoSaveConversation: true,
});

// 添加知识
await agent.addKnowledge(
  "TypeScript 是 JavaScript 的超集，添加了静态类型系统。"
);

// 添加实体和关系
await agent.addEntity("ts", "TypeScript", "Language");
await agent.addEntity("js", "JavaScript", "Language");
await agent.addRelation("ts", "js", "SUPERSET_OF");

// 对话
const response = await agent.run("什么是 TypeScript？");
console.log(response);

// 清理
await agent.close();
```

### 记忆系统示例

```typescript
import { MemoryManager } from "w-agent";

const manager = new MemoryManager({ userId: "user1" });

// 添加记忆
await manager.addMemory("用户喜欢Python编程");
await manager.addMemory("今天学习了机器学习", { memoryType: "episodic" });

// 检索记忆
const memories = await manager.retrieveMemories("Python", { limit: 5 });

// 记忆整合
await manager.consolidateMemories("working", "episodic", 0.7);
```

### 向量数据库 (Qdrant) 示例

```typescript
import { QdrantVectorStore, getEmbedding } from "w-agent";

// 初始化
const qdrant = new QdrantVectorStore({
  collectionName: "my_collection",
  vectorSize: 1024,
});

const embedder = getEmbedding();

// 添加向量
const texts = ["人工智能", "机器学习", "深度学习"];
const vectors = await embedder.encode(texts);
const metadata = texts.map((text) => ({ text, category: "AI" }));
await qdrant.addVectors(vectors, metadata);

// 语义搜索
const queryVector = (await embedder.encode("什么是AI？"))[0];
const results = await qdrant.searchSimilar(queryVector, 5);
```

### 图数据库 (Neo4j) 示例

```typescript
import { Neo4jGraphStore } from "w-agent";

// 初始化
const neo4j = new Neo4jGraphStore();

// 添加实体
await neo4j.addEntity("ai", "人工智能", "Concept");
await neo4j.addEntity("ml", "机器学习", "Concept");

// 添加关系
await neo4j.addRelationship("ml", "ai", "SUBSET_OF");

// 查找相关实体
const related = await neo4j.findRelatedEntities("ai", { maxDepth: 2 });

// 关闭连接
await neo4j.close();
```

## 项目结构

```
w-agent/
├── src/
│   ├── core/                    # 核心模块
│   │   ├── agent.ts             # Agent 基类
│   │   ├── llm.ts               # LLM 客户端
│   │   ├── message.ts           # 消息系统
│   │   ├── config.ts            # 配置管理
│   │   ├── logger.ts            # 日志系统
│   │   ├── tool-calling-loop.ts # 工具调用循环
│   │   ├── database-config.ts   # 数据库配置
│   │   └── exceptions.ts        # 异常定义
│   ├── agents/                  # Agent 实现
│   │   ├── unified-agent.ts     # 统一 Agent（推荐）
│   │   ├── simple-agent.ts      # 简单 Agent
│   │   ├── react-agent.ts       # ReAct Agent
│   │   ├── plan-solve-agent.ts  # 计划执行 Agent
│   │   ├── function-call-agent.ts # 函数调用 Agent
│   │   └── memory-agent.ts      # 记忆 Agent
│   ├── tools/                   # 工具系统
│   │   ├── base.ts              # 工具基类
│   │   ├── registry.ts          # 工具注册表
│   │   ├── executor.ts          # 工具执行器
│   │   └── builtin/             # 内置工具
│   │       ├── calculator.ts
│   │       └── search.ts
│   ├── memory/                  # 记忆系统
│   │   ├── base.ts              # 记忆基类
│   │   ├── manager.ts           # 记忆管理器
│   │   ├── types/               # 记忆类型
│   │   │   ├── working.ts
│   │   │   ├── episodic.ts
│   │   │   └── semantic.ts
│   │   └── storage/             # 数据库存储
│   │       ├── embedding.ts
│   │       ├── qdrant-store.ts
│   │       └── neo4j-store.ts
│   └── index.ts                 # 导出入口
├── examples/                    # 示例代码
├── test/                        # 测试
├── env.example                  # 环境变量模板
├── package.json
├── tsconfig.json
└── vitest.config.ts
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

# 或使用 tsx 直接运行
npx tsx examples/simple-agent-demo.ts

# 交互式对话
npm run chat
# 或
npx tsx examples/chat.ts

# MemoryAgent 交互模式
npx tsx examples/memory-agent-demo.ts --interactive
```

## 自定义工具

### 创建简单工具

```typescript
import { SimpleTool } from "w-agent";

const myTool = new SimpleTool(
  "greet",
  "向用户打招呼",
  [{ name: "name", type: "string", description: "用户名", required: true }],
  (params) => `你好，${params.name}！`
);
```

### 自定义搜索工具

**注意**：内置的 `SearchTool` 是 **mock 实现**，不会真正联网搜索。如需真实搜索，可以通过 `searchFn` 注入自定义实现：

```typescript
import { SearchTool } from "w-agent";

// 方式 1：注入自定义搜索函数
const realSearchTool = new SearchTool({
  searchFn: async (query) => {
    // 调用你的搜索 API（如 SerpAPI、Bing Search API 等）
    const response = await fetch(
      `https://your-search-api.com?q=${encodeURIComponent(query)}`
    );
    const data = await response.json();
    return data.results.map((r: { title: string }) => r.title);
  },
});

// 方式 2：继承 Tool 基类实现完整自定义
import { Tool, ToolParameter, ToolParameters } from "w-agent";

class MySearchTool extends Tool {
  constructor() {
    super("my_search", "使用自定义 API 搜索");
  }

  async run(params: ToolParameters): Promise<string> {
    const query = params.input as string;
    // 你的搜索实现...
    return "搜索结果";
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: "input",
        type: "string",
        description: "搜索关键词",
        required: true,
      },
    ];
  }
}
```

## 日志系统

库默认静默（不输出日志）。如需启用日志，可以注入 Logger：

```typescript
import {
  HelloAgentsLLM,
  UnifiedAgent,
  ConsoleLogger,
  createLogger,
} from "w-agent";

// 方式 1：使用 ConsoleLogger
const logger = new ConsoleLogger("DEBUG"); // 级别：DEBUG | INFO | WARN | ERROR

// 方式 2：使用工厂函数
const logger2 = createLogger("INFO");

const llm = new HelloAgentsLLM({ logger });
const agent = new UnifiedAgent({ name: "Bot", llm, logger });
```

## 错误处理

框架提供了结构化的异常类型：

```typescript
import {
  HelloAgentsError, // 基类
  LLMError, // LLM 调用错误
  AgentError, // Agent 执行错误
  ToolError, // 工具执行错误
  MemoryError, // 记忆系统错误
  ConfigError, // 配置错误
} from "w-agent";

try {
  const response = await agent.run("你好");
} catch (error) {
  if (error instanceof LLMError) {
    console.error("LLM 调用失败:", error.message);
  } else if (error instanceof ToolError) {
    console.error("工具执行失败:", error.message);
  }
}
```

## 开源使用建议（GitHub）

- **不要提交 `.env`**：用 `env.example` 做模板，敏感信息只放本地环境。
- **想验证 RAG 是否走到 Qdrant**：运行 MemoryAgent 示例时观察日志。

## License

[MIT](./LICENSE)
