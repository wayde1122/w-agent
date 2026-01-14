"""
SQLite文档存储 - 结构化持久化
"""

from typing import Any, Dict, List, Optional
import json
import os


class DocumentStore:
    """SQLite文档存储封装"""
    
    def __init__(self, db_path: str = "./data/documents.db"):
        self.db_path = db_path
        self._conn = None
    
    async def initialize(self) -> None:
        """初始化SQLite连接"""
        import aiosqlite
        
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        self._conn = await aiosqlite.connect(self.db_path)
        
        await self._conn.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TEXT,
                updated_at TEXT
            )
        """)
        await self._conn.commit()
        print("[DocumentStore] 已初始化")
    
    async def insert(
        self,
        id: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """插入文档"""
        from datetime import datetime
        
        now = datetime.now().isoformat()
        await self._conn.execute(
            """
            INSERT OR REPLACE INTO documents (id, content, metadata, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (id, content, json.dumps(metadata or {}), now, now)
        )
        await self._conn.commit()
        return id
    
    async def get(self, id: str) -> Optional[Dict[str, Any]]:
        """获取文档"""
        async with self._conn.execute(
            "SELECT * FROM documents WHERE id = ?", (id,)
        ) as cursor:
            row = await cursor.fetchone()
        
        if not row:
            return None
        
        return {
            "id": row[0],
            "content": row[1],
            "metadata": json.loads(row[2]) if row[2] else {},
            "created_at": row[3],
            "updated_at": row[4],
        }
    
    async def search(
        self,
        query: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """搜索文档"""
        async with self._conn.execute(
            """
            SELECT * FROM documents 
            WHERE content LIKE ? 
            ORDER BY updated_at DESC 
            LIMIT ?
            """,
            (f"%{query}%", limit)
        ) as cursor:
            rows = await cursor.fetchall()
        
        return [
            {
                "id": row[0],
                "content": row[1],
                "metadata": json.loads(row[2]) if row[2] else {},
                "created_at": row[3],
                "updated_at": row[4],
            }
            for row in rows
        ]
    
    async def delete(self, id: str) -> None:
        """删除文档"""
        await self._conn.execute("DELETE FROM documents WHERE id = ?", (id,))
        await self._conn.commit()
    
    async def close(self) -> None:
        """关闭连接"""
        if self._conn:
            await self._conn.close()
