'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const raw = fs.readFileSync(path.join(root, 'data/quran-uthmani.txt'), 'utf8');
const layoutRaw = fs.readFileSync(path.join(root, 'data/mushaf-layout.json'), 'utf8');
const layout = JSON.parse(layoutRaw);
const suffixMarks = new Set(['ۖ', 'ۚ', 'ۘ', 'ۗ', 'ۛ', 'ۙ', 'ۜ', '۩']);
const prefixMarks = new Set(['۞']);
// First page containing each surah according to the source word/page mapping
// in zonetecde/mushaf-layout@72116ce4 (src/data/mushaf-layout).
const referenceSurahStartPages = [
    1,2,50,77,106,128,151,177,187,208,221,235,249,255,262,267,282,293,305,
    312,322,332,342,350,359,367,377,385,396,404,411,415,418,428,434,440,446,
    453,458,467,477,483,489,496,499,502,507,511,515,518,520,523,526,528,531,
    534,537,542,545,549,551,553,554,556,558,560,562,564,566,568,570,572,574,
    575,577,578,580,582,583,585,586,587,587,589,590,591,591,592,593,594,595,
    595,596,596,597,597,598,598,599,599,600,600,601,601,601,602,602,602,603,
    603,603,604,604,604,
];

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
assert.equal(layout.source, 'zonetecde/mushaf-layout@72116ce4d405d67823804f0eed795c1e6409b4af');
assert.equal(
    crypto.createHash('sha256').update(layoutRaw).digest('hex'),
    '72d5d5743160f4be6a5c983723ccc6f5549fb28e11a11fd68896ba8b088585cd',
    'Pinned Madani page/line boundaries changed',
);
assert.equal(layout.pages.length, 604);

let cursor = 0;
let headers = 0;
let basmalas = 0;
let textLines = 0;
const headingLocations = new Map();
const basmalaLocations = new Map();
const firstWordLocations = new Map();
const firstTextLocations = new Map();

layout.pages.forEach((page, pageIndex) => {
    assert.ok(page.length >= 8 && page.length <= 16, `page ${pageIndex + 1} line count`);
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
assert.equal(referenceSurahStartPages.length, 114);

for (let surah = 1; surah <= 114; surah++) {
    const heading = headingLocations.get(surah);
    const firstWord = firstWordLocations.get(surah);
    const firstText = firstTextLocations.get(surah);
    const expectedPage = referenceSurahStartPages[surah - 1];
    assert.ok(heading, `missing heading for surah ${surah}`);
    assert.ok(firstWord, `missing Quran words for surah ${surah}`);
    assert.ok(firstText, `missing first text line for surah ${surah}`);
    assert.equal(firstWord.page, expectedPage, `reference start page for surah ${surah}`);
    assert.equal(heading.page, expectedPage, `heading page for surah ${surah}`);

    const page = layout.pages[expectedPage - 1];
    if (surah === 1 || surah === 9) {
        assert.equal(page[heading.row + 1][0], 'l', `heading/text order for surah ${surah}`);
        assert.equal(firstText.row, heading.row + 1, `first text row for surah ${surah}`);
        assert.ok(!basmalaLocations.has(surah), `unexpected basmala for surah ${surah}`);
    } else {
        const basmala = basmalaLocations.get(surah);
        assert.ok(basmala, `missing basmala for surah ${surah}`);
        assert.equal(basmala.page, expectedPage, `basmala page for surah ${surah}`);
        assert.equal(basmala.row, heading.row + 1, `heading/basmala order for surah ${surah}`);
        assert.equal(firstText.row, basmala.row + 1, `basmala/text order for surah ${surah}`);
    }
}

assert.equal(headingLocations.get(10).page, 208, 'Surah Yunus heading regression');

console.log(
    `PASS: ${layout.pages.length} pages; ${verses.length} verses; ` +
    `${words.length} source words covered once in order; ` +
    `${headers} referenced headings; ${basmalas} separate basmalas; Tanzil SHA-256 unchanged.`,
);
