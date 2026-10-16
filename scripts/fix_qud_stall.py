#!/usr/bin/env python3
from pathlib import Path


def once(text, old, new, label):
    n = text.count(old)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 match, got {n}')
    return text.replace(old, new, 1)


p = Path('qud-audio.js')
s = p.read_text(encoding='utf-8')

old = """    function waitForMetadata(audio, timeout = 8000) {
        if (audio.readyState >= 1) return Promise.resolve(true);
        return new Promise((resolve, reject) => {
            let timer = null;
            const cleanup = () => {
                clearTimeout(timer);
                audio.removeEventListener('loadedmetadata', onReady);
                audio.removeEventListener('error', onError);
            };
            const onReady = () => { cleanup(); resolve(true); };
            const onError = () => { cleanup(); reject(new Error('تعذّر تحميل ملف صوت السورة.')); };
            timer = setTimeout(() => { cleanup(); reject(new Error('انتهت مهلة تحميل ملف صوت السورة.')); }, timeout);
            audio.addEventListener('loadedmetadata', onReady, { once: true });
            audio.addEventListener('error', onError, { once: true });
        });
    }
"""
new = """    function seekWhenMetadataReady(engine, audio, target, version) {
        const apply = () => {
            if (version !== engine.prepareVersion || audio !== engine.audio) return;
            if (!Number.isFinite(target) || target < 0) return;
            try {
                if (Math.abs((Number(audio.currentTime) || 0) - target) > 0.05) {
                    audio.currentTime = target;
                }
            } catch (_) { /* Some engines reject seeking until metadata is ready. */ }
        };
        if (audio.readyState >= 1) apply();
        else audio.addEventListener('loadedmetadata', apply, { once: true });
    }
"""
s = once(s, old, new, 'metadata waiter')

old = """            if (!sameTrack || this.audio.src !== chapter.audioUrl) {
                this.audio.preload = 'auto';
                this.audio.src = chapter.audioUrl;
                this.audio.load();
                await waitForMetadata(this.audio);
                if (version !== this.prepareVersion) return false;
                if (target > 0) this.audio.currentTime = target;
            } else if (Math.abs((Number(this.audio.currentTime) || 0) - target) > 0.05) {
                this.audio.currentTime = target;
            }

            this.audio.playbackRate = this.state.speed;
            this.updateMediaMetadata();
            this.status = this.audio.paused ? 'ready' : 'playing';
            this.persist();
            this.emit();
            if (autoplay) await this.play();
            return true;
"""
new = """            if (!sameTrack || this.audio.src !== chapter.audioUrl) {
                // Do not block the UI waiting for loadedmetadata. On slower hosts
                // that made the play button look frozen for up to eight seconds.
                // Arm the exact seek before load; loadedmetadata always fires
                // before real playback can advance, so the selected ayah remains exact.
                this.audio.preload = autoplay ? 'auto' : 'metadata';
                this.audio.src = chapter.audioUrl;
                seekWhenMetadataReady(this, this.audio, target, version);
                this.audio.load();
            } else if (this.audio.readyState >= 1 &&
                Math.abs((Number(this.audio.currentTime) || 0) - target) > 0.05) {
                this.audio.currentTime = target;
            } else if (this.audio.readyState < 1) {
                seekWhenMetadataReady(this, this.audio, target, version);
            }

            this.audio.playbackRate = this.state.speed;
            this.updateMediaMetadata();
            this.status = this.audio.paused ? 'ready' : 'playing';
            this.persist();
            this.emit();
            if (autoplay) {
                const played = await this.play();
                if (!played) return false;
            }
            return true;
"""
s = once(s, old, new, 'prepare metadata block')
p.write_text(s, encoding='utf-8')

p = Path('mushaf-audio.js')
s = p.read_text(encoding='utf-8')
old = """    applyState(engine.snapshot(), true);
    loadCatalog();
    if (!window.QudAudioRegistry?.reciters?.length) loadAlignedReciters();
})();
"""
new = """    applyState(engine.snapshot(), true);
    loadCatalog();
    if (!window.QudAudioRegistry?.reciters?.length) {
        loadAlignedReciters();
    } else if (engine.state.provider === 'quran-foundation' &&
        window.QuranQud?.reciters?.some(reciter => Number(reciter.id) === Number(engine.state.reciterId))) {
        // Warm the selected QUD track immediately. This keeps the first press on
        // Play synchronous with HTMLAudioElement.play() instead of making the
        // user wait while timing metadata and the chapter source are discovered.
        engine.prepare({ autoplay: false }).catch(() => { /* The UI reports prepare errors. */ });
    }
})();
"""
s = once(s, old, new, 'startup prewarm')
p.write_text(s, encoding='utf-8')

p = Path('CHANGELOG.md')
s = p.read_text(encoding='utf-8')
marker = '## غير منشور\n\n'
line = '- إصلاح تعليق زر التشغيل مع قراء QUD بإلغاء انتظار metadata المتزامن وتجهيز تسجيل القارئ الحالي مسبقًا، مع إبقاء القفز إلى توقيت الآية المحددة قبل بدء الصوت.\n\n'
if line not in s:
    s = s.replace(marker, marker + line, 1)
p.write_text(s, encoding='utf-8')
