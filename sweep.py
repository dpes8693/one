"""Parameter sweep for LinkerConfig to optimize macro_f1 and neg_accuracy.

Phase 1: Coarse sweep over the full required grid, using precomputed raw scores
         to avoid rebuilding BM25/TF-IDF for each config.
Phase 2: Fine-tune around the best area found in Phase 1.

Usage:
    PYTHONPATH=. python3 sweep.py
"""

from __future__ import annotations

import itertools
import math
import random
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from qlink.benchmark import (
    EXAMPLES,
    load_multi_doc_tree,
    load_questions_with_expected,
)
from qlink.linker import LinkerConfig, NodeIndex, flatten_tree
from qlink.models import Question, TreeNode
from qlink.scoring import BM25, TfidfIndex
from qlink.textutil import tokenize

random.seed(42)

# ---------------------------------------------------------------------------
# Precompute raw scores (independent of LinkerConfig params)
# ---------------------------------------------------------------------------

@dataclass
class RawScores:
    """Raw per-question-per-node scores before any config-dependent combination."""
    questions: list[Question]
    expected_map: dict[str, list[str]]
    nodes: list[TreeNode]
    # bm25_raw[q_idx][n_idx] = raw BM25 score (before coverage_scale / normalization)
    bm25_raw: list[list[float]]
    # bm25_denom[q_idx] = max_possible BM25 for that query
    bm25_denom: list[float]
    # cos_scores[q_idx][n_idx] = TF-IDF cosine score
    cos_scores: list[list[float]]
    # has_tag[q_idx][n_idx] = True if question tags hit node title_path
    has_tag: list[list[bool]]
    # is_leaf[n_idx] = True if node has no children
    is_leaf: list[bool]
    # parent map: node_id -> parent node_id (or None for roots)
    parent_map: dict[str, str | None]
    # children map: node_id -> list of child node_ids
    children_map: dict[str, list[str]]


def precompute(nodes: list[TreeNode], questions_with_expected: list[tuple]) -> RawScores:
    """Build BM25 + TF-IDF index once and compute all raw scores."""
    questions = [q for q, _ in questions_with_expected]
    expected_map = {q.question_id: exp for q, exp in questions_with_expected}

    docs = [tokenize(n.search_text()) for n in nodes]
    bm25 = BM25(docs, k1=1.5, b=0.75)
    tfidf = TfidfIndex(docs)

    bm25_raw = []
    bm25_denom = []
    cos_scores = []
    has_tag = []

    for q in questions:
        query = tokenize(q.search_text())
        denom = bm25.max_possible(query)
        bm25_denom.append(denom)
        bm25_raw.append(bm25.scores(query))
        cos_scores.append(tfidf.similarities(query))
        tags = [t for t in q.tags if t.strip()]
        has_tag.append([
            bool(tags and any(t in n.title_path for t in tags))
            for n in nodes
        ])

    is_leaf = [not n.children for n in nodes]

    # Build parent map
    parent_map: dict[str, str | None] = {n.node_id: None for n in nodes}
    children_map: dict[str, list[str]] = {n.node_id: [] for n in nodes}
    for n in nodes:
        for child in n.children:
            if child.node_id in parent_map:
                parent_map[child.node_id] = n.node_id
                children_map[n.node_id].append(child.node_id)

    return RawScores(
        questions=questions,
        expected_map=expected_map,
        nodes=nodes,
        bm25_raw=bm25_raw,
        bm25_denom=bm25_denom,
        cos_scores=cos_scores,
        has_tag=has_tag,
        is_leaf=is_leaf,
        parent_map=parent_map,
        children_map=children_map,
    )


# ---------------------------------------------------------------------------
# Fast evaluation using precomputed scores
# ---------------------------------------------------------------------------

