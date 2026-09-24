"""Private local decision engine used by ThinkFast Studio's desktop installer."""
from __future__ import annotations

from threading import Lock
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from laya import Router

app = FastAPI(title="ThinkFast Studio Engine")
app.add_middleware(CORSMiddleware, allow_origins=["http://tauri.localhost", "https://tauri.localhost"], allow_methods=["*"], allow_headers=["*"])
router: Router | None = None
lock = Lock()

class InstallRequest(BaseModel):
    multilingual: bool = False

class AnalyzeRequest(BaseModel):
    records: list[dict]

def questions_for_laya(questions: list[dict]) -> dict:
    built = {}
    for index, question in enumerate(questions):
        kind = question.get("type", "choice")
        key = f"question_{index + 1}"
        if kind == "yesno":
            built[key] = {"type": "noul", "instructions": question["text"]}
        elif kind == "score":
            built[key] = {"type": "score", "instructions": question["text"], "criteria": ["low", "high"]}
        else:
            choices = question.get("options") or ["Yes", "No"]
            built[key] = {"type": "choice", "instructions": question["text"], "criteria": {choice: choice for choice in choices}}
    return built

@app.get("/health")
def health():
    return {"ready": router is not None}

@app.post("/install")
def install(request: InstallRequest):
    global router
    with lock:
        router = Router(default="multilingual" if request.multilingual else "english", max_loaded=1)
        warmup = {"ready": {"type": "noul", "instructions": "Is this text present?"}}
        router.predict("ThinkFast Studio is ready.", warmup, model="multilingual" if request.multilingual else "english")
    return {"ready": True}

@app.post("/analyze")
def analyze(request: AnalyzeRequest):
    if router is None:
        raise HTTPException(status_code=409, detail="Install the decision engine first.")
    results = []
    for record in request.records:
        output = router.predict(record["text"], questions_for_laya(record["questions"]))
        first = next(iter(output["answers"].values()))
        answer = first.get("choice", first.get("noul", first.get("score", "Needs review")))
        confidence = round(float(first.get("confidence", first.get("probability", 0.5))) * 100)
        results.append({"title": record["title"], "text": record["text"], "answer": str(answer), "confidence": confidence, "status": "ready" if confidence >= 75 else "review"})
    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
