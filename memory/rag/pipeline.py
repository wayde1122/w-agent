"""
RAG管道 - 端到端处理

实现检索增强生成的完整流程：
1. 文档处理与索引
2. 查询理解与改写
3. 相关文档检索
4. 上下文组装
5. 生成回答
"""

from typing import Any, Dict, List, Optional
from dataclasses import dataclass


@dataclass
class RAGResult:
    """RAG结果"""
    answer: str
    sources: List[Dict[str, Any]]
    context: str
    query: str


class RAGPipeline:
    """RAG管道 - 端到端检索增强生成"""
    
    def __init__(
        self,
        embedding_service=None,
        vector_store=None,
        llm=None,
        top_k: int = 5,
    ):
        self.embedding_service = embedding_service
        self.vector_store = vector_store
        self.llm = llm
        self.top_k = top_k
    
    async def initialize(self) -> None:
        """初始化管道组件"""
        if self.embedding_service:
            await self.embedding_service.initialize()
        if self.vector_store:
            await self.vector_store.initialize()
        print("[RAGPipeline] 已初始化")
    
    async def index_documents(
        self,
        documents: List[Dict[str, Any]],
    ) -> int:
        """
        索引文档
        
        Args:
            documents: 文档列表，每个文档包含 id, content, metadata
            
        Returns:
            成功索引的文档数量
        """
        count = 0
        for doc in documents:
            try:
                # 生成嵌入
                embedding = await self.embedding_service.embed(doc["content"])
                
                # 存储到向量库
                await self.vector_store.upsert(
                    id=doc["id"],
                    vector=embedding,
                    payload={
                        "content": doc["content"],
                        **doc.get("metadata", {}),
                    }
                )
                count += 1
            except Exception as e:
                print(f"[RAGPipeline] 索引文档失败: {e}")
        
        return count
    
    async def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        filters: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        检索相关文档
        
        Args:
            query: 查询文本
            top_k: 返回数量
            filters: 过滤条件
            
        Returns:
            相关文档列表
        """
        # 生成查询嵌入
        query_embedding = await self.embedding_service.embed(query)
        
        # 向量检索
        results = await self.vector_store.search(
            query_vector=query_embedding,
            top_k=top_k or self.top_k,
            filters=filters,
        )
        
        return results
    
    async def query(
        self,
        question: str,
        top_k: Optional[int] = None,
        system_prompt: Optional[str] = None,
    ) -> RAGResult:
        """
        执行RAG查询
        
        Args:
            question: 用户问题
            top_k: 检索文档数量
            system_prompt: 系统提示词
            
        Returns:
            RAG结果
        """
        # 检索相关文档
        results = await self.retrieve(question, top_k)
        
        # 构建上下文
        context_parts = []
        for i, r in enumerate(results, 1):
            content = r.get("payload", {}).get("content", "")
            context_parts.append(f"[{i}] {content}")
        
        context = "\n\n".join(context_parts)
        
        # 构建提示
        default_prompt = """你是一个有帮助的助手。请根据以下参考资料回答用户的问题。
如果参考资料中没有相关信息，请说明这一点。

参考资料：
{context}

用户问题：{question}

请给出准确、有帮助的回答："""
        
        prompt = (system_prompt or default_prompt).format(
            context=context,
            question=question,
        )
        
        # 生成回答
        if self.llm:
            messages = [{"role": "user", "content": prompt}]
            answer = self.llm.think(messages)
        else:
            answer = f"[无LLM] 检索到 {len(results)} 条相关文档"
        
        return RAGResult(
            answer=answer,
            sources=results,
            context=context,
            query=question,
        )
    
    async def close(self) -> None:
        """关闭管道"""
        if self.embedding_service:
            await self.embedding_service.close()
        if self.vector_store:
            await self.vector_store.close()