def evaluate_fast(raw: RawScores, params: dict) -> dict[str, Any]:
    """Evaluate a config dict using precomputed raw scores."""
    min_score      = params["min_score"]
    relative_ratio = params["relative_ratio"]
    coverage_scale = params["coverage_scale"]
    tag_bonus      = params["tag_bonus"]
    parent_decay   = params["parent_decay"]
    leaf_boost     = params["leaf_boost"]
    w_bm25         = params["w_bm25"]
    w_cosine       = params["w_cosine"]
    top_k          = params.get("top_k", 5)

    total_w = w_bm25 + w_cosine
    wb = w_bm25 / total_w
    wc = w_cosine / total_w

    n_nodes = len(raw.nodes)
    node_ids = [n.node_id for n in raw.nodes]

    per_question = []
    total_tp = total_fp = total_fn = 0
    top1_hits = top1_total = 0
    neg_correct = neg_total = 0

    for qi, q in enumerate(raw.questions):
        denom = raw.bm25_denom[qi]
        bm25_n = raw.bm25_raw[qi]
        cos_n  = raw.cos_scores[qi]
        tag_n  = raw.has_tag[qi]

        # Compute own scores
        own = [0.0] * n_nodes
        for ni in range(n_nodes):
            b = min(1.0, bm25_n[ni] / denom * coverage_scale) if denom > 0 else 0.0
            c = cos_n[ni]
            s = wb * b + wc * c
            if tag_n[ni]:
                s += tag_bonus
            if raw.is_leaf[ni]:
                s *= leaf_boost
            own[ni] = s

        # Propagate upward (parent = max(own, best_child * decay))
        final = list(own)
        best_child_idx = [-1] * n_nodes  # index of child that drove propagation

        # Process in reverse-depth order (children before parents).
        # Simple approach: iterate until stable (since tree depth is small).
        # Build node_id -> index map
        id_to_idx = {nid: i for i, nid in enumerate(node_ids)}

        # Topological sort (leaves first)
        visited = [False] * n_nodes
        topo = []

        def visit(i: int):
            if visited[i]:
                return
            visited[i] = True
            for cid in raw.children_map[node_ids[i]]:
                ci = id_to_idx.get(cid)
                if ci is not None:
                    visit(ci)
            topo.append(i)

        for i in range(n_nodes):
            visit(i)

        # Process leaves -> roots
        for i in topo:
            best = own[i]
            bc = -1
            for cid in raw.children_map[node_ids[i]]:
                ci = id_to_idx.get(cid)
                if ci is None:
                    continue
                prop = final[ci] * parent_decay
                if prop > best:
                    best = prop
                    bc = ci
            final[i] = best
            best_child_idx[i] = bc

        # Select links
        ranked = sorted(range(n_nodes), key=lambda i: final[i], reverse=True)
        exp_set = set(raw.expected_map.get(q.question_id, []))

        pred_set: set[str] = set()
        covered: set[int] = set()

        if final[ranked[0]] >= min_score:
            best_score = final[ranked[0]]
            floor = max(min_score, best_score * relative_ratio)
            for ni in ranked:
                if len(pred_set) >= top_k:
                    break
                if final[ni] < floor:
                    break
                bc = best_child_idx[ni]
                if bc != -1 and bc in covered:
                    covered.add(ni)
                    continue
                covered.add(ni)
                pred_set.add(node_ids[ni])

        # Metrics
        tp = len(exp_set & pred_set)
        fp = len(pred_set - exp_set)
        fn = len(exp_set - pred_set)

        if not exp_set:
            neg_total += 1
            correct = len(pred_set) == 0
            precision = 1.0 if correct else 0.0
            recall = 1.0
            f1 = precision
            if not correct:
                total_fp += len(pred_set)
            if correct:
                neg_correct += 1
        else:
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
            total_tp += tp
            total_fp += fp
            total_fn += fn
            top1_total += 1
            if pred_set:
                # Get the highest-scored prediction
                top1_node = max(pred_set, key=lambda nid: final[id_to_idx[nid]])
                if top1_node in exp_set:
                    top1_hits += 1

        per_question.append({
            "question_id": q.question_id,
            "expected": sorted(exp_set),
            "predicted": sorted(pred_set),
            "tp": tp, "fp": fp, "fn": fn,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        })

    macro_precision = sum(d["precision"] for d in per_question) / len(per_question)
    macro_recall    = sum(d["recall"]    for d in per_question) / len(per_question)
    macro_f1        = sum(d["f1"]        for d in per_question) / len(per_question)
    micro_precision = total_tp / (total_tp + total_fp) if (total_tp + total_fp) > 0 else 0.0
    micro_recall    = total_tp / (total_tp + total_fn) if (total_tp + total_fn) > 0 else 0.0
    micro_f1        = (
        2 * micro_precision * micro_recall / (micro_precision + micro_recall)
        if (micro_precision + micro_recall) > 0 else 0.0
    )
    neg_accuracy = neg_correct / neg_total if neg_total > 0 else 1.0
    top1_accuracy = top1_hits / top1_total if top1_total > 0 else 0.0

    return {
        "macro_precision": round(macro_precision, 4),
        "macro_recall":    round(macro_recall, 4),
        "macro_f1":        round(macro_f1, 4),
        "micro_precision": round(micro_precision, 4),
        "micro_recall":    round(micro_recall, 4),
        "micro_f1":        round(micro_f1, 4),
        "top1_accuracy":   round(top1_accuracy, 4),
        "neg_accuracy":    round(neg_accuracy, 4),
        "total_links":     sum(len(d["predicted"]) for d in per_question),
        "total_tp":        total_tp,
        "total_fp":        total_fp,
        "total_fn":        total_fn,
        "per_question":    per_question,
    }


