'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('mp3quran-ayah-sync.js','utf8');

function makeEngine() {
  const store = new Map();
  const calls = [];
  class AudioEngine {
    constructor() {
      this.audio = { currentTime: 0 };
      this.prepareVersion = 0;
      this.trackUrl = '';
      this.state = {
        provider: 'mp3quran', reciterId: 4, surah: 1, ayah: 1,
        server: 'https://server9.mp3quran.net/hthfi/'
      };
      this.emitted=0;
      this.bindAudio();
    }
    bindAudio() { this.audio.addEventListener = ()=>{}; }
    async prepare() {
      this.prepareVersion++;
      this.trackUrl = this.state.server+'001.mp3';
      return true;
    }
    persist() {}
    emit() { this.emitted++; }
  }
  const core = { AudioEngine, VERSE_COUNTS:[7] };
  const context = {
    window: { QuranAudio: core },
    navigator: { onLine: true },
    URL, Map, Set, WeakSet, console,
    localStorage: {
      getItem:k=>store.get(k)||null,
      setItem:(k,v)=>store.set(k,String(v))
    },
    fetch: async (url) => {
      calls.push(String(url));
      if (String(url).endsWith('/reads')) return { ok:true,json:async()=>[
        { id: 77, folder_url:'https://server9.mp3quran.net/hthfi/' },
        { id: 88, folder_url:'https://server8.mp3quran.net/other/' }
      ]};
      if (String(url).includes('/ayat_timing?')) return {ok:true,json:async()=>
        [{ayah:0,start_time:0,end_time:100}].concat(
          Array.from({length:7},(_,i)=>({
            ayah:i+1,start_time:1000*i,end_time:1000*(i+1)
          })))};
      throw new Error('Unexpected endpoint');
    }
  };
  vm.runInNewContext(source,context);
  return { engine:new AudioEngine(), core, context, calls, store };
}

test('MP3Quran exact source resolves valid verse-only timestamps and never invents words',async()=>{
  const {engine,calls} = makeEngine();
  assert.equal(await engine.prepare(),true);
  await new Promise(resolve=>setImmediate(resolve));
  engine.audio.currentTime=2.4;
  engine.__syncMp3QuranAyah();
  assert.equal(engine.state.ayah,3);
  assert.equal(engine.currentTiming.source,'MP3Quran Ayah Timing');
  assert.equal(engine.currentTiming.segments.length,0);
  assert.equal(calls.length,2);
  engine.state.server='https://server8.mp3quran.net/other/';
  const previous=engine.state.ayah;
  engine.audio.currentTime=4.5;
  engine.__syncMp3QuranAyah();
  assert.equal(engine.state.ayah,previous,'switching recording must not reuse stale timings');
});

test('Incomplete MP3Quran verse map is rejected rather than guessed',()=>{
  const {context} = makeEngine();
  const fn = context.window.QuranMp3AyahTiming.validateChapter;
  assert.equal(fn([{ayah:1,start_time:0,end_time:100}],1),null);
  assert.equal(context.window.QuranMp3AyahTiming.normalizedFolder('https://example.org/hthfi/'),'');
});
