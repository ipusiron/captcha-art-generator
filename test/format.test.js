const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
test('source files remain readable and are not minified', () => {
  const files = ['script.js', 'style.css', 'index.html',
    ...['js', 'test'].flatMap(dir => fs.readdirSync(dir).filter(name => name.endsWith('.js')).map(name => dir + '/' + name))];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const limit = file.endsWith('.html') ? 250 : 160;
    assert.ok(lines.length >= 10, file);
    for (const [i, line] of lines.entries()) assert.ok(line.length <= limit, `${file}:${i + 1}: ${line.length}`);
  }
});
