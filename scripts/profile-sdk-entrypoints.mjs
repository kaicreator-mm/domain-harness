/** R60 W04: nonblocking, reproducible cold-process entrypoint and SDK tarball metrics. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, '_tmp/r60/sdk-entrypoints.json');
const sdkDir = join(root, 'packages/domain-harness');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pack = spawnSync(npm, ['pack', '--dry-run', '--json', '--ignore-scripts'], {
  cwd: sdkDir, encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024,
});
if (pack.error || pack.status !== 0) {
  throw new Error(`R60 npm pack --dry-run failed: ${pack.error ?? pack.stderr}`);
}
const dryRun = JSON.parse(pack.stdout)[0];
assert.ok(dryRun.size > 0 && dryRun.unpackedSize > 0, 'npm pack must include nonempty SDK');
const probe = `
import { performance } from 'node:perf_hooks';
const startRss = process.memoryUsage().rss;
const start = performance.now();
const entry = await import(process.argv[1]);
const elapsedMs = performance.now() - start;
const rssDelta = process.memoryUsage().rss - startRss;
if (typeof entry.boot !== 'function' && typeof entry.buildApp !== 'function') process.exit(21);
console.log(JSON.stringify({elapsedMs,rssDelta,exportCount:Object.keys(entry).length}));
`;
const samples = {};
for (const [kind, file] of [
  ['runtime', 'runtime.js'],
  ['composition', 'composition.js'],
  ['root', 'index.js'],
]) {
  const url = pathToFileURL(join(sdkDir, 'dist', file)).href;
  const values = [];
  for (let i = 0; i < 5; i++) {
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', probe, url], {
      cwd: root, encoding: 'utf8', timeout: 30_000, maxBuffer: 1024 * 1024,
    });
    if (child.error || child.status !== 0) throw new Error(`R60 ${kind} cold-import: ${child.error ?? child.stderr}`);
    values.push(JSON.parse(child.stdout.trim()));
  }
  const median = (field) => [...values].map(v=>v[field]).sort((a,b)=>a-b)[2];
  samples[kind] = {
    medianElapsedMs: Number(median('elapsedMs').toFixed(3)),
    medianRssBytes: median('rssDelta'),
    exportCount: values[0].exportCount,
    trials: values.length,
  };
}
const evidence = {
  schemaVersion:'dh.r60.sdk.entry-profile/1',
  runtime:process.version,
  platform:process.platform,
  arch:process.arch,
  sdkPackBytes:dryRun.size,
  sdkUnpackedBytes:dryRun.unpackedSize,
  samples,
  note:'Observational only: no arbitrary performance gate, no claimed prechange measurements.',
};
mkdirSync(dirname(output), {recursive:true});
writeFileSync(output, JSON.stringify(evidence,null,2)+String.fromCharCode(10));
console.log(JSON.stringify(evidence,null,2));
