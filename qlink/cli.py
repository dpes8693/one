"""命令列介面。

用法範例::

    # 1. 導入題庫
    python -m qlink.cli ingest-questions examples/sample_questions.json

    # 2. 新 PDF 經 PageIndex 產生的樹進系統（自動與全部題目建立關聯）
    python -m qlink.cli ingest-tree examples/sample_tree.json

    # 3. 查詢：題目 -> 教材節點
    python -m qlink.cli question q0001

    # 4. 查詢：教材節點 -> 題目
    python -m qlink.cli node pharm101:0002

    # 5. 統計 / 全量重算
    python -m qlink.cli stats
    python -m qlink.cli relink
"""

from __future__ import annotations

import argparse

from .linker import LinkerConfig
from .pipeline import ingest_questions, ingest_tree, relink_all
from .store import Store


def _config_from_args(args: argparse.Namespace) -> LinkerConfig:
    cfg = LinkerConfig()
    if args.top_k is not None:
        cfg.top_k = args.top_k
    if args.min_score is not None:
        cfg.min_score = args.min_score
    return cfg


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="qlink", description="PageIndex 樹節點 × 題庫關聯工具")
    parser.add_argument("--db", default="qlink.db", help="SQLite 資料庫路徑（預設 qlink.db）")
    parser.add_argument("--top-k", type=int, default=None, help="每題最多關聯節點數")
    parser.add_argument("--min-score", type=float, default=None, help="關聯分數門檻")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("ingest-tree", help="導入 PageIndex 樹 JSON，並與既有題庫建立關聯")
    p.add_argument("tree_json", help="PageIndex 輸出的 JSON 檔")
    p.add_argument("--doc-id", default=None, help="文件 ID（預設取 doc_name 或檔名）")

    p = sub.add_parser("ingest-questions", help="導入題目 JSON，並與既有節點建立關聯")
    p.add_argument("questions_json", help="題目 JSON 檔（list of objects）")

    p = sub.add_parser("question", help="查詢某題關聯到的教材節點")
    p.add_argument("question_id")

    p = sub.add_parser("node", help="查詢某教材節點（含子孫）關聯到的題目")
    p.add_argument("node_id")
    p.add_argument("--no-descendants", action="store_true", help="不包含子孫節點的題目")

    sub.add_parser("relink", help="全量重算所有關聯")
    sub.add_parser("stats", help="顯示資料量統計")

    args = parser.parse_args(argv)
    cfg = _config_from_args(args)

    with Store(args.db) as store:
        if args.command == "ingest-tree":
            doc_id, n_nodes, links = ingest_tree(
                store, args.tree_json, doc_id=args.doc_id, config=cfg
            )
            print(f"已導入文件 {doc_id}：{n_nodes} 個節點，建立 {len(links)} 條關聯")

        elif args.command == "ingest-questions":
            n, links = ingest_questions(store, args.questions_json, config=cfg)
            print(f"已導入 {n} 題，建立 {len(links)} 條關聯")

        elif args.command == "question":
            q = store.get_question(args.question_id)
            if q is None:
                print(f"找不到題目 {args.question_id}")
                return 1
            print(f"[{q.question_id}] {q.stem}")
            results = store.nodes_for_question(args.question_id)
            if not results:
                print("（沒有關聯的教材節點）")
            for node, score in results:
                pages = (
                    f" p.{node.page_start}-{node.page_end}"
                    if node.page_start is not None
                    else ""
                )
                print(f"  {score:.3f}  {node.node_id}  {node.title_path}{pages}")

        elif args.command == "node":
            node = store.get_node(args.node_id)
            if node is None:
                print(f"找不到節點 {args.node_id}")
                return 1
            print(f"[{node.node_id}] {node.title_path}")
            results = store.questions_for_node(
                args.node_id, include_descendants=not args.no_descendants
            )
            if not results:
                print("（沒有關聯的題目）")
            for q, score in results:
                print(f"  {score:.3f}  {q.question_id}  {q.stem[:60]}")

        elif args.command == "relink":
            links = relink_all(store, config=cfg)
            print(f"已重算，共 {len(links)} 條關聯")

        elif args.command == "stats":
            for key, value in store.stats().items():
                print(f"{key}: {value}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
