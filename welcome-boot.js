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
  // The lightweight page invitations are scheduled by tour.js itself.
  // Legacy global-tour state must never keep the home screen hidden.
  document.documentElement.classList.remove('ayat-tour-boot');
})();
