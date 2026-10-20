const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require('/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }

const root = path.resolve(__dirname, '..');
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.woff2':'font/woff2' };
const server = http.createServer((request,response)=>{
  const pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  const relative=pathname==='/'?'index.html':pathname.replace(/^\/+/,'');
  const file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){
    response.writeHead(404).end('Not found');return;
  }
  response.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(response);
});
const lesson = page=>page.locator('#ayat-tour-root > .ayat-tour-card');
const invite = page=>page.locator('#ayat-tour-root > .ayat-tour-invite');
const title = async page=>{
  await page.waitForFunction(()=>{
    const card=document.querySelector('#ayat-tour-root > .ayat-tour-card');
    return card && !card.hidden && card.style.visibility==='visible';
  });
  return lesson(page).locator('.ayat-tour-title').textContent();
};
async function preparePage(browser){
  const context=await browser.newContext({viewport:{width:393,height:852},serviceWorkers:'allow'});
  const page=await context.newPage();
  // Keep the first-launch hand gesture and brand splash out of this tour test.
  await page.addInitScript(()=>{
    localStorage.setItem('ayat-longpress-guide-complete-v1','1');
    sessionStorage.setItem('ayat-brand-splash-shown','1');
  });
  return {context,page};
}
async function begin(page,url,name){
  await page.goto(url);
  await invite(page).waitFor({state:'visible'});
  assert.match(await invite(page).textContent(),new RegExp(name));
  await invite(page).locator('[data-tour-action="begin"]').click();
}
async function tapNext(page){
  await page.locator('#ayat-tour-root > .ayat-tour-hit').click();
}
async function testIndependentPages(browser,origin){
  const {context,page}=await preparePage(browser);
  await begin(page,origin+'/index.html','الرئيسية');
  assert.match(await title(page),/متابعة القراءة/);
  assert.equal(await page.locator('#ayat-tour-root .ayat-tour-quiz').count(),0,'Home is an explanation, not a quiz');
  assert.match(await page.locator('link[href^="tour-home.css"]').getAttribute('href'),/tour-home\.css\?v=50$/);
  assert.equal(await lesson(page).locator('[data-tour-action="home-next"]').isVisible(),true);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  await page.waitForFunction(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent==='آية للتدبّر');
  assert.match(await title(page),/آية للتدبّر/);
  assert.equal(await page.locator('#ayat-tour-root .ayat-tour-spot.is-verse').isVisible(),true,'Real verse should receive the unique gold spotlight');
  await page.locator('#ayat-tour-root > .ayat-tour-hit').click();
  await page.locator('#ayat-tour-root .ayat-tour-verse-sheet').waitFor({state:'visible'});
  const realVerse=await page.locator('.home-verse blockquote').textContent();
  const previewVerse=await page.locator('#ayat-tour-root .ayat-tour-verse-sheet blockquote').textContent();
  assert.equal(previewVerse,realVerse,'Reflection preview must display the real daily verse');
  await page.locator('[data-tour-action="verse-next"]').click();
  await page.waitForFunction(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent==='الذهاب للآية');
  assert.match(await title(page),/الذهاب للآية/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  await page.waitForFunction(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent==='التفسير');
  assert.match(await title(page),/التفسير/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  await page.waitForFunction(()=>localStorage.getItem('ayat-tour-done-home-v6')==='1');
  assert.match(page.url(),/index\.html$/,'The home tutorial must never navigate away');
  await page.reload();
  assert.equal(await invite(page).isVisible(),false,'Completed tutorial waits 12 hours before reappearing');
  await begin(page,origin+'/recitations.html','التلاوات');
  assert.match(await title(page),/عالم من الأصوات/);
  await tapNext(page);
  assert.match(await title(page),/نختار صح/);
  await lesson(page).locator('[data-tour-answer="0"]').click();
  assert.match(await title(page),/بدون إنترنت/);
  await tapNext(page);await title(page);
  assert.match(await title(page),/فين تلاواتك/);
  await tapNext(page);
  await page.waitForFunction(()=>localStorage.getItem('ayat-tour-done-recitations-v5')==='1');
  assert.match(page.url(),/recitations\.html$/,'Recitations tutorial must never navigate to library');
  await page.goto(origin+'/library.html');
  await invite(page).waitFor({state:'visible'});
  assert.match(await invite(page).textContent(),/مكتبتي/);
  await invite(page).locator('[data-tour-action="later"]').click();
  assert.equal(await invite(page).isVisible(),false);
  await page.goto(origin+'/adhkar.html');
  await invite(page).waitFor({state:'visible'});
  assert.match(await invite(page).textContent(),/الأذكار/);
  await context.close();
}
async function testQuranFromSettings(browser,origin){
  const {context,page}=await preparePage(browser);
  await page.goto(origin+'/quran.html');
  await page.waitForFunction(()=>document.querySelector('#quran-text')?.dataset.layoutState==='ready');
  assert.match(await page.locator('script[src^="tour.js"]').getAttribute('src'),/tour\.js\?v=48$/);
  await invite(page).waitFor({state:'visible'});
  await invite(page).locator('[data-tour-action="later"]').click();
  await page.locator('#reader-stage').click({position:{x:190,y:300}});
  await page.locator('#open-settings').click();
  await page.waitForSelector('#settings-sheet.is-open');
  await page.locator('#ayat-tour-settings-button').click();
  await page.locator('[data-tour-action="replay-quran"]').click();
  assert.match(await title(page),/جرّب تقليب الصفحة/);
  assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'),'true');
  assert.equal(await page.evaluate(()=>localStorage.getItem('ayat-tour-step-quran-v5')),'0');
  const pad=lesson(page).locator('[data-tour-skill="swipe"]');
  const r=await pad.boundingBox();
  await page.mouse.move(r.x+r.width*.75,r.y+r.height*.5);
  await page.mouse.down();
  await page.mouse.move(r.x+r.width*.2,r.y+r.height*.5,{steps:8});
  await page.mouse.up();
  assert.match(await title(page),/الضغط المطوّل/);
  const hold=lesson(page).locator('[data-tour-skill="hold"]');
  const p=await hold.boundingBox();
  await page.mouse.move(p.x+p.width/2,p.y+p.height/2);
  await page.mouse.down();
  await page.waitForTimeout(850);
  await page.mouse.up();
  assert.match(await title(page),/الفهرس/);
  await context.close();
}
async function testOfflineNoHandoff(browser,origin){
  const {context,page}=await preparePage(browser);
  await page.goto(origin+'/index.html');
  await page.evaluate(async()=>{
    await navigator.serviceWorker.ready;
    if(!navigator.serviceWorker.controller){
      await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
    }
  });
  await page.goto(origin+'/recitations.html');
  await invite(page).waitFor({state:'visible'});
  await context.setOffline(true);
  await invite(page).locator('[data-tour-action="begin"]').click();
  assert.match(await title(page),/عالم من الأصوات/);
  await tapNext(page);
  assert.match(await title(page),/نختار صح/);
  assert.match(page.url(),/recitations\.html$/);
  await context.close();
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    await testIndependentPages(browser,origin);
    await testQuranFromSettings(browser,origin);
    await testOfflineNoHandoff(browser,origin);
    console.log('Independent page discovery browser tests passed.');
  }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);server.close();process.exitCode=1;});
