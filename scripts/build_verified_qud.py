#!/usr/bin/env python3
"""Build the final stable synchronized-reciter bundle used by the mushaf.

Policy:
- Keep the existing Quran Foundation Mishary reader (id 7).
- Add one best recording per unique sheikh from QUD.
- Accept only complete Hafs recitations (6236 ayahs / 114 surahs) with word
  timestamps and 114 direct HTTPS chapter-audio URLs.
- Exclude YouTube/Google Drive page sources and duplicate recordings of the same
  sheikh. The separate recitations page keeps the full MP3Quran catalog.
"""
from __future__ import annotations

import gzip
import hashlib
import io
import json
import re
import shutil
import sys
import zipfile
from collections import Counter

import sync_qud_audio as base

ROOT = base.ROOT
FINAL_TOTAL = 20  # 1 built-in Mishary + 19 unique QUD sheikhs verified below.
TOTAL_AYAHS = 6236


def select_unique_verified(manifest: dict, release_catalog: dict):
    catalog_by_slug = {
        item.get("slug"): item
        for item in release_catalog.get("recitations", [])
        if item.get("slug")
    }
    candidates = []
    for slug, manifest_item in (manifest.get("recitations") or {}).items():
        catalog = catalog_by_slug.get(slug)
        if catalog and base.is_complete_streamable(slug, manifest_item, catalog):
            candidates.append((slug, manifest_item, catalog))

    best_by_sheikh = {}
    for item in candidates:
        slug, _manifest_item, catalog = item
        identity = base.reciter_identity(catalog)
        current = best_by_sheikh.get(identity)
        if current is None or base.candidate_score(slug, catalog) < base.candidate_score(current[0], current[2]):
            best_by_sheikh[identity] = item

    selected = sorted(
        best_by_sheikh.values(),
        key=lambda item: base.candidate_score(item[0], item[2]),
    )
    expected_qud = FINAL_TOTAL - 1
    if len(selected) != expected_qud:
        raise RuntimeError(
            f"QUD release changed: expected {expected_qud} unique complete direct word-synced sheikhs, "
            f"found {len(selected)}. Review before shipping instead of silently changing the app catalog."
        )
    return selected


def validate_official_word_schema(slug: str, compressed: bytes) -> dict:
    """Validate the public QUD v3 WordTimestamps schema and full Quran coverage.

    QUD deliberately allows word spans to touch or slightly cross the enclosing
    verse occurrence boundary. The runtime clips highlighting to the active verse,
    so rejecting such a row is stricter than QUD's own schema and would discard
    otherwise valid reviewed timing data.
    """
    try:
        payload = json.loads(gzip.decompress(compressed).decode("utf-8"))
    except Exception as exc:
        raise RuntimeError(f"{slug}: invalid word_timestamps.json.gz: {exc}") from exc

    meta = payload.get("_meta") or {}
    rows = payload.get("rows")
    if meta.get("schema_version") != 3 or meta.get("tier") != "word":
        raise RuntimeError(f"{slug}: unsupported word timestamp schema")
    if str(meta.get("riwayah") or "hafs").lower() != "hafs":
        raise RuntimeError(f"{slug}: timings are not Hafs")
    if int(meta.get("verse_count") or 0) != TOTAL_AYAHS or not isinstance(rows, list):
        raise RuntimeError(f"{slug}: incomplete word timestamp document")

    canonical = {}
    per_surah = Counter()
    for row in rows:
        if not (isinstance(row, list) and len(row) == 6):
            raise RuntimeError(f"{slug}: malformed occurrence row")
        ref, start, end, is_canonical, silence_after, words = row
        match = re.fullmatch(r"([1-9]\d{0,2}):([1-9]\d{0,2})", str(ref or ""))
        if not match:
            raise RuntimeError(f"{slug}: invalid verse ref {ref!r}")
        if not (isinstance(start, int) and not isinstance(start, bool) and
                isinstance(end, int) and not isinstance(end, bool) and end >= start and
                isinstance(is_canonical, bool) and isinstance(silence_after, int) and
                not isinstance(silence_after, bool) and silence_after >= 0 and isinstance(words, list)):
            raise RuntimeError(f"{slug}: invalid occurrence prefix {ref}")
        for word in words:
            if not (isinstance(word, list) and len(word) == 3 and
                    all(isinstance(value, int) and not isinstance(value, bool) for value in word)):
                raise RuntimeError(f"{slug}: invalid word tuple {ref}")
        if not is_canonical:
            continue
        surah, ayah = int(match.group(1)), int(match.group(2))
        if not (1 <= surah <= 114 and 1 <= ayah <= base.VERSE_COUNTS[surah - 1]):
            raise RuntimeError(f"{slug}: canonical ref outside Quran range {ref}")
        if ref in canonical:
            raise RuntimeError(f"{slug}: duplicate canonical occurrence {ref}")
        if not words:
            raise RuntimeError(f"{slug}: canonical verse has no word timings {ref}")
        canonical[ref] = row
        per_surah[surah] += 1

    if len(canonical) != TOTAL_AYAHS:
        raise RuntimeError(f"{slug}: {len(canonical)}/{TOTAL_AYAHS} canonical verses")
    for surah, expected in enumerate(base.VERSE_COUNTS, start=1):
        if per_surah[surah] != expected:
            raise RuntimeError(f"{slug}: surah {surah} has {per_surah[surah]}/{expected} canonical verses")
    return payload


