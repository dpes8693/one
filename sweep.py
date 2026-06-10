"""Parameter sweep for LinkerConfig to optimize macro_f1 and neg_accuracy.

Phase 1: Coarse sweep over all parameter combinations.
Phase 2: Fine-tune around the best area found in Phase 1.

Usage:
    PYTHONPATH=. python3 sweep.py
"""

from __future__ import annotations

import itertools
import time
from pathlib import Path
from typing import Any

from qlink.benchmark import evaluate, load_multi_doc_tree, load_questions_with_expected
from qlink.linker import LinkerConfig

EXAMPLES = Path(__file__).resolve().parent / "examples"


def make_config(**kwargs) -> LinkerConfig:
    cfg = LinkerConfig()
    for k, v in kwargs.items():
        setattr(cfg, k, v)
    return cfg


def score_config(result: dict[str, Any]) -> tuple[float, float]:
    """Primary: macro_f1, secondary: neg_accuracy."""
    return (result["macro_f1"], result["neg_accuracy"])


def run_sweep(nodes, qe, param_grid: dict, label: str = "Sweep") -> list[dict]:
    """Run all combinations, return sorted list of (score_tuple, config_dict, result_dict)."""
    keys = list(param_grid.keys())
    values = list(param_grid.values())
    combos = list(itertools.product(*values))
    total = len(combos)
    print(f"\n{label}: {total} combinations")

    results = []
    t0 = time.time()
    for i, combo in enumerate(combos):
        params = dict(zip(keys, combo))
        cfg = make_config(**params)
        result = evaluate(nodes, qe, config=cfg)
        s = score_config(result)
        results.append((s, params, result))
        if (i + 1) % 200 == 0 or (i + 1) == total:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            remaining = (total - i - 1) / rate if rate > 0 else 0
            print(f"  {i+1}/{total}  best_so_far macro_f1={max(r[0][0] for r in results):.4f}  "
                  f"elapsed={elapsed:.0f}s  eta={remaining:.0f}s")

    results.sort(key=lambda x: x[0], reverse=True)
    return results


def print_top(results: list, n: int = 10):
    print(f"\nTop {n} configs:")
    print(f"{'Rank':<5} {'macro_f1':>9} {'neg_acc':>8} {'micro_f1':>9} "
          f"{'TP':>5} {'FP':>5} {'FN':>5}  params")
    print("-" * 120)
    for rank, (score, params, res) in enumerate(results[:n], 1):
        param_str = "  ".join(f"{k}={v}" for k, v in params.items())
        print(f"  {rank:<4} {res['macro_f1']:>9.4f} {res['neg_accuracy']:>8.4f} "
              f"{res['micro_f1']:>9.4f} "
              f"{res['total_tp']:>5} {res['total_fp']:>5} {res['total_fn']:>5}  {param_str}")


# ---------------------------------------------------------------------------
# Phase 1: Coarse sweep
# ---------------------------------------------------------------------------
WEIGHT_PAIRS = [(0.4, 0.6), (0.5, 0.5), (0.55, 0.45), (0.6, 0.4), (0.7, 0.3)]

COARSE_GRID = {
    "min_score": [0.25, 0.30, 0.35, 0.40, 0.45, 0.50],
    "relative_ratio": [0.30, 0.35, 0.40, 0.45, 0.50],
    "coverage_scale": [2.0, 2.5, 3.0, 3.5, 4.0],
    "parent_decay": [0.5, 0.6, 0.7, 0.8],
    "leaf_boost": [1.0, 1.05, 1.1, 1.15],
    "tag_bonus": [0.05, 0.08, 0.1, 0.15, 0.2],
}


def expand_weights(grid_with_weights: dict, weight_pairs: list) -> list[dict]:
    """Expand weight pairs into per-config dicts alongside other grid params."""
    base_keys = list(grid_with_weights.keys())
    base_values = list(grid_with_weights.values())
    base_combos = list(itertools.product(*base_values))
    all_configs = []
    for wp in weight_pairs:
        for combo in base_combos:
            params = dict(zip(base_keys, combo))
            params["w_bm25"] = wp[0]
            params["w_cosine"] = wp[1]
            all_configs.append(params)
    return all_configs


def run_sweep_explicit(nodes, qe, configs: list[dict], label: str = "Sweep") -> list[dict]:
    """Run explicit list of param dicts."""
    total = len(configs)
    print(f"\n{label}: {total} combinations")
    results = []
    t0 = time.time()
    for i, params in enumerate(configs):
        cfg = make_config(**params)
        result = evaluate(nodes, qe, config=cfg)
        s = score_config(result)
        results.append((s, params, result))
        if (i + 1) % 500 == 0 or (i + 1) == total:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            remaining = (total - i - 1) / rate if rate > 0 else 0
            print(f"  {i+1}/{total}  best_so_far macro_f1={max(r[0][0] for r in results):.4f}  "
                  f"elapsed={elapsed:.0f}s  eta={remaining:.0f}s")
    results.sort(key=lambda x: x[0], reverse=True)
    return results