def score_result(result: dict[str, Any]) -> tuple[float, float]:
    return (result["macro_f1"], result["neg_accuracy"])


# ---------------------------------------------------------------------------
# Grid definitions
# ---------------------------------------------------------------------------

WEIGHT_PAIRS = [(0.4, 0.6), (0.5, 0.5), (0.55, 0.45), (0.6, 0.4), (0.7, 0.3)]

COARSE_RANGES = {
    "min_score":      [0.25, 0.30, 0.35, 0.40, 0.45, 0.50],
    "relative_ratio": [0.30, 0.35, 0.40, 0.45, 0.50],
    "coverage_scale": [2.0, 2.5, 3.0, 3.5, 4.0],
    "parent_decay":   [0.5, 0.6, 0.7, 0.8],
    "leaf_boost":     [1.0, 1.05, 1.1, 1.15],
    "tag_bonus":      [0.05, 0.08, 0.1, 0.15, 0.2],
}


def build_configs(ranges: dict, weight_pairs: list) -> list[dict]:
    keys   = list(ranges.keys())
    values = list(ranges.values())
    configs = []
    for wp in weight_pairs:
        for combo in itertools.product(*values):
            params = dict(zip(keys, combo))
            params["w_bm25"]   = wp[0]
            params["w_cosine"] = wp[1]
            configs.append(params)
    return configs


def neighbors(val: float, step: float, lo: float, hi: float, n: int = 2) -> list[float]:
    vals = sorted(set(round(val + step * k, 6) for k in range(-n, n + 1)))
    return [v for v in vals if lo <= v <= hi]


def fine_grid(best: dict) -> list[dict]:
    ranges = {
        "min_score":      neighbors(best["min_score"],      0.025, 0.10, 0.60),
        "relative_ratio": neighbors(best["relative_ratio"], 0.025, 0.20, 0.65),
        "coverage_scale": neighbors(best["coverage_scale"], 0.25,  1.0,  6.0),
        "parent_decay":   neighbors(best["parent_decay"],   0.05,  0.3,  1.0),
        "leaf_boost":     neighbors(best["leaf_boost"],     0.025, 0.9,  1.3),
        "tag_bonus":      neighbors(best["tag_bonus"],      0.02,  0.0,  0.3),
    }
    bm25 = best["w_bm25"]
    wps = sorted(set(
        (round(bm25 + d, 2), round(1.0 - (bm25 + d), 2))
        for d in [-0.05, 0.0, 0.05]
        if 0.1 <= round(bm25 + d, 2) <= 0.9
    ))
    return build_configs(ranges, wps)


# ---------------------------------------------------------------------------
# Sweep runner
# ---------------------------------------------------------------------------

def run_sweep(raw: RawScores, configs: list[dict], label: str) -> list[tuple]:
    total = len(configs)
    print(f"\n{label}: {total} combinations")
    results = []
    t0 = time.time()
    for i, params in enumerate(configs):
        result = evaluate_fast(raw, params)
        s = score_result(result)
        results.append((s, params, result))
        if (i + 1) % 2000 == 0 or (i + 1) == total:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed if elapsed > 0 else 1
            eta = (total - i - 1) / rate
            best = max(r[0][0] for r in results)
            print(f"  {i+1}/{total}  best_macro_f1={best:.4f}  "
                  f"elapsed={elapsed:.1f}s  eta={eta:.1f}s")
    results.sort(key=lambda x: x[0], reverse=True)
    return results


