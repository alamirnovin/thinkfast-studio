"""Private local decision engine used by ThinkFast Studio's desktop installer."""
from __future__ import annotations

import base64
import io
import re
from pathlib import Path
from threading import Event, Lock, Thread
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from laya import Router

app = FastAPI(title="ThinkFast Studio Engine")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://tauri.localhost", "https://tauri.localhost", "tauri://localhost", "http://localhost:1420"],
    allow_methods=["*"],
    allow_headers=["*"],
)
router: Router | None = None
lock = Lock()
install_lock = Lock()
install_thread: Thread | None = None
install_status = {
    "state": "waiting",
    "percent": 0,
    "message": "Ready to download the recommended local model.",
    "error": None,
}

class InstallRequest(BaseModel):
    multilingual: bool = False

class AnalyzeRequest(BaseModel):
    records: list[dict]


class ExtractDocumentRequest(BaseModel):
    filename: str
    content: str


def legacy_word_text(content: bytes) -> str:
    """Recover readable text from legacy .doc files without requiring Word on the user's computer."""
    try:
        import olefile

        document = olefile.OleFileIO(io.BytesIO(content)).openstream("WordDocument").read()
    except Exception as exc:
        raise ValueError("This .doc file is not a readable Microsoft Word document.") from exc
    candidates = [document.decode("utf-16-le", errors="ignore"), document.decode("cp1252", errors="ignore")]
    text = max(candidates, key=lambda value: sum(character.isprintable() for character in value))
    text = re.sub(r"[\x00-\x08\x0b-\x1f]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) < 20:
        raise ValueError("ThinkFast Studio could not recover readable text from this legacy .doc file. Save it as .docx and upload it again.")
    return text


def document_text(filename: str, content: bytes) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".docx":
        try:
            from docx import Document

            document = Document(io.BytesIO(content))
            sections = [paragraph.text.strip() for paragraph in document.paragraphs if paragraph.text.strip()]
            for table in document.tables:
                sections.extend(" | ".join(cell.text.strip() for cell in row.cells if cell.text.strip()) for row in table.rows)
            text = "\n".join(section for section in sections if section)
        except Exception as exc:
            raise ValueError("This .docx file could not be read.") from exc
    elif suffix == ".doc":
        text = legacy_word_text(content)
    else:
        raise ValueError("Only .doc and .docx Word documents can be extracted here.")
    if not text.strip():
        raise ValueError("This Word document does not contain readable body text.")
    return text


def set_install_status(state: str, percent: int, message: str, error: str | None = None):
    with install_lock:
        install_status.update({
            "state": state,
            "percent": max(0, min(100, int(percent))),
            "message": message,
            "error": error,
        })


def cache_size_bytes() -> int:
    """Return the visible Hugging Face cache size while the selected checkpoint downloads."""
    try:
        from huggingface_hub.constants import HF_HUB_CACHE

        cache = Path(HF_HUB_CACHE) / "models--convaiinnovations--laya" / "blobs"
        return sum(path.stat().st_size for path in cache.glob("*") if path.is_file())
    except Exception:
        return 0


def expected_model_bytes() -> int | None:
    """Ask the model host for English-checkpoint file sizes before downloading."""
    try:
        from huggingface_hub import HfApi

        info = HfApi().model_info("convaiinnovations/laya", files_metadata=True)
        total = sum(
            int(file.size or 0)
            for file in (info.siblings or [])
            if "/" not in file.rfilename
        )
        return total or None
    except Exception:
        return None


def format_gb(byte_count: int) -> str:
    return f"{byte_count / (1024 ** 3):.1f} GB"


def monitor_download(stop: Event, total: int | None):
    while not stop.wait(0.75):
        downloaded = cache_size_bytes()
        if total:
            percent = min(98, max(3, round(downloaded / total * 100)))
            message = f"Downloading local model: {format_gb(downloaded)} of {format_gb(total)}."
        else:
            percent = 3
            message = "Downloading the local model. The model host has not provided a file size yet."
        set_install_status("downloading", percent, message)


def install_recommended_model(multilingual: bool):
    global router
    monitor_stop = Event()
    monitor: Thread | None = None
    try:
        set_install_status("preparing", 1, "Preparing the one-time local model download…")
        total = expected_model_bytes()
        set_install_status("downloading", 2, "Connecting to the model host…")
        monitor = Thread(target=monitor_download, args=(monitor_stop, total), daemon=True)
        monitor.start()
        with lock:
            router = Router(default="multilingual" if multilingual else "english", max_loaded=1)
            warmup = {"ready": {"type": "noul", "instructions": "Is this text present?"}}
            router.predict("ThinkFast Studio is ready.", warmup, model="multilingual" if multilingual else "english")
        set_install_status("ready", 100, "Download complete. Your local model is ready.")
    except Exception as exc:
        router = None
        set_install_status("failed", 0, "The local model could not be downloaded.", str(exc))
    finally:
        monitor_stop.set()
        if monitor:
            monitor.join(timeout=1)

def questions_for_local_model(questions: list[dict]) -> dict:
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
    with install_lock:
        status = dict(install_status)
    return {"ready": router is not None, "install": status}


@app.get("/install/status")
def get_install_status():
    with install_lock:
        return dict(install_status)

@app.post("/install")
def install(request: InstallRequest):
    global install_thread
    if router is not None:
        set_install_status("ready", 100, "Your local model is ready.")
        return {"ready": True, "state": "ready"}
    with install_lock:
        running = install_thread is not None and install_thread.is_alive()
        if not running:
            install_thread = Thread(target=install_recommended_model, args=(request.multilingual,), daemon=True)
            install_thread.start()
    return {"ready": False, "state": "downloading"}


@app.post("/extract-document")
def extract_document(request: ExtractDocumentRequest):
    try:
        content = base64.b64decode(request.content, validate=True)
        return {"text": document_text(request.filename, content)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

@app.post("/analyze")
def analyze(request: AnalyzeRequest):
    if router is None:
        raise HTTPException(status_code=409, detail="Install the decision engine first.")
    results = []
    for record in request.records:
        output = router.predict(record["text"], questions_for_local_model(record["questions"]))
        first = next(iter(output["answers"].values()))
        answer = first.get("choice", first.get("noul", first.get("score", "Needs review")))
        confidence = round(float(first.get("confidence", first.get("probability", 0.5))) * 100)
        results.append({"title": record["title"], "text": record["text"], "answer": str(answer), "confidence": confidence, "status": "ready" if confidence >= 75 else "review"})
    return results

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")
