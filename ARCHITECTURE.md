# ARCHITECTURE

本文面向想理解“这个框架怎么拼起来”的读者：核心模块划分、主要数据流、以及记忆/RAG/工具系统如何协作。

## 设计目标（思路）

- **TypeScript 优先**：核心逻辑与示例均以 TS 编写，便于作为库使用或二次开发。
- **LLM 提供商解耦**：通过 OpenAI SDK 的兼容接口支持多家服务（只要兼容 OpenAI API 形态）。
- **工具调用可插拔**：工具定义与注册独立，Agent 可选择不同工具编排策略。
- **记忆系统分层**：短期（working）与长期（episodic/semantic）分开；长期可选接入向量库/图数据库。

## 模块总览

代码入口及主要目录：

```
src/
  core/        Agent 基类、LLM 客户端、消息与配置
  agents/      多种 Agent 策略实现（Simple / ReAct / PlanSolve / FunctionCall / Memory）
  tools/       工具基类、注册表、内置工具
  memory/      记忆系统：manager + 多类型记忆 + 存储适配（Qdrant/Neo4j/Embedding）
```

## 核心数据流

以 `MemoryAgent.run(input)` 为例（省略错误处理）：

1. **检索上下文**
   - 从记忆系统检索与 `input` 相关的记忆（可选：向量检索）
   - （可选）从知识图谱检索相关实体/关系
2. **构造增强提示词**
   - System prompt +（相关记忆/相关知识）+ 对话历史 + 当前用户输入
3. **调用 LLM**
   - 不启用工具：直接 `llm.invoke(messages)`
   - 启用工具：先让模型产出工具调用文本，再由框架执行并把结果回填
4. **写回记忆**
   - 将本轮对话按重要性规则写入 episodic/semantic 等（取决于实现与阈值）

## Agent 体系

### `core/agent.ts`

- 定义 Agent 通用生命周期：名称、系统提示词、历史消息、以及统一的 `run()` 形态。

### `agents/*`

- **`SimpleAgent`**：最简单对话循环，可选工具调用。
- **`ReActAgent`**：Thought-Action-Observation 风格（推理-行动-观察）。
- **`PlanSolveAgent`**：先计划再执行再总结的分段策略。
- **`FunctionCallAgent`**：利用 OpenAI 原生 function calling 的 schema 与调用流程。
- **`MemoryAgent`**：在对话循环中引入记忆/RAG/知识图谱检索与写回。

## 工具系统

### 组成

- **`Tool` 基类**：定义工具名、描述、参数解析与执行接口。
- **`ToolRegistry`**：注册工具、输出工具描述、以及在运行时按名称执行工具。
- **内置工具**：例如 `CalculatorTool`、`SearchTool` 等（位于 `src/tools/builtin/`）。

### 工具调用形态

当前实现里（以 `MemoryAgent` 为例）使用文本标记解析形态：

- 模型输出：`[TOOL_CALL:工具名:参数]`
- 框架解析并执行，然后把结果替换回响应文本中

这是一种“低依赖、可观测”的方式，适合演示与快速扩展。

## 记忆系统与 RAG

### MemoryManager：统一入口

`MemoryManager` 负责：

- 统一 `addMemory()` / `retrieveMemories()` / `getStats()` 等接口
- 协调不同记忆类型（working/episodic/semantic）
- 决定是否启用向量存储（Qdrant）与图存储（Neo4j）

### 记忆类型

- **WorkingMemory**：短期缓存（通常不持久化），用于近几轮上下文策略。
- **EpisodicMemory**：事件/对话片段；可选写入 Qdrant 以支持语义检索。
- **SemanticMemory**：知识性内容；可选混合：
  - Qdrant：语义相似度
  - Neo4j：实体与关系（知识图谱）

### Embedding

`memory/storage/embedding.ts` 提供 embedding 适配：

- `dashscope` / `openai`：走兼容接口
- `simple`：本地兜底（便于无 key 环境快速跑通）

### Qdrant / Neo4j

- `QdrantVectorStore`：负责集合初始化、upsert、search、delete、healthCheck 等。
- `Neo4jGraphStore`：负责实体/关系的写入与查询（知识图谱）。

## 配置（环境变量）

建议以 `env.example` 为准。常用：

- **LLM**
  - `LLM_MODEL_ID`
  - `LLM_API_KEY`
  - `LLM_BASE_URL`
- **Embedding**
  - `EMBED_MODEL_TYPE`（`dashscope | openai | simple`）
  - `EMBED_MODEL_NAME`
  - `EMBED_API_KEY`
  - `EMBED_BASE_URL`
- **Qdrant**
  - `QDRANT_URL`
  - `QDRANT_API_KEY`（如需）
- **Neo4j**
  - `NEO4J_URI`
  - `NEO4J_USERNAME`
  - `NEO4J_PASSWORD`

