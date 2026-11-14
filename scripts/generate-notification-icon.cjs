// Builds the Android status-bar notification icon from the splash artwork.
// Android renders that icon as a single-color silhouette from its alpha
// channel, so the dark coin becomes opaque white and the white engraving
// becomes transparent cut-outs. Usage: node scripts/generate-notification-icon.cjs
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

const SOURCE = path.join(
  __dirname,
  "../assets/icons-android/splash-icon-light.png",
);
const TARGET = path.join(
  __dirname,
  "../assets/icons-android/notification-icon.png",
);
const SIZE = 96; // xxxhdpi; expo-notifications derives the other densities.
const PADDING = 0.06; // Android keyline: keep the mark inside the safe area.

const source = PNG.sync.read(fs.readFileSync(SOURCE));
const darkness = (x, y) => {
  const i = (source.width * y + x) * 4;
  const alpha = source.data[i + 3] / 255;
  const luminance =
    (0.2126 * source.data[i] +
      0.7152 * source.data[i + 1] +
      0.0722 * source.data[i + 2]) /
    255;
  return (1 - luminance) * alpha;
};

// Bounding box of the dark coin.
let minX = source.width,
  minY = source.height,
  maxX = 0,
  maxY = 0;
for (let y = 0; y < source.height; y++)
  for (let x = 0; x < source.width; x++)
    if (darkness(x, y) > 0.5) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
const side = Math.max(maxX - minX, maxY - minY) + 1;
const centerX = (minX + maxX) / 2;
const centerY = (minY + maxY) / 2;
const span = side / (1 - 2 * PADDING);

// Box-filter downsample: each target pixel averages its source area.
const target = new PNG({ width: SIZE, height: SIZE });
const scale = span / SIZE;
for (let ty = 0; ty < SIZE; ty++)
  for (let tx = 0; tx < SIZE; tx++) {
    const x0 = centerX - span / 2 + tx * scale;
    const y0 = centerY - span / 2 + ty * scale;
    let total = 0;
    let count = 0;
    for (let y = Math.floor(y0); y < Math.ceil(y0 + scale); y++)
      for (let x = Math.floor(x0); x < Math.ceil(x0 + scale); x++) {
        count++;
        if (x >= 0 && y >= 0 && x < source.width && y < source.height)
          total += darkness(x, y);
      }
    const i = (SIZE * ty + tx) * 4;
    target.data[i] = 255;
    target.data[i + 1] = 255;
    target.data[i + 2] = 255;
    target.data[i + 3] = Math.round((total / count) * 255);
  }

fs.writeFileSync(TARGET, PNG.sync.write(target));
console.log(`Wrote ${path.relative(process.cwd(), TARGET)} (${SIZE}x${SIZE}).`);
