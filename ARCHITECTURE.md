# w-agent 项目架构说明

## 概述

w-agent 是一个模块化的 AI Agent 框架，提供了四种不同的 Agent 实现模式，每种模式适用于不同的应用场景。

## 核心架构

### 1. 层次结构

```
┌─────────────────────────────────────┐
│      测试层 (test/)                  │
│  - 各种 Agent 的测试用例             │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    实现层 (agents/)                  │
│  - MySimpleAgent                    │
│  - MyReActAgent                     │
│  - MyReflectionAgent                │
│  - MyPlanAndSolveAgent              │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    框架层 (hello_agents/)            │
│  - Agent 基类                        │
│  - 工具系统                          │
│  - 配置管理                          │
└─────────────────────────────────────┘
              ↓
┌─────────────────────────────────────┐
│    基础设施层                        │
│  - HelloAgentsLLM (LLM客户端)       │
│  - OpenAI API                       │
└─────────────────────────────────────┘
```

### 2. 模块关系图

```
hello_agents (包)
├── core/
│   ├── agent.py          → Agent, SimpleAgent, ReActAgent, 
│   │                       ReflectionAgent, PlanAndSolveAgent
│   ├── config.py         → Config
│   ├── message.py        → Message, MessageRole
│   └── llm.py           → HelloAgentsLLM (引用)
├── tools/
│   ├── base.py          → Tool (抽象基类)
│   ├── registry.py      → ToolRegistry
│   └── builtin/
│       └── calculator.py → CalculatorTool
└── __init__.py          → 统一导出接口

tools/                    (独立工具实现)
├── base.py
├── registry.py
└── builtin/
    ├── calculator.py
    └── search.py

agents/                   (Agent 具体实现)
├── simple_agent.py      → MySimpleAgent
├── react_agent.py       → MyReActAgent
├── reflection_agent.py  → MyReflectionAgent
└── plan_solve_agent.py  → MyPlanAndSolveAgent
```

## Agent 模式详解

### 1. SimpleAgent

**继承关系**: `MySimpleAgent → SimpleAgent → Agent`

**核心方法**:
- `run(input_text)`: 运行对话
- `stream_run(input_text)`: 流式响应
- `add_tool()`: 动态添加工具
- `has_tools()`: 检查工具状态

**特点**:
- 最简单的 Agent 实现
- 支持可选的工具调用
- 支持流式和非流式响应

### 2. ReActAgent

**继承关系**: `MyReActAgent → ReActAgent → Agent`

**核心方法**:
- `run(input_text)`: 运行 ReAct 循环
- `_parse_output(text)`: 解析 Thought 和 Action
- `_parse_action(action)`: 解析工具调用

**流程**:
```
输入 → Thought(思考) → Action(行动/工具调用) 
     → Observation(观察结果) → 循环 → Finish(完成)
```

**提示词结构**:
```
可用工具: [工具列表]
工作流程:
  Thought: [分析]
  Action: tool_name[params] 或 Finish[答案]
执行历史: [之前的执行记录]
```

### 3. ReflectionAgent

**继承关系**: `MyReflectionAgent → ReflectionAgent → Agent`

**核心方法**:
- `run(task)`: 运行反思循环
- `_generate_initial(task)`: 生成初始内容
- `_reflect(task, content)`: 反思评估
- `_refine(task, content, feedback)`: 精炼改进

**流程**:
```
任务 → 生成初始内容 
     → [反思循环开始]
     → 反思评估 → 精炼改进 
     → [循环 max_iterations 次]
     → 最终内容
```

**可定制提示词**:
- `initial`: 初始生成提示词
- `reflect`: 反思评估提示词
- `refine`: 精炼改进提示词

### 4. PlanAndSolveAgent

**继承关系**: `MyPlanAndSolveAgent → PlanAndSolveAgent → Agent`

**核心方法**:
- `run(question)`: 运行 Plan-Solve 流程
- `_make_plan(question)`: 制定计划
- `_parse_steps(plan)`: 解析步骤
- `_execute_step(step, context)`: 执行步骤
- `_summarize_results(question, results)`: 汇总结果

**流程**:
```
问题 → Planning(制定计划，分解步骤)
     → Solving(逐步执行，收集结果)
     → Summarizing(汇总结果，给出答案)
     → 最终答案
```

