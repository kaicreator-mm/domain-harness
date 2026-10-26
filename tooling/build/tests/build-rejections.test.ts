import test from 'node:test';
import assert from 'node:assert/strict';
import { buildV10App } from '../src/index.js';
import { V10BuildError } from '@kaicreator/domain-harness-contracts';

test('T05 BUILD refuses unsupported target profile without executing module sources', () => {
  const options = { appId: 'app', audience: 'test', targetProfile: 'unsupported', modules: [], routes: [] };
  assert.throws(() => buildV10App(options), (error: unknown) => error instanceof V10BuildError);
});
