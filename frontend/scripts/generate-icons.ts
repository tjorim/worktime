#!/usr/bin/env node

/**
 * Worktime Icon Generator
 * Generates PWA and favicon icons for the Worktime application
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createCanvas } from "canvas";

const ICONS_DIR = join(process.cwd(), "public", "assets", "icons");
const COLORS = {
  gradientStart: "#1e3a8a",
  gradientEnd: "#0d6efd",
  foreground: "white",
  centerDot: "#0d6efd",
} as const;
const RATIOS = {
  radius: 0.4,
  clockFace: 0.9,
  hourMarkerOuter: 0.8,
  hourMarkerInner: 0.7,
  clockFaceStroke: 0.015,
  hourMarkerStroke: 0.01,
  clockHandStroke: 0.015,
  hourHandLength: 0.15,
  minuteHandLength: 0.2,
  centerDotRadius: 0.02,
  textOffset: 0.25, // Positioned in bottom half of clock face
  textSize: 0.13, // Slightly smaller to fit better
} as const;

interface IconConfig {
  size: number;
  filename: string;
  name: string;
}

// Ensure icons directory exists
if (!existsSync(ICONS_DIR)) {
  mkdirSync(ICONS_DIR, { recursive: true });
}

/**
 * Create a Worktime icon with clock design
 * @param size - Icon size in pixels
 * @returns Canvas with the icon
 */
function createIcon(size: number) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size * RATIOS.radius;

  // Background gradient
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
  gradient.addColorStop(0, COLORS.gradientStart); // Blue-900
  gradient.addColorStop(1, COLORS.gradientEnd); // Bootstrap primary

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
  ctx.fill();

  // Clock face
  ctx.strokeStyle = COLORS.foreground;
  ctx.lineWidth = size * RATIOS.clockFaceStroke;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius * RATIOS.clockFace, 0, 2 * Math.PI);
  ctx.stroke();

  // Hour markers
  ctx.strokeStyle = COLORS.foreground;
  ctx.lineWidth = size * RATIOS.hourMarkerStroke;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI) / 6;
    const x1 = centerX + Math.cos(angle) * radius * RATIOS.hourMarkerOuter;
    const y1 = centerY + Math.sin(angle) * radius * RATIOS.hourMarkerOuter;
    const x2 = centerX + Math.cos(angle) * radius * RATIOS.hourMarkerInner;
    const y2 = centerY + Math.sin(angle) * radius * RATIOS.hourMarkerInner;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Clock hands showing 10:10 (classic watch marketing position)
  ctx.strokeStyle = COLORS.foreground;
  ctx.lineWidth = size * RATIOS.clockHandStroke;

  // Hour hand (pointing to 10) - 300 degrees from 12 o'clock
  const hourAngle = -Math.PI / 2 + (10 / 12) * 2 * Math.PI;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(
    centerX + Math.cos(hourAngle) * size * RATIOS.hourHandLength,
    centerY + Math.sin(hourAngle) * size * RATIOS.hourHandLength,
  );
  ctx.stroke();

  // Minute hand (pointing to 2) - 60 degrees from 12 o'clock
  const minuteAngle = -Math.PI / 2 + (10 / 60) * 2 * Math.PI;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY);
  ctx.lineTo(
    centerX + Math.cos(minuteAngle) * size * RATIOS.minuteHandLength,
    centerY + Math.sin(minuteAngle) * size * RATIOS.minuteHandLength,
  );
  ctx.stroke();

  // Center dot
  ctx.fillStyle = COLORS.centerDot;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size * RATIOS.centerDotRadius, 0, 2 * Math.PI);
  ctx.fill();

  // Add text "WT" for Worktime (only for larger icons)
  if (size >= 48) {
    ctx.fillStyle = COLORS.foreground;
    ctx.font = `bold ${size * RATIOS.textSize}px Arial`;
    ctx.textAlign = "center";
    ctx.fillText("WT", centerX, centerY + size * RATIOS.textOffset);
  }

  return canvas;
}

/**
 * Generate a predefined set of PNG icons and write them to the icons directory.
 *
 * Creates icons for the configured sizes (16, 32, 48, 192, 512) using the internal icon
 * generator, saves each file under ICONS_DIR with filenames like `icon-<size>.png`, and writes
 * progress and final status to stdout/stderr.
 */
function generateIcons(): void {
  const icons: IconConfig[] = [
    { size: 16, filename: "icon-16.png", name: "16x16 Favicon" },
    { size: 32, filename: "icon-32.png", name: "32x32 Favicon" },
    { size: 48, filename: "icon-48.png", name: "48x48 Favicon" },
    { size: 192, filename: "icon-192.png", name: "192x192 PWA Icon" },
    { size: 512, filename: "icon-512.png", name: "512x512 PWA Icon" },
  ];

  process.stdout.write("🎨 Generating Worktime icons...\n\n");

  icons.forEach(({ size, filename, name }) => {
    try {
      const canvas = createIcon(size);
      const buffer = canvas.toBuffer("image/png");
      const filePath = join(ICONS_DIR, filename);

      writeFileSync(filePath, buffer);
      const sizeKB = (buffer.length / 1024).toFixed(1);
      process.stdout.write(`✅ Generated ${name}: ${filename} (${sizeKB}KB)\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`❌ Failed to generate ${name} (${filename}): ${message}\n`);
    }
  });

  process.stdout.write(`\n🎉 All icons generated successfully in ${ICONS_DIR}\n`);
  process.stdout.write("\n📱 Icons are ready for PWA deployment!\n");
}

// Run the generator
try {
  generateIcons();
} catch (error) {
  process.stderr.write(`❌ Error generating icons: ${(error as Error).message}\n`);
  process.exit(1);
}
