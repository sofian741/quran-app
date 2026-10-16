#!/usr/bin/env python3
"""Build the final synchronized mushaf-reciter bundle.

QUD supplies mirrored CC-BY-4.0 word timings for direct chapter audio. When QUD
has fewer than the target number of unique sheikhs, this script fills the gap
with Quran Foundation chapter reciters only after checking all 114 chapters and
word segments through the same public endpoint the app uses at runtime.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

import sync_qud_audio as base

ROOT = base.ROOT
OUT_DIR = base.OUT_DIR
QF_BASE = "https://api.quran.com/api/v4"
TARGET_TOTAL = 24  # includes built-in Mishary id 7
MAX_QF_EXTRAS = 8
QF_SAMPLE_SURAHS = (1, 2, 18, 36, 55, 114)


def norm_name(value: object) -> str:
    text = str(value or "").casefold()
    text = re.sub(r"[\u064b-\u065f\u0670]", "", text)
    text = text.translate(str.maketrans("أإآٱىة", "اااايه"))
    return re.sub(r"[^\w\u0600-\u06ff]+", "", text)


def qf_trusted_url(value: object) -> bool:
    try:
        url = urllib.parse.urlparse(str(value))
    except Exception:
        return False
    if url.scheme != "https" or not url.hostname:
        return False
    host = url.hostname.lower()
    return host == "download.quranicaudio.com" or host.endswith(".qurancdn.com") or host.endswith(".quran.com")


def validate_qf_chapter(reciter_id: int, surah: int) -> dict:
    payload = base.request_json(f"{QF_BASE}/chapter_recitations/{reciter_id}/{surah}?segments=true")
    file = payload.get("audio_file") or {}
    if int(file.get("chapter_id") or 0) != surah or not qf_trusted_url(file.get("audio_url")):
        raise RuntimeError(f"QF {reciter_id}/{surah}: bad chapter audio")
    timestamps = file.get("timestamps")
    expected = base.VERSE_COUNTS[surah - 1]
    if not isinstance(timestamps, list) or len(timestamps) != expected:
        raise RuntimeError(f"QF {reciter_id}/{surah}: {len(timestamps or [])}/{expected} verses")
    seen = set()
    for item in timestamps:
        match = re.fullmatch(r"(\d+):(\d+)", str(item.get("verse_key") or ""))
        if not match or int(match.group(1)) != surah:
            raise RuntimeError(f"QF {reciter_id}/{surah}: invalid verse key")
        ayah = int(match.group(2))
        start, end = item.get("timestamp_from"), item.get("timestamp_to")
        segments = item.get("segments")
        if ayah in seen or not isinstance(start, (int, float)) or not isinstance(end, (int, float)) or start < 0 or end <= start:
            raise RuntimeError(f"QF {reciter_id}/{surah}:{ayah}: invalid verse timing")
        if not isinstance(segments, list) or not segments:
            raise RuntimeError(f"QF {reciter_id}/{surah}:{ayah}: missing word segments")
        for seg in segments:
            if not (isinstance(seg, list) and len(seg) == 3 and isinstance(seg[0], int) and seg[0] >= 1 and
                    isinstance(seg[1], (int, float)) and isinstance(seg[2], (int, float)) and
                    seg[1] >= start and seg[2] > seg[1] and seg[2] <= end):
                raise RuntimeError(f"QF {reciter_id}/{surah}:{ayah}: invalid word segment")
        seen.add(ayah)
    if seen != set(range(1, expected + 1)):
        raise RuntimeError(f"QF {reciter_id}/{surah}: missing ayahs")
    return payload


def verify_qf_reciter(reciter: dict) -> dict | None:
    rid = int(reciter.get("id") or 0)
    name = str(reciter.get("name") or reciter.get("translated_name", {}).get("name") or "").strip()
    if rid <= 0 or rid == 7 or not name:
        return None
    try:
        for surah in QF_SAMPLE_SURAHS:
            validate_qf_chapter(rid, surah)
    except Exception as exc:
        print(f"QF skip sample {rid} {name}: {exc}", flush=True)
        return None

    print(f"QF full verification: {rid} {name}", flush=True)
    errors = []
    remaining = [s for s in range(1, 115) if s not in QF_SAMPLE_SURAHS]
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(validate_qf_chapter, rid, surah): surah for surah in remaining}
        for future in as_completed(futures):
            try:
                future.result()
            except Exception as exc:
                errors.append((futures[future], str(exc)))
                for other in futures:
                    other.cancel()
                break
    if errors:
        print(f"QF reject {rid} {name}: {errors[0]}", flush=True)
        return None
    print(f"QF verified all 114: {rid} {name}", flush=True)
    return {"id": rid, "name": name, "label": f"{name} • تظليل الكلمات", "provider": "quran-foundation"}


def discover_qf(excluded_names: set[str], needed: int) -> list[dict]:
    if needed <= 0:
        return []
    try:
        payload = base.request_json(f"{QF_BASE}/resources/chapter_reciters?language=ar")
    except Exception as exc:
        print(f"QF catalog unavailable: {exc}", flush=True)
        return []
    raw = payload.get("reciters") if isinstance(payload, dict) else None
    if not isinstance(raw, list):
        print("QF catalog returned no reciters", flush=True)
        return []

    priority_tokens = [
        "عبد الرحمن السديس", "ماهر المعيقلي", "ياسر الدوسري", "سعود الشريم",
        "عبد الباسط", "المنشاوي", "الحصري", "سعد الغامدي", "أحمد العجمي",
        "فارس عباد", "أبو بكر الشاطري", "ناصر القطامي",
    ]
    def score(item):
        name = str(item.get("name") or item.get("translated_name", {}).get("name") or "")
        normalized = norm_name(name)
        p = next((i for i, token in enumerate(priority_tokens) if norm_name(token) in normalized), 999)
        return (p, int(item.get("id") or 99999))

    verified = []
    for item in sorted(raw, key=score):
        if len(verified) >= min(needed, MAX_QF_EXTRAS):
            break
        name = str(item.get("name") or item.get("translated_name", {}).get("name") or "")
        if not name or norm_name(name) in excluded_names:
            continue
        result = verify_qf_reciter(item)
        if result:
            verified.append(result)
            excluded_names.add(norm_name(result["name"]))
    return verified


def select_qud(release_manifest: dict, release_catalog: dict):
    catalog_by_slug = {x.get("slug"): x for x in release_catalog.get("recitations", []) if x.get("slug")}
    candidates = []
    for slug, manifest_item in (release_manifest.get("recitations") or {}).items():
        catalog = catalog_by_slug.get(slug)
        if catalog and base.is_complete_streamable(slug, manifest_item, catalog):
            candidates.append((slug, manifest_item, catalog))
    best = {}
    for item in candidates:
        slug, _, catalog = item
        ident = base.reciter_identity(catalog)
        old = best.get(ident)
        if old is None or base.candidate_score(slug, catalog) < base.candidate_score(old[0], old[2]):
            best[ident] = item
    selected = sorted(best.values(), key=lambda item: base.candidate_score(item[0], item[2]))
    print(f"QUD direct complete unique sheikhs: {len(selected)}", flush=True)
    return selected


def write_registry(qud_selected, qf_reciters):
    qud = []
    for index, (slug, _, catalog) in enumerate(qud_selected):
        qud.append({
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
        "schemaVersion": 2,
        "qudRelease": base.QUD_TAG,
        "license": "CC-BY-4.0",
        "reciterCount": 1 + len(qud) + len(qf_reciters),
        "qudReciterCount": len(qud),
        "qfReciterCount": 1 + len(qf_reciters),
        "reciters": qud,
        "qfReciters": qf_reciters,
    }
    js = ("// Generated by scripts/sync_final_reciters.py. Do not edit by hand.\n" +
          "window.QudAudioRegistry = Object.freeze(" +
          json.dumps(registry, ensure_ascii=False, separators=(",", ":")) + ");\n")
    (base.OUT_DIR / "registry.js").write_text(js, encoding="utf-8")
    (base.OUT_DIR / "manifest.json").write_text(json.dumps(registry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def patch_extra_runtime():
    quran = ROOT / "quran.html"
    text = quran.read_text(encoding="utf-8")
    marker = '    <script src="qud-audio.js"></script>\n'
    addition = marker + '    <script src="chapter-reciter-extras.js"></script>\n'
    if 'src="chapter-reciter-extras.js"' not in text:
        if marker not in text:
            raise RuntimeError("quran.html QUD runtime marker missing")
        text = text.replace(marker, addition, 1)
        quran.write_text(text, encoding="utf-8")

    sw = ROOT / "sw.js"
    text = sw.read_text(encoding="utf-8")
    if "'./chapter-reciter-extras.js'" not in text:
        text = text.replace("'./qud-audio.js',", "'./qud-audio.js', './chapter-reciter-extras.js',", 1)
    text = re.sub(r"quran-reader-shell-v\d+", "quran-reader-shell-v11", text, count=1)
    sw.write_text(text, encoding="utf-8")


def main():
    release = base.request_json(base.RELEASE_API)
    assets = {item.get("name"): item for item in release.get("assets", [])}
    manifest = base.request_json(assets["manifest.json"]["browser_download_url"])
    catalog = base.request_json(assets["catalog.json"]["browser_download_url"])
    if manifest.get("schema_version") != 3 or catalog.get("schema_version") != 3:
        raise RuntimeError("unsupported QUD schema")

    qud_selected = select_qud(manifest, catalog)
    excluded = {norm_name(item[2].get("name_ar") or item[2].get("name_en")) for item in qud_selected}
    excluded.add(norm_name("مشاري راشد العفاسي"))
    needed_qf = max(0, TARGET_TOTAL - (1 + len(qud_selected)))
    qf_reciters = discover_qf(excluded, needed_qf)
    total = 1 + len(qud_selected) + len(qf_reciters)
    if total < 21:
        raise RuntimeError(f"only {total} fully verified synchronized sheikhs; need at least 21")
    print(f"Final synchronized mushaf readers: {total} = 1 built-in + {len(qud_selected)} QUD + {len(qf_reciters)} QF extras", flush=True)

    temp = OUT_DIR.with_name("qud.tmp")
    shutil.rmtree(temp, ignore_errors=True)
    temp.mkdir(parents=True, exist_ok=True)
    old_out = base.OUT_DIR
    base.OUT_DIR = temp
    try:
        for i, (slug, manifest_item, cat) in enumerate(qud_selected, 1):
            print(f"QUD [{i}/{len(qud_selected)}] {slug}", flush=True)
            compressed = base.extract_word_asset(slug, manifest_item)
            (temp / f"{slug}.word.json.gz").write_bytes(compressed)
            compact = {
                "schema_version": 1, "slug": slug,
                "name_ar": cat.get("name_ar"), "name_en": cat.get("name_en"),
                "style": cat.get("style"), "channel": cat.get("channel"),
                "audio": {
                    "chapter_urls": (cat.get("audio") or {}).get("chapter_urls") or {},
                    "chapter_offsets_ms": (cat.get("audio") or {}).get("chapter_offsets_ms") or {},
                },
            }
            (temp / f"{slug}.catalog.json").write_text(json.dumps(compact, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        write_registry(qud_selected, qf_reciters)
        if OUT_DIR.exists():
            shutil.rmtree(OUT_DIR)
        temp.rename(OUT_DIR)
    finally:
        base.OUT_DIR = old_out
        shutil.rmtree(temp, ignore_errors=True)

    base.patch_runtime_sources()
    patch_extra_runtime()
    print("Verified QF extras:", ", ".join(x["name"] for x in qf_reciters) or "none")
    print(f"DONE total={total}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise
