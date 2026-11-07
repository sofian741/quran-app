import {decodeGeometry, QvpLitePage} from './vendor/lite.js';
import {buildPath} from './vendor/lite-path.js';
import {sha256} from './integrity.js';
import {SUBWORDS, subwordBox} from './subwords.js';
import {createHeritageHeading} from './heritage-ornament.js';
import {parseTanzil, timingRange, splitWords} from './text-map.js';
import {layoutGeometry, paintGeometry, headingBox, enlargeVerseMarkers, GRID} from './line-layout.js';

const $ = id=>document.getElementById(id), text=$('quran-text'), stage=$('reader-stage');
const STORAGE='quranReaderState', SETTINGS='quranReaderSettings';
const THEMES={paper:['#fbf6e8','#18221f'],white:['#fffefa','#17201d'],mint:['#edf7f0','#17302a'],dark:['#18201d','#f3ead5']};
const juz=[1,22,42,62,82,102,121,142,162,182,201,222,242,262,282,302,322,342,362,382,402,422,442,462,482,502,522,542,562,582];
const digits=n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
let current=1, revision=0, active=null, manifest, maps, verses, verseIndex, theme=read(SETTINGS,{}).theme||'paper';
let drag=null, settling=false, suppress=false, pendingTarget=null, lastAudio=null, audioSignature='';
const pointers=new Set(), cache=new Map(), pending=new Map(), prepared=new Map(), maxPages=3;
let preview=null,targetTimer=null;
const metrics={pageLoads:[],cacheLimit:maxPages,cachePages:0,wordTaps:0,errors:[],timingSpace:'tanzil-spoken',productionReady:false,inkStroke:GRID.inkStroke,markerStroke:GRID.markerStroke};
const status=document.createElement('p');status.className='madinah-status';status.setAttribute('role','status');document.body.append(status);
status.hidden=true;
function message(value,error=false){status.hidden=!value;status.textContent=value;status.classList.toggle('is-error',error);}
function error(err){metrics.errors.push(String(err));message('تعذر تحميل صفحة المصحف. الصفحة السابقة محفوظة؛ أعد المحاولة أو اختر المحرك السابق من الإعدادات.',true);console.error(err);}
function evict(){while(cache.size>maxPages){const key=[...cache.keys()].find(k=>k!==current);if(key===undefined)break;cache.delete(key);}metrics.cachePages=cache.size;}
async function load(number){
  if(cache.has(number)){const item=cache.get(number);cache.delete(number);cache.set(number,item);return item;}
  if(pending.has(number))return pending.get(number);
  const promise=(async()=>{
    const id=String(number).padStart(3,'0'), response=await fetch('data/qvp/pages/'+id+'.qvp');
    if(!response.ok)throw new Error('Page HTTP '+response.status);
    const bytes=await response.arrayBuffer();
    const digest=await sha256(bytes);
    if(digest!==manifest.files[id+'.qvp'].sha256)throw new Error('Page integrity '+number);
    const geometry=decodeGeometry(bytes);if(geometry.number!==number)throw new Error('Page identity');
    layoutGeometry(geometry,{uniformInkScale:manifest.uniformInkScale??GRID.inkScale});
    if(number>=3)enlargeVerseMarkers(geometry,manifest.uniformMarkerScale??1);
    const item={geometry,paint:new QvpLitePage(paintGeometry(geometry))};cache.set(number,item);evict();return item;
  })().finally(()=>pending.delete(number));
  pending.set(number,promise);return promise;
}
function setBox(el,box){Object.assign(el.style,{left:box[0]+'px',top:box[1]+'px',width:(box[2]-box[0])+'px',height:(box[3]-box[1])+'px'});}
function build(item){
  const g=item.geometry, frame=document.createElement('div');frame.className='madinah-frame';frame.style.setProperty('--qvp-height',g.height+'px');frame.style.setProperty('--qvp-width',g.width+'px');
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
  // Place the original ornamental frame over QVP's surah-heading decoration.
  // Its center is transparent: the current QVP surah name remains untouched.
  for(const d of g.decorations.filter(d=>d.decoration===1)){
    const header=document.createElement('div');
    header.className='madinah-heritage-heading';
    header.setAttribute('aria-hidden','true');
    header.innerHTML=createHeritageHeading();
    setBox(header,headingBox(g,d));
    // Under the transparent QVP canvas: the original title glyphs stay on top.
    frame.insertBefore(header,canvas);
  }
  // Basmala is edition artwork, not four additional spoken timing ordinals.
  // Preserve verse-1 actions without manufacturing word timestamps.
  for(const d of g.decorations.filter(d=>d.decoration===2)){
    const row=rows.get(d.lineIndex);if(!row)throw new Error('Basmala line');
    row.classList.add('surah-basmala');
    const node=document.createElement('span');node.className='mushaf-word madinah-word madinah-basmala';
    node.dataset.verse=d.surah+':1';node.dataset.basmala='true';node.textContent=verseIndex.get('1:1').text;
    node.setAttribute('role','button');node.tabIndex=0;node.setAttribute('aria-label','البسملة، سورة '+window.QuranAudio.SURAH_NAMES[d.surah-1]);
    setBox(node,d.box);row.append(node);
  }
  for(const [key,parts] of Object.entries(SUBWORDS)){
    const parent=nodes.get(key);if(!parent)continue;
    parent.classList.add('madinah-compound');
    const w=g.words.find(w=>`${w.surah}:${w.ayah}:${w.word}`===key);
    for(const part of parts){
      const node=document.createElement('span');node.className='madinah-subword';node.dataset.wordKey=part.key;node.dataset.verse=parent.dataset.verse;
      node.dataset.sourceWord=String(part.ordinal);node.setAttribute('aria-label',part.text);node.setAttribute('role','button');node.tabIndex=0;
      const box=subwordBox(g,part);setBox(node,[box[0]-w.box[0],box[1]-w.box[1],box[2]-w.box[0],box[3]-w.box[1]]);
      parent.append(node);nodes.set(part.key,node);
    }
  }
  return {frame,canvas,nodes,rows,...item};
}
function fitItem(item,container){
  if(!item||!container.clientWidth||!container.clientHeight)return;
  const {width,height}=item.geometry;
  const scale=Math.min(container.clientWidth/width,container.clientHeight/height), x=(container.clientWidth-width*scale)/2,y=(container.clientHeight-height*scale)/2;
  item.frame.style.transform=`translate(${x}px,${y}px) scale(${scale})`;
  // DPR adapts to pinch magnification, with a bounded 3M-pixel backing store.
  const ratio=Math.min(8,Math.max(2,devicePixelRatio*(visualViewport?.scale||1))), desired=scale*ratio;
  const backing=Math.min(desired,Math.sqrt(3000000/(width*height)));
  item.canvas.width=Math.ceil(width*backing);item.canvas.height=Math.ceil(height*backing);
  paint(item);
}
function paint(item){
  const ctx=item.canvas.getContext('2d'),scale=item.canvas.width/item.geometry.width;
  const ink=getComputedStyle(document.body).getPropertyValue('--page-text').trim()||'#231f20';
  ctx.clearRect(0,0,item.canvas.width,item.canvas.height);
  item.paint.draw(ctx,{scale,ink});
  // QVP supplies filled contours rather than a font weight. A small, uniform
  // contour stroke gives every printed word, title and basmala the same safe
  // weight without reflowing text or changing any hit/timing geometry.
  ctx.save();ctx.setTransform(scale,0,0,scale,0,0);ctx.strokeStyle=ink;ctx.lineWidth=GRID.inkStroke;ctx.lineJoin='round';ctx.lineCap='round';
  for(const w of item.geometry.words)for(let i=w.firstPath;i<w.firstPath+w.nPaths;i++)ctx.stroke(buildPath(item.geometry.paths[i]));
  for(const d of item.geometry.decorations.filter(d=>d.decoration===1||d.decoration===2))
    for(let i=d.firstPath;i<d.firstPath+d.nPaths;i++)ctx.stroke(buildPath(item.geometry.paths[i]));
  ctx.restore();
  // Recolor ONLY the original QVP ayah-number cartouches. No shape,
  // wording, spacing or hit boxes are modified.
  ctx.save();ctx.setTransform(scale,0,0,scale,0,0);
  ctx.fillStyle=theme==='dark'?'#d7bb7b':'#157a6b';
  for(const d of item.geometry.decorations.filter(d=>d.decoration===0))
    for(let i=d.firstPath;i<d.firstPath+d.nPaths;i++){
      const path=buildPath(item.geometry.paths[i]);
      ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=GRID.markerStroke;ctx.lineJoin='round';ctx.lineCap='round';
      ctx.stroke(path);ctx.fill(path,item.geometry.paths[i].rule);
    }
  ctx.restore();
  // Match the original reader: recolor the active word's own QVP contours.
  // There is no box, marker or geometry change over the printed word.
  ctx.save();ctx.setTransform(scale,0,0,scale,0,0);ctx.fillStyle=theme==='dark'?'#76c8b9':'#176b63';
  for(const w of item.geometry.words){
    const key=`${w.surah}:${w.ayah}:${w.word}`;
    if(!item.nodes.get(key)?.classList.contains('is-audio-word'))continue;
    for(let i=w.firstPath;i<w.firstPath+w.nPaths;i++){const path=buildPath(item.geometry.paths[i]);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=GRID.inkStroke;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(path);ctx.fill(path,item.geometry.paths[i].rule);}
  }
  for(const parts of Object.values(SUBWORDS))for(const part of parts)if(item.nodes.get(part.key)?.classList.contains('is-audio-word'))
    for(const i of part.paths){const path=buildPath(item.geometry.paths[i]);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=GRID.inkStroke;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke(path);ctx.fill(path,item.geometry.paths[i].rule);}
  ctx.restore();
}
function fit(){fitItem(active,text);if(active)metrics.canvasPixels=active.canvas.width*active.canvas.height;audioSignature='';if(lastAudio)syncAudio(lastAudio);}
async function navigate(number,target=null,transitionOverlay=null){
  if(!Number.isInteger(number)||number<1||number>604)return false;
  const ticket=++revision,start=performance.now();pendingTarget=target;
  try{
    const item=await load(number);if(ticket!==revision)return false;
    if(!transitionOverlay)removePreview();prepared.clear();clearTimeout(targetTimer);
    const built=build(item);current=number;active=built;audioSignature='';evict();
    text.replaceChildren(built.frame);text.classList.add('madinah-text');text.dataset.layoutState='ready';text.dataset.page=String(number);
    $('display-page-number').textContent=digits(number);
    const s=[...new Set(item.geometry.words.map(w=>w.surah))], title=s.map(n=>window.QuranAudio.SURAH_NAMES[n-1]).join('، ');
    $('toolbar-surah').textContent=title;
    const part='الجزء '+digits(juz.filter(n=>n<=number).length);$('toolbar-range').textContent=part;
    try{localStorage.setItem(STORAGE,JSON.stringify({displayPage:number,surah:item.geometry.words[0].surah,ayah:item.geometry.words[0].ayah}));}catch{}
    fit();
    if(transitionOverlay){
      const shell=$('mushaf-page');shell.classList.remove('is-swipe-dragging','is-swipe-settling');shell.style.transition='none';shell.style.transform='';
      transitionOverlay.remove();if(preview===transitionOverlay)preview=null;settling=false;
      requestAnimationFrame(()=>shell.style.removeProperty('transition'));
    }
    emit('mushaf:page-changed',{page:number});emit('mushaf:page-ready',{page:number});
    if(pendingTarget){for(const node of built.nodes.values())node.classList.toggle('is-search-target',node.dataset.verse===pendingTarget);pendingTarget=null;targetTimer=setTimeout(()=>text.querySelectorAll('.is-search-target').forEach(n=>n.classList.remove('is-search-target')),5500);}
    metrics.pageLoads.push({page:number,ms:performance.now()-start});if(metrics.pageLoads.length>604)metrics.pageLoads.shift();
    message('');
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
  }catch(e){if(ticket===revision){removePreview();settling=false;error(e);}return false;}
}
function removePreview(){
  preview?.remove();preview=null;
  const shell=$('mushaf-page');shell.classList.remove('is-swipe-dragging','is-swipe-settling');shell.style.removeProperty('transition');shell.style.removeProperty('transition-duration');shell.style.transform='';
  settling=false;
}
function preparePreview(number,item){
  if(prepared.has(number)||Math.abs(number-current)!==1)return;
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
function positionSwipe(dx,direction,width=$('mushaf-page').clientWidth){
  const shell=$('mushaf-page');shell.style.transform=`translate3d(${dx}px,0,0)`;
  if(preview)preview.style.transform=`translate3d(${dx-direction*width}px,0,0)`;
}
async function showPreview(number,direction,dx,width){
  if(number<1||number>604)return null;
  let shell=prepared.get(number);
  if(!shell){const item=await load(number);if(Math.abs(number-current)!==1)return null;preparePreview(number,item);shell=prepared.get(number);}
  if(!shell)return null;
  if(preview!==shell){preview?.remove();preview=shell;preview.dataset.target=String(number);preview.dataset.preparedPreview='used';stage.append(preview);}
  preview.classList.add('is-swipe-dragging');positionSwipe(dx,direction,width);return preview;
}
function waitForSwipeTransition(shell,duration){
  if(!duration)return Promise.resolve();
  return new Promise(resolve=>{
    let done=false;const finish=()=>{if(done)return;done=true;clearTimeout(timer);shell.removeEventListener('transitionend',finish);resolve();};
    const timer=setTimeout(finish,duration+90);shell.addEventListener('transitionend',finish);
  });
}
async function settleSwipe({dx,direction,target,width,commit}){
  const shell=$('mushaf-page'),duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:210;
  settling=true;shell.classList.remove('is-swipe-dragging');shell.classList.add('is-swipe-settling');
  if(preview){preview.classList.remove('is-swipe-dragging');preview.classList.add('is-swipe-settling');}
  // Commit only with the adjacent page already painted. A cold preview is
  // prepared after release while the current page remains under the finger.
  if(commit&&!preview){try{await showPreview(target,direction,dx,width);}catch{commit=false;}}
  if(commit&&!preview)commit=false;
  shell.style.transitionDuration=duration+'ms';if(preview)preview.style.transitionDuration=duration+'ms';
  // Flush the drag position once, then let the compositor finish both pages.
  shell.getBoundingClientRect();
  const finishPosition=()=>{
    shell.style.transform=commit?`translate3d(${direction*width}px,0,0)`:'translate3d(0,0,0)';
    if(preview)preview.style.transform=commit?'translate3d(0,0,0)':`translate3d(${-direction*width}px,0,0)`;
  };
  if(duration)requestAnimationFrame(finishPosition);else finishPosition();
  await waitForSwipeTransition(shell,duration);
  shell.style.removeProperty('transition-duration');if(preview)preview.style.removeProperty('transition-duration');
  if(commit){const overlay=preview,ok=await navigate(target,null,overlay);if(ok)return;}
  removePreview();settling=false;
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
  const msKey=state.currentTime*1000, segments=state.timing?.segments||[];
  const inVerse=(!Number.isFinite(state.timing?.timestampFrom)||msKey>=state.timing.timestampFrom)&&(!Number.isFinite(state.timing?.timestampTo)||msKey<state.timing.timestampTo);
  const realSegment=segments.findLast(s=>msKey>=s.start&&msKey<s.end);
  const firstSegment=segments.reduce((earliest,s)=>!earliest||s.start<earliest.start?s:earliest,null);
  // The opening syllable can precede the first provider word timestamp.
  // Never synthesize later gaps or a word from an unrelated verse.
  const leadWord=inVerse&&!realSegment&&firstSegment&&msKey<firstSegment.start&&
    (firstSegment.word===1||firstSegment.word===2)&&
    msKey>=(Number.isFinite(state.timing?.timestampFrom)?state.timing.timestampFrom:Math.max(0,firstSegment.start-2000));
  const segmentKey=realSegment||(leadWord?{word:1,endWord:1}:null);
  const signature=[current,playing?ref:'',segmentKey?.word,segmentKey?.endWord,state.reciterId,inVerse].join(':');
  if(signature===audioSignature)return;audioSignature=signature;
  const hadAudioWord=text.querySelector('.is-audio-word');
  for(const node of active.nodes.values())node.classList.remove('is-audio-word');
  if(hadAudioWord)paint(active);metrics.activeWordKeys=[];bands(playing?ref:'','audio-verse-band');if(!playing)return;
  const ms=state.currentTime*1000,t=state.timing;
  if(Number.isFinite(t.timestampFrom)&&ms<t.timestampFrom||Number.isFinite(t.timestampTo)&&ms>=t.timestampTo)return;
  // Require the complete provider ordinal range. No first-word guessing, no
  // interpolated gaps, and no count based on the current page's fragment.
  const map=maps[ref];
  const supported=[7,9020,9021,9022,...Array.from({length:19},(_,i)=>9000+i)].filter(i=>i!==9017).includes(Number(state.reciterId));
  const valid=supported&&map&&segments.length&&segments.every(s=>Number.isInteger(s.word)&&s.word>=1&&(s.endWord??s.word)<=map.sourceCount);
  if(!valid){metrics.lastTimingError='Unmapped provider ordinal '+ref;return;}
  const segment=realSegment||(leadWord?{word:1,endWord:1}:null);if(!segment)return;
  const keys=timingRange(map,segment);if(!keys){metrics.lastTimingError='Unmapped word '+ref;return;}
  for(const key of keys)active.nodes.get(key)?.classList.add('is-audio-word');
  metrics.activeWordKeys=keys;paint(active);
}
function follow(state){
  if(!state.playing||!state.autoFollow||state.provider!=='quran-foundation'||!active)return;
  const ref=`${state.surah}:${state.ayah}`,ms=state.currentTime*1000;
  const segment=state.timing?.segments?.findLast(s=>ms>=s.start&&ms<s.end);
  const keys=segment&&timingRange(maps[ref],segment), candidates=maps[ref]?.pages;
  // Keep a visible fragment. Move only when the active timed word is elsewhere.
  let page=candidates?.includes(current)?current:candidates?.[0];
  if(keys?.length){const target=manifest.pages.find(p=>keys.some(k=>{
    const tuple=k.split('~')[0].split(':').map(Number),lo=p.first.split(':').map(Number),hi=p.last.split(':').map(Number);
    const cmp=(a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2];return cmp(tuple,lo)>=0&&cmp(tuple,hi)<=0;
  }));page=target?.number??page;}
  if(page&&page!==current&&!pending.size)navigate(page);
}
function wordFromPoint(clientX,clientY){
  if(!active||!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
  const rect=active.frame.getBoundingClientRect(),{width,height}=active.geometry,x=(clientX-rect.left)*width/rect.width,y=(clientY-rect.top)*height/rect.height;
  if(x<0||y<0||x>width||y>height)return null;
  const basmala=[...text.querySelectorAll('.madinah-basmala')].find(n=>{const b=n.getBoundingClientRect();return clientX>=b.left&&clientX<=b.right&&clientY>=b.top&&clientY<=b.bottom;});if(basmala)return basmala;
  const g=active.geometry, candidates=g.words.filter(w=>x>=w.box[0]&&x<=w.box[2]&&y>=w.box[1]&&y<=w.box[3]);
  active.hitPaths??=new Map();const ctx=active.canvas.getContext('2d');
  // isPointInPath uses canvas space for the point; reset the paint transform.
  ctx.save();ctx.setTransform(1,0,0,1,0,0);
  try{for(const w of candidates)for(let i=w.firstPath;i<w.firstPath+w.nPaths;i++){
    if(!active.hitPaths.has(i))active.hitPaths.set(i,buildPath(g.paths[i]));
    if(ctx.isPointInPath(active.hitPaths.get(i),x,y,g.paths[i].rule))return active.nodes.get(SUBWORDS[`${w.surah}:${w.ayah}:${w.word}`]?.find(p=>p.paths.includes(i))?.key||`${w.surah}:${w.ayah}:${w.word}`);
  }}finally{ctx.restore();}
  const line=g.lines.filter(l=>l.box&&y>=l.box[1]&&y<=l.box[3]).sort((a,b)=>Math.abs((a.box[1]+a.box[3])/2-y)-Math.abs((b.box[1]+b.box[3])/2-y))[0];
  if(!line)return null;
  const w=g.words.slice(line.firstWord,line.firstWord+line.nWords).sort((a,b)=>Math.abs((a.box[0]+a.box[2])/2-x)-Math.abs((b.box[0]+b.box[2])/2-x))[0];
  return w?active.nodes.get(`${w.surah}:${w.ayah}:${w.word}`):null;
}
function settings(){
  prepared.clear();
  if(!THEMES[theme])theme='paper';const [paper,ink]=THEMES[theme];
  document.body.dataset.theme=theme;document.body.style.setProperty('--page-paper',paper);document.body.style.setProperty('--page-text',ink);document.body.style.setProperty('--reader-accent',theme==='dark'?'#76c8b9':'#176b63');
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.classList.toggle('is-active',b.dataset.themeChoice===theme);
  try{localStorage.setItem(SETTINGS,JSON.stringify({...read(SETTINGS,{}),fontSize:34,lineHeight:1.42,theme,paperColor:paper,textColor:ink}));}catch{}fit();
}
function closePanels(){return !!document.querySelector('#settings-sheet.is-open,#index-sheet.is-open,#verse-actions-sheet.is-open');}
function panel(id,open){const sheet=$(id+'-sheet'),back=$(id+'-backdrop');sheet.classList.toggle('is-open',open);sheet.setAttribute('aria-hidden',String(!open));back.hidden=!open;back.classList.toggle('is-open',open);document.body.classList.toggle(id+'-open',open);}
// A widely used surah-level Makki/Madani classification (Quran.com chapter
// metadata convention). This describes the surah as a whole, not every ayah.
const MEDINAN_SURAHS=new Set([2,3,4,5,8,9,13,22,24,33,47,48,49,55,57,58,59,60,61,62,63,64,65,66,76,98,99,110]);
const foldIndex=value=>String(value).replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).trim();
let activeIndexTab='surahs';
function navigateFromIndex(page,verseKey=null){
  panel('index',false);
  $('index-surah-search').blur();
  navigate(page,verseKey);
}
function index(tab=activeIndexTab){
  activeIndexTab=tab;
  const list=$('index-list'),jump=$('index-page-jump'),input=$('index-surah-search');
  const query=foldIndex(input?.value||'');
  const pageNumber=/^\d+$/.test(query)?Number(query):null;
  list.replaceChildren();
  jump.replaceChildren();jump.hidden=true;
  // Numbers in the main index mean actual Mushaf page numbers, not surah IDs.
  if(query&&pageNumber!==null){
    if(pageNumber>=1&&pageNumber<=604){
      const go=document.createElement('button');go.type='button';go.className='index-jump-action';
      const circle=document.createElement('span');circle.className='index-jump-icon';circle.textContent='↗';
      const labels=document.createElement('span'),title=document.createElement('strong'),hint=document.createElement('small');
      title.textContent='الانتقال إلى صفحة '+digits(pageNumber);
      hint.textContent='افتح الصفحة مباشرة في المصحف';
      labels.append(title,hint);go.append(circle,labels);
      go.onclick=()=>navigateFromIndex(pageNumber);jump.append(go);jump.hidden=false;
    }else{
      const msg=document.createElement('p');msg.className='index-empty';msg.textContent='رقم الصفحة من ١ إلى ٦٠٤';jump.append(msg);jump.hidden=false;
    }
    for(const b of document.querySelectorAll('[data-index-tab]')){
      b.classList.toggle('is-active',b.dataset.indexTab===tab);
      b.setAttribute('aria-pressed',String(b.dataset.indexTab===tab));
    }
    return;
  }
  const entries=tab==='juz'
    ?juz.map((page,i)=>({label:'الجزء '+digits(i+1),page,number:i+1}))
    :window.QuranAudio.SURAH_NAMES.map((name,i)=>({label:name,page:maps[(i+1)+':1'].pages[0],surah:i+1,number:i+1}));
  const filtered=entries.filter(e=>!query||foldIndex(e.label).includes(query));
  if(!filtered.length){const p=document.createElement('p');p.className='index-empty';p.textContent='مفيش سور مطابقة للبحث';list.append(p);}
  for(const e of filtered){
    const wrapper=document.createElement('div');wrapper.className='index-surah-group';
    const entry=document.createElement('button');entry.type='button';entry.className='index-entry';
    const number=document.createElement('span');number.className='index-entry-number';number.textContent=digits(e.number);
    const info=document.createElement('span');info.className='index-entry-info';
    const name=document.createElement('strong');name.className='index-entry-name';name.textContent=e.label;
    const meta=document.createElement('span');meta.className='index-entry-meta';
    const page=document.createElement('span');page.className='index-entry-page';page.textContent='صفحة '+digits(e.page);
    meta.append(page);
    if(e.surah){
      const type=document.createElement('span');type.className='index-revelation';
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
      svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
      svg.innerHTML=MEDINAN_SURAHS.has(e.surah)
        ?'<path d="M4 20V9l8-5 8 5v11M8 20v-7h8v7M2 20h20" />'
        :'<path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z" />';
      type.append(svg,document.createTextNode(MEDINAN_SURAHS.has(e.surah)?'مدنية':'مكية'));
      meta.append(type);
    }
    info.append(name,meta);entry.append(number,info);
    entry.setAttribute('aria-label','الانتقال إلى '+e.label+'، صفحة '+digits(e.page));
    entry.onclick=()=>navigateFromIndex(e.page);
    wrapper.append(entry);
    if(e.surah){
      const toggle=document.createElement('button');toggle.type='button';toggle.className='index-ayah-toggle';
      toggle.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>';
      toggle.setAttribute('aria-label','عرض آيات سورة '+e.label+' للانتقال إلى آية');
      toggle.setAttribute('aria-expanded','false');
      const area=document.createElement('div');area.className='index-ayah-panel';area.hidden=true;
      toggle.onclick=()=>{
        area.hidden=!area.hidden;
        toggle.setAttribute('aria-expanded',String(!area.hidden));
        if(area.childNodes.length)return;
        const input=document.createElement('input');input.type='search';input.className='index-ayah-search';
        input.placeholder='رقم الآية أو كلمة منها';input.setAttribute('aria-label','بحث في آيات '+e.label);
        const results=document.createElement('div');results.className='index-ayah-results';
        area.append(input,results);
        const paint=()=>{
          results.replaceChildren();
          const query=foldIndex(input.value);
          const found=verses.filter(v=>v.surah===e.surah&&(!query||String(v.ayah)===query||foldIndex(v.text).includes(query))).slice(0,120);
          for(const v of found){
            const b=document.createElement('button');b.type='button';b.className='index-ayah-result';
            const number=document.createElement('strong');number.textContent=digits(v.ayah);
            const excerpt=document.createElement('span');excerpt.textContent=v.text.slice(0,100);
            b.append(number,excerpt);
            b.onclick=()=>navigateFromIndex(maps[v.key].pages[0],v.key);
            results.append(b);
          }
          if(!found.length){const hint=document.createElement('p');hint.className='index-empty';hint.textContent='مفيش آيات مطابقة';results.append(hint);}
        };
        input.oninput=paint;paint();
      };
      wrapper.append(toggle,area);
    }
    list.append(wrapper);
  }
  for(const b of document.querySelectorAll('[data-index-tab]')){
    b.classList.toggle('is-active',b.dataset.indexTab===tab);
    b.setAttribute('aria-pressed',String(b.dataset.indexTab===tab));
  }
}

function wire(){
  for(const id of ['settings','index']){$('open-'+id).onclick=()=>{if(id==='index')index();panel(id,true);};$('close-'+id).onclick=()=>panel(id,false);$(id+'-backdrop').onclick=()=>panel(id,false);}
  for(const b of document.querySelectorAll('[data-index-tab]'))b.onclick=()=>index(b.dataset.indexTab);
  $('index-surah-search').oninput=()=>index();
  $('index-surah-search').addEventListener('keydown',event=>{
    if(event.key!=='Enter')return;
    const n=Number(foldIndex(event.currentTarget.value));
    if(/^\d+$/.test(foldIndex(event.currentTarget.value))&&n>=1&&n<=604){event.preventDefault();navigateFromIndex(n);}
  });
  for(const b of document.querySelectorAll('[data-theme-choice]'))b.onclick=()=>{theme=b.dataset.themeChoice;settings();};$('reset-settings').onclick=()=>{theme='paper';settings();};
  stage.addEventListener('click',e=>{if(suppress){suppress=false;return;}const word=wordFromPoint(e.clientX,e.clientY)||e.target.closest('.madinah-subword,.madinah-word');if(word){metrics.wordTaps++;emit('mushaf:word-tapped',{wordKey:word.dataset.wordKey,verseKey:word.dataset.verse});}if(!e.target.closest('button,a,input'))document.body.classList.toggle('tools-visible');});
  stage.addEventListener('keydown',e=>{const w=e.target.closest('.madinah-subword,.madinah-word');if(w&&(e.key==='Enter'||e.key===' ')){e.preventDefault();window.mushafVerseActions.openForVerse(...w.dataset.verse.split(':').map(Number));}});
  stage.addEventListener('pointerdown',e=>{
    if(e.pointerType==='touch')pointers.add(e.pointerId);
    if(settling||pointers.size>1||(visualViewport?.scale||1)>=1.01||closePanels()){drag=null;if(!settling)removePreview();return;}
    if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,dy:0,direction:0,target:0,width:$('mushaf-page').clientWidth};
  });
  stage.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;let dx=e.clientX-drag.x;const dy=e.clientY-drag.y;drag.dy=dy;if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)){drag=null;removePreview();return;}if(Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.2){const direction=dx>0?1:-1,target=current+direction,valid=target>=1&&target<=604;
    if(!valid)dx*=.22;drag.dx=dx;drag.direction=direction;drag.target=target;
    const shell=$('mushaf-page');shell.classList.add('is-swipe-dragging');shell.classList.remove('is-swipe-settling');
    if(valid&&preview?.dataset.target!==String(target)){preview?.remove();preview=null;showPreview(target,direction,dx,drag.width).then(node=>{if(node&&drag?.id===e.pointerId&&drag.target===target)positionSwipe(drag.dx,direction,drag.width);else if(!settling&&preview===node){node.remove();preview=null;}}).catch(()=>{});}
    positionSwipe(dx,direction,drag.width);suppress=true;}});
  const release=e=>{pointers.delete(e.pointerId);if(!drag||drag.id!==e.pointerId)return;const gesture=drag;drag=null;const threshold=Math.min(85,stage.clientWidth*.2),valid=gesture.target>=1&&gesture.target<=604;
    const commit=e.type==='pointerup'&&valid&&Math.abs(gesture.dx)>threshold;settleSwipe({...gesture,commit});};
  stage.addEventListener('pointerup',release);stage.addEventListener('pointercancel',release);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'){panel('index',false);panel('settings',false);return;}if(e.target.closest('input,textarea')||closePanels())return;if(e.key==='ArrowLeft')navigate(current+1);if(e.key==='ArrowRight')navigate(current-1);});
  const zoom=()=>{const value=(visualViewport?.scale||1)>=1.01;document.body.classList.toggle('is-pinch-panning',value);if(value){drag=null;removePreview();}prepared.clear();fit();};
  visualViewport?.addEventListener('resize',zoom);visualViewport?.addEventListener('scroll',zoom);
  new ResizeObserver(fit).observe(text);
}
async function init(){
  const data=await Promise.all(['data/qvp/manifest.json','data/qvp/word-map.json','data/quran-uthmani.txt'].map(async url=>{const r=await fetch(url);if(!r.ok)throw new Error(url);return url.endsWith('.txt')?r.text():r.json();}));
  [manifest,maps]=data;verses=parseTanzil(data[2]);verseIndex=new Map(verses.map(v=>[v.key,v]));if(verses.length!==6236)throw new Error('Text coverage');
  window.mushafReader={engine:'qvp',edition:manifest.edition,
    getCurrentPage:()=>current,getSearchVerses:()=>verses.map(({key,...v})=>({...v})),getSurahName:n=>window.QuranAudio.SURAH_NAMES[n-1]||'',
    getVerse:(s,a)=>{const v=verseIndex.get(s+':'+a);return v?{surah:v.surah,ayah:v.ayah,text:v.text}:null;},
    findVersePage:(s,a)=>maps[s+':'+a]?.pages[0]||null,
    goToPage:n=>{if(closePanels()||!Number.isInteger(n)||n<1||n>604)return false;navigate(n);return true;},
    goToVerse:(s,a,p)=>{const key=s+':'+a,v=maps[key];if(closePanels()||!v)return false;navigate(v.pages.includes(p)?p:v.pages[0],key);return true;},
    fitElement:fit, clearFitCache(){}, turnPageInstant:d=>{if(![1,-1].includes(d)||current+d<1||current+d>604)return false;navigate(current+d);return true;}
  };
  window.mushafQvp={metrics,navigate,syncAudio,follow,wordFromPoint,splitWords,getPreparedPages:()=>[...prepared.keys()],getGeometry:()=>active?.geometry,getMapping:key=>maps[key],getManifest:()=>manifest,drawReference:()=>active?.paint};
  settings();
  const hash=new URLSearchParams(location.hash.slice(1)),v=hash.get('verse');
  const saved=read(STORAGE,{}).displayPage,initial=v&&maps[v]?maps[v].pages[0]:Number.isInteger(saved)&&saved>=1&&saved<=604?saved:1;
  if(!await navigate(initial,v))throw new Error('Initial page failed');
  wire();emit('mushaf:data-ready',{});$('loading-screen')?.remove();metrics.ready=true;
  if(v&&hash.get('action')==='tafsir')window.mushafTafsir?.open({surah:+v.split(':')[0],ayah:+v.split(':')[1],verseKey:v});
  // Cold install is local inside Android. Web offline is explicit after first visit;
  // pages already visited are cached; full corpus installation is a separate test.

}
export const ready=init();
