/**
 * Tests for the PNG decode/encode/tint pipeline used to pre-render the tray
 * icon variants (`hday-helper/scripts/generate-tray-icons.ts`). Pure logic,
 * no Win32/FFI involved — unlike `tray.ts` itself, this is fully coverable
 * in CI.
 */

import { describe, expect, test } from "bun:test";
import { join } from "path";
import { decodePng, encodePng, tintPixels } from "../src/win32/png";

const SOURCE_ICON = join(import.meta.dir, "..", "..", "frontend", "public", "assets", "icons", "icon-16.png");

describe("decodePng / encodePng", () => {
  test("round-trips the real source icon", async () => {
    const bytes = new Uint8Array(await Bun.file(SOURCE_ICON).arrayBuffer());
    const decoded = decodePng(bytes);
    expect(decoded.width).toBe(16);
    expect(decoded.height).toBe(16);
    expect(decoded.pixels.length).toBe(16 * 16 * 4);

    const reencoded = encodePng(decoded.width, decoded.height, decoded.pixels);
    const redecoded = decodePng(reencoded);
    expect(redecoded.width).toBe(decoded.width);
    expect(redecoded.height).toBe(decoded.height);
    expect(Buffer.from(redecoded.pixels).equals(Buffer.from(decoded.pixels))).toBe(true);
  });

  test("round-trips a synthetic image exercising every filter's byte range", () => {
    const width = 4;
    const height = 4;
    const pixels = new Uint8Array(width * height * 4);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) % 256;

    const png = encodePng(width, height, pixels);
    const decoded = decodePng(png);
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(Buffer.from(decoded.pixels).equals(Buffer.from(pixels))).toBe(true);
  });

  test("rejects a non-PNG buffer", () => {
    expect(() => decodePng(new Uint8Array([1, 2, 3, 4]))).toThrow(/signature/);
  });

  test("encodePng rejects a pixel buffer of the wrong length", () => {
    expect(() => encodePng(2, 2, new Uint8Array(3))).toThrow(/does not match/);
  });
});

describe("tintPixels", () => {
  test("preserves alpha and recolors by luminance", () => {
    // Pure white, fully opaque -> full-brightness tint; alpha untouched.
    const white = new Uint8Array([255, 255, 255, 200]);
    const tinted = tintPixels(white, { r: 46, g: 160, b: 67 });
    expect(Array.from(tinted)).toEqual([46, 160, 67, 200]);
  });

  test("black pixels tint to black regardless of alpha", () => {
    const black = new Uint8Array([0, 0, 0, 128]);
    const tinted = tintPixels(black, { r: 209, g: 36, b: 47 });
    expect(Array.from(tinted)).toEqual([0, 0, 0, 128]);
  });

  test("fully transparent pixels stay transparent", () => {
    const transparent = new Uint8Array([255, 0, 0, 0]);
    const tinted = tintPixels(transparent, { r: 130, g: 130, b: 130 });
    expect(tinted[3]).toBe(0);
  });

  test("output length matches input length", () => {
    const pixels = new Uint8Array(4 * 10);
    const tinted = tintPixels(pixels, { r: 1, g: 2, b: 3 });
    expect(tinted.length).toBe(pixels.length);
  });
});
