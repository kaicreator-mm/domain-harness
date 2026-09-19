import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const roots = ['packages', 'scripts'];
const extensions = new Set(['.ts', '.mts', '.cts', '.mjs']);
let failures = 0;

// Issue #165: static import boundary for the portable v0.2 Runtime Core.
// Files in the published production graph must never reach Node built-ins or
// host-native drivers; host binding happens exclusively through the injected
// ports/bindings of createDomainRuntime and the host adapter packages.
// Legacy v0.1 directories (loader/compiler/runner/persistence/recovery/
// public/script/legacy-v1) are outside the production graph and exempt.
const portableCorePrefixes = [
  'packages/domain-harness/src/contracts/',
  'packages/domain-harness/src/engine/',
  'packages/domain-harness/src/execution/',
  'packages/domain-harness/src/instance/',
  'packages/domain-harness/src/messaging/',
  'packages/domain-harness/src/package/',
  'packages/domain-harness/src/projection/',
  'packages/domain-harness/src/public-v2/',
  'packages/domain-harness/src/query/',
  'packages/domain-harness/src/recovery-v2/',
  'packages/domain-harness/src/runtime/',
  'packages/domain-harness/src/subscription/',
  'packages/domain-harness/src/tool/',
  'packages/domain-harness/src/v2/',
];
const portableCoreEntry = 'packages/domain-harness/src/index.ts';
const forbiddenHostImport =
  /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](?:node:|better-sqlite3|expo-sqlite)/u;

function isPortableCore(relPath) {
  return (
    relPath === portableCoreEntry ||
    portableCorePrefixes.some((prefix) => relPath.startsWith(prefix))
  );
}

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'dist-legacy-test' || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    const ext = entry.name.slice(entry.name.lastIndexOf('.'));
    if (!extensions.has(ext)) continue;
    const text = await readFile(path, 'utf8');
    const relPath = relative(root, path).replace(/\\/g, '/');
    const boundary = isPortableCore(relPath);
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\s+$/.test(line) && line.length > 0) {
        console.error(`${relPath}:${index + 1}: trailing whitespace`);
        failures += 1;
      }
      if (line.includes('\t')) {
        console.error(`${relPath}:${index + 1}: tab character`);
        failures += 1;
      }
      if (boundary && forbiddenHostImport.test(line)) {
        console.error(
          `${relPath}:${index + 1}: portable v0.2 core must not import Node built-ins or host drivers`,
        );
        failures += 1;
      }
    });
  }
}

for (const dir of roots) await walk(join(root, dir));
if (failures > 0) process.exit(1);
