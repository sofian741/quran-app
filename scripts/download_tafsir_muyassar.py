"""Download QuranEnc Arabic Muyassar tafsir for offline use.

Run: py download_tafsir_muyassar.py
Requires Python 3.8+ and internet access. No extra packages.
"""
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = 'https://quranenc.com/api/v1'
KEY = 'arabic_moyassar'
OUT = Path(__file__).resolve().parent / 'tafsir_muyassar.json'
COUNTS = [7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6]
assert len(COUNTS) == 114 and sum(COUNTS) == 6236


def get_json(url):
    request = urllib.request.Request(url, headers={
        'User-Agent': 'QuranAppTafsirDownloader/1.0 (personal app data sync)',
        'Accept': 'application/json',
    })
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            if attempt == 3:
                raise RuntimeError(f'Failed: {url}\n{exc}') from exc
            time.sleep(2 * (attempt + 1))


def extract_verses(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for name in ('result', 'data', 'verses', 'ayat', 'translations'):
            if isinstance(payload.get(name), list):
                return payload[name]
    raise ValueError('Unexpected QuranEnc response structure. No verses array found.')


def main():
    print('Downloading Arabic Tafsir Al-Muyassar from QuranEnc...')
    meta = None
    try:
        listings = get_json(f'{BASE}/translations/list/ar')
        entries = listings if isinstance(listings, list) else extract_verses(listings)
        meta = next((x for x in entries if isinstance(x, dict) and x.get('key') == KEY), None)
    except (RuntimeError, ValueError) as exc:
        print(f'Note: version metadata unavailable: {exc}')

    verses = {}
    for surah in range(1, 115):
        payload = get_json(f'{BASE}/translation/sura/{KEY}/{surah}')
        entries = extract_verses(payload)
        if len(entries) != COUNTS[surah - 1]:
            raise ValueError(f'Surah {surah}: expected {COUNTS[surah-1]} ayat, got {len(entries)}')
        for item in entries:
            if not isinstance(item, dict):
                raise ValueError(f'Surah {surah}: unexpected verse item')
            try:
                s, a = int(item['sura']), int(item['aya'])
            except (KeyError, TypeError, ValueError) as exc:
                raise ValueError(f'Surah {surah}: missing sura/aya fields') from exc
            if s != surah or not (1 <= a <= COUNTS[surah - 1]):
                raise ValueError(f'Invalid verse reference {s}:{a} in surah {surah}')
            if not isinstance(item.get('translation'), str) or not item['translation'].strip():
                raise ValueError(f'Missing tafsir for {s}:{a}')
            key = f'{s}:{a}'
            if key in verses:
                raise ValueError(f'Duplicate verse {key}')
            verses[key] = item  # Preserve original translation, footnotes and other fields.
        print(f'[{surah:3}/114] {len(entries):3} ayat', flush=True)
        time.sleep(0.12)

    if len(verses) != 6236:
        raise ValueError(f'Expected 6236 verses, got {len(verses)}')
    data = {
        'source': 'QuranEnc.com',
        'source_url': 'https://quranenc.com/ar/browse/arabic_moyassar',
        'api_key': KEY,
        'title': 'التفسير الميسر',
        'metadata': meta,
        'total_verses': len(verses),
        'verses': verses,
    }
    tmp = OUT.with_suffix('.json.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    tmp.replace(OUT)
    print(f'\nSUCCESS: {OUT}\nTotal verses: {len(verses)}')
    if meta:
        print('Version:', meta.get('version', 'not specified'))
    else:
        print('WARNING: Verify source version and publication terms before releasing the app.')


if __name__ == '__main__':
    main()
