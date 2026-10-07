/* =================================================
   CAPTCHA Art Generator - Educational Tool

   This application generates CAPTCHA-style distorted images
   to demonstrate the balance between human and machine readability.

   Key Features:
   - Reproducible generation using seeded PRNG
   - Multi-layer rendering pipeline (background, text, warp, noise, lines)
   - Real-time parameter adjustment with visual feedback
   - Export capabilities (PNG, SVG, JSON settings)
   - Readability metrics estimation (HR/BR)

   Architecture:
   - Pure client-side JavaScript with HTML5 Canvas
   - Consistent random sequence management for deterministic results
   - Modular rendering pipeline with separate processing steps
================================================= */

// ========================================
// THEME MANAGEMENT
// ========================================
// Handles light/dark theme switching with localStorage persistence
const themeToggle = document.getElementById('themeToggle');
const themeIcon = document.querySelector('.theme-icon');
const savedTheme = document.documentElement.dataset.theme || 'light';

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  try { localStorage.setItem('theme', theme); } catch { /* Keep working without storage. */ }
  themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
}

setTheme(savedTheme);

document.getElementById('helpToggle').addEventListener('click', event => {
  const open = document.documentElement.classList.toggle('show-help');
  event.currentTarget.setAttribute('aria-expanded', String(open));
});

themeToggle.addEventListener('click', () => {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'light' ? 'dark' : 'light';
  setTheme(newTheme);
});

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Sanitize text input to prevent XSS attacks
 * @param {string} input - Raw text input
 * @returns {string} Sanitized text
 */
function sanitizeText(input) {
  return ArtCore.normalizeText(input);
}

/**
 * Validate and sanitize numeric input
 * @param {any} input - Input value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {number} defaultValue - Default value if invalid
 * @returns {number} Validated number
 */
function sanitizeNumber(input, min, max, defaultValue) {
  const num = parseFloat(input);
  if (isNaN(num) || !isFinite(num)) return defaultValue;
  return clamp(num, min, max);
}

/**
 * Validate file type for JSON import
 * @param {File} file - File object to validate
 * @returns {boolean} True if valid JSON file
 */
function validateJSONFile(file) {
  if (!file) return false;

  // Check file type
  const validTypes = ['application/json', 'text/json'];
  if (!validTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.json')) {
    return false;
  }

  // Check file size (limit to 1MB)
  if (file.size > 1024 * 1024) {
    return false;
  }

  return true;
}
/**
 * Mulberry32 Pseudorandom Number Generator
 * Fast, high-quality PRNG with good statistical properties
 * @param {number} seed - Initial seed value (32-bit integer)
 * @returns {function} Function that returns random numbers [0, 1)
 */
