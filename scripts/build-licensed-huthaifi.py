#!/usr/bin/env python3
"""Build a rights-cleared, QUD-word-synchronized offline MP3Quran reader.

Source: MP3Quran's *exact* Ali al-Huthaifi MP3 chapter URLs from QUD v3.2.0.
Rights: https://www.mp3quran.net/ar/privacy (copying site materials permitted).
QUD timing: CC BY 4.0. Do not switch URL/edition independently of timings.
This never downloads Quran Foundation or EveryAyah recordings.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "data/qud/ali_al_huthaifi_mp3quran.catalog.json"
TIMING = ROOT / "data/qud/ali_al_huthaifi_mp3quran.word.json.gz"
ALLOWED_HOST = "server9.mp3quran.net"
ALLOWED_PATH = "/hthfi/"
VERSE_COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
    112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
    59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,
    52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,
    21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]


def sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as source:
        for block in iter(lambda: source.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def probe_duration(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=True, capture_output=True, text=True)
    return float(result.stdout.strip())


def validate_source():
    from urllib.parse import urlsplit
    catalog = json.loads(SOURCE.read_text(encoding="utf-8"))
    with gzip.open(TIMING, "rt", encoding="utf-8") as handle:
        alignment = json.load(handle)
    assert catalog["slug"] == "ali_al_huthaifi_mp3quran"
    assert alignment["_meta"]["schema_version"] == 3 and alignment["_meta"]["tier"] == "word"
    urls = catalog["audio"]["chapter_urls"]
    assert len(urls) == 114
    assert sum(VERSE_COUNTS) == 6236
    assert len(alignment["rows"]) >= 6236
    last_end = {}
    verse_seen = {}
    for row in alignment["rows"]:
        if not isinstance(row, list) or len(row) != 6 or row[3] is not True:
            continue
        match = re.fullmatch(r"(\d+):(\d+)", str(row[0]))
        if not match: continue
        surah, ayah = map(int, match.groups())
        if not (1 <= surah <= 114 and 1 <= ayah <= VERSE_COUNTS[surah-1]): continue
        start, end, words = row[1], row[2], row[5]
        if not isinstance(words, list) or not words or start < 0 or end <= start:
            continue
        if not all(isinstance(word, list) and len(word) >= 3 and
                   isinstance(word[1], (int,float)) and isinstance(word[2], (int,float)) and
                   word[2] > word[1] >= 0 for word in words):
            continue
        verse_seen[(surah, ayah)] = True
        last_end[surah] = max(end, last_end.get(surah, 0))
    assert len(verse_seen) == 6236, f"Word-timing data incomplete: {len(verse_seen)}/6236"
    for surah in range(1,115):
        expected = f"https://{ALLOWED_HOST}{ALLOWED_PATH}{surah:03}.mp3"
        assert urls[str(surah)] == expected, f"Source recording unexpectedly changed: {surah}"
    return urls, last_end


def download(url, destination):
    if destination.is_file() and destination.stat().st_size > 1024:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(4):
        temporary = destination.with_suffix(".partial")
        try:
            request = urllib.request.Request(url, headers={"User-Agent":"Ayat-Quran-App/1.0"})
            with urllib.request.urlopen(request, timeout=120) as response, open(temporary, "wb") as output:
                while True:
                    chunk = response.read(1 << 20)
                    if not chunk: break
                    output.write(chunk)
            assert temporary.stat().st_size > 1024
            with open(temporary, "rb") as f:
                assert f.read(3) == b"ID3" or f.seek(0) == 0
            os.replace(temporary, destination)
            return
        except Exception:
            temporary.unlink(missing_ok=True)
            if attempt == 3: raise
            time.sleep(2 * (attempt + 1))


def encode_one(surah, urls, last_end, source_cache, destination, bitrate):
    original = source_cache / f"{surah:03}.mp3"
    encoded = destination / f"{surah:03}.webm"
    download(urls[str(surah)], original)
    original_duration = probe_duration(original)
    # QUD timestamp rows are derived from this exact source recording.
    if last_end[surah] > original_duration * 1000 + 1500:
        raise RuntimeError(f"QUD word timings exceed original audio length: {surah}")
    if not encoded.is_file() or encoded.stat().st_size < 1024:
        subprocess.run(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
            "-y", "-i", str(original), "-vn", "-ac", "1",
            "-c:a", "libopus", "-b:a", bitrate, "-application", "audio",
            "-vbr", "on", "-compression_level", "5", "-map_metadata", "-1",
            str(encoded)], check=True)
    output_duration = probe_duration(encoded)
    if abs(original_duration - output_duration) > 0.7:
        raise RuntimeError(f"Duration drift on surah {surah}: {original_duration} -> {output_duration}")
    return {
        "surah": surah,
        "file": encoded.name,
        "url": urls[str(surah)],
        "bytes": encoded.stat().st_size,
        "sha256": sha256(encoded),
        "durationMs": round(output_duration*1000)
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="www/offline/huthaifi")
    parser.add_argument("--cache", default=".build-cache/huthaifi-mp3quran")
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--bitrate", default="32k")
    args = parser.parse_args()
    if args.jobs < 1 or args.jobs > 4: parser.error("jobs must be 1..4")
    urls, last_end = validate_source()
    destination = Path(args.output)
    destination.mkdir(parents=True, exist_ok=True)
    source_cache = Path(args.cache)
    source_cache.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as pool:
        futures = {
            pool.submit(encode_one, surah, urls, last_end, source_cache, destination, args.bitrate): surah
            for surah in range(1,115)
        }
        tracks = []
        for future in concurrent.futures.as_completed(futures):
            track = future.result()
            tracks.append(track)
            print(f"Licensed MP3Quran + QUD: surah {track['surah']:03} validated", flush=True)
    tracks.sort(key=lambda item: item["surah"])
    assert len(tracks) == 114 and {t["surah"] for t in tracks} == set(range(1,115))
    manifest = {
        "schemaVersion": 1,
        "syncLevel": "word",
        "audioCodec": "opus",
        "audioContainer": "webm",
        "reciter": {"id": 9004, "name": "علي بن عبد الرحمن الحذيفي"},
        "source": "MP3Quran / ali_al_huthaifi_mp3quran",
        "rightsUrl": "https://www.mp3quran.net/ar/privacy",
        "timingSource": "QUD v3.2.0 (CC BY 4.0)",
        "timingSlug": "ali_al_huthaifi_mp3quran",
        "tracks": tracks
    }
    (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",",":")),encoding="utf-8")
    print("Validated licensed MP3Quran Huthaifi corpus: 114 surahs; QUD words: 6236 verses; size",
          sum(t["bytes"] for t in tracks)//(1024*1024), "MiB", flush=True)


if __name__ == "__main__":
    main()
