#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.join(__dirname, '..');
const readJson = filename => JSON.parse(fs.readFileSync(path.join(root, filename), 'utf8'));

const quranRefs = [];
for (const line of fs.readFileSync(path.join(root, 'data/quran-uthmani.txt'), 'utf8').split(/\r?\n/)) {
    const match = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (match) quranRefs.push(`${Number(match[1])}:${Number(match[2])}`);
}
assert.equal(quranRefs.length, 6236, 'Tanzil verse count');
assert.equal(new Set(quranRefs).size, 6236, 'Tanzil references must be unique');
const expectedRefs = new Set(quranRefs);

const tafsir = readJson('scripts/tafsir_muyassar.json');
assert.equal(tafsir.source, 'QuranEnc.com');
assert.equal(tafsir.api_key, 'arabic_moyassar');
assert.match(tafsir.source_url, /^https:\/\/quranenc\.com\//);
assert.equal(tafsir.total_verses, 6236);
assert.deepEqual(new Set(Object.keys(tafsir.verses)), expectedRefs, 'tafsir coverage');
for (const [ref, item] of Object.entries(tafsir.verses)) {
    assert.equal(`${Number(item.sura)}:${Number(item.aya)}`, ref, `tafsir reference ${ref}`);
    assert.ok(typeof item.translation === 'string' && item.translation.trim(), `empty tafsir ${ref}`);
}

const manifest = readJson('data/qud/manifest.json');
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.qudRelease, 'v3.2.0');
assert.equal(manifest.license, 'CC-BY-4.0');
assert.equal(manifest.reciterCount, 20);
assert.equal(manifest.builtInReciters, 1);
assert.equal(manifest.qudReciterCount, 19);
assert.equal(manifest.reciters.length, 19);

const slugs = new Set();
for (const reciter of manifest.reciters) {
    assert.equal(slugs.has(reciter.slug), false, `duplicate QUD slug ${reciter.slug}`);
    slugs.add(reciter.slug);
    const timingPath = reciter.timingUrl.replace(/^\.\//, '');
    const catalogPath = reciter.catalogUrl.replace(/^\.\//, '');
    assert.ok(fs.existsSync(path.join(root, timingPath)), `${reciter.slug} timing file`);
    assert.ok(fs.existsSync(path.join(root, catalogPath)), `${reciter.slug} catalog file`);

    const catalog = readJson(catalogPath);
    assert.equal(catalog.schema_version, 1);
    assert.equal(catalog.slug, reciter.slug);
    const urls = catalog.audio?.chapter_urls;
    assert.ok(urls && typeof urls === 'object');
    assert.deepEqual(
        Object.keys(urls).map(Number).sort((a, b) => a - b),
        Array.from({ length: 114 }, (_, index) => index + 1),
        `${reciter.slug} chapter coverage`,
    );
    Object.values(urls).forEach(url => assert.match(url, /^https:\/\//, `${reciter.slug} HTTPS audio`));

    const payload = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root, timingPath))));
    assert.equal(payload._meta?.schema_version, 3);
    assert.equal(payload._meta?.tier, 'word');
    assert.equal(payload._meta?.verse_count, 6236);
    assert.equal(String(payload._meta?.riwayah || 'hafs').toLowerCase(), 'hafs');
    assert.ok(Array.isArray(payload.rows));
    const canonical = new Set();
    for (const row of payload.rows) {
        assert.ok(Array.isArray(row) && row.length === 6, `${reciter.slug} timing row`);
        const [ref, start, end, isCanonical, silence, words] = row;
        assert.ok(expectedRefs.has(ref), `${reciter.slug} unexpected ref ${ref}`);
        assert.ok(Number.isInteger(start) && Number.isInteger(end) && end >= start);
        assert.ok(Number.isInteger(silence) && silence >= 0);
        assert.ok(Array.isArray(words));
        if (isCanonical) {
            assert.equal(canonical.has(ref), false, `${reciter.slug} duplicate canonical ${ref}`);
            assert.ok(words.length > 0, `${reciter.slug} empty word timings ${ref}`);
            canonical.add(ref);
        }
        let previousEnd = -1;
        for (const word of words) {
            assert.ok(Array.isArray(word) && word.length === 3);
            // QUD keeps repeated recitation spans, so a word index may move
            // backwards while the timestamps themselves must remain ordered.
            assert.ok(Number.isInteger(word[0]) && word[0] >= 1);
            assert.ok(Number.isInteger(word[1]) && Number.isInteger(word[2]) && word[2] >= word[1]);
            assert.ok(word[1] >= previousEnd, `${reciter.slug} unordered word timing ${ref}`);
            previousEnd = word[2];
        }
    }
    assert.deepEqual(canonical, expectedRefs, `${reciter.slug} canonical verse coverage`);
}

console.log('PASS: 6,236 tafsir entries and 19 complete QUD timing/catalog bundles match the local Quran reference set.');

