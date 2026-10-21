/** Preserve current invariants rather than historical review-round annotations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const directories = [
  'packages/domain-harness-compiler/src/qualified-package/v10build',
  'packages/domain-harness-compiler/src/qualified-package/v10evidence',
  'packages/domain-harness-compiler/src/qualified-package/v10meta',
  'packages/domain-harness-compiler/src/qualified-package/v10shadow',
];
const extraSources = ['tests/assembly/helpers-v010.ts'];

test('N-I1232: v0.10 compiler/assembly invariant comments contain no review chronology', async () => {
  const paths = [...extraSources];
  for (const directory of directories) {
    for (const filename of await readdir(new URL(`../../${directory}/`, import.meta.url))) {
      if (filename.endsWith('.ts')) paths.push(`${directory}/${filename}`);
    }
  }
  for (const path of paths) {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
    const commentLines = source.split(/\r?\n/).filter((line) => /^\s*(?:\/\/|\*)/.test(line));
    for (const line of commentLines) {
      assert.doesNotMatch(line, /\breview\s+\d{9,}\b|\b(?:T\d\d\s+)?R\d+\s*[- ]?\s*P[012](?:-\d+)?\b/,
        `${path}: current invariant comment must not cite a review round`);
    }
  }
});
