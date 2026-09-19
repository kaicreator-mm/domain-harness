import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Test-only legacy build (tsconfig.legacy-test.json); the published dist no
// longer ships v0.1 internals (issue #166).
const legacyDistEntry = join(packageRoot, 'dist-legacy-test', 'legacy-v1', 'index.js');

test('frozen v0.1 Expression and Script Workers run under a plain-ESM host process', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'domain-harness-esm-host-'));
  try {
    const root = join(dir, 'harness');
    await mkdir(join(root, 'workflows'), { recursive: true });
    await mkdir(join(root, 'scripts'), { recursive: true });
    await writeFile(join(root, 'harness.yaml'), 'schemaVersion: "0.1"\nid: esm-host\nlimits:\n  maxSteps: 10\n', 'utf8');
    await writeFile(join(root, 'scripts', 'double.mjs'), 'export default async (input) => ({ doubled: input.value * 2 });\n', 'utf8');
    await writeFile(
      join(root, 'workflows', 'main.yaml'),
      'initial: calc\noutput: \'{"expr": steps.calc, "script": steps.enrich}\'\n'
      + 'states:\n'
      + '  calc:\n    invoke:\n      expr: \'{"doubled": input.value * 2}\'\n    on:\n      done:\n        - target: enrich\n'
      + '  enrich:\n    invoke:\n      script: scripts/double.mjs\n      input: "input"\n    on:\n      done:\n        - target: ok\n'
      + '  ok:\n    final: true\n  failed:\n    final: true\n',
      'utf8',
    );

    const childScript = [
      'import { pathToFileURL } from "node:url";',
      `const sdk = await import(pathToFileURL(${JSON.stringify(legacyDistEntry)}).href);`,
      'const runtime = await sdk.createDomainHarness({',
      `  root: ${JSON.stringify(root)},`,
      '  sqlitePath: ":memory:",',
      '  ai: { async execute() { return {}; } },',
      '  tools: {},',
      '});',
      'const started = await runtime.start({ workflowId: "main", input: { value: 21 } });',
      'const result = await runtime.wait(started.runId, { timeoutMs: 5000 });',
      'if (result.status !== "completed") {',
      '  throw new Error(`expected completed, got ${result.status}: ${result.error?.code} ${result.error?.message}`);',
      '}',
      'const expected = JSON.stringify({ expr: { doubled: 42 }, script: { doubled: 42 } });',
      'if (JSON.stringify(result.output) !== expected) {',
      '  throw new Error(`unexpected output: ${JSON.stringify(result.output)}`);',
      '}',
      'console.log("ESM_HOST_OK");',
    ].join('\n');

    const { stdout } = await execFileAsync(
      process.execPath,
      ['--input-type=module', '-e', childScript],
      // Run from a directory with no node_modules so bare-specifier resolution
      // inside eval Workers cannot accidentally depend on the host's layout.
      { timeout: 30_000, cwd: dir },
    );
    assert.match(stdout, /ESM_HOST_OK/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
