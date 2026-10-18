#!/usr/bin/env python3
"""Bundle the official MP3Quran Mishary Hafs recording into an Android web build.

Source: https://server8.mp3quran.net/afs/ (114 chapters).
Publisher's reuse notice: https://www.mp3quran.net/privacy-en.html

No audio bytes are committed to GitHub. The manual Android build fetches, checks,
transcodes at a speech-friendly mono bitrate, and embeds every chapter.
A partial/incomplete corpus makes the build fail.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen

SOURCE = "https://server8.mp3quran.net/afs/"
API = "https://www.mp3quran.net/api/v3/reciters?language=ar"
ALL_SURAHS = list(range(1, 115))
MIN_AUDIO_BYTES = 20_000

def http_open(url, timeout=90):
    request = Request(url, headers={"User-Agent": "NoorAlQuranOfflineAudio/1.0"})
    result = urlopen(request, timeout=timeout)
    parsed = urlparse(result.url)
    if parsed.scheme != "https" or not (parsed.hostname == "mp3quran.net" or parsed.hostname.endswith(".mp3quran.net")):
        result.close()
        raise ValueError("Unexpected audio/API redirect: " + result.url)
    return result

def read_reciter_metadata():
    # MP3Quran's own catalog supplies the same ID used by the online player.
    # A stable non-conflicting offline ID lets the complete corpus work when
    # their API is temporarily unavailable.
    reader_id = 910001
    moshaf_id = 910001
    try:
        with http_open(API, timeout=25) as response:
            payload = json.load(response)
        for reader in payload.get("reciters", []):
            name = str(reader.get("name", ""))
            if "العفاسي" not in name and "alafasy" not in name.lower():
                continue
            for moshaf in reader.get("moshaf", []):
                server = str(moshaf.get("server", "")).rstrip("/") + "/"
                numbers = {int(n) for n in str(moshaf.get("surah_list", "")).split(",") if n.strip().isdigit()}
                if server == SOURCE and numbers == set(ALL_SURAHS):
                    return int(reader["id"]), int(moshaf["id"])
    except Exception as exc:
        print("MP3Quran catalog not available, using self-contained IDs:", exc, file=sys.stderr)
    return reader_id, moshaf_id

def check_mp3(path):
    if not path.is_file() or path.stat().st_size < MIN_AUDIO_BYTES:
        raise ValueError("Empty or truncated MP3: " + str(path))
    with path.open("rb") as stream:
        head = stream.read(10)
    if not (head.startswith(b"ID3") or (head[0] == 0xff and head[1] & 0xe0 == 0xe0)):
        raise ValueError("Invalid MP3 signature: " + str(path))

def fetch_one(surah, raw_dir, retries=4):
    file_name = f"{surah:03}.mp3"
    target = raw_dir / file_name
    if target.is_file():
        try:
            check_mp3(target)
            return target
        except ValueError:
            target.unlink()
    url = SOURCE + file_name
    for attempt in range(1, retries + 1):
        temp = target.with_suffix(".part")
        try:
            with http_open(url, timeout=120) as response, temp.open("wb") as output:
                if response.status != 200:
                    raise OSError(f"Unexpected HTTP {response.status}")
                while True:
                    data = response.read(1024 * 1024)
                    if not data:
                        break
                    output.write(data)
            check_mp3(temp)
            temp.replace(target)
            print(f"downloaded {file_name}: {target.stat().st_size:,} bytes", flush=True)
            return target
        except Exception as exc:
            temp.unlink(missing_ok=True)
            if attempt == retries:
                raise RuntimeError(f"Failed {file_name}: {exc}") from exc
            time.sleep(attempt * 3)

def transcode_one(surah, raw_dir, output_dir, bitrate):
    file_name = f"{surah:03}.mp3"
    destination = output_dir / file_name
    if destination.exists():
        check_mp3(destination)
        return destination
    source = raw_dir / file_name
    temporary = output_dir / f"{surah:03}.temporary.mp3"
    subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(source), "-map", "0:a:0", "-vn", "-map_metadata", "-1",
        "-ac", "1", "-ar", "44100", "-c:a", "libmp3lame",
        "-b:a", bitrate, str(temporary)
    ], check=True, timeout=900)
    check_mp3(temporary)
    duration = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(temporary)
    ], text=True, timeout=20).strip()
    if float(duration) < 5:
        raise ValueError(f"Implausible duration: {file_name}: {duration}")
    temporary.replace(destination)
    return destination

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="www/offline/mishary")
    parser.add_argument("--cache", default=".build-cache/mishary-raw")
    parser.add_argument("--bitrate", default="48k", choices=("48k", "64k"))
    parser.add_argument("--workers", type=int, default=6)
    args = parser.parse_args()
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        sys.exit("Install ffmpeg/ffprobe to package the Mishary recording")
    output = Path(args.output)
    cache = Path(args.cache)
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    # An old output manifest must never mask an incomplete new build.
    (output / "manifest.json").unlink(missing_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(8, args.workers))) as pool:
        list(pool.map(lambda n: fetch_one(n, cache), ALL_SURAHS))
    # Use bounded encoding concurrency to limit memory/CPU on CI machines.
    tracks = []
    for surah in ALL_SURAHS:
        packaged = transcode_one(surah, cache, output, args.bitrate)
        raw = packaged.read_bytes()
        tracks.append({
            "surah": surah, "file": f"{surah:03}.mp3",
            "url": SOURCE + f"{surah:03}.mp3",
            "bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest()
        })
        if surah % 10 == 0 or surah == 114:
            print(f"encoded {surah}/114 surahs", flush=True)

    if len(tracks) != 114 or {t["surah"] for t in tracks} != set(ALL_SURAHS):
        sys.exit("Incomplete Mishary audio set: refusing to publish")
    reader_id, moshaf_id = read_reciter_metadata()
    manifest = {
        "schemaVersion": 1,
        "source": "MP3Quran.net",
        "sourceRights": "https://www.mp3quran.net/privacy-en.html",
        "sourceRecording": "https://www.mp3quran.net/eng/afs",
        "reciter": {"id": reader_id, "name": "مشاري راشد العفاسي"},
        "moshaf": {
            "id": moshaf_id,
            "name": "حفص عن عاصم • مضمن داخل التطبيق",
            "server": SOURCE
        },
        "bitrate": args.bitrate,
        "tracks": tracks
    }
    temp_manifest = output / "manifest.json.tmp"
    temp_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp_manifest.replace(output / "manifest.json")
    total = sum(item["bytes"] for item in tracks)
    print(f"Complete Mishary offline bundle: 114/114 chapters, {total / 1024**2:.1f} MiB", flush=True)

if __name__ == "__main__":
    main()
