'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = name => fs.readFileSync(name,'utf8');

test('all three entry pages exclude legacy audio-bundle adapters',()=>{
    for (const page of ['quran.html','recitations.html','library.html']) {
        const html=read(page);
        assert.doesNotMatch(html,/<script[^>]+(?:offline-mishary|offline-licensed-reciter|offline-mishary-sync)\.js/);
    }
    const mushaf=read('quran.html');
    assert.match(mushaf,/<script src="verse-audio-selection\.js"><\/script>/);
    assert.match(mushaf,/لا يضم تسجيلات صوتية مسبقًا/);
    assert.doesNotMatch(mushaf,/الحذيفي المدمج/);
});

test('Android APK cannot include 114-surah bundles, even when old rights variable is true',()=>{
    const workflow=read('.github/workflows/build-android-apk.yml');
    assert.doesNotMatch(workflow,/AYAT_EVERYAYAH_REDISTRIBUTION_APPROVED/);
    assert.doesNotMatch(workflow,/gh release download/);
    assert.doesNotMatch(workflow,/build-licensed-huthaifi\.py|build-synced-mishary\.py/);
    assert.match(workflow,/Verified: 0 bundled audio files/);
    assert.match(workflow,/rm -rf www\/offline\/mishary www\/offline\/huthaifi/);
    const prep=read('scripts/prepare-android-web.mjs');
    assert.match(prep,/'offline-mishary\.js'/);
    assert.match(prep,/'offline-licensed-reciter\.js'/);
});

test('Mushaf never hardcodes a switch to Mishary when listening to an ayah',()=>{
    const source=read('mushaf-audio.js');
    const start=source.indexOf("ui.listenAction.addEventListener('click'");
    const end=source.indexOf("window.addEventListener('mushaf:page-ready'",start);
    assert.ok(start>0&&end>start);
    const listener=source.slice(start,end);
    assert.doesNotMatch(listener,/selectAligned\(7|مشاري العفاسي لتشغيل الآية/);
    assert.match(listener,/verseListener\.listen/);
    assert.match(listener,/لا يوجد اتصال بالإنترنت/);
});
