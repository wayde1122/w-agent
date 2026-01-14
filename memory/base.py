"""
基础数据结构

包含：
- MemoryItem: 记忆项数据结构
- MemoryConfig: 记忆配置
- BaseMemory: 记忆基类
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from enum import Enum


class MemoryType(Enum):
    """记忆类型枚举"""
    WORKING = "working"      # 工作记忆
    EPISODIC = "episodic"    # 情景记忆
    SEMANTIC = "semantic"    # 语义记忆
    PERCEPTUAL = "perceptual"  # 感知记忆


@dataclass
class MemoryItem:
    """记忆项数据结构"""
    id: str                          # 唯一标识
    content: str                     # 记忆内容
    memory_type: MemoryType          # 记忆类型
    embedding: Optional[List[float]] = None  # 向量嵌入
    metadata: Dict[str, Any] = field(default_factory=dict)  # 元数据
    timestamp: datetime = field(default_factory=datetime.now)  # 创建时间
    last_accessed: datetime = field(default_factory=datetime.now)  # 最后访问时间
    access_count: int = 0            # 访问次数
    importance: float = 0.5          # 重要性分数 (0-1)
    ttl: Optional[int] = None        # 生存时间（秒），None表示永久
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "content": self.content,
            "memory_type": self.memory_type.value,
            "embedding": self.embedding,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat(),
            "last_accessed": self.last_accessed.isoformat(),
            "access_count": self.access_count,
            "importance": self.importance,
            "ttl": self.ttl,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "MemoryItem":
        """从字典创建"""
        return cls(
            id=data["id"],
            content=data["content"],
            memory_type=MemoryType(data["memory_type"]),
            embedding=data.get("embedding"),
            metadata=data.get("metadata", {}),
            timestamp=datetime.fromisoformat(data["timestamp"]) if isinstance(data.get("timestamp"), str) else data.get("timestamp", datetime.now()),
            last_accessed=datetime.fromisoformat(data["last_accessed"]) if isinstance(data.get("last_accessed"), str) else data.get("last_accessed", datetime.now()),
            access_count=data.get("access_count", 0),
            importance=data.get("importance", 0.5),
            ttl=data.get("ttl"),
        )


@dataclass
class MemoryConfig:
    """记忆配置"""
    # 通用配置
    max_items: int = 10000           # 最大记忆项数
    embedding_dim: int = 1536        # 嵌入向量维度
    embedding_model: str = "text-embedding-ada-002"  # 嵌入模型
    
    # 工作记忆配置
    working_memory_ttl: int = 3600   # 工作记忆TTL（秒）
    working_memory_capacity: int = 100  # 工作记忆容量
    
    # 存储配置
    sqlite_path: str = "./data/memory.db"  # SQLite数据库路径
    qdrant_host: str = "localhost"   # Qdrant服务地址
    qdrant_port: int = 6333          # Qdrant服务端口
    neo4j_uri: str = "bolt://localhost:7687"  # Neo4j连接URI
    neo4j_user: str = "neo4j"        # Neo4j用户名
    neo4j_password: str = ""         # Neo4j密码
    
    # 检索配置
    similarity_threshold: float = 0.7  # 相似度阈值
    top_k: int = 10                  # 检索返回数量


class BaseMemory(ABC):
    """记忆基类"""
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        self.config = config or MemoryConfig()
        self._initialized = False
    
    @abstractmethod
    async def initialize(self) -> None:
        """初始化记忆存储"""
        pass
    
    @abstractmethod
    async def add(self, item: MemoryItem) -> str:
        """添加记忆项，返回ID"""
        pass
    
    @abstractmethod
    async def get(self, item_id: str) -> Optional[MemoryItem]:
        """根据ID获取记忆项"""
        pass
    
    @abstractmethod
    async def search(
        self, 
        query: str, 
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryItem]:
        """搜索相关记忆"""
        pass
    
    @abstractmethod
    async def update(self, item_id: str, updates: Dict[str, Any]) -> bool:
        """更新记忆项"""
        pass
    
    @abstractmethod
    async def delete(self, item_id: str) -> bool:
        """删除记忆项"""
        pass
    
    @abstractmethod
    async def clear(self) -> None:
        """清空所有记忆"""
        pass
    
    async def close(self) -> None:
        """关闭连接"""
        pass
