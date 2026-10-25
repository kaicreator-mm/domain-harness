/** Preserve current invariants rather than historical review-round annotations. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

// v0.10.2 T11 cutover: the compiler v10* directories are deleted. The
// canonical package sources carry their own history (e.g. moved v0.8 host
// files cite their original review rounds), so the surviving subjects of
// this invariant are the shared v0.10 assembly fixture helpers.
const directories: readonly string[] = [];
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