function mulberry32(seed) {
  let t = seed >>> 0; // Ensure 32-bit unsigned integer
  return function() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
/** Clamp value between min and max bounds */
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

/** Linear interpolation between two values */
function lerp(a,b,t){ return a + (b-a)*t; }

/** Generate random number in range [a, b) using provided RNG */
function randRange(rng, a, b){ return lerp(a,b,rng()); }

// ========================================
// DOM ELEMENT REFERENCES
// ========================================
// Central registry of all UI elements for easy access
const refs = {
  text: document.getElementById('textInput'),
  font: document.getElementById('fontSelect'),
  preset: document.getElementById('presetSelect'),
  amp: document.getElementById('amp'),
  lambda: document.getElementById('lambda'),
  rotJ: document.getElementById('rotJitter'),
  spacing: document.getElementById('spacing'),
  noise: document.getElementById('noise'),
  lines: document.getElementById('lines'),
  blur: document.getElementById('blur'),
  contrast: document.getElementById('contrast'),
  colorVariation: document.getElementById('colorVariation'),
  seed: document.getElementById('seed'),

  // Background controls
  bgBrightness: document.getElementById('bgBrightness'),
  bgHue: document.getElementById('bgHue'),
  grainDensity: document.getElementById('grainDensity'),
  grainBrightness: document.getElementById('grainBrightness'),

  btnSeed: document.getElementById('btnRandomSeed'),
  btnGen: document.getElementById('btnGenerate'),
  btnPNG: document.getElementById('btnDownloadPNG'),
  btnSVG: document.getElementById('btnDownloadSVG'),
  btnParams: document.getElementById('btnDownloadParams'),
  btnLoadParams: document.getElementById('btnLoadParams'),
  fileInput: document.getElementById('fileInput'),

  canvas: document.getElementById('canvas'),
  hrBar: document.getElementById('hrBar'),
  brBar: document.getElementById('brBar'),
  hrVal: document.getElementById('hrVal'),
  brVal: document.getElementById('brVal'),

  // Layer preview canvases
  layer1: document.getElementById('layer1'),
  layer2: document.getElementById('layer2'),
  layer3: document.getElementById('layer3'),
  layer4: document.getElementById('layer4'),
  layer5: document.getElementById('layer5'),
  layer6: document.getElementById('layer6'),
  layer7: document.getElementById('layer7'),
};
const ctx = refs.canvas.getContext('2d', {willReadFrequently: true});

// Offscreen canvas buffers for multi-pass rendering
// buf1: Primary working buffer for compositing
// buf2: Secondary buffer for text rendering before warp
const buf1 = document.createElement('canvas');
const b1 = buf1.getContext('2d', {willReadFrequently: true});
const buf2 = document.createElement('canvas');
const b2 = buf2.getContext('2d', {willReadFrequently: true});

/**
 * Set canvas dimensions for all rendering surfaces
 * @param {number} w - Width in pixels (default: 640)
 * @param {number} h - Height in pixels (default: 200)
 */
function setCanvasSize(w=640,h=200){
  [refs.canvas, buf1, buf2].forEach(c=>{ c.width=w; c.height=h; });
}
setCanvasSize();

// ========================================
// LAYER PREVIEW FUNCTIONALITY
// ========================================
// Capture intermediate rendering results for step-by-step visualization

/**
 * Capture current buffer state to a layer preview canvas
 * @param {HTMLCanvasElement} sourceCanvas - Source canvas to capture from
 * @param {HTMLCanvasElement} targetCanvas - Target preview canvas
 */
function captureLayer(sourceCanvas, targetCanvas) {
  if (!sourceCanvas || !targetCanvas) return;

  const targetCtx = targetCanvas.getContext('2d', {willReadFrequently: true});
  const sourceW = sourceCanvas.width;
  const sourceH = sourceCanvas.height;
  const targetW = targetCanvas.width;
  const targetH = targetCanvas.height;

  // Clear target canvas
  targetCtx.clearRect(0, 0, targetW, targetH);

  // Calculate aspect-preserving scale
  const scaleX = targetW / sourceW;
  const scaleY = targetH / sourceH;
  const scale = Math.min(scaleX, scaleY);

  // Calculate centered position
  const scaledW = sourceW * scale;
  const scaledH = sourceH * scale;
  const offsetX = (targetW - scaledW) / 2;
  const offsetY = (targetH - scaledH) / 2;

  // Draw scaled image
  targetCtx.imageSmoothingEnabled = false; // Keep pixels crisp
  targetCtx.drawImage(sourceCanvas, offsetX, offsetY, scaledW, scaledH);
}

// ========================================
// PRESET CONFIGURATIONS
// ========================================
// Pre-defined parameter sets for different CAPTCHA styles
/**
 * Apply preset parameter configuration to UI controls
 * @param {string} name - Preset name (classic, elastic, grainy, chaotic, minimal)
 */
function applyPreset(name){
  const presets = {
    classic: { amp:12, lambda:80, rotJ:6, spacing:4, noise:0.2, lines:6, blur:0.5, contrast:0.9, colorVariation:0, bgBrightness:0.2, bgHue:240, grainDensity:0.3, grainBrightness:0.6 },
    elastic: { amp:22, lambda:60, rotJ:10, spacing:2, noise:0.15, lines:8, blur:0.8, contrast:0.85, colorVariation:0.3, bgBrightness:0.25, bgHue:200, grainDensity:0.4, grainBrightness:0.7 },
    grainy:  { amp:6,  lambda:120,rotJ:2, spacing:6, noise:0.35, lines:2, blur:0.4, contrast:0.75, colorVariation:0.1, bgBrightness:0.15, bgHue:30, grainDensity:0.8, grainBrightness:0.5 },
    chaotic: { amp:18, lambda:70, rotJ:14,spacing:0, noise:0.3,  lines:14, blur:1.0, contrast:0.8, colorVariation:0.6, bgBrightness:0.35, bgHue:300, grainDensity:0.6, grainBrightness:0.8 },
    minimal: { amp:2,  lambda:140,rotJ:0, spacing:6, noise:0.05, lines:0,  blur:0.0, contrast:1.0, colorVariation:0, bgBrightness:0.4, bgHue:180, grainDensity:0.1, grainBrightness:0.3 },
  };

  const preset = presets[name];
  if(!preset) return;

  // Apply all preset values to corresponding UI controls
  refs.amp.value = preset.amp;
  refs.lambda.value = preset.lambda;
  refs.rotJ.value = preset.rotJ;
  refs.spacing.value = preset.spacing;
  refs.noise.value = preset.noise;
  refs.lines.value = preset.lines;
  refs.blur.value = preset.blur;
  refs.contrast.value = preset.contrast;
  refs.colorVariation.value = preset.colorVariation;
  refs.bgBrightness.value = preset.bgBrightness;
  refs.bgHue.value = preset.bgHue;
  refs.grainDensity.value = preset.grainDensity;
  refs.grainBrightness.value = preset.grainBrightness;
}

// ========================================
// RENDERING PIPELINE
// ========================================
// Multi-stage image generation with consistent randomization

// Each render starts a fresh deterministic stream; no finite cache or wraparound.

/**
 * Main rendering function - generates CAPTCHA image through multi-stage pipeline
 * Stages: Background → Text → Warp → Noise → Lines → Blur → Contrast
 */
function render(){
  const W = refs.canvas.width, H = refs.canvas.height;
  const seed = Number(refs.seed.value);
  if (refs.seed.value.trim() === '' || !Number.isInteger(seed) || seed < 0 || seed > 1e9) {
    clearOutput();
    showStatus('invalidSeed');
    return;
  }
  const rng = ArtCore.mulberry32(seed);
  const text = sanitizeText(refs.text.value);
  refs.text.value = text;
  if (!text.trim()) {
    clearOutput();
    showStatus('empty');
    return;
  }
  showStatus('');
  refs.btnPNG.disabled = false;
  refs.btnSVG.disabled = false;
  refs.btnParams.disabled = false;

  // Validate and sanitize all numeric parameters
  const font = refs.font.value; // Select values are pre-validated by HTML
  const amp = sanitizeNumber(refs.amp.value, 0, 40, 12);
  const lambda = sanitizeNumber(refs.lambda.value, 20, 160, 80);
  const rotJ = sanitizeNumber(refs.rotJ.value, 0, 20, 6) * Math.PI/180;
  const spacing = sanitizeNumber(refs.spacing.value, -5, 20, 4);
  const noise = sanitizeNumber(refs.noise.value, 0, 1, 0.2);
  const lines = sanitizeNumber(refs.lines.value, 0, 20, 6);
  const blur = sanitizeNumber(refs.blur.value, 0, 3, 0.5);
  const contrast = sanitizeNumber(refs.contrast.value, 0.2, 1.2, 0.9);
  const colorVariation = sanitizeNumber(refs.colorVariation.value, 0, 1, 0);
  const bgBrightness = sanitizeNumber(refs.bgBrightness.value, 0, 1, 0.3);
  const bgHue = sanitizeNumber(refs.bgHue.value, 0, 360, 240);
  const grainDensity = sanitizeNumber(refs.grainDensity.value, 0, 1, 0.5);
  const grainBrightness = sanitizeNumber(refs.grainBrightness.value, 0, 1, 0.8);

  // ========================================
  // STAGE 1: BACKGROUND TEXTURE
  // ========================================
  // Create customizable background with grain texture
  b1.clearRect(0,0,W,H);

  // Generate background color from HSL parameters
  const bgL = Math.floor(bgBrightness * 100); // Lightness: 0-100%
  const bgS = 60; // Fixed saturation for consistent appearance
  b1.fillStyle = `hsl(${bgHue}, ${bgS}%, ${bgL}%)`;
  b1.fillRect(0,0,W,H);

  // Add customizable grain texture
  const grainCount = Math.floor(W*H*grainDensity*0.01); // Density: 0-1% of pixels
  for(let i=0;i<grainCount;i++){
    const x = Math.floor(rng()*W), y = Math.floor(rng()*H);
    const v = Math.floor(grainBrightness * 150 + rng() * (255 - grainBrightness * 150)); // Brightness controlled
    const size = Math.max(1, Math.floor(1 + rng()*2)); // Variable particle size (1-2px)
    const alpha = 0.3 + rng() * 0.4; // Semi-transparent particles
    b1.fillStyle = `rgba(${v},${v},${v},${alpha})`; // Grayscale particles
    b1.fillRect(x,y,size,size);
  }

  // Capture Stage 1: Background
  if(refs.layer1) captureLayer(buf1, refs.layer1);

  // ========================================
  // STAGE 2: TEXT RENDERING
  // ========================================
  // Render text with individual character transformations
  b2.clearRect(0,0,W,H);
  b2.save();
  b2.font = font;
  b2.textBaseline = 'middle';
  b2.textAlign = 'left';

  // Calculate text positioning for centering
  const metrics = b2.measureText(text);
  const chars = Array.from(text);
  const estCharW = Math.max(20, metrics.width / chars.length);
  const textWidth = estCharW * chars.length + spacing * (chars.length - 1);
  // Keep long input inside the drawing area; no promise of cross-font pixel identity.
  const fit = Math.min(1, (W - 2 * (amp + 30)) / Math.max(1, textWidth));
  const baseX = (W - textWidth * fit) / 2;
  const baseY = H/2 + 4; // Vertical center with slight offset

  // Calculate base text color based on contrast setting
  const baseFg = Math.floor(220*contrast); // Higher contrast = brighter text

  // Render each character with individual transformations
  for(let i=0;i<chars.length;i++){
    const ch = chars[i];
    const x = baseX + i*(estCharW + spacing)*fit;
    const rot = randRange(rng, -rotJ, rotJ); // Random rotation within jitter range

    // Color variation per character
    // CRITICAL: Always consume the same number of RNG values regardless of colorVariation
    // This ensures consistent layout when only color parameters change
    const colorRng1 = rng(); // Hue variation random value
    const colorRng2 = rng(); // Brightness variation random value

    // Start with base color
    let r = baseFg;
    let g = baseFg;
    let b = Math.min(255, Math.floor(240*contrast));

    // Apply color variation if enabled
    if(colorVariation > 0) {
      const hueShift = (colorRng1 - 0.5) * colorVariation * 120; // ±60 degree hue shift

      // Apply hue shift to RGB channels (simplified HSL conversion)
      r = clamp(baseFg + Math.floor(hueShift * 0.8), 0, 255);  // Red emphasis
      g = clamp(baseFg + Math.floor(hueShift * -0.3), 0, 255); // Green reduction
      b = clamp(Math.min(255, Math.floor(240*contrast)) + Math.floor(hueShift * 0.5), 0, 255); // Blue balance

      // Add brightness variation
      const brightness = 1 + (colorRng2 - 0.5) * colorVariation * 0.3; // ±15% brightness
      r = clamp(Math.floor(r * brightness), 0, 255);
      g = clamp(Math.floor(g * brightness), 0, 255);
      b = clamp(Math.floor(b * brightness), 0, 255);
    }

    // Draw character with calculated color and transformation
    b2.fillStyle = `rgb(${r},${g},${b})`;
    b2.save();
    b2.translate(x, baseY);
    b2.scale(fit, fit);
    b2.rotate(rot); // Apply rotation jitter
    b2.fillText(ch, 0, 0);
    b2.restore();
  }
  b2.restore();

  // Capture Stage 2: Text
  if(refs.layer2) captureLayer(buf2, refs.layer2);

  // ========================================
  // STAGE 3: SINE WAVE WARPING
  // ========================================
  // Apply two-axis sine wave distortion to the text
  const src = b2.getImageData(0,0,W,H);
  const dst = b1.getImageData(0,0,W,H);
  const sp = src.data, dp = dst.data;

  // Generate random phase offsets for sine waves
  const phaseX = rng()*Math.PI*2; // Horizontal wave phase
  const phaseY = rng()*Math.PI*2; // Vertical wave phase

  // Apply pixel-level warping transformation
  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      // Calculate source pixel coordinates with sine wave displacement
      const dx = Math.round(x + amp*Math.sin((2*Math.PI*y)/lambda + phaseX)); // Horizontal displacement
      const dy = Math.round(y + amp*Math.sin((2*Math.PI*x)/lambda + phaseY)); // Vertical displacement

      // Clamp source coordinates to image bounds
      const sx = clamp(dx,0,W-1), sy = clamp(dy,0,H-1);

      // Copy pixel data from source to destination
      const si = (sy*W + sx)*4; // Source pixel index (RGBA)
      const di = (y*W + x)*4;   // Destination pixel index
      const alpha = sp[si+3];

      if(alpha === 0){
        continue; // Preserve background when source pixel fully transparent
      }

      if(alpha === 255){
        dp[di]   = sp[si];
        dp[di+1] = sp[si+1];
        dp[di+2] = sp[si+2];
        dp[di+3] = 255;
        continue;
      }

      const a = alpha / 255;
      const invA = 1 - a;
      dp[di]   = Math.round(sp[si]   * a + dp[di]   * invA);
      dp[di+1] = Math.round(sp[si+1] * a + dp[di+1] * invA);
      dp[di+2] = Math.round(sp[si+2] * a + dp[di+2] * invA);
      dp[di+3] = Math.round(Math.min(255, alpha + dp[di+3] * invA));
    }
  }
  b1.putImageData(dst,0,0);

  // Capture Stage 3: Warp
  if(refs.layer3) captureLayer(buf1, refs.layer3);

  // ========================================
  // STAGE 4: NOISE OVERLAY
  // ========================================
  // Add salt-and-pepper noise to interfere with OCR
  // Add random noise particles across the image
  const nCount = Math.floor(W*H*noise*0.5); // Scale noise density by parameter
  for(let i=0;i<nCount;i++){
    const x = Math.floor(rng()*W), y = Math.floor(rng()*H);
    const val = rng() < 0.5 ? 230*contrast : 15; // Random bright or dark pixel
    b1.fillStyle = `rgba(${val},${val},${val},${0.5})`; // Semi-transparent
    b1.fillRect(x,y,1,1);
  }

  // Capture Stage 4: Noise
  if(refs.layer4) captureLayer(buf1, refs.layer4);

  // ========================================
  // STAGE 5: INTERFERENCE LINES
  // ========================================
  // Draw random lines across the image to obstruct text
  b1.save();
  b1.globalAlpha = 0.75; // Make lines semi-transparent

  for(let i=0;i<lines;i++){
    // Position line endpoints to avoid heavy clustering over text center
    // 40% in the upper region and 60% in the lower region.
    const y1 = rng()<0.4 ? randRange(rng,0, H*0.35) : randRange(rng,H*0.65, H);
    const y2 = rng()<0.4 ? randRange(rng,0, H*0.35) : randRange(rng,H*0.65, H);

    // Randomly choose between straight and curved lines
    const useCurve = rng() < 0.5;
    b1.lineWidth = randRange(rng, 0.6, 1.8); // Variable line thickness

    // Generate gray color with some variation
    const col = Math.floor(140 + rng()*60);
    b1.strokeStyle = `rgba(${col},${col},${col},0.6)`;

    // Draw the line
    b1.beginPath();
    b1.moveTo(randRange(rng,-20,40), y1); // Start slightly off-screen left

    if(useCurve){
      // Curved line with random control point
      const cx = randRange(rng, W*0.25, W*0.75); // Control point X
      const cy = randRange(rng, 0, H);            // Control point Y
      b1.quadraticCurveTo(cx, cy, W + randRange(rng, -40, 20), y2);
    } else {
      // Straight line
      b1.lineTo(W + randRange(rng, -40, 20), y2); // End slightly off-screen right
    }
    b1.stroke();
  }
  b1.restore();

  // Capture Stage 5: Lines
  if(refs.layer5) captureLayer(buf1, refs.layer5);

  // ========================================
  // STAGE 6: BLUR EFFECT
  // ========================================
  // Apply blur using downscale-upscale technique
  // Approximation by resampling, not a Gaussian blur radius.
  // Apply blur effect if blur parameter > 0
  if(blur > 0){
    // Use downscale-upscale technique for blur approximation
    // (True Gaussian blur would require complex convolution)
    const scale = clamp(1 - blur*0.15, 0.7, 1); // Calculate scale factor

    // Create temporary smaller canvas
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.floor(W*scale));
    tmp.height = Math.max(1, Math.floor(H*scale));
    const tctx = tmp.getContext('2d', {willReadFrequently: true});

    // Downscale image to temporary canvas
    tctx.drawImage(buf1, 0,0, W,H, 0,0, tmp.width, tmp.height);

    // Clear original and upscale back with smoothing
    b1.clearRect(0,0,W,H);
    b1.imageSmoothingEnabled = true; // Enable bilinear filtering
    b1.drawImage(tmp, 0,0, tmp.width, tmp.height, 0,0, W,H);
  }

  // Capture Stage 6: Blur
  if(refs.layer6) captureLayer(buf1, refs.layer6);

  // ========================================
  // STAGE 7: CONTRAST ADJUSTMENT
  // ========================================
  // Apply gamma correction for contrast control
  // Get image data for pixel-level processing
  const post = b1.getImageData(0,0,W,H);
  const p = post.data;
  const gamma = clamp(contrast, 0.4, 1.4); // Gamma value for contrast adjustment

  // Apply gamma correction to each RGB pixel
  for(let i=0;i<p.length;i+=4){
    p[i]   = clamp(Math.pow(p[i]/255, 1/gamma)*255, 0, 255);   // Red
    p[i+1] = clamp(Math.pow(p[i+1]/255, 1/gamma)*255, 0, 255); // Green
    p[i+2] = clamp(Math.pow(p[i+2]/255, 1/gamma)*255, 0, 255); // Blue
    // Alpha channel (i+3) unchanged
  }
  b1.putImageData(post,0,0);

  // Capture Stage 7: Final Result
  if(refs.layer7) captureLayer(buf1, refs.layer7);

  // ========================================
  // FINAL OUTPUT
  // ========================================
  // Copy final result to display canvas
  ctx.clearRect(0,0,W,H);
  ctx.drawImage(buf1,0,0);

  updateStatistics();
}

