"""工具注册表"""
from typing import Dict, Any, Callable, Optional
from .base import Tool


class ToolRegistry:
    """工具注册表，管理所有可用工具"""
    
    def __init__(self):
        """初始化工具注册表"""
        self._tools: Dict[str, Tool] = {}
        self._functions: Dict[str, Dict[str, Any]] = {}
        print("[OK] 工具注册表初始化完成")
    
    def register_tool(self, tool: Tool) -> None:
        """
        注册工具类实例
        
        Args:
            tool: Tool实例
        """
        if not isinstance(tool, Tool):
            raise TypeError(f"必须是Tool类型，得到: {type(tool)}")
        
        self._tools[tool.name] = tool
        print(f"[TOOL] 工具 '{tool.name}' 已注册")
    
    def register_function(
        self, 
        name: str, 
        description: str, 
        func: Callable
    ) -> None:
        """
        注册函数作为工具
        
        Args:
            name: 工具名称
            description: 工具描述
            func: 可调用函数
        """
        self._functions[name] = {
            "description": description,
            "func": func
        }
        print(f"[TOOL] 函数工具 '{name}' 已注册")
    
    def unregister(self, name: str) -> bool:
        """
        注销工具
        
        Args:
            name: 工具名称
            
        Returns:
            是否成功注销
        """
        if name in self._tools:
            del self._tools[name]
            return True
        if name in self._functions:
            del self._functions[name]
            return True
        return False
    
    def get_tool(self, name: str) -> Optional[Tool]:
        """
        获取工具实例
        
        Args:
            name: 工具名称
            
        Returns:
            工具实例，如果不存在返回None
        """
        return self._tools.get(name)
    
    def list_tools(self) -> list:
        """
        列出所有已注册的工具名称
        
        Returns:
            工具名称列表
        """
        all_tools = list(self._tools.keys()) + list(self._functions.keys())
        return all_tools
    
    def get_tools_description(self) -> str:
        """
        获取所有工具的描述信息
        
        Returns:
            格式化的工具描述字符串
        """
        if not self._tools and not self._functions:
            return "暂无可用工具"
        
        descriptions = []
        
        # 添加工具类描述
        for name, tool in self._tools.items():
            descriptions.append(f"- {name}: {tool.description}")
        
        # 添加函数工具描述
        for name, info in self._functions.items():
            descriptions.append(f"- {name}: {info['description']}")
        
        return "\n".join(descriptions)
    
    def execute_tool(self, tool_name: str, *args, **kwargs) -> Any:
        """
        执行指定的工具
        
        Args:
            tool_name: 工具名称
            *args: 位置参数
            **kwargs: 关键字参数
            
        Returns:
            工具执行结果
            
        Raises:
            ValueError: 工具不存在
        """
        # 检查是否是工具类
        if tool_name in self._tools:
            tool = self._tools[tool_name]
            return tool.run(*args, **kwargs)
        
        # 检查是否是函数工具
        if tool_name in self._functions:
            func = self._functions[tool_name]["func"]
            return func(*args, **kwargs)
        
        raise ValueError(f"工具 '{tool_name}' 不存在")
    
    def __len__(self) -> int:
        """返回注册的工具数量"""
        return len(self._tools) + len(self._functions)
    
    def __contains__(self, name: str) -> bool:
        """检查工具是否存在"""
        return name in self._tools or name in self._functions
