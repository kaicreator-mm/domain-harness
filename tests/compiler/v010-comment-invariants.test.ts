/** Historical review IDs belong in GitHub, not in v0.10 invariant comments. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sources = [
  'packages/domain-harness-compiler/src/qualified-package/v10build/activation.ts',
  'packages/domain-harness-compiler/src/qualified-package/v10build/build.ts',
];

test('N-I1232: v0.10 BUILD comments state invariants, not review round IDs', async () => {
  for (const path of sources) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    const commentLines = source.split(/\r?\n/).filter((line) => /^\s*(?:\/\/|\*)/.test(line));
    for (const line of commentLines) {
      assert.doesNotMatch(line, /\breview\s+\d{9,}\b|\bR\d+\s+P[012](?:-\d+)?\b/,
        `${path} must document the current invariant rather than the historical review`);
    }
  }
});
