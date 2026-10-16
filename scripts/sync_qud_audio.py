#!/usr/bin/env python3
"""Build the mushaf's word-synchronised reciter bundle from QUD.

This script runs in GitHub Actions. It mirrors only timing metadata (CC-BY-4.0)
into this repository; recitation audio remains streamed from the original source
URLs listed by Quranic Universal Audio (QUD).
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import os
import re
import shutil
import sys
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "qud"
QUD_REPO = "QUD-Technologies/quranic-universal-audio"
QUD_TAG = os.environ.get("QUD_RELEASE", "v3.2.0")
RELEASE_API = f"https://api.github.com/repos/{QUD_REPO}/releases/tags/{QUD_TAG}"
TOTAL_AYAHS = 6236
MIN_RECITERS = 21
MAX_RECITERS = 32
SYNTHETIC_ID_BASE = 9000
VERSE_COUNTS = [
    7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
    112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
    59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,
    52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,
    21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6,
]

PREFERRED_SLUG_PARTS = [
    "maher_al_muaiqly", "yasser_al_dosari", "abdulbasit_abdulsamad",
    "mohammed_siddiq_al_minshawi", "mahmoud_khalil_al_husary",
    "saad_al_ghamdi", "ahmed_al_ajmi", "ali_al_huthaifi", "saud_al_shuraim",
    "nasser_al_qatami", "abu_bakr_al_shatri", "hani_al_rifai", "islam_sobhi",
    "bandar_baleela", "haitham_al_dukhain", "khalifa_al_tunaiji",
    "mustafa_ismail", "mahmoud_ali_al_banna", "mohammed_al_luhaidan",
]
BAD_AUDIO_HOSTS = {
    "youtube.com", "www.youtube.com", "youtu.be", "music.youtube.com",
    "drive.google.com", "docs.google.com", "dropbox.com", "www.dropbox.com",
}
AUDIO_EXTENSIONS = (".mp3", ".m4a", ".aac", ".ogg", ".opus", ".wav")
DIRECT_HOST_HINTS = (
    "mp3quran", "quranicaudio", "qurancdn", "quran.com", "tarteel",
    "everyayah", "way2quran", "tvquran", "archive.org", "archiveaudio",
)


def request_bytes(url: str, *, timeout: int = 90) -> bytes:
    req = urllib.request.Request(url, headers={
        "User-Agent": "quran-app-qud-sync/1.0",
        "Accept": "application/json, application/octet-stream;q=0.9, */*;q=0.8",
    })
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.read()


def request_json(url: str):
    return json.loads(request_bytes(url).decode("utf-8"))


def safe_https_audio_url(value: object) -> bool:
    try:
        parsed = urllib.parse.urlparse(str(value))
    except Exception:
        return False
    if parsed.scheme != "https" or not parsed.netloc or parsed.username or parsed.password:
        return False
    host = (parsed.hostname or "").lower()
    if host in BAD_AUDIO_HOSTS or any(host.endswith("." + bad) for bad in BAD_AUDIO_HOSTS):
        return False
    path = parsed.path.lower()
    return path.endswith(AUDIO_EXTENSIONS) or any(hint in host for hint in DIRECT_HOST_HINTS)


def candidate_score(slug: str, catalog: dict) -> tuple:
    preferred = next((i for i, part in enumerate(PREFERRED_SLUG_PARTS) if part in slug), 999)
    for token, rank in (("_qdc", 0), ("_mp3quran", 1), ("_tarteel", 2),
                        ("_way2quran", 3), ("_tvquran", 4), ("_archive", 5)):
        if token in slug:
            source_rank = rank
            break
    else:
        source_rank = 6
    style = str(catalog.get("style") or "").lower()
    style_rank = 0 if any(x in style for x in ("murattal", "mujawwad", "muallim", "tarteel")) else 1
    return (preferred, source_rank, style_rank, slug)


def reciter_identity(catalog: dict) -> str:
    rid = str(catalog.get("reciter_id") or "").strip()
    if rid:
        return "id:" + rid
    name = str(catalog.get("name_ar") or catalog.get("name_en") or catalog.get("slug") or "")
    normalized = re.sub(r"[^\w\u0600-\u06ff]+", "", name.casefold())
    return "name:" + normalized


def is_complete_streamable(slug: str, manifest_item: dict, catalog: dict) -> bool:
    tiers = manifest_item.get("tiers") or []
    coverage = catalog.get("coverage") or {}
    audio = catalog.get("audio") or {}
    chapter_urls = audio.get("chapter_urls") or {}
    riwayah = str(manifest_item.get("riwayah") or catalog.get("riwayah") or "hafs").lower()
    if riwayah != "hafs" or "word" not in tiers:
        return False
    if int(manifest_item.get("coverage_ayahs") or 0) != TOTAL_AYAHS:
        return False
    if int(coverage.get("ayahs") or 0) != TOTAL_AYAHS or int(coverage.get("surahs") or 0) != 114:
        return False
    if coverage.get("missing_surahs") or coverage.get("missing_verses"):
        return False
    if str(catalog.get("audio_category") or "") != "by_surah":
        return False
    if len(chapter_urls) != 114 or any(str(i) not in chapter_urls for i in range(1, 115)):
        return False
    if not all(safe_https_audio_url(chapter_urls[str(i)]) for i in range(1, 115)):
        return False
    if slug.startswith("mishary_rashid_al_afasy"):
        return False
    return True


def validate_word_document(slug: str, compressed: bytes) -> None:
    try:
        payload = json.loads(gzip.decompress(compressed).decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"{slug}: invalid word_timestamps.json.gz: {exc}") from exc
    meta = payload.get("_meta") or {}
    rows = payload.get("rows")
    if meta.get("schema_version") != 3 or meta.get("tier") != "word":
        raise RuntimeError(f"{slug}: unsupported timestamp schema/tier")
    if str(meta.get("riwayah") or "hafs").lower() != "hafs":
        raise RuntimeError(f"{slug}: non-Hafs timestamp document")
    if int(meta.get("verse_count") or 0) != TOTAL_AYAHS or not isinstance(rows, list):
        raise RuntimeError(f"{slug}: incomplete timestamp document")

    canonical = {}
    counts = Counter()
    for row in rows:
        if not (isinstance(row, list) and len(row) == 6 and row[3] is True):
            continue
        ref, start, end, _, _, words = row
        if not isinstance(ref, str) or not isinstance(words, list) or not words:
            raise RuntimeError(f"{slug}: malformed canonical row")
        if ref in canonical:
            raise RuntimeError(f"{slug}: duplicate canonical row for {ref}")
        try:
            surah_s, ayah_s = ref.split(":", 1)
            surah, ayah = int(surah_s), int(ayah_s)
        except Exception as exc:
            raise RuntimeError(f"{slug}: invalid verse key {ref!r}") from exc
        if not (1 <= surah <= 114 and 1 <= ayah <= VERSE_COUNTS[surah - 1]):
            raise RuntimeError(f"{slug}: out-of-range verse {ref}")
        if not (isinstance(start, int) and isinstance(end, int) and 0 <= start < end):
            raise RuntimeError(f"{slug}: invalid verse timing {ref}")
        for word in words:
            if not (isinstance(word, list) and len(word) == 3 and
                    all(isinstance(v, int) for v in word) and
                    word[0] >= 1 and start <= word[1] < word[2] <= end):
                raise RuntimeError(f"{slug}: invalid word timing {ref}")
        canonical[ref] = row
        counts[surah] += 1

    if len(canonical) != TOTAL_AYAHS:
        raise RuntimeError(f"{slug}: only {len(canonical)} canonical verses")
    for surah, expected in enumerate(VERSE_COUNTS, start=1):
        if counts[surah] != expected:
            raise RuntimeError(f"{slug}: surah {surah} has {counts[surah]}/{expected} canonical verses")


def extract_word_asset(slug: str, manifest_item: dict) -> bytes:
    zip_url = str(manifest_item.get("zip_url") or "")
    if not zip_url.startswith("https://github.com/"):
        raise RuntimeError(f"{slug}: unexpected zip URL")
    archive = request_bytes(zip_url, timeout=180)
    expected_sha = str(manifest_item.get("sha256") or "").lower()
    if expected_sha and hashlib.sha256(archive).hexdigest() != expected_sha:
        raise RuntimeError(f"{slug}: zip SHA-256 mismatch")
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        matches = [name for name in zf.namelist() if name.endswith("word_timestamps.json.gz")]
        if len(matches) != 1:
            raise RuntimeError(f"{slug}: expected one word_timestamps.json.gz, got {len(matches)}")
        compressed = zf.read(matches[0])
    validate_word_document(slug, compressed)
    return compressed


def patch_runtime_sources() -> None:
    quran = ROOT / "quran.html"
    text = quran.read_text(encoding="utf-8")
    marker = '    <script src="audio-downloads.js"></script>\n'
    addition = marker + '    <script src="data/qud/registry.js"></script>\n    <script src="qud-audio.js"></script>\n'
    if 'src="qud-audio.js"' not in text:
        if marker not in text:
            raise RuntimeError("quran.html audio-downloads marker not found")
        text = text.replace(marker, addition, 1)
        quran.write_text(text, encoding="utf-8")

    mushaf = ROOT / "mushaf-audio.js"
    text = mushaf.read_text(encoding="utf-8")
    text = text.replace(
        "let alignedDiscoveryStatus = 'جاري فحص القراء المتاح لهم تظليل الكلمات…';",
        "let alignedDiscoveryStatus = 'تظليل الكلمات مفعّل للقراء الموثقين بتوقيتات QUD، مع مشاري العفاسي كخيار احتياطي.';",
    )
    text = text.replace(
        "    loadAlignedReciters();\n})();",
        "    if (!window.QudAudioRegistry?.reciters?.length) loadAlignedReciters();\n})();",
    )
    mushaf.write_text(text, encoding="utf-8")

    sw = ROOT / "sw.js"
    text = sw.read_text(encoding="utf-8")
    text = re.sub(r"quran-reader-shell-v\d+", "quran-reader-shell-v12", text, count=1)
    needle = "    './audio-core.js', './audio-downloads.js', './offline-reciter-catalog.js',\n"
    replacement = "    './audio-core.js', './audio-downloads.js', './data/qud/registry.js', './qud-audio.js', './offline-reciter-catalog.js',\n"
    if "'./qud-audio.js'" not in text:
        if needle not in text:
            raise RuntimeError("sw.js audio shell marker not found")
        text = text.replace(needle, replacement, 1)
    sw.write_text(text, encoding="utf-8")

    sources = ROOT / "SOURCES.md"
    text = sources.read_text(encoding="utf-8") if sources.exists() else ""
    heading = "## Quranic Universal Audio (QUD)"
    if heading not in text:
        if text and not text.endswith("\n"):
            text += "\n"
        text += (
            "\n## Quranic Universal Audio (QUD)\n\n"
            f"- Word-level timing metadata is mirrored from `{QUD_REPO}` release `{QUD_TAG}`.\n"
            "- QUD timing data is licensed CC-BY-4.0. Audio is not redistributed by this app; "
            "the generated catalogs retain the upstream source URLs paired with those timings.\n"
            "- The build only includes complete Hafs recitations with word timing and 114 directly streamable HTTPS chapter URLs.\n"
        )
        sources.write_text(text, encoding="utf-8")


def write_registry(selected) -> None:
    reciters = []
    for index, (slug, _manifest_item, catalog) in enumerate(selected):
        reciters.append({
            "id": SYNTHETIC_ID_BASE + index,
            "slug": slug,
            "name": str(catalog.get("name_ar") or catalog.get("name_en") or slug),
            "name_en": str(catalog.get("name_en") or ""),
            "style": str(catalog.get("style") or ""),
            "channel": str(catalog.get("channel") or ""),
            "timingUrl": f"./data/qud/{slug}.word.json.gz",
            "catalogUrl": f"./data/qud/{slug}.catalog.json",
        })
    registry = {
        "schemaVersion": 1,
        "qudRelease": QUD_TAG,
        "license": "CC-BY-4.0",
        "reciterCount": len(reciters),
        "reciters": reciters,
    }
    js = ("// Generated by scripts/sync_qud_audio.py. Do not edit by hand.\n" +
          "window.QudAudioRegistry = Object.freeze(" +
          json.dumps(registry, ensure_ascii=False, separators=(",", ":")) + ");\n")
    (OUT_DIR / "registry.js").write_text(js, encoding="utf-8")
    (OUT_DIR / "manifest.json").write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> int:
    global OUT_DIR
    print(f"Fetching QUD {QUD_TAG} metadata…", flush=True)
    release = request_json(RELEASE_API)
    assets = {item.get("name"): item for item in release.get("assets", [])}
    manifest_asset = assets.get("manifest.json")
    catalog_asset = assets.get("catalog.json")
    if not manifest_asset or not catalog_asset:
        raise RuntimeError("QUD release is missing manifest.json/catalog.json")
    manifest = request_json(manifest_asset["browser_download_url"])
    release_catalog = request_json(catalog_asset["browser_download_url"])
    if manifest.get("schema_version") != 3 or release_catalog.get("schema_version") != 3:
        raise RuntimeError("Unsupported QUD release schema")

    catalog_by_slug = {item.get("slug"): item for item in release_catalog.get("recitations", []) if item.get("slug")}
    candidates = []
    for slug, manifest_item in (manifest.get("recitations") or {}).items():
        catalog = catalog_by_slug.get(slug)
        if catalog and is_complete_streamable(slug, manifest_item, catalog):
            candidates.append((slug, manifest_item, catalog))

    best_by_identity = {}
    for item in candidates:
        slug, _manifest_item, catalog = item
        identity = reciter_identity(catalog)
        current = best_by_identity.get(identity)
        if current is None or candidate_score(slug, catalog) < candidate_score(current[0], current[2]):
            best_by_identity[identity] = item
    candidates = sorted(best_by_identity.values(), key=lambda item: candidate_score(item[0], item[2]))
    if len(candidates) < MIN_RECITERS:
        hosts = Counter()
        for item in release_catalog.get("recitations", []):
            for url in (item.get("audio") or {}).get("chapter_urls", {}).values():
                hosts[urllib.parse.urlparse(str(url)).hostname or ""] += 1
        raise RuntimeError(
            f"Only {len(candidates)} complete Hafs word-synced direct-audio reciters found; need {MIN_RECITERS}. "
            f"Top audio hosts: {hosts.most_common(12)}"
        )
    selected = candidates[:MAX_RECITERS]
    print(f"Selected {len(selected)} unique synchronized reciters.", flush=True)

    temp = OUT_DIR.with_name("qud.tmp")
    if temp.exists():
        shutil.rmtree(temp)
    temp.mkdir(parents=True, exist_ok=True)
    old_out = OUT_DIR
    OUT_DIR = temp
    try:
        for i, (slug, manifest_item, catalog) in enumerate(selected, start=1):
            print(f"[{i}/{len(selected)}] {slug}", flush=True)
            compressed = extract_word_asset(slug, manifest_item)
            (OUT_DIR / f"{slug}.word.json.gz").write_bytes(compressed)
            compact_catalog = {
                "schema_version": 1,
                "slug": slug,
                "name_ar": catalog.get("name_ar"),
                "name_en": catalog.get("name_en"),
                "style": catalog.get("style"),
                "channel": catalog.get("channel"),
                "audio": {
                    "chapter_urls": (catalog.get("audio") or {}).get("chapter_urls") or {},
                    "chapter_offsets_ms": (catalog.get("audio") or {}).get("chapter_offsets_ms") or {},
                },
            }
            (OUT_DIR / f"{slug}.catalog.json").write_text(
                json.dumps(compact_catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )
        write_registry(selected)
        if old_out.exists():
            shutil.rmtree(old_out)
        temp.rename(old_out)
        OUT_DIR = old_out
    except Exception:
        OUT_DIR = old_out
        shutil.rmtree(temp, ignore_errors=True)
        raise

    patch_runtime_sources()
    print("Synchronized reciters:")
    for slug, _, catalog in selected:
        print(f" - {catalog.get('name_ar') or catalog.get('name_en') or slug} [{slug}]")
    print(f"DONE: {len(selected)} reciters, all complete Hafs + word timestamps + 114 streamable chapters.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
