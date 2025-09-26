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
const savedTheme = localStorage.getItem('theme') || 'dark';

function setTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
}

setTheme(savedTheme);

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
  if (typeof input !== 'string') return '';

  // Remove potentially dangerous characters and limit length
  return input
    .replace(/[<>"'&]/g, '') // Remove HTML/JS injection characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, '') // Remove control characters
    .slice(0, 32) // Enforce maximum length
    .trim();
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
const ctx = refs.canvas.getContext('2d');

// Offscreen canvas buffers for multi-pass rendering
// buf1: Primary working buffer for compositing
// buf2: Secondary buffer for text rendering before warp
const buf1 = document.createElement('canvas');
const b1 = buf1.getContext('2d');
const buf2 = document.createElement('canvas');
const b2 = buf2.getContext('2d');

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

  const targetCtx = targetCanvas.getContext('2d');
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

// RNG sequence caching for deterministic results
// This ensures that changing non-layout parameters (color, contrast, blur)
// doesn't affect the positioning and distortion of text
let cachedRngSequence = null; // Pre-generated random number sequence
let cachedSeed = null;        // Last seed used for sequence generation

/**
 * Generate a sequence of random numbers for consistent rendering
 * @param {number} seed - Random seed value
 * @param {number} count - Number of random values to pre-generate
 * @returns {Array<number>} Array of random numbers [0, 1)
 */
function getRngSequence(seed, count) {
  const rng = mulberry32(seed);
  const sequence = [];
  for(let i = 0; i < count; i++) {
    sequence.push(rng());
  }
  return sequence;
}

/**
 * Main rendering function - generates CAPTCHA image through multi-stage pipeline
 * Stages: Background → Text → Warp → Noise → Lines → Blur → Contrast
 */
function render(){
  const W = refs.canvas.width, H = refs.canvas.height;
  const seed = parseInt(refs.seed.value || '0', 10) || 0;

  // Generate or use cached RNG sequence for consistent results
  const RNG_SEQUENCE_LENGTH = 10000; // Should be sufficient for all random operations
  if (seed !== cachedSeed) {
    cachedRngSequence = getRngSequence(seed, RNG_SEQUENCE_LENGTH);
    cachedSeed = seed;
  }

  // Create sequential RNG function that consumes pre-generated sequence
  let rngIndex = 0;
  const rng = () => {
    if (rngIndex >= cachedRngSequence.length) {
      console.warn('RNG sequence exhausted, cycling back to start');
      rngIndex = 0;
    }
    return cachedRngSequence[rngIndex++];
  };

  // Get and sanitize input parameters from UI controls
  const text = sanitizeText(refs.text.value);
  if(!text){
    ctx.clearRect(0,0,W,H);
    // Reset readability meters when no text
    setMeters(0, 0);
    return; // Exit early if no text to render
  }

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
  const estCharW = Math.max(20, (metrics.width / Math.max(1,text.length))); // Estimated character width
  const baseX = (W - (estCharW + spacing)*text.length)/2; // Horizontal center
  const baseY = H/2 + 4; // Vertical center with slight offset

  // Calculate base text color based on contrast setting
  const baseFg = Math.floor(220*contrast); // Higher contrast = brighter text

  // Render each character with individual transformations
  for(let i=0;i<text.length;i++){
    const ch = text[i];
    const x = baseX + i*(estCharW + spacing);
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
    // 40% chance to place in upper/lower regions, 60% chance anywhere
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
  // Canvas API has no direct blur; we can approximate with shadow or drawImage with small scale.
  // Apply blur effect if blur parameter > 0
  if(blur > 0){
    // Use downscale-upscale technique for blur approximation
    // (True Gaussian blur would require complex convolution)
    const scale = clamp(1 - blur*0.15, 0.7, 1); // Calculate scale factor

    // Create temporary smaller canvas
    const tmp = document.createElement('canvas');
    tmp.width = Math.max(1, Math.floor(W*scale));
    tmp.height = Math.max(1, Math.floor(H*scale));
    const tctx = tmp.getContext('2d');

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

  // Calculate and display readability metrics
  const {HR, BR} = estimateReadabilities(buf1);
  setMeters(HR, BR);
}

// ========================================
// READABILITY METRICS
// ========================================
// Estimate Human Readability (HR) and Bot Readability (BR) scores
/**
 * Estimate readability metrics for the generated CAPTCHA
 * @param {HTMLCanvasElement} canvas - Canvas containing the CAPTCHA image
 * @returns {Object} Object with HR (Human Readability) and BR (Bot Readability) scores
 */
function estimateReadabilities(canvas){
  // Validate canvas
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    return { HR: 0, BR: 0 };
  }

  const W = canvas.width, H = canvas.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { HR: 0, BR: 0 };

  const id = ctx.getImageData(0,0,W,H);
  const d = id.data;

  // Step 1: Calculate adaptive threshold for binarization
  // Convert to grayscale using luminance formula
  let sum=0;
  for(let i=0;i<d.length;i+=4){
    const g = 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; // Luminance
    sum += g;
  }
  const mean = sum / (d.length/4);
  const th = clamp(mean*0.85, 60, 180); // Adaptive threshold with bounds

  // Step 2: Binarize image and calculate statistics
  const totalPixels = W*H;
  const bin = new Uint8Array(totalPixels); // Binary image buffer
  let fg = 0; // Foreground pixel count

  for(let y=0;y<H;y++){
    for(let x=0;x<W;x++){
      const i = (y*W + x)*4;
      const g = 0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; // Grayscale value
      const v = g < th ? 1 : 0; // Assume dark foreground by default
      bin[y*W+x] = v;
      fg += v;
    }
  }

  // If majority of pixels classified as foreground, invert mask (bright text on dark background)
  if(fg > totalPixels * 0.55){
    for(let i=0;i<totalPixels;i++){
      bin[i] = 1 - bin[i];
    }
    fg = totalPixels - fg;
  }

  const occ = fg/totalPixels; // Foreground occupancy ratio

  // Step 3: Count transitions and horizontal runs using finalized mask
  let transitions = 0;
  let runs = 0;
  for(let y=0;y<H;y++){
    let prev = 0;
    let inRun = false;
    for(let x=0;x<W;x++){
      const idx = y*W + x;
      const v = bin[idx];
      if(x>0 && v !== prev) transitions++;
      if(v){
        if(!inRun){
          runs++;
          inRun = true;
        }
      } else if(inRun){
        inRun = false;
      }
      prev = v;
    }
  }

  // Step 4: Calculate readability scores (0-100)

  // Human Readability (HR) - penalizes excessive clutter
  const occHR = 100 * (1 - Math.abs(occ-0.18)/0.18); // Optimal occupancy ~18%
  const tranNorm = clamp(1 - (transitions/(W*H*0.12)), 0, 1); // Fewer transitions = better
  const runNorm = clamp(1 - (runs/(H*2.8)), 0, 1); // Fewer runs = less fragmentation

  let HR = clamp(0.5*occHR + 30*tranNorm + 20*runNorm, 0, 100);

  // Bot Readability (BR) - simplified OCR difficulty estimation
  const occBR = 100 * (1 - Math.abs(occ-0.12)/0.12); // Machines prefer ~12% occupancy
  const tranBR = clamp((transitions/(W*H*0.08)), 0, 1); // Too many transitions confuse OCR
  const brVal = clamp(0.6*occBR + 25*runNorm + 10*(1-tranBR), 0, 100);

  // Round to integers for display
  HR = Math.round(HR);
  const BR = Math.round(brVal);

  return { HR, BR };
}

/**
 * Update the readability meter displays
 * @param {number} HR - Human Readability score (0-100)
 * @param {number} BR - Bot Readability score (0-100)
 */
function setMeters(HR, BR){
  // Validate inputs
  if (typeof HR !== 'number' || typeof BR !== 'number' || isNaN(HR) || isNaN(BR)) {
    HR = 0; BR = 0;
  }

  // Ensure elements exist before updating
  if (refs.hrBar) refs.hrBar.style.width = `${HR}%`;
  if (refs.brBar) refs.brBar.style.width = `${BR}%`;
  if (refs.hrVal) refs.hrVal.textContent = `${HR}`;
  if (refs.brVal) refs.brVal.textContent = `${BR}`;
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
async function downloadParams(){
  // Sanitize all parameters before export
  const params = {
    text: sanitizeText(refs.text.value),
    font: refs.font.value,
    preset: refs.preset.value,
    amp: sanitizeNumber(refs.amp.value, 0, 40, 12),
    lambda: sanitizeNumber(refs.lambda.value, 20, 160, 80),
    rotJitterDeg: sanitizeNumber(refs.rotJ.value, 0, 20, 6),
    spacing: sanitizeNumber(refs.spacing.value, -5, 20, 4),
    noise: sanitizeNumber(refs.noise.value, 0, 1, 0.2),
    lines: sanitizeNumber(refs.lines.value, 0, 20, 6),
    blur: sanitizeNumber(refs.blur.value, 0, 3, 0.5),
    contrast: sanitizeNumber(refs.contrast.value, 0.2, 1.2, 0.9),
    colorVariation: sanitizeNumber(refs.colorVariation.value, 0, 1, 0),
    bgBrightness: sanitizeNumber(refs.bgBrightness.value, 0, 1, 0.3),
    bgHue: sanitizeNumber(refs.bgHue.value, 0, 360, 240),
    grainDensity: sanitizeNumber(refs.grainDensity.value, 0, 1, 0.5),
    grainBrightness: sanitizeNumber(refs.grainBrightness.value, 0, 1, 0.8),
    seed: sanitizeNumber(refs.seed.value, 0, 1e9, 12345),
    timestamp: new Date().toISOString()
  };

  const jsonContent = JSON.stringify(params, null, 2);
  const defaultFilename = `captcha-art-params_${getTimestamp()}.json`;

  // Try to use File System Access API if available (Chrome/Edge)
  if ('showSaveFilePicker' in window) {
    try {
      const fileHandle = await window.showSaveFilePicker({
        suggestedName: defaultFilename,
        types: [{
          description: 'JSON Files',
          accept: { 'application/json': ['.json'] }
        }]
      });
      const writableStream = await fileHandle.createWritable();
      await writableStream.write(jsonContent);
      await writableStream.close();
      return;
    } catch (err) {
      // User cancelled or API not supported, fall back to traditional download
      if (err.name === 'AbortError') {
        return; // User cancelled, do nothing
      }
    }
  }

  // Fallback: traditional download with prompt for filename
  let userFilename = prompt('ファイル名を入力してください:', defaultFilename);
  if (!userFilename) return; // User cancelled

  // Sanitize filename to prevent path traversal attacks
  userFilename = userFilename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 100);
  if (!userFilename) userFilename = defaultFilename;

  const blob = new Blob([jsonContent], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = userFilename.endsWith('.json') ? userFilename : `${userFilename}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ========================================
// PARAMETER IMPORT/EXPORT
// ========================================
/**
 * Load parameters from JSON object and apply to UI controls
 * @param {Object} params - Parameter object from JSON file
 */
function loadParams(params) {
  if (!params || typeof params !== 'object') return;

  // Validate and sanitize each parameter before applying
  if (params.text !== undefined) {
    refs.text.value = sanitizeText(params.text);
  }

  // Validate font selection against allowed values
  const validFonts = Array.from(refs.font.options).map(opt => opt.value);
  if (params.font !== undefined && validFonts.includes(params.font)) {
    refs.font.value = params.font;
  }

  // Validate preset selection
  const validPresets = Array.from(refs.preset.options).map(opt => opt.value);
  if (params.preset !== undefined && validPresets.includes(params.preset)) {
    refs.preset.value = params.preset;
  }

  // Sanitize numeric parameters with proper bounds
  if (params.amp !== undefined) {
    refs.amp.value = sanitizeNumber(params.amp, 0, 40, 12);
  }
  if (params.lambda !== undefined) {
    refs.lambda.value = sanitizeNumber(params.lambda, 20, 160, 80);
  }
  if (params.rotJitterDeg !== undefined) {
    refs.rotJ.value = sanitizeNumber(params.rotJitterDeg, 0, 20, 6);
  }
  if (params.spacing !== undefined) {
    refs.spacing.value = sanitizeNumber(params.spacing, -5, 20, 4);
  }
  if (params.noise !== undefined) {
    refs.noise.value = sanitizeNumber(params.noise, 0, 1, 0.2);
  }
  if (params.lines !== undefined) {
    refs.lines.value = sanitizeNumber(params.lines, 0, 20, 6);
  }
  if (params.blur !== undefined) {
    refs.blur.value = sanitizeNumber(params.blur, 0, 3, 0.5);
  }
  if (params.contrast !== undefined) {
    refs.contrast.value = sanitizeNumber(params.contrast, 0.2, 1.2, 0.9);
  }
  if (params.colorVariation !== undefined) {
    refs.colorVariation.value = sanitizeNumber(params.colorVariation, 0, 1, 0);
  }
  if (params.bgBrightness !== undefined) {
    refs.bgBrightness.value = sanitizeNumber(params.bgBrightness, 0, 1, 0.3);
  }
  if (params.bgHue !== undefined) {
    refs.bgHue.value = sanitizeNumber(params.bgHue, 0, 360, 240);
  }
  if (params.grainDensity !== undefined) {
    refs.grainDensity.value = sanitizeNumber(params.grainDensity, 0, 1, 0.5);
  }
  if (params.grainBrightness !== undefined) {
    refs.grainBrightness.value = sanitizeNumber(params.grainBrightness, 0, 1, 0.8);
  }
  if (params.seed !== undefined) {
    refs.seed.value = sanitizeNumber(params.seed, 0, 1e9, 12345);
  }

  // Regenerate image with loaded parameters
  render();
}

/**
 * Handle JSON file selection and loading
 * @param {Event} event - File input change event
 */
async function handleFileLoad(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Validate file before processing
  if (!validateJSONFile(file)) {
    alert('有効なJSONファイルを選択してください。');
    refs.fileInput.value = '';
    return;
  }

  try {
    const text = await file.text();

    // Limit file content size
    if (text.length > 100000) { // 100KB limit
      throw new Error('File too large');
    }

    const params = JSON.parse(text);

    // Additional validation of JSON structure
    if (!params || typeof params !== 'object') {
      throw new Error('Invalid JSON structure');
    }

    loadParams(params);

    // Clear file input to allow re-selecting the same file
    refs.fileInput.value = '';
  } catch (error) {
    alert('JSONファイルの読み込みに失敗しました。正しい形式のファイルか確認してください。');
    // Don't log detailed error information to console in production
    refs.fileInput.value = '';
  }
}

// ========================================
// EVENT LISTENERS
// ========================================
// Wire up all UI interactions
refs.preset.addEventListener('change', () => {
  applyPreset(refs.preset.value);
  render();
});

// Random seed generation
refs.btnSeed.addEventListener('click', () => {
  const newSeed = Math.floor(Math.random()*1e9);
  refs.seed.value = sanitizeNumber(newSeed, 0, 1e9, 12345);
  cachedSeed = null; // Force new RNG sequence generation
  render();
});
refs.btnGen.addEventListener('click', render);
refs.btnPNG.addEventListener('click', downloadPNG);
refs.btnSVG.addEventListener('click', downloadSVG);
refs.btnParams.addEventListener('click', downloadParams);
refs.btnLoadParams.addEventListener('click', () => refs.fileInput.click());
refs.fileInput.addEventListener('change', handleFileLoad);

// Live update for visual-only parameters (don't affect layout)
[refs.colorVariation, refs.contrast, refs.blur, refs.bgBrightness, refs.bgHue, refs.grainBrightness].forEach(el => {
  el.addEventListener('input', () => {
    render(); // No need to clear RNG cache
  });
});

// Grain density affects layout, so clear cache
[refs.grainDensity].forEach(el => {
  el.addEventListener('input', () => {
    cachedSeed = null; // Clear cache to regenerate layout
    render();
  });
});

// Live update for layout-affecting parameters
[refs.text, refs.font, refs.amp, refs.lambda, refs.rotJ, refs.spacing,
 refs.noise, refs.lines].forEach(el => {
  el.addEventListener('input', () => {
    cachedSeed = null; // Clear cache to regenerate layout
    render();
  });
});

// Seed changes always require cache clearing
refs.seed.addEventListener('input', () => {
  cachedSeed = null;
  render();
});

// ========================================
// INITIALIZATION
// ========================================
// Set up initial state and render first image

// Ensure DOM elements are available
if (!refs.hrBar || !refs.brBar || !refs.hrVal || !refs.brVal) {
  console.warn('Some readability meter elements not found');
}

applyPreset('classic'); // Load default preset
render();              // Generate initial CAPTCHA
