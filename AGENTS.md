# Repository Guidelines

## Project Structure & Module Organization
- `index.html` hosts the canvas layout, preset controls, and asset links. Keep new UI fragments grouped under semantic sections (`<section>`, `<aside>`).
- Core rendering logic lives in `script.js`; use existing helper clusters (noise, distortion, export) as anchors when adding features. Extract shared utilities into local functions above their first call.
- Global styling sits in `style.css` with comment banners per feature; append new rules under the relevant banner to keep the cascade predictable.
- Place screenshots, reference art, and downloadable examples in `assets/`. Do not commit generated CAPTCHA outputs or large binaries.

## Build, Test, and Development Commands
- `python -m http.server 8000` — serves the repository root locally; refresh the browser to see changes.
- `npx serve --listen 4173` — mirrors GitHub Pages headers for cross-origin testing; install with `npm install -g serve` if not already available.
- `npx prettier --write index.html script.js style.css` — optional formatter to align spacing and quote style before opening a PR.

## Coding Style & Naming Conventions
- Use 2-space indentation and UTF-8 encoding across HTML, CSS, and JavaScript files.
- Favor descriptive camelCase for JavaScript identifiers (`drawWaveLayer`); reserve UPPER_SNAKE_CASE for shared configuration constants.
- Keep CSS classes in kebab-case (`captcha-preview-panel`) and avoid inline styles in HTML.
- Document new presets or control groups with concise comments mirroring the existing `// -----` section markers in `script.js`.

## Testing Guidelines
- Manual QA: run a local server, exercise each preset, and confirm HR/BR gauges update without console errors.
- Validate PNG/SVG downloads still succeed after changes and open correctly in common viewers.
- When altering layout or accessibility, verify keyboard-only interaction for sliders and buttons remains intact.

## Commit & Pull Request Guidelines
- Git history currently shows only `Initial commit`; adopt Conventional Commit prefixes (`feat:`, `fix:`, `docs:`) with succinct summaries moving forward.
- Reference issue numbers where applicable (e.g., `fix: adjust HR gauge (#12)`).
- Pull requests should outline the motivation, manual QA steps, and include before/after screenshots for visual changes.
- Request review once the branch is rebased on `main` and confirm the GitHub Pages demo still loads as expected.

## Security & Accessibility Notes
- Avoid introducing remote scripts; keep dependencies self-contained to prevent CSP regressions and mixed-content warnings.
- Preserve the Minimal preset as an accessible fallback and document any changes that affect screen-reader verbosity in the PR description.
