# QUICKSTART

面向第一次使用本项目的读者：从“能跑起来”到“能验证 RAG/记忆是否生效”，尽量走最短路径。

## 环境要求

- Node.js **>= 18**
- （可选）Docker：用于一键启动 Qdrant/Neo4j

## 1）安装依赖

```bash
npm install
```

## 2）准备环境变量（.env）

推荐从模板复制（避免手敲出错）：

```powershell
Copy-Item .\env.example .\.env -Force
```

然后编辑 `.env`，至少配置 LLM（示例）：

```env
LLM_MODEL_ID=gpt-4o-mini
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.openai.com/v1
```

### Embedding 最省事配置（没有 embedding key 也能跑）

如果你暂时不想配置 embedding 的 key，可以先用内置兜底实现：

```env
EMBED_MODEL_TYPE=simple
```

> 注意：`simple` 主要用于开发/演示，不代表高质量语义检索。

## 3）（可选但强烈推荐）启动 Qdrant

RAG（向量检索）依赖 Qdrant 时，推荐用 Docker 启动本地实例：

```powershell
docker run --rm -p 6333:6333 -p 6334:6334 qdrant/qdrant
```

并在 `.env` 指向本地：

```env
QDRANT_URL=http://localhost:6333
```

## 4）（可选）启动 Neo4j

知识图谱相关能力依赖 Neo4j；不用图谱时可以不启。

Docker 启动示例（会暴露 Web UI 在 7474，Bolt 在 7687）：

```powershell
docker run --rm `
  -p 7474:7474 -p 7687:7687 `
  -e NEO4J_AUTH=neo4j/your-password `
  neo4j:5
```

然后在 `.env` 配置：

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
```

## 5）跑示例

### 最小对话示例

```bash
npx tsx examples/chat.ts
```

### MemoryAgent（含 RAG + 记忆 + 可选知识图谱）

```bash
npx tsx examples/memory-agent-demo.ts
```

交互模式：

```bash
npx tsx examples/memory-agent-demo.ts --interactive
```

## 6）如何判断 RAG 是否“真的生效”

### 观察运行时日志（推荐）

在 `MemoryAgent` 的每次提问中，如果走了检索，你会看到类似日志：

- `📚 RAG 检索到 X 条相关记忆`
- 当向量库参与检索时，会看到：`🔍 Qdrant 搜索返回 X 个结果`

### 用“重启后仍可检索”验证（排除对话历史干扰）

由于 Agent 会把“对话历史”作为上下文传给模型，**仅凭同一会话内的回答很难判断到底是历史上下文还是 RAG 检索在起作用**。

更可靠的方式：

1. 在交互模式里添加一条“不可猜”的随机串（例如 `RAG_PROBE_9f3c1a7d...`），让它进入记忆系统
2. 退出进程（关闭当前对话/脚本）
3. 重新启动交互模式，直接问它“把那串随机串逐字输出”

若能稳定复现，说明检索链路确实在起作用。

## 常见问题（Windows / PowerShell）

- **`.env`/`.env.example` 出现乱码**：优先用 `env.example` 重新复制生成 `.env`，并用 UTF-8 保存（PowerShell 可用 `Set-Content -Encoding utf8`）。

