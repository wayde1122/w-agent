/**
 * ToolExecutor 测试
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ToolExecutor,
  ToolCallRequest,
  createToolExecutor,
} from "../src/tools/executor.js";
import { ToolRegistry } from "../src/tools/registry.js";
import { SimpleTool } from "../src/tools/base.js";

describe("ToolExecutor", () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new ToolRegistry();

    // 注册测试工具
    registry.registerTool(
      new SimpleTool(
        "echo",
        "Echo back the input",
        [
          {
            name: "input",
            type: "string",
            description: "Input text",
            required: true,
          },
        ],
        (params) => `Echo: ${params.input}`
      )
    );

    registry.registerTool(
      new SimpleTool(
        "add",
        "Add two numbers",
        [
          {
            name: "a",
            type: "number",
            description: "First number",
            required: true,
          },
          {
            name: "b",
            type: "number",
            description: "Second number",
            required: true,
          },
        ],
        (params) => String(Number(params.a) + Number(params.b))
      )
    );

    executor = createToolExecutor({ registry });
  });

  describe("execute", () => {
    it("should execute a tool successfully", async () => {
      const call: ToolCallRequest = {
        id: "test_1",
        name: "echo",
        arguments: { input: "Hello" },
      };

      const result = await executor.execute(call);

      expect(result.id).toBe("test_1");
      expect(result.name).toBe("echo");
      expect(result.success).toBe(true);
      expect(result.output).toBe("Echo: Hello");
      expect(result.error).toBeUndefined();
    });

    it("should handle tool not found", async () => {
      const call: ToolCallRequest = {
        id: "test_2",
        name: "nonexistent",
        arguments: {},
      };

      const result = await executor.execute(call);

      expect(result.success).toBe(true); // registry.executeTool 返回错误字符串而非抛出
      expect(result.output).toContain("错误");
    });

    it("should execute multiple tools", async () => {
      const calls: ToolCallRequest[] = [
        { id: "call_1", name: "echo", arguments: { input: "A" } },
        { id: "call_2", name: "add", arguments: { a: 1, b: 2 } },
      ];

      const results = await executor.executeAll(calls);

      expect(results).toHaveLength(2);
      expect(results[0].output).toBe("Echo: A");
      expect(results[1].output).toBe("3");
    });
  });

  describe("parseFromText - JSON block protocol", () => {
    it("should parse JSON block format", () => {
      const text = `
Here is my response.
[[TOOL_CALL]]
{"name":"echo","arguments":{"input":"test"}}
[[/TOOL_CALL]]
Done.
`;
      const calls = executor.parseFromText(text);

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("echo");
      expect(calls[0].arguments).toEqual({ input: "test" });
    });

    it("should parse multiple JSON blocks", () => {
      const text = `
[[TOOL_CALL]]
{"name":"echo","arguments":{"input":"first"}}
[[/TOOL_CALL]]
[[TOOL_CALL]]
{"name":"add","arguments":{"a":1,"b":2}}
[[/TOOL_CALL]]
`;
      const calls = executor.parseFromText(text);

      expect(calls).toHaveLength(2);
      expect(calls[0].name).toBe("echo");
      expect(calls[1].name).toBe("add");
    });

    it("should handle malformed JSON gracefully", () => {
      const text = `
[[TOOL_CALL]]
{invalid json}
[[/TOOL_CALL]]
`;
      const calls = executor.parseFromText(text);

      // 应该不抛出，但可能返回空数组
      expect(calls).toHaveLength(0);
    });
  });

  describe("parseFromText - Legacy protocol", () => {
    it("should parse legacy format", () => {
      const text = "I will search: [TOOL_CALL:echo:Hello World]";
      const calls = executor.parseFromText(text);

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("echo");
      expect(calls[0].arguments.input).toBe("Hello World");
    });

    it("should parse legacy format with key=value", () => {
      const text = "[TOOL_CALL:add:a=5,b=3]";
      const calls = executor.parseFromText(text);

      expect(calls).toHaveLength(1);
      expect(calls[0].name).toBe("add");
      expect(calls[0].arguments.a).toBe(5);
      expect(calls[0].arguments.b).toBe(3);
    });

    it("should prefer JSON block over legacy if both present", () => {
      const text = `
[[TOOL_CALL]]
{"name":"echo","arguments":{"input":"json"}}
[[/TOOL_CALL]]
[TOOL_CALL:echo:legacy]
`;
      const calls = executor.parseFromText(text);

      // JSON 块优先
      expect(calls).toHaveLength(1);
      expect(calls[0].arguments.input).toBe("json");
    });
  });

  describe("formatAsText", () => {
    it("should format success result", () => {
      const text = executor.formatAsText({
        id: "test",
        name: "echo",
        output: "Hello",
        success: true,
      });

      expect(text).toContain("echo");
      expect(text).toContain("Hello");
    });

    it("should format error result", () => {
      const text = executor.formatAsText({
        id: "test",
        name: "echo",
        output: "",
        error: "Something went wrong",
        success: false,
      });

      expect(text).toContain("失败");
      expect(text).toContain("Something went wrong");
    });
  });

  describe("formatAsToolMessage", () => {
    it("should format as OpenAI tool message", () => {
      const msg = executor.formatAsToolMessage({
        id: "call_123",
        name: "echo",
        output: "Result",
        success: true,
      });

      expect(msg.role).toBe("tool");
      expect(msg.tool_call_id).toBe("call_123");
      expect(msg.content).toBe("Result");
    });
  });
});

describe("ToolExecutor - Value parsing", () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = createToolExecutor({ registry });
  });

  it("should parse numeric values", () => {
    const text = "[TOOL_CALL:test:value=42]";
    const calls = executor.parseFromText(text);

    expect(calls[0].arguments.value).toBe(42);
  });

  it("should parse boolean values", () => {
    const text = "[TOOL_CALL:test:flag=true]";
    const calls = executor.parseFromText(text);

    expect(calls[0].arguments.flag).toBe(true);
  });

  it("should keep string values as strings", () => {
    const text = "[TOOL_CALL:test:name=hello]";
    const calls = executor.parseFromText(text);

    expect(calls[0].arguments.name).toBe("hello");
  });
});