let statusKey = '';
function showStatus(key) {
  statusKey = key;
  const messages = {
    empty: '文字を入力してください。',
    invalidSeed: 'Seedは0〜1000000000の整数で入力してください。',
    invalidSettings: '設定を読み込めません。64 KiB以下の完全な設定JSONを選んでください。現在の設定は変更していません。',
    loaded: '設定を読み込みました。',
    cancelled: '読み込みを取り消しました。現在の設定は変更していません。'
  };
  document.getElementById('status').textContent = key ? messages[key] : '';
}

function clearOutput() {
  [refs.canvas, buf1, buf2, ...Array.from({length: 7}, (_, i) => refs['layer' + (i + 1)])].forEach(canvas => {
    canvas.getContext('2d', {willReadFrequently: true}).clearRect(0, 0, canvas.width, canvas.height);
  });
  ['occupancy', 'transitions', 'runs', 'threshold'].forEach(id => {
    document.getElementById(id + 'Val').textContent = '—';
  });
  document.getElementById('inversion').textContent = '';
  refs.btnPNG.disabled = true;
  refs.btnSVG.disabled = true;
  refs.btnParams.disabled = true;
}

function updateStatistics() {
  const stats = ArtCore.analyzePixels(ctx.getImageData(0, 0, refs.canvas.width, refs.canvas.height).data,
    refs.canvas.width, refs.canvas.height);
  document.getElementById('occupancyVal').textContent = (stats.occupancy * 100).toFixed(2) + '%';
  document.getElementById('transitionsVal').textContent = String(stats.transitions);
  document.getElementById('runsVal').textContent = String(stats.runs);
  document.getElementById('thresholdVal').textContent = stats.threshold.toFixed(2);
  document.getElementById('inversion').textContent = stats.inverted ? '明るい側を集計' : '暗い側を集計';
}

