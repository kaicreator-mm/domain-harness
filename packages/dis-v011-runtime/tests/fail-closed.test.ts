import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumeDis } from '../src/dis-consumer.ts';
import type { Selection } from '../src/types.ts';

test('no ambient Tool fields in bounded observation', () => {
  const selection = { graph: { id: 'test', revision: '1.0.0' } } as Selection;
  const actual = consumeDis({ url:'https://example.test', signals: [], tool:'download' }, selection);
  assert.equal(actual.status, 'FAILED');
  assert.equal(actual.outcome, null);
});
