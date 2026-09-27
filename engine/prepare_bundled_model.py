from pathlib import Path

from huggingface_hub import snapshot_download

root = Path(__file__).resolve().parents[1]
destination = root / "engine" / ".bundled-model" / "english"
destination.mkdir(parents=True, exist_ok=True)

snapshot_download(
    repo_id="convaiinnovations/laya",
    local_dir=str(destination),
    allow_patterns=[
        "rl_agent_config.json",
        "model.safetensors",
        "tokenizer/*",
        "encoder/*",
    ],
)

required = [destination / "rl_agent_config.json", destination / "model.safetensors"]
missing = [str(path.relative_to(destination)) for path in required if not path.is_file()]
if missing:
    raise SystemExit(f"The included decision model is incomplete: {', '.join(missing)}")

print(f"Prepared included decision model at {destination}")
