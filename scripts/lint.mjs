import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const roots = ['packages', 'scripts'];
const extensions = new Set(['.ts', '.mts', '.cts', '.mjs']);
let failures = 0;

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(path);
      continue;
    }
    const ext = entry.name.slice(entry.name.lastIndexOf('.'));
    if (!extensions.has(ext)) continue;
    const text = await readFile(path, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\s+$/.test(line) && line.length > 0) {
        console.error(`${relative(root, path)}:${index + 1}: trailing whitespace`);
        failures += 1;
      }
      if (line.includes('\t')) {
        console.error(`${relative(root, path)}:${index + 1}: tab character`);
        failures += 1;
      }
    });
  }
}

for (const dir of roots) await walk(join(root, dir));
if (failures > 0) process.exit(1);
