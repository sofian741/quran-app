#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');

const storage = new Map();
global.localStorage = {
  getItem: key => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key)
};
if (typeof global.CustomEvent !== 'function') {
  global.CustomEvent = class CustomEvent extends Event {
    constructor(type, options = {}) { super(type); this.detail = options.detail; }
  };
}
const core = require('../audio-core.js');

function response(body) {
  return { ok: true, status: 200, json: async () => body };
}

const rawCatalog = {
  reciters: [
    { id: 3, name: 'قارئ غير مشهور', moshaf: [{ id: 31, name: 'مختارات', server: 'https://server.mp3quran.net/x', surah_list: '1,2' }] },
    { id: 2, name: 'عبد الرحمن السديس', moshaf: [{ id: 21, name: 'حفص', server: 'https://server.mp3quran.net/sds/', surah_list: Array.from({ length: 114 }, (_, i) => i + 1).join(',') }] },
    { id: 1, name: 'مشاري راشد العفاسي', moshaf: [{ id: 11, name: 'حفص مرتل', server: 'https://server.mp3quran.net/afs/', surah_list: '1,2,2,114' }] }
  ]
};

const catalog = core.normalizeCatalog(rawCatalog);
assert.deepEqual(catalog.map(item => item.id), [1, 2, 3], 'popular readers must precede Arabic alphabetical fallback');
assert.deepEqual(catalog[0].moshaf[0].surahs, [1, 2, 114], 'surah list must be validated and deduplicated');
assert.equal(catalog[1].moshaf[0].complete, true, '114-surah recording must be marked complete');
assert.equal(core.mp3Url(catalog[0].moshaf[0], 2), 'https://server.mp3quran.net/afs/002.mp3');
assert.equal(core.mp3Url(catalog[0].moshaf[0], 3), null, 'unavailable chapters must not get invented URLs');

const sanitized = core.sanitizeState({
  provider: 'quran-foundation', surah: 2, ayah: 999, speed: 9,
  repeat: { mode: 'range', start: 8, end: 3, count: 400 }
});
assert.equal(sanitized.ayah, 286);
assert.equal(sanitized.speed, 1);
assert.deepEqual(sanitized.repeat, { mode: 'range', start: 3, end: 8, count: 99, completed: 0 });

(async () => {
  const timing = new core.TimingProvider(async url => {
    const parsed = new URL(url);
    assert.match(parsed.pathname, /\/recitations\/7\/by_chapter\/1$/);
    assert.equal(parsed.searchParams.get('segments'), 'true');
    assert.equal(parsed.searchParams.get('per_page'), '50');
    assert.equal(parsed.searchParams.get('page'), '1');
    return response({ audio_files: [{
      verse_key: '1:1', url: 'Alafasy/mp3/001001.mp3', duration: 4500,
      segments: [[1, 0, 900], [2, 900, 1800], ['bad', 3, 2]]
    }] });
  });
  const chapter = await timing.chapter(7, 1);
  assert.equal(chapter.get(1).audioUrl, 'https://verses.quran.com/Alafasy/mp3/001001.mp3');
  assert.deepEqual(chapter.get(1).segments, [
    { word: 1, start: 0, end: 900 }, { word: 2, start: 900, end: 1800 }
  ]);

  // A long surah must request subsequent pages rather than silently stopping at 50 verses.
  const requestedPages = [];
  const paginatedTiming = new core.TimingProvider(async url => {
    const parsed = new URL(url);
    assert.match(parsed.pathname, /\/recitations\/7\/by_chapter\/2$/);
    assert.equal(parsed.searchParams.get('segments'), 'true');
    assert.equal(parsed.searchParams.get('per_page'), '50');
    const page = Number(parsed.searchParams.get('page'));
    requestedPages.push(page);
    assert.ok(page === 1 || page === 2, 'unexpected pagination request');
    const start = page === 1 ? 1 : 51;
    const end = page === 1 ? 50 : 51;
    return response({
      audio_files: Array.from({ length: end - start + 1 }, (_, index) => ({
        verse_key: `2:${start + index}`,
        url: `Alafasy/mp3/002${String(start + index).padStart(3, '0')}.mp3`,
        segments: [[1, 0, 100]]
      })),
      pagination: { total_pages: 2, next_page: page === 1 ? 2 : null }
    });
  });
  const paginatedChapter = await paginatedTiming.chapter(7, 2);
  assert.deepEqual(requestedPages, [1, 2], 'all API pages must be fetched');
  assert.equal(paginatedChapter.size, 51, 'audio timing pages must be merged');
  assert.ok(paginatedChapter.has(51), 'late verses must remain accessible');

  const service = new core.CatalogService(async () => response(rawCatalog));
  const loaded = await service.load();
  assert.equal(service.preferred(loaded).id, 1, 'Mishary must be the default when available');
  assert.equal(core.priorityIndex('ماهر المعيقلي') < core.priorityIndex('قارئ آخر'), true);
  console.log('audio-core: assertions passed (including paginated chapter audio)');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