def print_top(results: list, n: int = 10):
    print(f"\nTop {n} configs:")
    print(f"{'Rank':<5} {'macro_f1':>9} {'neg_acc':>8} {'micro_f1':>9} "
          f"{'top1':>6} {'TP':>4} {'FP':>4} {'FN':>4}  params")
    print("-" * 120)
    for rank, (score, params, res) in enumerate(results[:n], 1):
        ps = "  ".join(f"{k}={v}" for k, v in sorted(params.items()))
        print(f"  {rank:<4} {res['macro_f1']:>9.4f} {res['neg_accuracy']:>8.4f} "
              f"{res['micro_f1']:>9.4f} {res['top1_accuracy']:>6.4f} "
              f"{res['total_tp']:>4} {res['total_fp']:>4} {res['total_fn']:>4}  {ps}")


# ---------------------------------------------------------------------------
# Patch linker.py
# ---------------------------------------------------------------------------

def update_linker_defaults(best_params: dict) -> None:
    linker_path = Path(__file__).resolve().parent / "qlink" / "linker.py"
    text = linker_path.read_text("utf-8")
    for param, value in best_params.items():
        if param in ("top_k",):
            continue  # int param, keep default
        pattern = rf"(\s+{re.escape(param)}: float = )[^\n]+"
        new_text = re.sub(pattern, rf"\g<1>{value}", text)
        if new_text == text:
            print(f"  WARNING: could not patch {param}")
        else:
            text = new_text
    linker_path.write_text(text, "utf-8")
    print(f"\nUpdated qlink/linker.py with best params.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("Loading data...")
    nodes = load_multi_doc_tree(EXAMPLES / "large_tree.json")
    qe    = load_questions_with_expected(EXAMPLES / "large_questions.json")
    print(f"Loaded {len(nodes)} nodes, {len(qe)} questions")

    print("Precomputing raw scores (BM25 + TF-IDF)...")
    t0 = time.time()
    raw = precompute(nodes, qe)
    print(f"  Done in {time.time()-t0:.1f}s")

    # Sanity-check: evaluate the baseline config and compare to known benchmark
    baseline_params = {
        "min_score": 0.45, "relative_ratio": 0.45, "coverage_scale": 3.0,
        "parent_decay": 0.8, "leaf_boost": 1.05, "tag_bonus": 0.08,
        "w_bm25": 0.55, "w_cosine": 0.45,
    }
    bl = evaluate_fast(raw, baseline_params)
    print(f"\nBaseline (fast eval): macro_f1={bl['macro_f1']:.4f}  "
          f"neg_acc={bl['neg_accuracy']:.4f}  "
          f"TP={bl['total_tp']} FP={bl['total_fp']} FN={bl['total_fn']}")

    # Phase 1: full coarse grid
    coarse_configs = build_configs(COARSE_RANGES, WEIGHT_PAIRS)
    coarse_results = run_sweep(raw, coarse_configs, "Phase 1 (Coarse)")
    print_top(coarse_results)
    best_coarse = coarse_results[0][1]
    print(f"\nBest coarse: {best_coarse}")

    # Phase 2: fine grid around best coarse
    fine_configs = fine_grid(best_coarse)
    print(f"Fine grid size: {len(fine_configs)}")
    fine_results = run_sweep(raw, fine_configs, "Phase 2 (Fine)")
    print_top(fine_results)

    # Overall best
    overall = max([coarse_results[0], fine_results[0]], key=lambda x: x[0])
    _, best_params, best_res = overall

    print(f"\n{'='*60}")
    print("BEST CONFIG:")
    print(f"  macro_f1={best_res['macro_f1']:.4f}  neg_accuracy={best_res['neg_accuracy']:.4f}")
    print(f"  micro_f1={best_res['micro_f1']:.4f}  top1={best_res['top1_accuracy']:.4f}")
    print(f"  TP={best_res['total_tp']} FP={best_res['total_fp']} FN={best_res['total_fn']}")
    print(f"  Params: {best_params}")
    print(f"{'='*60}")

    update_linker_defaults(best_params)
    print("Done. Verify with: PYTHONPATH=. python3 -m qlink.benchmark -v")


if __name__ == "__main__":
    main()
