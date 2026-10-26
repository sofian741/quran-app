(() => {
    'use strict';
    // Android WebView can report navigator.onLine=true even when the phone
    // cannot reach the internet. Probe only when a network-only action needs
    // confirmation, so cached/offline playback never depends on this probe.
    const OFFLINE_MESSAGE = 'لا يوجد اتصال بالإنترنت. شغّل الواي فاي أو بيانات الهاتف، أو حمّل تلاوة السورة من «التلاوات» للاستماع بدون إنترنت.';
    const PROBES = [
        'https://mp3quran.net/api/v3/reciters?language=ar',
        'https://api.quran.com/api/v4/chapters/1'
    ];
    let last = null;
    let lastAt = 0;
    let pending = null;

    async function checkConnection() {
        if (navigator.onLine === false) return false;
        if (typeof fetch !== 'function') return true;
        const now = Date.now();
        if (last !== null && now - lastAt < 4000) return last;
        if (pending) return pending;
        pending = (async () => {
            for (const url of PROBES) {
                const controller = typeof AbortController === 'function' ? new AbortController() : null;
                const timeout = setTimeout(() => controller?.abort(), 2200);
                try {
                    // An opaque no-cors response still confirms connectivity.
                    // Avoid using a local resource: the service worker could
                    // satisfy it with no network at all.
                    await fetch(url, {
                        mode: 'no-cors', cache: 'no-store',
                        ...(controller ? { signal: controller.signal } : {})
                    });
                    last = true;
                    lastAt = Date.now();
                    return true;
                } catch (_) {
                    // Try the independent second host.
                } finally { clearTimeout(timeout); }
            }
            last = false;
            lastAt = Date.now();
            return false;
        })().finally(() => { pending = null; });
        return pending;
    }
    async function isOffline() {
        // Third-party no-cors probes are not authoritative on Android WebView:
        // CORS, DNS filtering or one blocked domain can reject a perfectly
        // usable connection. Let the requested audio/metadata URL try first.
        return navigator.onLine === false;
    }
    function safeError(message) {
        const value = String(message || '');
        if (/\b(?:404|500|502|503|504)\b|http|failed to fetch|networkerror|load failed|not found|[a-z]{3,}/i.test(value)) {
            return 'تعذّر الوصول إلى تسجيل التلاوة أو بياناته. تأكد من اتصال الإنترنت وحاول مرة أخرى.';
        }
        return value || 'تعذّر تشغيل التلاوة. تحقق من الاتصال وحاول مرة أخرى.';
    }
    window.QuranAudioConnectivity = Object.freeze({OFFLINE_MESSAGE,checkConnection,isOffline,safeError});
})();