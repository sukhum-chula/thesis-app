# User manual source

`../user-manual-th.pdf` (คู่มือการใช้งาน, Thai) is built from `manual-th.html`, a paged.js
document laid out for A4. Screenshots are in `img/`, numbered in the order they appear in the
HTML. `../screenshots/manual-*.webp` are WebP copies of the same shots; replace both when retaking one.

```bash
cd docs/manual
npm install          # pagedjs + playwright-core (separate from the app's dependencies)
npm run build        # writes ../user-manual-th.pdf
```

The build drives a locally installed Chrome (default `C:/Program Files/Google/Chrome/Application/chrome.exe`,
override with `CHROME_PATH`). It needs network access for the Sarabun font from Google Fonts.
After a build, check the page count it prints and look over the pages you changed, since a
taller screenshot can push a step onto its own page.

The manual describes workflow behavior (step order, checklists, which forms are uploaded where).
When a change to `AGENTS.md` changes what a user sees, update the manual and retake the affected
screenshots.
