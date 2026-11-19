// Generates the PWA / iPhone icons as PNGs with no dependencies.
// Run: npm run icons
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x2f, 0x5d, 0x50];
const BOOKS = [
  { x: 0.2, w: 0.14, top: 0.26, color: [0xf4, 0xe9, 0xd8] },
  { x: 0.36, w: 0.11, top: 0.2, color: [0xe0, 0xa0, 0x60] },
  { x: 0.49, w: 0.15, top: 0.3, color: [0xf4, 0xe9, 0xd8] },
];
const LEANING = { x: 0.66, w: 0.13, top: 0.24, color: [0xc9, 0x6b, 0x3a], angle: -0.28 };
const SHELF = { y: 0.78, h: 0.05, color: [0xf4, 0xe9, 0xd8] };

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, scale) {
  // scale < 1 shrinks the artwork towards the centre (maskable safe zone).
  const raw = Buffer.alloc(size * (size * 3 + 1));
  const s = (v) => 0.5 + (v - 0.5) * scale;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      let col = BG;
      const bottom = s(SHELF.y);
      for (const b of BOOKS) {
        if (u >= s(b.x) && u <= s(b.x + b.w) && v >= s(b.top) && v <= bottom) col = b.color;
        // spine band
        if (u >= s(b.x) && u <= s(b.x + b.w) && Math.abs(v - s(b.top + 0.1)) < 0.012 * scale) col = BG;
      }
      // Leaning book: rotate the point around the bottom-left corner of the book.
      const ox = s(LEANING.x),
        oy = bottom;
      const dx = u - ox,
        dy = v - oy;
      const cos = Math.cos(-LEANING.angle),
        sin = Math.sin(-LEANING.angle);
      const ru = dx * cos - dy * sin,
        rv = dx * sin + dy * cos;
      if (ru >= 0 && ru <= LEANING.w * scale && rv <= 0 && rv >= -(SHELF.y - LEANING.top) * scale) col = LEANING.color;
      if (v >= s(SHELF.y) && v <= s(SHELF.y + SHELF.h) && u >= s(0.14) && u <= s(0.86)) col = SHELF.color;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = col[0];
      raw[o + 1] = col[1];
      raw[o + 2] = col[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync('public/icon-192.png', png(192, 1));
writeFileSync('public/icon-512.png', png(512, 1));
writeFileSync('public/icon-maskable-512.png', png(512, 0.72));
writeFileSync('public/apple-touch-icon.png', png(180, 0.9));
console.log('Icons written to public/');
