/**
 * w-agent - TypeScript Agent Framework
 *
 * A Node.js port of HelloAgents - a comprehensive framework for building
 * AI agents with LLM integration, tool calling, and memory management.
 */

// Core exports
export {
  HelloAgentsError,
  LLMError,
  AgentError,
  ConfigError,
  ToolError,
  MemoryError,
} from "./core/exceptions.js";

export {
  Logger,
  LogLevel,
  ConsoleLogger,
  SilentLogger,
  silentLogger,
  createLogger,
  getDefaultLogger,
  setDefaultLogger,
} from "./core/logger.js";

export {
  Config,
  ConfigOptions,
  ConfigSchema,
  RuntimeConfig,
  createConfig,
  createRuntimeConfig,
  createConfigFromEnv,
  createRuntimeConfigFromEnv,
  defaultConfig,
  defaultRuntimeConfig,
} from "./core/config.js";

export {
  Message,
  MessageRole,
  MessageSchema,
  MessageInput,
  MessageData,
  OpenAIMessage,
  messagesToOpenAI,
} from "./core/message.js";

export {
  HelloAgentsLLM,
  LLMProvider,
  LLMOptions,
  ChatMessage,
} from "./core/llm.js";

export { Agent, AgentOptions } from "./core/agent.js";

export {
  runToolCallingLoop,
  runSingleToolCall,
  ToolCallingLoopOptions,
  ToolCallingStep,
  LoopResult,
} from "./core/tool-calling-loop.js";

export {
  DatabaseConfig,
  QdrantConfig,
  QdrantConfigSchema,
  Neo4jConfig,
  Neo4jConfigSchema,
  EmbeddingConfig,
  EmbeddingConfigSchema,
  getDatabaseConfig,
  updateDatabaseConfig,
} from "./core/database-config.js";

// Tools exports
export {
  Tool,
  SimpleTool,
  ExpandableTool,
  ToolParameter,
  ToolParameterSchema,
  ToolParameters,
  FunctionSchema,
  createTool,
} from "./tools/base.js";

export {
  ToolRegistry,
  ToolRegistryOptions,
  globalRegistry,
} from "./tools/registry.js";

export {
  ToolExecutor,
  ToolExecutorOptions,
  ToolCallRequest,
  ToolCallResult,
  createToolExecutor,
} from "./tools/executor.js";

export {
  CalculatorTool,
  CalculatorToolOptions,
  calculate,
} from "./tools/builtin/calculator.js";
export {
  SearchTool,
  SearchToolOptions,
  SearchFunction,
  search,
} from "./tools/builtin/search.js";

// Memory exports
export {
  BaseMemory,
  MemoryItem,
  MemoryItemSchema,
  MemoryConfig,
  MemoryConfigSchema,
  MemoryStats,
  createMemoryConfig,
  createMemoryItem,
} from "./memory/base.js";

export { WorkingMemory } from "./memory/types/working.js";
export {
  EpisodicMemory,
  Episode,
  EpisodicMemoryOptions,
} from "./memory/types/episodic.js";
export {
  SemanticMemory,
  Entity,
  Relation,
  SemanticMemoryOptions,
} from "./memory/types/semantic.js";

export {
  MemoryManager,
  MemoryManagerOptions,
  MemoryManagerStats,
} from "./memory/manager.js";

// Storage exports
export {
  EmbeddingModel,
  EmbeddingConfig as StorageEmbeddingConfig,
  OpenAIEmbedding,
  DashScopeEmbedding,
  SimpleEmbedding,
  getEmbedding,
  getEmbeddingDimension,
  refreshEmbedding,
} from "./memory/storage/embedding.js";

export {
  QdrantVectorStore,
  QdrantConfig as StorageQdrantConfig,
  VectorSearchResult,
  getQdrantInstance,
} from "./memory/storage/qdrant-store.js";

export {
  Neo4jGraphStore,
  Neo4jConfig as StorageNeo4jConfig,
  EntityData,
  RelationshipData,
  getNeo4jInstance,
} from "./memory/storage/neo4j-store.js";

// Agents exports
export { SimpleAgent, SimpleAgentOptions } from "./agents/simple-agent.js";
export { ReActAgent, ReActAgentOptions } from "./agents/react-agent.js";
export {
  PlanSolveAgent,
  PlanSolveAgentOptions,
} from "./agents/plan-solve-agent.js";
export {
  FunctionCallAgent,
  FunctionCallAgentOptions,
} from "./agents/function-call-agent.js";
export {
  MemoryAgent,
  MemoryAgentOptions,
  KeywordExtractor,
  defaultKeywordExtractor,
} from "./agents/memory-agent.js";
export {
  UnifiedAgent,
  UnifiedAgentOptions,
  UnifiedAgentResult,
} from "./agents/unified-agent.js";
