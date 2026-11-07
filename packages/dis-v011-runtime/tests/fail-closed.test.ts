import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Selection } from '../src/types.ts';

test('no ambient Tool fields in bounded observation', async () => {
  const { consumeObservation } = await import(new URL('../../../examples/dis-0.1.0-runtime-consumer/src/provider.mjs', import.meta.url).href);
  const selection = { graph: { id: 'test', revision: '1.0.0' } } as Selection;
  const actual = consumeObservation({ url:'https://example.test', signals: [], tool:'download' }, selection);
  assert.equal(actual.status, 'FAILED');
  assert.equal(actual.outcome, null);
});
