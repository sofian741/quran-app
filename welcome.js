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
    line.style.transform = 'scaleX(.025)';
    document.documentElement.classList.add('ayat-splash-startup');
    splash.hidden = false;

    if (reduce()) {
      line.style.transform = 'scaleX(1)';
      for (const el of [kalam, rahman, subtitle]) {
        el.style.visibility = 'visible';
        el.style.opacity = '1';
        el.style.clipPath = 'none';
      }
      await wait(480);
      await leave(id);
      return;
    }

    // Same proven Web Animations approach as the original splash.
    // The first mark is already horizontal; it draws outward instantly.
    // The reveals overlap just enough to feel like one continuous signature.
    const ease = 'cubic-bezier(.22,1,.36,1)';
    const animateAfter = (ms, el, frames, options) =>
      animate(el, frames, { delay: ms, easing: ease, ...options });
    kalam.style.visibility = 'visible';
    rahman.style.visibility = 'visible';
    subtitle.style.visibility = 'visible';

    const movements = [
      animate(line, [
        { transform: 'scaleX(.025)', opacity: .7, offset: 0 },
        { transform: 'scaleX(.19)', opacity: 1, offset: .18 },
        { transform: 'scaleX(1)', opacity: 1, offset: 1 }
      ], { duration: 540, easing: ease }),
      animateAfter(350, kalam, [
        { opacity: 0, clipPath: 'inset(100% 0 0 0)', transform: 'translateY(11px)' },
        { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' }
      ], { duration: 570 }),
      animateAfter(760, rahman, [
        { opacity: 0, clipPath: 'inset(0 100% 0 0)', transform: 'translateX(6px)' },
        { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)' }
      ], { duration: 570 }),
      animateAfter(1190, subtitle, [
        { opacity: 0, clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-7px)' },
        { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' }
      ], { duration: 520 })
    ];
    await Promise.all(movements);
    if (id !== run) return;
    await wait(520);
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
