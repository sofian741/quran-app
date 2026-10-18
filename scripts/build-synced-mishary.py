#!/usr/bin/env python3
"""Prepare a word-synchronized 114-surah Mushary audio package.

Source audio MUST match the timing dataset:
  EveryAyah Alafasy_128kbps verse MP3s + cpfair/quran-align (CC BY 4.0).
Each original ayah is decoded to fixed-rate PCM; samples are concatenated
without timing guesses, the exact sample offsets are recorded, and the result
is encoded to one chapter MP3. Wrong/missing timing rows abort the package.

This is an optional non-commercial preparation workflow. The EveryAyah site's
public availability does not itself prove a redistribution grant. Resolve
recording rights before publishing the generated audio release to end users.
"""
import argparse
import concurrent.futures
import gzip
import hashlib
import io
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import zipfile

SOURCE = "https://everyayah.com/data/Alafasy_128kbps/"
TIMING_RELEASE = "https://api.github.com/repos/cpfair/quran-align/releases/tags/release-2016-11-24"
TIMING_MIRROR = "https://huggingface.co/datasets/FaisaI/tadabur-align-references/resolve/main/quran-align/Alafasy_128kbps.json"
SAMPLE_RATE = 24000
FRAME_BYTES = 2
DEFAULT_COUNTS = [
    7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
    112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,
    54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,
    14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,
    29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,
    11,8,3,9,5,4,7,3,6,3,5,4,5,6
]

def open_url(url, timeout=90):
    return urlopen(Request(url, headers={
        "User-Agent": "NoorAlQuran-verified-word-audio/1.0",
        "Accept": "application/octet-stream, application/json, */*"
    }), timeout=timeout)

def data_from_archive(blob, name):
    if name.lower().endswith((".json", ".json.gz")):
        return gzip.decompress(blob) if name.endswith(".gz") else blob
    if zipfile.is_zipfile(io.BytesIO(blob)):
        with zipfile.ZipFile(io.BytesIO(blob)) as archive:
            chosen = [entry for entry in archive.namelist()
                      if entry.split("/")[-1] in ("Alafasy_128kbps.json", "Alafasy_128kbps.json.gz")]
            if len(chosen) != 1:
                raise ValueError("Alafasy timing JSON missing/ambiguous inside archive")
            content = archive.read(chosen[0])
            return gzip.decompress(content) if chosen[0].endswith(".gz") else content
    with tarfile.open(fileobj=io.BytesIO(blob), mode="r:*") as archive:
        chosen = [entry for entry in archive.getmembers() if entry.isfile() and
                  entry.name.split("/")[-1] in ("Alafasy_128kbps.json", "Alafasy_128kbps.json.gz")]
        if len(chosen) != 1:
            raise ValueError("Alafasy timing JSON missing/ambiguous inside tar")
        content = archive.extractfile(chosen[0]).read()
        return gzip.decompress(content) if chosen[0].endswith(".gz") else content

def get_timings(cache):
    destination = cache / "Alafasy_128kbps.json"
    if destination.is_file():
        return json.loads(destination.read_text(encoding="utf-8"))
    errors = []
    # Prefer the original author's GitHub release. Its asset can be an archive.
    try:
        with open_url(TIMING_RELEASE, 40) as reply:
            release = json.load(reply)
        assets = release.get("assets", [])
        if not assets:
            raise ValueError("GitHub release contains no timing assets")
        selected = sorted(assets, key=lambda asset: (
            0 if "Alafasy" in asset.get("name", "") else 1,
            0 if asset.get("name", "").lower().endswith((".json", ".zip", ".tar.gz", ".tgz")) else 1
        ))
        for asset in selected:
            if asset.get("size", 0) > 180_000_000: continue
            try:
                with open_url(asset["browser_download_url"], 150) as response:
                    blob = response.read(180_000_001)
                if len(blob) > 180_000_000:
                    raise ValueError("Excessive timing archive size")
                raw = data_from_archive(blob, asset["name"])
                payload = json.loads(raw)
                if not isinstance(payload, list): raise ValueError("Unexpected timing JSON shape")
                destination.write_bytes(raw)
                print("Verified timing source: cpfair/quran-align", asset["name"], flush=True)
                return payload
            except Exception as error: errors.append(str(error))
    except Exception as error: errors.append(str(error))
    # Mirror carries attribution to the same CC BY 4.0 original files.
    try:
        with open_url(TIMING_MIRROR, 150) as response:
            blob = response.read(80_000_001)
        if len(blob) > 80_000_000: raise ValueError("Timing JSON too large")
        payload = json.loads(blob)
        if not isinstance(payload, list): raise ValueError("Unexpected timing JSON")
        destination.write_bytes(blob)
        print("Verified timing mirror: cpfair data via Hugging Face", flush=True)
        return payload
    except Exception as error: errors.append(str(error))
    raise RuntimeError("Unable to obtain actual Alafasy word timings: " + " | ".join(errors)[:600])

