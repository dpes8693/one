"""載入 PageIndex 產出的樹狀 JSON，轉成 :class:`~qlink.models.TreeNode`。

PageIndex（https://github.com/VectifyAI/PageIndex）對一份 PDF 會輸出
類似下面的結構（欄位名稱在不同版本間略有差異，這裡都容忍）::

    {
      "doc_name": "xxx.pdf",
      "structure": [
        {
          "title": "第一章 ...",
          "node_id": "0001",
          "start_index": 1,
          "end_index": 10,
          "summary": "...",
          "nodes": [ ...子節點... ]
        }
      ]
    }

本模組同時支援：
- 根層是 dict（含 ``structure`` / ``tree`` / ``nodes`` 任一鍵）或直接是 list。
- 子節點鍵為 ``nodes`` 或 ``children``。
- 頁碼鍵為 ``start_index``/``end_index`` 或 ``page_start``/``page_end``
  或 ``physical_index``。
- 內文鍵為 ``text``、``content`` 或 ``prefix_summary``。
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .models import TreeNode

_CHILD_KEYS = ("nodes", "children", "sub_nodes")
_ROOT_KEYS = ("structure", "tree", "nodes", "children", "result")
_TEXT_KEYS = ("text", "content", "prefix_summary")


def _first(d: dict[str, Any], keys: tuple[str, ...], default: Any = None) -> Any:
    for key in keys:
        if key in d and d[key] is not None:
            return d[key]
    return default


def _to_int(value: Any) -> int | None:
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _parse_node(
    raw: dict[str, Any],
    doc_id: str,
    parent: TreeNode | None,
    counter: list[int],
) -> TreeNode:
    raw_id = raw.get("node_id") or raw.get("id")
    if raw_id is None:
        counter[0] += 1
        raw_id = f"auto{counter[0]:04d}"
    title = str(raw.get("title") or raw.get("section_title") or raw_id)

    node = TreeNode(
        node_id=f"{doc_id}:{raw_id}",
        title=title,
        doc_id=doc_id,
        summary=str(raw.get("summary") or ""),
        text=str(_first(raw, _TEXT_KEYS, "") or ""),
        page_start=_to_int(_first(raw, ("start_index", "page_start", "physical_index"))),
        page_end=_to_int(_first(raw, ("end_index", "page_end"))),
        parent_id=parent.node_id if parent else None,
        title_path=f"{parent.title_path} > {title}" if parent else title,
    )
    raw_children = _first(raw, _CHILD_KEYS, []) or []
    for raw_child in raw_children:
        node.children.append(_parse_node(raw_child, doc_id, node, counter))
    return node


def load_tree(data: dict[str, Any] | list[Any], doc_id: str) -> list[TreeNode]:
    """把 PageIndex 的 JSON 物件轉成 TreeNode 樹（可能有多個根）。"""
    if isinstance(data, dict):
        raw_roots = _first(data, _ROOT_KEYS)
        if raw_roots is None:
            # 整個 dict 本身就是單一節點
            raw_roots = [data]
    else:
        raw_roots = data
    counter = [0]
    return [_parse_node(raw, doc_id, None, counter) for raw in raw_roots]


def load_tree_file(path: str | Path, doc_id: str | None = None) -> list[TreeNode]:
    """從 PageIndex 輸出的 JSON 檔載入樹。

    ``doc_id`` 未指定時，依序取 JSON 內的 ``doc_name`` 或檔名（去副檔名）。
    """
    path = Path(path)
    data = json.loads(path.read_text(encoding="utf-8"))
    if doc_id is None:
        if isinstance(data, dict) and data.get("doc_name"):
            doc_id = str(data["doc_name"]).rsplit(".", 1)[0]
        else:
            doc_id = path.stem
    return load_tree(data, doc_id)
