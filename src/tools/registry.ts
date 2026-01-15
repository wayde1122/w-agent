/**
 * 工具注册表 - 管理和执行工具
 */

import { Tool, ToolParameters, FunctionSchema } from './base.js';

/**
 * 函数工具信息
 */
interface FunctionToolInfo {
  description: string;
  func: (input: string) => Promise<string> | string;
}

/**
 * 工具注册表
 *
 * 提供工具的注册、管理和执行功能。
 * 支持两种工具注册方式：
 * 1. Tool 对象注册（推荐）
 * 2. 函数直接注册（简便）
 */
export class ToolRegistry {
  private tools: Map<string, Tool> = new Map();
  private functions: Map<string, FunctionToolInfo> = new Map();

  /**
   * 注册 Tool 对象
   */
  registerTool(tool: Tool, autoExpand = true): void {
    // 检查工具是否可展开
    if (autoExpand && tool.expandable) {
      const expandedTools = tool.getExpandedTools();
      if (expandedTools && expandedTools.length > 0) {
        for (const subTool of expandedTools) {
          if (this.tools.has(subTool.name)) {
            console.warn(`⚠️ 警告：工具 '${subTool.name}' 已存在，将被覆盖。`);
          }
          this.tools.set(subTool.name, subTool);
        }
        console.log(`✅ 工具 '${tool.name}' 已展开为 ${expandedTools.length} 个独立工具`);
        return;
      }
    }

    // 普通工具或不展开的工具
    if (this.tools.has(tool.name)) {
      console.warn(`⚠️ 警告：工具 '${tool.name}' 已存在，将被覆盖。`);
    }

    this.tools.set(tool.name, tool);
    console.log(`✅ 工具 '${tool.name}' 已注册。`);
  }

  /**
   * 直接注册函数作为工具
   */
  registerFunction(
    name: string,
    description: string,
    func: (input: string) => Promise<string> | string
  ): void {
    if (this.functions.has(name)) {
      console.warn(`⚠️ 警告：工具 '${name}' 已存在，将被覆盖。`);
    }

    this.functions.set(name, { description, func });
    console.log(`✅ 工具 '${name}' 已注册。`);
  }

  /**
   * 注销工具
   */
  unregister(name: string): void {
    if (this.tools.has(name)) {
      this.tools.delete(name);
      console.log(`🗑️ 工具 '${name}' 已注销。`);
    } else if (this.functions.has(name)) {
      this.functions.delete(name);
      console.log(`🗑️ 工具 '${name}' 已注销。`);
    } else {
      console.warn(`⚠️ 工具 '${name}' 不存在。`);
    }
  }

  /**
   * 获取 Tool 对象
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * 获取函数工具
   */
  getFunction(name: string): ((input: string) => Promise<string> | string) | undefined {
    return this.functions.get(name)?.func;
  }

  /**
   * 执行工具
   */
  async executeTool(name: string, input: string | ToolParameters): Promise<string> {
    // 优先查找 Tool 对象
    const tool = this.tools.get(name);
    if (tool) {
      try {
        const params = typeof input === 'string' ? { input } : input;
        const result = await tool.run(params);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `错误：执行工具 '${name}' 时发生异常: ${message}`;
      }
    }

    // 查找函数工具
    const funcInfo = this.functions.get(name);
    if (funcInfo) {
      try {
        const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
        const result = await funcInfo.func(inputStr);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `错误：执行工具 '${name}' 时发生异常: ${message}`;
      }
    }

    return `错误：未找到名为 '${name}' 的工具。`;
  }

  /**
   * 获取所有可用工具的格式化描述
   */
  getToolsDescription(): string {
    const descriptions: string[] = [];

    // Tool 对象描述
    for (const tool of this.tools.values()) {
      descriptions.push(`- ${tool.name}: ${tool.description}`);
    }

    // 函数工具描述
    for (const [name, info] of this.functions) {
      descriptions.push(`- ${name}: ${info.description}`);
    }

    return descriptions.length > 0 ? descriptions.join('\n') : '暂无可用工具';
  }

  /**
   * 列出所有工具名称
   */
  listTools(): string[] {
    return [...this.tools.keys(), ...this.functions.keys()];
  }

  /**
   * 获取所有 Tool 对象
   */
  getAllTools(): Tool[] {
    return [...this.tools.values()];
  }

  /**
   * 获取所有工具的 OpenAI Schema
   */
  getAllToolSchemas(): FunctionSchema[] {
    const schemas: FunctionSchema[] = [];

    // Tool 对象的 schema
    for (const tool of this.tools.values()) {
      schemas.push(tool.toOpenAISchema());
    }

    // 函数工具的 schema
    for (const [name, info] of this.functions) {
      schemas.push({
        type: 'function',
        function: {
          name,
          description: info.description,
          parameters: {
            type: 'object',
            properties: {
              input: {
                type: 'string',
                description: '输入文本',
              },
            },
            required: ['input'],
          },
        },
      });
    }

    return schemas;
  }

  /**
   * 清空所有工具
   */
  clear(): void {
    this.tools.clear();
    this.functions.clear();
    console.log('🧹 所有工具已清空。');
  }

  /**
   * 获取工具数量
   */
  get size(): number {
    return this.tools.size + this.functions.size;
  }
}

/**
 * 全局工具注册表
 */
export const globalRegistry = new ToolRegistry();
