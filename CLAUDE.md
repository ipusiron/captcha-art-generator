# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CAPTCHA Art Generator - an educational web application that generates CAPTCHA-style distorted text images. It's designed to demonstrate the trade-off between human readability and bot resistance in CAPTCHA design.

## Architecture

The application is a standalone web application with no build process:
- **index.html**: Main HTML structure with control panels and canvas display
- **script.js**: Core rendering logic using HTML5 Canvas API for CAPTCHA generation
- **style.css**: Styling with CSS custom properties for dark/light theme support

### Rendering Pipeline (script.js)

The `render()` function executes a 7-stage pipeline, with each stage captured to layer preview canvases:

1. **Background texture** - HSL-based background with grain particles (grainDensity, grainBrightness)
2. **Text rendering** - Character-by-character with rotation jitter and color variation
3. **Sine wave warping** - Two-axis displacement using `phaseX`/`phaseY` offsets
4. **Noise overlay** - Salt-and-pepper particles scaled by noise parameter
5. **Interference lines** - Random straight/curved lines with weighted Y positioning
6. **Blur effect** - Downscale-upscale approximation technique
7. **Contrast adjustment** - Gamma correction applied to RGB channels

### Key Architecture Patterns

- **Seeded PRNG**: Uses mulberry32 for reproducible randomization. The `cachedRngSequence` array ensures layout-affecting parameters consume the same random values regardless of color/contrast changes.
- **Offscreen buffers**: `buf1` (compositing) and `buf2` (text before warp) enable multi-pass rendering
- **DOM refs object**: Central registry (`refs`) for all UI element references

## Development Commands

```bash
# Local development
python -m http.server 8000
# Alternative with proper headers for testing
npx serve --listen 4173

# Optional formatting before commits
npx prettier --write index.html script.js style.css
```

For deployment to GitHub Pages:
- Push changes to main branch
- GitHub Pages automatically serves from root directory
- Demo: https://ipusiron.github.io/captcha-art-generator/

## Coding Conventions

- 2-space indentation, UTF-8 encoding
- JavaScript: camelCase identifiers, UPPER_SNAKE_CASE for constants
- CSS: kebab-case classes, use existing `// -----` section markers in script.js
- Avoid inline styles in HTML; keep CSS in style.css under relevant comment banners

## Key Technical Details

- **Readability metrics** (`estimateReadabilities`): Uses adaptive binarization threshold and counts transitions/runs for HR/BR scoring
- **Input sanitization**: `sanitizeText()` strips dangerous characters, `sanitizeNumber()` clamps values
- **Export formats**: PNG (native), SVG (wrapper with embedded PNG), JSON (all parameters with timestamp)
- **Theme system**: CSS custom properties in `:root` and `[data-theme="light"]`
- Five preset modes: Classic, Elastic, Grainy, Chaotic, Minimal