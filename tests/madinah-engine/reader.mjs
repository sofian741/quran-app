import {decodeGeometry, QvpLitePage} from './vendor/lite.mjs';
import {buildPath} from './vendor/lite-path.mjs';
import {parseTanzil, timingRange} from './text-map.mjs';

const $ = id=>document.getElementById(id), text=$('quran-text'), stage=$('reader-stage');
const STORAGE='madinahLabReaderStateV1', SETTINGS='madinahLabSettingsV1';
const THEMES={paper:['#fbf6e8','#18221f'],white:['#fffefa','#17201d'],mint:['#edf7f0','#17302a'],dark:['#18201d','#f3ead5']};
const juz=[1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];
const digits=n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
let current=1, revision=0, active=null, manifest, maps, verses, verseIndex, theme=read(SETTINGS,'paper');
let drag=null, suppress=false, pendingTarget=null, lastAudio=null, audioSignature='';
const pointers=new Set(), cache=new Map(), pending=new Map(), prepared=new Map(), maxPages=3;
let preview=null,targetTimer=null;
const metrics={pageLoads:[],cacheLimit:maxPages,cachePages:0,wordTaps:0,errors:[],timingSpace:'tanzil-spoken',productionReady:false};
const status=document.createElement('p');status.className='madinah-status';status.setAttribute('role','status');document.body.append(status);
const rollback=document.createElement('a');rollback.className='madinah-lab-link';rollback.href='legacy-quran.html';rollback.textContent='مختبر 1441هـ · المحرك القديم';document.body.append(rollback);
function message(value,error=false){status.textContent=value;status.classList.toggle('is-error',error);}
function error(err){metrics.errors.push(String(err));message('تعذر تحميل صفحة المختبر. الصفحة السابقة محفوظة؛ أعد المحاولة أو افتح المحرك القديم.',true);console.error(err);}
function evict(){while(cache.size>maxPages){const key=[...cache.keys()].find(k=>k!==current);if(key===undefined)break;cache.delete(key);}metrics.cachePages=cache.size;}
async function load(number){
  if(cache.has(number)){const item=cache.get(number);cache.delete(number);cache.set(number,item);return item;}
  if(pending.has(number))return pending.get(number);
  const promise=(async()=>{
    const id=String(number).padStart(3,'0'), response=await fetch('lab/pages/'+id+'.qvp');
    if(!response.ok)throw new Error('Page HTTP '+response.status);
    const bytes=await response.arrayBuffer();
    const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==manifest.files[id+'.qvp'].sha256)throw new Error('Page integrity '+number);
    const geometry=decodeGeometry(bytes);if(geometry.number!==number)throw new Error('Page identity');
    const item={geometry,paint:new QvpLitePage(geometry)};cache.set(number,item);evict();return item;
  })().finally(()=>pending.delete(number));
  pending.set(number,promise);return promise;
}
function setBox(el,box){Object.assign(el.style,{left:box[0]+'px',top:box[1]+'px',width:(box[2]-box[0])+'px',height:(box[3]-box[1])+'px'});}
function build(item){
  const g=item.geometry, frame=document.createElement('div');frame.className='madinah-frame';
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');frame.append(canvas);
  const layer=document.createElement('div');layer.className='madinah-hit-layer';frame.append(layer);
  const rows=new Map(), nodes=new Map();
  for(const line of g.lines){const row=document.createElement('div');row.className='mushaf-line madinah-row';row.dataset.line=String(line.lineNumber);layer.append(row);rows.set(line.index,row);}
  for(const w of g.words){
    const key=`${w.surah}:${w.ayah}:${w.word}`, word=document.createElement('span');
    word.className='mushaf-word madinah-word';word.dataset.verse=`${w.surah}:${w.ayah}`;word.dataset.word=String(w.word-1);word.dataset.wordKey=key;
    word.textContent=w.text;word.setAttribute('role','button');word.setAttribute('tabindex','0');word.setAttribute('aria-label',w.text+'، الآية '+w.ayah);
    setBox(word,w.box);rows.get(w.lineIndex).append(word);nodes.set(key,word);
  }
  // A marker has its own hit target, associated only with the last printed word.
  for(const d of g.decorations.filter(d=>d.decoration===0)){
    const candidates=g.words.filter(w=>w.surah===d.surah&&w.ayah===d.ayah), w=candidates.at(-1);if(!w)continue;
    const word=nodes.get(`${w.surah}:${w.ayah}:${w.word}`), group=document.createElement('span');group.className='ayah-end-group';
    const box=[Math.min(w.box[0],d.box[0]),Math.min(w.box[1],d.box[1]),Math.max(w.box[2],d.box[2]),Math.max(w.box[3],d.box[3])];setBox(group,box);
    setBox(word,[w.box[0]-box[0],w.box[1]-box[1],w.box[2]-box[0],w.box[3]-box[1]]);
    const marker=document.createElement('span');marker.className='ayah-marker';marker.setAttribute('aria-label','الآية '+w.ayah);
    setBox(marker,[d.box[0]-box[0],d.box[1]-box[1],d.box[2]-box[0],d.box[3]-box[1]]);
    word.replaceWith(group);group.append(word,marker);
  }
  return {frame,canvas,nodes,rows,...item};
}
function fitItem(item,container){
  if(!item||!container.clientWidth||!container.clientHeight)return;
  const scale=Math.min(container.clientWidth/345,container.clientHeight/550), x=(container.clientWidth-345*scale)/2,y=(container.clientHeight-550*scale)/2;
  item.frame.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
  // DPR adapts to pinch magnification, with a bounded 3M-pixel backing store.
  const ratio=Math.min(8,Math.max(2,devicePixelRatio*(visualViewport?.scale||1))), desired=scale*ratio;
  const backing=Math.min(desired,Math.sqrt(3000000/(345*550)));
  item.canvas.width=Math.ceil(345*backing);item.canvas.height=Math.ceil(550*backing);
  item.paint.draw(item.canvas.getContext('2d'),{scale:item.canvas.width/345,ink:getComputedStyle(document.body).getPropertyValue('--page-text').trim()||'#231f20'});
}
function fit(){fitItem(active,text);if(active)metrics.canvasPixels=active.canvas.width*active.canvas.height;audioSignature='';if(lastAudio)syncAudio(lastAudio);}
async function navigate(number,target=null){
  if(!Number.isInteger(number)||number<1||number>604)return false;
  const ticket=++revision,start=performance.now();pendingTarget=target;
  try{
    const item=await load(number);if(ticket!==revision)return false;
    removePreview();prepared.clear();clearTimeout(targetTimer);
    const built=build(item);current=number;active=built;audioSignature='';evict();
    text.replaceChildren(built.frame);text.classList.add('madinah-text');text.dataset.layoutState='ready';text.dataset.page=String(number);
    $('display-page-number').textContent=digits(number);
    const s=[...new Set(item.geometry.words.map(w=>w.surah))], title=s.map(n=>window.QuranAudio.SURAH_NAMES[n-1]).join('، ');
    $('page-surah').textContent=title;$('toolbar-surah').textContent=title;
    const part='الجزء '+digits(juz.filter(n=>n<=number).length);$('page-range').textContent=part;$('toolbar-range').textContent=part;
    try{localStorage.setItem(STORAGE,JSON.stringify({displayPage:number,surah:item.geometry.words[0].surah,ayah:item.geometry.words[0].ayah}));}catch{}
    fit();emit('mushaf:page-changed',{page:number});emit('mushaf:page-ready',{page:number});
    if(pendingTarget){for(const node of built.nodes.values())node.classList.toggle('is-search-target',node.dataset.verse===pendingTarget);pendingTarget=null;targetTimer=setTimeout(()=>text.querySelectorAll('.is-search-target').forEach(n=>n.classList.remove('is-search-target')),5500);}
    metrics.pageLoads.push({page:number,ms:performance.now()-start});if(metrics.pageLoads.length>604)metrics.pageLoads.shift();
    message('نموذج تجريبي · حفص 1441هـ · المطابقة النهائية قيد المراجعة');
    // Let the accepted page reach the screen before decoding or drawing previews.
    // Old navigation timers have no effect after the reader has moved on.
    setTimeout(()=>{
      if(number!==current)return;
      for(const n of [number+1,number-1])if(n>=1&&n<=604)load(n).then(item=>{
        const prepare=()=>{if(number===current)preparePreview(n,item);};
        if('requestIdleCallback'in window)requestIdleCallback(prepare,{timeout:450});else setTimeout(prepare,60);
      }).catch(()=>{});
    },80);
    return true;
  }catch(e){if(ticket===revision)error(e);return false;}
}
function removePreview(){preview?.remove();preview=null;$('mushaf-page').style.transform='';}
function preparePreview(number,item){
  if(drag||preview||prepared.has(number)||Math.abs(number-current)!==1)return;
  const shell=$('mushaf-page').cloneNode(true);shell.removeAttribute('id');shell.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
  shell.classList.add('swipe-preview');shell.setAttribute('aria-hidden','true');
  const rect=$('mushaf-page').getBoundingClientRect(),sr=stage.getBoundingClientRect();
  Object.assign(shell.style,{position:'absolute',width:rect.width+'px',height:rect.height+'px',left:(rect.left-sr.left)+'px',top:(rect.top-sr.top)+'px',visibility:'hidden',pointerEvents:'none'});
  const container=shell.querySelector('.quran-text'),built=build(item);container.replaceChildren(built.frame);
  const label=shell.querySelector('.display-page-number');if(label)label.textContent=digits(number);
  const names=[...new Set(item.geometry.words.map(w=>w.surah))].map(n=>window.QuranAudio.SURAH_NAMES[n-1]).join('، ');
  const heading=shell.querySelector('.page-heading span');if(heading)heading.textContent=names;
  const part=shell.querySelector('.page-heading span:last-child');if(part)part.textContent='الجزء '+digits(juz.filter(n=>n<=number).length);
  stage.append(shell);fitItem(built,container);shell.remove();shell.style.visibility='';prepared.set(number,shell);
}
function bands(verseKey,cls){
  text.querySelectorAll('.'+cls).forEach(n=>n.remove());if(!active)return;
  for(const row of active.rows.values()){
    const words=[...row.querySelectorAll('.madinah-word')].filter(w=>w.dataset.verse===verseKey);if(!words.length)continue;
    const bounds=words.map(w=>w.getBoundingClientRect()), last=words.at(-1).closest('.ayah-end-group');if(last)bounds.push(last.getBoundingClientRect());
    const r=row.getBoundingClientRect(),sx=r.width/row.offsetWidth,sy=r.height/row.offsetHeight;
    const b=document.createElement('span');b.className=cls;b.setAttribute('aria-hidden','true');
    setBox(b,[(Math.min(...bounds.map(r=>r.left))-r.left)/sx,(Math.min(...bounds.map(r=>r.top))-r.top)/sy,(Math.max(...bounds.map(r=>r.right))-r.left)/sx,(Math.max(...bounds.map(r=>r.bottom))-r.top)/sy]);row.append(b);
  }
}
function syncAudio(state){
  lastAudio=state;if(!active)return;
  const playing=state.playing&&state.provider==='quran-foundation'&&state.timing;
  const ref=`${state.surah}:${state.ayah}`;
  const msKey=state.currentTime*1000, segmentKey=state.timing?.segments?.findLast(s=>msKey>=s.start&&msKey<s.end);
  const inVerse=(!Number.isFinite(state.timing?.timestampFrom)||msKey>=state.timing.timestampFrom)&&(!Number.isFinite(state.timing?.timestampTo)||msKey<state.timing.timestampTo);
  const signature=[current,playing?ref:'',segmentKey?.word,segmentKey?.endWord,state.reciterId,inVerse].join(':');
  if(signature===audioSignature)return;audioSignature=signature;
  for(const node of active.nodes.values())node.classList.remove('is-audio-word');
  metrics.activeWordKeys=[];bands(playing?ref:'','audio-verse-band');if(!playing)return;
  const ms=state.currentTime*1000,t=state.timing;
  if(Number.isFinite(t.timestampFrom)&&ms<t.timestampFrom||Number.isFinite(t.timestampTo)&&ms>=t.timestampTo)return;
  // Require the complete provider ordinal range. No first-word guessing, no
  // interpolated gaps, and no count based on the current page's fragment.
  const segments=t.segments||[],map=maps[ref];
  const supported=[7,9020,9021,9022,...Array.from({length:19},(_,i)=>9000+i)].filter(i=>i!==9017).includes(Number(state.reciterId));
  const valid=supported&&map&&segments.length&&segments.every(s=>Number.isInteger(s.word)&&s.word>=1&&(s.endWord??s.word)<=map.sourceCount);
  if(!valid){metrics.lastTimingError='Unmapped provider ordinal '+ref;return;}
  const segment=segments.findLast(s=>ms>=s.start&&ms<s.end);if(!segment)return;
  const keys=timingRange(map,segment);if(!keys){metrics.lastTimingError='Unmapped word '+ref;return;}
  for(const key of keys)active.nodes.get(key)?.classList.add('is-audio-word');
  metrics.activeWordKeys=keys;
}
function follow(state){
  if(!state.playing||!state.autoFollow||state.provider!=='quran-foundation'||!active)return;
  const ref=`${state.surah}:${state.ayah}`,ms=state.currentTime*1000;
  const segment=state.timing?.segments?.findLast(s=>ms>=s.start&&ms<s.end);
  const keys=segment&&timingRange(maps[ref],segment), candidates=maps[ref]?.pages;
  // Keep a visible fragment. Move only when the active timed word is elsewhere.
  let page=candidates?.includes(current)?current:candidates?.[0];
  if(keys?.length){const target=manifest.pages.find(p=>keys.some(k=>{
    const tuple=k.split(':').map(Number),lo=p.first.split(':').map(Number),hi=p.last.split(':').map(Number);
    const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];return cmp(tuple,lo)>=0&&cmp(tuple,hi)<=0;
  }));page=target?.number??page;}
  if(page&&page!==current&&!pending.size)navigate(page);
}
function wordFromPoint(clientX,clientY){
  if(!active||!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
  const rect=active.frame.getBoundingClientRect(),x=(clientX-rect.left)*345/rect.width,y=(clientY-rect.top)*550/rect.height;
  if(x<0||y<0||x>345||y>550)return null;
  const g=active.geometry, candidates=g.words.filter(w=>x>=w.box[0]&&x<=w.box[2]&&y>=w.box[1]&&y<=w.box[3]);
  active.hitPaths??=new Map();const ctx=active.canvas.getContext('2d');
  // isPointInPath uses canvas space for the point; reset the paint transform.
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  try{for(const w of candidates)for(let i=w.firstPath;i<w.firstPath+w.nPaths;i++){
    if(!active.hitPaths.has(i))active.hitPaths.set(i,buildPath(g.paths[i]));
    if(ctx.isPointInPath(active.hitPaths.get(i),x,y,g.paths[i].rule))return active.nodes.get(`${w.surah}:${w.ayah}:${w.word}`);
  }}finally{ctx.restore();}
  const line=g.lines.filter(l=>l.box&&y>=l.box[1]&&y<=l.box[3]).sort((a,b)=>Math.abs((a.box[1]+a.box[3])/2-y)-Math.abs((b.box[1]+b.box[3])/2-y))[0];
  if(!line)return null;
  const w=g.words.slice(line.firstWord,line.firstWord+line.nWords).sort((a,b)=>Math.abs((a.box[0]+a.box[2])/2-x)-Math.abs((b.box[0]+b.box[2])/2-x))[0];
  return w?active.nodes.get(`${w.surah}:${w.ayah}:${w.word}`):null;
}
async function installOffline(){
  const response=await fetch('lab/offline-files.json');if(!response.ok)throw new Error('Offline manifest');
  const files=await response.json(),store=await caches.open('ayat-madinah-lab-v1');let cursor=0,done=0;
  await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){const url=files[cursor++],r=await fetch(url);if(!r.ok)throw new Error('Offline asset '+url);await store.put(url,r);done++;}}));
  return {files:done,pages:604};
}
function settings(){
  prepared.clear();
  if(!THEMES[theme])theme='paper';const [paper,ink]=THEMES[theme];
  document.body.dataset.theme=theme;document.body.style.setProperty('--page-paper',paper);document.body.style.setProperty('--page-text',ink);document.body.style.setProperty('--reader-accent',theme==='dark'?'#76c8b9':'#176b63');
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.classList.toggle('is-active',b.dataset.themeChoice===theme);
  try{localStorage.setItem(SETTINGS,JSON.stringify(theme));}catch{}fit();
}
function closePanels(){return !!document.querySelector('#settings-sheet.is-open,#index-sheet.is-open,#verse-actions-sheet.is-open');}
function panel(id,open){const sheet=$(id+'-sheet'),back=$(id+'-backdrop');sheet.classList.toggle('is-open',open);sheet.setAttribute('aria-hidden',String(!open));back.hidden=!open;back.classList.toggle('is-open',open);document.body.classList.toggle(id+'-open',open);}
const foldIndex=value=>String(value).replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
function index(tab='surahs'){
  const list=$('index-list'),q=foldIndex($('index-surah-search')?.value||'');list.replaceChildren();
  const entries=tab==='juz'?juz.map((page,i)=>({label:'الجزء '+digits(i+1),page})):window.QuranAudio.SURAH_NAMES.map((name,i)=>({label:name,page:maps[(i+1)+':1'].pages[0],surah:i+1}));
  for(const e of entries){if(q&&!foldIndex(e.label).includes(q)&&String(e.surah)!==q)continue;
    const wrapper=document.createElement('div'),button=document.createElement('button');button.className='index-entry';button.textContent=e.label+' · '+digits(e.page);button.onclick=()=>{panel('index',false);navigate(e.page);};wrapper.append(button);
    if(e.surah){const toggle=document.createElement('button');toggle.className='index-ayah-toggle';toggle.textContent='⌄';toggle.setAttribute('aria-label','آيات '+e.label);
      const area=document.createElement('div');area.hidden=true;toggle.onclick=()=>{area.hidden=!area.hidden;if(area.childNodes.length)return;
        const input=document.createElement('input');input.type='search';input.className='index-ayah-search';input.placeholder='رقم الآية أو جزء من نصها';area.append(input);const results=document.createElement('div');area.append(results);
        const paint=()=>{results.replaceChildren();for(const v of verses.filter(v=>v.surah===e.surah&&(!input.value||String(v.ayah)===foldIndex(input.value)||foldIndex(v.text).includes(foldIndex(input.value)))).slice(0,120)){const b=document.createElement('button');b.className='index-ayah-result';b.textContent=digits(v.ayah)+' '+v.text.slice(0,85);b.onclick=()=>{panel('index',false);navigate(maps[v.key].pages[0],v.key);};results.append(b);}};input.oninput=paint;paint();};wrapper.append(toggle,area);}
    list.append(wrapper);
  }
  for(const b of document.querySelectorAll('[data-index-tab]'))b.classList.toggle('is-active',b.dataset.indexTab===tab);
}
function wire(){
  for(const id of ['settings','index']){$('open-'+id).onclick=()=>{if(id==='index')index();panel(id,true);};$('close-'+id).onclick=()=>panel(id,false);$(id+'-backdrop').onclick=()=>panel(id,false);}
  for(const b of document.querySelectorAll('[data-index-tab]'))b.onclick=()=>index(b.dataset.indexTab);
  $('index-surah-search').oninput=()=>index();
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.onclick=()=>{theme=b.dataset.themeChoice;settings();};$('reset-settings').onclick=()=>{theme='paper';settings();};
  $('check-app-update').hidden=true;
  stage.addEventListener('click',e=>{if(suppress){suppress=false;return;}const word=wordFromPoint(e.clientX,e.clientY)||e.target.closest('.madinah-word');if(word){metrics.wordTaps++;emit('madinah:word-tapped',{wordKey:word.dataset.wordKey,verseKey:word.dataset.verse});}if(!e.target.closest('button,a,input'))document.body.classList.toggle('tools-visible');});
  stage.addEventListener('keydown',e=>{const w=e.target.closest('.madinah-word');if(w&&(e.key==='Enter'||e.key===' ')){e.preventDefault();window.mushafVerseActions.openForVerse(...w.dataset.verse.split(':').map(Number));}});
  stage.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch')pointers.add(e.pointerId);
    if(pointers.size>1||(visualViewport?.scale||1)>=1.01||closePanels()){drag=null;removePreview();return;}
    if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0};
  });
  stage.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)){drag=null;removePreview();return;}if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.2){drag.dx=dx;const direction=dx>0?1:-1;
    if(preview?.dataset.target!==String(current+direction)){removePreview();preview=prepared.get(current+direction)||null;if(preview){preview.dataset.target=String(current+direction);stage.append(preview);}}
    $('mushaf-page').style.transform=`translateX(${dx}px)`;if(preview)preview.style.transform=`translateX(${dx-direction*$('mushaf-page').clientWidth}px)`;suppress=true;}});
  const release=e=>{pointers.delete(e.pointerId);if(!drag||drag.id!==e.pointerId)return;const dx=drag.dx;drag=null;removePreview();if(e.type==='pointerup'&&Math.abs(dx)>Math.min(85,stage.clientWidth*.2))navigate(current+(dx>0?1:-1));};
  stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){panel('index',false);panel('settings',false);return;}if(e.target.closest('input,textarea')||closePanels())return;if(e.key==='ArrowLeft')navigate(current+1);if(e.key==='ArrowRight')navigate(current-1);});
  const zoom=()=>{const value=(visualViewport?.scale||1)>=1.01;document.body.classList.toggle('is-pinch-panning',value);if(value){drag=null;removePreview();}prepared.clear();fit();};
  visualViewport?.addEventListener('resize',zoom);visualViewport?.addEventListener('scroll',zoom);
  new ResizeObserver(fit).observe(text);
}
async function init(){
  const data=await Promise.all(['lab/manifest.json','lab/word-map.json','data/quran-uthmani.txt'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error(url);return url.endsWith('.txt')?r.text():r.json();}));
  [manifest,maps]=data;verses=parseTanzil(data[2]);verseIndex=new Map(verses.map(v=>[v.key,v]));if(verses.length!==6236)throw new Error('Text coverage');
  window.mushafReader={
    getCurrentPage:()=>current,getSearchVerses:()=>verses.map(({key,...v})=>({...v})),getSurahName:n=>window.QuranAudio.SURAH_NAMES[n-1]||'',
    getVerse:(s,a)=>{const v=verseIndex.get(s+':'+a);return v?{surah:v.surah,ayah:v.ayah,text:v.text}:null;},
    findVersePage:(s,a)=>maps[s+':'+a]?.pages[0]||null,
    goToPage:n=>{if(closePanels()||!Number.isInteger(n)||n<1||n>604)return false;navigate(n);return true;},
    goToVerse:(s,a,p)=>{const key=s+':'+a,v=maps[key];if(closePanels()||!v)return false;navigate(v.pages.includes(p)?p:v.pages[0],key);return true;},
    fitElement:fit, clearFitCache(){}, turnPageInstant:d=>{if(![1,-1].includes(d)||current+d<1||current+d>604)return false;navigate(current+d);return true;}
  };
  window.madinahLab={metrics,navigate,syncAudio,follow,wordFromPoint,installOffline,getPreparedPages:()=>[...prepared.keys()],getGeometry:()=>active?.geometry,getMapping:key=>maps[key],getManifest:()=>manifest,drawReference:()=>active?.paint};
  settings();wire();
  const hash=new URLSearchParams(location.hash.slice(1)),v=hash.get('verse');
  const saved=read(STORAGE,{}).displayPage,initial=v&&maps[v]?maps[v].pages[0]:Number.isInteger(saved)&&saved>=1&&saved<=604?saved:1;
  if(!await navigate(initial,v))throw new Error('Initial page failed');
  emit('mushaf:data-ready',{});$('loading-screen')?.remove();metrics.ready=true;
  if(v&&hash.get('action')==='tafsir')window.mushafTafsir?.open({surah:+v.split(':')[0],ayah:+v.split(':')[1],verseKey:v});
  // Cold install is local inside Android. Web offline is explicit after first visit;
  // pages already visited are cached; full corpus installation is a separate test.
  if('serviceWorker'in navigator)await navigator.serviceWorker.register('sw-lab.js');
}
init().catch(error);
