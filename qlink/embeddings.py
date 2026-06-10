"""可選的 embedding 介面。

核心演算法（BM25 + TF-IDF）不需要任何外部服務即可運作；
若想提升語意層面的召回（例如題目換句話說、同義詞），
可注入一個 EmbeddingProvider，linker 會把 embedding cosine
納入混合分數。
"""

from __future__ import annotations

from typing import Protocol


class EmbeddingProvider(Protocol):
    """任何能把一批文本轉成同維度向量的物件都可以當 provider。"""

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class OpenAIEmbeddingProvider:
    """使用 OpenAI embedding API 的 provider（需要 `pip install openai`）。

    用法::

        provider = OpenAIEmbeddingProvider(model="text-embedding-3-small")
        links = link_questions_to_nodes(nodes, questions, config, provider)
    """

    def __init__(self, model: str = "text-embedding-3-small", batch_size: int = 64):
        try:
            from openai import OpenAI
        except ImportError as exc:  # pragma: no cover
            raise ImportError(
                "OpenAIEmbeddingProvider 需要 openai 套件：pip install openai"
            ) from exc
        self._client = OpenAI()
        self.model = model
        self.batch_size = batch_size

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            resp = self._client.embeddings.create(model=self.model, input=batch)
            vectors.extend(item.embedding for item in resp.data)
        return vectors
