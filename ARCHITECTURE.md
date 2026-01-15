# ARCHITECTURE

本文面向想理解"这个框架怎么拼起来"的读者：核心模块划分、主要数据流、以及记忆/RAG/工具系统如何协作。

## 设计目标

- **TypeScript 优先**：核心逻辑与示例均以 TS 编写，便于作为库使用或二次开发。
- **LLM 提供商解耦**：通过 OpenAI SDK 的兼容接口支持多家服务（只要兼容 OpenAI API 形态）。
- **工具调用可插拔**：工具定义与注册独立，Agent 可选择不同工具编排策略。
- **记忆系统分层**：短期（working）与长期（episodic/semantic）分开；长期可选接入向量库/图数据库。
- **日志可观测**：默认静默，按需注入 Logger 实现可观测。

## 模块总览

```
src/
├── core/        Agent 基类、LLM 客户端、消息、配置、日志、工具调用循环
├── agents/      多种 Agent 策略实现
├── tools/       工具基类、注册表、执行器、内置工具
└── memory/      记忆系统：manager + 多类型记忆 + 存储适配
```

## 架构图

```
┌─────────────────────────────────────────────────────────────────────┐
│                           User Input                                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                              Agent                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │ UnifiedAgent│  │ SimpleAgent │  │ ReActAgent  │  │ MemoryAgent │ │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
          │                    │                    │
          ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐
│       LLM       │  │   Tool System   │  │     Memory System       │
│  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌─────────────────┐   │
│  │ OpenAI SDK│  │  │  │ToolExecutor│  │  │  │ MemoryManager   │   │
│  └───────────┘  │  │  └───────────┘  │  │  └─────────────────┘   │
│        │        │  │        │        │  │          │             │
│        ▼        │  │        ▼        │  │          ▼             │
│  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌─────┬─────┬─────┐  │
│  │ Providers │  │  │  │ToolRegistry│ │  │  │Work │Episo│Seman│  │
│  │ OpenAI    │  │  │  └───────────┘  │  │  │ing  │dic  │tic  │  │
│  │ DeepSeek  │  │  │        │        │  │  └─────┴─────┴─────┘  │
│  │ DashScope │  │  │        ▼        │  │          │             │
│  │ Ollama... │  │  │  ┌───────────┐  │  │          ▼             │
│  └───────────┘  │  │  │ Built-in  │  │  │  ┌─────────────────┐  │
└─────────────────┘  │  │ Calculator│  │  │  │    Storage      │  │
                     │  │ Search    │  │  │  │ ┌─────┬───────┐ │  │
                     │  └───────────┘  │  │  │ │Qdrant│Neo4j │ │  │
                     └─────────────────┘  │  │ └─────┴───────┘ │  │
                                          │  └─────────────────┘  │
                                          └───────────────────────┘
```

## 核心数据流

### UnifiedAgent 执行流程

```
User Input
    │
    ▼
┌─────────────────────────────────┐
│   1. Build Messages             │
│   - System Prompt               │
│   - History Messages            │
│   - Current Input               │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│   2. Get Tool Schemas           │
│   - From ToolRegistry           │
│   - Convert to OpenAI Format    │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│   3. Tool Calling Loop          │◄────────────┐
│   - Call LLM with tools         │             │
│   - Parse tool calls            │             │
│   - Execute tools               │             │
│   - Append results to messages  │─────────────┘
│   - Repeat until done or max    │   (if more tool calls)
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│   4. Return Result              │
│   - Final text                  │
│   - Trace (if keepTrace=true)   │
│   - Steps used                  │
└─────────────────────────────────┘
```

### MemoryAgent 执行流程

```
User Input
    │
    ▼
┌─────────────────────────────────┐
│   1. Retrieve Context           │
│   - Search MemoryManager        │
│   - Vector search (Qdrant)      │
│   - Graph query (Neo4j)         │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│   2. Build Enhanced Prompt      │
│   - System Prompt               │
│   - Retrieved Memories          │
│   - Knowledge Graph Context     │
│   - Conversation History        │
│   - Current Input               │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│   3. Call LLM                   │
│   - With or without tools       │
│   - Parse tool calls if any     │
│   - Execute and get response    │
└─────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────┐
│   4. Write Back Memory          │
│   - Save conversation           │
│   - Update episodic/semantic    │
│   - Based on importance rules   │
└─────────────────────────────────┘
    │
    ▼
    Response
```

## Agent 体系

### 基类：`core/agent.ts`

定义 Agent 通用生命周期：

```typescript
abstract class Agent {
  readonly name: string;
  readonly llm: HelloAgentsLLM;
  readonly systemPrompt?: string;
  readonly config: Config;
  readonly logger: Logger;
  protected history: Message[];

  abstract run(input: string): Promise<string>;
  addMessage(message: Message): void;
  clearHistory(): void;
  getHistory(): Message[];
}
```

### Agent 实现

