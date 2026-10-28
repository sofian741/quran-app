'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

test('approved QA vertical row-spacing fallback preserves pinned Quran data, font, width and kashida sources', () => {
    const expected = {
        'style.css': '5d39e5da6064e62a2402e7be47f5cd5b8829a888',
        'reader-enhancements.js': '8982ac70f1e2d8e22719fe9a7610339d791adb0f',
        'reader-layout-polish.js': '10dd517e9a779879679c779baeb7db0a52b845f0',
        'data/mushaf-layout.json': 'c10a1fad7d78c4a5809db88ebb0adb59f8576390',
        'assets/fonts/amiri-quran-arabic-400-normal.woff2': 'e8b4b25708dd8dbc7ebfb3fad24595d0196e40ac'
    };
    // app.js intentionally changed to add surah index search. Keep its
    // approved version pinned so unexpected reader changes still fail CI.
    assert.equal(execFileSync('git', ['hash-object', 'app.js'], { encoding: 'utf8' }).trim(),
        '76e22e2c4d7926146b3d7e6723b62eb27fc90fc9',
        'app.js differs from the reviewed index-search version');
    const app = fs.readFileSync('app.js', 'utf8');
    assert.match(app, /index-surah-search/);
    assert.match(app, /normalized\(entry\.label\)/);
    // QA-only approved change: this one layout file may relax row height and scroll.
    // Keep it pinned, rather than disabling the integrity guard altogether.
    const layout = fs.readFileSync('reader-layout-polish.js', 'utf8');
    assert.match(layout, /function protectVerticalInk\(container\)/);
    assert.match(layout, /container\.classList\.add\('vertical-relaxed'\)/);
    assert.match(layout, /const STANDARD_FONT_WIDTH_RATIO = 0\.067/);
    assert.match(layout, /const MAX_KASHIDAS_PER_WORD = 4/);
    assert.match(layout, /const MAX_KASHIDAS_PER_LINE = 32/);
    for (const [file, sha] of Object.entries(expected)) {
        assert.equal(execFileSync('git', ['hash-object', file], { encoding: 'utf8' }).trim(),
            sha, file + ' unexpectedly changed');
    }
});

test('all reciter metadata remain available and keyboard guard is included only in reader page', () => {
    const html = fs.readFileSync('quran.html', 'utf8');
    assert.match(html, /src="reader-layout-polish\.js"/);
    assert.match(html, /src="mushaf-keyboard-viewport\.js"/);
    assert.match(html, /src="qud-audio\.js"/);
    const registry = fs.readFileSync('data/qud/registry.js', 'utf8');
    assert.equal((registry.match(/\.word\.json\.gz/g) || []).length, 19);
    assert.equal((registry.match(/"id":90\d\d/g) || []).length, 19);
});

test('keyboard show/hide never changes Quran page dimensions, and normal viewport returns after dismissal', () => {
    const listeners = new Map();
    const visualListeners = new Map();
    const events = {
        doc: (name, fn) => listeners.set(name, fn),
        win: (name, fn) => listeners.set('win:' + name, fn),
        visual: (name, fn) => visualListeners.set(name, fn)
    };
    const reader = {
        style: { height: '' }, dataset: {},
        contains: element => !!element?.inside,
        getBoundingClientRect: () => ({ height: 844 })
    };
    const stage = {
        style: { height: '' },
        getBoundingClientRect: () => ({ height: 844 })
    };
    const document = {
        activeElement: null,
        querySelector: selector => selector === '.reader-page' ? reader : null,
        getElementById: id => id === 'reader-stage' ? stage : null,
        addEventListener: events.doc
    };
    const window = {
        innerWidth: 390, innerHeight: 844,
        visualViewport: { height: 844, addEventListener: events.visual },
        addEventListener: events.win
    };
    const timers = new Map();
    let timerId = 0;
    vm.runInNewContext(fs.readFileSync('mushaf-keyboard-viewport.js', 'utf8'), {
        document, window, Object,
        setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); }
    });
    const field = { tagName: 'INPUT', type: 'search', inside: true };
    document.activeElement = field;
    listeners.get('focusin')({ target: field });
    assert.equal(window.mushafKeyboardViewport.isLocked(), true);
    assert.equal(reader.style.height, '844px');
    assert.equal(stage.style.height, '844px');

    window.innerHeight = 475;
    window.visualViewport.height = 475;
    listeners.get('win:resize')();
    visualListeners.get('resize')();
    assert.equal(reader.style.height, '844px', 'keyboard must not shrink the Quran');
    assert.equal(stage.style.height, '844px');

    document.activeElement = null;
    listeners.get('focusout')({ target: field });
    assert.equal(reader.style.height, '844px', 'blur is before keyboard animation finishes');
    window.innerHeight = 844;
    window.visualViewport.height = 844;
    visualListeners.get('resize')();
    assert.equal(window.mushafKeyboardViewport.isLocked(), false);
    assert.equal(reader.style.height, '');
    assert.equal(stage.style.height, '');
});
