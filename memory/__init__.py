"""
Memory 模块 - 统一对外接口

提供记忆系统的统一访问接口，包括：
- 记忆管理器
- 各类型记忆（工作记忆、情景记忆、语义记忆、感知记忆）
- 存储后端
- RAG系统
"""

from .base import MemoryItem, MemoryConfig, BaseMemory
from .manager import MemoryManager
from .embedding import EmbeddingService

# 记忆类型
from .types.working import WorkingMemory
from .types.episodic import EpisodicMemory
from .types.semantic import SemanticMemory
from .types.perceptual import PerceptualMemory

# 存储后端
from .storage.qdrant_store import QdrantStore
from .storage.neo4j_store import Neo4jStore
from .storage.document_store import DocumentStore

# RAG系统
from .rag.pipeline import RAGPipeline
from .rag.document import DocumentProcessor

__all__ = [
    # 基础
    "MemoryItem",
    "MemoryConfig", 
    "BaseMemory",
    "MemoryManager",
    "EmbeddingService",
    # 记忆类型
    "WorkingMemory",
    "EpisodicMemory",
    "SemanticMemory",
    "PerceptualMemory",
    # 存储
    "QdrantStore",
    "Neo4jStore",
    "DocumentStore",
    # RAG
    "RAGPipeline",
    "DocumentProcessor",
]
