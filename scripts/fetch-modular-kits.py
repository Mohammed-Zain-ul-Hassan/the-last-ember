"""Download verified CC0 modular kits into vendor/kits/. Do not invent URLs."""
from __future__ import annotations

import re
import ssl
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CTX = ssl.create_default_context()


def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "the-last-ember-kit-fetch/1.0"})
    with urllib.request.urlopen(req, context=CTX, timeout=120) as r:
        return r.read()


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print("GET", url)
    data = fetch(url)
    dest.write_bytes(data)
    print("Wrote", dest, "bytes", len(data))


def scrape_oga_zips(page_url: str) -> list[str]:
    html = fetch(page_url).decode("utf-8", "replace")
    hrefs = re.findall(r'href="([^"]+\.zip)"', html, flags=re.I)
    out: list[str] = []
    for h in hrefs:
        if h.startswith("http"):
            out.append(h)
        elif h.startswith("/"):
            out.append("https://opengameart.org" + h)
        else:
            out.append("https://opengameart.org/" + h)
    # Prefer sites/default/files downloads
    out = [u for u in dict.fromkeys(out)]
    return out


def unzip(zip_path: Path, dest: Path) -> None:
    dest.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(dest)
    print("Extracted to", dest)


def main() -> None:
    # Quaternius Medieval Village MegaKit (Standard) — CC0 via OpenGameArt
    oga = "https://opengameart.org/content/medieval-village-megakit"
    zips = scrape_oga_zips(oga)
    print("Found zip links:", *zips, sep="\n  ")
    if not zips:
        raise SystemExit("No OGA zip links found")
    # Prefer the megakit zip name
    pick = next((u for u in zips if "medieval_village" in u.lower() or "megakit" in u.lower()), zips[0])
    qdir = ROOT / "vendor" / "kits" / "quaternius-medieval-village"
    zpath = qdir / "medieval_village_megakit_standard.zip"
    download_file(pick, zpath)
    unzip(zpath, qdir / "extracted")

    # Nodex3D dungeon kit — CC-BY, documented only as alternate; skip binary download here.
    print("Done Quaternius download.")


if __name__ == "__main__":
    main()
