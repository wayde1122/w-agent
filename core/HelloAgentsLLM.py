import os
from openai import OpenAI
from dotenv import load_dotenv
from typing import List, Dict, Optional

load_dotenv()

class HelloAgentsLLM:
    """用于调用任何兼容OpenAI接口的服务"""
    def __init__(self, model: str = None, apiKey: str = None, baseUrl: str = None, timeout: int = None):
        self.model = model or os.getenv("LLM_MODEL_ID")
        apiKey = apiKey or os.getenv("LLM_API_KEY")
        baseUrl = baseUrl or os.getenv("LLM_BASE_URL")
        timeout = timeout or int(os.getenv("LLM_TIMEOUT", 60))
        
        if not all([self.model, apiKey, baseUrl]):
            raise ValueError("模型ID、API密钥和服务地址必须被提供或在.env文件中定义。")
        
        self.client = OpenAI(api_key=apiKey, base_url=baseUrl, timeout=timeout)
        self.provider = "auto"
    
    def think(self, messages: List[Dict[str, str]], temperature: float = 0) -> str:
        """调用大语言模型进行思考，并返回其响应"""
        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                stream=True,
            )
            
            collected_content = []
            for chunk in response:
                content = chunk.choices[0].delta.content or ""
                collected_content.append(content)
            return "".join(collected_content)
        except Exception as e:
            error_msg = str(e)
            print(f"调用LLM API时发生错误: {error_msg}")
            # 返回错误信息而不是 None，让调用方能看到具体原因
            if "429" in error_msg or "quota" in error_msg.lower() or "rate" in error_msg.lower():
                return f"[API限流] {error_msg}"
            return f"[API错误] {error_msg}"
