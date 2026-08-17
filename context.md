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

The order of entries in `photos.js` is the gallery order. Keep a photograph's
stable `id` when replacing its file so existing `?photo=work-###` links remain
valid. Sensitivity accepts `none`, `review` or `sensitive`; both gated values
remain blurred until the visitor accepts the content notice.

## Replacing photographs

Published photographs are metadata-stripped WebPs with matching thumbnails.
When replacing one, update its semantic `filename`, `width` and `height` in
`js/photos.js`, regenerate its thumbnail, and update the preload in `index.html`
if it is the first photograph. Preserve the aspect ratio and remove private
EXIF and GPS metadata before publishing.

## GitHub Pages

Publish the `main` branch from the repository root with no build command. The
site entry point is `index.html`, and `404.html` provides the not-found page.
