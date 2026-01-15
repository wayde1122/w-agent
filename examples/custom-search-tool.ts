/**
 * 自定义搜索工具示例
 *
 * 演示如何：
 * 1. 通过 searchFn 注入自定义搜索实现
 * 2. 继承 Tool 基类创建完整自定义工具
 */

import {
  HelloAgentsLLM,
  UnifiedAgent,
  SearchTool,
  Tool,
  ToolParameter,
  ToolParameters,
  ConsoleLogger,
} from '../src/index.js';

// ============================================================
// 方式 1：通过 searchFn 注入自定义搜索函数
// ============================================================

/**
 * 模拟的自定义搜索函数
 * 实际使用时替换为真实 API（如 SerpAPI、Bing Search API 等）
 */
async function myCustomSearch(query: string): Promise<string[]> {
  console.log(`[自定义搜索] 查询: ${query}`);

  // 模拟 API 延迟
  await new Promise((resolve) => setTimeout(resolve, 100));

  // 返回模拟结果
  return [
    `[自定义结果 1] 关于 "${query}" 的信息...`,
    `[自定义结果 2] 更多 "${query}" 相关内容...`,
    `[自定义结果 3] ${query} 的详细解释...`,
  ];
}

// 创建带自定义搜索的 SearchTool
const customSearchTool = new SearchTool({
  searchFn: myCustomSearch,
});

// ============================================================
// 方式 2：继承 Tool 基类创建完整自定义工具
// ============================================================

/**
 * 完全自定义的搜索工具
 */
class MyAdvancedSearchTool extends Tool {
  private apiKey: string;

  constructor(apiKey: string) {
    super('advanced_search', '使用自定义 API 进行高级搜索，支持过滤和排序');
    this.apiKey = apiKey;
  }

  async run(params: ToolParameters): Promise<string> {
    const query = (params.input as string) ?? (params.query as string) ?? '';
    const limit = (params.limit as number) ?? 5;

    if (!query) {
      return '错误：搜索查询不能为空';
    }

    console.log(`[高级搜索] 查询: ${query}, 限制: ${limit}, API Key: ${this.apiKey.substring(0, 4)}...`);

    // 模拟高级搜索结果
    const results = [];
    for (let i = 1; i <= Math.min(limit, 5); i++) {
      results.push(`[高级结果 ${i}] ${query} - 详细信息 (相关度: ${(100 - i * 10)}%)`);
    }

    return results.join('\n');
  }

  getParameters(): ToolParameter[] {
    return [
      {
        name: 'input',
        type: 'string',
        description: '搜索关键词',
        required: true,
      },
      {
        name: 'limit',
        type: 'integer',
        description: '返回结果数量限制',
        required: false,
        default: 5,
      },
    ];
  }
}

// ============================================================
// 演示使用
// ============================================================

async function demo() {
  console.log('=== 自定义搜索工具示例 ===\n');

  // 测试方式 1
  console.log('--- 方式 1：注入 searchFn ---');
  const result1 = await customSearchTool.run({ input: 'TypeScript 教程' });
  console.log('结果:', result1);
  console.log();

  // 测试方式 2
  console.log('--- 方式 2：完整自定义工具 ---');
  const advancedTool = new MyAdvancedSearchTool('sk-demo-api-key');
  const result2 = await advancedTool.run({ input: 'AI Agent 框架', limit: 3 });
  console.log('结果:', result2);
  console.log();

  // 在 UnifiedAgent 中使用（需要配置 LLM）
  console.log('--- 在 Agent 中使用 ---');
  console.log('要在 Agent 中使用，请配置 .env 文件中的 LLM 相关环境变量');
  console.log('示例代码：');
  console.log(`
const llm = new HelloAgentsLLM();
const agent = new UnifiedAgent({
  name: 'SearchBot',
  llm,
  logger: new ConsoleLogger('INFO'),
});

agent.addTool(customSearchTool);
// 或
agent.addTool(new MyAdvancedSearchTool('your-api-key'));

const response = await agent.run('搜索 TypeScript 最佳实践');
`);
}

demo().catch(console.error);
