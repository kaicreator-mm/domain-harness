#!/usr/bin/env node
/**
 * v0.10 static literal refusal-code catalog.
 *
 * Uses the existing code-string shape without rewriting error classes.
 * The scan is intentionally bounded to direct literal arguments to
 * fail/refuse/reject/denied/new XxxError and object-valued code properties.
 * Indirect computed codes and K
 * sealed payloads are not captured; it is a drift gate, NOT a claim to
 * describe the complete cross-version error protocol.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogPath = join(root, 'docs', 'architecture', 'V010_TYPED_REFUSAL_LITERAL_CATALOG.json');
const compilerRoot = join(root, 'packages/domain-harness-compiler/src/qualified-package');
const compilerDirs = ['v10build', 'v10evidence', 'v10meta', 'v10shadow'];
const hostDir = join(root, 'packages/domain-harness/src/host-v8');
const codeCall = /\b(?:fail|refuse|reject|denied|new\s+[A-Za-z_$][A-Za-z0-9_$]*Error)\s*\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g;
/** Object-shaped typed failures also carry literal error codes. */
const codeProperty = /\bcode:\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g;

const sourceFiles = [];
for (const dir of compilerDirs) {
  for (const name of (await readdir(join(compilerRoot, dir))).sort()) {
    if (name.endsWith('.ts')) sourceFiles.push(join(compilerRoot, dir, name));
  }
}
for (const name of (await readdir(hostDir)).sort()) {
  if (/^v010[^/]*\.ts$/.test(name)) sourceFiles.push(join(hostDir, name));
}
// T00 selected owner roots, preserving the legacy scan until T03/T04/T05 move sources.
for (const owner of [
  'packages/contracts/src', 'packages/microkernel/src',
  'packages/host-node/src', 'tooling/build/src',
]) {
  async function collect(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name,'en'))) {
      const full=join(directory,entry.name);
      if (entry.isDirectory()) await collect(full);
      else if (entry.name.endsWith('.ts')) sourceFiles.push(full);
    }
  }
  await collect(join(root,owner));
}

const entries = {};
for (const filename of sourceFiles) {
  const source = await readFile(filename, 'utf8');
  const codes = [...new Set([...source.matchAll(codeCall), ...source.matchAll(codeProperty)].map((m) => m[1]))].sort();
  entries[relative(root, filename).replaceAll('\\', '/')] = codes;
}
const catalog = JSON.stringify({
  format: 'dh.v010.typed-refusal-literals/1',
  scope: 'direct literal refusal arguments and object-literal code properties; excludes dynamic codes and sealed payloads',
  sourceFiles: entries,
}, null, 2) + '\n';

if (process.argv.includes('--write')) {
  await writeFile(catalogPath, catalog, 'utf8');
  process.stdout.write('WROTE ' + relative(root, catalogPath) + '\n');
} else {
  const current = await readFile(catalogPath, 'utf8');
  if (current !== catalog) {
    process.stderr.write('V010_ERROR_CODE_CATALOG_DRIFT: run node scripts/check-v010-error-code-catalog.mjs --write and review changes\n');
    process.exitCode = 1;
  } else {
    const count = new Set(Object.values(entries).flat()).size;
    process.stdout.write('PASS v0.10 literal refusal catalog: ' + count + ' distinct codes across ' + sourceFiles.length + ' files\n');
  }
}
