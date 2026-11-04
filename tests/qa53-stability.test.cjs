'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('QVP-only engine and preserved shared services', () => {
    const html = fs.readFileSync('quran.html', 'utf8');
    assert.match(html, /src="mushaf-qvp\\/boot\\.js"/);
    assert.match(html, /src="mushaf-keyboard-viewport\\.js"/);
    assert.match(html, /src="qud-audio\\.js"/);
    for (const old of ['app.js','reader-enhancements.js','reader-layout-polish.js','mushaf-engine-loader.js','mushaf-layout-prewarm-worker.js','data/mushaf-layout.json'])
        assert.equal(fs.existsSync(old),false,old + ' must be deleted');
    const registry = fs.readFileSync('data/qud/registry.js','utf8');
    assert.equal((registry.match(/\\.word\\.json\\.gz/g)||[]).length,19);
    assert.equal((registry.match(/"id":90\\d\\d/g)||[]).length,19);
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
