import shutil
import subprocess
import sys
from pathlib import Path

target = sys.argv[1]
root = Path(__file__).resolve().parents[1]
model_directory = root / "engine" / ".bundled-model" / "english"
if not model_directory.is_dir():
    raise SystemExit("The included decision model is missing. Run engine/prepare_bundled_model.py before building the sidecar.")

data_separator = ";" if "windows" in target else ":"
model_data = f"{model_directory}{data_separator}models/english"
subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--name", "thinkfast-engine", "--collect-all", "laya", "--collect-all", "torch", "--collect-all", "docx", "--collect-all", "olefile", "--add-data", model_data, "engine/thinkfast_engine.py"], cwd=root, check=True)
suffix = ".exe" if "windows" in target else ""
source = root / "dist" / f"thinkfast-engine{suffix}"
destination = root / "src-tauri" / "binaries" / f"thinkfast-engine-{target}{suffix}"
destination.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source, destination)
