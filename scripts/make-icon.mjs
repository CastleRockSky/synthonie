// Draws the app icon (a big knob on a dark tile, like the 🎛️ in the top bar) and writes
// build/icon.png (512 px) and build/icon.ico (16 to 256 px) with nothing but Node, so
// the icon can be tweaked here and regenerated with `npm run icon`.

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'build');

// Colours from src/styles.css so the icon matches the app.
const TILE_TOP = [0x2b, 0x30, 0x40];
const TILE_BOTTOM = [0x16, 0x19, 0x21];
const RIM = [0x3a, 0x40, 0x50];
const FACE_TOP = [0x4a, 0x51, 0x63];
const FACE_BOTTOM = [0x26, 0x2a, 0x35];
const POINTER = [0x5e, 0xc8, 0xff]; // --accent
const TICK_ON = [0x6f, 0xcf, 0x97]; // --scene
const TICK_OFF = [0x8d, 0x93, 0xa5]; // --muted
const POINTER_ANGLE = -45; // degrees clockwise from 12 o'clock
const TICK_ANGLES = Array.from({ length: 11 }, (_, i) => -135 + i * 27);

/** Everything is drawn in a 512-unit space and scaled to the requested size. */
function scene(size) {
  const s = size / 512;
  const shapes = [];
  const polar = (angleDeg, radius) => {
    const a = (angleDeg * Math.PI) / 180;
    return [256 + Math.sin(a) * radius, 256 - Math.cos(a) * radius];
  };

  shapes.push({ type: 'roundRect', x0: 16, y0: 16, x1: 496, y1: 496, r: 112, colorAt: (y) => lerp(TILE_TOP, TILE_BOTTOM, (y - 16) / 480) });
  shapes.push({ type: 'circle', cx: 256, cy: 256, r: 150, colorAt: () => RIM });
  shapes.push({ type: 'circle', cx: 256, cy: 256, r: 134, colorAt: (y) => lerp(FACE_TOP, FACE_BOTTOM, (y - 122) / 268) });
  for (const angle of TICK_ANGLES) {
    const [cx, cy] = polar(angle, 198);
    shapes.push({ type: 'circle', cx, cy, r: 12, colorAt: () => (angle <= POINTER_ANGLE ? TICK_ON : TICK_OFF) });
  }
  const [px0, py0] = polar(POINTER_ANGLE, 26);
  const [px1, py1] = polar(POINTER_ANGLE, 104);
  shapes.push({ type: 'segment', x0: px0, y0: py0, x1: px1, y1: py1, hw: 14, colorAt: () => POINTER });

  // Scale to pixels.
  for (const sh of shapes) {
    for (const k of ['x0', 'y0', 'x1', 'y1', 'r', 'cx', 'cy', 'hw']) if (k in sh) sh[k] *= s;
    const colorAt = sh.colorAt;
    sh.colorAt = (y) => colorAt(y / s);
  }
  return shapes;
}

function lerp(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  return a.map((v, i) => v + (b[i] - v) * t);
}

function inside(sh, x, y) {
  switch (sh.type) {
    case 'circle':
      return (x - sh.cx) ** 2 + (y - sh.cy) ** 2 <= sh.r ** 2;
    case 'roundRect': {
      if (x < sh.x0 || x > sh.x1 || y < sh.y0 || y > sh.y1) return false;
      const qx = Math.max(sh.x0 + sh.r - x, 0, x - (sh.x1 - sh.r));
      const qy = Math.max(sh.y0 + sh.r - y, 0, y - (sh.y1 - sh.r));
      return qx * qx + qy * qy <= sh.r * sh.r;
    }
    case 'segment': {
      const dx = sh.x1 - sh.x0;
      const dy = sh.y1 - sh.y0;
      const t = Math.max(0, Math.min(1, ((x - sh.x0) * dx + (y - sh.y0) * dy) / (dx * dx + dy * dy)));
      return (x - (sh.x0 + t * dx)) ** 2 + (y - (sh.y0 + t * dy)) ** 2 <= sh.hw * sh.hw;
    }
  }
  return false;
}

/** Renders RGBA pixels with 4x4 supersampling for smooth edges. */
function render(size) {
  const shapes = scene(size);
  const px = new Uint8Array(size * size * 4);
  const SS = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          // Topmost shape wins at each sample point.
          for (let i = shapes.length - 1; i >= 0; i--) {
            if (inside(shapes[i], fx, fy)) {
              const [cr, cg, cb] = shapes[i].colorAt(fy);
              r += cr;
              g += cg;
              b += cb;
              hits++;
              break;
            }
          }
        }
      }
      const o = (y * size + x) * 4;
      // Average colour over covered samples only, so edges do not darken.
      const n = hits || 1;
      px[o] = Math.round(r / n);
      px[o + 1] = Math.round(g / n);
      px[o + 2] = Math.round(b / n);
      px[o + 3] = Math.round((hits / (SS * SS)) * 255);
    }
  }
  return px;
}

// ---- PNG ----
const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}
function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0; // filter: none
    raw.set(px.subarray(y * size * 4, (y + 1) * size * 4), y * stride + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- ICO ----
// Sizes under 256 are stored as classic 32-bit bitmaps (what every Windows version
// expects); 256 is stored as PNG, which is the convention for the large entry.
function dib(size, px) {
  const maskStride = Math.ceil(size / 32) * 4; // 1-bit AND mask rows, padded to 4 bytes
  const header = Buffer.alloc(40);
  header.writeUInt32LE(40, 0);
  header.writeInt32LE(size, 4);
  header.writeInt32LE(size * 2, 8); // height counts the AND mask too
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(32, 14);
  header.writeUInt32LE(size * size * 4 + maskStride * size, 20);
  const pixels = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    const src = (size - 1 - y) * size * 4; // rows are stored bottom-up
    for (let x = 0; x < size; x++) {
      const i = src + x * 4;
      const o = (y * size + x) * 4;
      pixels[o] = px[i + 2]; // BGRA
      pixels[o + 1] = px[i + 1];
      pixels[o + 2] = px[i];
      pixels[o + 3] = px[i + 3];
    }
  }
  return Buffer.concat([header, pixels, Buffer.alloc(maskStride * size)]);
}
function ico(images) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(1, 2);
  dir.writeUInt16LE(images.length, 4);
  const entries = [];
  const blobs = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e[0] = size === 256 ? 0 : size; // 0 means 256
    e[1] = size === 256 ? 0 : size;
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
    blobs.push(data);
  }
  return Buffer.concat([dir, ...entries, ...blobs]);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, 'icon.png'), png(512, render(512)));
const images = [16, 24, 32, 48, 64, 128, 256].map((size) => {
  const px = render(size);
  return { size, data: size === 256 ? png(size, px) : dib(size, px) };
});
writeFileSync(path.join(outDir, 'icon.ico'), ico(images));
console.log('Wrote ' + path.join(outDir, 'icon.png') + ' and icon.ico');
