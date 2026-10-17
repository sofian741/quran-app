(() => {
'use strict';
if(!document.querySelector('link[href="recitations-overrides.css"]')){const link=document.createElement('link');link.rel='stylesheet';link.href='recitations-overrides.css';document.head.append(link)}
const target=document.getElementById('my-library-summary');
if(!target)return;
function render(){let items=[];try{items=JSON.parse(localStorage.getItem('quranAudioDownloadsV1')||'[]');if(!Array.isArray(items))items=[]}catch{items=[]}items=items.filter(x=>x&&x.provider==='mp3quran'&&Number(x.surah)>=1&&Number(x.surah)<=114);const readers=new Set(items.map(x=>String(x.reciterId||x.reciterName||''))),digits=v=>String(v).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);if(!items.length){target.textContent='نزّل أي سورة وستظهر هنا مرتبة حسب القارئ والسورة';return}target.textContent=`${digits(readers.size)} ${readers.size===1?'قارئ':'قرّاء'} • ${digits(items.length)} تلاوة محفوظة`}
render();window.addEventListener('quran-downloads:change',render);window.addEventListener('storage',e=>{if(e.key==='quranAudioDownloadsV1')render()});
})();
