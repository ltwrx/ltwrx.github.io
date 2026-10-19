# Lightworks ∙ Portfolio

A framework-free static portfolio hosted directly from the root of the
`ltwrx.github.io` repository. It uses only HTML, CSS, browser JavaScript and
local assets; no Node.js installation or build command is required.

## Local Preview

1. Open this repository in Visual Studio Code.
2. Install Microsoft's **Live Preview** extension if needed.
3. Open `index.html` and choose **Show Preview**.

Changes appear immediately after saving.

## Edit the portfolio

- Photographer biography, location, email and inquiry types: `js/site-config.js`
- Gallery order, stable IDs, dates, dimensions and sensitivity: `js/photos.js`
- Visual design: `css/styles.css`
- Gallery, lightbox and consent behavior: `js/script.js`
- Full-view photographs: `images/`
- Eagerly loaded 1050 px thumbnails: `images/thumbnails/`
- Interface icons: `icons/`

The order of entries in `photos.js` is the gallery order, which is independent
from each photograph's `id`. Every `id` is a random 6-digit numeric string
(e.g. `"482913"`), generated once when the photograph is added and never
reused; it is what generates shareable links (`?photo=<id>`), and it stays
fixed for that photograph even if the file is later replaced or moved to a
different position in the gallery. When adding a new photograph, generate a
fresh random 6-digit id that does not collide with any existing one.
To credit a model, add `"muse": "Name"` to a photograph's entry (or an array
of names for several people). The lightbox shows it as `MUSE: NAME` just before
the copyright line; photographs without the field show nothing.
Sensitivity accepts `none`, `review` or `sensitive`; both gated values remain
blurred until the visitor accepts the content notice. Gated photographs stay in
the lightbox sequence: they appear heavily blurred (from the thumbnail, never
the full file) with a "Sensitive work" button that opens the notice, and are
revealed in place once it is accepted.

## Analytics

GoatCounter counts page visits (script in `index.html`, pinned to `count.v5.js`
with a subresource-integrity hash) and a few events sent from `js/script.js` by
`track()`. Per photograph, keyed by file name without extension:
`photo-open/<file>` (gallery click), `photo-link/<file>` (arrived through a
shared `?photo=` link), `photo-view/<file>` (on screen for 1 s in the lightbox,
not counted while blurred), `photo-close/<file>` (lightbox closed on it) and
`photo-copy-link/<file>`. Only organic interest counts: the photograph a visitor
arrived at through a shared link gets no view or close event until they move
away from it (it is counted only as `photo-link`). For sensitive work, never per photograph:
`nsfw-prompt`, `nsfw-shown` and `nsfw-kept-hidden`. Events are counted once per
visitor session, count.js ignores localhost, and failures are swallowed so the
page never depends on the counter.

## Replacing photographs

Published photographs are metadata-stripped WebPs with matching thumbnails.
When replacing one, update its semantic `filename`, `width` and `height` in
`js/photos.js`, regenerate its thumbnail, and update the preload in
`index.html` if it is the first photograph. Preserve the aspect ratio and
remove private EXIF and GPS metadata before publishing. Keep the photograph's
existing `id` unchanged so its shareable link (`?photo=<id>`) stays valid.

## GitHub Pages

Publish the `main` branch from the repository root with no build command. The
site entry point is `index.html`, and `404.html` provides the not-found page.
