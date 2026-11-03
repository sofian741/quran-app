// One route, one app identity, the existing state and audio stores.
(async function () {
    'use strict';
    const preference = 'quranMushafEngineV1';
    const query = new URLSearchParams(location.search).get('engine');
    let saved;
    try { saved = localStorage.getItem(preference); } catch (_) {}
    const choice = document.getElementById('mushaf-engine-choice');
    choice.value = query === 'legacy' || (!query && saved === 'legacy') ? 'legacy' : 'qvp';
    choice.addEventListener('change', () => {
        try { localStorage.setItem(preference, choice.value); } catch (_) {}
        const url = new URL(location.href);
        url.searchParams.set('engine', choice.value);
        location.replace(url);
    });
    async function legacy() {
        for (const file of ['app.js', 'reader-enhancements.js', 'reader-layout-polish.js']) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = file; script.onload = resolve; script.onerror = reject;
                document.body.append(script);
            });
        }
    }
    // Classic collaborators (including AudioEngine) finish before the module.
    if (document.readyState === 'loading') await new Promise(r => document.addEventListener('DOMContentLoaded', r, {once:true}));
    if (choice.value === 'legacy') {
        await legacy();
        if (sessionStorage.getItem('qvpFallbackNotice')) {
            sessionStorage.removeItem('qvpFallbackNotice');
            const note = document.createElement('p');
            note.setAttribute('role','status');
            note.textContent = 'تعذّر فتح المصحف الجديد؛ تم فتح المحرك السابق. يمكنك إعادة اختيار QVP من الإعدادات.';
            Object.assign(note.style,{position:'fixed',bottom:'12px',left:'12px',right:'12px',zIndex:200,background:'#fff4dc',color:'#582e00',padding:'12px',borderRadius:'12px'});
            const close = document.createElement('button');close.textContent='إغلاق';close.onclick=()=>note.remove();note.append(close);document.body.append(note);
        }
        return;
    }
    try {
        const style = document.createElement('link');
        style.rel = 'stylesheet'; style.href = 'mushaf-qvp/reader.css'; document.head.append(style);
        await new Promise((resolve,reject)=>{style.onload=resolve;style.onerror=reject;});
        const module = await import('./mushaf-qvp/reader.js');
        await module.ready;
    } catch (error) {
        console.error('QVP unavailable; reopening the previous reader', error);
        // Reload clears module listeners/partial state; no storage is erased.
        const url = new URL(location.href); url.searchParams.set('engine','legacy');
        sessionStorage.setItem('qvpFallbackNotice','1'); location.replace(url);
    }
})();
