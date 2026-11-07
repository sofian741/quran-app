(() => {
  'use strict';
  const splash = document.getElementById('ayat-welcome');
  if (!splash) return;
  const line = splash.querySelector('.ayat-welcome-line');
  const kalam = splash.querySelector('.ayat-welcome-kalam');
  const rahman = splash.querySelector('.ayat-welcome-rahman');
  const subtitle = splash.querySelector('.ayat-welcome-subtitle');
  const skip = splash.querySelector('.ayat-welcome-skip');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const animate = (element, frames, options) =>
    element.animate(frames, { fill: 'forwards', ...options }).finished;
  let playing = false;
  let leaving = false;
  let runId = 0;
  let audioContext = null;

  // Browsers may block sound before a user gesture. Never force playback.
  // Only play if a user-activated audio context is already running.
  function whisper(frequency = 660) {
    if (reducedMotion() || document.hidden) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!audioContext) {
        if (!navigator.userActivation?.hasBeenActive) return;
        audioContext = new AudioContextClass();
      }
      if (audioContext.state !== 'running') return;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const t = audioContext.currentTime;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, t);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * .84, t + .105);
      gain.gain.setValueAtTime(.0001, t);
      gain.gain.exponentialRampToValueAtTime(.012, t + .022);
      gain.gain.exponentialRampToValueAtTime(.0001, t + .14);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(t);
      oscillator.stop(t + .15);
    } catch (_) { /* The splash never depends on audio availability. */ }
  }

  async function leave(id = runId) {
    if (leaving || id !== runId) return;
    leaving = true;
    document.dispatchEvent(new Event('ayat:splash-leaving'));
    document.documentElement.classList.remove('ayat-splash-startup');
    splash.classList.add('is-leaving');
    await wait(reducedMotion() ? 0 : 650);
    if (id !== runId) return;
    splash.hidden = true;
    document.dispatchEvent(new Event('ayat:splash-finished'));
    playing = false;
  }

  skip?.addEventListener('click', () => {
    if (!playing || leaving) return;
    runId++;
    // A skip must not leave an animation promise running into the next opening.
    [line, kalam, rahman, subtitle].forEach(el => el.getAnimations().forEach(a => a.cancel()));
    leaving = false;
    leave(runId);
  });

  async function play() {
    if (playing) return;
    playing = true;
    leaving = false;
    const id = ++runId;
    splash.hidden = false;
    splash.classList.remove('is-leaving');
    [line, kalam, rahman, subtitle].forEach(el => el.getAnimations().forEach(a => a.cancel()));
    for (const el of [kalam, rahman, subtitle]) {
      el.style.opacity = '0';
    }
    if (reducedMotion()) {
      line.style.transform = 'none';
      for (const el of [kalam, rahman, subtitle]) el.style.opacity = '1';
      await wait(650);
      return leave(id);
    }
    // Preserve the beloved gold stroke rotation, then lay it horizontally.
    await animate(line, [
      { transform: 'rotate(90deg) scaleX(.25)' },
      { transform: 'rotate(270deg) scaleX(.25)' },
      { transform: 'rotate(450deg) scaleX(.25)' }
    ], { duration: 660, easing: 'cubic-bezier(.45,0,.55,1)' });
    await animate(line, [
      { transform: 'rotate(450deg) scaleX(.25)' },
      { transform: 'rotate(360deg) scaleX(1)' }
    ], { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)' });
    whisper(740);
    // Stage 1: Kalam grows upward from the golden horizon.
    await animate(kalam, [
      { opacity: 0, clipPath: 'inset(100% 0 0 0)', transform: 'translateY(15px)' },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' }
    ], { duration: 560, easing: 'cubic-bezier(.22,1,.36,1)' });
    whisper(610);
    // Stage 2: Al-Rahman unfolds from the edge adjacent to Kalam (RTL).
    await animate(rahman, [
      { opacity: 0, clipPath: 'inset(0 100% 0 0)', transform: 'translateX(9px)' },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateX(0)' }
    ], { duration: 570, easing: 'cubic-bezier(.22,1,.36,1)' });
    // Stage 3: the quiet caption descends from the other side of the line.
    await animate(subtitle, [
      { opacity: 0, clipPath: 'inset(0 0 100% 0)', transform: 'translateY(-9px)' },
      { opacity: 1, clipPath: 'inset(0 0 0 0)', transform: 'translateY(0)' }
    ], { duration: 490, easing: 'cubic-bezier(.22,1,.36,1)' });
    await wait(500);
    await leave(id);
  }
  function start() { play().catch(() => { if (!leaving) leave(runId); }); }
  const key = 'ayat-brand-splash-shown';
  let seen = false;
  try {
    seen = sessionStorage.getItem(key) === '1';
    sessionStorage.setItem(key, '1');
  } catch (_) {}
  if (seen) splash.hidden = true;
  else start();

  const app = window.Capacitor?.Plugins?.App;
  let wasBackgrounded = false;
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
