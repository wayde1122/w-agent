MY_REACT_PROMPT = """你是一个具备推理和行动能力的AI助手。你可以通过思考分析问题，然后调用合适的工具来获取信息，最终给出准确的答案。

## 可用工具
{tools}

## 工作流程
请严格按照以下格式进行回应，每次只能执行一个步骤：

Thought: 你的思考过程，用于分析问题、拆解任务和规划下一步行动。
Action: 你决定采取的行动，必须是以下格式之一：
- `{{tool_name}}[{{tool_input}}]` - 调用指定工具
- `Finish[最终答案]` - 当你有足够信息给出最终答案时

## 重要提醒
1. 每次回应必须包含Thought和Action两部分
2. 工具调用的格式必须严格遵循：工具名[参数]
3. 只有当你确信有足够信息回答问题时，才使用Finish
4. 如果工具返回的信息不够，继续使用其他工具或相同工具的不同参数

## 当前任务
**Question:** {question}

## 执行历史
{history}

现在开始你的推理和行动：
"""

import re
from typing import Optional, List, Tuple
from core.agent import ReActAgent
from core.llm import HelloAgentsLLM
from core.config import Config
from core.message import Message
from tools.registry import ToolRegistry

class MyReActAgent(ReActAgent):
    """
    重写的ReAct Agent - 推理与行动结合的智能体
    """

    def __init__(
        self,
        name: str,
        llm: HelloAgentsLLM,
        tool_registry: ToolRegistry,
        system_prompt: Optional[str] = None,
        config: Optional[Config] = None,
        max_steps: int = 5,
        custom_prompt: Optional[str] = None
    ):
        super().__init__(name, llm, system_prompt, config)
        self.tool_registry = tool_registry
        self.max_steps = max_steps
        self.current_history: List[str] = []
        self.prompt_template = custom_prompt if custom_prompt else MY_REACT_PROMPT
        print(f"[OK] {name} 初始化完成，最大步数: {max_steps}")

    def run(self, input_text: str, **kwargs) -> str:
        """运行ReAct Agent"""
        self.current_history = []
        current_step = 0

        print(f"\n[Agent] {self.name} 开始处理问题: {input_text}")

        while current_step < self.max_steps:
            current_step += 1
            print(f"\n--- 第 {current_step} 步 ---")

            # 1. 构建提示词
            tools_desc = self.tool_registry.get_tools_description()
            history_str = "\n".join(self.current_history)
            prompt = self.prompt_template.format(
                tools=tools_desc,
                question=input_text,
                history=history_str
            )

            # 2. 调用LLM
            messages = [{"role": "user", "content": prompt}]
            response_text = self.llm.think(messages, **kwargs)
            
            # 处理 LLM 返回错误的情况
            if response_text is None or response_text.startswith("[API"):
                self.add_message(Message(input_text, "user"))
                error_msg = response_text or "[Error] LLM 返回空响应"
                self.add_message(Message(error_msg, "assistant"))
                return error_msg

            # 3. 解析输出
            thought, action = self._parse_output(response_text)

            # 4. 检查完成条件
            if action and action.startswith("Finish"):
                final_answer = self._parse_action_input(action)
                self.add_message(Message(input_text, "user"))
                self.add_message(Message(final_answer, "assistant"))
                return final_answer

            # 5. 执行工具调用
            if action:
                tool_name, tool_input = self._parse_action(action)
                observation = self.tool_registry.execute_tool(tool_name, tool_input)
                self.current_history.append(f"Action: {action}")
                self.current_history.append(f"Observation: {observation}")

        # 达到最大步数
        final_answer = "抱歉，我无法在限定步数内完成这个任务。"
        self.add_message(Message(input_text, "user"))
        self.add_message(Message(final_answer, "assistant"))
        return final_answer

    def _parse_output(self, response_text: str) -> Tuple[Optional[str], Optional[str]]:
        """
        解析 LLM 输出，提取 Thought 和 Action
        
        Returns:
            (thought, action) 元组
        """
        thought = None
        action = None
        
        # 提取 Thought
        thought_match = re.search(r'Thought:\s*(.+?)(?=Action:|$)', response_text, re.DOTALL)
        if thought_match:
            thought = thought_match.group(1).strip()
            print(f"[Think] {thought[:100]}..." if len(thought) > 100 else f"[Think] {thought}")
        
        # 提取 Action
        action_match = re.search(r'Action:\s*(.+?)(?=Thought:|Observation:|$)', response_text, re.DOTALL)
        if action_match:
            action = action_match.group(1).strip()
            # 清理多余的换行和空格
            action = action.split('\n')[0].strip()
            print(f"[Action] {action}")
        
        return thought, action

    def _parse_action(self, action: str) -> Tuple[str, str]:
        """
        解析 Action 字符串，提取工具名和输入参数
        格式: tool_name[tool_input]
        
        Returns:
            (tool_name, tool_input) 元组
        """
        # 匹配 tool_name[input] 格式
        match = re.match(r'(\w+)\[(.+?)\]', action)
        if match:
            return match.group(1), match.group(2)
        
        # 匹配 tool_name(input) 格式（备用）
        match = re.match(r'(\w+)\((.+?)\)', action)
        if match:
            return match.group(1), match.group(2)
        
        return action, ""

    def _parse_action_input(self, action: str) -> str:
        """
        从 Finish[答案] 中提取最终答案
        """
        match = re.search(r'Finish\[(.+?)\]', action, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # 备用格式
        match = re.search(r'Finish\((.+?)\)', action, re.DOTALL)
        if match:
            return match.group(1).strip()
        
        # 如果没有括号，返回 Finish 后的所有内容
        if action.startswith("Finish"):
            return action[6:].strip()
        
        return action