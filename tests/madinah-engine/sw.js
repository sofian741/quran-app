// Independent scope/cache; never activate or purge a production shell cache.
const CACHE = 'ayat-madinah-lab-v1';
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  const r=event.request;
  if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE), saved=await cache.match(r,{ignoreSearch:r.mode==='navigate'});
    if(saved)return saved;
    const response=await fetch(r);
    if(response.ok)await cache.put(r,response.clone());
    return response;
  })());
});
