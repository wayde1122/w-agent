"""
情景记忆 - 事件序列，SQLite + Qdrant

特点：
- 存储事件/经历的序列
- 支持时间顺序检索
- 使用SQLite持久化 + Qdrant向量检索
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import json
import uuid

from ..base import BaseMemory, MemoryItem, MemoryConfig, MemoryType


class EpisodicMemory(BaseMemory):
    """
    情景记忆 - 存储事件和经历
    
    使用SQLite存储元数据，Qdrant存储向量（如果可用）
    """
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        super().__init__(config)
        self._conn = None  # SQLite连接
        self._qdrant = None  # Qdrant客户端
        self._collection_name = "episodic_memory"
    
    async def initialize(self) -> None:
        """初始化情景记忆存储"""
        if self._initialized:
            return
        
        # 初始化SQLite
        await self._init_sqlite()
        
        # 尝试初始化Qdrant（可选）
        await self._init_qdrant()
        
        self._initialized = True
        print("[EpisodicMemory] 初始化完成")
    
    async def _init_sqlite(self) -> None:
        """初始化SQLite数据库"""
        import aiosqlite
        import os
        
        # 确保目录存在
        db_path = self.config.sqlite_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        self._conn = await aiosqlite.connect(db_path)
        
        # 创建表
        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS episodic_memory (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                embedding TEXT,
                metadata TEXT,
                timestamp TEXT NOT NULL,
                last_accessed TEXT,
                access_count INTEGER DEFAULT 0,
                importance REAL DEFAULT 0.5,
                episode_id TEXT,
                sequence_num INTEGER
            )
        """)
        
        # 创建索引
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_timestamp ON episodic_memory(timestamp)"
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_episode ON episodic_memory(episode_id)"
        )
        
        await self._conn.commit()
    
    async def _init_qdrant(self) -> None:
        """初始化Qdrant向量存储（可选）"""
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http import models
            
            self._qdrant = QdrantClient(
                host=self.config.qdrant_host,
                port=self.config.qdrant_port,
            )
            
            # 检查或创建集合
            collections = self._qdrant.get_collections().collections
            collection_names = [c.name for c in collections]
            
            if self._collection_name not in collection_names:
                self._qdrant.create_collection(
                    collection_name=self._collection_name,
                    vectors_config=models.VectorParams(
                        size=self.config.embedding_dim,
                        distance=models.Distance.COSINE,
                    ),
                )
            
            print("[EpisodicMemory] Qdrant向量存储已连接")
        except Exception as e:
            print(f"[EpisodicMemory] Qdrant不可用，仅使用SQLite: {e}")
            self._qdrant = None
    
    async def add(self, item: MemoryItem) -> str:
        """添加情景记忆"""
        if not item.id:
            item.id = str(uuid.uuid4())
        
        # 存储到SQLite
        await self._conn.execute(
            """
            INSERT OR REPLACE INTO episodic_memory 
            (id, content, embedding, metadata, timestamp, last_accessed, access_count, importance, episode_id, sequence_num)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item.id,
                item.content,
                json.dumps(item.embedding) if item.embedding else None,
                json.dumps(item.metadata),
                item.timestamp.isoformat(),
                item.last_accessed.isoformat(),
                item.access_count,
                item.importance,
                item.metadata.get("episode_id"),
                item.metadata.get("sequence_num"),
            )
        )
        await self._conn.commit()
        
        # 存储到Qdrant（如果可用）
        if self._qdrant and item.embedding:
            from qdrant_client.http import models
            
            self._qdrant.upsert(
                collection_name=self._collection_name,
                points=[
                    models.PointStruct(
                        id=item.id,
                        vector=item.embedding,
                        payload={
                            "content": item.content,
                            "timestamp": item.timestamp.isoformat(),
                            "importance": item.importance,
                            **item.metadata,
                        }
                    )
                ]
            )
        
        return item.id
    
    async def get(self, item_id: str) -> Optional[MemoryItem]:
        """获取情景记忆"""
        async with self._conn.execute(
            "SELECT * FROM episodic_memory WHERE id = ?",
            (item_id,)
        ) as cursor:
            row = await cursor.fetchone()
            
        if not row:
            return None
        
        # 更新访问信息
        await self._conn.execute(
            """
            UPDATE episodic_memory 
            SET last_accessed = ?, access_count = access_count + 1
            WHERE id = ?
            """,
            (datetime.now().isoformat(), item_id)
        )
        await self._conn.commit()
        
        return self._row_to_item(row)
    
    def _row_to_item(self, row) -> MemoryItem:
        """将数据库行转换为MemoryItem"""
        return MemoryItem(
            id=row[0],
            content=row[1],
            memory_type=MemoryType.EPISODIC,
            embedding=json.loads(row[2]) if row[2] else None,
            metadata=json.loads(row[3]) if row[3] else {},
            timestamp=datetime.fromisoformat(row[4]),
            last_accessed=datetime.fromisoformat(row[5]) if row[5] else datetime.now(),
            access_count=row[6] or 0,
            importance=row[7] or 0.5,
        )
    
    async def search(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryItem]:
        """
        搜索情景记忆
        
        优先使用Qdrant向量搜索，fallback到SQLite全文搜索
        """
        # TODO: 实现向量搜索需要嵌入服务
        # 这里先使用简单的SQLite搜索
        
        query_lower = f"%{query.lower()}%"
        
        sql = "SELECT * FROM episodic_memory WHERE LOWER(content) LIKE ?"
        params = [query_lower]
        
        if filters:
            for key, value in filters.items():
                sql += f" AND json_extract(metadata, '$.{key}') = ?"
                params.append(value)
        
        sql += " ORDER BY importance DESC, timestamp DESC LIMIT ?"
        params.append(top_k)
        
        async with self._conn.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
        
        return [self._row_to_item(row) for row in rows]
    
    async def search_by_time_range(
        self,
        start_time: datetime,
        end_time: datetime,
        top_k: int = 100
    ) -> List[MemoryItem]:
        """按时间范围搜索情景记忆"""
        async with self._conn.execute(
            """
            SELECT * FROM episodic_memory 
            WHERE timestamp BETWEEN ? AND ?
            ORDER BY timestamp ASC
            LIMIT ?
            """,
            (start_time.isoformat(), end_time.isoformat(), top_k)
        ) as cursor:
            rows = await cursor.fetchall()
        
        return [self._row_to_item(row) for row in rows]
    
    async def get_episode(self, episode_id: str) -> List[MemoryItem]:
        """获取完整的情景序列"""
        async with self._conn.execute(
            """
            SELECT * FROM episodic_memory 
            WHERE episode_id = ?
            ORDER BY sequence_num ASC
            """,
            (episode_id,)
        ) as cursor:
            rows = await cursor.fetchall()
        
        return [self._row_to_item(row) for row in rows]
    
    async def update(self, item_id: str, updates: Dict[str, Any]) -> bool:
        """更新情景记忆"""
        item = await self.get(item_id)
        if not item:
            return False
        
        # 更新字段
        for key, value in updates.items():
            if hasattr(item, key):
                setattr(item, key, value)
            else:
                item.metadata[key] = value
        
        # 重新保存
        await self.add(item)
        return True
    
    async def delete(self, item_id: str) -> bool:
        """删除情景记忆"""
        await self._conn.execute(
            "DELETE FROM episodic_memory WHERE id = ?",
            (item_id,)
        )
        await self._conn.commit()
        
        # 从Qdrant删除
        if self._qdrant:
            self._qdrant.delete(
                collection_name=self._collection_name,
                points_selector=[item_id],
            )
        
        return True
    
    async def clear(self) -> None:
        """清空所有情景记忆"""
        await self._conn.execute("DELETE FROM episodic_memory")
        await self._conn.commit()
        
        if self._qdrant:
            from qdrant_client.http import models
            self._qdrant.delete(
                collection_name=self._collection_name,
                points_selector=models.FilterSelector(
                    filter=models.Filter()
                )
            )
    
    async def close(self) -> None:
        """关闭连接"""
        if self._conn:
            await self._conn.close()
