/**
 * MemoryAgent - 具有记忆和 RAG 功能的智能对话 Agent
 *
 * 功能：
 * - 对话记忆：记住对话历史和用户偏好
 * - 语义记忆：存储和检索知识
 * - RAG：基于向量检索增强生成
 * - 知识图谱：理解实体关系
 */

import { Agent, AgentOptions } from "../core/agent.js";
import { Message } from "../core/message.js";
import { ChatMessage } from "../core/llm.js";
import { ToolRegistry } from "../tools/registry.js";
import { ToolParameters } from "../tools/base.js";
import { MemoryManager, MemoryManagerOptions } from "../memory/manager.js";
import { MemoryItem } from "../memory/base.js";

/**
 * MemoryAgent 选项
 */
export interface MemoryAgentOptions extends AgentOptions {
  /** 用户 ID */
  userId?: string;
  /** 工具注册表 */
  toolRegistry?: ToolRegistry;
  /** 启用工具调用 */
  enableToolCalling?: boolean;
  /** 启用 RAG */
  enableRAG?: boolean;
  /** 启用知识图谱 */
  enableKnowledgeGraph?: boolean;
  /** RAG 检索数量 */
  ragTopK?: number;
  /** RAG 最小相似度 */
  ragMinScore?: number;
  /** 记忆配置 */
  memoryOptions?: Partial<MemoryManagerOptions>;
  /** 自动保存对话 */
  autoSaveConversation?: boolean;
  /** 对话重要性阈值 */
  conversationImportanceThreshold?: number;
}

/**
 * MemoryAgent - 具有记忆和 RAG 功能的 Agent
 */
export class MemoryAgent extends Agent {
  private toolRegistry?: ToolRegistry;
  private enableToolCalling: boolean;
  private enableRAG: boolean;
  private enableKnowledgeGraph: boolean;
  private ragTopK: number;
  private ragMinScore: number;
  private autoSaveConversation: boolean;
  private conversationImportanceThreshold: number;

  private memoryManager: MemoryManager;
  private userId: string;
  private sessionId: string;
  private conversationTurn: number = 0;

  constructor(options: MemoryAgentOptions) {
    super(options);

    this.userId = options.userId ?? "default_user";
    this.sessionId = `session_${Date.now()}`;
    this.toolRegistry = options.toolRegistry;
    this.enableToolCalling =
      options.enableToolCalling !== false && !!options.toolRegistry;
    this.enableRAG = options.enableRAG !== false;
    this.enableKnowledgeGraph = options.enableKnowledgeGraph !== false;
    this.ragTopK = options.ragTopK ?? 5;
    this.ragMinScore = options.ragMinScore ?? 0.5;
    this.autoSaveConversation = options.autoSaveConversation !== false;
    this.conversationImportanceThreshold =
      options.conversationImportanceThreshold ?? 0.3;

    // 初始化记忆管理器
    this.memoryManager = new MemoryManager({
      userId: this.userId,
      enableVectorStore: this.enableRAG,
      enableGraphStore: this.enableKnowledgeGraph,
      ...options.memoryOptions,
    });

    console.log(`🧠 MemoryAgent 初始化完成`);
    console.log(`   用户: ${this.userId}`);
    console.log(`   会话: ${this.sessionId}`);
    console.log(`   RAG: ${this.enableRAG ? "✅" : "❌"}`);
    console.log(`   知识图谱: ${this.enableKnowledgeGraph ? "✅" : "❌"}`);
  }

  /**
   * 运行 Agent
   */
  async run(input: string): Promise<string> {
    this.conversationTurn++;

    // 1. 检索相关记忆和知识
    const context = await this.retrieveContext(input);

    // 2. 构建增强的消息
    const enhancedMessages = this.buildEnhancedMessages(input, context);

    // 3. 调用 LLM
    let response: string;
    if (this.enableToolCalling && this.toolRegistry) {
      response = await this.runWithTools(enhancedMessages);
    } else {
      response = await this.llm.invoke(enhancedMessages);
    }

    // 4. 保存对话到记忆
    if (this.autoSaveConversation) {
      await this.saveConversation(input, response);
    }

    // 5. 更新消息历史
    this.addMessage(new Message(input, "user"));
    this.addMessage(new Message(response, "assistant"));

    return response;
  }

