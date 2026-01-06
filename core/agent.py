"""Agent基类和各种Agent实现"""
from abc import ABC, abstractmethod
from typing import Optional, Any
from .message import Message
from .llm import HelloAgentsLLM
from .config import Config


class Agent(ABC):
    """Agent基类"""
    
    def __init__(
        self,
        name: str,
        llm: HelloAgentsLLM,
        system_prompt: Optional[str] = None,
        config: Optional[Config] = None
    ):
        self.name = name
        self.llm = llm
        self.system_prompt = system_prompt
        self.config = config or Config()
        self._history: list[Message] = []
    
    @abstractmethod
    def run(self, input_text: str, **kwargs) -> str:
        """运行Agent"""
        pass
    
    def add_message(self, message: Message):
        """添加消息到历史记录"""
        self._history.append(message)
    
    def clear_history(self):
        """清空历史记录"""
        self._history.clear()
    
    def get_history(self) -> list[Message]:
        """获取历史记录"""
        return self._history.copy()
    
    def __str__(self) -> str:
        return f"Agent(name={self.name}, provider={self.llm.provider})"


class SimpleAgent(Agent):
    """简单对话Agent基类"""
    
    def run(self, input_text: str, **kwargs) -> str:
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        for msg in self._history:
            messages.append({"role": msg.role, "content": msg.content})
        messages.append({"role": "user", "content": input_text})
        response = self.llm.think(messages, **kwargs)
        self.add_message(Message(input_text, "user"))
        self.add_message(Message(response, "assistant"))
        return response


class ReActAgent(Agent):
    """ReAct (Reasoning + Acting) Agent基类"""
    def run(self, input_text: str, **kwargs) -> str:
        raise NotImplementedError("ReActAgent子类必须实现run方法")


class ReflectionAgent(Agent):
    """反思Agent基类 - 支持生成-反思-改进循环"""
    def __init__(self, name: str, llm: HelloAgentsLLM, system_prompt: Optional[str] = None,
                 config: Optional[Config] = None, max_iterations: int = 2):
        super().__init__(name, llm, system_prompt, config)
        self.max_iterations = max_iterations
    
    def run(self, input_text: str, **kwargs) -> str:
        raise NotImplementedError("ReflectionAgent子类必须实现run方法")


class PlanAndSolveAgent(Agent):
    """计划与执行Agent基类 - Plan-Solve模式"""
    def run(self, input_text: str, **kwargs) -> str:
        raise NotImplementedError("PlanAndSolveAgent子类必须实现run方法")
