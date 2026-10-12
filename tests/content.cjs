'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'data/quran-uthmani.txt'), 'utf8');
const layout = JSON.parse(fs.readFileSync(path.join(root, 'data/mushaf-layout.json'), 'utf8'));
const suffixMarks = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ', 'ۙ', 'ۜ', '۩']);
const prefixMarks = new Set(['۞']);

function splitWords(text) {
    const words = [];
    let prefix = '';
    for (const word of text.trim().split(/\s+/).filter(Boolean)) {
        if (prefixMarks.has(word)) prefix += word;
        else if (suffixMarks.has(word) && words.length) words[words.length - 1] += word;
        else {
            words.push(prefix + word);
            prefix = '';
        }
    }
    return words;
}

const verses = [];
const words = [];
for (const line of raw.split(/\r?\n/)) {
    if (!/^\d+\|\d+\|/.test(line)) continue;
    const [surahText, ayahText, ...textParts] = line.split('|');
    const surah = Number(surahText);
    const ayah = Number(ayahText);
    const verseWords = splitWords(textParts.join('|'));
    verses.push({ surah, ayah, verseWords });
    verseWords.forEach((text, word) => words.push({ surah, ayah, word, text }));
}

assert.equal(
    crypto.createHash('sha256').update(raw).digest('hex'),
    'aa0bf9278a177a12e6d9bef621ce37a1d24fa35168b5ae9c13ebcbe01e3686cf',
    'The Tanzil source file changed',
);
assert.equal(verses.length, 6236);
assert.equal(words.length, 77881);
assert.equal(layout.version, 1);
assert.equal(layout.pages.length, 604);

let cursor = 0;
let headers = 0;
let basmalas = 0;
let textLines = 0;

layout.pages.forEach((page, pageIndex) => {
    assert.ok(page.length >= 8 && page.length <= 16, `page ${pageIndex + 1} line count`);
    for (const line of page) {
        if (line[0] === 'h') {
            assert.equal(line[1], ++headers, `page ${pageIndex + 1} surah header`);
            continue;
        }
        assert.ok(line[0] === 'l' || line[0] === 'b');
        assert.equal(line[1], cursor, `page ${pageIndex + 1} contiguous start`);
        assert.ok(line[2] > line[1], `page ${pageIndex + 1} nonempty line`);
        cursor = line[2];
        if (line[0] === 'b') {
            basmalas++;
            const opening = words.slice(line[1], line[2]);
            assert.equal(opening.length, 4);
            assert.equal(opening[0].ayah, 1);
            assert.notEqual(opening[0].surah, 1);
            assert.notEqual(opening[0].surah, 9);
        } else {
            textLines++;
        }
    }
});

assert.equal(cursor, words.length);
assert.equal(headers, 114);
assert.equal(basmalas, 112);
assert.ok(textLines > 8500);

console.log(
    `PASS: ${layout.pages.length} pages; ${verses.length} verses; ` +
    `${words.length} source words covered once in order; ` +
    `${headers} headers; ${basmalas} separate basmalas; Tanzil SHA-256 unchanged.`,
);
