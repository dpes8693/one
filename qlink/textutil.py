"""中英混合文本的斷詞工具。

中文（CJK）不依賴外部斷詞器：取「字元 unigram + bigram」，
這對教材標題、醫護 / 法律等國考專有名詞的比對效果穩定且零依賴。
英文與數字則以一般單字切分並轉小寫。

改進說明（v2）：
1. 擴充 _CJK_STOP_CHARS：加入護理、臨床領域高頻低鑑別度單字，
   使 BM25 能更精準聚焦於藥名、疾病名等專有名詞。bigram 仍正常產生。
2. 醫學縮寫／同義詞對照表 _SYNONYMS：將 NSAIDs 縮寫對映到中文名稱，
   tokenize 時自動注入對應 CJK tokens，提升英文縮寫與中文節點的匹配率。
"""

from __future__ import annotations

import re

_ASCII_WORD = re.compile(r"[A-Za-z0-9][A-Za-z0-9\-+./]*")
_CJK = re.compile(r"[㐀-䶿一-鿿豈-﫿]")

# 高頻但無鑑別度的中文字，避免它們撐高分數。
# 基礎停用字：語法詞、連接詞、疑問詞等。
# 護理／臨床領域停用字：在幾乎所有醫護文件中均出現，作為 unigram 無法區分節點。
# 注意：bigram 仍會正常產生（「護理」「病人」「症狀」等 bigram 仍有效）。
_CJK_STOP_CHARS = set(
    # 語法詞（原有）
    "的了在是有與及和或之於為以下列何者哪那請問關於對應其此等使用"
    # 護理與醫療高頻低鑑別度字（新增）
    "監測評估給護師診症狀副治醫"
)

# 英文藥名／縮寫 → 中文同義詞對照表。
# 當查詢或文件中出現這些英文詞時，自動注入對應中文的 CJK tokens。
# 只收錄「英文詞在問題中出現、中文詞在節點中出現」的高價值對映。
_SYNONYMS: dict[str, str] = {
    "nsaids": "非類固醇消炎",       # Non-steroidal anti-inflammatory drugs
    "nsaid": "非類固醇消炎",
}


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


def _cjk_tokens(text: str) -> list[str]:
    """從純 CJK 字串提取 unigram（過濾停用字）與 bigram。
    用於同義詞注入時的 CJK tokens 提取。
    """
    tokens: list[str] = []
    for ch in text:
        if _CJK.match(ch) and ch not in _CJK_STOP_CHARS:
            tokens.append(ch)
    for i in range(len(text) - 1):
        if _CJK.match(text[i]) and _CJK.match(text[i + 1]):
            tokens.append(text[i : i + 2])
    return tokens


def tokenize(text: str) -> list[str]:
    """將文本切成 token 序列。

    - 英數字：整個單字（小寫化），例如 ``ACE``、``beta-blocker``。
      若符合藥物縮寫對照表（_SYNONYMS），額外注入中文同義詞的 CJK tokens。
    - 中文：每個連續片段內產生 unigram 與 bigram，
      例如「高血壓」 -> ``高``、``血``、``壓``、``高血``、``血壓``。
      （停用字的 unigram 會被略過，但仍參與 bigram。）
    """
    tokens: list[str] = []

    for word in _ASCII_WORD.findall(text):
        lw = word.lower()
        tokens.append(lw)
        # 同義詞注入：英文詞 → 中文 CJK tokens
        syn = _SYNONYMS.get(lw)
        if syn:
            tokens.extend(_cjk_tokens(syn))

    for run in _cjk_runs(text):
        for ch in run:
            if ch not in _CJK_STOP_CHARS:
                tokens.append(ch)
        for i in range(len(run) - 1):
            tokens.append(run[i : i + 2])

    return tokens
