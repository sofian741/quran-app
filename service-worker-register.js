(() => {
    'use strict';

    if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;

    // Keep one registration path for every entry page so opening the home or
    // adhkar page first still prepares the complete offline application shell.
    window.quranServiceWorkerReady = navigator.serviceWorker.register('./sw.js', { scope: './' })
        .then(registration => registration)
        .catch(error => {
            console.warn('تعذّر تجهيز وضع عدم الاتصال.', error);
            return null;
        });
})();
