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
  assert.equal(await page.locator('#ayat-tour-root .ayat-tour-quiz').count(),0,'No home quizzes');
  assert.match(await page.locator('link[href^="tour-home.css"]').getAttribute('href'),/tour-home\.css\?v=59$/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/آية للتدبّر/);
  assert.equal(await page.locator('#ayat-tour-root .ayat-tour-spot.is-verse').isVisible(),true);
  await page.locator('#ayat-tour-root > .ayat-tour-hit').click();
  await page.locator('#ayat-tour-root .ayat-tour-verse-sheet').waitFor({state:'visible'});
  const realVerse=await page.locator('.home-verse blockquote').textContent();
  const previewVerse=await page.locator('#ayat-tour-root .ayat-tour-verse-sheet blockquote').textContent();
  assert.equal(previewVerse,realVerse,'The reflection sheet must show the real daily verse');
  await page.locator('[data-tour-action="verse-next"]').click();
  assert.match(await title(page),/الذهاب للآية/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/التفسير/);
  for(const [label,selector] of [
    ['الرئيسية','.home-bottom-nav a[href="index.html"]'],
    ['المصحف','.home-bottom-nav a[href="quran.html"]'],
    ['التلاوات','.home-bottom-nav a[href="recitations.html"]'],
    ['الأذكار','.home-bottom-nav a[href="adhkar.html"]']
  ]){
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.equal(await title(page),label,'Home must explain each bottom tab: '+label);
    assert.equal(await page.locator(selector).count(),1);
    assert.equal(await page.locator('#ayat-tour-root > .ayat-tour-spot').isVisible(),true);
  }
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  await page.waitForFunction(()=>localStorage.getItem('ayat-tour-done-home-v8')==='1');
  assert.equal(await page.locator('.ayat-tour-complete').count(),0,'Home guide ends without a toast');
  assert.match(page.url(),/index\.html$/,'Home guide must not navigate');
  await page.reload();
  assert.equal(await invite(page).isVisible(),false,'Completed home guide does not reappear');
  await page.locator('#home-settings-toggle').click();
  assert.equal(await page.locator('#home-settings-panel').isVisible(),true);
  assert.equal(await page.locator('#check-app-update').isVisible(),true);
  await page.locator('#home-show-tour').click();
  assert.equal(await page.locator('#home-settings-panel').isVisible(),false);
  for(const key of ['home','quran','recitations','library','adhkar']){
    assert.equal(await page.locator('[data-tour-action="replay-'+key+'"]').count(),1,'Settings must offer '+key);
  }
  await page.locator('[data-tour-action="replay-home"]').click();
  assert.match(await title(page),/متابعة القراءة/);
  await lesson(page).locator('[data-tour-action="pause"]').click();
  await begin(page,origin+'/recitations.html','القرّاء');
  assert.match(await title(page),/القرّاء موجودين تحت/);
  assert.equal(await lesson(page).locator('.ayat-tour-reciter-motion svg').isVisible(),true,'Vertical guide hand must be visible');
  assert.equal(await page.locator('.recitations-jump').isVisible(),true,'Permanent jump link must be discoverable');
  await lesson(page).locator('[data-tour-action="recitations-reveal"]').click();
  await page.waitForFunction(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent?.includes('اختار القارئ'));
  assert.match(await title(page),/اختار القارئ/);
  assert.equal(await page.locator('#ayat-tour-root').evaluate(el=>el.classList.contains('is-choose-reciter')),true,'Reader list must be touchable');
  if(await page.locator('#reciter-list .reciter-card').count()){
    await page.locator('#reciter-list .reciter-card').first().click();
  }else{
    await lesson(page).locator('[data-tour-action="home-next"]').click();
  }
  await page.waitForFunction(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent==='اختيار السورة');
  assert.match(await title(page),/اختيار السورة/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/تشغيل التلاوة/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/تنزيل سورة واحدة/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/تنزيل مصحف القارئ/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/مكتبتي/);
  assert.equal(await page.locator('#batch-progress').isVisible(),false,'Guide must not trigger a bulk download');
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  await page.waitForFunction(()=>localStorage.getItem('ayat-tour-done-recitations-v7')==='1');
  assert.match(page.url(),/recitations\.html$/,'Recitations guide must remain on its page');
  await page.goto(origin+'/library.html');
  await invite(page).waitFor({state:'visible'});
  assert.match(await invite(page).textContent(),/المكتبة الصوتية/);
  await invite(page).locator('[data-tour-action="later"]').click();
  assert.equal(await invite(page).isVisible(),false);
  await page.goto(origin+'/adhkar.html');
  await invite(page).waitFor({state:'visible'});
  assert.match(await invite(page).textContent(),/الأذكار/);
  await context.close();
}
async function testAdhkarGuide(browser,origin){
  const {context,page}=await preparePage(browser);
  await begin(page,origin+'/adhkar.html','الأذكار');
  assert.match(await title(page),/باقي الأذكار موجودة تحت/);
  assert.equal(await page.locator('#filters [data-filter]').first().getAttribute('data-filter'),'saved','Favorites should be the first filter');
  assert.equal(await page.locator('.adhkar-jump').isVisible(),true,'Chapter list has a direct jump');
  assert.equal(await lesson(page).locator('.ayat-tour-reciter-motion svg').isVisible(),true,'Downward finger animation should be present');
  await lesson(page).locator('[data-tour-action="adhkar-reveal"]').click();
  await page.waitForFunction(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent==='المفضلة أولًا');
  assert.equal(await page.locator('#ayat-tour-root > .ayat-tour-spot').isVisible(),true,'Favorites are highlighted');
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/فهرس الأذكار/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/افتح أذكار الصباح/);
  assert.equal(await page.locator('#ayat-tour-root > .ayat-tour-hit').isVisible(),true,'Real morning quick card is tappable');
  assert.equal(await lesson(page).locator('[data-tour-action="home-next"]').count(),0,'Opening morning adhkar must not offer Next');
  await page.evaluate(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card')?.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  assert.match(await title(page),/افتح أذكار الصباح/,'Random clicks must not bypass opening morning adhkar');
  await page.locator('#ayat-tour-root > .ayat-tour-hit').click();
  await page.waitForFunction(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent==='نص الذكر');
  assert.equal(await page.locator('#reader').isVisible(),true,'The real Adhkar reader must open');
  const actualChapterTitle=await page.locator('#reader-title').textContent();
  assert.match(actualChapterTitle,/أَذْكَارُ الصَّبَاحِ/,'The source chapter title is fully vocalized; the tour must still advance');
  assert.equal(await page.locator('#ayat-tour-root').evaluate(el=>el.classList.contains('is-opening-chapter')),false,'The stuck opening-chapter state must be cleared');
  assert.ok((await page.locator('#dhikr-text').textContent()).trim().length>10,'Reader displays a real dhikr');
  const startPosition=await page.locator('#reader-position').textContent();
  const favoriteBefore=await page.locator('#reader-favorite').getAttribute('aria-pressed');
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/عداد التكرار/);
  assert.equal(await page.locator('#tasbih-current').textContent(),'٠','Showing the counter must not increase it');
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/مرجع الذكر/);
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/القلب للمفضلة/);
  assert.equal(await page.locator('#reader-favorite').getAttribute('aria-pressed'),favoriteBefore,'Guide does not change favorites');
  await lesson(page).locator('[data-tour-action="home-next"]').click();
  assert.match(await title(page),/قلّب الذكر بإيدك/);
  assert.equal(await lesson(page).locator('[data-tour-action="home-next"]').count(),0,'Final step requires a real swipe, no Next button');
  assert.equal(await page.locator('#ayat-tour-root .ayat-tour-gesture.is-adhkar-swipe').isVisible(),true,'Rightward finger hint should appear');
  assert.equal(await page.locator('#ayat-tour-root .ayat-tour-shade').evaluate(el=>getComputedStyle(el).pointerEvents),'none','Reader must receive real pointer events');
  const r=await page.locator('#reader-viewport').boundingBox();
  const swipePoint=await page.evaluate(()=>{
    const viewport=document.getElementById('reader-viewport');
    const rect=viewport.getBoundingClientRect();
    for(let y=rect.top+20;y<rect.bottom-20;y+=24){
      const x=rect.left+rect.width*.23;
      const target=document.elementFromPoint(x,y);
      if(target&&viewport.contains(target)&&!target.closest('button,input,.tasbih,a,#ayat-tour-root'))return {x,y};
    }
    return null;
  });
  assert.ok(swipePoint,'A real, unobstructed dhikr reading point is available');
  const y=swipePoint.y;
  await page.locator('#reader-viewport').dispatchEvent('pointerdown',{pointerType:'mouse',pointerId:7,clientX:swipePoint.x,clientY:y,bubbles:true});
  await page.locator('#reader-viewport').dispatchEvent('pointerup',{pointerType:'mouse',pointerId:7,clientX:r.x+r.width*.76,clientY:y,bubbles:true});
  await page.waitForFunction(()=>localStorage.getItem('ayat-tour-done-adhkar-v7')==='1');
  assert.equal(await page.locator('#reader').isVisible(),true,'Reader stays open at the next real dhikr');
  assert.notEqual(await page.locator('#reader-position').textContent(),startPosition,'Real reader advances to the next item');
  assert.equal(await page.locator('.ayat-tour-complete').count(),0,'Guide finishes without a toast');
  await context.close();
}
async function waitTourTitle(page,pattern){
  await page.waitForFunction(source=>{
    const value=document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent||'';
    return new RegExp(source).test(value)&&document.querySelector('#ayat-tour-root > .ayat-tour-card')?.style.visibility==='visible';
  },pattern.source);
  return title(page);
}
async function nextQuranNote(page,expected){
  await lesson(page).locator('[data-tour-action="quran-next"]').click();
  assert.match(await waitTourTitle(page,expected),expected);
}
async function testManualCrossPageLaunch(browser,origin){
  const {context,page}=await preparePage(browser);
  await page.goto(origin+'/index.html');
  await page.locator('#home-settings-toggle').click();
  await page.locator('#home-show-tour').click();
  await page.locator('[data-tour-action="replay-quran"]').click();
  await page.waitForURL(/quran\.html/);
  assert.match(await waitTourTitle(page,/اضغط مطولًا على الآية/),/اضغط مطولًا على الآية/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ayat-tour-manual-request-v1')),null,'Manual handoff is cleared only after the destination lesson mounts');
  assert.equal(new URL(page.url()).searchParams.has('ayatHelp'),false,'Successful handoff removes its URL marker');
  await lesson(page).locator('[data-tour-action="pause"]').click();

  await page.locator('#reader-stage').click({position:{x:190,y:300}});
  await page.locator('#open-settings').click();
  await page.locator('#ayat-tour-settings-button').click();
  await page.locator('[data-tour-action="replay-recitations"]').click();
  await page.waitForURL(/recitations\.html/);
  assert.match(await waitTourTitle(page,/القرّاء موجودين تحت/),/القرّاء موجودين تحت/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('ayat-tour-manual-request-v1')),null);
  await lesson(page).locator('[data-tour-action="pause"]').click();

  for(const [destination,pattern] of [['library',/التلاوات المحفوظة/],['adhkar',/باقي الأذكار موجودة تحت/]]){
    await page.evaluate(()=>localStorage.setItem('ayat-tour-done-home-v8','1'));
    await page.goto(origin+'/index.html');
    await page.locator('#home-settings-toggle').click();
    await page.locator('#home-show-tour').click();
    await page.locator('[data-tour-action="replay-'+destination+'"]').click();
    await page.waitForURL(new RegExp(destination==='library'?'library\\.html':'adhkar\\.html'));
    assert.match(await waitTourTitle(page,pattern),pattern,'Manual Settings request starts '+destination+' after navigation');
    assert.equal(await page.evaluate(()=>localStorage.getItem('ayat-tour-manual-request-v1')),null);
    await lesson(page).locator('[data-tour-action="pause"]').click();
  }
  await context.close();
}
async function testQuranFromSettings(browser,origin){
  const {context,page}=await preparePage(browser);
  const securityErrors=[];
  page.on('console',message=>{if(/content security policy|refused to/i.test(message.text()))securityErrors.push(message.text());});
  page.on('pageerror',error=>securityErrors.push(error.message));
  await page.goto(origin+'/quran.html');
  await page.waitForFunction(()=>document.querySelector('#quran-text')?.dataset.layoutState==='ready');
  assert.match(await page.locator('script[src^="tour.js"]').getAttribute('src'),/tour\.js\?v=63$/);
  await invite(page).waitFor({state:'visible'});
  await invite(page).locator('[data-tour-action="later"]').click();
  const original=await page.evaluate(()=>({
    page:window.mushafReader.getCurrentPage(),
    pageMarker:localStorage.getItem('quranPageMarkerV1'),
    audioPaused:document.getElementById('mushaf-recitation-audio').paused
  }));
  await page.locator('#reader-stage').click({position:{x:190,y:300}});
  await page.locator('#open-settings').click();
  await page.waitForSelector('#settings-sheet.is-open');
  await page.locator('[data-theme-choice="dark"]').click();
  await page.locator('#ayat-tour-settings-button').click();
  await page.locator('[data-tour-action="replay-quran"]').click();
  assert.match(await waitTourTitle(page,/اضغط مطولًا على الآية/),/اضغط مطولًا على الآية/);
  assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'),'true');
  assert.ok(await page.locator('.ayat-tour-verse-target').count()>0,'A real mid-page verse is highlighted');
  assert.equal(await page.locator('#ayat-tour-root').evaluate(el=>el.classList.contains('is-quran-interactive')),true);
  assert.equal(await page.locator('.ayat-tour-shade').evaluate(el=>getComputedStyle(el).pointerEvents),'none','Real verse receives the long press');
  assert.equal(await page.locator('#ayat-tour-root > .ayat-tour-card').isVisible(),true,'Tour remains readable in dark mode');

  const word=page.locator('.ayat-tour-verse-target').first();
  const wordBox=await word.boundingBox();
  await page.mouse.move(wordBox.x+wordBox.width/2,wordBox.y+wordBox.height/2);
  await page.mouse.down();
  await page.waitForTimeout(650);
  await page.mouse.up();
  assert.match(await waitTourTitle(page,/كل ما تحتاجه للآية/),/كل ما تحتاجه للآية/);
  assert.equal(await page.locator('#verse-actions-sheet').getAttribute('aria-hidden'),'false','Real verse action sheet opens');
  assert.ok(await page.locator('.verse-highlight-band').count()>0,'The app highlights the genuinely selected verse');

  await nextQuranNote(page,/التفسير الميسّر/);
  await nextQuranNote(page,/ابدأ الاستماع من هنا/);
  await nextQuranNote(page,/حفظ ونسخ ومشاركة/);
  await nextQuranNote(page,/افتح الفهرس بنفسك/);
  await page.locator('#open-index').click();
  assert.match(await waitTourTitle(page,/السور والأجزاء والآيات/),/السور والأجزاء والآيات/);
  assert.equal(await page.locator('#index-sheet').getAttribute('aria-hidden'),'false');
  await nextQuranNote(page,/فاصلة الصفحة/);
  assert.equal(await page.locator('#index-sheet').getAttribute('aria-hidden'),'true');
  assert.equal(await page.evaluate(()=>localStorage.getItem('quranPageMarkerV1')),original.pageMarker,'Explaining the page marker does not alter it');
  await lesson(page).locator('[data-tour-action="pause"]').click();
  await page.evaluate(()=>{
    localStorage.setItem('ayat-tour-remind-at-quran-v7','0');
    localStorage.setItem('ayat-tour-last-shown-quran-v7','0');
  });
  await page.reload();
  await invite(page).waitFor({state:'visible'});
  await invite(page).locator('[data-tour-action="begin"]').click();
  assert.match(await waitTourTitle(page,/فاصلة الصفحة/),/فاصلة الصفحة/);
  await nextQuranNote(page,/افتح الإعدادات بنفسك/);
  await page.locator('#open-settings').click();
  assert.match(await waitTourTitle(page,/المحفوظات/),/المحفوظات/);
  assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'),'false');
  await nextQuranNote(page,/البحث عن آية/);
  await nextQuranNote(page,/افتح خيارات التلاوة/);
  assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'),'true');
  await page.locator('#audio-open-options').click();
  assert.match(await waitTourTitle(page,/اختيار القارئ/),/اختيار القارئ/);
  assert.equal(await page.locator('#audio-options-sheet').getAttribute('aria-hidden'),'false');
  await nextQuranNote(page,/تظليل الآية والكلمة/);
  assert.equal(await page.evaluate(()=>document.getElementById('mushaf-recitation-audio').paused),true,'Choosing a reciter in the lesson never starts audio');
  await nextQuranNote(page,/السورة وآية البداية/);
  await nextQuranNote(page,/الاستماع دون إنترنت/);
  assert.equal(await page.locator('#audio-download-progress').textContent(),'','Tour never starts a download');
  await nextQuranNote(page,/إدارة الملفات المحمّلة/);
  await lesson(page).locator('[data-tour-action="quran-next"]').click();
  await page.waitForFunction(()=>localStorage.getItem('ayat-tour-done-quran-v7')==='1');
  assert.equal(await page.evaluate(()=>window.mushafReader.getCurrentPage()),original.page,'Tour keeps the reading page unchanged');
  assert.deepEqual(securityErrors,[],'No JavaScript or CSP errors during the Quran lesson');
  await context.close();
}
async function testQuranTourSkipAndBack(browser,origin){
  const {context,page}=await preparePage(browser);
  await page.goto(origin+'/quran.html');
  await page.waitForFunction(()=>document.querySelector('#quran-text')?.dataset.layoutState==='ready');
  await invite(page).waitFor({state:'visible'});
  await invite(page).locator('[data-tour-action="begin"]').click();
  assert.match(await waitTourTitle(page,/اضغط مطولًا على الآية/),/اضغط مطولًا على الآية/);
  // Skipping a long press must open the *real* verse actions sheet.
  await lesson(page).locator('[data-tour-action="assist"]').click();
  assert.match(await waitTourTitle(page,/كل ما تحتاجه للآية/),/كل ما تحتاجه للآية/);
  assert.equal(await page.locator('#verse-actions-sheet').getAttribute('aria-hidden'),'false');
  assert.ok(await page.evaluate(()=>window.mushafVerseActions.getSelectedVerse()));
  // Previous returns to the correct page, not a stale sheet.
  await lesson(page).locator('[data-tour-action="previous"]').click();
  assert.match(await waitTourTitle(page,/اضغط مطولًا على الآية/),/اضغط مطولًا على الآية/);
  assert.equal(await page.locator('#verse-actions-sheet').getAttribute('aria-hidden'),'true');
  await lesson(page).locator('[data-tour-action="assist"]').click();
  assert.equal(await page.locator('#verse-actions-sheet').getAttribute('aria-hidden'),'false');
  for(const pattern of [/التفسير الميسّر/,/ابدأ الاستماع/,/حفظ ونسخ/,/افتح الفهرس بنفسك/]){
    await nextQuranNote(page,pattern);
  }
  await lesson(page).locator('[data-tour-action="assist"]').click();
  assert.match(await waitTourTitle(page,/السور والأجزاء والآيات/),/السور والأجزاء والآيات/);
  assert.equal(await page.locator('#index-sheet').getAttribute('aria-hidden'),'false');
  await nextQuranNote(page,/فاصلة الصفحة/);
  assert.equal(await page.locator('#index-sheet').getAttribute('aria-hidden'),'true');
  await nextQuranNote(page,/افتح الإعدادات بنفسك/);
  await lesson(page).locator('[data-tour-action="assist"]').click();
  assert.match(await waitTourTitle(page,/المحفوظات/),/المحفوظات/);
  assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'),'false');
  await lesson(page).locator('[data-tour-action="previous"]').click();
  assert.match(await waitTourTitle(page,/افتح الإعدادات بنفسك/),/افتح الإعدادات بنفسك/);
  assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'),'true');
  await lesson(page).locator('[data-tour-action="assist"]').click();
  assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'),'false');
  await nextQuranNote(page,/البحث عن آية/);
  await nextQuranNote(page,/افتح خيارات التلاوة/);
  assert.equal(await page.locator('#settings-sheet').getAttribute('aria-hidden'),'true');
  await lesson(page).locator('[data-tour-action="assist"]').click();
  assert.match(await waitTourTitle(page,/اختيار القارئ/),/اختيار القارئ/);
  assert.equal(await page.locator('#audio-options-sheet').getAttribute('aria-hidden'),'false');
  assert.equal(await lesson(page).locator('[data-tour-action="quran-next"]').count(),1,
    'Reciter lesson must have Next without requiring a selection');
  await lesson(page).locator('[data-tour-action="previous"]').click();
  assert.match(await waitTourTitle(page,/افتح خيارات التلاوة/),/افتح خيارات التلاوة/);
  assert.equal(await page.locator('#audio-options-sheet').getAttribute('aria-hidden'),'true');
  await lesson(page).locator('[data-tour-action="assist"]').click();
  await nextQuranNote(page,/تظليل الآية والكلمة/);
  assert.equal(await page.locator('#audio-options-sheet').getAttribute('aria-hidden'),'false');
  await lesson(page).locator('[data-tour-action="pause"]').click();
  assert.equal(await page.locator('#audio-options-sheet').getAttribute('aria-hidden'),'true');
  await context.close();
}
async function testEditorialBackSkipAndResume(browser,origin){
  // Home: opening the verse preview is optional, and Back must never leave
  // a stale modal on top of the previous step.
  {
    const {context,page}=await preparePage(browser);
    await begin(page,origin+'/index.html','الرئيسية');
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await title(page),/آية للتدبّر/);
    await lesson(page).locator('[data-tour-action="verse-open"]').click();
    assert.equal(await page.locator('#ayat-tour-root .ayat-tour-verse-sheet').isVisible(),true);
    await page.locator('[data-tour-action="verse-back"]').click();
    assert.equal(await page.locator('#ayat-tour-root .ayat-tour-verse-sheet').isVisible(),false);
    await lesson(page).locator('[data-tour-action="previous"]').click();
    assert.match(await title(page),/متابعة القراءة/);
    assert.equal(await page.locator('#ayat-tour-root > .ayat-tour-dialog').isVisible(),false);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    await lesson(page).locator('[data-tour-action="verse-open"]').click();
    await page.locator('[data-tour-action="verse-next"]').click();
    assert.match(await title(page),/الذهاب للآية/);
    await lesson(page).locator('[data-tour-action="previous"]').click();
    assert.match(await title(page),/آية للتدبّر/);
    assert.equal(await page.locator('#ayat-tour-root > .ayat-tour-dialog').isVisible(),false);
    await lesson(page).locator('[data-tour-action="pause"]').click();
    assert.equal(await page.locator('#ayat-tour-root').isVisible(),false);
    await context.close();
  }
  // Recitations: selecting a reciter is optional, and Previous must return
  // to the real catalog instead of a hidden/off-screen picker.
  {
    const {context,page}=await preparePage(browser);
    await begin(page,origin+'/recitations.html','القرّاء');
    await lesson(page).locator('[data-tour-action="recitations-reveal"]').click();
    assert.match(await waitTourTitle(page,/اختار القارئ/),/اختار القارئ/);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await waitTourTitle(page,/اختيار السورة/),/اختيار السورة/);
    await lesson(page).locator('[data-tour-action="previous"]').click();
    assert.match(await waitTourTitle(page,/اختار القارئ/),/اختار القارئ/);
    assert.equal(await page.locator('#reciter-list').isVisible(),true);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await waitTourTitle(page,/اختيار السورة/),/اختيار السورة/);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await waitTourTitle(page,/تشغيل التلاوة/),/تشغيل التلاوة/);
    await lesson(page).locator('[data-tour-action="previous"]').click();
    assert.match(await waitTourTitle(page,/اختيار السورة/),/اختيار السورة/);
    await lesson(page).locator('[data-tour-action="pause"]').click();
    assert.equal(await page.locator('#recitation-audio').evaluate(el=>el.paused),true);
    await context.close();
  }
  // Library: navigating explanations must never touch download storage.
  {
    const {context,page}=await preparePage(browser);
    await begin(page,origin+'/library.html','المكتبة الصوتية');
    assert.match(await title(page),/التلاوات المحفوظة/);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await title(page),/البحث في المكتبة/);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await title(page),/ترتيب التلاوات/);
    await lesson(page).locator('[data-tour-action="previous"]').click();
    assert.match(await title(page),/البحث في المكتبة/);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await title(page),/ملفاتك المحمّلة/);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await title(page),/حذف التنزيلات/);
    await lesson(page).locator('[data-tour-action="previous"]').click();
    assert.match(await title(page),/ملفاتك المحمّلة/);
    await lesson(page).locator('[data-tour-action="pause"]').click();
    await context.close();
  }
  // Adhkar: Skip must open the genuine morning reader; Back must close it;
  // resume must restore it; skipping the final gesture must not increment.
  {
    const {context,page}=await preparePage(browser);
    await begin(page,origin+'/adhkar.html','الأذكار');
    await lesson(page).locator('[data-tour-action="adhkar-reveal"]').click();
    assert.match(await waitTourTitle(page,/المفضلة أولًا/),/المفضلة أولًا/);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await waitTourTitle(page,/فهرس الأذكار/),/فهرس الأذكار/);
    await lesson(page).locator('[data-tour-action="home-next"]').click();
    assert.match(await waitTourTitle(page,/افتح أذكار الصباح/),/افتح أذكار الصباح/);
    assert.equal(await lesson(page).locator('[data-tour-action="home-next"]').count(),0);
    await lesson(page).locator('[data-tour-action="assist"]').click();
    assert.match(await waitTourTitle(page,/نص الذكر/),/نص الذكر/);
    assert.equal(await page.locator('#reader').isVisible(),true);
    const originalPosition=await page.locator('#reader-position').textContent();
    const originalFavorite=await page.locator('#reader-favorite').getAttribute('aria-pressed');
    await lesson(page).locator('[data-tour-action="previous"]').click();
    assert.match(await waitTourTitle(page,/افتح أذكار الصباح/),/افتح أذكار الصباح/);
    assert.equal(await page.locator('#reader').isVisible(),false,'Back closes real morning reader');
    await lesson(page).locator('[data-tour-action="assist"]').click();
    assert.match(await waitTourTitle(page,/نص الذكر/),/نص الذكر/);
    assert.equal(await page.locator('#reader').isVisible(),true);
    await lesson(page).locator('[data-tour-action="pause"]').click();
    assert.equal(await page.locator('#reader').isVisible(),false,'Exit closes tour reader');
    await page.evaluate(()=>localStorage.removeItem('ayat-tour-remind-at-adhkar-v7'));
    await page.reload();
    await invite(page).waitFor({state:'visible'});
    await invite(page).locator('[data-tour-action="begin"]').click();
    assert.match(await waitTourTitle(page,/نص الذكر/),/نص الذكر/);
    assert.equal(await page.locator('#reader').isVisible(),true,'Resume restores real morning reader');
    for(const pattern of [/عداد التكرار/,/مرجع الذكر/,/القلب للمفضلة/,/قلّب الذكر بإيدك/]){
      await lesson(page).locator('[data-tour-action="home-next"]').click();
      assert.match(await waitTourTitle(page,pattern),pattern);
      assert.equal(await page.locator('#reader').isVisible(),true);
    }
    assert.equal(await page.locator('#reader-favorite').getAttribute('aria-pressed'),originalFavorite);
    assert.equal(await page.locator('#reader-position').textContent(),originalPosition);
    await lesson(page).locator('[data-tour-action="assist"]').click();
    await page.waitForFunction(()=>localStorage.getItem('ayat-tour-done-adhkar-v7')==='1');
    assert.equal(await page.locator('#reader').isVisible(),true,'Finishing preserves real reading surface');
    assert.equal(await page.locator('#reader-position').textContent(),originalPosition,'Skip does not fake a swipe');
    await context.close();
  }
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
  assert.match(await title(page),/القرّاء موجودين تحت/);
  await lesson(page).locator('[data-tour-action="recitations-reveal"]').click();
  await page.waitForFunction(()=>document.querySelector('#ayat-tour-root > .ayat-tour-card .ayat-tour-title')?.textContent?.includes('اختار القارئ'));
  assert.match(await title(page),/اختار القارئ/);
  assert.match(page.url(),/recitations\.html$/);
  await context.close();
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
  try{
    if(process.env.QURAN_TOUR_QA_ONLY==='1'){
      await testQuranTourSkipAndBack(browser,origin);
      console.log('Quran tour skip/back/panel synchronization browser test passed.');
      return;
    }
    if(process.env.EDITORIAL_TOUR_QA_ONLY==='1'){
      await testEditorialBackSkipAndResume(browser,origin);
      console.log('Home, recitations, library and adhkar Back/Skip/resume tests passed.');
      return;
    }
    await testIndependentPages(browser,origin);
    await testAdhkarGuide(browser,origin);
    await testManualCrossPageLaunch(browser,origin);
    await testQuranFromSettings(browser,origin);
    await testQuranTourSkipAndBack(browser,origin);
    await testEditorialBackSkipAndResume(browser,origin);
    await testOfflineNoHandoff(browser,origin);
    console.log('Independent page discovery browser tests passed.');
  }finally{await browser.close();server.close();}
})().catch(err=>{console.error(err);server.close();process.exitCode=1;});
