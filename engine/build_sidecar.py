import shutil
import subprocess
import sys
from pathlib import Path

target = sys.argv[1]
root = Path(__file__).resolve().parents[1]
work = root / ".engine-build"
subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean", "--onefile", "--name", "thinkfast-engine", "--collect-all", "laya", "--collect-all", "torch", "engine/thinkfast_engine.py"], cwd=root, check=True)
suffix = ".exe" if "windows" in target else ""
source = root / "dist" / f"thinkfast-engine{suffix}"
destination = root / "src-tauri" / "binaries" / f"thinkfast-engine-{target}{suffix}"
destination.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(source, destination)
