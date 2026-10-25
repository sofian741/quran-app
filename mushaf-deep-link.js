(() => {
  'use strict';
  const url = new URL(location.href);
  const surah = Number(url.searchParams.get('surah'));
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) return;
  let applied = false;
  const open = () => {
    if (applied || !window.mushafReader?.findVersePage) return;
    const page = window.mushafReader.findVersePage(surah,1);
    if (!page) return;
    applied = window.mushafReader.goToVerse(surah,1,page) === true;
  };
  window.addEventListener('mushaf:page-ready',open);
  document.addEventListener('DOMContentLoaded',open,{once:true});
  // The Quran data can load after DOMContentLoaded on a slow phone.
  window.addEventListener('mushaf:loaded',open);
})();
