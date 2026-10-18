#!/usr/bin/env python3
"""The live demo for the judges: the bot plays The Last Ember in a real Chrome window.

    python demo.py              play, on the local dev server (http://localhost:5174, started if needed); run it
                                again after a stop to resume where it was
    python demo.py --live       the deployed site instead
    python demo.py --restart    start again from the very beginning

Stop it any time (Ctrl+C, closing the terminal): the game pauses where it stands and the window stays open.
Details: scripts/demo.mjs.
"""
import os
import shutil
import subprocess
import sys

root = os.path.dirname(os.path.abspath(__file__))
node = shutil.which("node")
if not node:
    sys.exit("Node.js was not found. Install Node.js 20.19+ from https://nodejs.org and try again.")
if not os.path.isdir(os.path.join(root, "node_modules", "playwright")):
    print("[demo] installing dependencies (npm ci) ...", flush=True)
    subprocess.run(["npm", "ci", "--no-audit", "--no-fund"], cwd=root, check=True)
try:
    sys.exit(subprocess.call([node, os.path.join(root, "scripts", "demo.mjs"), *sys.argv[1:]], cwd=root))
except KeyboardInterrupt:
    sys.exit(0)  # node handles Ctrl+C itself (it pauses the game); never kill the demo window
