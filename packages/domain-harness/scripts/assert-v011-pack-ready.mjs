import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const canonical = Object.freeze({
  types: './dist/v011/index.d.ts',
  import: './dist/v011/index.js',
});

assert.notEqual(manifest.private, true, 'canonical root SDK must be publishable');
assert.equal(manifest.engines?.node, '>=24.0.0', 'canonical root SDK must declare the verified Node target floor');
assert.equal(manifest.main, canonical.import, 'main must be the canonical v011 entry');
assert.equal(manifest.types, canonical.types, 'types must be the canonical v011 entry');
assert.deepEqual(manifest.exports?.['.'], canonical, 'exports["."] must be canonical v011');
assert.deepEqual(manifest.files, ['dist/v011', 'README.md'], 'tarball files must fence legacy executable dist');

await Promise.all([
  access(new URL('../dist/v011/index.js', import.meta.url)),
  access(new URL('../dist/v011/index.d.ts', import.meta.url)),
  access(new URL('../README.md', import.meta.url)),
]);

console.log(`assert-v011-pack-ready: fresh canonical dist and fenced package shape present at ${packageRoot}`);
