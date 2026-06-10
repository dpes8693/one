"""純 Python 的檢索計分：BM25 與 TF-IDF cosine。

兩者互補：
- BM25 對「關鍵詞命中」敏感，適合題幹中的專有名詞對到節點標題／摘要。
- TF-IDF cosine 對整體用詞分布敏感，可緩和 BM25 對長文件的偏差。
"""

from __future__ import annotations

import math
from collections import Counter


class BM25:
    """Okapi BM25。建構時吃整個語料（token 化後的文件清單）。"""

    def __init__(self, docs: list[list[str]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.doc_freqs: list[Counter[str]] = [Counter(d) for d in docs]
        self.doc_lens = [len(d) for d in docs]
        self.avgdl = (sum(self.doc_lens) / len(docs)) if docs else 0.0
        self.n_docs = len(docs)
        df: Counter[str] = Counter()
        for freq in self.doc_freqs:
            df.update(freq.keys())
        # BM25+ 風格的 idf 下限，避免極高頻詞變成負分。
        self.idf = {
            term: max(0.25, math.log((self.n_docs - n + 0.5) / (n + 0.5) + 1.0))
            for term, n in df.items()
        }

    def score(self, query: list[str], idx: int) -> float:
        freq = self.doc_freqs[idx]
        dl = self.doc_lens[idx]
        if dl == 0 or self.avgdl == 0:
            return 0.0
        norm = self.k1 * (1 - self.b + self.b * dl / self.avgdl)
        score = 0.0
        for term in query:
            f = freq.get(term)
            if not f:
                continue
            idf = self.idf.get(term, 0.0)
            score += idf * f * (self.k1 + 1) / (f + norm)
        return score

    def scores(self, query: list[str]) -> list[float]:
        return [self.score(query, i) for i in range(self.n_docs)]

    def max_possible(self, query: list[str]) -> float:
        """此查詢理論上的最高分（所有 token 都被完全命中時）。

        用它把 BM25 正規化成「絕對的查詢覆蓋率」（0~1），
        而不是對每個查詢各自取最大值正規化——後者會讓完全
        無關的查詢，其最高分文件也被拉到 1.0，使絕對門檻失效。
        """
        return sum(self.idf.get(t, 0.0) * (self.k1 + 1) for t in query)


class TfidfIndex:
    """TF-IDF 向量索引，提供 query 對每份文件的 cosine 相似度。"""

    def __init__(self, docs: list[list[str]]):
        self.n_docs = len(docs)
        df: Counter[str] = Counter()
        for d in docs:
            df.update(set(d))
        self.idf = {
            term: math.log((self.n_docs + 1) / (n + 1)) + 1.0 for term, n in df.items()
        }
        self.vectors = [self._vectorize(d) for d in docs]

    def _vectorize(self, tokens: list[str]) -> dict[str, float]:
        tf = Counter(tokens)
        vec = {
            term: (1 + math.log(f)) * self.idf.get(term, 0.0) for term, f in tf.items()
        }
        norm = math.sqrt(sum(w * w for w in vec.values()))
        if norm > 0:
            vec = {t: w / norm for t, w in vec.items()}
        return vec

    def similarities(self, query: list[str]) -> list[float]:
        qvec = self._vectorize(query)
        out: list[float] = []
        for dvec in self.vectors:
            small, large = (qvec, dvec) if len(qvec) < len(dvec) else (dvec, qvec)
            out.append(sum(w * large.get(t, 0.0) for t, w in small.items()))
        return out


def cosine(a: list[float], b: list[float]) -> float:
    """兩個稠密向量（如 embedding）的 cosine 相似度。"""
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


def normalize_max(scores: list[float]) -> list[float]:
    """以最大值正規化到 0~1，全零時原樣返回。"""
    m = max(scores) if scores else 0.0
    if m <= 0:
        return list(scores)
    return [s / m for s in scores]
