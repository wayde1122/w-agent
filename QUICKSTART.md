# 快速开始指南

## 🎯 5分钟上手 w-agent

### 步骤 1: 环境准备

```bash
# 克隆或下载项目后，进入项目目录
cd w-agent

# 安装依赖
pip install -r requirements.txt
```

### 步骤 2: 配置 LLM

创建 `.env` 文件（或复制 `env.example`）：

```env
LLM_MODEL_ID=your-model-name
LLM_API_KEY=your-api-key
LLM_BASE_URL=your-api-base-url
LLM_TIMEOUT=60
```

**常见配置示例**:

```env
# OpenAI
LLM_MODEL_ID=gpt-3.5-turbo
LLM_API_KEY=sk-xxxxxxxxxxxxx
LLM_BASE_URL=https://api.openai.com/v1

# ModelScope
LLM_MODEL_ID=qwen-turbo
LLM_API_KEY=ms-xxxxxxxxxxxxxx
LLM_BASE_URL=https://api-inference.modelscope.cn/v1/

# 本地 Ollama
LLM_MODEL_ID=llama2
LLM_API_KEY=not-needed
LLM_BASE_URL=http://localhost:11434/v1
```

### 步骤 3: 运行第一个 Agent

创建 `quick_start.py`:

```python
from dotenv import load_dotenv
from hello_agents import HelloAgentsLLM
from agents.reflection_agent import MyReflectionAgent

# 加载环境变量
load_dotenv()

# 创建 LLM 实例
llm = HelloAgentsLLM()

# 创建反思 Agent
agent = MyReflectionAgent(
    name="写作助手",
    llm=llm,
    max_iterations=2
)

# 运行任务
result = agent.run("写一篇关于 AI Agent 的 50 字简介")
print("\n" + "="*50)
print("最终结果:")
print(result)
```

运行：

```bash
python quick_start.py
```

### 步骤 4: 运行示例测试

```bash
# 测试反思 Agent
python test/test_reflection_agent.py

# 测试计划执行 Agent
python test/test_plan_solve_agent.py

# 测试基础 Agent
python test/test_simple_agent.py

# 测试 ReAct Agent
python test/test_react_agent.py
```

## 📚 常见场景示例

### 场景 1: 内容创作与优化

```python
from hello_agents import HelloAgentsLLM
from agents.reflection_agent import MyReflectionAgent

llm = HelloAgentsLLM()
writer = MyReflectionAgent(name="文案助手", llm=llm)

# 生成并优化文案
content = writer.run("为一款智能手表写一段产品描述")
print(content)
```

### 场景 2: 数学问题求解

```python
from hello_agents import HelloAgentsLLM
from agents.plan_solve_agent import MyPlanAndSolveAgent

llm = HelloAgentsLLM()
solver = MyPlanAndSolveAgent(name="数学助手", llm=llm)

# 解决应用题
question = """
小明有 10 个苹果，小红有小明的 2 倍，小李比小红多 5 个。
三个人一共有多少个苹果？
"""
answer = solver.run(question)
print(answer)
```

### 场景 3: 代码生成与优化

```python
from hello_agents import HelloAgentsLLM
from agents.reflection_agent import MyReflectionAgent

llm = HelloAgentsLLM()

# 自定义代码生成提示词
code_prompts = {
    "initial": "作为 Python 专家，实现：{task}",
    "reflect": "审查代码的效率和可读性：\n{content}",
    "refine": "根据建议优化代码：\n原代码：{content}\n建议：{feedback}"
}

coder = MyReflectionAgent(
    name="代码助手",
    llm=llm,
    custom_prompts=code_prompts,
    max_iterations=2
)

code = coder.run("实现一个快速排序函数")
print(code)
```

### 场景 4: 带工具的对话 Agent

```python
from hello_agents import HelloAgentsLLM, ToolRegistry
from hello_agents.tools import CalculatorTool
from agents.simple_agent import MySimpleAgent

llm = HelloAgentsLLM()

# 注册工具
registry = ToolRegistry()
registry.register_tool(CalculatorTool())

# 创建带工具的 Agent
assistant = MySimpleAgent(
    name="智能助手",
    llm=llm,
    tool_registry=registry,
    enable_tool_calling=True
)

result = assistant.run("帮我计算 123 * 456")
print(result)
```

## 🔧 自定义开发

### 创建自定义 Agent

```python
from hello_agents import Agent, HelloAgentsLLM, Message

class MyCustomAgent(Agent):
    """自定义 Agent 示例"""
    
    def run(self, input_text: str, **kwargs) -> str:
        # 1. 准备消息
        messages = [
            {"role": "system", "content": "你是一个专业助手"},
            {"role": "user", "content": input_text}
        ]
        
        # 2. 调用 LLM
        response = self.llm.think(messages)
        
        # 3. 保存历史
        self.add_message(Message(input_text, "user"))
        self.add_message(Message(response, "assistant"))
        
        return response

# 使用自定义 Agent
llm = HelloAgentsLLM()
my_agent = MyCustomAgent(name="我的Agent", llm=llm)
result = my_agent.run("你好")
```

### 创建自定义工具

```python
from hello_agents import Tool, ToolRegistry

class WeatherTool(Tool):
    """天气查询工具示例"""
    
    def __init__(self):
        super().__init__(
            name="weather",
            description="查询城市天气"
        )
    
    def run(self, city: str) -> str:
        # 实现天气查询逻辑
        return f"{city}的天气是晴天"

# 注册并使用
registry = ToolRegistry()
registry.register_tool(WeatherTool())

result = registry.execute_tool("weather", city="北京")
print(result)
```

## 💡 常见问题

### Q1: 如何切换不同的 LLM 提供商？

修改 `.env` 文件中的配置即可：

```env
# 切换到 ModelScope
LLM_MODEL_ID=qwen-turbo
LLM_API_KEY=your-modelscope-key
LLM_BASE_URL=https://api-inference.modelscope.cn/v1/
```

### Q2: 如何控制生成内容的质量？

通过 `temperature` 参数：

```python
# 更确定的输出（temperature 接近 0）
result = agent.run("任务描述", temperature=0.1)

# 更有创意的输出（temperature 接近 1）
result = agent.run("任务描述", temperature=0.9)
```

### Q3: 如何增加反思迭代次数？

```python
agent = MyReflectionAgent(
    name="助手",
    llm=llm,
    max_iterations=3  # 增加到 3 次
)
```

### Q4: 如何查看执行过程？

所有 Agent 都有详细的日志输出：

```
🤖 反思助手 开始处理任务: ...
--- 步骤1: 生成初始内容 ---
🧠 正在调用 模型...
✅ 初始内容已生成
--- 步骤2: 第 1 轮反思与精炼 ---
💭 反思意见: ...
✅ 内容已精炼
```

### Q5: 如何保存对话历史？

```python
# 获取历史记录
history = agent.get_history()
for msg in history:
    print(f"{msg.role}: {msg.content}")

# 清空历史
agent.clear_history()
```

## 📖 下一步

- 📚 阅读 [README.md](README.md) 了解完整功能
- 🏗️ 阅读 [ARCHITECTURE.md](ARCHITECTURE.md) 理解架构设计
- 🧪 运行 `test/` 目录下的所有测试
- 🔨 尝试创建自己的 Agent 和工具

## 🆘 获取帮助

- 查看项目文档
- 运行测试示例
- 查看源代码注释

---

祝你使用愉快！🎉
