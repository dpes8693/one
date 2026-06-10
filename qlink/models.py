"""核心資料模型：教材樹節點、考題、關聯。"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class TreeNode:
    """PageIndex 樹中的一個節點（章 / 節 / 小節）。

    ``node_id`` 在整個系統中必須唯一，建議格式為 ``{doc_id}:{原始 node_id}``，
    由 :mod:`qlink.pageindex_adapter` 在載入時自動加上前綴。
    """

    node_id: str
    title: str
    doc_id: str
    summary: str = ""
    text: str = ""
    page_start: int | None = None
    page_end: int | None = None
    parent_id: str | None = None
    children: list["TreeNode"] = field(default_factory=list)
    # 從根節點到此節點的標題路徑，例如「藥理學 > 循環系統藥物 > 抗高血壓藥」。
    title_path: str = ""

    def search_text(self) -> str:
        """用於檢索計分的文字表示：標題路徑 + 摘要 + 內文。"""
        parts = [self.title_path or self.title]
        if self.summary:
            parts.append(self.summary)
        if self.text:
            parts.append(self.text)
        return "\n".join(parts)

    def walk(self):
        """前序走訪自身與所有子孫節點。"""
        yield self
        for child in self.children:
            yield from child.walk()


@dataclass
class Question:
    """題庫中的一道考題。"""

    question_id: str
    stem: str
    options: dict[str, str] = field(default_factory=dict)
    answer: str = ""
    explanation: str = ""
    tags: list[str] = field(default_factory=list)

    def search_text(self) -> str:
        """用於檢索計分的文字表示：題幹 + 選項 + 詳解 + 標籤。"""
        parts = [self.stem]
        parts.extend(self.options.values())
        if self.explanation:
            parts.append(self.explanation)
        if self.tags:
            parts.append(" ".join(self.tags))
        return "\n".join(parts)


@dataclass
class Link:
    """題目與節點之間的一條關聯（多對多中的一邊）。"""

    question_id: str
    node_id: str
    score: float
    method: str = "hybrid"
    # 除錯用的分數細項，例如 {"bm25": 0.8, "cosine": 0.6}
    details: dict[str, float] = field(default_factory=dict)
