#!/usr/bin/env node
// Bump the desktop app version in all three places that carry it:
//   - apps/desktop/package.json
//   - apps/desktop/src-tauri/Cargo.toml
//   - apps/desktop/src-tauri/tauri.conf.json
//
// Usage: pnpm --filter @selfbox/desktop bump <new-version>
//   e.g. pnpm --filter @selfbox/desktop bump 0.1.1
//
// Validates the version is semver-shaped before writing. Idempotent — running
// twice with the same version is a no-op.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(here, "..");

const newVersion = process.argv[2];
if (!newVersion) {
  console.error("usage: bump-version <new-version>  (e.g. 0.1.1)");
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(newVersion)) {
  console.error(`error: "${newVersion}" is not a valid semver string`);
  process.exit(1);
}

function patchJson(path, mutate) {
  const raw = readFileSync(path, "utf8");
  const data = JSON.parse(raw);
  const before = data.version;
  mutate(data);
  // Preserve trailing newline + 2-space indent (matches existing files).
  const trailingNewline = raw.endsWith("\n") ? "\n" : "";
  writeFileSync(path, JSON.stringify(data, null, 2) + trailingNewline);
  return before;
}

function patchCargoToml(path) {
  const raw = readFileSync(path, "utf8");
  // Only rewrite the [package] version line, not arbitrary `version = ` lines
  // elsewhere in the file (dependencies have their own version specs).
  const re = /(^\[package\][\s\S]*?^version = ")([^"]+)(")/m;
  const match = raw.match(re);
  if (!match) {
    console.error(`error: did not find a [package] version line in ${path}`);
    process.exit(1);
  }
  const prev = match[2];
  if (prev !== newVersion) {
    writeFileSync(path, raw.replace(re, `$1${newVersion}$3`));
  }
  return prev;
}

const pkgPath = resolve(desktopRoot, "package.json");
const cargoPath = resolve(desktopRoot, "src-tauri/Cargo.toml");
const tauriPath = resolve(desktopRoot, "src-tauri/tauri.conf.json");

const beforePkg = patchJson(pkgPath, (d) => (d.version = newVersion));
const beforeCargo = patchCargoToml(cargoPath);
const beforeTauri = patchJson(tauriPath, (d) => (d.version = newVersion));

const versions = new Set([beforePkg, beforeCargo, beforeTauri]);
console.log(
  `bumped desktop ${[...versions].join(" + ")} → ${newVersion}\n` +
    `  ${pkgPath}\n  ${cargoPath}\n  ${tauriPath}`,
);
