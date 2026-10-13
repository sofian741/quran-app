(() => {
'use strict';
const c=window.QuranAudio,d=window.QuranDownloads;
if(!c||!d)return;
const cached=c.CatalogService.prototype.cached;
const load=c.CatalogService.prototype.load;
function merge(list){
 const result=[...list],groups=new Map();
 new d.DownloadManager().list().filter(t=>t.provider==='mp3quran').forEach(t=>{
  const m=/^(https:\/\/[^?#]+\/)(\d{3})\.mp3(?:[?#].*)?$/i.exec(t.url);
  if(!m||Number(m[2])!==Number(t.surah))return;
  const id=Number(t.reciterId),surah=Number(t.surah);
  if(!Number.isInteger(id)||id<=0||surah<1||surah>114)return;
  const key=id+':'+m[1];
  if(!groups.has(key))groups.set(key,{id,name:t.reciterName||'قارئ القرآن',server:m[1],surahs:new Set(),moshafId:Number(t.moshafId)||0,moshafName:t.moshafName||'التسجيلات المحفوظة'});
  groups.get(key).surahs.add(surah);
 });
 groups.forEach(group=>{
  let reciter=result.find(r=>r.id===group.id);
  if(!reciter){reciter={id:group.id,name:group.name,moshaf:[]};result.push(reciter);}
  // Preserve official catalog recordings. Add a cached-only recording if needed.
  if(reciter.moshaf.some(m=>m.server===group.server))return;
  const surahs=[...group.surahs].sort((a,b)=>a-b);
  reciter.moshaf.push({id:group.moshafId,name:group.moshafName+' • محفوظ على الجهاز',
   server:group.server,surahs,complete:surahs.length===114});
 });
 return c.sortReciters(result);
}
c.CatalogService.prototype.cached=function(){return merge(cached.call(this));};
c.CatalogService.prototype.load=async function(){return merge(await load.call(this));};
})();
