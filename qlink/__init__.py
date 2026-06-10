"""qlink — 將 PageIndex 文件樹節點與考題題庫做多對多關聯的引擎。

流程：
1. PDF 經 PageIndex 解析成樹狀 JSON（node tree）。
2. 以 `pageindex_adapter` 載入樹節點。
3. `linker` 以混合計分演算法（BM25 + 字元 bigram TF-IDF cosine + 可選 embedding）
   將每一題與最相關的節點建立連結（多對多）。
4. `store` 以 SQLite 保存節點、題目與關聯，供雙向查詢：
   題目 -> 教材節點、教材節點 -> 題目。
"""

from .models import TreeNode, Question, Link
from .linker import LinkerConfig, link_questions_to_nodes

__all__ = [
    "TreeNode",
    "Question",
    "Link",
    "LinkerConfig",
    "link_questions_to_nodes",
]

__version__ = "0.1.0"
