# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a CAPTCHA Art Generator - an educational web application that generates CAPTCHA-style distorted text images. It's designed to demonstrate the trade-off between human readability and bot resistance in CAPTCHA design.

## Architecture

The application is a standalone web application with no build process:
- **index.html**: Main HTML structure with control panels and canvas display
- **script.js**: Core rendering logic using HTML5 Canvas API for CAPTCHA generation
- **style.css**: Minimal CSS styling for the interface

Key rendering pipeline in script.js:
1. Background texture generation (paper grain/particles)
2. Text rendering with character-level transformations (rotation, spacing)
3. Sine wave warping applied to the canvas
4. Noise particle overlay
5. Crossing lines (straight/curved)
6. Final blur and contrast adjustments

The application uses a seeded PRNG (mulberry32) for reproducible results.

## Development Commands

This is a static website with no build tools. To run:
- Open `index.html` directly in a browser
- Or serve via any static web server (e.g., `python -m http.server`)

For deployment to GitHub Pages:
- Push changes to main branch
- GitHub Pages automatically serves from root directory
- Demo available at: https://ipusiron.github.io/captcha-art-generator/

## Key Technical Details

- Uses offscreen canvas buffers (buf1, buf2) for multi-pass rendering
- Implements custom readability scoring:
  - Human Readability (HR): Based on contrast and spacing heuristics
  - Bot Readability (BR): Simplified OCR difficulty estimation
- Supports multiple export formats: PNG, SVG (with embedded PNG), JSON parameters
- Five preset modes with different distortion characteristics: Classic, Elastic, Grainy, Chaotic, Minimal