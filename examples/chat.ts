#!/usr/bin/env npx tsx
/**
 * 交互式聊天 - 与 MemoryAgent 进行命令行对话
 *
 * 运行命令：npx tsx examples/chat.ts
 */

import 'dotenv/config';
import * as readline from 'readline';
import {
  HelloAgentsLLM,
  MemoryAgent,
  CalculatorTool,
  SearchTool,
  ToolRegistry,
} from '../src/index.js';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
};

function print(text: string, color: string = colors.reset) {
  console.log(`${color}${text}${colors.reset}`);
}

async function main() {
  print('\n╔════════════════════════════════════════════════════════╗', colors.cyan);
  print('║        🧠 MemoryAgent 交互式对话                       ║', colors.cyan);
  print('╚════════════════════════════════════════════════════════╝', colors.cyan);

  print('\n正在初始化...', colors.dim);

  // 创建 LLM
  const llm = new HelloAgentsLLM();

  // 创建工具
  const toolRegistry = new ToolRegistry();
  toolRegistry.registerTool(new CalculatorTool());
  toolRegistry.registerTool(new SearchTool());

  // 创建 MemoryAgent
  const agent = new MemoryAgent({
    name: 'Assistant',
    llm,
    systemPrompt: `你是一个友好的 AI 助手，具有记忆能力。
你可以：
1. 记住用户告诉你的信息（姓名、偏好等）
2. 使用记忆中的知识回答问题
3. 使用计算器进行数学计算
4. 搜索信息

请用简洁友好的方式回复用户。`,
    userId: 'chat_user',
    toolRegistry,
    enableToolCalling: true,
    enableRAG: true,
    enableKnowledgeGraph: true,
    autoSaveConversation: true,
  });

  print('✅ 初始化完成！\n', colors.green);
  print('命令说明:', colors.yellow);
  print('  /help     - 显示帮助', colors.dim);
  print('  /stats    - 查看记忆统计', colors.dim);
  print('  /clear    - 清空记忆', colors.dim);
  print('  /add <知识>  - 添加知识到记忆', colors.dim);
  print('  /search <关键词> - 搜索记忆', colors.dim);
  print('  /exit     - 退出程序', colors.dim);
  print('\n直接输入内容即可开始对话。\n', colors.dim);

  // 创建 readline 接口
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(`${colors.green}👤 你: ${colors.reset}`, async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      // 处理命令
      if (trimmed.startsWith('/')) {
        await handleCommand(trimmed, agent);
        prompt();
        return;
      }

      // 正常对话
      try {
        print('\n🤔 思考中...', colors.dim);
        const response = await agent.run(trimmed);
        print(`\n${colors.blue}🤖 助手: ${colors.reset}${response}\n`);
      } catch (error) {
        print(`\n❌ 错误: ${error}`, colors.yellow);
      }

      prompt();
    });
  };

  // 处理退出
  rl.on('close', async () => {
    print('\n\n正在保存并关闭...', colors.dim);
    await agent.close();
    print('👋 再见！\n', colors.cyan);
    process.exit(0);
  });

  // 开始对话
  prompt();
}

async function handleCommand(input: string, agent: MemoryAgent) {
  const parts = input.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ');

  switch (command) {
    case 'help':
      print('\n📖 帮助信息:', colors.yellow);
      print('  /help           - 显示此帮助', colors.dim);
      print('  /stats          - 查看记忆统计信息', colors.dim);
      print('  /clear          - 清空所有记忆', colors.dim);
      print('  /add <内容>     - 添加知识到记忆库', colors.dim);
      print('  /search <关键词> - 搜索相关记忆', colors.dim);
      print('  /exit 或 Ctrl+C - 退出程序', colors.dim);
      print('');
      break;

    case 'stats':
      print('\n📊 记忆统计:', colors.yellow);
      try {
        const stats = await agent.getMemoryStats();
        print(`  总记忆数: ${stats.totalMemories}`, colors.dim);
        print(`  用户: ${stats.userId}`, colors.dim);
        print(`  启用类型: ${stats.enabledTypes.join(', ')}`, colors.dim);
        if (stats.memoriesByType.episodic) {
          print(`  情景记忆: ${stats.memoriesByType.episodic.count} 条`, colors.dim);
        }
        if (stats.memoriesByType.semantic) {
          print(`  语义记忆: ${stats.memoriesByType.semantic.count} 条`, colors.dim);
        }
      } catch (e) {
        print(`  获取统计失败: ${e}`, colors.yellow);
      }
      print('');
      break;

    case 'clear':
      print('\n🗑️ 正在清空记忆...', colors.yellow);
      try {
        await agent.clearMemories();
        print('✅ 记忆已清空\n', colors.green);
      } catch (e) {
        print(`❌ 清空失败: ${e}\n`, colors.yellow);
      }
      break;

    case 'add':
      if (!args) {
        print('\n⚠️ 请提供要添加的知识内容', colors.yellow);
        print('用法: /add <知识内容>\n', colors.dim);
        break;
      }
      print('\n📝 正在添加知识...', colors.dim);
      try {
        await agent.addKnowledge(args);
        print('✅ 知识已添加到记忆\n', colors.green);
      } catch (e) {
        print(`❌ 添加失败: ${e}\n`, colors.yellow);
      }
      break;

    case 'search':
      if (!args) {
        print('\n⚠️ 请提供搜索关键词', colors.yellow);
        print('用法: /search <关键词>\n', colors.dim);
        break;
      }
      print(`\n🔍 搜索 "${args}"...`, colors.dim);
      try {
        const results = await agent.searchMemories(args, { limit: 5 });
        if (results.length === 0) {
          print('  未找到相关记忆\n', colors.dim);
        } else {
          print(`  找到 ${results.length} 条相关记忆:`, colors.yellow);
          for (const item of results) {
            const preview = item.content.length > 60 
              ? item.content.substring(0, 60) + '...' 
              : item.content;
            print(`    - [${item.memoryType}] ${preview}`, colors.dim);
          }
          print('');
        }
      } catch (e) {
        print(`❌ 搜索失败: ${e}\n`, colors.yellow);
      }
      break;

    case 'exit':
    case 'quit':
    case 'q':
      process.emit('SIGINT');
      break;

    default:
      print(`\n⚠️ 未知命令: /${command}`, colors.yellow);
      print('输入 /help 查看可用命令\n', colors.dim);
  }
}

// 处理 Ctrl+C
process.on('SIGINT', () => {
  process.exit(0);
});

// 启动
main().catch((error) => {
  console.error('启动失败:', error);
  process.exit(1);
});
