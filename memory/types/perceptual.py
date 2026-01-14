"""
感知记忆 - 多模态，SQLite + Qdrant

特点：
- 存储多模态信息（文本、图像、音频等）
- 短期保留，快速访问
- 使用SQLite存储元数据，Qdrant存储向量
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import json
import uuid
import base64

from ..base import BaseMemory, MemoryItem, MemoryConfig, MemoryType


class PerceptualMemory(BaseMemory):
    """
    感知记忆 - 存储多模态感知信息
    
    支持文本、图像、音频等多种模态的短期记忆
    """
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        super().__init__(config)
        self._conn = None
        self._qdrant = None
        self._collection_name = "perceptual_memory"
    
    async def initialize(self) -> None:
        """初始化感知记忆存储"""
        if self._initialized:
            return
        
        await self._init_sqlite()
        await self._init_qdrant()
        
        self._initialized = True
        print("[PerceptualMemory] 初始化完成")
    
    async def _init_sqlite(self) -> None:
        """初始化SQLite数据库"""
        import aiosqlite
        import os
        
        db_path = self.config.sqlite_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        self._conn = await aiosqlite.connect(db_path)
        
        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS perceptual_memory (
                id TEXT PRIMARY KEY,
                content TEXT,
                modality TEXT NOT NULL,
                embedding TEXT,
                raw_data BLOB,
                metadata TEXT,
                timestamp TEXT NOT NULL,
                last_accessed TEXT,
                access_count INTEGER DEFAULT 0,
                importance REAL DEFAULT 0.5,
                ttl INTEGER
            )
        """)
        
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_perceptual_modality ON perceptual_memory(modality)"
        )
        await self._conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_perceptual_timestamp ON perceptual_memory(timestamp)"
        )
        
        await self._conn.commit()
    
    async def _init_qdrant(self) -> None:
        """初始化Qdrant向量存储"""
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http import models
            
            self._qdrant = QdrantClient(
                host=self.config.qdrant_host,
                port=self.config.qdrant_port,
            )
            
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
            
            print("[PerceptualMemory] Qdrant已连接")
        except Exception as e:
            print(f"[PerceptualMemory] Qdrant不可用: {e}")
            self._qdrant = None
    
    async def add(self, item: MemoryItem) -> str:
        """添加感知记忆"""
        if not item.id:
            item.id = str(uuid.uuid4())
        
        # 获取模态类型
        modality = item.metadata.get("modality", "text")
        
        # 获取原始数据（如果有）
        raw_data = item.metadata.pop("raw_data", None)
        if isinstance(raw_data, str):
            raw_data = raw_data.encode()
        
        await self._conn.execute(
            """
            INSERT OR REPLACE INTO perceptual_memory
            (id, content, modality, embedding, raw_data, metadata, timestamp, last_accessed, access_count, importance, ttl)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item.id,
                item.content,
                modality,
                json.dumps(item.embedding) if item.embedding else None,
                raw_data,
                json.dumps(item.metadata),
                item.timestamp.isoformat(),
                item.last_accessed.isoformat(),
                item.access_count,
                item.importance,
                item.ttl,
            )
        )
        await self._conn.commit()
        
        # 存储到Qdrant
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
                            "modality": modality,
                            "timestamp": item.timestamp.isoformat(),
                            "importance": item.importance,
                        }
                    )
                ]
            )
        
        return item.id
    
    async def add_image(
        self,
        image_data: bytes,
        description: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        embedding: Optional[List[float]] = None,
    ) -> str:
        """添加图像感知记忆"""
        item = MemoryItem(
            id=str(uuid.uuid4()),
            content=description,
            memory_type=MemoryType.PERCEPTUAL,
            embedding=embedding,
            metadata={
                "modality": "image",
                "raw_data": image_data,
                "size": len(image_data),
                **(metadata or {}),
            },
        )
        return await self.add(item)
    
    async def add_audio(
        self,
        audio_data: bytes,
        transcript: str = "",
        metadata: Optional[Dict[str, Any]] = None,
        embedding: Optional[List[float]] = None,
    ) -> str:
        """添加音频感知记忆"""
        item = MemoryItem(
            id=str(uuid.uuid4()),
            content=transcript,
            memory_type=MemoryType.PERCEPTUAL,
            embedding=embedding,
            metadata={
                "modality": "audio",
                "raw_data": audio_data,
                "size": len(audio_data),
                **(metadata or {}),
            },
        )
        return await self.add(item)
    
    async def get(self, item_id: str) -> Optional[MemoryItem]:
        """获取感知记忆"""
        async with self._conn.execute(
            "SELECT * FROM perceptual_memory WHERE id = ?",
            (item_id,)
        ) as cursor:
            row = await cursor.fetchone()
        
        if not row:
            return None
        
        # 更新访问信息
        await self._conn.execute(
            """
            UPDATE perceptual_memory
            SET last_accessed = ?, access_count = access_count + 1
            WHERE id = ?
            """,
            (datetime.now().isoformat(), item_id)
        )
        await self._conn.commit()
        
        return self._row_to_item(row)
    
    def _row_to_item(self, row) -> MemoryItem:
        """将数据库行转换为MemoryItem"""
        metadata = json.loads(row[5]) if row[5] else {}
        metadata["modality"] = row[2]
        
        # 如果有原始数据，添加到metadata
        if row[4]:
            metadata["raw_data"] = row[4]
        
        return MemoryItem(
            id=row[0],
            content=row[1] or "",
            memory_type=MemoryType.PERCEPTUAL,
            embedding=json.loads(row[3]) if row[3] else None,
            metadata=metadata,
            timestamp=datetime.fromisoformat(row[6]),
            last_accessed=datetime.fromisoformat(row[7]) if row[7] else datetime.now(),
            access_count=row[8] or 0,
            importance=row[9] or 0.5,
            ttl=row[10],
        )
    
    async def search(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryItem]:
        """搜索感知记忆"""
        sql = "SELECT * FROM perceptual_memory WHERE 1=1"
        params = []
        
        if query:
            sql += " AND LOWER(content) LIKE ?"
            params.append(f"%{query.lower()}%")
        
        if filters:
            if "modality" in filters:
                sql += " AND modality = ?"
                params.append(filters["modality"])
        
        sql += " ORDER BY importance DESC, timestamp DESC LIMIT ?"
        params.append(top_k)
        
        async with self._conn.execute(sql, params) as cursor:
            rows = await cursor.fetchall()
        
        return [self._row_to_item(row) for row in rows]
    
    async def search_by_modality(
        self,
        modality: str,
        top_k: int = 10
    ) -> List[MemoryItem]:
        """按模态类型搜索"""
        return await self.search("", top_k, filters={"modality": modality})
    
    async def update(self, item_id: str, updates: Dict[str, Any]) -> bool:
        """更新感知记忆"""
        item = await self.get(item_id)
        if not item:
            return False
        
        for key, value in updates.items():
            if hasattr(item, key):
                setattr(item, key, value)
            else:
                item.metadata[key] = value
        
        await self.add(item)
        return True
    
    async def delete(self, item_id: str) -> bool:
        """删除感知记忆"""
        await self._conn.execute(
            "DELETE FROM perceptual_memory WHERE id = ?",
            (item_id,)
        )
        await self._conn.commit()
        
        if self._qdrant:
            self._qdrant.delete(
                collection_name=self._collection_name,
                points_selector=[item_id],
            )
        
        return True
    
    async def clear(self) -> None:
        """清空所有感知记忆"""
        await self._conn.execute("DELETE FROM perceptual_memory")
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
