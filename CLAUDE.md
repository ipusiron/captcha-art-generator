# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This educational application generates CAPTCHA-style distorted text images and reports image statistics.
It does not measure human readability, OCR accuracy or security strength, and is not production authentication.

## Architecture

The application is a standalone web application with no build process:
- **index.html**: Main HTML structure with control panels and canvas display
- **script.js**: Core rendering logic using HTML5 Canvas API for CAPTCHA generation
- **style.css**: Styling with CSS custom properties for dark/light theme support
- **js/art-core.js**: DOM-independent PRNG, complete settings validation and pixel statistics (classic script/CommonJS)
- **js/messages.js**, **js/i18n.js**: Japanese/English messages and language switching
- **js/preferences.js**: Apply a saved/system theme before styles; storage failure is nonfatal
- **test/**: Node built-in tests; no dependencies

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

- **Seeded PRNG**: Mode 2 uses independent Mulberry32 streams per stage, derived by XOR with fixed stage salts. Mode 1 shares a single stream for reproduction. Keep both formats stable.
- **Reproduction**: Requires the same settings, browser and font environment. Cross-platform pixel equality is not promised.
- **Offscreen buffers**: `buf1` (compositing) and `buf2` (text before warp) enable multi-pass rendering
- **DOM refs object**: Central registry (`refs`) for all UI element references

## Development Commands

```bash
# Local development
python -m http.server 8000
# Node.js 22 or later; no installation required
npm test
```

For deployment to GitHub Pages:
- Push a work branch, pass push and pull_request CI, then use a normal PR merge
- GitHub Pages automatically serves from root directory
- Demo: https://ipusiron.github.io/captcha-art-generator/

## Coding Conventions

- 2-space indentation, UTF-8 encoding
- JavaScript: camelCase identifiers, UPPER_SNAKE_CASE for constants
- CSS: kebab-case classes, use existing `// -----` section markers in script.js
- Avoid inline styles in HTML; keep CSS in style.css under relevant comment banners

## Key Technical Details

- **Statistics**: Weighted RGB brightness, mean-based threshold clamped to 60–180, invert mask above 55%, occupancy/transitions/runs.
- **Text**: Maximum 32 Unicode code points; punctuation is safe as Canvas text. Long text scales to fit.
- **Import**: Complete JSON up to 64 KiB, strict types/ranges, seed and lines integers; validate before confirmation and application.
- **Concurrency**: A revision counter prevents pending file reads from overwriting intervening input changes.
- **Export**: PNG 640×200; SVG wraps that raster PNG; JSON version 1 contains all settings including text and rendererVersion (1 or 2), but no theme/language or comparison. Missing rendererVersion means mode 1.
- **Blur**: Mode 2 range is 0–2. Mode 1 accepts 0–3, with identical processing at 2–3. Switching to mode 2 clamps above 2 with a visible notice.
- **Comparison**: One pinned canvas/settings/statistics snapshot in memory only. Empty/invalid input clears the current side, not the explicitly labelled reference. Clear-reference and reload discard it.
- **Mask**: Render the exact analyzePixels mask; black means selected. Never imply text segmentation or a readability/security rating.
- **Empty state**: Clear the output, seven stages and statistics; disable saves. Invalid seed has the same output behavior.
- **Security**: Local classic scripts support file://. No dependencies, external requests, inline handlers or permissive script CSP.
- **Theme system**: CSS custom properties in `:root` and `[data-theme="light"]`
- Five preset modes: Classic, Elastic, Grainy, Chaotic, Minimal
- Custom records individual changes; an imported preset label that disagrees with values becomes Custom without changing the values.
- Keep README.md and README.en.md headings, examples, limits and screenshots aligned.
