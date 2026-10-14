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

function key(index) {
    const word = words[index];
    return word ? `${word.surah}:${word.ayah}:${word.word + 1}` : null;
}

assert.equal(
    crypto.createHash('sha256').update(raw).digest('hex'),
    'aa0bf9278a177a12e6d9bef621ce37a1d24fa35168b5ae9c13ebcbe01e3686cf',
    'The Tanzil source file changed',
);
assert.equal(verses.length, 6236);
assert.equal(words.length, 77881);
assert.equal(layout.version, 2);
assert.equal(layout.protected_opening_pages, 2);
assert.equal(layout.pages.length, 604);

// The two hand-tuned opening pages are immutable during the canonical rebuild.
assert.deepEqual(layout.pages[0], [
    ['h',1],['l',0,4],['l',4,8],['l',8,13],['l',13,18],
    ['l',18,23],['l',23,27],['l',27,29],
]);
assert.deepEqual(layout.pages[1], [
    ['h',2],['b',29,33],['l',33,40],['l',40,46],['l',46,53],
    ['l',53,61],['l',61,67],['l',67,69],
]);
for (let page = 3; page <= 604; page++) {
    assert.equal(layout.pages[page - 1].length, 15, `canonical page ${page} has 15 rows`);
}

let cursor = 0;
let headers = 0;
let basmalas = 0;
let textLines = 0;
const headingLocations = new Map();
const basmalaLocations = new Map();
const firstWordLocations = new Map();
const firstTextLocations = new Map();

layout.pages.forEach((page, pageIndex) => {
    assert.ok(page.length >= 8 && page.length <= 15, `page ${pageIndex + 1} line count`);
    for (const [rowIndex, line] of page.entries()) {
        if (line[0] === 'h') {
            assert.equal(line[1], ++headers, `page ${pageIndex + 1} surah header`);
            assert.ok(!headingLocations.has(line[1]), `duplicate heading for surah ${line[1]}`);
            headingLocations.set(line[1], { page: pageIndex + 1, row: rowIndex });
            continue;
        }
        assert.ok(line[0] === 'l' || line[0] === 'b');
        assert.equal(line[1], cursor, `page ${pageIndex + 1} contiguous start`);
        assert.ok(line[2] > line[1], `page ${pageIndex + 1} nonempty line`);
        if (pageIndex >= 2 && line[0] === 'l') {
            assert.ok(line[3] === 0 || line[3] === 1, `page ${pageIndex + 1} centered flag`);
        }
        cursor = line[2];
        const lineWords = words.slice(line[1], line[2]);
        for (const word of lineWords) {
            if (!firstWordLocations.has(word.surah)) {
                firstWordLocations.set(word.surah, { page: pageIndex + 1, row: rowIndex });
            }
        }
        if (line[0] === 'b') {
            basmalas++;
            const opening = lineWords;
            assert.equal(opening.length, 4);
            assert.equal(opening[0].ayah, 1);
            assert.notEqual(opening[0].surah, 1);
            assert.notEqual(opening[0].surah, 9);
            assert.ok(!basmalaLocations.has(opening[0].surah));
            basmalaLocations.set(opening[0].surah, { page: pageIndex + 1, row: rowIndex });
        } else {
            textLines++;
            const surah = lineWords[0].surah;
            if (!firstTextLocations.has(surah)) {
                firstTextLocations.set(surah, { page: pageIndex + 1, row: rowIndex });
            }
        }
    }
});

assert.equal(cursor, words.length);
assert.equal(headers, 114);
assert.equal(basmalas, 112);
assert.ok(textLines > 8500);

for (let surah = 1; surah <= 114; surah++) {
    const heading = headingLocations.get(surah);
    const firstWord = firstWordLocations.get(surah);
    const firstText = firstTextLocations.get(surah);
    assert.ok(heading, `missing heading for surah ${surah}`);
    assert.ok(firstWord, `missing Quran words for surah ${surah}`);
    assert.ok(firstText, `missing first text line for surah ${surah}`);
    assert.equal(heading.page, firstWord.page, `heading/first-word page for surah ${surah}`);

    const page = layout.pages[heading.page - 1];
    if (surah === 1 || surah === 9) {
        assert.equal(page[heading.row + 1][0], 'l', `heading/text order for surah ${surah}`);
        assert.equal(firstText.row, heading.row + 1, `first text row for surah ${surah}`);
        assert.ok(!basmalaLocations.has(surah), `unexpected basmala for surah ${surah}`);
    } else {
        const basmala = basmalaLocations.get(surah);
        assert.ok(basmala, `missing basmala for surah ${surah}`);
        assert.equal(basmala.page, heading.page, `basmala page for surah ${surah}`);
        assert.equal(basmala.row, heading.row + 1, `heading/basmala order for surah ${surah}`);
        assert.equal(firstText.row, basmala.row + 1, `basmala/text order for surah ${surah}`);
    }
}

// Canonical QPC 15-line regression anchors. These catch the exact page/line
// drift that prompted this rebuild, without changing the Quran source text.
const p246 = layout.pages[245].filter(row => row[0] === 'l');
assert.equal(key(p246[0][1]), '12:87:1');
assert.equal(key(p246[0][2] - 1), '12:87:8');
assert.equal(key(p246[1][1]), '12:87:9');
assert.equal(key(p246[1][2] - 1), '12:87:19');
assert.equal(key(p246[2][1]), '12:87:20');
assert.ok(p246.every(row => row[3] === 0), 'page 246 is fully justified in QPC layout');

const p586 = layout.pages[585];
assert.equal(p586[0][0], 'l');
assert.equal(key(p586[0][1]), '80:41:1');
assert.equal(key(p586[0][2] - 1), '80:42:4');
assert.equal(p586[0][3], 1, 'page 586 opening line is canonically centered');
assert.deepEqual(p586[1], ['h', 81]);
assert.equal(p586[2][0], 'b');
assert.equal(key(p586[2][1]), '81:1:1');
assert.equal(key(p586[2][2] - 1), '81:1:4');

const p604 = layout.pages[603];
assert.deepEqual(p604.filter(row => row[0] === 'h').map(row => row[1]), [112,113,114]);
assert.deepEqual(
    p604.filter(row => row[0] === 'l').map(row => row[3]),
    [0,1,0,0,1,0,0,1,1],
    'page 604 canonical centered-line flags',
);

assert.equal(headingLocations.get(10).page, 208, 'Surah Yunus heading regression');

console.log(
    `PASS: ${layout.pages.length} canonical pages; ${verses.length} verses; ` +
    `${words.length} source words covered once in order; ` +
    `${headers} headings; ${basmalas} separate basmalas; Tanzil SHA-256 unchanged.`,
);
