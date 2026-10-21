/** Static v0.10 error-literal catalog must match the implementation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('N-I1231: registered direct typed refusal literals cannot drift silently', () => {
  const checker = fileURLToPath(new URL('../../scripts/check-v010-error-code-catalog.mjs', import.meta.url));
  const processResult = spawnSync(process.execPath, [checker], { encoding: 'utf8' });
  assert.equal(processResult.status, 0, `${processResult.stderr}\n${processResult.stdout}`);
  assert.match(processResult.stdout, /PASS v0\.10 literal refusal catalog:/);
});
