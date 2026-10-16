#!/usr/bin/env python3
"""Run The Last Ember locally with one command.

    python run.py              dev server with hot reload, opens the game in your browser
    python run.py --prod       production build, served the way Vercel serves it
    python run.py --debug      open with ?debug=1 (fps counter and window.__game hooks)
    python run.py --no-browser start the server without opening a browser
    python run.py --port 5180  use another port

It checks Node.js, installs dependencies when they are missing or package-lock.json has changed, starts the
server, waits until it answers, then opens the game. Ctrl+C stops everything. Standard library only.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOCK = ROOT / "package-lock.json"
MODULES = ROOT / "node_modules"
STAMP = MODULES / ".run-py-lock-hash"
MIN_NODE = (20, 19)  # Vite 8 needs Node 20.19+ or 22.12+
IS_WINDOWS = os.name == "nt"


def say(msg: str) -> None:
    print(f"[run] {msg}", flush=True)


def fail(msg: str) -> None:
    print(f"[run] error: {msg}", file=sys.stderr, flush=True)
    sys.exit(1)


def find_tool(name: str) -> str:
    path = shutil.which(name)
    if not path:
        fail(f"'{name}' was not found. Install Node.js {MIN_NODE[0]}.{MIN_NODE[1]} or newer from https://nodejs.org and try again.")
    return path


def check_node(node: str) -> None:
    out = subprocess.run([node, "--version"], capture_output=True, text=True, check=False).stdout.strip()
    try:
        major, minor = (int(p) for p in out.lstrip("v").split(".")[:2])
    except ValueError:
        say(f"could not read the Node.js version ({out!r}); continuing")
        return
    if (major, minor) < MIN_NODE:
        fail(f"Node.js {out} is too old for Vite 8. Install Node.js {MIN_NODE[0]}.{MIN_NODE[1]}+ (22 LTS recommended).")
    say(f"Node.js {out}")


def lock_hash() -> str:
    return hashlib.sha256(LOCK.read_bytes()).hexdigest() if LOCK.exists() else ""


def ensure_dependencies(npm: str, force: bool) -> None:
    """Install when node_modules is missing, or when package-lock.json changed since the last install."""
    want = lock_hash()
    have = STAMP.read_text().strip() if STAMP.exists() else None
    if MODULES.exists() and have == want and not force:
        return
    fresh = not MODULES.exists()
    # npm ci installs exactly what the lockfile pins and never rewrites it (npm install can churn it per npm version)
    cmd = [npm, "ci"] if LOCK.exists() else [npm, "install"]
    say(("installing" if fresh else "updating") + " dependencies (" + " ".join(cmd[1:]) + ")...")
    if subprocess.run(cmd, cwd=ROOT, check=False).returncode != 0:
        fail("dependency install failed (see the npm output above)")
    STAMP.write_text(want)


def port_busy(port: int) -> bool:
    """True if anything answers on the port over IPv4 or IPv6 (Node binds 'localhost' to ::1 first)."""
    for host in ("127.0.0.1", "::1"):
        family = socket.AF_INET6 if ":" in host else socket.AF_INET
        try:
            with socket.socket(family, socket.SOCK_STREAM) as s:
                s.settimeout(0.3)
                if s.connect_ex((host, port)) == 0:
                    return True
        except OSError:
            pass  # no IPv6 on this machine
    return False


def wait_for(url: str, proc: subprocess.Popen, timeout: float = 90) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        if proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status < 500:
                    return True
        except OSError:
            pass
        time.sleep(0.4)
    return False


def start(cmd: list[str]) -> subprocess.Popen:
    # its own process group, so Ctrl+C and shutdown reach node and not just the npm wrapper
    if IS_WINDOWS:
        return subprocess.Popen(cmd, cwd=ROOT, creationflags=subprocess.CREATE_NEW_PROCESS_GROUP)
    return subprocess.Popen(cmd, cwd=ROOT, start_new_session=True)


def stop(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    say("stopping the server...")
    try:
        if IS_WINDOWS:
            # npm on Windows is a .cmd wrapper: kill the whole tree or node keeps the port open
            subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"], capture_output=True, check=False)
        else:
            os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=10)
    except (OSError, subprocess.TimeoutExpired):
        proc.kill()


def interrupt(*_: object) -> None:
    raise KeyboardInterrupt


def main() -> None:
    if IS_WINDOWS:
        signal.signal(signal.SIGBREAK, interrupt)  # Ctrl+Break stops it cleanly too
    ap = argparse.ArgumentParser(description="Run The Last Ember locally.")
    ap.add_argument("--prod", action="store_true", help="build for production and serve the build")
    ap.add_argument("--debug", action="store_true", help="open with ?debug=1")
    ap.add_argument("--no-browser", action="store_true", help="do not open a browser")
    ap.add_argument("--port", type=int, default=None, help="port (default 5173 dev, 4173 prod)")
    ap.add_argument("--reinstall", action="store_true", help="reinstall dependencies first")
    args = ap.parse_args()

    if not (ROOT / "package.json").exists():
        fail(f"package.json not found next to run.py ({ROOT})")
    node = find_tool("node")
    npm = find_tool("npm")
    check_node(node)

    # before touching node_modules: a server that is already running holds files in it open
    port = args.port or (4173 if args.prod else 5173)
    url = f"http://localhost:{port}/" + ("?debug=1" if args.debug else "")
    if port_busy(port):
        fail(f"port {port} is already in use (is the game already running?). Close it, or pick another: python run.py --port {port + 1}")
    ensure_dependencies(npm, args.reinstall)

    if args.prod:
        say("building for production...")
        if subprocess.run([npm, "run", "build"], cwd=ROOT, check=False).returncode != 0:
            fail("build failed (see the output above)")
        cmd = [npm, "run", "preview", "--", "--port", str(port), "--strictPort"]
    else:
        cmd = [npm, "run", "dev", "--", "--port", str(port), "--strictPort"]

    say("starting " + ("the production preview" if args.prod else "the dev server") + "...")
    proc = start(cmd)
    try:
        if not wait_for(f"http://localhost:{port}/", proc):
            stop(proc)
            fail("the server did not start (see the output above)")
        say(f"The Last Ember is running at {url}")
        if not args.no_browser:
            webbrowser.open(url)
        say("press Ctrl+C to stop")
        while proc.poll() is None:
            time.sleep(0.5)
        if proc.returncode:
            fail(f"the server stopped with exit code {proc.returncode}")
    except KeyboardInterrupt:
        pass
    finally:
        stop(proc)


if __name__ == "__main__":
    main()
