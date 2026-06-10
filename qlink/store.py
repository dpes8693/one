"""SQLite 儲存層：文件、節點、題目與多對多關聯。"""

from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from .models import Link, Question, TreeNode

_SCHEMA = """
CREATE TABLE IF NOT EXISTS documents (
    doc_id     TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS nodes (
    node_id    TEXT PRIMARY KEY,
    doc_id     TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
    parent_id  TEXT,
    title      TEXT NOT NULL,
    title_path TEXT NOT NULL,
    summary    TEXT NOT NULL DEFAULT '',
    text       TEXT NOT NULL DEFAULT '',
    page_start INTEGER,
    page_end   INTEGER
);
CREATE INDEX IF NOT EXISTS idx_nodes_doc ON nodes(doc_id);
CREATE INDEX IF NOT EXISTS idx_nodes_parent ON nodes(parent_id);
CREATE TABLE IF NOT EXISTS questions (
    question_id TEXT PRIMARY KEY,
    stem        TEXT NOT NULL,
    options     TEXT NOT NULL DEFAULT '{}',
    answer      TEXT NOT NULL DEFAULT '',
    explanation TEXT NOT NULL DEFAULT '',
    tags        TEXT NOT NULL DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS links (
    question_id TEXT NOT NULL REFERENCES questions(question_id) ON DELETE CASCADE,
    node_id     TEXT NOT NULL REFERENCES nodes(node_id) ON DELETE CASCADE,
    score       REAL NOT NULL,
    method      TEXT NOT NULL,
    details     TEXT NOT NULL DEFAULT '{}',
    created_at  TEXT NOT NULL,
    PRIMARY KEY (question_id, node_id)
);
CREATE INDEX IF NOT EXISTS idx_links_node ON links(node_id);
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


class Store:
    def __init__(self, db_path: str | Path = "qlink.db"):
        self.conn = sqlite3.connect(str(db_path))
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA foreign_keys = ON")
        self.conn.executescript(_SCHEMA)

    def close(self) -> None:
        self.conn.close()

    def __enter__(self) -> "Store":
        return self

    def __exit__(self, *exc) -> None:
        self.close()

    # ------------------------------------------------------------- 文件 / 節點
    def save_document(self, doc_id: str, name: str, roots: list[TreeNode]) -> int:
        """寫入（或覆蓋）一份文件與其全部節點，回傳節點數。"""
        with self.conn:
            self.conn.execute("DELETE FROM documents WHERE doc_id = ?", (doc_id,))
            self.conn.execute(
                "INSERT INTO documents (doc_id, name, created_at) VALUES (?, ?, ?)",
                (doc_id, name, _now()),
            )
            count = 0
            for root in roots:
                for node in root.walk():
                    self.conn.execute(
                        "INSERT OR REPLACE INTO nodes (node_id, doc_id, parent_id,"
                        " title, title_path, summary, text, page_start, page_end)"
                        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        (
                            node.node_id,
                            doc_id,
                            node.parent_id,
                            node.title,
                            node.title_path,
                            node.summary,
                            node.text,
                            node.page_start,
                            node.page_end,
                        ),
                    )
                    count += 1
        return count

    def _row_to_node(self, row: sqlite3.Row) -> TreeNode:
        return TreeNode(
            node_id=row["node_id"],
            title=row["title"],
            doc_id=row["doc_id"],
            summary=row["summary"],
            text=row["text"],
            page_start=row["page_start"],
            page_end=row["page_end"],
            parent_id=row["parent_id"],
            title_path=row["title_path"],
        )

    def load_nodes(self, doc_id: str | None = None) -> list[TreeNode]:
        """載入節點並重建 children 連結（回傳攤平清單，層級仍可走訪）。"""
        if doc_id is None:
            rows = self.conn.execute("SELECT * FROM nodes").fetchall()
        else:
            rows = self.conn.execute(
                "SELECT * FROM nodes WHERE doc_id = ?", (doc_id,)
            ).fetchall()
        nodes = [self._row_to_node(r) for r in rows]
        by_id = {n.node_id: n for n in nodes}
        for node in nodes:
            if node.parent_id and node.parent_id in by_id:
                by_id[node.parent_id].children.append(node)
        return nodes

    def get_node(self, node_id: str) -> TreeNode | None:
        row = self.conn.execute(
            "SELECT * FROM nodes WHERE node_id = ?", (node_id,)
        ).fetchone()
        return self._row_to_node(row) if row else None

    def list_documents(self) -> list[sqlite3.Row]:
        return self.conn.execute(
            "SELECT d.*, COUNT(n.node_id) AS n_nodes FROM documents d"
            " LEFT JOIN nodes n ON n.doc_id = d.doc_id GROUP BY d.doc_id"
        ).fetchall()

    # ------------------------------------------------------------------- 題目
    def save_questions(self, questions: list[Question]) -> int:
        with self.conn:
            for q in questions:
                self.conn.execute(
                    "INSERT OR REPLACE INTO questions"
                    " (question_id, stem, options, answer, explanation, tags)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        q.question_id,
                        q.stem,
                        json.dumps(q.options, ensure_ascii=False),
                        q.answer,
                        q.explanation,
                        json.dumps(q.tags, ensure_ascii=False),
                    ),
                )
        return len(questions)

    def _row_to_question(self, row: sqlite3.Row) -> Question:
        return Question(
            question_id=row["question_id"],
            stem=row["stem"],
            options=json.loads(row["options"]),
            answer=row["answer"],
            explanation=row["explanation"],
            tags=json.loads(row["tags"]),
        )

    def load_questions(self) -> list[Question]:
        rows = self.conn.execute("SELECT * FROM questions").fetchall()
        return [self._row_to_question(r) for r in rows]

    def get_question(self, question_id: str) -> Question | None:
        row = self.conn.execute(
            "SELECT * FROM questions WHERE question_id = ?", (question_id,)
        ).fetchone()
        return self._row_to_question(row) if row else None

    # ------------------------------------------------------------------- 關聯
    def save_links(self, links: list[Link]) -> int:
        with self.conn:
            for link in links:
                self.conn.execute(
                    "INSERT OR REPLACE INTO links"
                    " (question_id, node_id, score, method, details, created_at)"
                    " VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        link.question_id,
                        link.node_id,
                        link.score,
                        link.method,
                        json.dumps(link.details, ensure_ascii=False),
                        _now(),
                    ),
                )
        return len(links)

    def delete_links_for_questions(self, question_ids: list[str]) -> None:
        with self.conn:
            self.conn.executemany(
                "DELETE FROM links WHERE question_id = ?",
                [(qid,) for qid in question_ids],
            )

    def delete_links_for_doc(self, doc_id: str) -> None:
        with self.conn:
            self.conn.execute(
                "DELETE FROM links WHERE node_id IN"
                " (SELECT node_id FROM nodes WHERE doc_id = ?)",
                (doc_id,),
            )

    def nodes_for_question(self, question_id: str) -> list[tuple[TreeNode, float]]:
        """題目 -> 關聯教材節點（含分數，由高到低）。"""
        rows = self.conn.execute(
            "SELECT n.*, l.score FROM links l JOIN nodes n ON n.node_id = l.node_id"
            " WHERE l.question_id = ? ORDER BY l.score DESC",
            (question_id,),
        ).fetchall()
        return [(self._row_to_node(r), r["score"]) for r in rows]

    def questions_for_node(
        self, node_id: str, include_descendants: bool = True
    ) -> list[tuple[Question, float]]:
        """教材節點 -> 關聯題目（預設連同子孫節點的題目一起回傳）。"""
        node_ids = [node_id]
        if include_descendants:
            frontier = [node_id]
            while frontier:
                placeholders = ",".join("?" * len(frontier))
                rows = self.conn.execute(
                    f"SELECT node_id FROM nodes WHERE parent_id IN ({placeholders})",
                    frontier,
                ).fetchall()
                frontier = [r["node_id"] for r in rows]
                node_ids.extend(frontier)
        placeholders = ",".join("?" * len(node_ids))
        rows = self.conn.execute(
            "SELECT q.*, MAX(l.score) AS score FROM links l"
            " JOIN questions q ON q.question_id = l.question_id"
            f" WHERE l.node_id IN ({placeholders})"
            " GROUP BY q.question_id ORDER BY score DESC",
            node_ids,
        ).fetchall()
        return [(self._row_to_question(r), r["score"]) for r in rows]

    def stats(self) -> dict[str, int]:
        def count(table: str) -> int:
            return self.conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]

        return {
            "documents": count("documents"),
            "nodes": count("nodes"),
            "questions": count("questions"),
            "links": count("links"),
        }
