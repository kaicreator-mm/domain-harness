import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import type { JsonObject } from '../../src/contracts/json.js';
import {
  evaluateDomainHardInvariantPredicate,
  evaluateDomainPredicate,
  evaluateDomainWorkflowGuard,
  type DomainPredicate,
} from '../../src/workflow/index.js';

const amountPredicate: DomainPredicate = {
  op: 'all',
  predicates: [
    {
      op: 'gte',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'literal', value: 0 },
    },
    {
      op: 'lte',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'context', path: ['limit'] },
    },
  ],
};

test('Guard and Hard Invariant predicates are synchronous and deterministic for declared data', () => {
  const input = {
    context: { limit: 100 },
    event: { type: 'SUBMIT', payload: { amount: 25 } },
  };
  const guard = { guardId: 'amount-within-limit', predicate: amountPredicate };
  const invariant = { invariantId: 'amount-within-limit', predicate: amountPredicate };

  const first = evaluateDomainWorkflowGuard(guard, input);
  for (let index = 0; index < 100; index += 1) {
    assert.equal(evaluateDomainWorkflowGuard(guard, input), first);
    assert.equal(evaluateDomainHardInvariantPredicate(invariant, input), first);
  }
  assert.equal(first, true);
});

test('predicate path is a closed data interpreter with no AI, Tool, Promise, or external I/O seam', async () => {
  const source = await readFile(new URL('../../src/workflow/predicate.ts', import.meta.url), 'utf8');
  const executableSource = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
    .join('\n');

  for (const forbidden of ['fetch(', 'http:', 'https:', 'Promise<', 'async ', 'tool(', 'llm(']) {
    assert.equal(executableSource.toLowerCase().includes(forbidden.toLowerCase()), false, `${forbidden} in predicate path`);
  }
  assert.match(source, /import type \{ JsonObject, JsonValue \} from '\.\.\/contracts\/json\.js';/);
});

test('capability-shaped or accessor data fails closed without invoking hidden work', () => {
  let getterCalls = 0;
  let callbackCalls = 0;
  const context = { limit: 100 } as JsonObject;
  Object.defineProperty(context, 'externalObservation', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 42;
    },
  });

  const accessorGuard = {
    guardId: 'no-accessors',
    predicate: {
      op: 'exists',
      operand: { source: 'context', path: ['externalObservation'] },
    },
  } as const;
  assert.equal(evaluateDomainWorkflowGuard(accessorGuard, { context, event: { type: 'CHECK' } }), false);
  assert.equal(getterCalls, 0);

  const callbackPredicate = {
    op: 'constant',
    value: true,
    execute: () => {
      callbackCalls += 1;
      return true;
    },
  } as unknown as DomainPredicate;
  assert.equal(
    evaluateDomainWorkflowGuard(
      { guardId: 'no-callbacks', predicate: callbackPredicate },
      { context: {}, event: { type: 'CHECK' } },
    ),
    false,
  );
  assert.equal(callbackCalls, 0);
});

test('malformed predicate evaluation throws at the primitive layer while guard wrappers fail closed', () => {
  const malformed = { op: 'remote_lookup' } as unknown as DomainPredicate;
  assert.throws(
    () => evaluateDomainPredicate(malformed, { context: {}, event: { type: 'CHECK' } }),
    /unknown predicate operator/,
  );
  assert.equal(
    evaluateDomainWorkflowGuard(
      { guardId: 'malformed', predicate: malformed },
      { context: {}, event: { type: 'CHECK' } },
    ),
    false,
  );
});
