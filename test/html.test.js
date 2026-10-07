const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync('index.html', 'utf8');
test('CSP restricts scripts and connections without ineffective header meta tags', () => {
  assert.match(html, /script-src 'self';/);
  assert.match(html, /style-src 'self';/);
  assert.match(html, /connect-src 'none';/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|frame-ancestors|X-Frame-Options|X-XSS-Protection|X-Content-Type-Options/);
  assert.doesNotMatch(html, /\son\w+\s*=|\sstyle\s*=/i);
  assert.match(html, /name="referrer" content="no-referrer"/);
});
test('all script sources are local classic scripts for file access', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)><\/script>/g)];
  assert.ok(scripts.length >= 3);
  for (const [, attributes] of scripts) {
    assert.match(attributes, /src="\.\//);
    assert.doesNotMatch(attributes, /type="module"/);
  }
});
test('statistics have no readability score, and help is keyboard accessible', () => {
  for (const id of ['occupancyVal', 'transitionsVal', 'runsVal', 'thresholdVal', 'status']) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /<button id="helpToggle"[^>]+aria-expanded="false"/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /hrVal|brVal|Human Readability|Bot Readability|help-icon/);
});
test('comparison and mask controls have semantic labels and mobile-safe structure', () => {
  assert.match(html, /<select id="rendererVersion">/);
  assert.match(html, /value="2"[^>]*selected/);
  for (const id of ['pinComparison', 'clearComparison']) assert.match(html, new RegExp('<button id="' + id + '"'));
  for (const id of ['maskCanvas', 'beforeCanvas', 'afterCanvas']) {
    assert.match(html, new RegExp('<canvas id="' + id + '"[^>]*data-i18n-aria=', 's'));
  }
  assert.match(html, /id="comparisonContent" hidden/);
  const css = fs.readFileSync('style.css', 'utf8');
  assert.match(css, /\.comparison-images[^}]+minmax\(0, 1fr\)/);
  assert.match(css, /\.comparison-table-wrap[^}]+overflow-x:auto/);
});