| Agent | 文件 | 特点 |
|-------|------|------|
| `UnifiedAgent` | `unified-agent.ts` | **推荐**。基于 ToolExecutor，支持原生 tool calling 和文本协议 |
| `SimpleAgent` | `simple-agent.ts` | 最简单的对话循环，可选工具调用 |
| `ReActAgent` | `react-agent.ts` | Thought-Action-Observation 风格（推理-行动-观察） |
| `PlanSolveAgent` | `plan-solve-agent.ts` | 先计划再执行再总结的分段策略 |
| `FunctionCallAgent` | `function-call-agent.ts` | 利用 OpenAI 原生 function calling |
| `MemoryAgent` | `memory-agent.ts` | 集成记忆/RAG/知识图谱的完整 Agent |

## 工具系统

### 组件

```
tools/
├── base.ts       # Tool, SimpleTool, ExpandableTool 基类
├── registry.ts   # ToolRegistry - 工具注册和管理
├── executor.ts   # ToolExecutor - 统一执行接口
└── builtin/      # 内置工具
    ├── calculator.ts
    └── search.ts
```

### Tool 基类

```typescript
abstract class Tool {
  readonly name: string;
  readonly description: string;

  abstract run(parameters: ToolParameters): Promise<string> | string;
  abstract getParameters(): ToolParameter[];

  // 生成 OpenAI Function Calling Schema
  toOpenAISchema(): FunctionSchema;
}
```

### ToolExecutor

统一的工具执行器，支持：

- 按名称执行工具
- 错误处理和日志
- 与 tool-calling-loop 配合实现多轮调用

```typescript
const executor = createToolExecutor({
  registry: toolRegistry,
  logger: logger,
});

const result = await executor.execute('calculator', { input: '1+1' });
```

### tool-calling-loop

实现 LLM 工具调用的完整循环：

1. 调用 LLM（带工具 schema）
2. 解析工具调用请求
3. 执行工具
4. 将结果追加到消息
5. 重复直到 LLM 不再调用工具或达到最大步数

```typescript
const result = await runToolCallingLoop(messages, toolSchemas, {
  llm,
  executor,
  maxSteps: 5,
  logger,
  useNativeToolCalling: true,
});
```

## 日志系统

### Logger 接口

```typescript
interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}
```

### 内置实现

| Logger | 说明 |
|--------|------|
| `SilentLogger` | 默认，不输出任何日志 |
| `ConsoleLogger` | 输出到控制台，支持级别过滤 |

### 使用方式

```typescript
import { ConsoleLogger, createLogger } from 'w-agent';

// 创建 Logger
const logger = new ConsoleLogger('DEBUG');
// 或
const logger = createLogger('INFO');

// 注入到 LLM 和 Agent
const llm = new HelloAgentsLLM({ logger });
const agent = new UnifiedAgent({ name: 'Bot', llm, logger });
```

## 记忆系统与 RAG

### MemoryManager：统一入口

负责：

- 统一 `addMemory()` / `retrieveMemories()` / `getStats()` 等接口
- 协调不同记忆类型（working/episodic/semantic）
- 决定是否启用向量存储（Qdrant）与图存储（Neo4j）

### 记忆类型

| 类型 | 说明 | 存储 |
|------|------|------|
| `WorkingMemory` | 短期缓存，近几轮上下文 | 内存 |
| `EpisodicMemory` | 事件/对话片段 | 可选 Qdrant |
| `SemanticMemory` | 知识性内容 | Qdrant + Neo4j |

### 记忆流程

```
Add Memory
    │
    ├─► WorkingMemory (短期)
    │
    ├─► EpisodicMemory
    │       │
    │       └─► Qdrant (向量检索)
    │
    └─► SemanticMemory
            │
            ├─► Qdrant (语义相似度)
            │
            └─► Neo4j (实体关系)
```

### Embedding

`memory/storage/embedding.ts` 提供 embedding 适配：

| 类型 | 说明 |
|------|------|
| `openai` | OpenAI Embedding API |
| `dashscope` | 阿里云 DashScope |
| `simple` | 本地兜底（便于无 key 环境跑通） |

### Qdrant / Neo4j

- `QdrantVectorStore`：集合初始化、upsert、search、delete、healthCheck
- `Neo4jGraphStore`：实体/关系的写入与查询（知识图谱）

## 配置（环境变量）

建议以 `env.example` 为准。常用：

### LLM

```env
LLM_MODEL_ID=gpt-4o-mini
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
```

### Embedding

```env
EMBED_MODEL_TYPE=dashscope | openai | simple
EMBED_MODEL_NAME=text-embedding-v3
EMBED_API_KEY=your-embed-api-key
EMBED_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
```

### Qdrant

```env
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-qdrant-api-key
```

### Neo4j

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
```

## 扩展指南

### 添加新的 Agent

1. 继承 `Agent` 基类
2. 实现 `run(input: string): Promise<string>` 方法
3. 在 `src/agents/index.ts` 中导出
4. 在 `src/index.ts` 中导出

### 添加新的工具

1. 继承 `Tool` 基类或使用 `SimpleTool`
2. 实现 `run()` 和 `getParameters()` 方法
3. 注册到 `ToolRegistry`

### 添加新的记忆存储

1. 实现相应的存储接口
2. 在 `MemoryManager` 中集成
