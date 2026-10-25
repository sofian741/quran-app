#!/usr/bin/env node
'use strict';
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=process.env.QURAN_BASE_URL||'http://127.0.0.1:4173';
const browserPath=process.env.QURAN_BROWSER_PATH||'/usr/bin/chromium';
const guard=setTimeout(()=>{console.error('Floating audio browser regression timed out');process.exit(1)},120000);
guard.unref();
const catalog={reciters:[{id:7,name:'مشاري راشد العفاسي',moshaf:[{
  id:71,name:'حفص',server:'https://server.mp3quran.net/afs/',surah_list:'1,2,3'
}]}]};
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:browserPath,args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
    page.setDefaultTimeout(12000);
    page.setDefaultNavigationTimeout(12000);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{
      const KEY='testAndroidPlayback';
      const get=()=>JSON.parse(localStorage.getItem(KEY)||'{"active":false}');
      const put=s=>localStorage.setItem(KEY,JSON.stringify(s));
      window.Capacitor={
        isNativePlatform:()=>true,
        registerPlugin:name=>name!=='QuranFloatingAudio'?null:{
          async status(){return get()},
          async start(p){put({active:true,playing:p.autoplay,loading:false,
            title:p.titles[p.index],artist:p.artist,index:p.index,count:p.urls.length,
            position:p.position,duration:120000,url:p.urls[p.index],titles:p.titles,urls:p.urls})},
          async stop(){put({active:false})},
          async play(){put({...get(),playing:true})},
          async pause(){put({...get(),playing:false})},
          async next(){const s=get();const i=Math.min(s.count-1,s.index+1);
            put({...s,index:i,title:s.titles[i],url:s.urls[i],position:0})},
          async previous(){const s=get();const i=Math.max(0,s.index-1);
            put({...s,index:i,title:s.titles[i],url:s.urls[i],position:0})}
        }
      };
      const state=new WeakMap();
      const media=el=>{if(!state.has(el))state.set(el,{paused:true,currentTime:0});return state.get(el)};
      Object.defineProperties(HTMLMediaElement.prototype,{
        paused:{configurable:true,get(){return media(this).paused}},
        currentTime:{configurable:true,get(){return media(this).currentTime},
          set(value){media(this).currentTime=Number(value)||0}},
        duration:{configurable:true,get(){return 120}}
      });
      HTMLMediaElement.prototype.load=function(){
        this.dispatchEvent(new Event('loadstart'));
        queueMicrotask(()=>this.dispatchEvent(new Event('loadedmetadata')));
      };
      HTMLMediaElement.prototype.play=function(){
        media(this).paused=false;this.dispatchEvent(new Event('play'));
        this.dispatchEvent(new Event('playing'));return Promise.resolve();
      };
      HTMLMediaElement.prototype.pause=function(){
        const was=media(this).paused;media(this).paused=true;
        if(!was)this.dispatchEvent(new Event('pause'));
      };
    });
    await page.route('https://mp3quran.net/api/**',route=>route.fulfill({
      status:200,contentType:'application/json',body:JSON.stringify(catalog)
    }));
    await page.goto(base+'/recitations.html',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>!!document.querySelector('#surah-select option'));
    await page.click('#play-pause');
    await page.waitForFunction(()=>!document.querySelector('#recitation-audio').paused);
    await page.click('a.my-library-card');
    await page.waitForURL('**/library.html');
    await page.waitForFunction(()=>document.getElementById('ayat-floating-audio') &&
      !document.getElementById('ayat-floating-audio').hidden);
    // First-run guided tour is a separate modal; isolate the audio control test.
    await page.addStyleTag({content:'.ayat-tour-root{display:none!important}'});
    assert.match(await page.locator('#ayat-floating-title').textContent(),/سورة/);
    await page.click('[data-floating="toggle"]');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('testAndroidPlayback')).playing),false);
    await page.click('[data-floating="toggle"]');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('testAndroidPlayback')).playing),true);
    await page.click('[data-floating="next"]');
    assert.match(await page.locator('#ayat-floating-title').textContent(),/البقرة/);
    await page.click('[data-floating="collapse"]');
    assert.equal(await page.locator('#ayat-floating-audio').getAttribute('class'),'ayat-floating-audio is-collapsed');
    await page.click('.ayat-floating-bubble');
    assert.equal(await page.locator('#ayat-floating-audio').getAttribute('class'),'ayat-floating-audio');
    await page.click('.ayat-floating-info');
    await page.waitForURL('**/recitations.html');
    await page.waitForFunction(()=>document.getElementById('surah-select').value==='2');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('testAndroidPlayback')).active),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: native recitation handoff, cross-page mini controls, collapse, next, and return restore');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
