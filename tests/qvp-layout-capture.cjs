// Reproduce the review images. Optional QVP_BEFORE_URL serves a detached
// b243297 worktree; QURAN_BASE_URL serves this branch (both with prepared data).
'use strict';
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const out=path.resolve(process.env.QVP_CAPTURE_DIR||'artifacts/qvp-spacing');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.QURAN_BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  fs.mkdirSync(out,{recursive:true});
  for(const [name,url] of [['before',process.env.QVP_BEFORE_URL],['after',process.env.QURAN_BASE_URL||'http://127.0.0.1:4173']]){
   if(!url)continue;
   const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
   await context.route('https://**/*',r=>r.abort());
   const page=await context.newPage();
   await page.addInitScript(()=>{
    localStorage.setItem('ayat-tour-done-quran-v8','1');localStorage.setItem('ayat-tour-optout-quran-v8','1');localStorage.setItem('ayat-longpress-guide-complete-v1','1');
    localStorage.setItem('quranReaderSettings',JSON.stringify({theme:'paper'}));
   });
   await page.goto(url+'/quran.html');await page.waitForFunction(()=>window.mushafQvp?.metrics.ready);
   for(const number of [1,2,3,604]){
    await page.evaluate(n=>mushafQvp.navigate(n),number);await page.waitForTimeout(150);
    await page.screenshot({path:path.join(out,`${name}-${number}.png`)});
   }
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
