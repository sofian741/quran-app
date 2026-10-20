/* Home-only settings. No inline handlers (the app uses CSP script-src 'self'). */
(() => {
  'use strict';
  const toggle=document.getElementById('home-settings-toggle');
  const panel=document.getElementById('home-settings-panel');
  const closeButton=document.getElementById('home-settings-close');
  const tourButton=document.getElementById('home-show-tour');
  const updateButton=document.getElementById('home-check-update');
  const status=document.getElementById('home-update-status');
  if(!toggle||!panel||!tourButton||!updateButton||!status)return;

  const setOpen=(open,restoreFocus=false)=>{
    panel.hidden=!open;
    toggle.setAttribute('aria-expanded',String(open));
    if(open)closeButton.focus({preventScroll:true});
    else if(restoreFocus)toggle.focus({preventScroll:true});
  };
  toggle.addEventListener('click',()=>setOpen(panel.hidden,!panel.hidden));
  closeButton.addEventListener('click',()=>setOpen(false,true));
  document.addEventListener('pointerdown',event=>{
    if(!panel.hidden&&!panel.contains(event.target)&&!toggle.contains(event.target))setOpen(false);
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!panel.hidden){event.preventDefault();setOpen(false,true);}
  });
  tourButton.addEventListener('click',()=>{
    setOpen(false);
    // This only starts the home tutorial. The Quran/settings tutorial remains independent.
    if(typeof window.ayatStartHomeTour==='function')window.ayatStartHomeTour();
    else if(typeof window.ayatOpenTour==='function')window.ayatOpenTour();
    else {
      status.hidden=false;
      status.textContent='تعذّر تحميل الشرح. حدّث الصفحة وجرّب مرة أخرى.';
      setOpen(true);
    }
  });

  const show=(message,state='info')=>{
    status.hidden=false;
    status.dataset.state=state;
    status.textContent=message;
  };
  const native=()=>Boolean(window.Capacitor?.isNativePlatform?.());
  const buildInfo=()=>window.NOOR_ANDROID_BUILD||{};

  async function checkNative(){
    const build=Number(buildInfo().versionCode||0);
    const source=buildInfo().updateManifestUrl||'';
    if(!source){
      show('فحص تحديثات APK غير مفعّل حاليًا. سيتم إتاحته عند إعداد مصدر تحديث آيات.','info');
      return;
    }
    const manifestUrl=new URL(source,location.href);
    if(manifestUrl.protocol!=='https:')throw new Error('Update manifest must use HTTPS');
    const response=await fetch(manifestUrl.href+(manifestUrl.search?'&':'?')+'t='+Date.now(),{cache:'no-store'});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const payload=await response.json();
    const github=manifestUrl.hostname==='api.github.com' && /\/releases\/latest$/.test(manifestUrl.pathname);
    const match=github ? /^qa-(\d+)$/.exec(payload.tag_name||'') : null;
    const info=github?{
      versionCode:match?Number(match[1]):NaN,
      apkUrl:payload.assets?.find(asset=>asset.name==='Noor-Al-Quran-debug.apk')?.browser_download_url
    }:payload;
    const latest=Number(info.versionCode);
    if(!Number.isSafeInteger(latest)||latest<1||typeof info.apkUrl!=='string')throw new Error('Invalid update manifest');
    const download=new URL(info.apkUrl,manifestUrl);
    if(download.protocol!=='https:'||(github&&download.hostname!=='github.com'))throw new Error('Untrusted download link');
    if(build&&latest<=build){show('آيات مُحدّث بالفعل.','success');return;}
    show('يتوفر إصدار جديد من آيات: 0.1.'+latest,'success');
    if(window.confirm('يتوفر تحديث جديد لتطبيق آيات. هل تريد فتح رابط التنزيل؟')){
      window.open(download.href,'_blank','noopener,noreferrer');
    }
  }

  async function checkWeb(){
    if(navigator.onLine===false){
      show('لا يوجد اتصال بالإنترنت. اتصل بالشبكة وجرّب مرة أخرى.','error');
      return;
    }
    if('serviceWorker' in navigator){
      const registration=await navigator.serviceWorker.getRegistration('./') ||
        await Promise.resolve(window.quranServiceWorkerReady);
      if(registration){
        await registration.update();
        // Install uses skipWaiting/clients.claim. Give newly fetched shell files a
        // moment to become active before reloading; never clear user data.
        if(registration.installing || registration.waiting){
          await Promise.race([
            new Promise(resolve=>{
              navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true});
            }),
            new Promise(resolve=>setTimeout(resolve,5500))
          ]);
        }
      }
    }
    show('تم فحص ملفات الويب. جارٍ إعادة تحميل الصفحة…','success');
    window.location.reload();
  }

  updateButton.addEventListener('click',async()=>{
    if(updateButton.disabled)return;
    updateButton.disabled=true;
    show('جارٍ التحقق من التحديثات…');
    try{
      if(native())await checkNative();
      else await checkWeb();
    }catch(error){
      console.warn('Home update check failed',error);
      show('تعذّر التحقق من التحديثات. جرّب مرة أخرى عند توفر الإنترنت.','error');
    }finally{
      updateButton.disabled=false;
    }
  });
})();
