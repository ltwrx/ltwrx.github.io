// Lays the photographs listed in <body data-photos="04 02 …"> (gallery numbers)
// into masonry columns. Tall portraits are trimmed to 4:5 so every photograph
// keeps a fair share of the frame, and each column is centred vertically
// (with a small stagger) so the overflow is split between top and bottom.
(() => {
  const photos = window.PORTFOLIO_PHOTOS;
  const numbers = document.body.dataset.photos.trim().split(/\s+/).map(Number);
  const frame = { width: 1200, height: 630 };
  const columns = 5;
  const gap = 2;
  const stagger = [-28, -70, 70, 34, -4];
  const columnWidth = (frame.width - gap * (columns - 1)) / columns;
  const stacks = Array.from({ length: columns }, () => ({ height: 0, tiles: [] }));

  numbers.forEach((number) => {
    const photo = photos[number - 1];
    const stack = stacks.reduce((low, next) => (next.height < low.height ? next : low));
    const height = Math.min(columnWidth * (photo.height / photo.width), columnWidth * 1.25);
    stack.tiles.push({ photo, top: stack.height, height });
    stack.height += height + gap;
  });

  const stage = document.querySelector(".mosaic");
  stacks.forEach((stack, column) => {
    // A column too short to cover the frame is stretched (tiles crop a little
    // more), so no empty band shows at the top or bottom.
    const minimum = frame.height + 70;
    if (stack.height < minimum) {
      const scale = minimum / stack.height;
      stack.tiles.forEach((tile) => {
        tile.top *= scale;
        tile.height = (tile.height + gap) * scale - gap;
      });
      stack.height = minimum;
    }
    // Centre, apply the stagger, but never let the column leave an empty band.
    const centred = (frame.height - (stack.height - gap)) / 2 + stagger[column];
    const shift = Math.min(0, Math.max(frame.height - (stack.height - gap), centred));
    stack.tiles.forEach(({ photo, top, height }) => {
      const img = document.createElement("img");
      img.src = `../images/thumbnails/${photo.filename}`;
      Object.assign(img.style, {
        left: `${column * (columnWidth + gap)}px`,
        top: `${top + shift}px`,
        width: `${columnWidth}px`,
        height: `${height}px`,
      });
      stage.append(img);
    });
  });
})();
