#!/usr/bin/env node
/**
 * Generate the extension icons with zero dependencies.
 *
 * Draws the brand mark directly into RGBA pixel buffers and encodes them as
 * PNG (zlib + CRC32 are in the Node standard library). The motif is three
 * "words" where the leading part is bold white and the rest is the accent
 * colour — the product's idea rendered as an icon.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "..", "assets", "icons");

const INK = [0x14, 0x16, 0x1a, 0xff];
const HEAD = [0xff, 0xff, 0xff, 0xff];
const TAIL = [0x8b, 0x8c, 0xf7, 0xff];
const CLEAR = [0x00, 0x00, 0x00, 0x00];

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function set(rgba, size, x, y, color) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (y * size + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

function insideRounded(x, y, size, radius) {
  const r = radius;
  const cx = Math.min(Math.max(x, r), size - 1 - r);
  const cy = Math.min(Math.max(y, r), size - 1 - r);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r + 0.5;
}

function fillRect(rgba, size, x0, y0, x1, y1, color) {
  for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) set(rgba, size, x, y, color);
  }
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.max(2, Math.round(size * 0.22));
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (insideRounded(x, y, size, radius)) set(rgba, size, x, y, INK);
    }
  }
  const rows = size >= 48 ? 3 : 2;
  const marginX = size * 0.2;
  const usable = size - marginX * 2;
  const barH = Math.max(1, Math.round(size * 0.075));
  const gap = Math.max(1, Math.round(size * 0.11));
  const blockH = rows * barH + (rows - 1) * gap;
  let y = (size - blockH) / 2;
  for (let r = 0; r < rows; r += 1) {
    const full = usable * (r === 1 ? 1 : 0.82);
    const headW = full * 0.46;
    fillRect(rgba, size, marginX, y, marginX + headW, y + barH, HEAD);
    fillRect(rgba, size, marginX + headW, y, marginX + full, y + barH, TAIL);
    y += barH + gap;
  }
  return rgba;
}

mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = encodePng(size, size, draw(size));
  const file = join(OUT, `icon${size}.png`);
  writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
