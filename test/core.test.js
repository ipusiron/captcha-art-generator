const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/art-core.js');
const settings = () => ({version: 1, text: 'Q&A 😀', font: core.FONTS[0], preset: 'classic', ...core.preset('classic'), seed: 12345});

test('PRNG agrees with an independent BigInt implementation beyond 10,000 calls', () => {
  let state = 12345n;
  const u32 = value => BigInt.asUintN(32, value);
  const rng = core.mulberry32(12345), values = [];
  for (let i = 0; i < 21000; i++) {
    state = u32(state + 0x6D2B79F5n);
    let r = u32((state ^ (state >> 15n)) * (1n | state));
    r ^= u32(r + u32((r ^ (r >> 7n)) * (61n | r)));
    const expected = Number(u32(r ^ (r >> 14n))) / 4294967296;
    values.push(rng());
    assert.equal(values[i], expected);
  }
  assert.notDeepEqual(values.slice(0, 20), values.slice(10000, 10020));
});
test('text preserves markup characters and 32 whole code points', () => {
  assert.equal(core.normalizeText('<Q&A>"\''), '<Q&A>"\'');
  assert.equal(core.normalizeText('😀'.repeat(33)), '😀'.repeat(32));
  assert.equal(core.normalizeText('a\n\u0000b'), 'ab');
});
for (const name of Object.keys(core.PRESETS)) {
  test(`settings round trip: ${name}`, () => {
    const value = {...settings(), ...core.preset(name), preset: name};
    assert.deepEqual(core.parseSettings(JSON.stringify(value)), value);
  });
}
for (const key of Object.keys(core.RANGES)) {
  test(`strict numeric validation: ${key}`, () => {
    const [min, max] = core.RANGES[key];
    for (const value of [null, '', '12oops', '12', false, {}, [], NaN, Infinity, min - 1, max + 1]) {
      assert.throws(() => core.validateSettings({...settings(), [key]: value}));
    }
    for (const value of [min, max]) assert.equal(core.validateSettings({...settings(), [key]: value})[key], value);
  });
}
test('rejects missing fields, unknown fields, arrays, versions and invalid strings', () => {
  for (const value of [null, [], {}, {...settings(), font: 'url(x)'}, {...settings(), text: '😀'.repeat(33)},
    {...settings(), preset: ['classic']}, {...settings(), seed: 1.9}, {...settings(), lines: .5},
    {...settings(), version: 2}, {...settings(), extra: 1}]) {
    assert.throws(() => core.validateSettings(value));
  }
  assert.throws(() => core.parseSettings('{'));
  assert.throws(() => core.parseSettings(' '.repeat(65537)));
  assert.throws(() => core.parseSettings('あ'.repeat(22000)));
});
test('legacy complete settings accepted; mismatched preset becomes custom without changing values', () => {
  const value = settings(); delete value.version;
  assert.equal(core.validateSettings(value).version, 1);
  const result = core.validateSettings({...value, noise: .17});
  assert.equal(result.noise, .17);
  assert.equal(result.preset, 'custom');
});
for (const [name, pixels, expected] of [
  ['white', [255, 255, 255, 255], [0, 0, 0, false]],
  ['black', [0, 0, 0, 0], [0, 0, 0, true]],
  ['checker', [0, 255, 255, 0], [2, 2, 2, false]],
  ['columns', [0, 255, 0, 255], [2, 2, 2, false]]
]) {
  test(`image statistics: ${name}`, () => {
    const data = new Uint8ClampedArray(pixels.flatMap(v => [v, v, v, 255]));
    const actual = core.analyzePixels(data, 2, 2);
    assert.deepEqual([actual.selected, actual.transitions, actual.runs, actual.inverted], expected);
    assert.equal(actual.occupancy, expected[0] / 4);
    assert.ok(!('HR' in actual) && !('BR' in actual));
  });
}
test('transparent pixels are composited on white; invalid dimensions rejected', () => {
  assert.equal(core.analyzePixels(new Uint8ClampedArray(4), 1, 1).mean, 255);
  assert.throws(() => core.analyzePixels([], 0, 1));
  assert.throws(() => core.analyzePixels([], 2, 2));
});