def build_timing_index(rows, counts):
    lookup = {}
    for row in rows:
        if not isinstance(row, dict): continue
        s, a = int(row.get("surah", 0)), int(row.get("ayah", 0))
        if s < 1 or s > 114 or a < 1 or a > counts[s-1]: continue
        key = (s, a)
        if key in lookup: raise ValueError(f"Duplicate word alignment for {key}")
        segments = row.get("segments")
        if not isinstance(segments, list) or not segments:
            raise ValueError(f"Missing word timings for {key}")
        filtered = []
        previous_index = 0
        for segment in segments:
            if not isinstance(segment, list) or len(segment) != 4:
                raise ValueError(f"Invalid alignment segment for {key}")
            begin, end, start, finish = segment
            if not all(isinstance(n, (int,float)) for n in segment) or any(not isinstance(n,(int,float)) for n in segment):
                raise ValueError(f"Invalid segment data {key}")
            if not (int(begin) == begin and int(end) == end and 0 <= begin < end <= 350 and
                    start >= 0 and finish > start):
                raise ValueError(f"Invalid word alignment bounds {key}: {segment}, previous={previous_index}")
            previous_index = int(end)
            filtered.append([int(begin)+1, int(end), round(start), round(finish)])
        lookup[key] = filtered
    expected = sum(counts)
    if len(lookup) != expected or any((s,a) not in lookup for s in range(1,115) for a in range(1,counts[s-1]+1)):
        raise ValueError(f"Alafasy timings incomplete: {len(lookup)}/{expected} ayahs. Refusing fake alignment.")
    return lookup

def audio_valid(path):
    if not path.is_file() or path.stat().st_size < 900:
        return False
    with path.open("rb") as file:
        head = file.read(10)
    return head.startswith(b"ID3") or (len(head)>=2 and head[0]==255 and head[1] & 224 == 224)

def download_ayah(surah, ayah, cache, retries=4):
    filename = f"{surah:03}{ayah:03}.mp3"
    folder = cache / f"{surah:03}"
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / filename
    if audio_valid(path): return path
    if path.exists(): path.unlink()
    url = SOURCE + filename
    for attempt in range(retries):
        temp = folder / (filename + ".part")
        try:
            with open_url(url, 90) as response, temp.open("wb") as output:
                parsed = urlparse(response.url)
                if parsed.scheme != "https" or not parsed.hostname.endswith("everyayah.com"):
                    raise ValueError("Unexpected audio host: " + response.url)
                expected = int(response.headers.get("Content-Length") or 0)
                received = 0
                while True:
                    chunk = response.read(128*1024)
                    if not chunk: break
                    output.write(chunk)
                    received += len(chunk)
                if expected and expected != received:
                    raise ValueError(f"Truncated ayah MP3: {received}/{expected}")
            if not audio_valid(temp): raise ValueError("Invalid MP3 source bytes")
            temp.replace(path)
            return path
        except Exception:
            temp.unlink(missing_ok=True)
            if attempt == retries-1: raise
            time.sleep(1 + attempt*2)

def decode_ayah(path):
    output = subprocess.run([
        "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
        "-i", str(path), "-map", "0:a:0", "-vn", "-f", "s16le",
        "-ar", str(SAMPLE_RATE), "-ac", "1", "-"
    ], capture_output=True, timeout=180, check=True).stdout
    if len(output) < SAMPLE_RATE * FRAME_BYTES // 3 or len(output) % FRAME_BYTES:
        raise ValueError("Invalid decoded PCM for " + path.name)
    return output

def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as reader:
        while (chunk := reader.read(1024*1024)):
            digest.update(chunk)
    return digest.hexdigest()

