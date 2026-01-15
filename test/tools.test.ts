/**
 * Tools 模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  Tool,
  SimpleTool,
  ToolParameter,
  createTool,
} from '../src/tools/base.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { CalculatorTool, calculate } from '../src/tools/builtin/calculator.js';
import { SearchTool, search } from '../src/tools/builtin/search.js';

describe('Tool Base', () => {
  it('should create a SimpleTool', () => {
    const params: ToolParameter[] = [
      { name: 'input', type: 'string', description: 'Input text', required: true },
    ];

    const tool = new SimpleTool('test', 'A test tool', params, (p) => `Result: ${p.input}`);

    expect(tool.name).toBe('test');
    expect(tool.description).toBe('A test tool');
    expect(tool.getParameters()).toEqual(params);
  });

  it('should run SimpleTool', () => {
    const tool = new SimpleTool(
      'echo',
      'Echo tool',
      [{ name: 'input', type: 'string', description: 'Input', required: true }],
      (p) => `Echo: ${p.input}`
    );

    const result = tool.run({ input: 'Hello' });
    expect(result).toBe('Echo: Hello');
  });

  it('should create tool with factory function', () => {
    const tool = createTool(
      'factory-tool',
      'Created by factory',
      [{ name: 'value', type: 'number', description: 'A number', required: true }],
      (p) => `Value is ${p.value}`
    );

    expect(tool.name).toBe('factory-tool');
    expect(tool.run({ value: 42 })).toBe('Value is 42');
  });

  it('should generate OpenAI schema', () => {
    const tool = new SimpleTool(
      'test',
      'Test tool',
      [
        { name: 'query', type: 'string', description: 'Search query', required: true },
        { name: 'limit', type: 'integer', description: 'Result limit', required: false, default: 10 },
      ],
      () => 'result'
    );

    const schema = tool.toOpenAISchema();
    expect(schema.type).toBe('function');
    expect(schema.function.name).toBe('test');
    expect(schema.function.parameters.properties).toHaveProperty('query');
    expect(schema.function.parameters.properties).toHaveProperty('limit');
    expect(schema.function.parameters.required).toContain('query');
    expect(schema.function.parameters.required).not.toContain('limit');
  });
});

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('should register a tool', () => {
    const tool = new SimpleTool('test', 'Test', [], () => 'ok');
    registry.registerTool(tool);
    expect(registry.getTool('test')).toBe(tool);
  });

  it('should register a function', () => {
    registry.registerFunction('greet', 'Say hello', (name) => `Hello, ${name}!`);
    const func = registry.getFunction('greet');
    expect(func).toBeDefined();
    expect(func!('World')).toBe('Hello, World!');
  });

  it('should list all tools', () => {
    registry.registerTool(new SimpleTool('tool1', 'Tool 1', [], () => '1'));
    registry.registerTool(new SimpleTool('tool2', 'Tool 2', [], () => '2'));
    registry.registerFunction('func1', 'Function 1', () => 'f1');

    const tools = registry.listTools();
    expect(tools).toContain('tool1');
    expect(tools).toContain('tool2');
    expect(tools).toContain('func1');
  });

  it('should unregister a tool', () => {
    registry.registerTool(new SimpleTool('test', 'Test', [], () => 'ok'));
    expect(registry.getTool('test')).toBeDefined();

    registry.unregister('test');
    expect(registry.getTool('test')).toBeUndefined();
  });

  it('should execute tool', async () => {
    registry.registerTool(
      new SimpleTool('double', 'Double a number', [], (p) => String(Number(p.input) * 2))
    );

    const result = await registry.executeTool('double', '21');
    expect(result).toBe('42');
  });

  it('should get tools description', () => {
    registry.registerTool(new SimpleTool('tool1', 'First tool', [], () => '1'));
    registry.registerFunction('func1', 'First function', () => 'f1');

    const desc = registry.getToolsDescription();
    expect(desc).toContain('tool1');
    expect(desc).toContain('First tool');
    expect(desc).toContain('func1');
    expect(desc).toContain('First function');
  });

  it('should clear all tools', () => {
    registry.registerTool(new SimpleTool('test', 'Test', [], () => 'ok'));
    registry.registerFunction('func', 'Func', () => 'f');

    registry.clear();
    expect(registry.size).toBe(0);
  });
});

describe('CalculatorTool', () => {
  it('should calculate basic operations', () => {
    const tool = new CalculatorTool();

    expect(tool.run({ input: '2 + 3' })).toBe('5');
    expect(tool.run({ input: '10 - 4' })).toBe('6');
    expect(tool.run({ input: '6 * 7' })).toBe('42');
    expect(tool.run({ input: '20 / 4' })).toBe('5');
  });

  it('should calculate complex expressions', () => {
    const tool = new CalculatorTool();

    expect(tool.run({ input: '(2 + 3) * 4' })).toBe('20');
    expect(tool.run({ input: 'sqrt(16)' })).toBe('4');
    expect(tool.run({ input: '2^10' })).toBe('1024');
  });

  it('should handle calculate convenience function', () => {
    expect(calculate('1 + 1')).toBe('2');
    expect(calculate('pi')).toContain('3.14');
  });

  it('should handle errors', () => {
    const tool = new CalculatorTool();
    const result = tool.run({ input: 'invalid expression @@#' });
    expect(result).toContain('计算失败');
  });
});

describe('SearchTool', () => {
  it('should return mock search results', async () => {
    const tool = new SearchTool();
    const result = await tool.run({ input: 'Python' });

    expect(result).toContain('Python');
    expect(result).toContain('编程');
  });

  it('should handle search convenience function', async () => {
    const result = await search('JavaScript');
    expect(result).toContain('JavaScript');
  });

  it('should return generic results for unknown queries', async () => {
    const tool = new SearchTool();
    const result = await tool.run({ input: 'unknown topic xyz' });

    expect(result).toContain('unknown topic xyz');
  });
});
