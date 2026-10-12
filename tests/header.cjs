// npm install --no-save playwright && npx playwright install chromium
// node tests/header.cjs ; optional QURAN_BROWSER_PATH and QURAN_SCREENSHOT_DIR.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const assert=require('node:assert/strict'),{chromium}=require('playwright');
const root=path.join(__dirname,'..');
const pages=JSON.parse(fs.readFileSync(path.join(root,'data/verse-to-page.json')));
(async()=>{
 const server=http.createServer((req,res)=>{try{res.end(fs.readFileSync(path.join(root,req.url.split('?')[0])))}catch{res.statusCode=404;res.end()}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,...(process.env.QURAN_BROWSER_PATH?{executablePath:process.env.QURAN_BROWSER_PATH,args:['--no-sandbox','--disable-gpu','--no-zygote']}:{})});
 try{
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const url=`http://127.0.0.1:${server.address().port}/quran.html`;
 await page.goto(url);await page.waitForSelector('#loading-screen',{state:'detached'});
 let checks=0;
 for(const [width,height] of [[320,568],[390,844]])for(const theme of ['paper','dark'])for(const surah of [20,2,60]){
  const n=pages.findLastIndex(p=>p.surah<surah||(p.surah===surah&&p.ayah===1))+1;assert.ok(n>0);
  await page.setViewportSize({width,height});
  await page.evaluate(({n,theme})=>{localStorage.setItem('quranReaderState',JSON.stringify({displayPage:n}));localStorage.setItem('quranReaderSettings',JSON.stringify({fontSize:34,lineHeight:1.75,theme}));},{n,theme});
  await page.reload();await page.waitForSelector('#loading-screen',{state:'detached'});await page.evaluate(()=>document.fonts.ready);
  const result=await page.evaluate((surah)=>{
   const header=document.querySelector(`.surah-heading[data-surah="${surah}"]`),svg=header.querySelector('svg'),title=header.querySelector('h2'),basmala=document.querySelector('.surah-basmala'),text=document.querySelector('#quran-text');
   const range=document.createRange();range.selectNodeContents(title);const ink=range.getBoundingClientRect(),box=title.getBoundingClientRect(),h=header.getBoundingClientRect(),b=basmala.getBoundingClientRect(),bounds=svg.getBBox(),v=svg.viewBox.baseVal;
   const visibleTitle=ink.left>=box.left&&ink.right<=box.right&&ink.top>=h.top&&ink.bottom<=h.bottom;
   text.scrollTop=text.scrollHeight;const last=text.querySelector('.ayah-end-group:last-child');
   return {visibleTitle,svgFits:bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=v.width&&bounds.y+bounds.height<=v.height,noOverlap:b.top>=h.bottom,noHorizontalClip:text.scrollWidth<=text.clientWidth+1,lastVisible:last.getBoundingClientRect().bottom<=text.getBoundingClientRect().bottom+1};
  },surah);assert.ok(Object.values(result).every(Boolean),JSON.stringify({width,theme,surah,result}));checks++;
  if(process.env.QURAN_SCREENSHOT_DIR){await page.evaluate(()=>document.querySelector('#quran-text').scrollTop=0);await page.screenshot({path:path.join(process.env.QURAN_SCREENSHOT_DIR,`quran-${surah}-${theme}-${width}.png`)});}
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({headerChecks:checks,sizes:['320x568','390x844'],surahs:['طه','البقرة','الممتحنة'],themes:['paper','dark'],result:'PASS'}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
