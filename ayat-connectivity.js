(() => {
  'use strict';
  // WebView navigator.onLine alone may stay true after Wi-Fi/mobile data disconnects.
  // Probe two independent HTTPS destinations; no service-worker-cached application files.
  const ENDPOINTS = [
    'https://connectivitycheck.gstatic.com/generate_204',
    'https://api.quran.com/api/v4/chapters?language=ar'
  ];
  let pending = null;
  async function probeOne(url) {
    const controller = new AbortController();
    const stop = setTimeout(() => controller.abort(), 3500);
    try {
      await fetch(url + (url.includes('?') ? '&' : '?') + '_ayat_net=' + Date.now(), {
        mode: 'no-cors', cache: 'no-store', signal: controller.signal
      });
      return true;
    } catch (_) { return false; }
    finally { clearTimeout(stop); }
  }
  async function isOffline() {
    if (!pending) {
      pending = Promise.all(ENDPOINTS.map(probeOne))
        .then(results => !results.some(Boolean))
        .finally(() => { pending = null; });
    }
    return pending;
  }
  window.AyatConnectivity = Object.freeze({ isOffline });
})();
