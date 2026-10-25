/**
 * v0.10.2 T09 — dependency-free sealed-App runtime helpers.
 *
 * Split out of runtime-core.mjs so the INSTALLED App entry (app.mjs) never
 * transitively imports `@kaicreator/domain-harness-host-node` or
 * `better-sqlite3`: the Tiny profile installs neither package, and any
 * unconditional import edge from the entry would break the Tiny consumer
 * before its scenario runs. Only node builtins are imported here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const APP_DIR = import.meta.dirname;

export function loadBuiltApp(appDir = APP_DIR) {
  return JSON.parse(readFileSync(join(appDir, 'app.build.json'), 'utf8'));
}

export function loadManifest(appDir = APP_DIR) {
  return JSON.parse(readFileSync(join(appDir, 'manifest.json'), 'utf8'));
}

export function writeReport(path, report) {
  writeFileSync(path, JSON.stringify(report, null, 2));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}
