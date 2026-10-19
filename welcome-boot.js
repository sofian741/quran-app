/* Before first paint: preserve a seamless logo -> guided intro -> home transition. */
(() => {
  'use strict';
  try {
    if (sessionStorage.getItem('ayat-brand-splash-shown') !== '1') {
      document.documentElement.classList.add('ayat-splash-startup');
    }
  } catch (_) {
    document.documentElement.classList.add('ayat-splash-startup');
  }
  try {
    const unfinished = localStorage.getItem('ayat-tour-done-general-v3') !== '1' && localStorage.getItem('ayat-tour-done-general-v2') !== '1';
    const deferred = Number(localStorage.getItem('ayat-tour-remind-at-general-v3') || 0) > Date.now();
    const active = localStorage.getItem('ayat-tour-active-v3');
    if ((unfinished && !deferred) || (active && active.includes('"general"'))) {
      document.documentElement.classList.add('ayat-tour-boot');
    }
  } catch (_) {}
})();
