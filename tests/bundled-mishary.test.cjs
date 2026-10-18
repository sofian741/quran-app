'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('offline-mishary.js', 'utf8');
const server = 'https://server8.mp3quran.net/afs/';
const mkManifest = () => ({
  schemaVersion: 1,
  reciter: { id: 910001, name: 'مشاري راشد العفاسي' },
  moshaf: { id: 910001, name: 'حفص عن عاصم • مضمن داخل التطبيق', server },
  tracks: Array.from({ length: 114 }, (_, i) => ({
    surah: i + 1,
    file: String(i + 1).padStart(3, '0') + '.mp3',
    url: server + String(i + 1).padStart(3, '0') + '.mp3',
    bytes: 123456
  }))
});

async function createContext(manifest) {
  const existing = [{ url: 'https://example.com/other.mp3', bytes: 10, savedAt: 9 }];
  class DownloadManager {
    list() { return [...existing]; }
    async has(url) { return existing.some(item => item.url === url); }
    async downloadTrack(track) { existing.push(track); return true; }
    async remove(url) { const index = existing.findIndex(item => item.url === url); if(index >= 0) existing.splice(index, 1); return true; }
  }
  class CatalogService {
    cached() { return []; }
    async load() { throw new Error('No network'); }
  }
  const downloads = {
    DownloadManager, mediaFor: async (_, url) => url,
    releaseMedia: owner => { owner.__savedMedia = null; }
  };
  const core = {
    CatalogService,
    SURAH_NAMES: Array.from({length:114},(_,i)=>'سورة '+(i+1)),
    sortReciters: arr => arr
  };
  const context = {
    window: { QuranAudio: core, QuranDownloads: downloads, dispatchEvent: () => {} },
    URL, Map, Set, Event, console,
    location: { href: 'https://localhost/library.html' },
    fetch: async () => ({ ok: true, json: async () => manifest })
  };
  vm.runInNewContext(source, context);
  await downloads.bundledReady;
  return { downloads, core };
}

test('A complete 114-chapter audio bundle is listed and plays locally', async () => {
  const {downloads, core} = await createContext(mkManifest());
  const dm = new downloads.DownloadManager();
  const tracks = dm.list();
  assert.equal(tracks.length, 115);
  assert.equal(tracks.filter(item => item.bundled).length, 114);
  assert.equal(await dm.has(server + '001.mp3'), true);
  assert.equal(await dm.has(server + '114.mp3'), true);
  const owner = {};
  const media = await downloads.mediaFor(owner, server + '002.mp3');
  assert.equal(media, 'https://localhost/offline/mishary/002.mp3');
  assert.equal(await dm.remove(server + '002.mp3'), false, 'preinstalled audio is immutable');
  assert.equal(dm.list().length, 115);
  const catalog = await new core.CatalogService().load();
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].moshaf[0].surahs.length, 114);
  assert.equal(await dm.downloadTrack({url:server+'002.mp3'}), false, 'no double download');
});

test('Reject missing, mismatched or duplicate chapters; do not fake saved audio', async () => {
  for (const malformed of [
    {...mkManifest(), tracks: mkManifest().tracks.slice(1)},
    {...mkManifest(), tracks: [mkManifest().tracks[0], ...mkManifest().tracks.slice(0, 113)]},
    {...mkManifest(), tracks: mkManifest().tracks.map((t,i) => i===3 ? {...t, file:'oops.mp3'} : t)}
  ]) {
    const {downloads} = await createContext(malformed);
    assert.equal(await downloads.bundledReady, false);
    assert.equal(new downloads.DownloadManager().list().length, 1);
  }
});
