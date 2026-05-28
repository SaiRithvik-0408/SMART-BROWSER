// Generate icon assets for SmartBrowser from a single source PNG.
//
// Inputs:  the raw AI-generated icon (any aspect ratio, any size).
// Outputs: build/icon.png   - square 512x512 (used by electron-builder + main.js)
//          build/icon.ico   - multi-resolution Windows ICO (16/32/48/64/128/256)
//          build/icon-256.png, icon-128.png ... - explicit sizes for NSIS / shortcuts
//
// Run once via `node scripts/build-icons.js`. The outputs are committed so
// CI doesn't need sharp/png-to-ico installed at build time.

const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
// png-to-ico exports default for ESM and a function for CommonJS — handle both.
const pngToIcoMod = require('png-to-ico');
const pngToIco = typeof pngToIcoMod === 'function' ? pngToIcoMod : pngToIcoMod.default;

const SRC = process.argv[2] || path.join(__dirname, '..', 'assets', 'smartbrowser-icon-src.png');
const OUT = path.join(__dirname, '..', 'build');

const SIZES = [16, 24, 32, 48, 64, 128, 256, 512];

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('Source image not found:', SRC);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  // Center-crop to square. Use the shorter side as the square edge so we
  // don't lose the central composition (the SB shield is centered).
  const meta = await sharp(SRC).metadata();
  const edge = Math.min(meta.width, meta.height);
  const left = Math.floor((meta.width  - edge) / 2);
  const top  = Math.floor((meta.height - edge) / 2);
  const squareBuf = await sharp(SRC)
    .extract({ left, top, width: edge, height: edge })
    .toBuffer();

  // Emit all the explicit sizes as PNG. 512 is the canonical icon.png.
  const pngBuffers = [];
  for (const size of SIZES) {
    const buf = await sharp(squareBuf)
      .resize(size, size, { fit: 'cover' })
      .png({ compressionLevel: 9 })
      .toBuffer();
    if (size === 512) fs.writeFileSync(path.join(OUT, 'icon.png'), buf);
    if ([128, 256, 512].includes(size)) {
      fs.writeFileSync(path.join(OUT, `icon-${size}.png`), buf);
    }
    pngBuffers.push(buf);
  }

  // Multi-resolution ICO. png-to-ico packs each input PNG as one entry so
  // Windows can pick whichever fits the display context (taskbar / file
  // properties / start menu).
  const ico = await pngToIco(pngBuffers.filter((_, i) => SIZES[i] <= 256));
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico);

  console.log('Wrote:');
  console.log('  ', path.join(OUT, 'icon.png'),  '(512x512)');
  console.log('  ', path.join(OUT, 'icon.ico'),  '(multi-res, 16..256)');
  console.log('  ', path.join(OUT, 'icon-128.png'), path.join(OUT, 'icon-256.png'));
}

main().catch((e) => { console.error(e); process.exit(1); });
