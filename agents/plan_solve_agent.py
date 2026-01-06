# my_plan_solve_agent.py
"""
计划与执行Agent实现 - Plan-Solve模式

核心流程：
1. Planning 阶段：分析问题，制定步骤化计划
2. Solving 阶段：按计划逐步执行，收集结果
3. Summarizing 阶段：汇总所有步骤结果，给出最终答案
"""

from typing import List, Dict, Optional
from core.agent import PlanAndSolveAgent
from core.llm import HelloAgentsLLM
from core.config import Config
from core.message import Message


# 提示词模板
PLANNING_PROMPT = """你是一个善于分析和规划的AI助手。请仔细分析以下问题，并制定详细的解决计划。

问题：{question}

请将问题分解为清晰的步骤。每个步骤应该：
1. 具体明确
2. 可以独立执行
3. 按逻辑顺序排列

请以如下格式输出计划（每行一个步骤）：
步骤1: [具体描述]
步骤2: [具体描述]
步骤3: [具体描述]
...

现在请开始制定计划："""


EXECUTION_PROMPT = """你正在执行一个多步骤任务的其中一步。

原始问题：{question}

当前要执行的步骤：{step}

之前步骤的结果：
{context}

请执行当前步骤，给出具体的结果。如果是数学计算，请给出计算过程和答案。"""


SUMMARY_PROMPT = """你已经完成了所有步骤，现在需要给出最终答案。

原始问题：{question}

所有步骤的执行结果：
{all_results}

请基于这些结果，给出问题的最终答案。答案应该：
1. 直接回答原始问题
2. 简洁明了
3. 如果是数值问题，给出具体数字

最终答案："""


class MyPlanAndSolveAgent(PlanAndSolveAgent):
    """
    自定义计划执行Agent
    适用于需要多步骤推理的问题，如数学应用题、逻辑推理等
    """
    
    def __init__(
        self,
        name: str,
        llm: HelloAgentsLLM,
        system_prompt: Optional[str] = None,
        config: Optional[Config] = None
    ):
        """
        初始化计划执行Agent
        
        Args:
            name: Agent名称
            llm: LLM实例
            system_prompt: 系统提示词（可选）
            config: 配置对象
        """
        super().__init__(name, llm, system_prompt, config)
        print(f"[OK] {name} 初始化完成")
    
    def run(self, question: str, **kwargs) -> str:
        """
        运行计划-执行-汇总流程
        
        Args:
            question: 问题描述
            **kwargs: 其他LLM参数
            
        Returns:
            最终答案
        """
        print(f"\n[Agent] {self.name} 开始处理问题: {question}")
        
        # 阶段1：制定计划
        print("\n--- 阶段1: Planning（制定计划） ---")
        plan = self._make_plan(question, **kwargs)
        
        # 处理 LLM 返回 None 的情况（API限流或错误）
        if plan is None:
            error_msg = "[Error] LLM 返回空响应，可能是 API 限流或配置问题"
            self.add_message(Message(question, "user"))
            self.add_message(Message(error_msg, "assistant"))
            return error_msg
        
        steps = self._parse_steps(plan)
        print(f"[Plan] 已制定 {len(steps)} 个步骤:")
        for i, step in enumerate(steps, 1):
            print(f"  {i}. {step}")
        
        # 阶段2：执行步骤
        print("\n--- 阶段2: Solving（执行步骤） ---")
        steps_results = []
        context = ""
        
        for i, step in enumerate(steps, 1):
            print(f"\n执行步骤 {i}/{len(steps)}: {step}")
            result = self._execute_step(step, question, context, **kwargs)
            # 处理 LLM 返回 None 的情况
            if result is None:
                result = "[Error] 此步骤执行失败，LLM 返回空响应"
            steps_results.append({
                "step": step,
                "result": result
            })
            context += f"\n步骤{i}: {step}\n结果: {result}\n"
            print(f"[OK] 完成")
        
        # 阶段3：汇总结果
        print("\n--- 阶段3: Summarizing（汇总结果） ---")
        final_answer = self._summarize_results(question, steps_results, **kwargs)
        
        # 处理 LLM 返回 None 的情况
        if final_answer is None:
            final_answer = "[Error] 汇总结果失败，LLM 返回空响应"
        
        # 保存到历史记录
        self.add_message(Message(question, "user"))
        self.add_message(Message(final_answer, "assistant"))
        
        print(f"\n[Done] {self.name} 完成任务")
        return final_answer
    
    def _make_plan(self, question: str, **kwargs) -> str:
        """
        制定执行计划
        
        Args:
            question: 问题描述
            **kwargs: LLM参数
            
        Returns:
            计划内容（包含步骤列表）
        """
        prompt = PLANNING_PROMPT.format(question=question)
        
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        plan = self.llm.think(messages, **kwargs)
        return plan
    
    def _parse_steps(self, plan: str) -> List[str]:
        """
        解析计划中的步骤
        
        Args:
            plan: 计划文本
            
        Returns:
            步骤列表
        """
        steps = []
        lines = plan.strip().split('\n')
        
        for line in lines:
            line = line.strip()
            if not line:
                continue
            
            # 匹配 "步骤X:" 或 "X." 或 "X:" 格式
            if '步骤' in line and ':' in line:
                # 格式：步骤1: 内容
                parts = line.split(':', 1)
                if len(parts) == 2:
                    steps.append(parts[1].strip())
            elif line[0].isdigit() and ('.' in line or ':' in line):
                # 格式：1. 内容 或 1: 内容
                separator = '.' if '.' in line else ':'
                parts = line.split(separator, 1)
                if len(parts) == 2:
                    steps.append(parts[1].strip())
            elif line.startswith('-') or line.startswith('•'):
                # 格式：- 内容 或 • 内容
                steps.append(line[1:].strip())
        
        # 如果解析失败，返回整个计划作为单步骤
        if not steps:
            steps = [plan.strip()]
        
        return steps
    
    def _execute_step(self, step: str, question: str, context: str, **kwargs) -> str:
        """
        执行单个步骤
        
        Args:
            step: 步骤描述
            question: 原始问题
            context: 之前步骤的上下文
            **kwargs: LLM参数
            
        Returns:
            步骤执行结果
        """
        prompt = EXECUTION_PROMPT.format(
            question=question,
            step=step,
            context=context if context else "（这是第一个步骤）"
        )
        
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        result = self.llm.think(messages, **kwargs)
        return result
    
    def _summarize_results(self, question: str, steps_results: List[Dict], **kwargs) -> str:
        """
        汇总所有步骤结果
        
        Args:
            question: 原始问题
            steps_results: 步骤结果列表
            **kwargs: LLM参数
            
        Returns:
            最终答案
        """
        # 构建结果摘要
        all_results = ""
        for i, item in enumerate(steps_results, 1):
            all_results += f"\n步骤{i}: {item['step']}\n"
            all_results += f"结果: {item['result']}\n"
        
        prompt = SUMMARY_PROMPT.format(
            question=question,
            all_results=all_results
        )
        
        messages = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        final_answer = self.llm.think(messages, **kwargs)
        return final_answer