**三阶段详解**:
1. **Planning**: LLM 分析问题，生成步骤列表
2. **Solving**: 按顺序执行每个步骤，维护上下文
3. **Summarizing**: 基于所有步骤结果生成最终答案

## 工具系统

### Tool 基类

```python
class Tool(ABC):
    def __init__(self, name: str, description: str)
    @abstractmethod
    def run(self, *args, **kwargs) -> Any
```

### ToolRegistry

**核心功能**:
- `register_tool(tool)`: 注册工具类实例
- `register_function(name, desc, func)`: 注册函数作为工具
- `execute_tool(name, *args, **kwargs)`: 执行工具
- `get_tools_description()`: 获取工具描述（用于提示词）

**使用示例**:
```python
registry = ToolRegistry()

# 方式1: 注册工具类
registry.register_tool(CalculatorTool())

# 方式2: 注册函数
registry.register_function(
    name="search",
    description="搜索工具",
    func=search_function
)
```

## 消息系统

### Message 类

```python
class Message(BaseModel):
    content: str
    role: MessageRole  # "user" | "assistant" | "system" | "tool"
    timestamp: datetime
    metadata: Optional[Dict]
```

**作用**:
- 统一的消息格式
- 自动时间戳
- 支持元数据扩展
- 可转换为 OpenAI API 格式

## 配置系统

### Config 类

```python
class Config(BaseModel):
    default_model: str = "gpt-3.5-turbo"
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    debug: bool = False
    max_history_length: int = 100
```

**特性**:
- 支持从环境变量加载
- 使用 Pydantic 进行验证
- 可序列化为字典

## LLM 接口

### HelloAgentsLLM

**核心方法**:
- `think(messages, temperature)`: 调用 LLM（流式）
- `_auto_detect_provider()`: 自动检测提供商
- `_resolve_credentials()`: 解析凭证

**支持的提供商**:
- OpenAI
- ModelScope
- 智谱 AI (Zhipu)
- Ollama
- 其他 OpenAI 兼容接口

## 扩展指南

### 创建新的 Agent 类型

1. 继承合适的基类
2. 实现 `run()` 方法
3. 添加特定的辅助方法
4. 定义提示词模板

```python
from hello_agents import Agent, HelloAgentsLLM

class MyNewAgent(Agent):
    def run(self, input_text: str, **kwargs) -> str:
        # 实现你的逻辑
        pass
```

### 创建新的工具

1. 继承 `Tool` 基类
2. 实现 `run()` 方法
3. 注册到 ToolRegistry

```python
from hello_agents import Tool

class MyTool(Tool):
    def __init__(self):
        super().__init__("my_tool", "工具描述")
    
    def run(self, param: str) -> str:
        return f"处理结果: {param}"
```

## 最佳实践

### 1. Agent 选择

- **简单对话**: 使用 SimpleAgent
- **需要工具**: 使用 ReActAgent
- **内容生成**: 使用 ReflectionAgent
- **复杂推理**: 使用 PlanAndSolveAgent

### 2. 提示词设计

- 清晰定义任务目标
- 提供必要的上下文
- 使用结构化格式
- 包含示例（few-shot）

### 3. 错误处理

- LLM 调用失败时的降级策略
- 工具执行异常的捕获
- 迭代次数的限制

### 4. 性能优化

- 合理设置 max_iterations
- 使用流式响应提升体验
- 缓存常用工具结果
- 控制历史消息长度

## 测试策略

### 单元测试

每个 Agent 都有对应的测试文件:
- `test_simple_agent.py`: 测试基础对话和工具调用
- `test_react_agent.py`: 测试推理行动循环
- `test_reflection_agent.py`: 测试反思改进流程
- `test_plan_solve_agent.py`: 测试计划执行流程

### 集成测试

测试不同模块之间的协作:
- Agent + Tools
- Agent + LLM
- 完整的任务流程

## 未来扩展方向

1. **更多 Agent 模式**:
   - MultiAgent (多智能体协作)
   - HierarchicalAgent (层次化 Agent)
   - MemoryAgent (带记忆的 Agent)

2. **工具生态**:
   - 更多内置工具
   - 工具链 (Tool Chain)
   - 异步工具执行

3. **增强功能**:
   - 流式工具调用
   - 并行任务执行
   - 状态持久化

4. **可观测性**:
   - 详细的日志系统
   - 执行追踪
   - 性能监控

---

本文档随项目演进持续更新。
