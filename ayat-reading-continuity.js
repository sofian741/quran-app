(() => {
  'use strict';
  // Never move the playing <audio> between documents: keep recitations.js alive
  // while the Mushaf is displayed in a same-origin reading layer.
  const engine = window.quranAudioEngine;
  if (!engine || !document.getElementById('recitation-audio')) return;
  let active = false, collapsed = false, idleTimer = 0, drag = null, backSubscription = null;
  const layer = document.createElement('section');
  layer.className = 'ayat-reading-layer';
  layer.hidden = true;
  layer.setAttribute('aria-label', 'قراءة المصحف أثناء الاستماع');
  layer.innerHTML = [
    '<iframe class="ayat-reading-frame" title="المصحف الشريف" loading="eager"></iframe>',
    '<div class="ayat-reading-float" role="group" aria-label="مشغل التلاوة أثناء القراءة">',
    '<button class="ayat-reading-grip" type="button" aria-label="إظهار المشغل أو تحريكه">♫</button>',
    '<div class="ayat-reading-info"><strong>التلاوة مستمرة</strong><small>مكتبة التلاوات</small></div>',
    '<button class="ayat-reading-play" type="button" aria-label="إيقاف مؤقت">❚❚</button>',
    '<button class="ayat-reading-next" type="button" aria-label="السورة التالية">⏭</button>',
    '<button class="ayat-reading-exit" type="button" aria-label="العودة إلى التلاوات">×</button>',
    '</div><p class="ayat-reading-status" role="status" aria-live="polite">جاري فتح المصحف…</p>'
  ].join('');
  document.body.append(layer);
  const frame = layer.querySelector('iframe');
  const pill = layer.querySelector('.ayat-reading-float');
  const grip = layer.querySelector('.ayat-reading-grip');
  const info = layer.querySelector('.ayat-reading-info');
  const play = layer.querySelector('.ayat-reading-play');
  const status = layer.querySelector('.ayat-reading-status');
  const underlay = [...document.querySelectorAll('.recitations-app,.bottom-nav,#mini-player')];
  function sync() {
    if (!active) return;
    const s = engine.snapshot();
    info.querySelector('strong').textContent = 'سورة ' +
      (window.QuranAudio?.SURAH_NAMES?.[s.surah - 1] || 'القرآن الكريم');
    info.querySelector('small').textContent = s.reciterName || 'التلاوات';
    play.textContent = s.playing ? '❚❚' : '▶';
    play.setAttribute('aria-label', s.playing ? 'إيقاف مؤقت' : 'استكمال التلاوة');
  }
  function shrink(value) {
    if (collapsed === value) return;
    const before = pill.getBoundingClientRect();
    collapsed = value;
    pill.classList.toggle('is-collapsed', value);
    grip.setAttribute('aria-label', value ? 'إظهار المشغل أو تحريكه' : 'تصغير المشغل أو تحريكه');
    // Preserve the grip position so expanding a bubble does not jump away
    // or become untouchable when it was moved near a screen edge.
    const width = value ? 49 : Math.min(254, innerWidth - 16);
    const rtl = getComputedStyle(pill).direction === 'rtl';
    const gripCenter = rtl ? before.right - 23 : before.left + 23;
    const desiredLeft = rtl ? gripCenter - width + 23 : gripCenter - 23;
    position(desiredLeft, before.top);
  }
  function schedule() {
    clearTimeout(idleTimer);
    if (active && !drag) idleTimer = setTimeout(() => shrink(true), 6500);
  }
  function position(x, y) {
    const r = pill.getBoundingClientRect(), margin = 8;
    pill.style.left = Math.max(margin, Math.min(innerWidth - r.width - margin, x)) + 'px';
    pill.style.top = Math.max(margin, Math.min(innerHeight - r.height - margin, y)) + 'px';
  }
  grip.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const r = pill.getBoundingClientRect();
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top, moved: false };
    grip.setPointerCapture?.(e.pointerId);
    clearTimeout(idleTimer);
  });
  grip.addEventListener('pointermove', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 7) drag.moved = true;
    if (drag.moved) position(drag.left + dx, drag.top + dy);
  });
  grip.addEventListener('pointerup', e => {
    if (!drag || drag.id !== e.pointerId) return;
    const moved = drag.moved; drag = null;
    if (!moved) shrink(!collapsed);
    // The final drag location is the user's choice. No edge snapping.
    if (!collapsed) schedule();
  });
  grip.addEventListener('pointercancel', () => { drag = null; schedule(); });
  play.addEventListener('click', () => { engine.toggle(); shrink(false); schedule(); });
  layer.querySelector('.ayat-reading-next').addEventListener('click', () => {
    engine.next(); shrink(false); schedule();
  });
  layer.querySelector('.ayat-reading-exit').addEventListener('click', () => close(true));
  engine.addEventListener('state', sync);
  engine.addEventListener('time', sync);
  frame.addEventListener('load', () => {
    status.hidden = true;
    // The recitations page is already alive behind the reader. Returning to
    // it should close this layer, never create a second competing audio engine.
    try {
      frame.contentDocument?.addEventListener('click', event => {
        const anchor = event.target.closest?.('a[href]');
        if (!anchor) return;
        const dest = new URL(anchor.href);
        if (dest.origin !== location.origin || !/\/recitations\.html$/.test(dest.pathname)) return;
        event.preventDefault();
        close(true);
      });
    } catch (_) { /* If embedding is restricted, the return button still works. */ }
  });
  frame.addEventListener('error', () => {
    status.hidden = false;
    status.textContent = 'تعذر فتح المصحف؛ يمكنك العودة إلى التلاوات.';
  });
  async function attachBack() {
    const plugin = window.Capacitor?.Plugins?.App;
    if (!plugin?.addListener) return;
    try {
      const sub = await plugin.addListener('backButton', () => { if (active) close(true); });
      if (active) backSubscription = sub;
      else await sub?.remove?.();
    } catch (_) { /* The browser uses history instead. */ }
  }
  function close(goBack) {
    if (!active) return;
    active = false;
    clearTimeout(idleTimer);
    layer.hidden = true;
    underlay.forEach(node => { node.inert = false; });
    frame.removeAttribute('src');
    const sub = backSubscription; backSubscription = null;
    sub?.remove?.();
    if (goBack && history.state?.ayatReadingLayer) history.back();
  }
  function open() {
    if (active) return;
    active = true;
    layer.hidden = false;
    underlay.forEach(node => { node.inert = true; });
    status.hidden = false;
    status.textContent = 'جاري فتح المصحف…';
    frame.src = new URL('quran.html?ayat-reading-mode=1', location.href).href;
    pill.style.left = '8px'; pill.style.top = '58%';
    pill.classList.remove('is-collapsed');
    collapsed = false;
    shrink(false);
    sync();
    schedule();
    history.pushState({ ayatReadingLayer: true }, '', 'quran.html?ayat-reading-mode=1');
    attachBack();
  }
  window.addEventListener('popstate', () => {
    if (active && !history.state?.ayatReadingLayer) close(false);
  });
  document.addEventListener('click', e => {
    const link = e.target.closest?.('a[href]');
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || link.target) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !/\/quran\.html$/.test(url.pathname)) return;
    if (!active && !engine.snapshot().playing) return;
    e.preventDefault();
    open();
  });
  window.ayatReadingWithAudio = { open, close: () => close(true) };
})();