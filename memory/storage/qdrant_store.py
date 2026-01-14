"""
Qdrant向量存储 - 高性能向量检索
"""

from typing import Any, Dict, List, Optional
import uuid


class QdrantStore:
    """Qdrant向量存储封装"""
    
    def __init__(
        self,
        host: str = "localhost",
        port: int = 6333,
        collection_name: str = "default",
        embedding_dim: int = 1536,
    ):
        self.host = host
        self.port = port
        self.collection_name = collection_name
        self.embedding_dim = embedding_dim
        self._client = None
    
    async def initialize(self) -> None:
        """初始化Qdrant连接"""
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.http import models
            
            self._client = QdrantClient(host=self.host, port=self.port)
            
            # 检查或创建集合
            collections = self._client.get_collections().collections
            if self.collection_name not in [c.name for c in collections]:
                self._client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=models.VectorParams(
                        size=self.embedding_dim,
                        distance=models.Distance.COSINE,
                    ),
                )
            print(f"[QdrantStore] 已连接: {self.collection_name}")
        except Exception as e:
            print(f"[QdrantStore] 连接失败: {e}")
            raise
    
    async def upsert(
        self,
        id: str,
        vector: List[float],
        payload: Optional[Dict[str, Any]] = None,
    ) -> str:
        """插入或更新向量"""
        from qdrant_client.http import models
        
        self._client.upsert(
            collection_name=self.collection_name,
            points=[
                models.PointStruct(
                    id=id,
                    vector=vector,
                    payload=payload or {},
                )
            ]
        )
        return id
    
    async def search(
        self,
        query_vector: List[float],
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """向量相似性搜索"""
        from qdrant_client.http import models
        
        filter_obj = None
        if filters:
            conditions = [
                models.FieldCondition(key=k, match=models.MatchValue(value=v))
                for k, v in filters.items()
            ]
            filter_obj = models.Filter(must=conditions)
        
        results = self._client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=filter_obj,
        )
        
        return [
            {"id": r.id, "score": r.score, "payload": r.payload}
            for r in results
        ]
    
    async def delete(self, ids: List[str]) -> None:
        """删除向量"""
        self._client.delete(
            collection_name=self.collection_name,
            points_selector=ids,
        )
    
    async def close(self) -> None:
        """关闭连接"""
        self._client = None
