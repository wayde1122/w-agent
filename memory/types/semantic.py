"""
语义记忆 - 知识图谱，Qdrant + Neo4j

特点：
- 存储概念、事实和关系
- 支持图结构查询
- 使用Qdrant向量检索 + Neo4j图存储
"""

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
import uuid

from ..base import BaseMemory, MemoryItem, MemoryConfig, MemoryType


class SemanticMemory(BaseMemory):
    """
    语义记忆 - 存储知识和概念关系
    
    使用Neo4j存储知识图谱，Qdrant存储向量表示
    """
    
    def __init__(self, config: Optional[MemoryConfig] = None):
        super().__init__(config)
        self._neo4j = None
        self._qdrant = None
        self._collection_name = "semantic_memory"
    
    async def initialize(self) -> None:
        """初始化语义记忆存储"""
        if self._initialized:
            return
        
        # 初始化Neo4j
        await self._init_neo4j()
        
        # 初始化Qdrant
        await self._init_qdrant()
        
        self._initialized = True
        print("[SemanticMemory] 初始化完成")
    
    async def _init_neo4j(self) -> None:
        """初始化Neo4j图数据库"""
        try:
            from neo4j import AsyncGraphDatabase
            
            self._neo4j = AsyncGraphDatabase.driver(
                self.config.neo4j_uri,
                auth=(self.config.neo4j_user, self.config.neo4j_password)
            )
            
            # 测试连接
            async with self._neo4j.session() as session:
                await session.run("RETURN 1")
            
            print("[SemanticMemory] Neo4j已连接")
        except Exception as e:
            print(f"[SemanticMemory] Neo4j不可用: {e}")
            self._neo4j = None
    
    async def _init_qdrant(self) -> None:
        """初始化Qdrant向量存储"""
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
            
            print("[SemanticMemory] Qdrant向量存储已连接")
        except Exception as e:
            print(f"[SemanticMemory] Qdrant不可用: {e}")
            self._qdrant = None
    
    async def add(self, item: MemoryItem) -> str:
        """添加语义记忆（知识节点）"""
        if not item.id:
            item.id = str(uuid.uuid4())
        
        # 添加到Neo4j
        if self._neo4j:
            async with self._neo4j.session() as session:
                await session.run(
                    """
                    MERGE (n:Knowledge {id: $id})
                    SET n.content = $content,
                        n.timestamp = $timestamp,
                        n.importance = $importance,
                        n.metadata = $metadata
                    """,
                    id=item.id,
                    content=item.content,
                    timestamp=item.timestamp.isoformat(),
                    importance=item.importance,
                    metadata=str(item.metadata),
                )
        
        # 添加到Qdrant
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
    
    async def add_relation(
        self,
        source_id: str,
        target_id: str,
        relation_type: str,
        properties: Optional[Dict[str, Any]] = None
    ) -> bool:
        """添加知识关系"""
        if not self._neo4j:
            print("[SemanticMemory] Neo4j不可用，无法添加关系")
            return False
        
        async with self._neo4j.session() as session:
            await session.run(
                f"""
                MATCH (a:Knowledge {{id: $source_id}})
                MATCH (b:Knowledge {{id: $target_id}})
                MERGE (a)-[r:{relation_type}]->(b)
                SET r += $properties
                """,
                source_id=source_id,
                target_id=target_id,
                properties=properties or {},
            )
        
        return True
    
    async def get(self, item_id: str) -> Optional[MemoryItem]:
        """获取语义记忆"""
        if not self._neo4j:
            return None
        
        async with self._neo4j.session() as session:
            result = await session.run(
                "MATCH (n:Knowledge {id: $id}) RETURN n",
                id=item_id,
            )
            record = await result.single()
            
        if not record:
            return None
        
        node = record["n"]
        return MemoryItem(
            id=node["id"],
            content=node["content"],
            memory_type=MemoryType.SEMANTIC,
            timestamp=datetime.fromisoformat(node["timestamp"]),
            importance=node.get("importance", 0.5),
            metadata=eval(node.get("metadata", "{}")),
        )
    
    async def get_related(
        self,
        item_id: str,
        relation_type: Optional[str] = None,
        direction: str = "both",
        depth: int = 1
    ) -> List[Tuple[MemoryItem, str, MemoryItem]]:
        """
        获取相关知识
        
        Args:
            item_id: 起始节点ID
            relation_type: 关系类型（None表示所有类型）
            direction: 方向 ("in", "out", "both")
            depth: 遍历深度
            
        Returns:
            (源节点, 关系类型, 目标节点) 的列表
        """
        if not self._neo4j:
            return []
        
        # 构建关系模式
        rel_pattern = f"[r:{relation_type}]" if relation_type else "[r]"
        
        if direction == "out":
            pattern = f"-{rel_pattern}->"
        elif direction == "in":
            pattern = f"<-{rel_pattern}-"
        else:
            pattern = f"-{rel_pattern}-"
        
        async with self._neo4j.session() as session:
            result = await session.run(
                f"""
                MATCH (a:Knowledge {{id: $id}}){pattern}(b:Knowledge)
                RETURN a, type(r) as rel_type, b
                """,
                id=item_id,
            )
            records = await result.data()
        
        results = []
        for record in records:
            source = self._node_to_item(record["a"])
            target = self._node_to_item(record["b"])
            results.append((source, record["rel_type"], target))
        
        return results
    
    def _node_to_item(self, node) -> MemoryItem:
        """将Neo4j节点转换为MemoryItem"""
        return MemoryItem(
            id=node["id"],
            content=node["content"],
            memory_type=MemoryType.SEMANTIC,
            timestamp=datetime.fromisoformat(node["timestamp"]) if node.get("timestamp") else datetime.now(),
            importance=node.get("importance", 0.5),
            metadata=eval(node.get("metadata", "{}")),
        )
    
    async def search(
        self,
        query: str,
        top_k: int = 10,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[MemoryItem]:
        """搜索语义记忆"""
        # 优先使用向量搜索
        if self._qdrant:
            # TODO: 需要嵌入服务来生成查询向量
            pass
        
        # Fallback到Neo4j全文搜索
        if self._neo4j:
            async with self._neo4j.session() as session:
                result = await session.run(
                    """
                    MATCH (n:Knowledge)
                    WHERE toLower(n.content) CONTAINS toLower($query)
                    RETURN n
                    ORDER BY n.importance DESC
                    LIMIT $limit
                    """,
                    query=query,
                    limit=top_k,
                )
                records = await result.data()
            
            return [self._node_to_item(r["n"]) for r in records]
        
        return []
    
    async def update(self, item_id: str, updates: Dict[str, Any]) -> bool:
        """更新语义记忆"""
        if not self._neo4j:
            return False
        
        set_clauses = ", ".join([f"n.{k} = ${k}" for k in updates.keys()])
        
        async with self._neo4j.session() as session:
            result = await session.run(
                f"""
                MATCH (n:Knowledge {{id: $id}})
                SET {set_clauses}
                RETURN n
                """,
                id=item_id,
                **updates,
            )
            record = await result.single()
        
        return record is not None
    
    async def delete(self, item_id: str) -> bool:
        """删除语义记忆"""
        if self._neo4j:
            async with self._neo4j.session() as session:
                await session.run(
                    "MATCH (n:Knowledge {id: $id}) DETACH DELETE n",
                    id=item_id,
                )
        
        if self._qdrant:
            self._qdrant.delete(
                collection_name=self._collection_name,
                points_selector=[item_id],
            )
        
        return True
    
    async def clear(self) -> None:
        """清空所有语义记忆"""
        if self._neo4j:
            async with self._neo4j.session() as session:
                await session.run("MATCH (n:Knowledge) DETACH DELETE n")
        
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
        if self._neo4j:
            await self._neo4j.close()
