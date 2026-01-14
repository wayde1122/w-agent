"""
工作记忆 - TTL管理，纯内存实现

特点：
- 短期记忆，有生存时间限制
- 纯内存存储，速度快
- 容量有限，自动淘汰
"""

import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
import uuid

from ..base import BaseMemory, MemoryItem, MemoryConfig, MemoryType


class WorkingMemory(BaseMemory):
    """
    工作记忆 - 短期记忆实现
    
    使用纯内存存储，支持TTL自动过期和容量管理
    """
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        super().__init__(config)
        self._storage: Dict[str, MemoryItem] = {}
        self._cleanup_task: Optional[asyncio.Task] = None
    
    async def initialize(self) -> None:
        """初始化工作记忆"""
        if self._initialized:
            return
        
        # 启动后台清理任务
        self._cleanup_task = asyncio.create_task(self._cleanup_loop())
        self._initialized = True
        print("[WorkingMemory] 初始化完成")
    
    async def _cleanup_loop(self) -> None:
        """后台清理过期记忆的循环"""
        while True:
            try:
                await asyncio.sleep(60)  # 每分钟检查一次
                await self._cleanup_expired()
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"[WorkingMemory] 清理任务出错: {e}")
    
    async def _cleanup_expired(self) -> None:
        """清理过期的记忆"""
        now = datetime.now()
        expired_ids = []
        
        for item_id, item in self._storage.items():
            if item.ttl is not None:
                expiry_time = item.timestamp + timedelta(seconds=item.ttl)
                if now > expiry_time:
                    expired_ids.append(item_id)
        
        for item_id in expired_ids:
            del self._storage[item_id]
        
        if expired_ids:
            print(f"[WorkingMemory] 清理了 {len(expired_ids)} 条过期记忆")
    
    async def _enforce_capacity(self) -> None:
        """强制执行容量限制"""
        max_capacity = self.config.working_memory_capacity
        
        if len(self._storage) >= max_capacity:
            # 按重要性和访问时间排序，移除最不重要的
            items = sorted(
                self._storage.values(),
                key=lambda x: (x.importance, x.last_accessed)
            )
            
            # 移除10%的记忆
            remove_count = max(1, len(items) // 10)
            for item in items[:remove_count]:
                del self._storage[item.id]
            
            print(f"[WorkingMemory] 容量超限，移除了 {remove_count} 条记忆")
    
    async def add(self, item: MemoryItem) -> str:
        """添加记忆项"""
        # 检查容量
        await self._enforce_capacity()
        
        # 设置默认TTL
        if item.ttl is None:
            item.ttl = self.config.working_memory_ttl
        
        # 确保ID存在
        if not item.id:
            item.id = str(uuid.uuid4())
        
        self._storage[item.id] = item
        return item.id
    
    async def get(self, item_id: str) -> Optional[MemoryItem]:
        """获取记忆项"""
        item = self._storage.get(item_id)
        if item:
            # 更新访问信息
            item.last_accessed = datetime.now()
            item.access_count += 1
        return item
    
    async def search(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryItem]:
        """
        搜索相关记忆
        
        简单实现：基于关键词匹配
        """
        results = []
        query_lower = query.lower()
        query_words = set(query_lower.split())
        
        for item in self._storage.values():
            # 应用过滤器
            if filters:
                skip = False
                for key, value in filters.items():
                    if item.metadata.get(key) != value:
                        skip = True
                        break
                if skip:
                    continue
            
            # 计算简单的相关性分数
            content_lower = item.content.lower()
            content_words = set(content_lower.split())
            
            # Jaccard相似度
            intersection = query_words & content_words
            union = query_words | content_words
            score = len(intersection) / len(union) if union else 0
            
            if score > 0:
                results.append((score, item))
        
        # 按分数排序
        results.sort(key=lambda x: x[0], reverse=True)
        
        # 更新访问信息
        top_items = [item for _, item in results[:top_k]]
        for item in top_items:
            item.last_accessed = datetime.now()
            item.access_count += 1
        
        return top_items
    
    async def update(self, item_id: str, updates: Dict[str, Any]) -> bool:
        """更新记忆项"""
        item = self._storage.get(item_id)
        if not item:
            return False
        
        for key, value in updates.items():
            if hasattr(item, key):
                setattr(item, key, value)
            else:
                item.metadata[key] = value
        
        return True
    
    async def delete(self, item_id: str) -> bool:
        """删除记忆项"""
        if item_id in self._storage:
            del self._storage[item_id]
            return True
        return False
    
    async def clear(self) -> None:
        """清空所有记忆"""
        self._storage.clear()
        print("[WorkingMemory] 已清空所有记忆")
    
    async def get_all(self) -> List[MemoryItem]:
        """获取所有记忆项"""
        return list(self._storage.values())
    
    async def close(self) -> None:
        """关闭并清理资源"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
        self._storage.clear()
