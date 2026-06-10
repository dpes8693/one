"""精準度評估框架：衡量關聯演算法的 precision、recall、F1。

用法::

    python -m qlink.benchmark [--db :memory:] [--verbose]
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from qlink.linker import LinkerConfig, flatten_tree, link_questions_to_nodes
from qlink.models import Question, TreeNode
from qlink.pageindex_adapter import load_tree


EXAMPLES = Path(__file__).resolve().parent.parent / "examples"

# 三科教材的 doc_id 對應到 tree JSON 中的頂層結構索引
_DOC_MAP = {
    "nursing_pharm": 0,   # 護理藥理學
    "clinical_ms": 1,     # 內外科護理學
    "fundamental_ns": 2,  # 基本護理學
}


def load_multi_doc_tree(path: Path) -> list[TreeNode]:
    """將包含多科的 tree JSON 分別以各自 doc_id 載入並攤平。"""
    data = json.loads(path.read_text("utf-8"))
    all_nodes: list[TreeNode] = []
    structure = data["structure"]
    for doc_id, idx in _DOC_MAP.items():
        if idx < len(structure):
            roots = load_tree([structure[idx]], doc_id)
            all_nodes.extend(flatten_tree(roots))
    return all_nodes


def load_questions_with_expected(path: Path) -> list[tuple[Question, list[str]]]:
    """載入題目及其 _expected_nodes（ground truth）。"""
    data = json.loads(path.read_text("utf-8"))
    result = []
    for raw in data:
        options = raw.get("options", {})
        if isinstance(options, list):
            options = {chr(ord("A") + i): v for i, v in enumerate(options)}
        q = Question(
            question_id=str(raw["question_id"]),
            stem=str(raw.get("stem", "")),
            options={str(k): str(v) for k, v in options.items()},
            answer=str(raw.get("answer", "")),
            explanation=str(raw.get("explanation", "")),
            tags=[str(t) for t in raw.get("tags", [])],
        )
        expected = raw.get("_expected_nodes", [])
        result.append((q, expected))
    return result


def evaluate(
    nodes: list[TreeNode],
    questions_with_expected: list[tuple[Question, list[str]]],
    config: LinkerConfig | None = None,
    verbose: bool = False,
) -> dict[str, Any]:
    """跑一次完整評估，回傳各種精準度指標。"""
    cfg = config or LinkerConfig()
    questions = [q for q, _ in questions_with_expected]
    expected_map = {q.question_id: exp for q, exp in questions_with_expected}

    links = link_questions_to_nodes(nodes, questions, cfg)

    # 按題目分組
    predicted_map: dict[str, set[str]] = {}
    for link in links:
        predicted_map.setdefault(link.question_id, set()).add(link.node_id)

    # 計算每題的 precision / recall
    per_question: list[dict[str, Any]] = []
    total_tp = 0
    total_fp = 0
    total_fn = 0

    for q, expected in questions_with_expected:
        exp_set = set(expected)
        pred_set = predicted_map.get(q.question_id, set())

        tp = len(exp_set & pred_set)
        fp = len(pred_set - exp_set)
        fn = len(exp_set - pred_set)

        precision = tp / (tp + fp) if (tp + fp) > 0 else (1.0 if not exp_set else 0.0)
        recall = tp / (tp + fn) if (tp + fn) > 0 else (1.0 if not exp_set else 0.0)
        f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

        # 負面題（expected 為空）的特殊處理
        if not exp_set:
            # 正確 = 沒有任何預測
            correct = len(pred_set) == 0
            precision = 1.0 if correct else 0.0
            recall = 1.0  # vacuously true
            f1 = precision
            if not correct:
                total_fp += len(pred_set)
        else:
            total_tp += tp
            total_fp += fp
            total_fn += fn

        detail = {
            "question_id": q.question_id,
            "expected": sorted(exp_set),
            "predicted": sorted(pred_set),
            "tp": tp, "fp": fp, "fn": fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        }
        per_question.append(detail)

        if verbose and (fp > 0 or fn > 0):
            status = "MISS" if fn > 0 else "FP"
            print(f"  [{status}] {q.question_id}: exp={sorted(exp_set)} pred={sorted(pred_set)}")

    macro_precision = sum(d["precision"] for d in per_question) / len(per_question)
    macro_recall = sum(d["recall"] for d in per_question) / len(per_question)
    macro_f1 = sum(d["f1"] for d in per_question) / len(per_question)

    micro_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
    micro_recall = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
    micro_f1 = (
        2 * micro_precision * micro_recall / (micro_precision + micro_recall)
        if (micro_precision + micro_recall) > 0 else 0.0
    )

    # 負面題正確率
    neg_questions = [d for d in per_question if not d["expected"]]
    neg_correct = sum(1 for d in neg_questions if not d["predicted"])
    neg_accuracy = neg_correct / len(neg_questions) if neg_questions else 1.0

    # Top-1 命中率：預測的最高分節點是否在 expected 中
    top1_hits = 0
    top1_total = 0
    for q, expected in questions_with_expected:
        if not expected:
            continue
        top1_total += 1
        q_links = sorted(
            [l for l in links if l.question_id == q.question_id],
            key=lambda l: l.score,
            reverse=True,
        )
        if q_links and q_links[0].node_id in set(expected):
            top1_hits += 1
    top1_accuracy = top1_hits / top1_total if top1_total > 0 else 0.0

    return {
        "macro_precision": round(macro_precision, 4),
        "macro_recall": round(macro_recall, 4),
        "macro_f1": round(macro_f1, 4),
        "micro_precision": round(micro_precision, 4),
        "micro_recall": round(micro_recall, 4),
        "micro_f1": round(micro_f1, 4),
        "top1_accuracy": round(top1_accuracy, 4),
        "neg_accuracy": round(neg_accuracy, 4),
        "total_links": len(links),
        "total_tp": total_tp,
        "total_fp": total_fp,
        "total_fn": total_fn,
        "per_question": per_question,
    }


def print_summary(result: dict[str, Any]) -> None:
    print("=" * 60)
    print(f"  Macro P={result['macro_precision']:.3f}  R={result['macro_recall']:.3f}  F1={result['macro_f1']:.3f}")
    print(f"  Micro P={result['micro_precision']:.3f}  R={result['micro_recall']:.3f}  F1={result['micro_f1']:.3f}")
    print(f"  Top-1 accuracy: {result['top1_accuracy']:.3f}")
    print(f"  Negative accuracy: {result['neg_accuracy']:.3f}")
    print(f"  Links: {result['total_links']}  TP={result['total_tp']} FP={result['total_fp']} FN={result['total_fn']}")
    print("=" * 60)


if __name__ == "__main__":
    verbose = "--verbose" in sys.argv or "-v" in sys.argv
    nodes = load_multi_doc_tree(EXAMPLES / "large_tree.json")
    qe = load_questions_with_expected(EXAMPLES / "large_questions.json")
    print(f"Loaded {len(nodes)} nodes, {len(qe)} questions")
    result = evaluate(nodes, qe, verbose=verbose)
    print_summary(result)
