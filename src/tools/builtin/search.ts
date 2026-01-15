/**
 * 搜索工具 - 模拟搜索功能
 *
 * **重要**：这是一个 MOCK 实现，不会真正联网搜索。
 * 实际使用时应替换为真实的搜索 API（如 SerpAPI、Bing Search API 等）。
 * 可通过 `searchFn` 选项注入自定义搜索实现。
 */

import { Tool, ToolParameter, ToolParameters } from '../base.js';
import { Logger, silentLogger } from '../../core/logger.js';

/**
 * 自定义搜索函数类型
 */
export type SearchFunction = (query: string) => Promise<string[]> | string[];

/**
 * 搜索工具配置
 */
export interface SearchToolOptions {
  logger?: Logger;
  /** 自定义搜索实现，替代内置 mock */
  searchFn?: SearchFunction;
}

/**
 * 搜索工具类
 *
 * 注意：默认是 MOCK 实现，不会真正联网。
 * 可通过 `searchFn` 选项注入真实搜索 API。
 */
export class SearchTool extends Tool {
  private readonly logger: Logger;
  private readonly searchFn?: SearchFunction;

  constructor(options: SearchToolOptions = {}) {
    super('search', '搜索互联网获取信息。输入搜索关键词，返回相关结果。');
    this.logger = options.logger ?? silentLogger;
    this.searchFn = options.searchFn;
  }

  /**
   * 执行搜索
   */
  async run(parameters: ToolParameters): Promise<string> {
    const query = (parameters.input as string) || (parameters.query as string) || '';

    if (!query) {
      return '错误：搜索查询不能为空';
    }

    this.logger.debug(`正在搜索: ${query}`);

    // 如果有自定义搜索函数，使用它
    let results: string[];
    if (this.searchFn) {
      results = await this.searchFn(query);
    } else {
      // 模拟搜索结果
      results = this.getMockResults(query);
    }

    this.logger.debug(`找到 ${results.length} 条结果`);

    return results.join('\n\n');
  }

  /**
   * 获取模拟搜索结果
   */
  private getMockResults(query: string): string[] {
    // 模拟一些通用的搜索结果
    const results: string[] = [];

    if (query.toLowerCase().includes('python')) {
      results.push(
        '1. Python 是一种高级编程语言，以其简洁的语法和强大的功能著称。',
        '2. Python 官方网站: https://www.python.org',
        '3. Python 广泛应用于 Web 开发、数据科学、人工智能等领域。'
      );
    } else if (query.toLowerCase().includes('javascript') || query.toLowerCase().includes('js')) {
      results.push(
        '1. JavaScript 是一种脚本语言，主要用于 Web 前端开发。',
        '2. Node.js 使 JavaScript 可以在服务器端运行。',
        '3. JavaScript 是世界上最流行的编程语言之一。'
      );
    } else if (query.toLowerCase().includes('ai') || query.toLowerCase().includes('人工智能')) {
      results.push(
        '1. 人工智能（AI）是计算机科学的一个分支，旨在创建能够执行通常需要人类智能的任务的系统。',
        '2. 机器学习是 AI 的一个子领域，专注于让计算机从数据中学习。',
        '3. 深度学习是机器学习的一种方法，使用神经网络处理复杂问题。'
      );
    } else {
      results.push(
        `1. 关于 "${query}" 的搜索结果...`,
        `2. 更多关于 "${query}" 的信息可以在专业网站上找到。`,
        `3. 建议查阅相关文档以获取更详细的信息。`
      );
    }

    return results;
  }

  /**
   * 获取参数定义
   */
  getParameters(): ToolParameter[] {
    return [
      {
        name: 'input',
        type: 'string',
        description: '搜索关键词或查询内容',
        required: true,
      },
    ];
  }
}

/**
 * 便捷函数 - 执行搜索
 */
export async function search(query: string): Promise<string> {
  const tool = new SearchTool();
  return tool.run({ input: query });
}
