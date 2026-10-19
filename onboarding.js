(() => {
  'use strict';
  const guide = document.getElementById('ayat-guide');
  const splash = document.getElementById('ayat-welcome');
  if (!guide) return;
  const finger = guide.querySelector('.ayat-guide-finger');
  const ring = guide.querySelector('.ayat-guide-ring');
  const verse = guide.querySelector('.ayat-guide-verse');
  const action = guide.querySelector('.ayat-guide-action');
  const button = guide.querySelector('.ayat-guide-continue');
  const key = 'ayat-longpress-guide-complete-v1';
  let open = false;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const animate = (el, frames, options) => el.animate(frames, { fill: 'forwards', ...options }).finished;
  function isComplete() { try { return localStorage.getItem(key) === '1'; } catch (_) { return false; } }
  function complete() { try { localStorage.setItem(key, '1'); } catch (_) {} }
  async function demo() {
    while (open) {
      finger.getAnimations().forEach(a => a.cancel());
      ring.getAnimations().forEach(a => a.cancel());
      verse.classList.remove('is-pressed');
      action.classList.remove('is-shown');
      await wait(350);
      if (!open) break;
      await animate(finger, [
        { transform: 'translate(-38px,43px) rotate(-12deg)' },
        { transform: 'translate(0px,0px) rotate(-4deg)' }
      ], { duration: 700, easing: 'cubic-bezier(.22,1,.36,1)' });
      if (!open) break;
      await wait(480);
      verse.classList.add('is-pressed');
      await animate(ring, [
        { opacity: .9, transform: 'translate(-50%,-50%) scale(.55)' },
        { opacity: 0, transform: 'translate(-50%,-50%) scale(3)' }
      ], { duration: 750, easing: 'ease-out' });
      if (!open) break;
      action.classList.add('is-shown');
      await wait(1400);
      if (!open) break;
      action.classList.remove('is-shown');
      verse.classList.remove('is-pressed');
      await animate(finger, [
        { transform: 'translate(0px,0px) rotate(-4deg)' },
        { transform: 'translate(-38px,43px) rotate(-12deg)' }
      ], { duration: 450, easing: 'ease-in-out' });
      await wait(350);
    }
  }
  function show() {
    if (open || isComplete()) return;
    open = true;
    guide.hidden = false;
    guide.setAttribute('aria-hidden','false');
    document.body.style.overflow = 'hidden';
    demo().catch(() => {});
    button.focus({ preventScroll: true });
  }
  function close() {
    complete();
    open = false;
    guide.hidden = true;
    guide.setAttribute('aria-hidden','true');
    document.body.style.overflow = '';
    document.documentElement.classList.remove('ayat-guide-pending');
    for (const el of [finger,ring]) el.getAnimations().forEach(a => a.cancel());
  }
  button.addEventListener('click', close);
  // The brand logo must finish first. The guide is shown once per installation/browser data.
  document.addEventListener('ayat:splash-leaving', show);
  document.addEventListener('ayat:splash-finished', show);
  if (splash?.hidden && !document.documentElement.classList.contains('ayat-splash-startup')) show();
})();
