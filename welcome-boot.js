/* Decide before first paint whether this navigation needs the brand splash. */
(() => {
  'use strict';
  let seen = false;
  try { seen = sessionStorage.getItem('ayat-brand-splash-shown') === '1'; }
  catch (_) {}
  if (!seen) document.documentElement.classList.add('ayat-splash-startup');
})();
