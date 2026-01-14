"""
统一嵌入服务

支持多种嵌入后端：
- DashScope (阿里云)
- OpenAI
- Local (本地模型)
- TFIDF (简单文本向量化)
"""

from abc import ABC, abstractmethod
from typing import List, Optional
import hashlib
import json

from .base import MemoryConfig


class BaseEmbedding(ABC):
    """嵌入服务基类"""
    
    @abstractmethod
    async def embed(self, text: str) -> List[float]:
        """将文本转换为向量"""
        pass
    
    @abstractmethod
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """批量文本转向量"""
        pass


class TFIDFEmbedding(BaseEmbedding):
    """基于TFIDF的简单嵌入实现"""
    
    def __init__(self, dim: int = 1536):
        self.dim = dim
        self._vocabulary: dict = {}
        self._idf: dict = {}
    
    async def embed(self, text: str) -> List[float]:
        """简单的哈希嵌入实现"""
        # 使用哈希函数生成固定维度的向量
        vector = [0.0] * self.dim
        words = text.lower().split()
        
        for word in words:
            # 使用MD5哈希确定向量位置
            hash_val = int(hashlib.md5(word.encode()).hexdigest(), 16)
            idx = hash_val % self.dim
            vector[idx] += 1.0
        
        # 归一化
        norm = sum(v * v for v in vector) ** 0.5
        if norm > 0:
            vector = [v / norm for v in vector]
        
        return vector
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """批量嵌入"""
        return [await self.embed(text) for text in texts]


class OpenAIEmbedding(BaseEmbedding):
    """OpenAI嵌入服务"""
    
    def __init__(self, model: str = "text-embedding-ada-002", api_key: Optional[str] = None):
        self.model = model
        self.api_key = api_key
        self._client = None
    
    async def _get_client(self):
        if self._client is None:
            try:
                from openai import AsyncOpenAI
                import os
                api_key = self.api_key or os.getenv("OPENAI_API_KEY")
                self._client = AsyncOpenAI(api_key=api_key)
            except ImportError:
                raise ImportError("请安装 openai: pip install openai")
        return self._client
    
    async def embed(self, text: str) -> List[float]:
        """调用OpenAI API获取嵌入"""
        client = await self._get_client()
        response = await client.embeddings.create(
            model=self.model,
            input=text,
        )
        return response.data[0].embedding
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """批量嵌入"""
        client = await self._get_client()
        response = await client.embeddings.create(
            model=self.model,
            input=texts,
        )
        return [item.embedding for item in response.data]


class DashScopeEmbedding(BaseEmbedding):
    """阿里云DashScope嵌入服务"""
    
    def __init__(self, model: str = "text-embedding-v2", api_key: Optional[str] = None):
        self.model = model
        self.api_key = api_key
    
    async def embed(self, text: str) -> List[float]:
        """调用DashScope API获取嵌入"""
        try:
            import dashscope
            from dashscope import TextEmbedding
            import os
            
            dashscope.api_key = self.api_key or os.getenv("DASHSCOPE_API_KEY")
            
            response = TextEmbedding.call(
                model=self.model,
                input=text,
            )
            
            if response.status_code == 200:
                return response.output["embeddings"][0]["embedding"]
            else:
                raise Exception(f"DashScope API Error: {response.message}")
        except ImportError:
            raise ImportError("请安装 dashscope: pip install dashscope")
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """批量嵌入"""
        return [await self.embed(text) for text in texts]


class EmbeddingService:
    """统一嵌入服务 - 自动选择后端"""
    
    def __init__(self, config: Optional[MemoryConfig] = None, backend: str = "auto"):
        """
        初始化嵌入服务
        
        Args:
            config: 记忆配置
            backend: 后端选择 ("auto", "openai", "dashscope", "tfidf")
        """
        self.config = config or MemoryConfig()
        self.backend = backend
        self._embedding: Optional[BaseEmbedding] = None
        self._cache: dict = {}  # 简单的嵌入缓存
    
    async def initialize(self) -> None:
        """初始化嵌入服务"""
        if self._embedding is not None:
            return
        
        if self.backend == "auto":
            # 自动检测可用的嵌入服务
            self._embedding = await self._auto_detect()
        elif self.backend == "openai":
            self._embedding = OpenAIEmbedding(model=self.config.embedding_model)
        elif self.backend == "dashscope":
            self._embedding = DashScopeEmbedding()
        else:
            self._embedding = TFIDFEmbedding(dim=self.config.embedding_dim)
        
        print(f"[EmbeddingService] 使用嵌入后端: {type(self._embedding).__name__}")
    
    async def _auto_detect(self) -> BaseEmbedding:
        """自动检测可用的嵌入服务"""
        import os
        
        # 优先使用OpenAI
        if os.getenv("OPENAI_API_KEY"):
            try:
                embedding = OpenAIEmbedding(model=self.config.embedding_model)
                await embedding.embed("test")  # 测试连接
                return embedding
            except Exception:
                pass
        
        # 其次使用DashScope
        if os.getenv("DASHSCOPE_API_KEY"):
            try:
                embedding = DashScopeEmbedding()
                await embedding.embed("test")
                return embedding
            except Exception:
                pass
        
        # 最后使用TFIDF
        print("[EmbeddingService] 未检测到API密钥，使用本地TFIDF嵌入")
        return TFIDFEmbedding(dim=self.config.embedding_dim)
    
    async def embed(self, text: str, use_cache: bool = True) -> List[float]:
        """
        获取文本嵌入
        
        Args:
            text: 输入文本
            use_cache: 是否使用缓存
            
        Returns:
            嵌入向量
        """
        if self._embedding is None:
            await self.initialize()
        
        # 检查缓存
        if use_cache:
            cache_key = hashlib.md5(text.encode()).hexdigest()
            if cache_key in self._cache:
                return self._cache[cache_key]
        
        # 获取嵌入
        embedding = await self._embedding.embed(text)
        
        # 缓存结果
        if use_cache:
            self._cache[cache_key] = embedding
        
        return embedding
    
    async def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """批量获取嵌入"""
        if self._embedding is None:
            await self.initialize()
        return await self._embedding.embed_batch(texts)
    
    async def close(self) -> None:
        """清理资源"""
        self._cache.clear()
