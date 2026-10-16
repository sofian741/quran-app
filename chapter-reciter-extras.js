(() => {
    'use strict';

    const core = window.QuranAudio;
    const registry = window.QudAudioRegistry;
    const extras = Array.isArray(registry?.qfReciters) ? registry.qfReciters : [];
    if (!core?.AudioEngine || !extras.length) return;

    const clean = extras.filter(item => Number.isSafeInteger(Number(item.id)) && item.name)
        .map(item => ({
            id: Number(item.id),
            name: String(item.name),
            label: String(item.label || `${item.name} • تظليل الكلمات`)
        }));
    if (!clean.length) return;

    const byId = new Map(clean.map(item => [item.id, item]));
    const existing = new Set((core.ALIGNED_RECITERS || []).map(item => Number(item.id)));
    core.ALIGNED_RECITERS = Object.freeze([
        ...(core.ALIGNED_RECITERS || []),
        ...clean.filter(item => !existing.has(item.id))
    ]);

    const proto = core.AudioEngine.prototype;
    const previousSelectAligned = proto.selectAligned;
    proto.selectAligned = function(reciterId = 7, options = {}) {
        const reciter = byId.get(Number(reciterId));
        if (reciter && !this.alignedReciters?.has(reciter.id)) {
            this.registerAlignedReciter(reciter);
        }
        return previousSelectAligned.apply(this, [reciterId, options]);
    };

    window.QuranFoundationVerifiedReciters = Object.freeze([...clean]);
})();
