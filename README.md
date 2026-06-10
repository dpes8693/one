# qlink — PageIndex 教材樹 × 國考題庫 多對多關聯引擎

把 **PDF 教材**（經 [PageIndex](https://github.com/VectifyAI/PageIndex) 解析成樹狀 JSON）
與**考題題庫**自動建立多對多關聯：

- 學生作答某一題 → 立刻找到對應的教材章節（含頁碼）。
- 瀏覽某個教材章節 → 列出所有相關考題（含子章節的題目）。

純 Python 標準庫實作，**不需要任何外部 API 或套件**即可運作；
可選擇性注入 embedding provider（如 OpenAI）強化語意比對。

## 系統流程

```
新 PDF ──PageIndex──▶ 樹狀 JSON ──ingest-tree──▶ 節點入庫
                                        │
                                        ▼
                          關聯演算法（對既有全部題目計分）
                                        ▲
                                        │
新題目 ────────────────ingest-questions──▶ 題目入庫
                                        │
                                        ▼
                            SQLite links 表（多對多）
                       題目 ⇄ 教材節點 雙向查詢
```

兩個方向都是**增量**的：新 PDF 進來只算「全部題目 × 新文件節點」；
新題目進來只算「新題目 × 全部節點」，不會重算既有關聯。

## 關聯演算法

對每一題、每個節點計算混合分數，取通過門檻的前 K 個節點：

1. **文字表示**
   - 節點：`標題路徑（章 > 節 > 小節）+ 摘要 + 內文`
   - 題目：`題幹 + 選項 + 詳解 + 標籤`
   - 斷詞對中文採「字元 unigram + bigram」（零依賴、對專有名詞穩定），
     英文藥名／法條編號等以單字切分。

2. **混合計分**

   ```
   score = w_bm25 · BM25覆蓋率 + w_cos · TF-IDF cosine (+ w_emb · embedding cosine)
   ```

   BM25 以「該查詢理論最高分」做**絕對正規化**（查詢覆蓋率），
   因此完全無關的題目分數會貼近 0，可用絕對門檻過濾——
   不會像 per-query max 正規化那樣，把無關題的最高分節點也拉成 1.0。
   題目標籤命中節點標題時有小幅加分；葉節點（最具體的小節）有小幅加權。

3. **層級傳播**：子節點分數以衰減係數向父節點傳播
   （子節點命中時父章節也沾光）；但若父節點分數主要來自某個已入選的
   子節點，整條祖先鏈都會被跳過，**只保留最精準的層級**。
   章節層級的聚合查詢改由 `questions_for_node(include_descendants=True)` 提供。

4. **多對多篩選**：每題保留 `score ≥ min_score` 且 `score ≥ 最高分 × relative_ratio`
   的前 `top_k` 個節點。一題可連多節點、一節點可被多題連到。

所有參數都在 `LinkerConfig`（`qlink/linker.py`）中，調參後可 `relink` 全量重算。

## 快速開始

```bash
# 1. 導入題庫（題庫先後順序不影響，兩個方向都會自動補關聯）
python -m qlink.cli ingest-questions examples/sample_questions.json

# 2. 新 PDF 經 PageIndex 產生的樹 JSON 進系統
python -m qlink.cli ingest-tree examples/sample_tree.json

# 3. 題目 -> 教材節點（含頁碼，可直接跳轉 PDF）
python -m qlink.cli question q0004
#   0.879  pharm101:0007  第三章 循環系統藥物 > 3.2 心衰竭治療藥物 > 3.2.1 毛地黃（Digoxin） p.62-68

# 4. 教材節點 -> 題目（含子章節的題目）
python -m qlink.cli node pharm101:0002

# 5. 統計 / 調參後全量重算
python -m qlink.cli stats
python -m qlink.cli --top-k 3 --min-score 0.5 relink
```

## 程式介面

```python
from qlink.store import Store
from qlink.pipeline import ingest_tree, ingest_questions
from qlink.linker import LinkerConfig

store = Store("qlink.db")

# 題庫（dict 清單、Question 清單或 JSON 檔路徑皆可）
ingest_questions(store, "examples/sample_questions.json")

# PageIndex 樹（JSON 物件或檔案路徑）
doc_id, n_nodes, links = ingest_tree(store, "examples/sample_tree.json")

# 雙向查詢
for node, score in store.nodes_for_question("q0004"):
    print(score, node.title_path, node.page_start, node.page_end)
for question, score in store.questions_for_node("pharm101:0002"):
    print(score, question.stem)
```

### 加上 embedding（可選）

```python
from qlink.embeddings import OpenAIEmbeddingProvider  # 需 pip install openai

provider = OpenAIEmbeddingProvider(model="text-embedding-3-small")
ingest_tree(store, "tree.json", embedder=provider)   # 分數加入 embedding cosine
```

也可以實作自己的 provider，只要有 `embed(texts: list[str]) -> list[list[float]]`
方法即可（例如接 sentence-transformers 的本地中文模型）。

## PageIndex JSON 相容性

`qlink/pageindex_adapter.py` 容忍不同版本 PageIndex 的欄位差異：

- 根層：`structure` / `tree` / `nodes` / 直接是 list
- 子節點鍵：`nodes` / `children`
- 頁碼鍵：`start_index`,`end_index` / `page_start`,`page_end` / `physical_index`
- 內文鍵：`text` / `content` / `prefix_summary`

節點 ID 入庫時會加上 `{doc_id}:` 前綴，保證跨文件唯一。

## 測試

```bash
python -m unittest discover -s tests -v
```

範例資料為藥理學國考風格的小型教材樹（10 節點）與 8 題題庫，
其中一題（細菌性肺炎）刻意與教材無關，驗證門檻能擋住誤連。

## 專案結構

```
qlink/
  models.py             # TreeNode / Question / Link 資料模型
  textutil.py           # 中英混合斷詞（CJK 字元 bigram）
  scoring.py            # BM25（覆蓋率正規化）+ TF-IDF cosine
  linker.py             # 核心關聯演算法（混合計分 + 層級傳播 + 多對多篩選）
  pageindex_adapter.py  # PageIndex JSON -> TreeNode
  embeddings.py         # 可選 embedding provider 介面
  store.py              # SQLite 儲存與雙向查詢
  pipeline.py           # 增量導入流程
  cli.py                # 命令列工具
examples/               # 範例教材樹 + 範例題庫
tests/                  # 單元 + 端對端測試
```
