"""核心關聯演算法：把題庫中的每一題對應到最相關的教材樹節點。

演算法分三步：

1. **混合計分**：每個節點以「標題路徑 + 摘要 + 內文」建索引，
   每題以「題幹 + 選項 + 詳解 + 標籤」當查詢，計算
   ``hybrid = w_bm25 * BM25(max 正規化) + w_cosine * TF-IDF cosine
   (+ w_embed * embedding cosine，若有注入 provider)``。

2. **層級傳播**：分數沿樹往上傳播（衰減係數 ``parent_decay``），
   讓「子節點命中、父章節也該沾光」；但若父節點的分數
   幾乎完全來自某個已被選中的子節點，則不重複選父節點，
   優先保留最精準（最深）的節點。

3. **多對多篩選**：每題取分數 >= ``min_score`` 且 >= 最高分 *
   ``relative_ratio`` 的前 ``top_k`` 個節點。一題可連到多個節點、
   一個節點可被多題連到，天然形成多對多。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .embeddings import EmbeddingProvider
from .models import Link, Question, TreeNode
from .scoring import BM25, TfidfIndex, cosine
from .textutil import tokenize


@dataclass
class LinkerConfig:
    # 混合分數權重（有 embedding provider 時三者會重新正規化）。
    w_bm25: float = 0.55
    w_cosine: float = 0.45
    w_embed: float = 0.6
    # BM25 覆蓋率的放大係數：題目通常只會命中節點的部分詞彙，
    # 覆蓋率天花板遠低於 1，乘上此係數後相關題目約落在 0.6~1.0。
    coverage_scale: float = 3.0
    # 題目標籤命中節點標題路徑時的加分。
    tag_bonus: float = 0.08
    # 每題最多連結幾個節點。
    top_k: int = 5
    # 絕對分數門檻：低於此分數視為無關，不建立連結。
    min_score: float = 0.45
    # 相對門檻：只保留分數 >= 最高分 * relative_ratio 的節點。
    relative_ratio: float = 0.45
    # 子節點分數往父節點傳播的衰減係數。
    parent_decay: float = 0.8
    # 沒有任何子孫的「葉節點」通常最精準，給予小幅加權。
    leaf_boost: float = 1.05
    bm25_k1: float = 1.5
    bm25_b: float = 0.75


@dataclass
class _Candidate:
    node: TreeNode
    own: float            # 節點自身的混合分數
    final: float = 0.0    # 含層級傳播後的最終分數
    best_child: str | None = None  # final 主要來自哪個子節點（若為傳播）
    details: dict[str, float] = field(default_factory=dict)


def flatten_tree(roots: list[TreeNode]) -> list[TreeNode]:
    """攤平一批樹的全部節點（前序）。"""
    out: list[TreeNode] = []
    for root in roots:
        out.extend(root.walk())
    return out


class NodeIndex:
    """把一批節點建成可重複查詢的索引（新題目進來時不用重建）。"""

    def __init__(
        self,
        nodes: list[TreeNode],
        config: LinkerConfig | None = None,
        embedder: EmbeddingProvider | None = None,
    ):
        self.config = config or LinkerConfig()
        self.nodes = nodes
        self.by_id = {n.node_id: n for n in nodes}
        docs = [tokenize(n.search_text()) for n in nodes]
        self.bm25 = BM25(docs, k1=self.config.bm25_k1, b=self.config.bm25_b)
        self.tfidf = TfidfIndex(docs)
        self.embedder = embedder
        self.node_vectors: list[list[float]] | None = None
        if embedder is not None and nodes:
            self.node_vectors = embedder.embed([n.search_text() for n in nodes])

    # ------------------------------------------------------------------
    def link_question(self, question: Question) -> list[Link]:
        """計算單一題目對所有節點的關聯，回傳通過門檻的連結。"""
        cfg = self.config
        if not self.nodes:
            return []

        query = tokenize(question.search_text())
        # 以「查詢覆蓋率」做絕對正規化：完全無關的題目分數會貼近 0，
        # 再乘上 coverage_scale 把典型相關題的分數拉到 0~1 的可用區間。
        denom = self.bm25.max_possible(query)
        bm25_scores = [
            min(1.0, s / denom * cfg.coverage_scale) if denom > 0 else 0.0
            for s in self.bm25.scores(query)
        ]
        cos_scores = self.tfidf.similarities(query)

        emb_scores: list[float] | None = None
        if self.embedder is not None and self.node_vectors is not None:
            qvec = self.embedder.embed([question.search_text()])[0]
            emb_scores = [cosine(qvec, nv) for nv in self.node_vectors]

        if emb_scores is None:
            total_w = cfg.w_bm25 + cfg.w_cosine
            weights = (cfg.w_bm25 / total_w, cfg.w_cosine / total_w, 0.0)
        else:
            total_w = cfg.w_bm25 + cfg.w_cosine + cfg.w_embed
            weights = (
                cfg.w_bm25 / total_w,
                cfg.w_cosine / total_w,
                cfg.w_embed / total_w,
            )

        tags = [t for t in question.tags if t.strip()]
        candidates: dict[str, _Candidate] = {}
        for i, node in enumerate(self.nodes):
            score = weights[0] * bm25_scores[i] + weights[1] * cos_scores[i]
            details = {"bm25": bm25_scores[i], "cosine": cos_scores[i]}
            if emb_scores is not None:
                score += weights[2] * emb_scores[i]
                details["embed"] = emb_scores[i]
            if tags and any(t in node.title_path for t in tags):
                score += cfg.tag_bonus
                details["tag_bonus"] = cfg.tag_bonus
            if not node.children:
                score *= cfg.leaf_boost
            candidates[node.node_id] = _Candidate(node=node, own=score, details=details)

        self._propagate(candidates)
        return self._select(question, candidates)

    # ------------------------------------------------------------------
    def _propagate(self, candidates: dict[str, _Candidate]) -> None:
        """自底向上：父節點分數 = max(自身, 最強子節點 * parent_decay)。"""

        def resolve(node_id: str) -> float:
            cand = candidates[node_id]
            if cand.final > 0:
                return cand.final
            best = cand.own
            best_child: str | None = None
            for child in cand.node.children:
                if child.node_id not in candidates:
                    continue
                propagated = resolve(child.node_id) * self.config.parent_decay
                if propagated > best:
                    best = propagated
                    best_child = child.node_id
            cand.final = best
            cand.best_child = best_child
            return best

        for node_id in candidates:
            resolve(node_id)

    # ------------------------------------------------------------------
    def _select(
        self, question: Question, candidates: dict[str, _Candidate]
    ) -> list[Link]:
        cfg = self.config
        ranked = sorted(candidates.values(), key=lambda c: c.final, reverse=True)
        if not ranked or ranked[0].final < cfg.min_score:
            return []
        best_score = ranked[0].final
        floor = max(cfg.min_score, best_score * cfg.relative_ratio)

        links: list[Link] = []
        # covered 收集「已選中」與「因子節點已被涵蓋而跳過」的節點，
        # 讓傳播鏈上的祖先（父、祖父…）都被一路跳過，只留最精準層級。
        covered: set[str] = set()
        for cand in ranked:
            if len(links) >= cfg.top_k:
                break
            if cand.final < floor:
                break
            if cand.best_child is not None and cand.best_child in covered:
                covered.add(cand.node.node_id)
                continue
            covered.add(cand.node.node_id)
            links.append(
                Link(
                    question_id=question.question_id,
                    node_id=cand.node.node_id,
                    score=round(cand.final, 4),
                    method="hybrid+embed" if self.embedder else "hybrid",
                    details={k: round(v, 4) for k, v in cand.details.items()},
                )
            )
        return links


def link_questions_to_nodes(
    nodes: list[TreeNode],
    questions: list[Question],
    config: LinkerConfig | None = None,
    embedder: EmbeddingProvider | None = None,
) -> list[Link]:
    """把一批題目對一批節點跑完整的關聯演算法。

    ``nodes`` 可以是 :func:`flatten_tree` 的結果（含層級資訊），
    也可以是任意節點清單。回傳所有通過門檻的多對多連結。
    """
    index = NodeIndex(nodes, config, embedder)
    links: list[Link] = []
    for question in questions:
        links.extend(index.link_question(question))
    return links
