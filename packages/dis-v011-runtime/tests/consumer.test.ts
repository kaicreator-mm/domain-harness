import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumeDis } from '../src/dis-consumer.ts';
import type { Selection } from '../src/types.ts';

test('structured missing input requires clarification before graph execution', () => {
  const selection = { graph: { id: 'test', revision: '1.0.0' } } as Selection;
  const actual = consumeDis({ url:'https://example.test' }, selection);
  assert.equal(actual.status, 'NEEDS_INPUT');
  assert.deepEqual(actual.trace, []);
});
