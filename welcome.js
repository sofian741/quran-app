(() => {
  'use strict';
  const splash = document.getElementById('ayat-welcome');
  if (!splash) return;
  const line = splash.querySelector('.ayat-welcome-line');
  const kalam = splash.querySelector('.ayat-welcome-kalam');
  const rahman = splash.querySelector('.ayat-welcome-rahman');
  const subtitle = splash.querySelector('.ayat-welcome-subtitle');
  const skip = splash.querySelector('.ayat-welcome-skip');
  const key = 'ayat-brand-splash-shown';
  const previewKey = 'ayat-splash-force-motion';
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const animate = (el, frames, options) =>
    el.animate(frames, { fill: 'forwards', ...options }).finished;
  let playing = false;
  let leaving = false;
  let run = 0;
  let wasBackgrounded = false;
  const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    && !splash.classList.contains('ayat-welcome-force-motion');

  async function leave(id) {
    if (id !== run || leaving) return;
    leaving = true;
    document.dispatchEvent(new Event('ayat:splash-leaving'));
    document.documentElement.classList.remove('ayat-splash-startup');
    splash.classList.add('is-leaving');
    await wait(reduce() ? 0 : 650);
    if (id !== run) return;
    splash.hidden = true;
    document.dispatchEvent(new Event('ayat:splash-finished'));
    playing = false;
  }
  skip?.addEventListener('click', () => {
    if (!playing || leaving) return;
    // Leave the ongoing animation promise alone; the run token makes it inert.
    const id = ++run;
    leave(id);
  });

  async function play() {
    if (playing) return;
    playing = true;
    leaving = false;
    const id = ++run;
    let force = false;
    try { force = sessionStorage.getItem(previewKey) === '1'; } catch (_) {}
    splash.classList.toggle('ayat-welcome-force-motion', force);
    splash.classList.remove('is-leaving');
    // Always hide before clearing previous animated styles or showing the splash.
    splash.hidden = true;
    for (const el of [line, kalam, rahman, subtitle]) {
      el.getAnimations().forEach(animation => animation.cancel());
    }
    for (const el of [kalam, rahman, subtitle]) {
      el.style.visibility = 'hidden';
      el.style.opacity = '0';
    }
    line.style.transform = 'rotate(90deg) scaleX(.25)';
    document.documentElement.classList.add('ayat-splash-startup');
    splash.hidden = false;

    if (reduce()) {
      line.style.transform = 'none';
      for (const el of [kalam, rahman, subtitle]) {
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.clipPath = 'none';
      }
      await wait(650);
      await leave(id);
      return;
    }

    // Use the *original working pattern*: sequential Web Animations calls.
    // CSS establishes the hidden first frame; JS owns the only timeline.
    await animate(line, [
      { transform: 'rotate(90deg) scaleX(.25)' },
      { transform: 'rotate(270deg) scaleX(.25)' },
      { transform: 'rotate(450deg) scaleX(.25)' }
    ], { duration: 660, easing: 'cubic-bezier(.42,0,.58,1)' });
    if (id !== run) return;
    await animate(line, [
      { transform: 'rotate(450deg) scaleX(.25)' },
      { transform: 'rotate(360deg) scaleX(1)' }
    ], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    if (id !== run) return;
    kalam.style.visibility = 'visible';
    await animate(kalam, [
      { opacity: 0, clipPath: 'inset(100% 0 0 0)', transform: 'translateY(15px)' },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' }
    ], { duration: 630, easing: 'cubic-bezier(.22,1,.36,1)' });
    if (id !== run) return;
    rahman.style.visibility = 'visible';
    await animate(rahman, [
      { opacity: 0, clipPath: 'inset(0 100% 0 0)', transform: 'translateX(9px)' },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)' }
    ], { duration: 610, easing: 'cubic-bezier(.22,1,.36,1)' });
    if (id !== run) return;
    subtitle.style.visibility = 'visible';
    await animate(subtitle, [
      { opacity: 0, clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-9px)' },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' }
    ], { duration: 530, easing: 'cubic-bezier(.22,1,.36,1)' });
    if (id !== run) return;
    await wait(650);
    await leave(id);
  }
  function start() { play().catch(() => { leave(run); }); }
  let seen = false;
  try {
    seen = sessionStorage.getItem(key) === '1';
    sessionStorage.setItem(key, '1');
  } catch (_) {}
  if (seen) splash.hidden = true;
  else start();
  const app = window.Capacitor?.Plugins?.App;
  if (app?.addListener) {
    app.addListener('appStateChange', state => {
      if (!state.isActive) {
        wasBackgrounded = true;
        try { sessionStorage.removeItem(key); } catch (_) {}
      } else if (wasBackgrounded && !playing) {
        wasBackgrounded = false;
        try { sessionStorage.setItem(key, '1'); } catch (_) {}
        start();
      }
    });
  }
})();
