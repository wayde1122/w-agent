"""
Neo4j图存储 - 知识图谱管理
"""

from typing import Any, Dict, List, Optional, Tuple


class Neo4jStore:
    """Neo4j图存储封装"""
    
    def __init__(
        self,
        uri: str = "bolt://localhost:7687",
        user: str = "neo4j",
        password: str = "",
    ):
        self.uri = uri
        self.user = user
        self.password = password
        self._driver = None
    
    async def initialize(self) -> None:
        """初始化Neo4j连接"""
        try:
            from neo4j import AsyncGraphDatabase
            
            self._driver = AsyncGraphDatabase.driver(
                self.uri,
                auth=(self.user, self.password)
            )
            async with self._driver.session() as session:
                await session.run("RETURN 1")
            print("[Neo4jStore] 已连接")
        except Exception as e:
            print(f"[Neo4jStore] 连接失败: {e}")
            raise
    
    async def create_node(
        self,
        label: str,
        properties: Dict[str, Any],
    ) -> str:
        """创建节点"""
        async with self._driver.session() as session:
            result = await session.run(
                f"CREATE (n:{label} $props) RETURN id(n) as id",
                props=properties,
            )
            record = await result.single()
            return str(record["id"])
    
    async def create_relationship(
        self,
        source_id: str,
        target_id: str,
        rel_type: str,
        properties: Optional[Dict[str, Any]] = None,
    ) -> None:
        """创建关系"""
        async with self._driver.session() as session:
            await session.run(
                f"""
                MATCH (a), (b)
                WHERE id(a) = $source AND id(b) = $target
                CREATE (a)-[r:{rel_type} $props]->(b)
                """,
                source=int(source_id),
                target=int(target_id),
                props=properties or {},
            )
    
    async def query(self, cypher: str, params: Optional[Dict[str, Any]] = None) -> List[Dict]:
        """执行Cypher查询"""
        async with self._driver.session() as session:
            result = await session.run(cypher, params or {})
            return await result.data()
    
    async def delete_node(self, node_id: str) -> None:
        """删除节点"""
        async with self._driver.session() as session:
            await session.run(
                "MATCH (n) WHERE id(n) = $id DETACH DELETE n",
                id=int(node_id),
            )
    
    async def close(self) -> None:
        """关闭连接"""
        if self._driver:
            await self._driver.close()
