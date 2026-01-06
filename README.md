# w-agent - AI Agent 框架

一个简单但强大的 AI Agent 框架，提供多种 Agent 实现模式，帮助开发者快速构建智能应用。

## ✨ 特性

- 🤖 **多种 Agent 模式**：支持 SimpleAgent、ReActAgent、ReflectionAgent、PlanAndSolveAgent
- 🔧 **工具系统**：灵活的工具注册和调用机制
- 🧩 **易于扩展**：清晰的基类设计，方便自定义实现
- 💬 **对话管理**：内置消息历史管理
- 🎯 **类型安全**：完整的类型提示支持

## 📦 安装

### 依赖要求

```bash
pip install -r requirements.txt
```

### 环境配置

复制 `.env.example` 到 `.env` 并配置你的 LLM 服务信息：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
LLM_MODEL_ID=your-model-name
LLM_API_KEY=your-api-key
LLM_BASE_URL=your-api-base-url
LLM_TIMEOUT=60
```

## 🚀 快速开始

### 1. SimpleAgent - 基础对话

```python
from dotenv import load_dotenv
from hello_agents import HelloAgentsLLM
from agents.simple_agent import MySimpleAgent

load_dotenv()
llm = HelloAgentsLLM()

agent = MySimpleAgent(
    name="助手",
    llm=llm,
    system_prompt="你是一个友好的AI助手"
)

response = agent.run("你好，介绍一下自己")
print(response)
```

### 2. ReActAgent - 推理与行动

```python
from hello_agents import HelloAgentsLLM, ToolRegistry
from hello_agents.tools import CalculatorTool
from agents.react_agent import MyReActAgent

llm = HelloAgentsLLM()

# 注册工具
tool_registry = ToolRegistry()
tool_registry.register_tool(CalculatorTool())

agent = MyReActAgent(
    name="推理助手",
    llm=llm,
    tool_registry=tool_registry,
    max_steps=5
)

result = agent.run("计算 (15 * 8) + 32 的结果")
print(result)
```

### 3. ReflectionAgent - 反思与改进

```python
from hello_agents import HelloAgentsLLM
from agents.reflection_agent import MyReflectionAgent

llm = HelloAgentsLLM()

agent = MyReflectionAgent(
    name="反思助手",
    llm=llm,
    max_iterations=2
)

result = agent.run("写一篇关于人工智能的简短文章")
print(result)
```

### 4. PlanAndSolveAgent - 计划与执行

```python
from hello_agents import HelloAgentsLLM
from agents.plan_solve_agent import MyPlanAndSolveAgent

llm = HelloAgentsLLM()

agent = MyPlanAndSolveAgent(
    name="规划助手",
    llm=llm
)

question = "一个水果店周一卖出15个苹果，周二卖出周一的两倍，周三卖出比周二少5个。三天总共卖出多少个？"
result = agent.run(question)
print(result)
```

## 📖 Agent 模式详解

### SimpleAgent

**适用场景**：基础对话、简单问答

**特点**：

- 支持系统提示词
- 自动管理对话历史
- 可选工具调用能力

### ReActAgent

**适用场景**：需要工具协助的复杂任务

**特点**：

- Thought-Action-Observation 循环
- 支持多轮工具调用
- 自动推理决策

**流程**：

```
用户问题 → 思考(Thought) → 行动(Action) → 观察(Observation) → ... → 最终答案
```

### ReflectionAgent

**适用场景**：需要多次优化的内容生成任务

**特点**：

- Generate-Reflect-Refine 循环
- 支持自定义提示词模板
- 可配置迭代次数

**流程**：

```
任务 → 生成初始内容 → 反思评估 → 精炼改进 → (循环) → 最终内容
```

### PlanAndSolveAgent

**适用场景**：多步骤推理问题

**特点**：

- 计划-执行-汇总三阶段
- 自动分解复杂问题
- 逐步执行并追踪结果

**流程**：

```
问题 → 制定计划(Planning) → 执行步骤(Solving) → 汇总结果(Summarizing) → 答案
```

## 🏗️ 项目结构

```
w-agent/
├── hello_agents/           # 框架核心包
│   ├── __init__.py        # 包导出
│   ├── core/              # 核心模块
│   │   ├── agent.py       # Agent基类
│   │   ├── config.py      # 配置管理
│   │   ├── message.py     # 消息系统
│   │   └── llm.py         # LLM接口
│   └── tools/             # 工具系统
│       └── __init__.py
├── agents/                # Agent实现
│   ├── simple_agent.py    # SimpleAgent实现
│   ├── react_agent.py     # ReActAgent实现
│   ├── reflection_agent.py # ReflectionAgent实现
│   └── plan_solve_agent.py # PlanAndSolveAgent实现
├── tools/                 # 工具定义
│   ├── base.py           # 工具基类
│   ├── registry.py       # 工具注册表
│   └── builtin/          # 内置工具
│       ├── calculator.py  # 计算器工具
│       └── search.py      # 搜索工具
├── core/                  # 核心定义（原始）
│   ├── agent.py
│   ├── config.py
│   └── message.py
├── test/                  # 测试文件
│   ├── test_simple_agent.py
│   ├── test_react_agent.py
│   ├── test_reflection_agent.py
│   └── test_plan_solve_agent.py
├── HelloAgentsLLM.py      # LLM客户端
├── requirements.txt       # 依赖列表
├── .env.example          # 环境变量示例
└── README.md             # 本文件
```

## 🔧 自定义 Agent

所有 Agent 都继承自基类，你可以轻松创建自己的 Agent：

```python
from hello_agents import Agent, HelloAgentsLLM, Message

class MyCustomAgent(Agent):
    def run(self, input_text: str, **kwargs) -> str:
        # 实现你的逻辑
        messages = [{"role": "user", "content": input_text}]
        response = self.llm.think(messages)

        # 保存历史
        self.add_message(Message(input_text, "user"))
        self.add_message(Message(response, "assistant"))

        return response
```

## 🛠️ 工具系统

### 创建自定义工具

```python
from hello_agents import Tool

class MyTool(Tool):
    def __init__(self):
        super().__init__(
            name="my_tool",
            description="我的自定义工具"
        )

    def run(self, *args, **kwargs):
        # 实现工具逻辑
        return "工具执行结果"
```

### 注册工具

```python
from hello_agents import ToolRegistry

registry = ToolRegistry()
registry.register_tool(MyTool())

# 或注册函数
def my_function(text: str) -> str:
    return f"处理: {text}"

registry.register_function(
    name="my_func",
    description="我的函数工具",
    func=my_function
)
```

## 📝 运行测试

```bash
# 测试 SimpleAgent
python test/test_simple_agent.py

# 测试 ReActAgent
python test/test_react_agent.py

# 测试 ReflectionAgent
python test/test_reflection_agent.py

# 测试 PlanAndSolveAgent
python test/test_plan_solve_agent.py
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

本项目参考 hello-agent：
-hello-agent

---

**Happy Coding! 🎉**
