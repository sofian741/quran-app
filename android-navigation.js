/* Android navigation and screen-on while actively reading. */
(() => {
  'use strict';
  const isHome = /(?:^|\/)index\.html$/.test(location.pathname) || location.pathname.endsWith('/');
  let lastBack = 0;
  let wake = null;

  async function keepAwake() {
    if (document.hidden || !navigator.wakeLock?.request || wake) return;
    try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); }
    catch (error) { console.info('Screen wake lock unavailable', error); }
  }
  keepAwake();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) keepAwake(); });

  function visibleDialog() {
    const selectors = [
      '#tafsir-sheet', '#quran-search-sheet', '#saved-sheet', '#share-sheet',
      '#verse-actions-sheet', '#index-sheet', '#settings-sheet',
      '#audio-options-sheet', '#audio-repeat-sheet'
    ];
    return selectors.map(s => document.querySelector(s)).find(node =>
      node && (node.classList.contains('is-open') || node.getAttribute('aria-hidden') === 'false'));
  }

  function back() {
    const dialog = visibleDialog();
    if (dialog) {
      const close = dialog.querySelector('[id^="close-"], [id^="audio-close-"]');
      if (close) { close.click(); return; }
    }
    if (!isHome) {
      if (history.length > 1 && document.referrer && new URL(document.referrer).origin === location.origin) history.back();
      else location.assign('index.html');
      return;
    }
    const now = Date.now();
    if (now - lastBack < 2000) {
      window.Capacitor?.Plugins?.App?.exitApp?.();
    } else {
      lastBack = now;
      let hint = document.getElementById('android-exit-hint');
      if (!hint) {
        hint = document.createElement('div');
        hint.id = 'android-exit-hint';
        hint.setAttribute('role', 'status');
        hint.style.cssText = 'position:fixed;bottom:85px;left:50%;transform:translateX(-50%);z-index:99999;background:#203c32;color:white;padding:10px 18px;border-radius:24px;font-size:13px;pointer-events:none;box-shadow:0 4px 15px #0003';
        document.body.appendChild(hint);
      }
      hint.textContent = 'اضغط رجوع مرة أخرى للخروج';
      hint.hidden = false;
      setTimeout(() => { hint.hidden = true; }, 2100);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const app = window.Capacitor?.Plugins?.App;
    if (app?.addListener) app.addListener('backButton', back);
  });
})();
