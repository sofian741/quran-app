'use strict';
(() => {
  const key = 'quranHomeTheme';
  let theme;
  try { theme = localStorage.getItem(key); } catch (_) {}
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#141e1a' : '#f5f6f0');
})();
