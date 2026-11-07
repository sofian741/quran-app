(() => {
  'use strict';
  const splash = document.getElementById('ayat-welcome');
  if (!splash) return;
  const skip = splash.querySelector('.ayat-welcome-skip');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const key = 'ayat-brand-splash-shown';
  const previewKey = 'ayat-splash-force-motion';
  const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    && !splash.classList.contains('ayat-welcome-force-motion');
  let playing = false;
  let leaving = false;
  let runId = 0;
  let wasBackgrounded = false;
  let soundContext = null;

  // Quiet optional chimes only when a browser already permits audio.
  function chime(frequency) {
    if (reduce() || document.hidden || !navigator.userActivation?.hasBeenActive) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!soundContext) soundContext = new Audio();
      if (soundContext.state !== 'running') return;
      const oscillator = soundContext.createOscillator();
      const gain = soundContext.createGain();
      const time = soundContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, time);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * .87, time + .12);
      gain.gain.setValueAtTime(.0001, time);
      gain.gain.exponentialRampToValueAtTime(.009, time + .025);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .14);
      oscillator.connect(gain).connect(soundContext.destination);
      oscillator.start(time);
      oscillator.stop(time + .15);
    } catch (_) {}
  }

  async function leave(id) {
    if (leaving || id !== runId) return;
    leaving = true;
    document.dispatchEvent(new Event('ayat:splash-leaving'));
    document.documentElement.classList.remove('ayat-splash-startup');
    splash.classList.add('is-leaving');
    await wait(reduce() ? 0 : 650);
    if (id !== runId) return;
    splash.hidden = true;
    splash.classList.remove('is-playing');
    document.dispatchEvent(new Event('ayat:splash-finished'));
    playing = false;
  }

  skip?.addEventListener('click', () => {
    if (!playing || leaving) return;
    const id = ++runId;
    playing = true;
    leave(id);
  });

  async function play() {
    if (playing) return;
    playing = true;
    leaving = false;
    const id = ++runId;
    splash.classList.toggle('ayat-welcome-force-motion',
      sessionStorage.getItem(previewKey) === '1');
    splash.classList.remove('is-playing', 'is-leaving');
    splash.hidden = false;
    // The important old trick: commit the first (hidden) frame before
    // starting CSS animations, instead of letting the browser paint the end.
    void splash.offsetWidth;
    await new Promise(resolve => requestAnimationFrame(() =>
      requestAnimationFrame(resolve)));
    if (id !== runId) return;
    splash.classList.add('is-playing');
    if (reduce()) {
      await wait(700);
    } else {
      await wait(1080);
      if (id !== runId) return;
      chime(740);
      await wait(600);
      if (id !== runId) return;
      chime(610);
      await wait(1600);
    }
    await leave(id);
  }

  function start() { play().catch(() => { if (!leaving) leave(runId); }); }
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
