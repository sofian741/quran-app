const fs = require('fs');
const assert = require('assert');

const chapters = JSON.parse(fs.readFileSync('data/adhkar.json', 'utf8'));
const source = JSON.parse(fs.readFileSync('data/adhkar-source.json', 'utf8'));

const normalize = value => String(value || '')
  .normalize('NFKD')
  .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
  .replace(/[إأآٱ]/g, 'ا')
  .replace(/ى/g, 'ي')
  .replace(/ة/g, 'ه')
  .toLowerCase();

assert(Array.isArray(chapters), 'Adhkar root must be an array');
assert.strictEqual(chapters.length, 133, 'Expected the 133 Hisn al-Muslim chapters');

const chapterIds = new Set();
const chapterTitles = new Set();
const itemIds = new Set();
let itemCount = 0;

for (const chapter of chapters) {
  assert(Number.isInteger(chapter.id) && chapter.id > 0, `Invalid chapter id: ${chapter.id}`);
  assert(!chapterIds.has(chapter.id), `Duplicate chapter id: ${chapter.id}`);
  chapterIds.add(chapter.id);

  assert(typeof chapter.title === 'string' && chapter.title.trim(), `Chapter ${chapter.id} has no title`);
  const normalizedTitle = normalize(chapter.title);
  assert(!chapterTitles.has(normalizedTitle), `Duplicate chapter title: ${chapter.title}`);
  chapterTitles.add(normalizedTitle);

  assert(Array.isArray(chapter.items) && chapter.items.length > 0, `Chapter ${chapter.id} has no adhkar`);

  for (const item of chapter.items) {
    itemCount++;
    assert(Number.isInteger(item.id) && item.id > 0, `Invalid item id in chapter ${chapter.id}`);
    assert(!itemIds.has(item.id), `Duplicate global item id: ${item.id}`);
    itemIds.add(item.id);
    assert(typeof item.text === 'string' && item.text.trim(), `Item ${item.id} has empty text`);
    assert(Number.isInteger(item.count) && item.count > 0, `Item ${item.id} has invalid repetition count`);
    assert(typeof item.reference === 'string' && item.reference.trim(), `Item ${item.id} has no reference`);
  }
}

assert.strictEqual(itemCount, 302, 'Expected 302 adhkar and supplications');
assert.strictEqual(source.chapters, chapters.length, 'Source metadata chapter count is out of sync');
assert.strictEqual(source.items, itemCount, 'Source metadata item count is out of sync');
assert.strictEqual(source.license, 'MIT', 'Unexpected source-data license metadata');

const quickTitles = [
  'أذكار الصباح',
  'أذكار المساء',
  'الأذكار بعد السلام من الصلاة',
  'أذكار النوم',
  'أذكار الاستيقاظ من النوم',
  'دعاء الهم والحزن'
];

for (const hint of quickTitles) {
  const wanted = normalize(hint);
  const found = chapters.some(chapter => normalize(chapter.title).includes(wanted));
  assert(found, `Quick-access chapter not found: ${hint}`);
}

console.log(`Adhkar dataset OK: ${chapters.length} chapters, ${itemCount} referenced items, quick links resolved.`);
