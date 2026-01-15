# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-15

### Added

#### Core

- `HelloAgentsLLM` - LLM 客户端，支持多种提供商（OpenAI、DeepSeek、DashScope、Ollama 等）
- `Agent` 基类 - 定义 Agent 通用生命周期
- `Message` 系统 - 消息管理和 OpenAI 格式转换
- `Config` 配置管理 - 支持环境变量和代码配置
- `Logger` 日志系统 - `ConsoleLogger`、`SilentLogger`，默认静默
- `tool-calling-loop` - 工具调用循环，支持多轮调用
- 异常体系 - `HelloAgentsError`、`LLMError`、`AgentError`、`ToolError`、`MemoryError`、`ConfigError`

#### Agents

- `UnifiedAgent` - **推荐** 统一 Agent，支持原生 tool calling 和文本协议
- `SimpleAgent` - 简单对话 Agent
- `ReActAgent` - Thought-Action-Observation 模式
- `PlanSolveAgent` - Plan-Execute-Summarize 模式
- `FunctionCallAgent` - OpenAI 原生函数调用
- `MemoryAgent` - 集成记忆和 RAG 功能

#### Tools

- `Tool` 基类 - 工具定义
- `SimpleTool` - 简化工具创建
- `ExpandableTool` - 可展开工具
- `ToolRegistry` - 工具注册表
- `ToolExecutor` - 统一工具执行器
- `CalculatorTool` - 内置计算器工具
- `SearchTool` - 内置搜索工具（mock 实现，支持注入自定义函数）

#### Memory

- `MemoryManager` - 统一记忆管理入口
- `WorkingMemory` - 工作记忆（短期）
- `EpisodicMemory` - 情景记忆
- `SemanticMemory` - 语义记忆
- 记忆整合和遗忘机制

#### Storage

- `QdrantVectorStore` - Qdrant 向量数据库适配
- `Neo4jGraphStore` - Neo4j 图数据库适配
- Embedding 支持 - OpenAI、DashScope、Simple（本地兜底）

#### Documentation

- README.md - 完整使用文档
- QUICKSTART.md - 快速上手指南
- ARCHITECTURE.md - 架构设计文档
- 示例代码 - 11 个完整示例

#### Testing

- 单元测试 - core、tools、memory 模块
- Vitest 测试框架

### Notes

- SearchTool 是 mock 实现，生产环境请注入真实搜索 API
- 默认日志静默，按需注入 Logger 启用
- 支持 Node.js >= 18
