"""增量導入流程。

兩個方向的增量都支援，且只計算「新資料 × 既有資料」的組合：

- :func:`ingest_tree`：新 PDF（的 PageIndex 樹）進系統時，
  只把「既有全部題目」對「這份新文件的節點」跑關聯。
- :func:`ingest_questions`：新題目進系統時，
  只把「新題目」對「既有全部節點」跑關聯。
- :func:`relink_all`：調整演算法參數後全量重算。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .embeddings import EmbeddingProvider
from .linker import LinkerConfig, NodeIndex, link_questions_to_nodes
from .models import Link, Question
from .pageindex_adapter import load_tree, load_tree_file
from .store import Store


def _parse_questions(data: list[dict[str, Any]]) -> list[Question]:
    questions: list[Question] = []
    for i, raw in enumerate(data):
        options = raw.get("options") or {}
        if isinstance(options, list):
            options = {chr(ord("A") + j): opt for j, opt in enumerate(options)}
        questions.append(
            Question(
                question_id=str(raw.get("question_id") or raw.get("id") or f"q{i+1:04d}"),
                stem=str(raw.get("stem") or raw.get("question") or ""),
                options={str(k): str(v) for k, v in options.items()},
                answer=str(raw.get("answer") or ""),
                explanation=str(raw.get("explanation") or raw.get("rationale") or ""),
                tags=[str(t) for t in (raw.get("tags") or [])],
            )
        )
    return questions


def ingest_tree(
    store: Store,
    tree: dict[str, Any] | list[Any] | str | Path,
    doc_id: str | None = None,
    name: str | None = None,
    config: LinkerConfig | None = None,
    embedder: EmbeddingProvider | None = None,
) -> tuple[str, int, list[Link]]:
    """導入一份 PageIndex 樹（JSON 物件或檔案路徑），並與既有題庫建立關聯。

    回傳 ``(doc_id, 節點數, 新建立的連結)``。
    """
    if isinstance(tree, (str, Path)):
        roots = load_tree_file(tree, doc_id)
        doc_id = roots[0].doc_id if roots else (doc_id or Path(tree).stem)
    else:
        if doc_id is None:
            raise ValueError("以 JSON 物件導入時必須指定 doc_id")
        roots = load_tree(tree, doc_id)

    store.delete_links_for_doc(doc_id)
    n_nodes = store.save_document(doc_id, name or doc_id, roots)

    # 既有題庫（可能是 100 題、也可能是 10 萬題）只對新文件的節點計分。
    questions = store.load_questions()
    links: list[Link] = []
    if questions:
        nodes = store.load_nodes(doc_id)
        links = link_questions_to_nodes(nodes, questions, config, embedder)
        store.save_links(links)
    return doc_id, n_nodes, links


def ingest_questions(
    store: Store,
    questions: list[dict[str, Any]] | list[Question] | str | Path,
    config: LinkerConfig | None = None,
    embedder: EmbeddingProvider | None = None,
) -> tuple[int, list[Link]]:
    """導入一批題目（JSON 物件、Question 清單或檔案路徑），並與既有節點建立關聯。

    回傳 ``(題目數, 新建立的連結)``。
    """
    if isinstance(questions, (str, Path)):
        data = json.loads(Path(questions).read_text(encoding="utf-8"))
        parsed = _parse_questions(data)
    elif questions and isinstance(questions[0], Question):
        parsed = list(questions)  # type: ignore[arg-type]
    else:
        parsed = _parse_questions(questions)  # type: ignore[arg-type]

    store.save_questions(parsed)
    store.delete_links_for_questions([q.question_id for q in parsed])

    nodes = store.load_nodes()
    links: list[Link] = []
    if nodes:
        index = NodeIndex(nodes, config, embedder)
        for q in parsed:
            links.extend(index.link_question(q))
        store.save_links(links)
    return len(parsed), links


def relink_all(
    store: Store,
    config: LinkerConfig | None = None,
    embedder: EmbeddingProvider | None = None,
) -> list[Link]:
    """全量重算所有題目與所有節點的關聯（調參後使用）。"""
    questions = store.load_questions()
    nodes = store.load_nodes()
    store.delete_links_for_questions([q.question_id for q in questions])
    links = link_questions_to_nodes(nodes, questions, config, embedder)
    store.save_links(links)
    return links
