#!/usr/bin/env node
/**
 * Generate all platform icon assets from the Selfbox brand SVG.
 *
 * Inputs:
 *   src-tauri/icons/source.svg          — full-color 1024×1024 app mark
 *   src-tauri/icons/tray-template.svg   — monochrome tray-icon glyph
 *
 * Outputs (overwrites):
 *   src-tauri/icons/32x32.png
 *   src-tauri/icons/128x128.png
 *   src-tauri/icons/128x128@2x.png       (256×256)
 *   src-tauri/icons/icon.png             (512×512, fallback + tray)
 *   src-tauri/icons/icon.icns            (macOS app bundle)
 *   src-tauri/icons/icon.ico             (Windows app exe)
 *   src-tauri/icons/tray.png             (31×28 monochrome template)
 *   src-tauri/icons/tray@2x.png          (61×56 monochrome template)
 *   src-tauri/icons/tray@3x.png          (92×84 monochrome template)
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import png2icons from "png2icons";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconDir = path.resolve(__dirname, "../src-tauri/icons");
const sourceSvg = path.join(iconDir, "source.svg");
const trayTemplateSvg = path.join(iconDir, "tray-template.svg");

async function renderPng(svgPath, size, outPath) {
  const svg = await fs.readFile(svgPath);
  await sharp(svg, { density: 512 })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`  ${path.basename(outPath).padEnd(24)} ${size}×${size}`);
}

async function renderTrayPng(svgPath, height, outPath) {
  const svg = await fs.readFile(svgPath);
  const width = Math.round(height * (70 / 64));
  await sharp(svg, { density: 512 })
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`  ${path.basename(outPath).padEnd(24)} ${width}×${height}`);
}

async function main() {
  console.log("Rendering app icons...");
  await renderPng(sourceSvg, 32, path.join(iconDir, "32x32.png"));
  await renderPng(sourceSvg, 128, path.join(iconDir, "128x128.png"));
  await renderPng(sourceSvg, 256, path.join(iconDir, "128x128@2x.png"));
  await renderPng(sourceSvg, 512, path.join(iconDir, "icon.png"));

  // Render a 1024×1024 master PNG as the source for .icns / .ico
  const masterPath = path.join(iconDir, "_master-1024.png");
  await renderPng(sourceSvg, 1024, masterPath);
  const masterPng = await fs.readFile(masterPath);

  console.log("Packing .icns (macOS)...");
  const icnsBuffer = png2icons.createICNS(masterPng, png2icons.BILINEAR, 0);
  if (!icnsBuffer) throw new Error("png2icons failed to produce ICNS output");
  await fs.writeFile(path.join(iconDir, "icon.icns"), icnsBuffer);
  console.log(`  icon.icns              ${icnsBuffer.length} bytes`);

  console.log("Packing .ico (Windows)...");
  const icoBuffer = png2icons.createICO(masterPng, png2icons.BILINEAR, 0, false);
  if (!icoBuffer) throw new Error("png2icons failed to produce ICO output");
  await fs.writeFile(path.join(iconDir, "icon.ico"), icoBuffer);
  console.log(`  icon.ico               ${icoBuffer.length} bytes`);

  await fs.unlink(masterPath);

  // Tauri's macOS tray backend renders icons at a fixed 18pt height and derives
  // width from the bitmap aspect ratio. Keep the tray bitmap tight around the
  // angled Selfbox mark so the visible glyph fills the menu-bar height.
  console.log("Rendering tray template (macOS menu bar)...");
  await renderTrayPng(trayTemplateSvg, 28, path.join(iconDir, "tray.png"));
  await renderTrayPng(trayTemplateSvg, 56, path.join(iconDir, "tray@2x.png"));
  await renderTrayPng(trayTemplateSvg, 84, path.join(iconDir, "tray@3x.png"));

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
