// Run with Playwright installed and the app served on http://127.0.0.1:8765.
const { chromium } = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.join(__dirname, '..');
const verses = fs.readFileSync(path.join(root,'data/quran-uthmani.txt'),'utf8').split(/\r?\n/).filter(x=>/^\d+\|/.test(x)).map(x=>{const [s,a,...t]=x.split('|');return {s:+s,a:+a,t:t.join('|')}});
const starts=JSON.parse(fs.readFileSync(path.join(root,'data/verse-to-page.json'))).map(x=>verses.findIndex(v=>v.s===x.surah&&v.a===x.ayah));
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:320,height:568},reducedMotion:'reduce'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8765/quran.html');await page.waitForSelector('.surah-heading');await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('#loading-screen',{state:'detached'});
 let headers=0, basmalas=0;
 for(let n=1;n<=604;n++){
  const expected=verses.slice(starts[n-1],starts[n]??verses.length);
  const state=await page.evaluate(()=>{
   const el=document.querySelector('#quran-text'),c=el.cloneNode(true);
   c.querySelectorAll('.surah-heading,.ayah-marker').forEach(x=>x.remove());
   return {text:c.textContent.replace(/\s+/g,' ').trim(), heads:[...el.querySelectorAll('.surah-heading')].map(x=>+x.dataset.surah),basmalas:el.querySelectorAll('.surah-basmala').length,markers:el.querySelectorAll('.ayah-marker').length,width:el.clientWidth,scroll:el.scrollWidth};
  });
  assert.equal(state.text,expected.map(v=>v.t).join(' ').replace(/\s+/g,' ').trim(),`text page ${n}`);
  assert.deepEqual(state.heads,expected.filter(v=>v.a===1).map(v=>v.s));
  assert.equal(state.markers,expected.length);
  assert.equal(state.basmalas,expected.filter(v=>v.a===1&&v.s!==9).length);
  assert.ok(state.scroll<=state.width+1,`horizontal clipping page ${n}`);
  headers+=state.heads.length;basmalas+=state.basmalas;
  if(n<604)await page.evaluate(()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'})));
 }
 assert.equal(headers,114);assert.equal(basmalas,113);
 const targets=[1,2,3,50,106,187,221,255,282,293,480,582,601,602,603,604];
 for(const [width,height] of [[320,568],[360,640],[390,844],[430,932],[768,1024],[844,390]]){
  await page.setViewportSize({width,height});
  for(const theme of ['paper','dark'])for(const n of targets){
   await page.evaluate(({n,theme})=>{localStorage.setItem('quranReaderState',JSON.stringify({displayPage:n}));localStorage.setItem('quranReaderSettings',JSON.stringify({fontSize:48,lineHeight:2.05,theme}));},{n,theme});
   await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ayah-marker').length>0);await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('#loading-screen',{state:'detached'});
   const r=await page.evaluate(()=>{const e=document.querySelector('#quran-text');e.scrollTop=e.scrollHeight;const last=e.querySelector('.ayah-end-group:last-child');const er=e.getBoundingClientRect(),lr=last.getBoundingClientRect();return {w:e.clientWidth,sw:e.scrollWidth,bottom:lr.bottom,edge:er.bottom,overflow:getComputedStyle(e).overflowY,number:JSON.parse(localStorage.quranReaderState).displayPage};});
   assert.ok(r.sw<=r.w+1,`width ${width} ${theme} page ${n}`);assert.ok(r.bottom<=r.edge+1,`last verse ${width} ${n}`);assert.equal(r.overflow,'auto');assert.equal(r.number,n);
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(()=>localStorage.setItem('quranReaderState',JSON.stringify({displayPage:2})));
 await page.reload();await page.waitForSelector('.surah-heading');await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('#loading-screen',{state:'detached'});
 await page.screenshot({path:path.join(process.env.QURAN_SCREENSHOT_DIR || require('node:os').tmpdir(),'quran-dark.png')});
 await page.evaluate(()=>{const el=document.querySelector('#reader-stage');el.dispatchEvent(new PointerEvent('pointerdown',{clientX:100,clientY:300}));el.dispatchEvent(new PointerEvent('pointerup',{clientX:250,clientY:305}));});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.quranReaderState).displayPage),3);
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ayah-marker').length>0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.quranReaderState).displayPage),3);
 await page.evaluate(()=>document.body.classList.add('tools-visible'));await page.click('#open-settings');await page.click('[data-theme-choice="paper"]');await page.fill('#font-size-range','40');await page.click('#close-settings');
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.ayah-marker').length>0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.quranReaderSettings).fontSize),40);assert.equal(await page.getAttribute('body','data-theme'),'paper');
 await page.evaluate(()=>localStorage.setItem('quranReaderState',JSON.stringify({displayPage:2})));await page.reload();await page.waitForSelector('.surah-heading');await page.evaluate(()=>document.fonts.ready);await page.waitForSelector('#loading-screen',{state:'detached'});await page.screenshot({path:path.join(process.env.QURAN_SCREENSHOT_DIR || require('node:os').tmpdir(),'quran-light.png')});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({pages:604,verses:verses.length,headers,basmalas,layoutChecks:192,viewports:6,themes:2,swipeAndPersistence:'PASS',consoleErrors:errors}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
