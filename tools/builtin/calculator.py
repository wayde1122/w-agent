"""计算器工具"""
import ast
import operator
import math
from ..base import Tool


class CalculatorTool(Tool):
    """简单的数学计算工具"""
    
    def __init__(self):
        """初始化计算器工具"""
        super().__init__(
            name="calculator",
            description="数学计算工具，支持基本运算(+,-,*,/)和常用函数(sqrt, pow等)"
        )
    
    def run(self, expression: str) -> str:
        """
        执行数学计算
        
        Args:
            expression: 数学表达式字符串
            
        Returns:
            计算结果的字符串表示
        """
        if not expression or not expression.strip():
            return "[ERROR] 计算表达式不能为空"
        
        # 支持的基本运算符
        operators = {
            ast.Add: operator.add,      # +
            ast.Sub: operator.sub,      # -
            ast.Mult: operator.mul,     # *
            ast.Div: operator.truediv,  # /
            ast.Pow: operator.pow,      # **
            ast.USub: operator.neg,     # 负号
        }
        
        # 支持的数学函数
        functions = {
            'sqrt': math.sqrt,
            'pow': math.pow,
            'abs': abs,
            'pi': math.pi,
            'e': math.e,
        }
        
        try:
            # 解析表达式
            node = ast.parse(expression, mode='eval')
            result = self._eval_node(node.body, operators, functions)
            return str(result)
        except ZeroDivisionError:
            return "[ERROR] 错误：除数不能为零"
        except Exception as e:
            return f"[ERROR] 计算失败：{str(e)}"
    
    def _eval_node(self, node, operators, functions):
        """
        递归求值 AST 节点
        
        Args:
            node: AST节点
            operators: 支持的运算符字典
            functions: 支持的函数字典
            
        Returns:
            节点的计算结果
        """
        if isinstance(node, ast.Constant):  # 数字常量
            return node.value
        
        elif isinstance(node, ast.Num):  # 兼容旧版本Python
            return node.n
        
        elif isinstance(node, ast.BinOp):  # 二元运算
            left = self._eval_node(node.left, operators, functions)
            right = self._eval_node(node.right, operators, functions)
            op = operators.get(type(node.op))
            if op is None:
                raise ValueError(f"不支持的运算符: {type(node.op).__name__}")
            return op(left, right)
        
        elif isinstance(node, ast.UnaryOp):  # 一元运算
            operand = self._eval_node(node.operand, operators, functions)
            op = operators.get(type(node.op))
            if op is None:
                raise ValueError(f"不支持的一元运算符: {type(node.op).__name__}")
            return op(operand)
        
        elif isinstance(node, ast.Call):  # 函数调用
            func_name = node.func.id
            if func_name not in functions:
                raise ValueError(f"不支持的函数: {func_name}")
            args = [self._eval_node(arg, operators, functions) for arg in node.args]
            return functions[func_name](*args)
        
        elif isinstance(node, ast.Name):  # 变量名（如pi, e）
            if node.id in functions:
                value = functions[node.id]
                # 如果是常量（不是函数），直接返回
                if not callable(value):
                    return value
            raise ValueError(f"未定义的变量: {node.id}")
        
        else:
            raise ValueError(f"不支持的表达式类型: {type(node).__name__}")


def create_calculator_registry():
    """
    创建包含计算器的工具注册表（便利函数）
    
    Returns:
        包含计算器工具的ToolRegistry实例
    """
    from ..registry import ToolRegistry
    
    registry = ToolRegistry()
    calculator = CalculatorTool()
    registry.register_tool(calculator)
    
    return registry