  /**
   * 检索相关上下文
   */
  private async retrieveContext(query: string): Promise<{
    memories: MemoryItem[];
    entities: Array<{ name: string; type: string; description?: string }>;
  }> {
    const context: {
      memories: MemoryItem[];
      entities: Array<{ name: string; type: string; description?: string }>;
    } = {
      memories: [],
      entities: [],
    };

    // 1. RAG: 检索相关记忆
    if (this.enableRAG) {
      try {
        const memories = await this.memoryManager.retrieveMemories(query, {
          limit: this.ragTopK,
          minImportance: this.ragMinScore,
          useVectorSearch: true,
        });
        context.memories = memories;
        console.log(`📚 RAG 检索到 ${memories.length} 条相关记忆`);
      } catch (e) {
        console.warn("⚠️ RAG 检索失败:", e);
      }
    }

    // 2. 知识图谱: 检索相关实体
    if (this.enableKnowledgeGraph) {
      try {
        // 从查询中提取可能的实体名称（简单实现）
        const keywords = this.extractKeywords(query);
        for (const keyword of keywords.slice(0, 3)) {
          const entities = await this.memoryManager.searchEntities(keyword, {
            limit: 3,
          });
          for (const entity of entities) {
            if (!context.entities.find((e) => e.name === entity.name)) {
              context.entities.push({
                name: entity.name,
                type: entity.entityType,
                description: entity.properties?.description as string,
              });
            }
          }
        }
        console.log(`🔗 知识图谱检索到 ${context.entities.length} 个相关实体`);
      } catch (e) {
        console.warn("⚠️ 知识图谱检索失败:", e);
      }
    }

    return context;
  }

  /**
   * 构建增强的消息列表
   */
  private buildEnhancedMessages(
    input: string,
    context: {
      memories: MemoryItem[];
      entities: Array<{ name: string; type: string; description?: string }>;
    }
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 1. 系统提示词
    let systemPrompt =
      this.systemPrompt ?? "你是一个有用的 AI 助手，具有记忆和知识检索能力。";

    // 添加工具说明
    if (this.enableToolCalling && this.toolRegistry) {
      const toolsDescription = this.toolRegistry.getToolsDescription();
      if (toolsDescription && toolsDescription !== "暂无可用工具") {
        systemPrompt += "\n\n## 可用工具\n" + toolsDescription;
        systemPrompt += "\n\n调用工具时使用格式: `[TOOL_CALL:工具名:参数]`";
      }
    }

    // 添加记忆上下文
    if (context.memories.length > 0) {
      systemPrompt += "\n\n## 相关记忆\n";
      systemPrompt +=
        "以下是与当前对话相关的历史信息，请参考但不要直接复述：\n";
      for (const memory of context.memories) {
        const score = memory.metadata.relevanceScore ?? "N/A";
        systemPrompt += `- [${memory.memoryType}] ${memory.content} (相关度: ${score})\n`;
      }
    }

    // 添加知识图谱上下文
    if (context.entities.length > 0) {
      systemPrompt += "\n\n## 相关知识\n";
      systemPrompt += "以下是与当前话题相关的知识实体：\n";
      for (const entity of context.entities) {
        systemPrompt += `- ${entity.name} (${entity.type})`;
        if (entity.description) {
          systemPrompt += `: ${entity.description}`;
        }
        systemPrompt += "\n";
      }
    }

    messages.push({ role: "system", content: systemPrompt });

    // 2. 对话历史
    for (const msg of this.history) {
      messages.push({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      });
    }

    // 3. 当前用户输入
    messages.push({ role: "user", content: input });

    return messages;
  }

  /**
   * 带工具调用的运行
   */
  private async runWithTools(messages: ChatMessage[]): Promise<string> {
    const response = await this.llm.invoke(messages);

    // 解析工具调用
    const toolCalls = this.parseToolCalls(response);
    if (toolCalls.length === 0) {
      return response;
    }

    // 执行工具调用
    let enhancedResponse = response;
    for (const toolCall of toolCalls) {
      const result = await this.executeToolCall(toolCall);
      enhancedResponse = enhancedResponse.replace(
        toolCall.original,
        `\n工具 ${toolCall.toolName} 返回: ${result}\n`
      );
    }

    return enhancedResponse;
  }

  /**
   * 解析工具调用
   */
  private parseToolCalls(text: string): Array<{
    toolName: string;
    parameters: string;
    original: string;
  }> {
    const pattern = /\[TOOL_CALL:([^:]+):([^\]]+)\]/g;
    const toolCalls: Array<{
      toolName: string;
      parameters: string;
      original: string;
    }> = [];
    let match;

    while ((match = pattern.exec(text)) !== null) {
      toolCalls.push({
        toolName: match[1].trim(),
        parameters: match[2].trim(),
        original: match[0],
      });
    }

