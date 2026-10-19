(() => {
  'use strict';
  const splash = document.getElementById('ayat-welcome');
  if (!splash) return;
  const line = splash.querySelector('.ayat-welcome-line');
  const arabic = splash.querySelector('.ayat-welcome-ar');
  const english = splash.querySelector('.ayat-welcome-en');
  const subtitle = splash.querySelector('.ayat-welcome-subtitle');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const animate = (element, frames, options) => element.animate(frames, { fill: 'forwards', ...options }).finished;
  let playing = false;
  async function play() {
    if (playing) return;
    playing = true;
    splash.hidden = false;
    splash.classList.remove('is-leaving');
    for (const node of [line, arabic, english, subtitle]) node.getAnimations().forEach(a => a.cancel());
      // A short, restrained half-turn reads as a full turn for a symmetric line.
      await animate(line, [{ transform: 'rotate(0deg) scaleY(.55)' }, { transform: 'rotate(180deg) scaleY(.55)' }], { duration: 420, easing: 'cubic-bezier(.42,0,.58,1)' });
      // Stage 2: line extends before either word is revealed.
      await animate(line, [
        { transform: 'rotate(180deg) scaleY(.55)' },
        { transform: 'rotate(180deg) scaleY(1)' }
      ], { duration: 580, easing: 'cubic-bezier(.2,.8,.2,1)' });
      await wait(120);
      // Reveal each word from the central divider using a moving clip edge.
      // No blur or sudden opacity jump.
      await Promise.all([
        animate(arabic, [
          { opacity: 1, clipPath: 'inset(0 0 0 100%)', transform: 'translateX(13px)' },
          { opacity: 1, clipPath: 'inset(0 0 0 0%)', transform: 'translateX(0)' }
        ], { duration: 1250, easing: 'cubic-bezier(.22,1,.36,1)' }),
        animate(english, [
          { opacity: 1, clipPath: 'inset(0 100% 0 0)', transform: 'translateX(-13px)' },
          { opacity: 1, clipPath: 'inset(0 0% 0 0)', transform: 'translateX(0)' }
        ], { duration: 1250, easing: 'cubic-bezier(.22,1,.36,1)' })
      ]);
      await animate(subtitle, [{ opacity: 0 }, { opacity: 1 }], { duration: 650 });
      await wait(800);
    splash.classList.add('is-leaving');
    await wait(700);
    splash.hidden = true;
    playing = false;
  }
  function start() { play().catch(() => {
    splash.classList.add('is-leaving');
    setTimeout(() => { splash.hidden = true; playing = false; }, 700);
  }); }
  // Internal page navigation must not replay the logo.
  const key = 'ayat-brand-splash-shown';
  let seen = false;
  try { seen = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch (_) {}
  if (seen) splash.hidden = true;
  else start();

  // On Android, returning from the background counts as opening the app again.
  const app = window.Capacitor?.Plugins?.App;
  if (app?.addListener) {
    app.addListener('appStateChange', state => {
      if (!state.isActive) {
        try { sessionStorage.removeItem(key); } catch (_) {}
      } else if (!playing) {
        try { sessionStorage.setItem(key, '1'); } catch (_) {}
        start();
      }
    });
  }
  /* play().catch(() => {
    // Never trap the user behind the splash if animations are unsupported.
    splash.classList.add('is-leaving');
    setTimeout(() => { splash.hidden = true; }, 700);
  }); */
})();
