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

function setup({offline=false, saved=[], selected='aligned', qudMatch=null, timing=null}={}) {
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
        async goTo(surah,ayah,options){calls.push(['goTo',surah,ayah,options]);this.state.surah=surah;this.state.ayah=ayah;return true;},
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

test('offline without downloaded audio shows explicit connection/download guidance and never switches reciter',async()=>{
    const {listener,calls}=setup({offline:true});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,false);
    assert.equal(result.offline,true);
    assert.match(result.message,/غير متصل بالإنترنت/);
    assert.match(result.message,/حمّل/);
    assert.equal(calls.some(row=>row[0]==='selectAligned'||row[0]==='goTo'),false);
});

test('selected aligned reader uses its downloaded matching MP3Quran chapter at the exact ayah',async()=>{
    const {listener,calls}=setup({offline:true,saved:[track()]});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.downloaded,true);
    assert.equal(result.kind,'word');
    assert.equal(result.switched,false);
    assert.deepEqual(calls.find(row=>row[0]==='goTo').slice(1,3),[2,3]);
});

test('another downloaded exact QUD reader is chosen rather than hardcoded Mishary',async()=>{
    const {listener,calls}=setup({offline:true,selected:'mp3',
        saved:[track()],qudMatch:{id:9004,name:'علي الحذيفي'}});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.switched,true);
    assert.equal(result.name,'علي الحذيفي');
    assert.equal(calls.find(row=>row[0]==='selectAligned')[1],9004);
    assert.equal(calls.some(row=>row[0]==='selectAligned'&&row[1]===7),false);
});

test('downloaded MP3Quran recording with official ayah timing seeks exact start, no fake word timing',async()=>{
    const savedTrack=track('https://server.mp3quran.net/test/002.mp3',22,'القارئ المختار');
    const {listener,engine,calls}=setup({offline:true,selected:'mp3',
        saved:[savedTrack],timing:chapters});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.kind,'ayah');
    assert.equal(result.switched,false);
    assert.equal(engine.audio.currentTime,6);
    assert.equal(engine.state.ayah,3);
    assert.equal(engine.currentTiming.timestampFrom,6000);
    assert.equal(engine.currentTiming.segments,undefined);
    assert.ok(calls.some(row=>row[0]==='play'));
});

test('offline downloaded recording without matching timing plays from surah start, no invented highlighting',async()=>{
    const {listener,engine,calls}=setup({offline:true,selected:'mp3',
        saved:[track('https://server.mp3quran.net/test/002.mp3',22,'القارئ المختار')]});
    engine.audio.currentTime=36;
    engine.currentTiming=chapters.verses[2];
    engine.__mp3AyahChapter=chapters;
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.downloaded,true);
    assert.equal(result.kind,'surah-start');
    assert.equal(result.startedAtBeginning,true);
    assert.equal(result.switched,false);
    assert.equal(engine.audio.currentTime,0);
    assert.equal(engine.state.ayah,1);
    assert.equal(engine.currentTiming,null);
    assert.equal(engine.__mp3AyahChapter,null);
    assert.ok(calls.some(row=>row[0]==='play'));
    assert.equal(calls.some(row=>row[0]==='selectAligned'),false);
});

test('prefer another saved word-timed reader over selected saved unsynced reader',async()=>{
    const unsynced=track('https://server.mp3quran.net/test/002.mp3',22,'القارئ المختار');
    const synced=track('https://server7.mp3quran.net/sync/002.mp3',9004,'علي الحذيفي');
    const {listener,calls}=setup({offline:true,selected:'mp3',saved:[unsynced,synced],
        qudMatch:url=>url===synced.url?{id:9004,name:'علي الحذيفي'}:null});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.kind,'word');
    assert.equal(result.downloaded,true);
    assert.equal(result.switched,true);
    assert.equal(calls.find(row=>row[0]==='selectAligned')[1],9004);
    assert.equal(calls.some(row=>row[0]==='selectMp3'),false);
});

test('prefer saved official verse timing over untimed selected recording',async()=>{
    const unsynced=track('https://server.mp3quran.net/test/002.mp3',22,'القارئ المختار');
    const timed=track('https://server8.mp3quran.net/timed/002.mp3',87,'قارئ بتوقيت الآيات');
    const {listener,calls}=setup({offline:true,selected:'mp3',saved:[unsynced,timed],
        timing:folder=>folder.includes('/timed/')?chapters:null});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.kind,'ayah');
    assert.equal(result.downloaded,true);
    assert.equal(result.switched,true);
    assert.equal(calls.find(row=>row[0]==='selectMp3')[1],87);
});

test('prefer saved word-level timing over another saved verse-only recording',async()=>{
    const verse=track('https://server8.mp3quran.net/timed/002.mp3',87,'قارئ بتوقيت الآيات');
    const word=track('https://server7.mp3quran.net/sync/002.mp3',9004,'علي الحذيفي');
    const {listener,calls}=setup({offline:true,selected:'mp3',saved:[verse,word],
        qudMatch:url=>url===word.url?{id:9004,name:'علي الحذيفي'}:null,
        timing:folder=>folder.includes('/timed/')?chapters:null});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.kind,'word');
    assert.equal(calls.some(row=>row[0]==='selectMp3'),false);
});

test('if no timed recording exists, prefer the currently selected saved reader for surah-start fallback',async()=>{
    const other=track('https://server8.mp3quran.net/other/002.mp3',87,'قارئ آخر');
    const selectedTrack=track('https://server.mp3quran.net/test/002.mp3',22,'القارئ المختار');
    other.savedAt=999;
    const {listener,calls}=setup({offline:true,selected:'mp3',saved:[other,selectedTrack]});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.kind,'surah-start');
    assert.equal(result.name,'القارئ المختار');
    assert.equal(result.switched,false);
    assert.equal(calls.some(row=>row[0]==='selectMp3'),false);
});

test('online no downloads streams the selected aligned reader without a forced default',async()=>{
    const {listener,calls}=setup({offline:false});
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.downloaded,false);
    assert.equal(calls.find(row=>row[0]==='goTo')[2],3);
    assert.equal(calls.some(row=>row[0]==='selectAligned'),false);
});

test('online selected MP3 without exact timing starts from first ayah with explanation flag',async()=>{
    const {listener,engine,calls}=setup({offline:false,selected:'mp3'});
    engine.audio.currentTime=53;
    const result=await listener.listen(2,3);
    assert.equal(result.ok,true);
    assert.equal(result.kind,'surah-start');
    assert.equal(result.downloaded,false);
    assert.equal(result.startedAtBeginning,true);
    assert.equal(result.switched,false);
    assert.equal(engine.audio.currentTime,0);
    assert.equal(engine.state.ayah,1);
    assert.equal(calls.some(row=>row[0]==='selectAligned'),false);
});

test('invalid verse is rejected without any playback',async()=>{
    const {listener,calls}=setup();
    const result=await listener.listen(2,287);
    assert.equal(result.ok,false);
    assert.equal(calls.length,0);
});