# ---------------------------------------------------------------------------
# Phase 2: Fine-tune around best params
# ---------------------------------------------------------------------------
def fine_tune_grid(best_params: dict) -> list[dict]:
    """Build a fine grid centered on the best coarse params."""
    def neighbors(val, step, lo, hi, n=3):
        """n values around val with given step, clamped to [lo, hi]."""
        vals = sorted(set(round(val + step * k, 6) for k in range(-n, n + 1)))
        return [v for v in vals if lo <= v <= hi]

    min_score_vals = neighbors(best_params["min_score"], 0.025, 0.10, 0.60)
    rel_ratio_vals = neighbors(best_params["relative_ratio"], 0.025, 0.20, 0.65)
    cov_scale_vals = neighbors(best_params["coverage_scale"], 0.25, 1.0, 6.0)
    parent_decay_vals = neighbors(best_params["parent_decay"], 0.05, 0.3, 1.0)
    leaf_boost_vals = neighbors(best_params["leaf_boost"], 0.025, 0.9, 1.3)
    tag_bonus_vals = neighbors(best_params["tag_bonus"], 0.02, 0.0, 0.3)

    # Weight pairs: keep best + immediate neighbors
    best_bm25 = best_params["w_bm25"]
    weight_pairs = sorted(set(
        [(round(best_bm25 + d, 2), round(1.0 - best_bm25 - d, 2))
         for d in [-0.05, 0.0, 0.05]
         if 0.1 <= best_bm25 + d <= 0.9]
    ))

    fine_grid = {
        "min_score": min_score_vals,
        "relative_ratio": rel_ratio_vals,
        "coverage_scale": cov_scale_vals,
        "parent_decay": parent_decay_vals,
        "leaf_boost": leaf_boost_vals,
        "tag_bonus": tag_bonus_vals,
    }
    return expand_weights(fine_grid, weight_pairs)


def update_linker_defaults(best_params: dict) -> None:
    """Patch LinkerConfig defaults in linker.py with best found params."""
    linker_path = Path(__file__).resolve().parent / "qlink" / "linker.py"
    text = linker_path.read_text("utf-8")

    replacements = {
        "w_bm25": best_params.get("w_bm25"),
        "w_cosine": best_params.get("w_cosine"),
        "coverage_scale": best_params.get("coverage_scale"),
        "tag_bonus": best_params.get("tag_bonus"),
        "min_score": best_params.get("min_score"),
        "relative_ratio": best_params.get("relative_ratio"),
        "parent_decay": best_params.get("parent_decay"),
        "leaf_boost": best_params.get("leaf_boost"),
    }

    import re
    for param, value in replacements.items():
        if value is None:
            continue
        # Match lines like:    w_bm25: float = 0.55
        pattern = rf"(\s+{param}: float = )[^\n]+"
        replacement = rf"\g<1>{value}"
        new_text = re.sub(pattern, replacement, text)
        if new_text == text:
            print(f"  WARNING: could not patch {param} in linker.py")
        else:
            text = new_text

    linker_path.write_text(text, "utf-8")
    print(f"\nUpdated {linker_path} with best params.")


def main():
    print("Loading data...")
    nodes = load_multi_doc_tree(EXAMPLES / "large_tree.json")
    qe = load_questions_with_expected(EXAMPLES / "large_questions.json")
    print(f"Loaded {len(nodes)} nodes, {len(qe)} questions")

    # --- Phase 1: Coarse sweep ---
    coarse_configs = expand_weights(COARSE_GRID, WEIGHT_PAIRS)
    coarse_results = run_sweep_explicit(nodes, qe, coarse_configs, label="Phase 1 (Coarse)")
    print_top(coarse_results, n=10)

    best_coarse_params = coarse_results[0][1]
    print(f"\nBest coarse params: {best_coarse_params}")

    # --- Phase 2: Fine-tune ---
    fine_configs = fine_tune_grid(best_coarse_params)
    fine_results = run_sweep_explicit(nodes, qe, fine_configs, label="Phase 2 (Fine)")
    print_top(fine_results, n=10)

    # Pick overall best (compare coarse top-1 vs fine top-1)
    overall_best = max(
        [coarse_results[0], fine_results[0]],
        key=lambda x: x[0]
    )
    best_score, best_params, best_result = overall_best

    print(f"\n{'='*60}")
    print(f"BEST CONFIG:")
    print(f"  macro_f1={best_result['macro_f1']:.4f}  neg_accuracy={best_result['neg_accuracy']:.4f}")
    print(f"  micro_f1={best_result['micro_f1']:.4f}")
    print(f"  TP={best_result['total_tp']} FP={best_result['total_fp']} FN={best_result['total_fn']}")
    print(f"  Params: {best_params}")
    print(f"{'='*60}")

    # Update linker.py defaults
    update_linker_defaults(best_params)
    print("Done. Run: PYTHONPATH=. python3 -m qlink.benchmark -v")


if __name__ == "__main__":
    main()
