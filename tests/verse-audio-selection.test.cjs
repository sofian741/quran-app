'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('verse-audio-selection.js', 'utf8');
const URL_ROOT = 'https://server9.mp3quran.net/hthfi/';
const track = (url = URL_ROOT+'002.mp3', reciterId = 9004, name = 'علي الحذيفي') => ({
    url, provider:'mp3quran', reciterId, reciterName:name, surah:2,
    moshafId:44, moshafName:'حفص', savedAt:100
});
const chapters = {
    verses:[{surah:2,ayah:1,timestampFrom:0,timestampTo:3000},
        {surah:2,ayah:2,timestampFrom:3000,timestampTo:6000},
        {surah:2,ayah:3,timestampFrom:6000,timestampTo:9000}]
};

function setup({offline=false, saved=[], selected='aligned', qudMatch=null, timing=null, alignedFails=false}={}) {
    const calls = [];
    const core = {
        VERSE_COUNTS:[7,286],
        mp3Url:(moshaf,surah)=>moshaf?.server && moshaf.surahs.includes(surah)
            ? moshaf.server+String(surah).padStart(3,'0')+'.mp3' : null
    };
    const selectedUrl = URL_ROOT+'002.mp3';
    const state = selected==='aligned' ? {
        provider:'quran-foundation',reciterId:9004,reciterName:'علي الحذيفي',surah:2,ayah:1
    } : {
        provider:'mp3quran',reciterId:22,reciterName:'القارئ المختار',
        server:'https://server.mp3quran.net/test/',moshafId:44,
        moshafName:'حفص',availableSurahs:[2],surah:2,ayah:1
    };
    const engine = {
        state, trackUrl: selected==='mp3' ? 'https://server.mp3quran.net/test/002.mp3' : '',
        audio:{readyState:1,currentTime:0,addEventListener(){}},
        prepareVersion:1,
        snapshot(){return {...this.state};},
        async goTo(surah,ayah,options){calls.push(['goTo',surah,ayah,options]);this.state.surah=surah;this.state.ayah=ayah;return !alignedFails;},
        async selectAligned(id,options){
            calls.push(['selectAligned',id,options]);
            this.state={...this.state,provider:'quran-foundation',reciterId:id,
                reciterName:id===9004?'علي الحذيفي':'قارئ متزامن آخر',surah:options.surah,ayah:options.ayah};
            return true;
        },
        async selectMp3(reciter,moshaf,options){
            calls.push(['selectMp3',reciter.id,options]);
            this.state={...this.state,provider:'mp3quran',reciterId:reciter.id,
                reciterName:reciter.name,server:moshaf.server,availableSurahs:moshaf.surahs,
                surah:options.surah,ayah:1};
            this.trackUrl=core.mp3Url(moshaf,options.surah);
            this.prepareVersion++;
            return true;
        },
        persist(){calls.push(['persist']);},
        async play(){calls.push(['play']);return true;},
        __syncMp3QuranAyah(){calls.push(['sync']);}
    };
    const downloads = {
        list:()=>saved,
        async has(url){calls.push(['has',url]);return saved.some(row=>row.url===url);}
    };
    const qud = {
        reciters:[{id:9004,name:'علي الحذيفي',channel:'mp3quran'}],
        async loadChapter(){return {audioUrl:selectedUrl};},
        async matchMp3Track(url){calls.push(['match',url]);return typeof qudMatch === 'function' ? qudMatch(url) : qudMatch;}
    };
    const mp3Timing = {
        normalizedFolder:value=>value,
        async chapterForRecording(url,surah){calls.push(['timing',url,surah]);return typeof timing === 'function' ? timing(url,surah) : timing;}
    };
    const window = {
        QuranAudio:core,
        QuranDownloads:{canDownloadTrack: item=>item.url?.startsWith('https://server')},
        QuranQud:qud,QuranMp3AyahTiming:mp3Timing
    };
    vm.runInNewContext(source,{window,navigator:{onLine:!offline},URL,Number,console});
    const catalog=[{id:22,name:'القارئ المختار',moshaf:[
        {id:44,server:'https://server.mp3quran.net/test/',surahs:[2],name:'حفص'}
    ]}];
    const listener=window.QuranVerseListen.create({engine,downloads,getCatalog:()=>catalog});
    return {listener,engine,calls};
}