def extract_verified_word_asset(slug: str, manifest_item: dict) -> bytes:
    zip_url = str(manifest_item.get("zip_url") or "")
    if not zip_url.startswith("https://github.com/"):
        raise RuntimeError(f"{slug}: unexpected release zip URL")
    archive = base.request_bytes(zip_url, timeout=180)
    expected_sha = str(manifest_item.get("sha256") or "").lower()
    if expected_sha and hashlib.sha256(archive).hexdigest() != expected_sha:
        raise RuntimeError(f"{slug}: release zip SHA-256 mismatch")
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        matches = [name for name in zf.namelist() if name.endswith("word_timestamps.json.gz")]
        if len(matches) != 1:
            raise RuntimeError(f"{slug}: expected one word timestamp asset, got {len(matches)}")
        compressed = zf.read(matches[0])
    validate_official_word_schema(slug, compressed)
    return compressed


def write_registry(out_dir, selected):
    reciters = []
    for index, (slug, _manifest_item, catalog) in enumerate(selected):
        reciters.append({
            "id": base.SYNTHETIC_ID_BASE + index,
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
        "qudRelease": base.QUD_TAG,
        "license": "CC-BY-4.0",
        "reciterCount": 1 + len(reciters),
        "builtInReciters": 1,
        "qudReciterCount": len(reciters),
        "reciters": reciters,
    }
    if registry["reciterCount"] != FINAL_TOTAL:
        raise RuntimeError("generated synchronized reciter count is not final/stable")

    js = (
        "// Generated by scripts/build_verified_qud.py. Do not edit by hand.\n"
        "window.QudAudioRegistry = Object.freeze("
        + json.dumps(registry, ensure_ascii=False, separators=(",", ":"))
        + ");\n"
    )
    (out_dir / "registry.js").write_text(js, encoding="utf-8")
    (out_dir / "manifest.json").write_text(
        json.dumps(registry, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    print(f"Reading QUD {base.QUD_TAG} release metadata…", flush=True)
    release = base.request_json(base.RELEASE_API)
    assets = {item.get("name"): item for item in release.get("assets", [])}
    manifest_asset = assets.get("manifest.json")
    catalog_asset = assets.get("catalog.json")
    if not manifest_asset or not catalog_asset:
        raise RuntimeError("QUD release is missing manifest.json/catalog.json")

    manifest = base.request_json(manifest_asset["browser_download_url"])
    release_catalog = base.request_json(catalog_asset["browser_download_url"])
    if manifest.get("schema_version") != 3 or release_catalog.get("schema_version") != 3:
        raise RuntimeError("unsupported QUD release schema")

    selected = select_unique_verified(manifest, release_catalog)
    print(f"Selected {len(selected)} unique QUD sheikhs + built-in Mishary = {FINAL_TOTAL} synchronized readers.", flush=True)

    final_dir = ROOT / "data" / "qud"
    temp_dir = ROOT / "data" / "qud.tmp"
    shutil.rmtree(temp_dir, ignore_errors=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    old_out = base.OUT_DIR
    try:
        base.OUT_DIR = temp_dir
        for index, (slug, manifest_item, catalog) in enumerate(selected, start=1):
            display = catalog.get("name_ar") or catalog.get("name_en") or slug
            print(f"[{index:02d}/{len(selected)}] validating {display} ({slug})", flush=True)
            compressed = extract_verified_word_asset(slug, manifest_item)
            (temp_dir / f"{slug}.word.json.gz").write_bytes(compressed)
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
            (temp_dir / f"{slug}.catalog.json").write_text(
                json.dumps(compact_catalog, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8",
            )

        write_registry(temp_dir, selected)
        if final_dir.exists():
            shutil.rmtree(final_dir)
        temp_dir.rename(final_dir)
    except Exception:
        shutil.rmtree(temp_dir, ignore_errors=True)
        raise
    finally:
        base.OUT_DIR = old_out

    # Patch the runtime only after every mirrored timing asset passed validation.
    base.patch_runtime_sources()

    names = [item[2].get("name_ar") or item[2].get("name_en") or item[0] for item in selected]
    print("FINAL QUD SHEIKHS:")
    for name in names:
        print(f" - {name}")
    print(f"DONE: {FINAL_TOTAL} unique synchronized mushaf readers.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
