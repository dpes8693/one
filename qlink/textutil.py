"""中英混合文本的斷詞工具。

中文（CJK）不依賴外部斷詞器：取「字元 unigram + bigram」，
這對教材標題、醫護 / 法律等國考專有名詞的比對效果穩定且零依賴。
英文與數字則以一般單字切分並轉小寫。
"""

from __future__ import annotations

import re

_ASCII_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-+./]*")
_CJK = re.compile(r"[㐀-䶿一-鿿豈-﫿]")

# 高頻但無鑑別度的中文字／詞，避免它們撐高分數。
_CJK_STOP_CHARS = set("的了在是有與及和或之於為以下列何者哪那請問關於對應其此等使用")


def _cjk_runs(text: str) -> list[str]:
    """抓出連續的 CJK 片段。"""
    runs: list[str] = []
    buf: list[str] = []
    for ch in text:
        if _CJK.match(ch):
            buf.append(ch)
        elif buf:
            runs.append("".join(buf))
            buf = []
    if buf:
        runs.append("".join(buf))
    return runs


def tokenize(text: str) -> list[str]:
    """將文本切成 token 序列。

    - 英數字：整個單字（小寫化），例如 ``ACE``、``beta-blocker``。
    - 中文：每個連續片段內產生 unigram 與 bigram，
      例如「高血壓」 -> ``高``、``血``、``壓``、``高血``、``血壓``。
      （停用字的 unigram 會被略過，但仍參與 bigram。）
    """
    tokens: list[str] = []
    for word in _ASCII_WORD.findall(text):
        tokens.append(word.lower())
    for run in _cjk_runs(text):
        for ch in run:
            if ch not in _CJK_STOP_CHARS:
                tokens.append(ch)
        for i in range(len(run) - 1):
            tokens.append(run[i : i + 2])
    return tokens