test('selected synchronized reader never switches to downloaded Maher on Android',async()=>{
    const maher=track('https://server.mp3quran.net/maher/002.mp3',45,'ماهر');
    const {listener,calls,engine}=setup({offline:false,saved:[maher]});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.switched,false);
    assert.equal(result.downloaded,false);
    assert.equal(engine.state.ayah,3);
    assert.deepEqual(calls.find(row=>row[0]==='goTo').slice(1,3),[2,3]);
    assert.equal(calls.some(row=>row[0]==='selectMp3'||row[0]==='match'||row[0]==='has'),false);
});
test('online aligned reader does not run unrelated connectivity probes',async()=>{
    const {listener,calls}=setup({offline:false});
    assert.equal((await listener.listen(2,3)).ok,true);
    assert.equal(calls.some(row=>row[0]==='goTo'),true);
});
test('failed aligned playback never triggers downloaded alternate reciter',async()=>{
    const maher=track('https://server.mp3quran.net/maher/002.mp3',45,'ماهر');
    const {listener,calls}=setup({offline:true,saved:[maher],alignedFails:true});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,false);
    assert.equal(result.offline,true);
    assert.equal(calls.some(row=>row[0]==='selectMp3'||row[0]==='match'||row[0]==='play'),false);
});
test('online failed aligned playback is not mislabelled offline',async()=>{
    const {listener}=setup({offline:false,alignedFails:true});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,false);
    assert.equal(result.offline,false);
    assert.match(result.message,/تعذّر/);
});
test('selected MP3 with official ayah timing plays from requested ayah',async()=>{
    const savedTrack=track('https://server.mp3quran.net/test/002.mp3',22,'القارئ المختار');
    const {listener,engine,calls}=setup({offline:true,selected:'mp3',saved:[savedTrack],timing:chapters});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.switched,false);
    assert.equal(engine.audio.currentTime,6);
    assert.equal(engine.state.ayah,3);
    assert.equal(engine.currentTiming.timestampFrom,6000);
    assert.ok(calls.some(row=>row[0]==='play'));
});
test('untimed downloaded MP3 does not start at beginning during exact-ayah action',async()=>{
    const savedTrack=track('https://server.mp3quran.net/test/002.mp3',22,'القارئ المختار');
    const {listener,engine,calls}=setup({offline:true,selected:'mp3',saved:[savedTrack]});
    engine.audio.currentTime=36;
    const result=await listener.listen(2,3);
    assert.equal(result.ok,false);
    assert.equal(result.offline,true);
    assert.equal(engine.audio.currentTime,36);
    assert.equal(calls.some(row=>row[0]==='selectMp3'||row[0]==='play'),false);
});
test('online untimed MP3 reports unavailable timing without switching or restarting',async()=>{
    const {listener,engine,calls}=setup({offline:false,selected:'mp3'});
    engine.audio.currentTime=53;
    const result=await listener.listen(2,3);
    assert.equal(result.ok,false);
    assert.equal(result.offline,false);
    assert.match(result.message,/توقيتات/);
    assert.equal(engine.audio.currentTime,53);
    assert.equal(calls.some(row=>row[0]==='selectMp3'||row[0]==='selectAligned'),false);
});
test('different downloaded timed MP3 never overrides chosen MP3',async()=>{
    const other=track('https://server.mp3quran.net/other/002.mp3',87,'ماهر');
    const {listener,calls}=setup({offline:false,selected:'mp3',saved:[other],
        timing:folder=>folder.includes('/other/')?chapters:null});
    assert.equal((await listener.listen(2,3)).ok,false);
    assert.equal(calls.some(row=>row[0]==='selectMp3'),false);
    assert.equal(calls.some(row=>row[0]==='match'&&row[1]===other.url),false);
});
test('QUD word timing for exactly the selected MP3 remains supported',async()=>{
    const {listener,calls}=setup({offline:false,selected:'mp3',
        qudMatch:{id:9004,name:'القارئ المختار'}});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.switched,false);
    assert.equal(calls.find(row=>row[0]==='selectAligned')[1],9004);
});
test('invalid verse rejected before playback',async()=>{
    const {listener,calls}=setup();
    const result=await listener.listen(2,287);
    assert.equal(result.ok,false);
    assert.equal(calls.length,0);
});
