"""
记忆管理器 - 统一协调调度

负责：
- 协调各类型记忆的存取
- 记忆的生命周期管理
- 记忆的整合与迁移
"""

import asyncio
from typing import Any, Dict, List, Optional
from datetime import datetime
import uuid

from .base import BaseMemory, MemoryItem, MemoryConfig, MemoryType
from .types.working import WorkingMemory
from .types.episodic import EpisodicMemory
from .types.semantic import SemanticMemory
from .types.perceptual import PerceptualMemory
from .embedding import EmbeddingService


class MemoryManager:
    """记忆管理器 - 统一协调各类型记忆"""
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        self.config = config or MemoryConfig()
        self.embedding_service = EmbeddingService(config=self.config)
        
        # 初始化各类型记忆
        self._memories: Dict[MemoryType, BaseMemory] = {}
        self._initialized = False
    
    async def initialize(
        self,
        enable_working: bool = True,
        enable_episodic: bool = True,
        enable_semantic: bool = False,
        enable_perceptual: bool = False,
    ) -> None:
        """
        初始化记忆系统
        
        Args:
            enable_working: 启用工作记忆
            enable_episodic: 启用情景记忆
            enable_semantic: 启用语义记忆（需要Neo4j）
            enable_perceptual: 启用感知记忆
        """
        if self._initialized:
            return
        
        # 初始化嵌入服务
        await self.embedding_service.initialize()
        
        # 按需初始化各类型记忆
        init_tasks = []
        
        if enable_working:
            self._memories[MemoryType.WORKING] = WorkingMemory(self.config)
            init_tasks.append(self._memories[MemoryType.WORKING].initialize())
        
        if enable_episodic:
            self._memories[MemoryType.EPISODIC] = EpisodicMemory(self.config)
            init_tasks.append(self._memories[MemoryType.EPISODIC].initialize())
        
        if enable_semantic:
            self._memories[MemoryType.SEMANTIC] = SemanticMemory(self.config)
            init_tasks.append(self._memories[MemoryType.SEMANTIC].initialize())
        
        if enable_perceptual:
            self._memories[MemoryType.PERCEPTUAL] = PerceptualMemory(self.config)
            init_tasks.append(self._memories[MemoryType.PERCEPTUAL].initialize())
        
        await asyncio.gather(*init_tasks)
        self._initialized = True
        print(f"[MemoryManager] 初始化完成，启用的记忆类型: {list(self._memories.keys())}")
    
    async def store(
        self,
        content: str,
        memory_type: MemoryType = MemoryType.WORKING,
        metadata: Optional[Dict[str, Any]] = None,
        importance: float = 0.5,
        ttl: Optional[int] = None,
    ) -> str:
        """
        存储记忆
        
        Args:
            content: 记忆内容
            memory_type: 记忆类型
            metadata: 元数据
            importance: 重要性
            ttl: 生存时间
            
        Returns:
            记忆ID
        """
        if memory_type not in self._memories:
            raise ValueError(f"记忆类型 {memory_type} 未启用")
        
        # 生成嵌入向量
        embedding = await self.embedding_service.embed(content)
        
        # 创建记忆项
        item = MemoryItem(
            id=str(uuid.uuid4()),
            content=content,
            memory_type=memory_type,
            embedding=embedding,
            metadata=metadata or {},
            importance=importance,
            ttl=ttl,
        )
        
        # 存储到对应类型的记忆
        memory = self._memories[memory_type]
        return await memory.add(item)
    
    async def recall(
        self,
        query: str,
        memory_types: Optional[List[MemoryType]] = None,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[MemoryItem]:
        """
        回忆/检索记忆
        
        Args:
            query: 查询内容
            memory_types: 要搜索的记忆类型，None表示搜索所有
            top_k: 返回数量
            filters: 过滤条件
            
        Returns:
            相关记忆列表
        """
        if memory_types is None:
            memory_types = list(self._memories.keys())
        
        # 并行搜索各类型记忆
        search_tasks = []
        for mem_type in memory_types:
            if mem_type in self._memories:
                memory = self._memories[mem_type]
                search_tasks.append(memory.search(query, top_k, filters))
        
        results = await asyncio.gather(*search_tasks)
        
        # 合并结果并按重要性排序
        all_items = []
        for items in results:
            all_items.extend(items)
        
        # 按重要性和访问时间排序
        all_items.sort(
            key=lambda x: (x.importance, x.last_accessed),
            reverse=True
        )
        
        return all_items[:top_k]
    
    async def get(self, item_id: str, memory_type: MemoryType) -> Optional[MemoryItem]:
        """获取指定记忆"""
        if memory_type not in self._memories:
            return None
        return await self._memories[memory_type].get(item_id)
    
    async def forget(self, item_id: str, memory_type: MemoryType) -> bool:
        """删除/遗忘记忆"""
        if memory_type not in self._memories:
            return False
        return await self._memories[memory_type].delete(item_id)
    
    async def consolidate(self) -> None:
        """
        记忆整合 - 将重要的工作记忆迁移到长期记忆
        
        这是一个关键的记忆管理功能，模拟人类睡眠时的记忆巩固过程
        """
        if MemoryType.WORKING not in self._memories:
            return
        
        if MemoryType.EPISODIC not in self._memories:
            return
        
        working = self._memories[MemoryType.WORKING]
        episodic = self._memories[MemoryType.EPISODIC]
        
        # 获取所有工作记忆
        # 注意：这里需要WorkingMemory实现get_all方法
        if hasattr(working, 'get_all'):
            items = await working.get_all()
            
            # 将重要的记忆迁移到情景记忆
            for item in items:
                if item.importance >= 0.7:  # 重要性阈值
                    item.memory_type = MemoryType.EPISODIC
                    item.ttl = None  # 长期记忆无TTL
                    await episodic.add(item)
                    await working.delete(item.id)
            
            print(f"[MemoryManager] 记忆整合完成，迁移了 {len([i for i in items if i.importance >= 0.7])} 条记忆")
    
    async def close(self) -> None:
        """关闭所有连接"""
        close_tasks = [memory.close() for memory in self._memories.values()]
        await asyncio.gather(*close_tasks)
        await self.embedding_service.close()
        print("[MemoryManager] 已关闭所有连接")
