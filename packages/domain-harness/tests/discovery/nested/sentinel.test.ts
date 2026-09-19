import test from 'node:test';
import assert from 'node:assert/strict';

// Discovery sentinel (issue #162): this file lives two directory levels below
// tests/. It only executes when the canonical core test command recurses
// (node --test with the recursive glob). If discovery ever regresses to a
// single-level glob, this test disappears from the run and the reported test
// count drops — keep the expected counts in tests/MATRIX.md up to date so the
// omission is detectable in CI logs.
test('core test discovery executes nested suites (depth-2 sentinel)', () => {
  const here = new URL('.', import.meta.url).pathname.replace(/\\/g, '/');
  assert.match(here, /tests\/discovery\/nested\/$/u, 'sentinel must stay two levels below tests/');
});
