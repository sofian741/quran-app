'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/qud/manifest.json'), 'utf8'));
const VERSE_COUNTS = [
    7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,110,98,135,
    112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,182,88,75,85,54,53,89,
    59,37,35,38,29,18,45,60,49,62,55,78,96,29,22,24,13,14,11,11,18,12,12,30,
    52,52,44,28,28,20,56,40,31,50,40,46,42,29,19,36,25,22,17,19,26,30,20,15,
    21,11,8,8,19,5,8,8,11,11,8,3,9,5,4,7,3,6,3,5,4,5,6
];
class AudioEngine {}
class TimingProvider {}
global.location = { href: 'https://example.test/quran.html' };
global.window = {
    QuranAudio: { ALIGNED_RECITERS: [{ id: 7, name: 'مشاري راشد العفاسي' }], AudioEngine, TimingProvider, VERSE_COUNTS },
    QudAudioRegistry: manifest
};
require('../qud-audio.js');

const ids = [9020, 9021, 9022];
assert.deepEqual(window.QuranQud.foundationReciters.map(x => x.id), ids);
assert.equal(window.QuranAudio.ALIGNED_RECITERS.length, 23);
assert.equal(new Set(window.QuranAudio.ALIGNED_RECITERS.map(x => x.id)).size, 23);

async function main() {
    for (const id of ids) {
        for (const surah of [1, 2, 114]) {
            const chapter = await window.QuranQud.loadChapter(id, surah);
            assert.equal(chapter.verses.length, VERSE_COUNTS[surah - 1]);
            assert.equal(chapter.byAyah.size, chapter.verses.length);
            assert.ok(chapter.audioUrl.startsWith('https://download.quranicaudio.com/'));
            for (const verse of chapter.verses) {
                assert.ok(verse.timestampTo > verse.timestampFrom);
                assert.equal(verse.audioUrl, chapter.audioUrl);
                assert.ok(verse.segments.length > 0, `${id} ${surah}:${verse.ayah} missing words`);
            }
            console.log('PASS', id, surah, chapter.verses.length, chapter.audioUrl);
        }
    }
    for (const [id, surah, ayah] of [[9021, 89, 1], [9022, 12, 76]]) {
        const chapter = await window.QuranQud.loadChapter(id, surah);
        assert.equal(chapter.verses.length, VERSE_COUNTS[surah - 1]);
        assert.equal(chapter.byAyah.get(ayah).segments.length, 0);
        assert.ok(chapter.byAyah.get(ayah).timestampTo > chapter.byAyah.get(ayah).timestampFrom);
        assert.ok(chapter.byAyah.get(ayah + 1).segments.length > 0);
        console.log('PASS honest verse-only fallback', id, surah, ayah);
    }
    for (const id of ids) {
        const chapter = await window.QuranQud.loadChapter(id, 1);
        const response = await fetch(chapter.audioUrl, { headers: { Range: 'bytes=0-1023' } });
        assert.ok([200, 206].includes(response.status), `${id}: audio HTTP ${response.status}`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        assert.ok(bytes.length > 0, `${id}: audio body empty`);
        console.log('PASS audio range', id, response.status, bytes.length);
    }
    console.log('PASS 23 unique readers: 20 existing plus 3 verified Foundation sheikhs');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