// ========================================
// EXPORT FUNCTIONALITY
// ========================================
/**
 * Generate timestamp string for unique filenames
 * @returns {string} Formatted timestamp (YYYYMMDD_HHMMSS)
 */
function getTimestamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
}

/**
 * Download current CAPTCHA as PNG image
 */
function downloadPNG(){
  const url = refs.canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = `captcha-art_${getTimestamp()}.png`;
  a.click();
}
/**
 * Download current CAPTCHA as SVG (with embedded PNG)
 * Creates an SVG wrapper around the PNG for scalability
 */
function downloadSVG(){
  const png = refs.canvas.toDataURL('image/png');
  const W = refs.canvas.width, H = refs.canvas.height;

  // Create SVG wrapper with embedded PNG data
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <image href="${png}" x="0" y="0" width="${W}" height="${H}" />
    </svg>`;

  const blob = new Blob([svg], {type:'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `captcha-art_${getTimestamp()}.svg`;
  a.click();
  URL.revokeObjectURL(url); // Clean up blob URL
}
// Export the same validated values that drive rendering.
const paramRefs = {
  amp: 'amp', lambda: 'lambda', rotJitterDeg: 'rotJ', spacing: 'spacing', noise: 'noise', lines: 'lines',
  blur: 'blur', contrast: 'contrast', colorVariation: 'colorVariation', bgBrightness: 'bgBrightness',
  bgHue: 'bgHue', grainDensity: 'grainDensity', grainBrightness: 'grainBrightness', seed: 'seed'
};
function currentSettings() {
  const value = {version: 1, text: refs.text.value, font: refs.font.value, preset: refs.preset.value};
  for (const [key, ref] of Object.entries(paramRefs)) value[key] = Number(refs[ref].value);
  return ArtCore.validateSettings(value);
}
function downloadParams() {
  const data = currentSettings();
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], {type: 'application/json'});
  downloadBlob(blob, 'captcha-art-params_' + getTimestamp() + '.json');
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function loadParams(params) {
  const value = ArtCore.validateSettings(params);
  refs.text.value = value.text;
  refs.font.value = value.font;
  refs.preset.value = value.preset;
  for (const [key, ref] of Object.entries(paramRefs)) refs[ref].value = value[key];
  render();
}

let revision = 0;
function invalidateImport() { revision++; }
async function handleFileLoad(event) {
  const file = event.target.files[0];
  const ticket = ++revision;
  if (!file) return;
  try {
    if (file.size > ArtCore.LIMIT_BYTES) throw new Error('invalidSettings');
    const value = ArtCore.parseSettings(await file.text());
    if (ticket !== revision) return;
    if (!confirm('現在の設定を、このファイルの設定に置き換えますか？')) {
      showStatus('cancelled');
      return;
    }
    loadParams(value);
    // Preserve empty/invalid input guidance when it applies.
    if (value.text.trim()) showStatus('loaded');
  } catch {
    if (ticket === revision) showStatus('invalidSettings');
  } finally {
    if (ticket === revision) refs.fileInput.value = '';
  }
}

// ========================================
// EVENT LISTENERS
// ========================================
refs.preset.addEventListener('change', () => {
  invalidateImport();
  if (refs.preset.value !== 'custom') {
    const values = ArtCore.preset(refs.preset.value);
    for (const [key, value] of Object.entries(values)) refs[paramRefs[key]].value = value;
  }
  render();
});
refs.btnSeed.addEventListener('click', () => {
  invalidateImport();
  refs.seed.value = Math.floor(Math.random() * 1e9);
  render();
});
refs.btnGen.addEventListener('click', () => { invalidateImport(); render(); });
refs.btnPNG.addEventListener('click', downloadPNG);
refs.btnSVG.addEventListener('click', downloadSVG);
refs.btnParams.addEventListener('click', downloadParams);
refs.btnLoadParams.addEventListener('click', () => { invalidateImport(); refs.fileInput.click(); });
refs.fileInput.addEventListener('change', handleFileLoad);
[refs.text, refs.font, ...Object.values(paramRefs).map(key => refs[key])].forEach(el => {
  el.addEventListener('input', () => {
    invalidateImport();
    if (el !== refs.text && el !== refs.font && el !== refs.seed) refs.preset.value = 'custom';
    render();
  });
});

// Use continuous range controls so all valid saved decimals round trip unchanged.
Object.values(paramRefs).forEach(key => {
  if (key !== 'seed' && key !== 'lines') refs[key].step = 'any';
});
applyPreset('classic');
render();
