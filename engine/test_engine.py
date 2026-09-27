from pathlib import Path
import sys
import unittest

from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from engine import thinkfast_engine as engine


class FakeRouter:
    def predict(self, text, questions):
        return {
            "answers": {
                "question_1": {"choice": "Billing", "answer_confidence": 0.91},
                "question_2": {"noul": 0.24, "answer_confidence": 0.76},
                "question_3": {"score": 1.2, "answer_confidence": 0.88},
            }
        }


class FailingRouter:
    def predict(self, text, questions):
        raise RuntimeError("model load failed")


class AnalyzeResponseTests(unittest.TestCase):
    def setUp(self):
        self.previous_router = engine.router

    def tearDown(self):
        engine.router = self.previous_router

    def test_returns_friendly_answers_for_each_question_type(self):
        engine.router = FakeRouter()
        response = engine.analyze(engine.AnalyzeRequest(records=[{
            "title": "Example",
            "text": "Please refund the duplicate charge.",
            "questions": [
                {"id": "choice", "text": "Which team?", "type": "choice", "options": ["Billing", "Other"]},
                {"id": "yesno", "text": "Was there a duplicate charge?", "type": "yesno", "options": ["Yes", "No"]},
                {"id": "score", "text": "How urgent?", "type": "score", "options": ["Low", "Medium", "High"]},
            ],
        }]))

        answers = response[0]["answers"]
        self.assertEqual([answer["answer"] for answer in answers], ["Billing", "No", "Medium"])
        self.assertEqual([answer["confidence"] for answer in answers], [91, 76, 88])
        self.assertEqual(answers[2]["score_position"], 2)
        self.assertEqual(response[0]["status"], "ready")

    def test_reports_the_engine_error_to_the_app(self):
        engine.router = FailingRouter()
        with self.assertRaises(HTTPException) as raised:
            engine.analyze(engine.AnalyzeRequest(records=[{
                "title": "Example",
                "text": "A short document.",
                "questions": [{"id": "choice", "text": "Which team?", "type": "choice", "options": ["Billing", "Other"]}],
            }]))

        self.assertEqual(raised.exception.status_code, 500)
        self.assertIn("Analysis could not run: model load failed", raised.exception.detail)


if __name__ == "__main__":
    unittest.main()