    return toolCalls;
  }

  /**
   * 执行工具调用
   */
  private async executeToolCall(toolCall: {
    toolName: string;
    parameters: string;
  }): Promise<string> {
    if (!this.toolRegistry) {
      return "工具不可用";
    }

    try {
      const params = this.parseParameters(toolCall.parameters);
      const result = await this.toolRegistry.executeTool(
        toolCall.toolName,
        params
      );
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (e) {
      return `工具调用失败: ${e}`;
    }
  }

  /**
   * 解析参数
   */
  private parseParameters(paramStr: string): ToolParameters {
    const params: ToolParameters = {};

    // 尝试解析 key=value 格式
    if (paramStr.includes("=")) {
      const pairs = paramStr.split(",");
      for (const pair of pairs) {
        const [key, ...valueParts] = pair.split("=");
        if (key && valueParts.length > 0) {
          params[key.trim()] = valueParts.join("=").trim();
        }
      }
    } else {
      // 单一参数
      params.query = paramStr;
      params.expression = paramStr;
    }

    return params;
  }

  /**
   * 保存对话到记忆
   */
  private async saveConversation(
    userInput: string,
    assistantResponse: string
  ): Promise<void> {
    try {
      // 计算对话重要性
      const importance = this.calculateConversationImportance(
        userInput,
        assistantResponse
      );

      if (importance >= this.conversationImportanceThreshold) {
        // 保存用户输入为情景记忆
        await this.memoryManager.addMemory(userInput, {
          memoryType: "episodic",
          importance,
          metadata: {
            sessionId: this.sessionId,
            turn: this.conversationTurn,
            role: "user",
            timestamp: Date.now(),
          },
        });

        // 如果回答包含知识性内容，保存为语义记忆
        if (this.containsKnowledge(assistantResponse)) {
          await this.memoryManager.addMemory(assistantResponse, {
            memoryType: "semantic",
            importance: importance * 0.8,
            metadata: {
              sessionId: this.sessionId,
              turn: this.conversationTurn,
              role: "assistant",
              source: "conversation",
            },
          });
        }
      }
    } catch (e) {
      console.warn("⚠️ 保存对话失败:", e);
    }
  }

  /**
   * 计算对话重要性
   */
  private calculateConversationImportance(
    userInput: string,
    response: string
  ): number {
    let importance = 0.5;

    // 基于长度
    const totalLength = userInput.length + response.length;
    if (totalLength > 200) importance += 0.1;
    if (totalLength > 500) importance += 0.1;

    // 基于问句
    if (userInput.includes("？") || userInput.includes("?")) importance += 0.1;

    // 基于关键词
    const importantKeywords = [
      "重要",
      "记住",
      "注意",
      "关键",
      "必须",
      "总结",
      "定义",
      "概念",
    ];
    if (
      importantKeywords.some(
        (k) => userInput.includes(k) || response.includes(k)
      )
    ) {
      importance += 0.2;
    }

    return Math.min(1, importance);
  }

  /**
   * 判断是否包含知识性内容
   */
  private containsKnowledge(text: string): boolean {
    const knowledgeIndicators = [
      "是指",
      "定义为",
      "指的是",
      "表示",
      "意味着",
      "包括",
      "分为",
      "特点是",
      "区别在于",
    ];
    return knowledgeIndicators.some((indicator) => text.includes(indicator));
  }

  /**
   * 从文本中提取关键词
   */
  private extractKeywords(text: string): string[] {
    // 简单实现：提取长度 >= 2 的词
    const words = text
      .replace(/[，。！？、；：""''（）\[\]【】]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    return [...new Set(words)];
  }

  /**
   * 添加知识到记忆
   */
  async addKnowledge(
    content: string,
    options: { importance?: number; category?: string } = {}
  ): Promise<string> {
    return await this.memoryManager.addMemory(content, {
      memoryType: "semantic",
      importance: options.importance ?? 0.7,
      metadata: {
        category: options.category ?? "knowledge",
        addedBy: "user",
        timestamp: Date.now(),
      },
    });
  }

  /**
   * 添加实体到知识图谱
   */
  async addEntity(
    entityId: string,
    name: string,
    entityType: string,
    properties?: Record<string, unknown>
  ): Promise<boolean> {
    return await this.memoryManager.addEntity({
      entityId,
      name,
      entityType,
      properties,
    });
  }

  /**
   * 添加关系到知识图谱
   */
  async addRelation(
    fromEntityId: string,
    toEntityId: string,
    relationType: string
  ): Promise<boolean> {
    return await this.memoryManager.addRelation({
      fromEntity: fromEntityId,
      toEntity: toEntityId,
      relationType,
    });
  }

  /**
   * 搜索记忆
   */
  async searchMemories(
    query: string,
    options: { limit?: number; memoryTypes?: string[] } = {}
  ): Promise<MemoryItem[]> {
    return await this.memoryManager.retrieveMemories(query, {
      limit: options.limit ?? 10,
      memoryTypes: options.memoryTypes,
      useVectorSearch: true,
    });
  }

  /**
   * 获取记忆统计
   */
  async getMemoryStats() {
    return await this.memoryManager.getStats();
  }

  /**
   * 清空记忆
   */
  async clearMemories(): Promise<void> {
    await this.memoryManager.clearAllMemories();
  }

  /**
   * 关闭 Agent（释放资源）
   */
  async close(): Promise<void> {
    await this.memoryManager.close();
  }

  /**
   * 获取会话 ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * 获取用户 ID
   */
  getUserId(): string {
    return this.userId;
  }
}
