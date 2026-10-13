(() => {
'use strict';
const c=window.QuranAudio,d=window.QuranDownloads,e=window.quranAudioEngine,$=id=>document.getElementById(id);
if(!c||!d||!e||!$('library-search'))return;
const dm=new d.DownloadManager(), opened=new Set();
const ui={list:$('downloads-list'),count:$('downloads-count'),readers:$('library-readers'),size:$('library-size'),search:$('library-search'),status:$('downloads-status'),player:$('main-player')};
const tracks=()=>dm.list().filter(t=>t.provider==='mp3quran'&&Number(t.surah)>=1&&Number(t.surah)<=114);
function source(item){
 const m=/^(https:\/\/[^?#]+\/)(\d{3})\.mp3(?:[?#].*)?$/i.exec(item.url);
 if(!m||Number(m[2])!==Number(item.surah))return null;
 const surahs=[...new Set(tracks().filter(t=>t.reciterId==item.reciterId&&t.url.startsWith(m[1])).map(t=>Number(t.surah)))].sort((a,b)=>a-b);
 const moshaf={id:Number(item.moshafId)||0,name:item.moshafName||'تلاواتي المحفوظة',server:m[1],surahs,complete:surahs.length===114};
 return {reciter:{id:Number(item.reciterId)||0,name:item.reciterName||'قارئ القرآن',moshaf:[moshaf]},moshaf};
}
async function play(item){
 const s=source(item);
 if(!s){ui.status.textContent='تعذّر تحديد مصدر التسجيل المحفوظ.';return;}
 const ok=await e.selectMp3(s.reciter,s.moshaf,{surah:Number(item.surah),autoplay:true,position:0});
 if(!ok){ui.status.textContent='تعذّر تشغيل التلاوة المحفوظة.';return;}
 ui.player.scrollIntoView({behavior:'smooth',block:'start'});
}
function render(){
 const items=tracks(),groups=new Map();
 items.forEach(t=>{const key=String(t.reciterId||t.reciterName||'unknown');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(t);});
 ui.count.textContent=c.arabicDigits(items.length);
 ui.readers.textContent=c.arabicDigits(groups.size)+' قرّاء';
 ui.size.textContent=d.humanSize(items.reduce((n,t)=>n+(Number(t.bytes)||0),0));
 const query=c.normalizeArabic(ui.search.value.trim()),fragment=document.createDocumentFragment();
 if(!items.length){const p=document.createElement('p');p.className='downloads-empty';p.textContent='مكتبتك لسه فاضية. اختار قارئًا وسورة واضغط «تنزيل السورة» عشان تسمعها بدون إنترنت.';fragment.append(p);}
 let found=0;
 [...groups.entries()].sort((a,b)=>(a[1][0].reciterName||'').localeCompare(b[1][0].reciterName||'','ar')).forEach(([key,all])=>{
  const reader=all[0].reciterName||'قارئ القرآن';
  const matched=all.filter(t=>!query||c.normalizeArabic(reader).includes(query)||c.normalizeArabic(t.surahName||c.SURAH_NAMES[t.surah-1]).includes(query));
  if(!matched.length)return;found++;
  matched.sort((a,b)=>Number(a.surah)-Number(b.surah)||(a.moshafName||'').localeCompare(b.moshafName||'','ar'));
  const group=document.createElement('details');group.className='library-group';
  group.open=!!query||opened.has(key)||(groups.size===1&&!opened.has('closed:'+key));
  group.addEventListener('toggle',()=>{if(group.open){opened.add(key);opened.delete('closed:'+key);}else{opened.delete(key);opened.add('closed:'+key);}});
  const head=document.createElement('summary'),avatar=document.createElement('span');avatar.className='group-avatar';avatar.textContent=reader.replace(/^(الشيخ|القارئ)\s+/u,'').trim().charAt(0)||'۞';avatar.setAttribute('aria-hidden','true');
  const info=document.createElement('span');info.className='group-name';
  const name=document.createElement('strong');name.textContent=reader;
  const sub=document.createElement('small');sub.textContent=c.arabicDigits(all.length)+' تلاوة • '+d.humanSize(all.reduce((n,t)=>n+(Number(t.bytes)||0),0));
  info.append(name,sub);const arrow=document.createElement('span');arrow.className='group-arrow';arrow.textContent='‹';arrow.setAttribute('aria-hidden','true');head.append(avatar,info,arrow);
  const body=document.createElement('div');body.className='group-tracks';
  matched.forEach(item=>{
   const row=document.createElement('div');row.className='download-row';
   const details=document.createElement('span');details.className='download-row-info';
   const title=document.createElement('strong');title.textContent=c.arabicDigits(item.surah)+'. سورة '+(item.surahName||c.SURAH_NAMES[item.surah-1]);
   const small=document.createElement('small');small.textContent=(item.moshafName?item.moshafName+' • ':'')+d.humanSize(item.bytes);
   details.append(title,small);
   const playBtn=document.createElement('button');playBtn.type='button';playBtn.textContent='استمع';playBtn.setAttribute('aria-label','تشغيل '+title.textContent+' بصوت '+reader);playBtn.addEventListener('click',()=>play(item));
   const del=document.createElement('button');del.type='button';del.className='remove-download';del.textContent='حذف';del.setAttribute('aria-label','حذف '+title.textContent+' بصوت '+reader);
   del.addEventListener('click',async()=>{if(!confirm('حذف '+title.textContent+' بصوت '+reader+' من الجهاز؟'))return;del.disabled=true;try{await dm.remove(item.url);ui.status.textContent='تم حذف التلاوة.';}catch(_){del.disabled=false;ui.status.textContent='تعذّر حذف التلاوة.';}});
   row.append(details,playBtn,del);body.append(row);
  });group.append(head,body);fragment.append(group);
 });
 if(items.length&&!found){const p=document.createElement('p');p.className='downloads-empty';p.textContent='لا توجد نتائج مطابقة للبحث.';fragment.append(p);}
 ui.list.replaceChildren(fragment);
}
ui.search.addEventListener('input',render);
window.addEventListener('quran-downloads:change',render);
window.addEventListener('storage',ev=>{if(ev.key===d.INDEX_KEY)render();});
render();
})();
