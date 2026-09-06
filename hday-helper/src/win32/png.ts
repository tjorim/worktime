/**
 * Minimal PNG decode/encode + status tinting, used to pre-render the tray
 * icon variants (see `hday-helper/scripts/generate-tray-icons.ts`).
 *
 * Deliberately dependency-free (only `node:zlib`, already used elsewhere via
 * Bun's Node compat layer) rather than pulling in an image library for what's
 * a one-off build step. Only supports the exact subset of PNG this repo's
 * source icons actually use — 8-bit RGBA, non-interlaced (verified against
 * `frontend/public/assets/icons/icon-16.png`) — and throws on anything else
 * rather than silently mishandling it.
 */

import { deflateSync, inflateSync } from "node:zlib";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface DecodedPng {
  width: number;
  height: number;
  /** RGBA8, row-major, 4 bytes per pixel — length is always width*height*4. */
  pixels: Uint8Array;
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function decodePng(buf: Uint8Array): DecodedPng {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) throw new Error("Not a PNG file (bad signature)");
  }

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts: Uint8Array[] = [];

  let offset = PNG_SIGNATURE.length;
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  while (offset < buf.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(buf[offset + 4]!, buf[offset + 5]!, buf[offset + 6]!, buf[offset + 7]!);
    const dataStart = offset + 8;
    const data = buf.subarray(dataStart, dataStart + length);

    if (type === "IHDR") {
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      bitDepth = data[8]!;
      colorType = data[9]!;
      interlace = data[12]!;
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }

    offset = dataStart + length + 4; // skip CRC
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}); ` +
        "only 8-bit non-interlaced RGBA is supported",
    );
  }

  const totalIdatLength = idatParts.reduce((sum, p) => sum + p.length, 0);
  const idat = new Uint8Array(totalIdatLength);
  let idatOffset = 0;
  for (const part of idatParts) {
    idat.set(part, idatOffset);
    idatOffset += part.length;
  }

  const raw = inflateSync(Buffer.from(idat));
  const bpp = 4; // RGBA, 8-bit
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * bpp);

  for (let row = 0; row < height; row++) {
    const rowStart = row * (1 + stride);
    const filterType = raw[rowStart]!;
    const outRowStart = row * stride;
    const prevRowStart = outRowStart - stride;

    for (let i = 0; i < stride; i++) {
      const x = raw[rowStart + 1 + i]!;
      const a = i >= bpp ? pixels[outRowStart + i - bpp]! : 0;
      const b = row > 0 ? pixels[prevRowStart + i]! : 0;
      const c = row > 0 && i >= bpp ? pixels[prevRowStart + i - bpp]! : 0;

      let value: number;
      switch (filterType) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + Math.floor((a + b) / 2);
          break;
        case 4:
          value = x + paethPredictor(a, b, c);
          break;
        default:
          throw new Error(`Unsupported PNG filter type ${filterType}`);
      }
      pixels[outRowStart + i] = value & 0xff;
    }
  }

  return { width, height, pixels };
}

// Standard CRC-32 (IEEE 802.3 / zip / PNG) — table computed once at module load.
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  const crc = crc32(crcInput);

  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc, false);
  return chunk;
}

/** Encodes RGBA8 pixels back to a minimal (filter-type-0, single-IDAT) PNG. */
export function encodePng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const bpp = 4;
  const stride = width * bpp;
  if (pixels.length !== stride * height) {
    throw new Error(`pixels length ${pixels.length} does not match ${width}x${height}x${bpp}`);
  }

  const filtered = new Uint8Array(height * (1 + stride));
  for (let row = 0; row < height; row++) {
    const srcStart = row * stride;
    const dstStart = row * (1 + stride);
    filtered[dstStart] = 0; // filter type: None
    filtered.set(pixels.subarray(srcStart, srcStart + stride), dstStart + 1);
  }

  const idatData = deflateSync(Buffer.from(filtered));

  const ihdrData = new Uint8Array(13);
  const ihdrView = new DataView(ihdrData.buffer);
  ihdrView.setUint32(0, width, false);
  ihdrView.setUint32(4, height, false);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method

  const ihdrChunk = pngChunk("IHDR", ihdrData);
  const idatChunk = pngChunk("IDAT", new Uint8Array(idatData.buffer, idatData.byteOffset, idatData.byteLength));
  const iendChunk = pngChunk("IEND", new Uint8Array(0));

  const out = new Uint8Array(PNG_SIGNATURE.length + ihdrChunk.length + idatChunk.length + iendChunk.length);
  out.set(PNG_SIGNATURE, 0);
  let o = PNG_SIGNATURE.length;
  out.set(ihdrChunk, o);
  o += ihdrChunk.length;
  out.set(idatChunk, o);
  o += idatChunk.length;
  out.set(iendChunk, o);
  return out;
}

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/**
 * Recolors RGBA8 pixels to a solid-tint silhouette: each pixel's perceptual
 * luminance becomes its brightness within `tint`, alpha is left untouched.
 * Used to derive the tray's status-colored icon variants from the Worktime
 * logo without hand-drawing a separate asset per status.
 */
export function tintPixels(pixels: Uint8Array, tint: RgbColor): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    const a = pixels[i + 3]!;
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    out[i] = Math.round(tint.r * luma);
    out[i + 1] = Math.round(tint.g * luma);
    out[i + 2] = Math.round(tint.b * luma);
    out[i + 3] = a;
  }
  return out;
}
