#!/usr/bin/env python3
from __future__ import annotations

import collections
import urllib.parse

import sync_qud_audio as base

release = base.request_json(base.RELEASE_API)
assets = {item.get('name'): item for item in release.get('assets', [])}
manifest = base.request_json(assets['manifest.json']['browser_download_url'])
catalog = base.request_json(assets['catalog.json']['browser_download_url'])
by_slug = {x.get('slug'): x for x in catalog.get('recitations', []) if x.get('slug')}

rows = []
for slug, mi in (manifest.get('recitations') or {}).items():
    cat = by_slug.get(slug) or {}
    coverage = cat.get('coverage') or {}
    audio = cat.get('audio') or {}
    urls = audio.get('chapter_urls') or {}
    riwayah = str(mi.get('riwayah') or cat.get('riwayah') or 'hafs').lower()
    complete = int(mi.get('coverage_ayahs') or 0) == 6236 and int(coverage.get('ayahs') or 0) == 6236
    word = 'word' in (mi.get('tiers') or [])
    category = str(cat.get('audio_category') or '')
    hosts = sorted({urllib.parse.urlparse(str(u)).hostname or '' for u in urls.values()})
    direct = len(urls) == 114 and all(str(i) in urls and base.safe_https_audio_url(urls[str(i)]) for i in range(1, 115))
    if riwayah == 'hafs' and complete and word:
        rows.append((slug, cat.get('reciter_id'), cat.get('name_ar') or cat.get('name_en'), category, len(urls), direct, hosts))

print('FULL HAFS WORD DATASETS', len(rows))
print('CATEGORY COUNTS', collections.Counter(r[3] for r in rows))
print('DIRECT COUNTS', collections.Counter((r[3], r[5]) for r in rows))
for row in rows:
    print('CANDIDATE', row)