def create_chapter(surah, count, lookup, cache, output, bitrate):
    filename = f"{surah:03}"
    audio = output / (filename + ".mp3")
    timing = output / (filename + ".json")
    pcm_path = cache / (filename + ".pcm")
    verses = []
    sample_total = 0
    with pcm_path.open("wb") as pcm:
        for ayah in range(1, count+1):
            mp3 = cache / filename / f"{surah:03}{ayah:03}.mp3"
            data = decode_ayah(mp3)
            sample_count = len(data) // FRAME_BYTES
            start = round(sample_total * 1000 / SAMPLE_RATE)
            end = round((sample_total + sample_count) * 1000 / SAMPLE_RATE)
            seconds = sample_count * 1000 / SAMPLE_RATE
            words = []
            for begin, last, raw_start, raw_end in lookup[surah, ayah]:
                if raw_start > seconds + 400 or raw_end > seconds + 850:
                    raise ValueError(f"Timings exceed source audio {surah}:{ayah}, "
                                     f"word {begin}, end={raw_end}, ayah_ms={seconds:.0f}")
                aligned_start = start + max(0, min(round(seconds), raw_start))
                aligned_end = start + max(0, min(round(seconds), raw_end))
                if aligned_end <= aligned_start:
                    raise ValueError(f"Nonpositive aligned duration {surah}:{ayah} word {begin}")
                words.append([begin, last, aligned_start, aligned_end])
            if not words:
                raise ValueError(f"No word timings for {surah}:{ayah}")
            verses.append({"ayah": ayah, "start": start, "end": end, "words": words})
            pcm.write(data)
            sample_total += sample_count
    try:
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-f", "s16le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", str(pcm_path),
            "-map_metadata", "-1", "-c:a", "libmp3lame", "-b:a", bitrate, str(audio)
        ], check=True, timeout=900)
    finally:
        pcm_path.unlink(missing_ok=True)
    if not audio_valid(audio):
        raise ValueError(f"Corrupted encoded audio for surah {surah}")
    duration = float(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(audio)
    ], text=True, timeout=25).strip())
    original_duration = sample_total / SAMPLE_RATE
    if abs(duration-original_duration) > 0.25:
        raise ValueError(f"Surah {surah} length drift: {duration} vs {original_duration}")
    timing.write_text(json.dumps({
        "schemaVersion": 2, "surah": surah, "source": "cpfair/quran-align with matching EveryAyah audio",
        "durationMs": round(original_duration*1000), "verses": verses
    }, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    return {
        "surah": surah, "file": filename+".mp3", "timing": filename+".json",
        "url": "https://server8.mp3quran.net/afs/" + filename+".mp3",
        "bytes": audio.stat().st_size, "sha256": sha256(audio),
        "timingSha256": sha256(timing)
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="www/offline/mishary")
    parser.add_argument("--cache", default=".build-cache/mishary-everyayah")
    parser.add_argument("--bitrate", choices=("48k","64k"), default="48k")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--timings-file")
    parser.add_argument("--counts-file")
    parser.add_argument("--surah", type=int, help="Developer-only sample chapter, not a releasable package")
    args = parser.parse_args()
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool): sys.exit("Missing binary: " + tool)
    counts = DEFAULT_COUNTS
    if args.counts_file:
        counts = json.loads(Path(args.counts_file).read_text())
    if len(counts) != 114 or sum(counts) != 6236:
        sys.exit("Invalid immutable 114-surah, 6236-ayah counts")
    cache = Path(args.cache)
    output = Path(args.output)
    cache.mkdir(parents=True, exist_ok=True)
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").unlink(missing_ok=True)
    rows = json.loads(Path(args.timings_file).read_text()) if args.timings_file else get_timings(cache)
    index = build_timing_index(rows, counts)
    surahs = [args.surah] if args.surah else list(range(1,115))
    if any(s < 1 or s > 114 for s in surahs): sys.exit("Surah out of range")
    jobs = [(s, a) for s in surahs for a in range(1,counts[s-1]+1)]
    print(f"Fetching {len(jobs)} original EveryAyah Alafasy clips; reuses cached files", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1,min(12,args.workers))) as pool:
        for i, path in enumerate(pool.map(lambda item: download_ayah(item[0],item[1],cache), jobs), 1):
            if i%200 == 0 or i == len(jobs):
                print(f"Downloaded {i}/{len(jobs)} clips", flush=True)
    recordings = []
    for i,s in enumerate(surahs,1):
        recordings.append(create_chapter(s, counts[s-1], index, cache, output, args.bitrate))
        print(f"Encoded, synchronized, verified surah {s}: {i}/{len(surahs)}", flush=True)
    if args.surah:  # A sample MUST NOT claim it is a complete Mushaf.
        print("Sample finished without manifest. To ship, run all 114 surahs.", flush=True)
        return
    if len(recordings) != 114 or set(t["surah"] for t in recordings) != set(range(1,115)):
        sys.exit("Incomplete synchronized Quran recordings")
    manifest = {
        "schemaVersion": 2, "syncLevel": "word", "recordingSource": "EveryAyah/Alafasy_128kbps",
        "timingSource": "cpfair/quran-align:release-2016-11-24",
        "timingLicense": "CC BY 4.0",
        "reciter": {"id": 910001, "name": "مشاري راشد العفاسي"},
        "moshaf": {
            "id": 910001, "name": "حفص عن عاصم • مضمن ومتزامن بدون إنترنت",
            "server": "https://server8.mp3quran.net/afs/"
        },
        "tracks": recordings
    }
    temp = output / "manifest.json.tmp"
    temp.write_text(json.dumps(manifest, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
    temp.replace(output / "manifest.json")
    total = sum(t["bytes"] for t in recordings)
    print(f"Verified word-synced Mushary: 114 surahs / 6236 ayahs / {total/1024**2:.1f} MiB", flush=True)

if __name__ == "__main__":
    main()
