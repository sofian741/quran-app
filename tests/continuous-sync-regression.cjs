'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

class AudioEngine {
    preloadUpcomingVerse() { this.unnecessaryPreloads = (this.unnecessaryPreloads || 0) + 1; }
    prepare() {}
    goTo() {}
    play() {}
    handleEnded() {}
    bindAudio() {}
}
class TimingProvider {
    chapter() {}
    verse() {}
}
const window = {
    QuranAudio: {
        AudioEngine, TimingProvider,
        ALIGNED_RECITERS: [{ id: 7, name: 'مشاري العفاسي' }],
        VERSE_COUNTS: [7, ...Array(113).fill(1)]
    },
    QudAudioRegistry: {
        qudRelease: 'test', license: 'test',
        reciters: [{
            id: 9000, slug: 'test-reciter', name: 'قارئ اختبار',
            timingUrl: './test.gz', catalogUrl: './test.json'
        }]
    },
    QuranDownloads: {
        syncedMisharyChapter() {}
    }
};
const context = vm.createContext({
    window, URL, location: { href: 'https://example.test/quran.html' },
    setTimeout, clearTimeout, navigator: { onLine: true }, console
});
for (const file of ['qud-audio.js', 'offline-mishary-sync.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
}

const audio = { currentTime: 1.4, readyState: 4, paused: false };
const verses = [
    { ayah: 1, timestampFrom: 0, timestampTo: 1000 },
    { ayah: 2, timestampFrom: 1000, timestampTo: 2000 },
    { ayah: 3, timestampFrom: 2000, timestampTo: 3000 }
];
const chapter = { surah: 1, verses, byAyah: new Map(verses.map(row => [row.ayah, row])) };
const engine = new AudioEngine();
let emissions = 0;
Object.assign(engine, {
    audio,
    state: { provider: 'quran-foundation', reciterId: 9000, surah: 1, ayah: 1, position: 0 },
    __continuousChapter: chapter,
    __continuousAudio: audio,
    persist() {},
    emit() { emissions++; }
});

engine.__syncContinuousChapter();
assert.equal(engine.state.ayah, 2, 'QUD highlighting must advance into the next verse');
assert.equal(engine.currentTiming.ayah, 2);
assert.equal(emissions, 1);
audio.currentTime = 2.2;
engine.__syncContinuousChapter();
assert.equal(engine.state.ayah, 3, 'QUD highlighting must keep advancing through the surah');
audio.currentTime = 0.4;
engine.__syncContinuousChapter();
assert.equal(engine.state.ayah, 1, 'Seeking backwards must update the verse highlight');
assert.equal(engine.unnecessaryPreloads, undefined);
assert.equal(typeof engine.preloadUpcomingVerse()?.then, 'function', 'continuous recordings must not preload a duplicate chapter');
assert.equal(engine.unnecessaryPreloads, undefined, 'no separate audio request for the next ayah');

// The Mishary implementation must still own its own bundled chapter cursor.
engine.state.reciterId = 7;
engine.state.ayah = 1;
engine.state.repeat = { mode: 'off' };
engine.__offlineMisharyChapter = chapter;
engine.updateMediaMetadata = () => {};
audio.currentTime = 1.4;
engine.__syncContinuousChapter();
assert.equal(engine.state.ayah, 2, 'bundled Mishary tracking must remain intact');
console.log('PASS: continuous QUD/Foundation cursor survives Mishary wrapper, seek and preloading guards');
