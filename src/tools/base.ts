/**
 * 工具基类 - 定义工具接口和参数类型
 */

import { z } from 'zod';

/**
 * 工具参数 Schema
 */
export const ToolParameterSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'integer', 'boolean', 'array', 'object']),
  description: z.string(),
  required: z.boolean().default(true),
  default: z.unknown().optional(),
});

export type ToolParameter = z.infer<typeof ToolParameterSchema>;

/**
 * OpenAI Function Calling Schema 类型
 */
export interface FunctionSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * 工具执行参数类型
 */
export type ToolParameters = Record<string, unknown>;

/**
 * 工具基类
 *
 * 支持两种使用模式：
 * 1. 普通模式：工具作为单一实体使用
 * 2. 可展开模式：工具可以展开为多个独立的子工具
 */
export abstract class Tool {
  readonly name: string;
  readonly description: string;
  readonly expandable: boolean;

  constructor(name: string, description: string, expandable = false) {
    this.name = name;
    this.description = description;
    this.expandable = expandable;
  }

  /**
   * 执行工具（抽象方法）
   */
  abstract run(parameters: ToolParameters): Promise<string> | string;

  /**
   * 获取工具参数定义（抽象方法）
   */
  abstract getParameters(): ToolParameter[];

  /**
   * 获取展开后的子工具列表
   */
  getExpandedTools(): Tool[] | null {
    if (!this.expandable) {
      return null;
    }
    return null;
  }

  /**
   * 验证参数
   */
  validateParameters(parameters: ToolParameters): boolean {
    const requiredParams = this.getParameters()
      .filter((p) => p.required)
      .map((p) => p.name);

    return requiredParams.every((param) => param in parameters);
  }

  /**
   * 转换为字典格式
   */
  toDict(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      parameters: this.getParameters(),
    };
  }

  /**
   * 转换为 OpenAI Function Calling Schema
   */
  toOpenAISchema(): FunctionSchema {
    const parameters = this.getParameters();
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const param of parameters) {
      const prop: Record<string, unknown> = {
        type: param.type,
        description: param.description,
      };

      // 如果有默认值，添加到描述中
      if (param.default !== undefined) {
        prop.description = `${param.description} (默认: ${param.default})`;
      }

      // 如果是数组类型，添加 items 定义
      if (param.type === 'array') {
        prop.items = { type: 'string' };
      }

      properties[param.name] = prop;

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties,
          required: required.length > 0 ? required : undefined,
        },
      },
    };
  }

  toString(): string {
    return `Tool(name=${this.name})`;
  }
}

/**
 * 简单工具类 - 用于快速创建工具
 */
export class SimpleTool extends Tool {
  private readonly params: ToolParameter[];
  private readonly executor: (parameters: ToolParameters) => Promise<string> | string;

  constructor(
    name: string,
    description: string,
    params: ToolParameter[],
    executor: (parameters: ToolParameters) => Promise<string> | string
  ) {
    super(name, description);
    this.params = params;
    this.executor = executor;
  }

  run(parameters: ToolParameters): Promise<string> | string {
    return this.executor(parameters);
  }

  getParameters(): ToolParameter[] {
    return this.params;
  }
}

/**
 * 创建简单工具的工厂函数
 */
export function createTool(
  name: string,
  description: string,
  params: ToolParameter[],
  executor: (parameters: ToolParameters) => Promise<string> | string
): Tool {
  return new SimpleTool(name, description, params, executor);
}

/**
 * 工具动作装饰器元数据
 */
export interface ToolActionMetadata {
  name?: string;
  description?: string;
}

/**
 * 可展开工具基类
 * 支持通过方法自动生成子工具
 */
export abstract class ExpandableTool extends Tool {
  private actionMethods: Map<string, { method: Function; metadata: ToolActionMetadata }> =
    new Map();

  constructor(name: string, description: string) {
    super(name, description, true);
  }

  /**
   * 注册工具动作
   */
  protected registerAction(
    methodName: string,
    method: Function,
    metadata: ToolActionMetadata = {}
  ): void {
    this.actionMethods.set(methodName, { method, metadata });
  }

  /**
   * 获取展开后的子工具
   */
  override getExpandedTools(): Tool[] {
    const tools: Tool[] = [];

    for (const [methodName, { method, metadata }] of this.actionMethods) {
      const toolName = metadata.name ?? `${this.name}_${methodName}`;
      const toolDescription = metadata.description ?? `执行 ${methodName}`;

      // 创建包装工具
      const wrappedTool = new SimpleTool(
        toolName,
        toolDescription,
        [{ name: 'input', type: 'string', description: '输入参数', required: true }],
        (params) => method.call(this, params)
      );

      tools.push(wrappedTool);
    }

    return tools;
  }

  /**
   * 默认 run 实现 - 根据 action 参数分发
   */
  run(parameters: ToolParameters): Promise<string> | string {
    const action = parameters.action as string;
    const actionData = this.actionMethods.get(action);

    if (!actionData) {
      return `错误：未找到动作 '${action}'`;
    }

    return actionData.method.call(this, parameters);
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'action',
        type: 'string',
        description: '要执行的动作',
        required: true,
      },
    ];
  }
}
