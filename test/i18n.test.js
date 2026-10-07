const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const messages = require('../js/messages.js');
test('Japanese and English message keys match and no translations are empty', () => {
  assert.deepEqual(Object.keys(messages.ja).sort(), Object.keys(messages.en).sort());
  assert.ok(Object.keys(messages.ja).length >= 85);
  for (const lang of ['ja', 'en']) for (const value of Object.values(messages[lang])) {
    assert.equal(typeof value, 'string');
    assert.ok(value.trim());
    if (lang === 'en') assert.doesNotMatch(value, /[\u3040-\u30ff\u4e00-\u9fff]/);
  }
});
test('all static and literal dynamic translation keys exist', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const source = fs.readFileSync('script.js', 'utf8');
  const keys = [...html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)].map(m => m[1]);
  assert.ok(keys.length > 70);
  for (const key of keys) assert.ok(Object.hasOwn(messages.en, key), key);
  for (const key of ['empty', 'invalidSeed', 'invalidSettings', 'loaded', 'cancelled', 'confirmLoad', 'brightMask', 'darkMask']) {
    assert.ok(Object.hasOwn(messages.en, key));
  }
  assert.doesNotMatch(source, /[\u3040-\u30ff\u4e00-\u9fff]/);
});
