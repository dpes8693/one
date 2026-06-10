"""端對端與單元測試：python -m unittest discover -s tests"""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from qlink.linker import LinkerConfig, link_questions_to_nodes, flatten_tree
from qlink.models import Question
from qlink.pageindex_adapter import load_tree, load_tree_file
from qlink.pipeline import ingest_questions, ingest_tree
from qlink.store import Store
from qlink.textutil import tokenize

EXAMPLES = Path(__file__).resolve().parent.parent / "examples"


class TokenizeTest(unittest.TestCase):
    def test_mixed_text(self):
        tokens = tokenize("ACEI 治療高血壓")
        self.assertIn("acei", tokens)
        self.assertIn("高血", tokens)
        self.assertIn("血壓", tokens)

    def test_stopword_unigram_skipped_but_bigram_kept(self):
        tokens = tokenize("藥物的作用")
        self.assertNotIn("的", tokens)
        self.assertIn("物的", tokens)


class AdapterTest(unittest.TestCase):
    def test_load_sample_tree(self):
        roots = load_tree_file(EXAMPLES / "sample_tree.json")
        self.assertEqual(len(roots), 2)
        nodes = flatten_tree(roots)
        self.assertEqual(len(nodes), 10)
        by_id = {n.node_id: n for n in nodes}
        diuretic = by_id["pharm101:0003"]
        self.assertEqual(diuretic.parent_id, "pharm101:0002")
        self.assertIn("循環系統藥物", diuretic.title_path)
        self.assertEqual(diuretic.page_start, 43)

    def test_alternative_keys(self):
        data = [
            {
                "id": "n1",
                "title": "章一",
                "page_start": 1,
                "page_end": 5,
                "children": [{"id": "n2", "title": "節一", "content": "內文"}],
            }
        ]
        roots = load_tree(data, "doc")
        self.assertEqual(roots[0].node_id, "doc:n1")
        self.assertEqual(roots[0].children[0].text, "內文")


class LinkerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.nodes = flatten_tree(load_tree_file(EXAMPLES / "sample_tree.json"))
        data = json.loads((EXAMPLES / "sample_questions.json").read_text("utf-8"))
        cls.questions = [
            Question(
                question_id=q["question_id"],
                stem=q["stem"],
                options=q["options"],
                answer=q["answer"],
                explanation=q["explanation"],
                tags=q["tags"],
            )
            for q in data
        ]

    def _links_for(self, links, qid):
        return [l for l in links if l.question_id == qid]

    def test_questions_link_to_expected_nodes(self):
        links = link_questions_to_nodes(self.nodes, self.questions)
        expected_top = {
            "q0001": "pharm101:0003",  # Thiazide -> 利尿劑
            "q0002": "pharm101:0004",  # Propranolol -> β 阻斷劑
            "q0003": "pharm101:0005",  # ACEI 乾咳 -> ACEI
            "q0004": "pharm101:0007",  # Digoxin -> 毛地黃
            "q0005": "pharm101:0008",  # Amiodarone -> 抗心律不整
            "q0006": "pharm101:0010",  # Atropine -> 抗膽鹼
        }
        for qid, node_id in expected_top.items():
            qlinks = self._links_for(links, qid)
            self.assertTrue(qlinks, f"{qid} 應有關聯")
            self.assertEqual(
                qlinks[0].node_id, node_id, f"{qid} 最高分節點應為 {node_id}"
            )

    def test_unrelated_question_gets_no_link(self):
        links = link_questions_to_nodes(self.nodes, self.questions)
        q8 = self._links_for(links, "q0008")  # 肺炎題與循環系統教材無關
        self.assertEqual(q8, [], "無關題不應建立任何關聯")

    def test_parent_in_propagation_chain_not_linked(self):
        links = link_questions_to_nodes(self.nodes, self.questions)
        q4_nodes = {l.node_id for l in self._links_for(links, "q0004")}
        self.assertIn("pharm101:0007", q4_nodes)  # 毛地黃葉節點
        # 父節點與祖父節點（分數來自葉節點的傳播）不應重複入選
        self.assertNotIn("pharm101:0006", q4_nodes)
        self.assertNotIn("pharm101:0001", q4_nodes)

    def test_many_to_many(self):
        links = link_questions_to_nodes(self.nodes, self.questions)
        # 一題可對多節點
        multi = [qid for qid in {l.question_id for l in links}
                 if len(self._links_for(links, qid)) > 1]
        self.assertTrue(multi, "至少應有一題連到多個節點")
        # 一節點可對多題：q0003 與 q0007 都與 ACEI 相關
        acei_qids = {l.question_id for l in links if l.node_id == "pharm101:0005"}
        self.assertIn("q0003", acei_qids)
        self.assertIn("q0007", acei_qids)

    def test_prefers_specific_leaf_over_parent(self):
        links = link_questions_to_nodes(self.nodes, self.questions)
        q4 = self._links_for(links, "q0004")
        node_ids = [l.node_id for l in q4]
        self.assertIn("pharm101:0007", node_ids)
        if "pharm101:0006" in node_ids:  # 父節點若也入選，排名不可高於葉節點
            self.assertLess(
                node_ids.index("pharm101:0007"), node_ids.index("pharm101:0006")
            )

    def test_top_k_respected(self):
        cfg = LinkerConfig(top_k=2, min_score=0.0, relative_ratio=0.0)
        links = link_questions_to_nodes(self.nodes, self.questions, cfg)
        for qid in {l.question_id for l in links}:
            self.assertLessEqual(len(self._links_for(links, qid)), 2)


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "test.db")

    def tearDown(self):
        self.store.close()
        self.tmp.cleanup()

    def test_questions_first_then_tree(self):
        """模擬實際流程：題庫先存在，新 PDF 進來時自動建關聯。"""
        n, links = ingest_questions(self.store, str(EXAMPLES / "sample_questions.json"))
        self.assertEqual(n, 8)
        self.assertEqual(links, [])  # 還沒有任何教材節點

        doc_id, n_nodes, links = ingest_tree(self.store, EXAMPLES / "sample_tree.json")
        self.assertEqual(doc_id, "pharm101")
        self.assertEqual(n_nodes, 10)
        self.assertTrue(links)

        # 題目 -> 節點
        nodes = self.store.nodes_for_question("q0004")
        self.assertEqual(nodes[0][0].node_id, "pharm101:0007")
        # 節點 -> 題目（查父章節，應涵蓋子孫節點的題目）
        qs = self.store.questions_for_node("pharm101:0002")
        qids = {q.question_id for q, _ in qs}
        self.assertTrue({"q0001", "q0002", "q0003"} <= qids)

    def test_tree_first_then_questions(self):
        ingest_tree(self.store, EXAMPLES / "sample_tree.json")
        n, links = ingest_questions(
            self.store, str(EXAMPLES / "sample_questions.json")
        )
        self.assertEqual(n, 8)
        self.assertTrue(links)
        stats = self.store.stats()
        self.assertEqual(stats["nodes"], 10)
        self.assertEqual(stats["questions"], 8)

    def test_reingest_is_idempotent(self):
        ingest_tree(self.store, EXAMPLES / "sample_tree.json")
        ingest_questions(self.store, str(EXAMPLES / "sample_questions.json"))
        before = self.store.stats()
        ingest_tree(self.store, EXAMPLES / "sample_tree.json")
        after = self.store.stats()
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()
