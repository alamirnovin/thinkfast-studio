import json
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen


def request(path, payload=None, timeout=30):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {} if data is None else {"content-type": "application/json"}
    with urlopen(Request(f"http://127.0.0.1:8765{path}", data=data, headers=headers), timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python engine/smoke_sidecar.py PATH_TO_ENGINE")

    location = Path(sys.argv[1])
    if location.is_dir():
        candidates = sorted(location.glob("thinkfast-engine-*"))
        if len(candidates) != 1:
            raise SystemExit(f"Expected one engine executable in {location}, found {len(candidates)}.")
        executable = candidates[0]
    else:
        executable = location
    if not executable.is_file():
        raise SystemExit(f"Engine executable was not found: {executable}")
    executable = executable.resolve()

    process = subprocess.Popen(
        [str(executable)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        deadline = time.monotonic() + 300
        health = None
        while time.monotonic() < deadline:
            if process.poll() is not None:
                output = process.stdout.read() if process.stdout else ""
                raise RuntimeError(f"The engine stopped while starting.\n{output[-4000:]}")
            try:
                health = request("/health", timeout=5)
                if health.get("ready"):
                    break
            except URLError:
                pass
            time.sleep(1)

        if not health or not health.get("ready"):
            raise RuntimeError("The engine did not report ready within five minutes.")

        result = request("/analyze", {
            "records": [{
                "title": "Smoke test",
                "text": "I was charged twice and would like a refund.",
                "questions": [{
                    "id": "duplicate-charge",
                    "text": "Does this text describe a duplicate charge?",
                    "type": "yesno",
                    "options": ["Yes", "No"],
                }],
            }],
        }, timeout=120)

        answer = result[0]["answers"][0]
        if answer["answer"] not in {"Yes", "No"}:
            raise RuntimeError(f"Unexpected Yes/No response: {answer}")
        if not isinstance(answer["confidence"], int):
            raise RuntimeError(f"Missing confidence in response: {answer}")
        print("Packaged engine smoke test passed.")
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == "__main__":
    main()
