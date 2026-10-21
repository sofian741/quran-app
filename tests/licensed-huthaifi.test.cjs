'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('offline-licensed-reciter.js', 'utf8');

function manifest(valid = true) {
  return {
    schemaVersion: 1, syncLevel: 'word', audioCodec: 'opus', audioContainer: 'webm',
    source: valid ? 'MP3Quran / ali_al_huthaifi_mp3quran' : 'EveryAyah',
    timingSlug: 'ali_al_huthaifi_mp3quran',
    reciter: { id: 9004, name: 'علي بن عبد الرحمن الحذيفي' },
    tracks: Array.from({ length: 114 }, (_, i) => ({
      surah: i + 1, file: String(i+1).padStart(3,'0')+'.webm',
      url: 'https://server9.mp3quran.net/hthfi/'+String(i+1).padStart(3,'0')+'.mp3',
      bytes: 45678, sha256: 'a'.repeat(64)
    }))
  };
}

async function setup(valid = true) {
  const stored = [{url:'https://server10.mp3quran.net/minsh/001.mp3',savedAt:23}];
  const calls = [];
  class DownloadManager {
    list() { return [...stored]; }
    async has(url) { return stored.some(row => row.url === url); }
    async downloadTrack(track) { calls.push(track); return true; }
    async remove() { return true; }
  }
  class CatalogService {
    cached() { return []; }
    async load() { return []; }
  }
  const api = {
    DownloadManager,
    mediaFor: async (_, url) => url,
    releaseMedia(owner) { owner.__savedMedia = null; }
  };
  const core = {
    CatalogService, sortReciters: rows => rows,
    SURAH_NAMES: Array.from({length:114},(_,i) => 'سورة '+String(i+1))
  };
  const context = {
    window: { QuranDownloads: api, QuranAudio: core, Capacitor: {isNativePlatform: () => true}, dispatchEvent(){} },
    location: { href: 'https://localhost/quran.html' },
    document: { createElement: () => ({canPlayType: () => 'probably'}) },
    fetch: async url => {
      assert.match(String(url), /\/offline\/huthaifi\/manifest\.json$/);
      return {ok:true,json:async()=>manifest(valid)};
    },
    Event, URL, Map, Set, console
  };
  vm.runInNewContext(source,context,{filename:'offline-licensed-reciter.js'});
  await context.window.QuranLicensedHuthaifi.ready;
  return {api, core, calls, context};
}

test('licensed 114-surah reader is exposed and cannot be deleted or downloaded again', async()=>{
  const {api,core,calls,context}=await setup();
  assert.equal(await context.window.QuranLicensedHuthaifi.ready,true);
  const dm = new api.DownloadManager();
  assert.equal(dm.list().length,115,'preserve old downloads and include 114 packaged surahs');
  const url='https://server9.mp3quran.net/hthfi/001.mp3';
  assert.equal(await dm.has(url),true);
  assert.equal(await dm.downloadTrack({url}),false,'bundled audio never downloaded again');
  assert.equal(await dm.remove(url),false,'bundled audio cannot be deleted');
  assert.equal(calls.length,0);
  const owner = {};
  assert.match(await api.mediaFor(owner,url),/\/offline\/huthaifi\/001\.webm$/);
  const catalog = new core.CatalogService().cached();
  assert.equal(catalog.length,1);
  assert.equal(catalog[0].id,9004);
  assert.equal(catalog[0].moshaf[0].surahs.length,114);
});

test('unverified source manifest is ignored instead of impersonating a licensed recording', async()=>{
  const {api,context}=await setup(false);
  assert.equal(await context.window.QuranLicensedHuthaifi.ready,false);
  assert.equal(new api.DownloadManager().list().length,1);
  assert.equal(await new api.DownloadManager().has('https://server9.mp3quran.net/hthfi/001.mp3'),false);
});
