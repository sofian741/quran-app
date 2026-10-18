'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('offline-mishary-sync.js', 'utf8');
const url = 'https://server8.mp3quran.net/afs/001.mp3';

function build() {
  const verses = Array.from({length:7},(_,i)=>({
    surah:1,ayah:i+1, audioUrl:url,
    timestampFrom:i*1000,timestampTo:(i+1)*1000,
    segments:[{word:1,endWord:1,start:i*1000+100,end:i*1000+900}]
  }));
  const chapter = {surah:1,audioUrl:url,verses,byAyah:new Map(verses.map(x=>[x.ayah,x]))};
  class FakeAudio {
    constructor() { this.src='';this.currentTime=0;this.readyState=1;this.duration=7;this.paused=true;this.playbackRate=1;this.handlers=new Map(); }
    addEventListener(name, fn) {this.handlers.set(name,[...(this.handlers.get(name)||[]),fn]);}
    load() {}
    play() {this.paused=false; return Promise.resolve();}
    pause() {this.paused=true;}
  }
  class AudioEngine {
    constructor(){
      this.audio=new FakeAudio();
      this.state={provider:'quran-foundation',reciterId:7,surah:1,ayah:5,position:0,speed:1,repeat:{mode:'off',count:1,completed:0}};
      this.status='idle';this.prepareVersion=0;this.pendingResume=0;this.trackUrl='';
      this.intentToPlay=false;this.bindAudio();
    }
    bindAudio() {}
    persist() {this.state.position=this.audio.currentTime;}
    updateMediaMetadata() {}
    emit() {}
    async play() {await this.audio.play();return true;}
    async prepare() {throw new Error('Remote Quran Foundation called with ready offline audio');}
    async goTo(){throw new Error('Remote goTo called for same chapter');}
    async handleEnded(){}
    preloadUpcomingVerse(){throw new Error('Unnecessary network preload');}
  }
  const downloads={
    bundledReady:Promise.resolve(true),
    syncedMisharyChapter:async()=>chapter,
    mediaFor:async()=> 'https://localhost/offline/mishary/001.mp3'
  };
  vm.runInNewContext(source,{window:{QuranAudio:{AudioEngine,VERSE_COUNTS:[7]},QuranDownloads:downloads},navigator,console});
  return {AudioEngine,downloads};
}

test('Offline Mushary starts at selected ayah and uses real chapter time',async()=>{
  const {AudioEngine}=build();
  const player=new AudioEngine();
  assert.equal(await player.prepare({autoplay:false}),true);
  assert.equal(player.audio.src,'https://localhost/offline/mishary/001.mp3');
  assert.equal(player.audio.currentTime,4);
  assert.equal(player.currentTiming.segments[0].start,4100);
  assert.equal(await player.goTo(1,3,{autoplay:true}),true);
  assert.equal(player.audio.currentTime,2);
  assert.equal(player.state.ayah,3);
  assert.equal(player.audio.paused,false);
  assert.equal(await player.preloadUpcomingVerse(),undefined);
  player.audio.currentTime=5.25;
  player.__syncContinuousChapter();
  assert.equal(player.state.ayah,6);
  assert.equal(player.currentTiming.segments[0].start,5100);
});

test('Word synchronized continuous MP3 repeats an exact verse interval',async()=>{
  const {AudioEngine}=build();
  const player=new AudioEngine();
  await player.prepare();
  await player.goTo(1,5,{autoplay:true});
  player.state.repeat={mode:'verse',count:2,completed:0};
  player.audio.currentTime=5.005;
  player.__syncContinuousChapter();
  assert.equal(player.audio.currentTime,4);
  assert.equal(player.state.ayah,5);
  assert.equal(player.state.repeat.completed,1);
});
