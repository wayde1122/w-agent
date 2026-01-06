# my_reflection_agent.py
"""
反思Agent实现 - 支持生成-反思-精炼循环

核心流程：
1. 生成初始内容
2. 反思并找出问题
3. 根据反馈精炼改进
4. 可循环多次直到满意
"""

from typing import Optional, Dict
from core.agent import ReflectionAgent
from core.llm import HelloAgentsLLM
from core.config import Config
from core.message import Message


# 默认提示词模板
DEFAULT_PROMPTS = {
    "initial": """你是一个专业的内容创作者。请根据以下任务生成初始内容：

任务：{task}

请直接给出你的内容，无需解释。""",
    
    "reflect": """请仔细审查以下内容，找出可以改进的地方。

任务：{task}

当前内容：
{content}

请从以下几个方面进行反思：
1. 内容的完整性和准确性
2. 逻辑结构和组织方式
3. 表达的清晰度
4. 可以增强或优化的地方

请给出具体的改进建议。""",
    
    "refine": """请根据反馈意见改进内容。

原始任务：{task}

当前内容：
{content}

反馈意见：
{feedback}

请根据反馈生成改进后的内容。直接给出改进后的完整内容，无需说明。"""
}


class MyReflectionAgent(ReflectionAgent):
    """
    自定义反思Agent
    支持通用任务和专业领域（如代码生成）的反思优化
    """
    
    def __init__(
        self,
        name: str,
        llm: HelloAgentsLLM,
        system_prompt: Optional[str] = None,
        config: Optional[Config] = None,
        max_iterations: int = 2,
        custom_prompts: Optional[Dict[str, str]] = None
    ):
        """
        初始化反思Agent
        
        Args:
            name: Agent名称
            llm: LLM实例
            system_prompt: 系统提示词（可选）
            config: 配置对象
            max_iterations: 最大反思迭代次数
            custom_prompts: 自定义提示词字典，可包含 initial/reflect/refine 键
        """
        super().__init__(name, llm, system_prompt, config, max_iterations)
        
        # 使用自定义提示词或默认提示词
        self.prompts = custom_prompts if custom_prompts else DEFAULT_PROMPTS
        
        print(f"[OK] {name} 初始化完成，最大迭代次数: {max_iterations}")
    
    def run(self, task: str, **kwargs) -> str:
        """
        运行反思循环
        
        Args:
            task: 任务描述
            **kwargs: 其他LLM参数（如temperature）
            
        Returns:
            最终优化后的内容
        """
        print(f"\n[Agent] {self.name} 开始处理任务: {task}")
        
        # 第一步：生成初始内容
        print("\n--- 步骤1: 生成初始内容 ---")
        current_content = self._generate_initial(task, **kwargs)
        
        # 处理 LLM 返回 None 的情况（API限流或错误）
        if current_content is None:
            error_msg = "[Error] LLM 返回空响应，可能是 API 限流或配置问题"
            self.add_message(Message(task, "user"))
            self.add_message(Message(error_msg, "assistant"))
            return error_msg
        
        print(f"[OK] 初始内容已生成")
        
        # 反思-精炼循环
        for iteration in range(self.max_iterations):
            print(f"\n--- 步骤{iteration + 2}: 第 {iteration + 1} 轮反思与精炼 ---")
            
            # 反思：评估当前内容
            feedback = self._reflect(task, current_content, **kwargs)
            # 处理 LLM 返回 None 的情况
            if feedback is None:
                print("[Warn] 反思阶段 LLM 返回空，跳过本轮")
                continue
            print(f"[Think] 反思意见: {feedback[:100]}..." if len(feedback) > 100 else f"[Think] 反思意见: {feedback}")
            
            # 精炼：根据反馈改进
            refined_content = self._refine(task, current_content, feedback, **kwargs)
            # 处理 LLM 返回 None 的情况
            if refined_content is None:
                print("[Warn] 精炼阶段 LLM 返回空，保持当前内容")
                continue
            print(f"[OK] 内容已精炼")
            
            current_content = refined_content
        
        # 保存到历史记录
        self.add_message(Message(task, "user"))
        self.add_message(Message(current_content, "assistant"))
        
        print(f"\n[Done] {self.name} 完成任务，共进行 {self.max_iterations} 轮优化")
        return current_content
    
    def _generate_initial(self, task: str, **kwargs) -> str:
        """
        生成初始内容
        
        Args:
            task: 任务描述
            **kwargs: LLM参数
            
        Returns:
            初始生成的内容
        """
        prompt = self.prompts.get("initial", DEFAULT_PROMPTS["initial"])
        prompt = prompt.format(task=task)
        
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = self.llm.think(messages, **kwargs)
        return response
    
    def _reflect(self, task: str, content: str, **kwargs) -> str:
        """
        反思并评估内容
        
        Args:
            task: 原始任务
            content: 当前内容
            **kwargs: LLM参数
            
        Returns:
            反思意见和改进建议
        """
        prompt = self.prompts.get("reflect", DEFAULT_PROMPTS["reflect"])
        prompt = prompt.format(task=task, content=content)
        
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        feedback = self.llm.think(messages, **kwargs)
        return feedback
    
    def _refine(self, task: str, content: str, feedback: str, **kwargs) -> str:
        """
        根据反馈精炼内容
        
        Args:
            task: 原始任务
            content: 当前内容
            feedback: 反思意见
            **kwargs: LLM参数
            
        Returns:
            精炼后的内容
        """
        prompt = self.prompts.get("refine", DEFAULT_PROMPTS["refine"])
        prompt = prompt.format(task=task, content=content, feedback=feedback)
        
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        refined = self.llm.think(messages, **kwargs)
        return refined
