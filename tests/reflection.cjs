#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const home = fs.readFileSync(path.join(root, 'home.js'), 'utf8');
const source = fs.readFileSync(path.join(root, 'data/quran-uthmani.txt'), 'utf8');
const match = home.match(/const REFLECTION_VERSES\s*=\s*(\[[\s\S]*?\n\s*\]);/);
assert.ok(match, 'reflection reference list must remain readable');
const references = vm.runInNewContext(match[1]);
assert.equal(references.length, 656, 'approved reflection list size changed');

const keys = references.map(item => {
    assert.equal(Array.isArray(item), true);
    assert.equal(item.length, 2);
    const [surah, ayah] = item;
    assert.ok(Number.isInteger(surah) && surah >= 1 && surah <= 114);
    assert.ok(Number.isInteger(ayah) && ayah >= 1);
    return `${surah}:${ayah}`;
});
assert.equal(new Set(keys).size, 656, 'reflection references must be unique');

const verses = new Map();
for (const line of source.split(/\r?\n/)) {
    const parsed = /^(\d+)\|(\d+)\|(.+)$/.exec(line);
    if (parsed) verses.set(`${parsed[1]}:${parsed[2]}`, parsed[3]);
}
keys.forEach(key => assert.ok(verses.get(key)?.trim(), `missing reflection verse ${key}`));
assert.match(home, /Date\.UTC\(date\.getFullYear\(\), date\.getMonth\(\), date\.getDate\(\)\)/,
    'daily selection must use the device local calendar date');
assert.match(home, /day % REFLECTION_VERSES\.length/,
    'daily selection must complete the approved list before repeating');

const baseDay = Date.UTC(2026, 0, 1) / 86400000;
const cycle = Array.from({ length: references.length }, (_, offset) =>
    ((baseDay + offset) % references.length + references.length) % references.length);
assert.equal(new Set(cycle).size, references.length, 'one cycle must visit every reference once');

console.log('PASS: 656 unique daily-reflection references resolve to complete local Tanzil verses.');
