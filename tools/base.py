"""工具基类定义"""
from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class Tool(ABC):
    """工具抽象基类"""
    
    def __init__(self, name: str, description: str):
        """
        初始化工具
        
        Args:
            name: 工具名称
            description: 工具描述
        """
        self.name = name
        self.description = description
    
    @abstractmethod
    def run(self, *args, **kwargs) -> Any:
        """
        执行工具
        
        Returns:
            工具执行结果
        """
        pass
    
    def __str__(self) -> str:
        return f"Tool(name={self.name})"
    
    def __repr__(self) -> str:
        return self.__str__()
