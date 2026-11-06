(() => {
  'use strict';
  const button=document.getElementById('toggle-vertical-reading');
  const surface=document.getElementById('vertical-reading');
  const viewport=document.getElementById('vertical-reading-content');
  const list=document.getElementById('vertical-reading-list');
  const status=document.getElementById('vertical-reading-status');
  if(!button||!surface||!viewport||!list||!status)return;
  const DATA_URL='./data/tafsir_muyassar.json',BATCH_SIZE=14;
  const ARABIC_DIGITS='٠١٢٣٤٥٦٧٨٩';
  const digits=n=>String(n).replace(/\d/g,d=>ARABIC_DIGITS[Number(d)]);
  let dataPromise=null,ordered=[],position=0,active=false,opening=0,rendering=false;
  let lastVisibleKey=null;
  const keyOf=v=>v.surah+':'+v.ayah;

  function loadData(){
    if(!dataPromise)dataPromise=fetch(DATA_URL,{cache:'force-cache'}).then(async response=>{
      if(!response.ok)throw new Error('Tafsir '+response.status);
      const data=await response.json();
      if(data.api_key!=='arabic_moyassar'||data.total_verses!==6236||
         !data.verses||Object.keys(data.verses).length!==6236)throw new Error('Incomplete tafsir');
      return data.verses;
    }).catch(error=>{dataPromise=null;throw error;});
    return dataPromise;
  }
  function setStatus(message,retry=false){
    status.replaceChildren();
    if(!message)return;
    const line=document.createElement('span');line.textContent=message;status.append(line);
    if(retry){
      const br=document.createElement('div'),b=document.createElement('button');
      b.type='button';b.textContent='إعادة المحاولة';b.addEventListener('click',()=>start());
      br.append(b);status.append(br);
    }
  }
  function surahHeader(number){
    const heading=document.createElement('header');heading.className='vertical-surah-heading';
    const title=document.createElement('h2');title.textContent='سورة '+(window.mushafReader?.getSurahName(number)||digits(number));
    heading.append(title);
    return heading;
  }
  function verseNode(verse,record){
    const section=document.createElement('section');section.className='vertical-verse';section.dataset.verse=verse.key;
    const ayah=document.createElement('p');ayah.className='vertical-ayah';ayah.lang='ar';
    ayah.append(document.createTextNode(record.arabic_text+' '));
    const number=document.createElement('span');number.className='vertical-ayah-number';
    number.textContent='﴿'+digits(verse.ayah)+'﴾';number.setAttribute('aria-label','الآية '+digits(verse.ayah));ayah.append(number);
    const tafsir=document.createElement('p');tafsir.className='vertical-tafsir';tafsir.lang='ar';tafsir.textContent=record.translation;
    section.append(ayah,tafsir);return section;
  }
  let records=null;
  function appendBatch(){
    if(!active||rendering||!records||position>=ordered.length)return;
    rendering=true;
    const frag=document.createDocumentFragment(),end=Math.min(position+BATCH_SIZE,ordered.length);
    for(let i=position;i<end;i++){
      const verse=ordered[i],record=records[verse.key];
      if(!record||!record.arabic_text||!record.translation||
         Number(record.sura)!==verse.surah||Number(record.aya)!==verse.ayah){
        setStatus('فيه آية ناقصة أو غير متطابقة في ملف التفسير. تم إيقاف العرض حفاظًا على دقة النص.',false);
        position=ordered.length;break;
      }
      if(i===0||ordered[i-1].surah!==verse.surah)frag.append(surahHeader(verse.surah));
      frag.append(verseNode(verse,record));
      position=i+1;
    }
    list.append(frag);
    rendering=false;
    if(position>=ordered.length&&status.textContent==='')setStatus('تمت قراءة آخر آية في المصحف.');
  }
  function appendIfNearEnd(){
    if(!active||rendering)return;
    let rounds=0;
    while(position<ordered.length&&viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight<650&&rounds++<3)appendBatch();
  }
  function getFirstVerse(){
    const geometry=window.mushafQvp?.getGeometry?.();
    const first=geometry?.words?.[0];
    if(first&&Number.isInteger(first.surah)&&Number.isInteger(first.ayah))return first.surah+':'+first.ayah;
    const page=window.mushafReader?.getCurrentPage?.();
    if(!page)return null;
    const all=window.mushafReader?.getSearchVerses?.()||[];
    return all.find(v=>window.mushafReader.findVersePage(v.surah,v.ayah)===page)?.key||null;
  }
  async function start(){
    const token=++opening;
    if(!window.mushafReader?.getSearchVerses||!window.mushafQvp?.getGeometry){
      setStatus('المصحف لسه بيجهز. افتح الوضع بعد ظهور الصفحة.',true);return;
    }
    const firstKey=getFirstVerse();
    if(!firstKey){setStatus('تعذّر تحديد بداية الصفحة الحالية.',true);return;}
    ordered=window.mushafReader.getSearchVerses();
    const i=ordered.findIndex(v=>v.key===firstKey);
    if(i<0){setStatus('تعذّر العثور على أول آية في الصفحة.',true);return;}
    position=i;records=null;lastVisibleKey=firstKey;
    list.replaceChildren();viewport.scrollTop=0;
    setStatus('جاري تجهيز القراءة الرأسية…');
    try{
      const data=await loadData();
      if(token!==opening||!active)return;
      records=data;
      setStatus('');
      appendBatch();
      appendIfNearEnd();
    }catch(error){
      if(token!==opening||!active)return;
      console.error('Vertical reading data failed:',error);
      setStatus('تعذّر تحميل التفسير المحلي. تأكد من اكتمال ملفات التطبيق.',true);
    }
  }
  function updateVisibleVerse(){
    if(!active)return;
    const nodes=list.querySelectorAll('.vertical-verse');
    const top=viewport.getBoundingClientRect().top+Math.min(120,viewport.clientHeight*.2);
    for(const node of nodes){
      if(node.getBoundingClientRect().bottom>=top){lastVisibleKey=node.dataset.verse;return;}
    }
  }
  function open(){
    if(active)return;
    active=true;
    document.body.classList.add('vertical-reading-active');
    surface.hidden=false;
    button.setAttribute('aria-pressed','true');
    button.setAttribute('aria-label','الرجوع إلى المصحف');
    button.title='الرجوع إلى المصحف';
    start();
  }
  function close(){
    if(!active)return;
    updateVisibleVerse();
    active=false;++opening;
    document.body.classList.remove('vertical-reading-active');
    surface.hidden=true;
    button.setAttribute('aria-pressed','false');
    button.setAttribute('aria-label','القراءة الرأسية مع التفسير');
    button.title='القراءة الرأسية مع التفسير';
    const key=lastVisibleKey;
    if(key){
      const [surah,ayah]=key.split(':').map(Number);
      const page=window.mushafReader?.findVersePage?.(surah,ayah);
      if(page&&page!==window.mushafReader?.getCurrentPage?.())window.mushafReader.goToPage(page);
    }
  }
  button.addEventListener('click',()=>active?close():open());
  // In this mode tapping plain text mirrors the mushaf's tap-to-show-controls behavior.
  viewport.addEventListener('click',event=>{
    if(!event.target.closest('button,a,input'))document.body.classList.toggle('tools-visible');
  });
  let scheduled=false;
  viewport.addEventListener('scroll',()=>{
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{scheduled=false;updateVisibleVerse();appendIfNearEnd();});
  },{passive:true});
  window.addEventListener('keydown',event=>{
    if(active&&event.key==='Escape'){close();event.preventDefault();}
  });
  window.addEventListener('mushaf:data-ready',()=>{if(active&&!records)start();});
})();
