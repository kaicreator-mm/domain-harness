/** Static v0.10 error-literal catalog must match the implementation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

test('N-I1231: registered direct typed refusal literals cannot drift silently', () => {
  const checker = fileURLToPath(new URL('../../scripts/check-v010-error-code-catalog.mjs', import.meta.url));
  const processResult = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  assert.equal(processResult.status, 0, `${processResult.stderr}\n${processResult.stdout}`);
  assert.match(processResult.stdout, /PASS v0\.10 literal refusal catalog:/);
});

test('P-I1231: object-shaped Host and Shadow refusal codes are registered', () => {
  const file = fileURLToPath(new URL('../../docs/architecture/V010_TYPED_REFUSAL_LITERAL_CATALOG.json', import.meta.url));
  const catalog = JSON.parse(readFileSync(file, 'utf8')) as { sourceFiles: Record<string, string[]> };
  assert.ok(catalog.sourceFiles['packages/microkernel/src/internal/activation.ts']?.includes('HOST_CAS_CONFLICT'));
  assert.ok(catalog.sourceFiles['packages/host-node/src/shadow-l4-readonly.ts']?.includes('SHADOW_EVALUATOR_COMPILE_FAILED'));
});
