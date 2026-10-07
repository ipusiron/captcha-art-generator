const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {execFileSync} = require('node:child_process');
const core = require('../js/art-core.js');
const docs = ['README.md', 'README.en.md'].map(file => fs.readFileSync(file, 'utf8'));
const headings = text => [...text.matchAll(/^(#{1,6}) (.+)$/gm)].map(m => [m[1].length, m[2]]);
test('bilingual headings have equal count, order of icons and hierarchy', () => {
  const a = headings(docs[0]), b = headings(docs[1]);
  assert.equal(a.length, 17);
  assert.equal(b.length, 17);
  assert.deepEqual(a.map(x => x[0]), b.map(x => x[0]));
  assert.deepEqual(a.slice(1).map(x => x[1].split(' ')[0]), b.slice(1).map(x => x[1].split(' ')[0]));
});
for (const [index, doc] of docs.entries()) {
  test(`README statistics examples are executed: language ${index}`, () => {
    const rows = [...doc.matchAll(/^\| `([01]{4}\/[01]{4})` \| ([\d.]+) \| (\d+) \| (\d+) \| ([\d.]+) \|$/gm)];
    assert.equal(rows.length, 3);
    for (const [, pattern, percent, transitions, runs, threshold] of rows) {
      const pixels = Uint8ClampedArray.from([...pattern.replace('/', '')].flatMap(v => {
        const gray = v === '1' ? 0 : 255;
        return [gray, gray, gray, 255];
      }));
      const result = core.analyzePixels(pixels, 4, 2);
      assert.deepEqual([(result.occupancy * 100).toFixed(2), String(result.transitions), String(result.runs),
        result.threshold.toFixed(2)], [percent, transitions, runs, threshold]);
    }
  });
  test(`README local links and images exist: language ${index}`, () => {
    const links = [...doc.matchAll(/\]\(([^)]+)\)/g)].map(m => m[1]).filter(link => !/^(https?:|#)/.test(link));
    assert.ok(links.length >= 4);
    for (const link of links) assert.ok(fs.existsSync(link.split('#')[0]), link);
    const images = [...doc.matchAll(/!\[[^\]]*\]\((assets\/[^)]+)\)/g)].map(m => m[1]);
    assert.equal(images.length, 2);
    for (const image of images) {
      const bytes = fs.readFileSync(image);
      assert.ok(bytes.length <= 300 * 1024);
      assert.equal(bytes.readUInt32BE(16), 1280);
      assert.equal(bytes.readUInt32BE(20), 1100);
    }
  });
  test(`README tree lists every source file with aligned descriptions: language ${index}`, () => {
    const block = doc.match(/```\ncaptcha-art-generator\/[\s\S]*?```/)[0];
    const stack = [], listed = [];
    const lines = block.split('\n').slice(1, -1);
    const commentColumn = lines[0].indexOf('#');
    for (const line of lines) {
      assert.equal(line.indexOf('#'), commentColumn);
      assert.match(line, /# \S/);
      const m = line.match(/^((?:│   |    )*)(?:├── |└── )([^ ]+)/);
      if (!m) continue;
      const depth = m[1].length / 4, name = m[2];
      if (name.endsWith('/')) stack[depth] = name.slice(0, -1);
      else listed.push([...stack.slice(0, depth), name].join('/'));
    }
    // The public source tree excludes ignored, machine-local configuration.
    const files = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {encoding: 'utf8'}).split('\0').filter(Boolean))];
    assert.deepEqual(listed.sort(), files.sort());
  });
}
test('metadata identity and block list syntax are preserved', () => {
  const meta = docs[0].match(/^<!--\n---\n([\s\S]*?)\n---\n-->/)[1];
  for (const line of ['id: day075', 'slug: captcha-art-generator', 'hub: true',
    'repo_url: "https://github.com/ipusiron/captcha-art-generator"',
    'demo_url: "https://ipusiron.github.io/captcha-art-generator/"']) assert.ok(meta.includes(line));
  for (const key of ['category_ja', 'category_en', 'tags']) assert.match(meta, new RegExp(key + ':\n  - '));
});
test('both docs describe scope and have no retrospective change notes', () => {
  assert.match(docs[0], /読み取り成功率/);
  assert.match(docs[1], /does not measure human or OCR reading success/);
  for (const doc of docs) assert.doesNotMatch(doc, /previously|used to|earlier version|formerly|改修前|以前は/i);
});
