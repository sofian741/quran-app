/* Home settings bottom sheet. Update checking is shared with Quran via app-update.js. */
(() => {
  'use strict';
  const toggle=document.getElementById('home-settings-toggle');
  const sheet=document.getElementById('home-settings-panel');
  const backdrop=document.getElementById('home-settings-backdrop');
  const closeButton=document.getElementById('home-settings-close');
  const guideButton=document.getElementById('home-show-tour');
  if(!toggle||!sheet||!backdrop||!closeButton||!guideButton)return;

  function setOpen(open,focus=false){
    sheet.hidden=!open;
    backdrop.hidden=!open;
    sheet.setAttribute('aria-hidden',String(!open));
    toggle.setAttribute('aria-expanded',String(open));
    document.body.classList.toggle('home-settings-open',open);
    if(open)closeButton.focus({preventScroll:true});
    else if(focus)toggle.focus({preventScroll:true});
  }
  toggle.addEventListener('click',()=>setOpen(sheet.hidden));
  closeButton.addEventListener('click',()=>setOpen(false,true));
  backdrop.addEventListener('click',()=>setOpen(false,true));
  sheet.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const buttons=[...sheet.querySelectorAll('button:not(:disabled)')];
    if(!buttons.length)return;
    if(event.shiftKey&&document.activeElement===buttons[0]){
      event.preventDefault();buttons[buttons.length-1].focus();
    }else if(!event.shiftKey&&document.activeElement===buttons[buttons.length-1]){
      event.preventDefault();buttons[0].focus();
    }
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!sheet.hidden){
      event.preventDefault();setOpen(false,true);
    }
  });
  guideButton.addEventListener('click',()=>{
    setOpen(false);
    // Shared chooser offers ALL FIVE independent tutorials, just like Quran settings.
    if(typeof window.ayatOpenTour==='function')window.ayatOpenTour();
    else console.warn('Ayat help is not ready yet.');
  });
})();