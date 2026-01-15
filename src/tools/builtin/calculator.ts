/**
 * 计算器工具 - 执行数学计算
 */

import { evaluate } from 'mathjs';
import { Tool, ToolParameter, ToolParameters } from '../base.js';

/**
 * 计算器工具类
 */
export class CalculatorTool extends Tool {
  constructor() {
    super(
      'python_calculator',
      '执行数学计算。支持基本运算、数学函数等。例如：2+3*4, sqrt(16), sin(pi/2)等。'
    );
  }

  /**
   * 执行计算
   */
  run(parameters: ToolParameters): string {
    // 支持两种参数格式：input 和 expression
    const expression =
      (parameters.input as string) || (parameters.expression as string) || '';

    if (!expression) {
      return '错误：计算表达式不能为空';
    }

    console.log(`🧮 正在计算: ${expression}`);

    try {
      const result = evaluate(expression);
      const resultStr = String(result);
      console.log(`✅ 计算结果: ${resultStr}`);
      return resultStr;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const errorMsg = `计算失败: ${message}`;
      console.error(`❌ ${errorMsg}`);
      return errorMsg;
    }
  }

  /**
   * 获取参数定义
   */
  getParameters(): ToolParameter[] {
    return [
      {
        name: 'input',
        type: 'string',
        description: '要计算的数学表达式，支持基本运算和数学函数',
        required: true,
      },
    ];
  }
}

/**
 * 便捷函数 - 执行计算
 */
export function calculate(expression: string): string {
  const tool = new CalculatorTool();
  return tool.run({ input: expression });
}
