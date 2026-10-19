(() => {
  'use strict';
  const splash = document.getElementById('ayat-welcome');
  if (!splash) return;
  const line = splash.querySelector('.ayat-welcome-line');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let finished = false;
  let fallback;

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(fallback);
    splash.classList.add('is-leaving');
    window.setTimeout(() => { splash.hidden = true; }, 700);
  }

  // Do not end the splash before its final animation has actually completed.
  const subtitle = splash.querySelector('.ayat-welcome-subtitle');
  subtitle.addEventListener('animationend', event => {
    if (event.animationName === 'ayat-fade') window.setTimeout(finish, 450);
  });
  // In reduced-motion mode, keep the complete static brand visible briefly.
  if (reduced) {
    splash.classList.add('is-playing');
    fallback = window.setTimeout(finish, 3800);
  } else {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => splash.classList.add('is-playing'));
    });
    fallback = window.setTimeout(finish, 7000);
  }
})();
