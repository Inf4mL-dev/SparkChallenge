# Fonts: Kawak

Put the Kawak files in this folder (next to `css/`, `js/` and `index.html`), named exactly:

| File | Weight |
| --- | --- |
| `Kawak-Regular.woff2` | 400, body text |
| `Kawak-Medium.woff2` | 500 |
| `Kawak-Semibold.woff2` | 600, buttons and labels |
| `Kawak-Bold.woff2` | 700, headings (800 falls back to this) |

`.woff` copies with the same names also work as a fallback. If you only have `.ttf` or `.otf`, convert them to `.woff2` first (for example with https://cloudconvert.com or `fonttools`). Check your Kawak licence allows web use.

The rules are in `css/base.css` (`@font-face` at the top, then `body`). Missing files do no harm: the app falls back to the system font. To use different file names or weights, edit those four `@font-face` lines.
