#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

function read(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function write(file, text) { fs.writeFileSync(path.join(root, file), text); }
function replaceOnce(text, before, after, label) {
    const first = text.indexOf(before);
    if (first < 0) throw new Error(`Missing migration anchor: ${label}`);
    if (text.indexOf(before, first + before.length) >= 0) {
        throw new Error(`Ambiguous migration anchor: ${label}`);
    }
    return text.slice(0, first) + after + text.slice(first + before.length);
}

let app = read('app.js');
app = replaceOnce(
    app,
    "        if (layout?.version !== 1 || !Array.isArray(layout.pages) || layout.pages.length !== TOTAL_PAGES) {\n            throw new Error('Invalid mushaf layout metadata');\n        }",
    "        if (\n            layout?.version !== 2 || layout.protected_opening_pages !== 2 ||\n            !Array.isArray(layout.pages) || layout.pages.length !== TOTAL_PAGES\n        ) {\n            throw new Error('Invalid canonical mushaf layout metadata');\n        }",
    'layout version guard',
);
app = replaceOnce(
    app,
    "            else fragment.appendChild(createMushafLine(line[1], line[2]));",
    "            else fragment.appendChild(createMushafLine(\n                line[1], line[2], line[3] === 1, displayPage > 2\n            ));",
    'main page line render',
);
app = replaceOnce(
    app,
    "    function createMushafLine(start, end) {\n        const line = document.createElement('div');\n        line.className = 'mushaf-line is-measuring';\n        line.dataset.start = String(start);\n        line.dataset.end = String(end);",
    "    function createMushafLine(start, end, centered = false, canonical = false) {\n        const line = document.createElement('div');\n        line.className = canonical\n            ? `mushaf-line ${centered ? 'is-canonical-centered' : 'is-canonical-full'}`\n            : 'mushaf-line is-measuring';\n        line.dataset.start = String(start);\n        line.dataset.end = String(end);\n        if (canonical) line.dataset.canonicalCentered = centered ? '1' : '0';",
    'line factory',
);

const fitAnchor = "    function applyFitResult(container, lines, result) {";
const standardFit = `    // Pages 3-604 are a single 15-line printed-mushaf system. Their type size is\n    // viewport-dependent, never page-dependent. This prevents page-to-page font jumps.\n    function getStandardMushafFontSize(container) {\n        const usableWidth = Math.max(1, container.clientWidth - 20);\n        const widthBased = usableWidth * 0.048;\n        const heightBased = container.clientHeight / (15 * settings.lineHeight * 1.08);\n        return Math.max(\n            MIN_FONT_SIZE,\n            Math.min(settings.fontSize, widthBased, heightBased)\n        );\n    }\n\n    function fitStandardElement(container) {\n        const lines = Array.from(container.querySelectorAll('.mushaf-line'));\n        const fontSize = getStandardMushafFontSize(container);\n        const value = \`${'${fontSize.toFixed(2)}'}px\`;\n        container.dataset.layoutState = 'pending';\n        container.style.fontSize = value;\n        container.style.setProperty('--mushaf-font-size', value);\n        container.style.setProperty(\n            '--mushaf-min-row-height',\n            \`${'${(fontSize * settings.lineHeight).toFixed(2)}'}px\`\n        );\n\n        lines.forEach(line => {\n            const centered = line.dataset.canonicalCentered === '1';\n            line.classList.remove(\n                'is-measuring', 'is-full-line', 'is-short-line', 'is-crowded-line',\n                'is-canonical-full', 'is-canonical-centered'\n            );\n            line.classList.add(centered ? 'is-canonical-centered' : 'is-canonical-full');\n            line.style.transform = '';\n            line.style.fontSize = '';\n            line.style.width = '';\n            line.style.justifyContent = '';\n            line.style.columnGap = '';\n        });\n        container.dataset.layoutState = 'ready';\n    }\n\n`;
if (!app.includes(fitAnchor)) throw new Error('Missing fit anchor');
app = app.replace(fitAnchor, standardFit + fitAnchor);
app = replaceOnce(
    app,
    "        container.classList.toggle('opening-spread', pageNumber <= 2);\n        container.dataset.openingPage = pageNumber <= 2 ? String(pageNumber) : '';\n        const key = [",
    "        container.classList.toggle('opening-spread', pageNumber <= 2);\n        container.dataset.openingPage = pageNumber <= 2 ? String(pageNumber) : '';\n        if (pageNumber > 2) {\n            fitStandardElement(container);\n            return;\n        }\n        const key = [",
    'standard fit split',
);
write('app.js', app);

let preview = read('reader-enhancements.js');
preview = replaceOnce(
    preview,
    "            const line = document.createElement('div');\n            line.className = 'mushaf-line is-short-line';\n            line.dataset.start = String(row[1]);\n            line.dataset.end = String(row[2]);",
    "            const line = document.createElement('div');\n            const canonical = row.length >= 4;\n            const centered = canonical && row[3] === 1;\n            line.className = canonical\n                ? `mushaf-line ${centered ? 'is-canonical-centered' : 'is-canonical-full'}`\n                : 'mushaf-line is-short-line';\n            line.dataset.start = String(row[1]);\n            line.dataset.end = String(row[2]);\n            if (canonical) line.dataset.canonicalCentered = centered ? '1' : '0';",
    'preview line factory',
);
preview = replaceOnce(
    preview,
    "            if (line.children.length >= 4) line.className = 'mushaf-line is-full-line';\n            fragment.appendChild(line);",
    "            if (!canonical && line.children.length >= 4) {\n                line.className = 'mushaf-line is-full-line';\n            }\n            fragment.appendChild(line);",
    'preview fallback classifier',
);
write('reader-enhancements.js', preview);

let css = read('style.css');
const cssAnchor = ".mushaf-word { display: inline-block; flex: 0 0 auto; }";
const canonicalCss = `\n\n/* Canonical printed-Madinah rows for pages 3-604. The opening spread is\n   deliberately excluded so its approved Fatihah/Baqarah design cannot move. */\n.quran-text:not(.opening-spread) .mushaf-line.is-canonical-full {\n    justify-content: space-between;\n    gap: .05em;\n}\n\n.quran-text:not(.opening-spread) .mushaf-line.is-canonical-centered {\n    justify-content: center;\n    gap: .14em;\n}\n\n.quran-text:not(.opening-spread) .surah-basmala {\n    flex: 1 1 0;\n    min-height: var(--mushaf-min-row-height);\n    padding-block: .08em;\n    font-size: 1em;\n    line-height: var(--reader-line-height);\n}\n`;
if (!css.includes(cssAnchor)) throw new Error('Missing canonical CSS anchor');
css = css.replace(cssAnchor, cssAnchor + canonicalCss);
write('style.css', css);

let allPages = read('tests/all-pages.cjs');
allPages = replaceOnce(
    allPages,
    "                let basmalas = 0;",
    "                let basmalas = 0;\n                let standardFontSize = null;",
    'all-pages standard font variable',
);
allPages = replaceOnce(
    allPages,
    "                    const words = [...text.querySelectorAll('.mushaf-word')];",
    "                    const words = [...text.querySelectorAll('.mushaf-word')];\n\n                    if (pageNumber >= 3) {\n                        const fontSize = parseFloat(getComputedStyle(text).fontSize);\n                        if (standardFontSize === null) standardFontSize = fontSize;\n                        else if (Math.abs(fontSize - standardFontSize) > 0.01) {\n                            fail(pageNumber, `font-size changed ${standardFontSize} -> ${fontSize}`);\n                        }\n                        const canonicalLines = [...text.querySelectorAll('.mushaf-line')];\n                        for (const line of canonicalLines) {\n                            const style = getComputedStyle(line);\n                            const centered = line.dataset.canonicalCentered === '1';\n                            if (style.transform !== 'none') fail(pageNumber, 'canonical line is transformed');\n                            if (centered && style.justifyContent !== 'center') {\n                                fail(pageNumber, 'canonical centered line is not centered');\n                            }\n                            if (!centered && style.justifyContent !== 'space-between') {\n                                fail(pageNumber, 'canonical full line is not justified');\n                            }\n                        }\n                        for (const basmala of text.querySelectorAll('.surah-basmala')) {\n                            const basmalaSize = parseFloat(getComputedStyle(basmala).fontSize);\n                            if (Math.abs(basmalaSize - fontSize) > 0.01) {\n                                fail(pageNumber, `basmala size ${basmalaSize} != ${fontSize}`);\n                            }\n                        }\n                    }",
    'all-pages canonical assertions',
);
allPages = replaceOnce(
    allPages,
    "                    if (pageNumber === 207 && pageHeadings.length) {\n                        fail(pageNumber, 'unexpected heading before Surah Yunus');\n                    }",
    "                    if (pageNumber === 207 && !pageHeadings.some(item => item.dataset.surah === '10')) {\n                        fail(pageNumber, 'canonical Surah Yunus heading is missing from final row');\n                    }",
    'Yunus page 207 canonical heading',
);
allPages = replaceOnce(
    allPages,
    "                    if (pageNumber === 208 && !pageHeadings.some(item => item.dataset.surah === '10')) {\n                        fail(pageNumber, 'Surah Yunus heading is missing');\n                    }",
    "                    if (pageNumber === 208 && pageHeadings.some(item => item.dataset.surah === '10')) {\n                        fail(pageNumber, 'duplicate Surah Yunus heading after canonical page break');\n                    }",
    'Yunus page 208 duplicate guard',
);
write('tests/all-pages.cjs', allPages);

console.log('Applied guarded canonical renderer migration.');
