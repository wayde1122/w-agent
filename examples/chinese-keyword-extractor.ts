/**
 * 中文关键词提取示例
 *
 * 演示如何为 MemoryAgent 注入自定义的中文关键词提取函数。
 *
 * 默认的 keywordExtractor 使用空格分词，不适合中文。
 * 本示例展示几种中文分词方案：
 * 1. 简单的正则匹配（无依赖）
 * 2. 使用 jieba 等分词库（需要安装）
 */

import {
  HelloAgentsLLM,
  MemoryAgent,
  KeywordExtractor,
  defaultKeywordExtractor,
  ConsoleLogger,
} from '../src/index.js';

// ============================================================
// 方案 1：简单的中文关键词提取（无依赖）
// ============================================================

/**
 * 简单的中文关键词提取
 * 基于规则提取 2-4 字的中文词组
 * 注意：这是一个简化实现，效果有限
 */
const simpleChineseExtractor: KeywordExtractor = (text: string): string[] => {
  const keywords: string[] = [];

  // 提取连续的中文字符序列（2-4 字）
  const chinesePattern = /[\u4e00-\u9fa5]{2,4}/g;
  const matches = text.match(chinesePattern);
  if (matches) {
    keywords.push(...matches);
  }

  // 提取英文单词
  const englishPattern = /[a-zA-Z]+/g;
  const englishMatches = text.match(englishPattern);
  if (englishMatches) {
    keywords.push(...englishMatches.filter((w) => w.length >= 2));
  }

  // 去重
  return [...new Set(keywords)];
};

// ============================================================
// 方案 2：基于词典的简单分词（无依赖）
// ============================================================

/**
 * 基于简单词典的分词器
 * 实际使用时可以扩展词典或使用更完整的分词库
 */
class SimpleDictTokenizer {
  private dict: Set<string>;

  constructor(words: string[]) {
    this.dict = new Set(words);
  }

  tokenize(text: string): string[] {
    const result: string[] = [];
    let i = 0;

    while (i < text.length) {
      let matched = false;

      // 尝试匹配最长的词（最大匹配算法）
      for (let len = 4; len >= 2; len--) {
        const word = text.substring(i, i + len);
        if (this.dict.has(word)) {
          result.push(word);
          i += len;
          matched = true;
          break;
        }
      }

      if (!matched) {
        i++;
      }
    }

    return result;
  }
}

// 示例词典（实际使用时应该更完整）
const sampleDict = [
  '人工智能',
  '机器学习',
  '深度学习',
  '自然语言',
  '语言处理',
  '神经网络',
  '知识图谱',
  '图数据库',
  '向量数据库',
  'Python',
  'TypeScript',
  'JavaScript',
  'Agent',
  'LLM',
  'RAG',
];

const dictTokenizer = new SimpleDictTokenizer(sampleDict);

/**
 * 基于词典的关键词提取
 */
const dictBasedExtractor: KeywordExtractor = (text: string): string[] => {
  const dictKeywords = dictTokenizer.tokenize(text);

  // 同时提取英文单词
  const englishPattern = /[a-zA-Z]+/g;
  const englishMatches = text.match(englishPattern);
  if (englishMatches) {
    dictKeywords.push(...englishMatches.filter((w) => w.length >= 2));
  }

  return [...new Set(dictKeywords)];
};

// ============================================================
// 方案 3：使用 jieba 分词库（需要安装 nodejieba）
// ============================================================

/**
 * jieba 分词适配器
 *
 * 使用前需要安装：npm install nodejieba
 *
 * 注意：nodejieba 是 C++ 扩展，某些环境可能需要编译工具
 */
function createJiebaExtractor(): KeywordExtractor | null {
  try {
    // 动态导入，避免未安装时报错
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const jieba = require('nodejieba');

    return (text: string): string[] => {
      const words = jieba.cut(text, true); // 精确模式
      return [...new Set(words.filter((w: string) => w.length >= 2))];
    };
  } catch {
    console.log('[提示] nodejieba 未安装，使用简单分词');
    return null;
  }
}

// ============================================================
// 演示使用
// ============================================================

async function demo() {
  console.log('=== 中文关键词提取示例 ===\n');

  const testTexts = [
    '人工智能和机器学习是深度学习的基础',
    '我想学习 Python 和 TypeScript 编程',
    '知识图谱可以存储在 Neo4j 图数据库中',
    'LLM Agent 可以使用 RAG 技术增强回答质量',
  ];

  console.log('--- 默认提取器（空格分词，不适合中文）---');
  for (const text of testTexts) {
    console.log(`输入: "${text}"`);
    console.log(`提取: [${defaultKeywordExtractor(text).join(', ')}]`);
    console.log();
  }

  console.log('--- 简单中文提取器 ---');
  for (const text of testTexts) {
    console.log(`输入: "${text}"`);
    console.log(`提取: [${simpleChineseExtractor(text).join(', ')}]`);
    console.log();
  }

  console.log('--- 基于词典的提取器 ---');
  for (const text of testTexts) {
    console.log(`输入: "${text}"`);
    console.log(`提取: [${dictBasedExtractor(text).join(', ')}]`);
    console.log();
  }

  // 尝试 jieba
  const jiebaExtractor = createJiebaExtractor();
  if (jiebaExtractor) {
    console.log('--- jieba 分词提取器 ---');
    for (const text of testTexts) {
      console.log(`输入: "${text}"`);
      console.log(`提取: [${jiebaExtractor(text).join(', ')}]`);
      console.log();
    }
  }

  // 在 MemoryAgent 中使用
  console.log('--- 在 MemoryAgent 中使用 ---');
  console.log('要在 MemoryAgent 中使用自定义提取器，请配置 .env 文件中的 LLM 相关环境变量');
  console.log('示例代码：');
  console.log(`
import { MemoryAgent, ConsoleLogger } from 'w-agent';

const agent = new MemoryAgent({
  name: 'ChineseBot',
  llm: new HelloAgentsLLM(),
  logger: new ConsoleLogger('DEBUG'),
  // 注入自定义关键词提取器
  keywordExtractor: simpleChineseExtractor,
  // 或使用词典方案
  // keywordExtractor: dictBasedExtractor,
});

// 现在 MemoryAgent 在检索知识图谱时会使用中文友好的关键词提取
const response = await agent.run('人工智能和机器学习有什么区别？');
`);
}

demo().catch(console.error);

// 导出以便其他文件使用
export {
  simpleChineseExtractor,
  dictBasedExtractor,
  SimpleDictTokenizer,
  createJiebaExtractor,
};
