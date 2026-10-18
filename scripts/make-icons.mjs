#!/usr/bin/env node
/**
 * Generate the extension icons with zero dependencies.
 *
 * Draws the brand mark directly into RGBA pixel buffers and encodes them as
 * PNG (zlib + CRC32 are in the Node standard library). The mark is the one
 * the site uses for Bionic Docs: a teal tile holding a white page with one full
 * line of text and one faded line. It deliberately differs from Bionic Page's
 * ink tile with emphasized bars, so the two extensions are told apart in the
 * toolbar.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "..", "assets", "icons");

// The site's mark is drawn on a 32-unit grid (site/index.html favicon).
const GRID = 32;
const TILE = [0x0e, 0x6e, 0x63];
const PAPER = [0xff, 0xff, 0xff];
const TILE_RADIUS = 7;
const STROKE = 2.2;
const FADED = 0.45;

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

/** Points along a quarter arc, for flattening the page's rounded corners. */
function arc(cx, cy, r, from, to, steps = 8) {
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = from + ((to - from) * i) / steps;
    points.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return points;
}

// The page outline, offset by the mark's translate(5 4): flat left edge,
// rounded right-hand corners.
const PAGE = [
  [7, 7.4],
  [19.6, 7.4],
  ...arc(19.6, 9.4, 2, -Math.PI / 2, 0),
  [21.6, 24],
  ...arc(19.6, 24, 2, 0, Math.PI / 2),
  [7, 26],
  [7, 7.4],
];
const LINE_FULL = [
  [9.6, 12.2],
  [18.6, 12.2],
];
const LINE_FADED = [
  [9.6, 16.4],
  [15, 16.4],
];

function segmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function nearPolyline(px, py, points, half) {
  for (let i = 1; i < points.length; i += 1) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    if (segmentDistance(px, py, ax, ay, bx, by) <= half) return true;
  }
  return false;
}

function insideTile(px, py) {
  const r = TILE_RADIUS;
  const cx = Math.min(Math.max(px, r), GRID - r);
  const cy = Math.min(Math.max(py, r), GRID - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** Colour and alpha of one point of the mark, in grid units. */
function shade(px, py, half) {
  if (!insideTile(px, py)) return null;
  if (nearPolyline(px, py, PAGE, half) || nearPolyline(px, py, LINE_FULL, half)) return { color: PAPER, mix: 1 };
  if (nearPolyline(px, py, LINE_FADED, half)) return { color: PAPER, mix: FADED };
  return { color: TILE, mix: 0 };
}

function draw(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const unit = GRID / size;
  // Thin strokes vanish at toolbar size, so the smallest icons draw them bolder.
  const half = (STROKE * (size <= 16 ? 1.35 : size <= 32 ? 1.15 : 1)) / 2;
  const samples = 6;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < samples; sy += 1) {
        for (let sx = 0; sx < samples; sx += 1) {
          const px = (x + (sx + 0.5) / samples) * unit;
          const py = (y + (sy + 0.5) / samples) * unit;
          const hit = shade(px, py, half);
          if (!hit) continue;
          covered += 1;
          const m = hit.mix;
          r += TILE[0] * (1 - m) + hit.color[0] * m;
          g += TILE[1] * (1 - m) + hit.color[1] * m;
          b += TILE[2] * (1 - m) + hit.color[2] * m;
        }
      }
      const i = (y * size + x) * 4;
      if (covered === 0) continue;
      rgba[i] = Math.round(r / covered);
      rgba[i + 1] = Math.round(g / covered);
      rgba[i + 2] = Math.round(b / covered);
      rgba[i + 3] = Math.round((255 * covered) / (samples * samples));
    }
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
