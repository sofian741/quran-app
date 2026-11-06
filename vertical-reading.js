(() => {
  'use strict';
  const button=document.getElementById('toggle-vertical-reading');
  const surface=document.getElementById('vertical-reading');
  const viewport=document.getElementById('vertical-reading-content');
  const list=document.getElementById('vertical-reading-list');
  const status=document.getElementById('vertical-reading-status');
  const followButton=document.getElementById('vertical-follow-reciter');
  if(!button||!surface||!viewport||!list||!status)return;
  const DATA_URL='./data/tafsir_muyassar.json',BATCH_SIZE=14;
  const ARABIC_DIGITS='٠١٢٣٤٥٦٧٨٩';
  const digits=n=>String(n).replace(/\d/g,d=>ARABIC_DIGITS[Number(d)]);
  let dataPromise=null,ordered=[],position=0,topIndex=0,active=false,opening=0,rendering=false;
  let lastScrollTop=0,touchY=null,ignorePageEvent=null,followingAudio=false,lastAudioKey='',lastCueKey='',pendingScrollSync=false;
  let listeningVerse=null,holdTimer=null,holdStart=null,suppressVerseClick=false,latestAudioState=null,manualFollowSuspended=false;
  let lastVisibleKey=null;
  const keyOf=v=>v.surah+':'+v.ayah;
  const reader=()=>window.mushafReader;
  const qvp=()=>window.mushafQvp;
  const validPage=n=>Number.isInteger(n)&&n>=1&&n<=604;
  const pageForVerse=(key,referencePage=null)=>{
    const pages=qvp()?.getMapping?.(key)?.pages||[];
    if(validPage(referencePage)&&pages.includes(referencePage))return referencePage;
    return pages[0]||null;
  };
  const notifyPage=page=>{
    if(!validPage(page))return;
    // Native page-reader owns the displayed badge and persisted reading position.
    if(reader()?.getCurrentPage?.()!==page){ignorePageEvent=page;reader()?.goToPage?.(page);}
  };

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
    section.dataset.surah=String(verse.surah);
    const ayah=document.createElement('p');ayah.className='vertical-ayah';ayah.lang='ar';
    // Keep Quran text unchanged. For a verified full word mapping only, wrap
    // each original token so the current recited word can be colored.
    const words=record.arabic_text.trim().split(/\s+/);
    const map=qvp()?.getMapping?.(verse.key);
    const source=verse.text?.trim().split(/\s+/)||[];
    const normal=t=>t.normalize('NFD').replace(/[\p{M}\u0640\u06D6-\u06ED\s\u202f]/gu,'').replace(/ٱ/g,'ا').replace(/ى/g,'ي');
    const safeMapping=words.length===source.length&&words.length===map?.sourceCount&&words.every((w,i)=>normal(w)===normal(source[i]));
    if(safeMapping){
      words.forEach((word,i)=>{const span=document.createElement('span');span.className='vertical-ayah-word';span.dataset.ordinal=String(i+1);span.textContent=word;ayah.append(span,document.createTextNode(' '));});
      section.dataset.wordMapped='true';
    }else ayah.append(document.createTextNode(record.arabic_text+' '));
    const number=document.createElement('span');number.className='vertical-ayah-number';
    number.textContent='﴿'+digits(verse.ayah)+'﴾';number.setAttribute('aria-label','الآية '+digits(verse.ayah));ayah.append(number);
    const annotation=document.createElement('div');annotation.className='vertical-tafsir-label';annotation.textContent='التفسير الميسّر';
    const tafsir=document.createElement('p');tafsir.className='vertical-tafsir';tafsir.lang='ar';tafsir.textContent=record.translation;
    const actions=document.createElement('div');actions.className='vertical-verse-actions';actions.hidden=true;
    const listen=document.createElement('button');listen.type='button';listen.className='vertical-verse-listen';
    listen.textContent='استماع';listen.setAttribute('aria-label','الاستماع إلى الآية '+digits(verse.ayah));
    listen.addEventListener('click',event=>{
      event.stopPropagation();
      const [surah,ayahNumber]=verse.key.split(':').map(Number);
      if(window.mushafVerseActions?.openForReference?.(surah,ayahNumber)){
        document.querySelector('[data-verse-action="listen"]')?.click();
        actions.hidden=true;listeningVerse=null;
      }
    });
    actions.append(listen);
    section.append(ayah,annotation,tafsir,actions);return section;
  }
  let records=null;
  function appendBatch(){
    if(!active||rendering||!records||position>=ordered.length)return;
    rendering=true;
    const frag=document.createDocumentFragment(),end=Math.min(position+BATCH_SIZE,ordered.length);
    for(let i=position;i<end;i++){
      const verse=ordered[i],record=records[verse.key];
      if(!validRecord(verse,record)){
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
  function prependBatch(){
    if(!active||rendering||!records||topIndex<=0)return;
    rendering=true;
    const from=Math.max(0,topIndex-12),frag=document.createDocumentFragment();
    for(let i=from;i<topIndex;i++){
      const verse=ordered[i],record=records[verse.key];
      if(!validRecord(verse,record)){rendering=false;setStatus('تعذّر مطابقة آية مع التفسير. أوقفنا العرض حفاظًا على صحة النص.');return;}
      if(i===0||ordered[i-1].surah!==verse.surah)frag.append(surahHeader(verse.surah));
      frag.append(verseNode(verse,record));
    }
    const heightBefore=viewport.scrollHeight,scrollBefore=viewport.scrollTop;
    // Keep the exact visible sentence stationary when inserting earlier verses.
    list.prepend(frag);
    topIndex=from;
    viewport.scrollTop=scrollBefore+(viewport.scrollHeight-heightBefore);
    rendering=false;
  }
  function validRecord(verse,record){
    return !!(record&&record.arabic_text&&record.translation&&Number(record.sura)===verse.surah&&Number(record.aya)===verse.ayah);
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
    const candidate=all.find(v=>window.mushafReader.findVersePage(v.surah,v.ayah)===page);
    return candidate?keyOf(candidate):null;
  }
  async function start(pageOverride=null){
    const token=++opening;
    if(!window.mushafReader?.getSearchVerses||!window.mushafQvp?.getGeometry){
      setStatus('المصحف لسه بيجهز. افتح الوضع بعد ظهور الصفحة.',true);return;
    }
    const targetPage=validPage(pageOverride)?pageOverride:reader()?.getCurrentPage?.();
    const firstKey=getFirstVerse();
    if(!firstKey){setStatus('تعذّر تحديد بداية الصفحة الحالية.',true);return;}
    // The reader's search API deliberately omits the internal key field.
    // Reconstruct a canonical surah:ayah key instead of comparing undefined.
    ordered=window.mushafReader.getSearchVerses().map(v=>({...v,key:keyOf(v)}));
    const i=ordered.findIndex(v=>v.key===firstKey);
    if(i<0){setStatus('تعذّر العثور على أول آية في الصفحة.',true);return;}
    position=i;topIndex=i;records=null;lastVisibleKey=firstKey;
    followingAudio=false;lastAudioKey='';lastCueKey='';manualFollowSuspended=false;
    lastScrollTop=0;
    list.replaceChildren();viewport.scrollTop=0;
    setStatus('جاري تجهيز القراءة الرأسية…');
    try{
      const data=await loadData();
      if(token!==opening||!active)return;
      records=data;
      setStatus('');
      appendBatch();
      appendIfNearEnd();
      if(validPage(targetPage))notifyPage(targetPage);
    }catch(error){
      if(token!==opening||!active)return;
      console.error('Vertical reading data failed:',error);
      setStatus('تعذّر تحميل التفسير المحلي. تأكد من اكتمال ملفات التطبيق.',true);
    }
  }
  function updateVisibleVerse(){
    if(!active)return;
    const nodes=list.querySelectorAll('.vertical-verse');
    const top=viewport.getBoundingClientRect().top+Math.min(80,viewport.clientHeight*.12);
    for(const node of nodes){
      if(node.getBoundingClientRect().bottom>=top){
        const old=lastVisibleKey;
        lastVisibleKey=node.dataset.verse;
        if(lastVisibleKey!==old&&!followingAudio){
          // Page boundaries may split a single verse. Only navigate when its
          // actual first-page assignment changes; never guess a word location.
          const page=pageForVerse(lastVisibleKey,reader()?.getCurrentPage?.());
          if(page)notifyPage(page);
        }
        return;
      }
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
    if(followButton)followButton.hidden=true;
    start();
  }
  function close(){
    if(!active)return;
    updateVisibleVerse();
    active=false;++opening;followingAudio=false;manualFollowSuspended=false;
    document.body.classList.remove('vertical-reading-active');
    surface.hidden=true;
    if(followButton)followButton.hidden=true;
    button.setAttribute('aria-pressed','false');
    button.setAttribute('aria-label','القراءة الرأسية مع التفسير');
    button.title='القراءة الرأسية مع التفسير';
    const key=lastVisibleKey;
    if(key){
      const [surah,ayah]=key.split(':').map(Number);
      const page=pageForVerse(key,reader()?.getCurrentPage?.());
      if(page&&page!==reader()?.getCurrentPage?.())reader()?.goToPage?.(page);
    }
  }
  button.addEventListener('click',()=>active?close():open());
  // In this mode tapping plain text mirrors the mushaf's tap-to-show-controls behavior.
  viewport.addEventListener('click',event=>{
    if(!event.target.closest('.vertical-verse,button,a,input'))document.body.classList.toggle('tools-visible');
  });
  let scheduled=false;
  function onScroll(){
    if(scheduled)return;scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      const now=viewport.scrollTop,goingUp=now<lastScrollTop;
      updateVisibleVerse();
      if(goingUp&&now<Math.max(500,viewport.clientHeight*.8))prependBatch();
      appendIfNearEnd();lastScrollTop=viewport.scrollTop;
      if(active&&latestAudioState?.playing)updateFollowButton();
    });
  }
  viewport.addEventListener('scroll',onScroll,{passive:true});
  // At the initial top boundary scrollTop cannot turn negative. A downward
  // finger gesture / upward mouse wheel therefore needs to load earlier ayat.
  viewport.addEventListener('touchstart',event=>{touchY=event.touches[0]?.clientY??null;},{passive:true});
  viewport.addEventListener('touchmove',event=>{
    const y=event.touches[0]?.clientY;
    if(active&&touchY!==null&&Math.abs(y-touchY)>12){followingAudio=false;manualFollowSuspended=true;}
    if(active&&touchY!==null&&y>touchY+18&&viewport.scrollTop<50){prependBatch();touchY=y;}
  },{passive:true});
  viewport.addEventListener('touchend',()=>{touchY=null;},{passive:true});
  viewport.addEventListener('wheel',event=>{
    followingAudio=false;manualFollowSuspended=true;
    if(active&&event.deltaY<0&&viewport.scrollTop<50)prependBatch();
  },{passive:true});
  window.addEventListener('keydown',event=>{
    if(active&&event.key==='Escape'){close();event.preventDefault();}
  });
  // Cross-mode navigation: index searches, favorites, page bookmarks, and
  // direct verse jumps all travel through the QVP page-changed event.
  window.addEventListener('mushaf:page-changed',event=>{
    if(!active)return;
    const page=event.detail?.page;
    if(!validPage(page))return;
    if(ignorePageEvent===page){ignorePageEvent=null;return;}
    ignorePageEvent=null;
    // A new explicit page selection should reposition the vertical reader,
    // even when its scroll list already contains that page.
    start(page);
  });
  function isVisible(element){
    if(!element)return false;
    const box=element.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
    // Honor visible reading area, including the open audio controls.
    const top=frame.top+Math.max(12,parseFloat(getComputedStyle(viewport).paddingTop)||0);
    const footer=document.body.classList.contains('tools-visible')?
      document.getElementById('mushaf-audio-player')?.getBoundingClientRect().top:frame.bottom;
    const bottom=Math.min(frame.bottom,Number.isFinite(footer)?footer:frame.bottom)-12;
    return box.bottom>top+5&&box.top<bottom-5;
  }
  function easeIntoView(element){
    if(!element)return;
    const box=element.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
    const top=frame.top+Math.max(16,parseFloat(getComputedStyle(viewport).paddingTop)||0);
    const playerTop=document.body.classList.contains('tools-visible')?
      document.getElementById('mushaf-audio-player')?.getBoundingClientRect().top:frame.bottom;
    const bottom=Math.min(frame.bottom,Number.isFinite(playerTop)?playerTop:frame.bottom)-20;
    if(box.bottom>top&&box.top<bottom)return; // Already visible: NEVER reposition.
    const delta=box.top>=bottom?box.top-bottom+36:box.top-top-24;
    followingAudio=true;
    viewport.scrollBy({top:delta,behavior:'smooth'});
  }
  function audioWord(state,key){
    const timing=state.timing,map=qvp()?.getMapping?.(key),ms=state.currentTime*1000;
    if(!timing||!map)return 0;
    if(Number.isFinite(timing.timestampFrom)&&ms<timing.timestampFrom||
       Number.isFinite(timing.timestampTo)&&ms>=timing.timestampTo)return 0;
    const segments=timing.segments||[];
    const segment=segments.findLast(item=>ms>=item.start&&ms<item.end);
    const supported=[7,9020,9021,9022,...Array.from({length:19},(_,i)=>9000+i)].filter(n=>n!==9017).includes(Number(state.reciterId));
    if(!supported||!segment||!segments.length)return 0;
    // Some valid sources number the first word from 0. Use their actual
    // declared ordinal convention, without interpolating missing timestamps.
    const zeroBased=segments.some(item=>item.word===0);
    const ordinal=segment.word+(zeroBased?1:0);
    if(!Number.isInteger(ordinal)||ordinal<1||ordinal>map.sourceCount)return 0;
    if(segments.some(item=>!Number.isInteger(item.word)||item.word<(zeroBased?0:1)||
      item.word+(zeroBased?1:0)>map.sourceCount))return 0;
    return ordinal;
  }
  function audioVerseNode(key){
    return [...list.querySelectorAll('.vertical-verse')].find(el=>el.dataset.verse===key);
  }
  function updateFollowButton(){
    if(!followButton)return;
    const state=latestAudioState;
    if(!active||!state?.playing||state.provider!=='quran-foundation'){
      followButton.hidden=true;return;
    }
    const key=state.surah+':'+state.ayah,node=audioVerseNode(key);
    const ordinal=audioWord(state,key);
    const word=node?.dataset.wordMapped==='true'&&ordinal?node.querySelector('[data-ordinal="'+ordinal+'"]'):null;
    followButton.hidden=isVisible(word||node?.querySelector('.vertical-ayah'));
  }
  function seekAudioPosition(state,force=false){
    if(!active||!records||!state?.playing)return;
    const key=state.surah+':'+state.ayah;
    let node=audioVerseNode(key);
    if(!node){
      const idx=ordered.findIndex(v=>v.key===key);
      if(idx<0)return;
      // If close to an existing edge, extend the list instead of rebuilding
      // it and making the user's interpretation text disappear.
      let rounds=0;
      while(!node&&idx>=position&&rounds++<15){appendBatch();node=audioVerseNode(key);}
      while(!node&&idx<topIndex&&rounds++<15){prependBatch();node=audioVerseNode(key);}
      if(!node){if(force||state.autoFollow){const p=pageForVerse(key);if(p)reader()?.goToPage?.(p);}return;}
    }
    const ordinal=audioWord(state,key);
    const word=ordinal&&node.dataset.wordMapped==='true'?node.querySelector('[data-ordinal="'+ordinal+'"]'):null;
    const target=word||node.querySelector('.vertical-ayah')||node;
    if(force||state.autoFollow){
      if(force){followingAudio=true;viewport.scrollBy({top:target.getBoundingClientRect().top-viewport.getBoundingClientRect().top-viewport.clientHeight*.28,behavior:'smooth'});}
      else easeIntoView(target);
    }
  }
  function applyAudio(state){
    latestAudioState=state;
    if(!active||!records||!state)return;
    const eligible=state.playing&&state.provider==='quran-foundation'&&state.timing;
    const key=eligible?state.surah+':'+state.ayah:'';
    const ordinal=eligible?audioWord(state,key):0;
    const cue=key+':'+ordinal;
    if(cue===lastCueKey)return;
    lastCueKey=cue;
    list.querySelectorAll('.vertical-ayah-word.is-reciting').forEach(n=>n.classList.remove('is-reciting'));
    list.querySelectorAll('.vertical-verse.is-reciting-verse').forEach(n=>n.classList.remove('is-reciting-verse'));
    if(!key){followingAudio=false;lastAudioKey='';updateFollowButton();return;}
    const node=audioVerseNode(key);
    if(node){
      node.classList.add('is-reciting-verse');
      if(ordinal&&node.dataset.wordMapped==='true')node.querySelector('[data-ordinal="'+ordinal+'"]')?.classList.add('is-reciting');
    }
    // Moving text is only justified when the actively recited word leaves
    // the visible area, NOT at each new ayah or every timing segment.
    if(state.autoFollow&&!manualFollowSuspended)seekAudioPosition(state);
    updateFollowButton();
    lastAudioKey=key;
  }
  if(followButton)followButton.addEventListener('click',()=>{
    const state=window.quranAudioEngine?.snapshot?.()||latestAudioState;
    if(!state?.playing){
      followButton.title='شغّل التلاوة أولًا';
      return;
    }
    manualFollowSuspended=false;
    seekAudioPosition(state,true);
    followButton.hidden=true;
  });
  function toggleVerseAction(node){
    const wasOpen=node===listeningVerse;
    if(listeningVerse)listeningVerse.querySelector('.vertical-verse-actions').hidden=true;
    listeningVerse=null;
    if(!wasOpen){node.querySelector('.vertical-verse-actions').hidden=false;listeningVerse=node;}
  }
  viewport.addEventListener('pointerdown',event=>{
    const node=event.target.closest('.vertical-ayah')?.closest('.vertical-verse');
    if(!node||event.target.closest('button')||event.pointerType==='mouse'&&event.button!==0)return;
    clearTimeout(holdTimer);suppressVerseClick=false;
    holdStart={x:event.clientX,y:event.clientY,node,id:event.pointerId};
    holdTimer=setTimeout(()=>{
      if(!holdStart)return;
      const [surah,ayah]=node.dataset.verse.split(':').map(Number);
      if(window.mushafVerseActions?.openForReference?.(surah,ayah)){
        suppressVerseClick=true;toggleVerseAction(node);
      }
      holdStart=null;
    },500);
  });
  viewport.addEventListener('pointermove',event=>{
    if(holdStart?.id===event.pointerId&&(Math.abs(event.clientX-holdStart.x)>12||
      Math.abs(event.clientY-holdStart.y)>12)){clearTimeout(holdTimer);holdStart=null;}
  });
  for(const type of ['pointerup','pointercancel'])viewport.addEventListener(type,()=>{
    clearTimeout(holdTimer);holdStart=null;
  });
  viewport.addEventListener('click',event=>{
    if(suppressVerseClick){suppressVerseClick=false;event.stopPropagation();return;}
    if(event.target.closest('button'))return;
    const node=event.target.closest('.vertical-ayah')?.closest('.vertical-verse');
    if(node)toggleVerseAction(node);
  });
  // The playback loop calls this on each animation frame for word-accurate cues.
  window.mushafVerticalReading={syncAudio:applyAudio,isActive:()=>active};
  window.addEventListener('quran-audio:time',event=>applyAudio(event.detail));
  window.addEventListener('quran-audio:state',event=>applyAudio(event.detail));
  window.addEventListener('mushaf:data-ready',()=>{if(active&&!records)start();});
})();
