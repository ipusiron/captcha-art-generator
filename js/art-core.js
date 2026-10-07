/* DOM-independent image statistics and settings; classic script + Node compatible. */
(function (root) {
  'use strict';
  const LIMIT_BYTES = 65536;
  const FONTS = [
    "bold 48px 'Segoe UI', Arial",
    "bold 48px 'Courier New', monospace",
    "italic 48px 'Times New Roman', serif",
    "600 48px 'Noto Sans JP', sans-serif"
  ];
  const PRESETS = {
    classic: [12, 80, 6, 4, .2, 6, .5, .9, 0, .2, 240, .3, .6],
    elastic: [22, 60, 10, 2, .15, 8, .8, .85, .3, .25, 200, .4, .7],
    grainy: [6, 120, 2, 6, .35, 2, .4, .75, .1, .15, 30, .8, .5],
    chaotic: [18, 70, 14, 0, .3, 14, 1, .8, .6, .35, 300, .6, .8],
    minimal: [2, 140, 0, 6, .05, 0, 0, 1, 0, .4, 180, .1, .3]
  };
  const RANGES = {
    amp: [0, 40], lambda: [20, 160], rotJitterDeg: [0, 20], spacing: [-5, 20],
    noise: [0, 1], lines: [0, 20], blur: [0, 3], contrast: [.2, 1.2],
    colorVariation: [0, 1], bgBrightness: [0, 1], bgHue: [0, 360],
    grainDensity: [0, 1], grainBrightness: [0, 1], seed: [0, 1e9]
  };
  const KEYS = Object.keys(RANGES);
  function preset(name) {
    if (!Object.hasOwn(PRESETS, name)) throw new Error('invalidSettings');
    return Object.fromEntries(KEYS.slice(0, -1).map((key, i) => [key, PRESETS[name][i]]));
  }
  function mulberry32(seed) {
    let state = seed >>> 0;
    return function () {
      state = (state + 0x6D2B79F5) >>> 0;
      let r = Math.imul(state ^ (state >>> 15), 1 | state);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normalizeText(text) {
    if (typeof text !== 'string') return '';
    // Canvas receives text, not HTML. Preserve punctuation and whole code points.
    return Array.from(text.replace(/[\x00-\x1f\x7f-\x9f]/g, '')).slice(0, 32).join('');
  }
  function validateSettings(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalidSettings');
    const allowed = [...KEYS, 'text', 'font', 'preset', 'timestamp', 'version'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new Error('invalidSettings');
    if (input.version !== undefined && input.version !== 1) throw new Error('invalidSettings');
    if (typeof input.text !== 'string' || input.text !== normalizeText(input.text)) throw new Error('invalidSettings');
    if (!FONTS.includes(input.font)) throw new Error('invalidSettings');
    if (typeof input.preset !== 'string' ||
        (input.preset !== 'custom' && !Object.hasOwn(PRESETS, input.preset))) throw new Error('invalidSettings');
    if (input.timestamp !== undefined && (typeof input.timestamp !== 'string' || !Number.isFinite(Date.parse(input.timestamp)))) {
      throw new Error('invalidSettings');
    }
    const result = {version: 1, text: input.text, font: input.font, preset: input.preset};
    for (const key of KEYS) {
      const value = input[key], [min, max] = RANGES[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error('invalidSettings');
      if (['lines', 'seed'].includes(key) && !Number.isInteger(value)) throw new Error('invalidSettings');
      result[key] = value;
    }
    // Preset is a label, not an instruction to overwrite the supplied values.
    if (result.preset !== 'custom') {
      const expected = preset(result.preset);
      if (Object.keys(expected).some(key => result[key] !== expected[key])) result.preset = 'custom';
    }
    return result;
  }
  function parseSettings(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMIT_BYTES) throw new Error('invalidSettings');
    return validateSettings(JSON.parse(text));
  }
  function analyzePixels(data, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        !data || data.length !== width * height * 4) throw new Error('invalidPixels');
    const total = width * height, gray = new Float64Array(total);
    let sum = 0;
    for (let j = 0; j < total; j++) {
      const i = j * 4, alpha = data[i + 3] / 255;
      gray[j] = (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) * alpha + 255 * (1 - alpha);
      sum += gray[j];
    }
    const mean = sum / total, threshold = Math.max(60, Math.min(180, mean * .85));
    const mask = Uint8Array.from(gray, value => value < threshold ? 1 : 0);
    let selected = mask.reduce((sum, value) => sum + value, 0);
    const inverted = selected > total * .55;
    if (inverted) {
      for (let i = 0; i < total; i++) mask[i] = 1 - mask[i];
      selected = total - selected;
    }
    let transitions = 0, runs = 0;
    for (let y = 0; y < height; y++) {
      let previous = 0;
      for (let x = 0; x < width; x++) {
        const value = mask[y * width + x];
        if (x > 0 && value !== previous) transitions++;
        if (value && !previous) runs++;
        previous = value;
      }
    }
    return {mean, threshold, inverted, selected, total, occupancy: selected / total, transitions, runs};
  }
  const api = {LIMIT_BYTES, FONTS, PRESETS, RANGES, preset, mulberry32, normalizeText, validateSettings, parseSettings, analyzePixels};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ArtCore = api;
})(globalThis);
