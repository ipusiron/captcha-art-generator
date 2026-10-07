const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const css = fs.readFileSync('style.css', 'utf8');
const variables = block => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[\da-f]{6})/gi)].map(m => [m[1], m[2]]));
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
for (const [theme, block] of [['dark', css.match(/:root\{([^}]+)\}/)[1]],
  ['light', css.match(/\[data-theme="light"\]\{([^}]+)\}/)[1]]]) {
  test(`text contrast is at least 4.5:1: ${theme}`, () => {
    const v = variables(block);
    for (const [fg, bg] of [['text', 'bg'], ['text', 'panel'], ['text', 'input-bg'], ['text', 'input-hover'],
      ['muted', 'bg'], ['muted', 'panel'], ['muted', 'input-bg'], ['accent', 'panel'], ['button-text', 'accent']]) {
      const a = luminance(v[fg]), b = luminance(v[bg]);
      assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${theme}: ${fg}/${bg}`);
    }
  });
}
