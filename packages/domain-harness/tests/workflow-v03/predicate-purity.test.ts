import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  evaluateDomainHardInvariantPredicate,
  evaluateDomainPredicate,
  evaluateDomainWorkflowGuard,
  prepareDomainHardInvariantPredicate,
  prepareDomainPredicate,
  prepareDomainPredicateEvaluationInput,
  prepareDomainWorkflowGuard,
  type DomainPredicate,
  type DomainPredicateEvaluationInput,
  type DomainWorkflowGuard,
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

test('Guard and Hard Invariant predicates are synchronous and deterministic for prepared declared data', () => {
  const input = prepareDomainPredicateEvaluationInput({
    context: { limit: 100 },
    event: { type: 'SUBMIT', payload: { amount: 25 } },
  });
  const guard = prepareDomainWorkflowGuard({ guardId: 'amount-within-limit', predicate: amountPredicate });
  const invariant = prepareDomainHardInvariantPredicate({
    invariantId: 'amount-within-limit',
    predicate: amountPredicate,
  });

  const first = evaluateDomainWorkflowGuard(guard, input);
  for (let index = 0; index < 100; index += 1) {
    assert.equal(evaluateDomainWorkflowGuard(guard, input), first);
    assert.equal(evaluateDomainHardInvariantPredicate(invariant, input), first);
  }
  assert.equal(first, true);
});

test('authoritative predicate path is a closed data interpreter with no AI, Tool, Promise, or external I/O seam', async () => {
  const source = await readFile(new URL('../../src/workflow/predicate.ts', import.meta.url), 'utf8');
  const executableSource = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
    .join('\n');

  for (const forbidden of ['fetch(', 'http:', 'https:', 'Promise<', 'async ', 'tool(', 'llm(']) {
    assert.equal(executableSource.toLowerCase().includes(forbidden.toLowerCase()), false, `${forbidden} in predicate path`);
  }
  assert.match(source, /preparedInputs\.has/);
  assert.match(source, /preparedWorkflowGuards\.has/);
});

test('unprepared accessor/capability-shaped values fail closed without invoking hidden work', () => {
  let getterCalls = 0;
  let callbackCalls = 0;
  const guard = prepareDomainWorkflowGuard({
    guardId: 'no-accessors',
    predicate: {
      op: 'exists',
      operand: { source: 'context', path: ['externalObservation'] },
    },
  });
  const context: Record<string, unknown> = { limit: 100 };
  Object.defineProperty(context, 'externalObservation', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 42;
    },
  });
  const unpreparedInput = {
    context,
    event: { type: 'CHECK' },
  } as unknown as DomainPredicateEvaluationInput;

  assert.equal(evaluateDomainWorkflowGuard(guard, unpreparedInput), false);
  assert.equal(getterCalls, 0);

  const callbackPredicate = {
    op: 'constant',
    value: true,
    execute: () => {
      callbackCalls += 1;
      return true;
    },
  } as unknown as DomainPredicate;
  const rawGuard = { guardId: 'no-callbacks', predicate: callbackPredicate } as DomainWorkflowGuard;
  const preparedInput = prepareDomainPredicateEvaluationInput({ context: {}, event: { type: 'CHECK' } });

  assert.equal(evaluateDomainWorkflowGuard(rawGuard, preparedInput), false);
  assert.equal(callbackCalls, 0);
  assert.throws(() => prepareDomainWorkflowGuard(rawGuard), /JSON data only/);
  assert.equal(callbackCalls, 0);
});

test('Proxy-backed guard/input references are rejected by trap-free identity checks', () => {
  const preparedGuard = prepareDomainWorkflowGuard({
    guardId: 'safe',
    predicate: { op: 'constant', value: true },
  });
  const preparedInput = prepareDomainPredicateEvaluationInput({ context: {}, event: { type: 'CHECK' } });
  let trapCalls = 0;
  const traps: ProxyHandler<object> = {
    get(target, property, receiver) {
      trapCalls += 1;
      return Reflect.get(target, property, receiver);
    },
    getOwnPropertyDescriptor(target, property) {
      trapCalls += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
    getPrototypeOf(target) {
      trapCalls += 1;
      return Reflect.getPrototypeOf(target);
    },
    ownKeys(target) {
      trapCalls += 1;
      return Reflect.ownKeys(target);
    },
  };

  const proxyGuard = new Proxy(preparedGuard as object, traps) as DomainWorkflowGuard;
  const proxyInput = new Proxy(preparedInput as object, traps) as DomainPredicateEvaluationInput;

  assert.equal(evaluateDomainWorkflowGuard(proxyGuard, preparedInput), false);
  assert.equal(evaluateDomainWorkflowGuard(preparedGuard, proxyInput), false);
  assert.equal(trapCalls, 0, 'authoritative predicate evaluation must not trigger Proxy traps');
});

test('malformed prepared predicate throws at primitive layer while Guard wrapper fails closed', () => {
  const malformed = { op: 'remote_lookup' } as unknown as DomainPredicate;
  const preparedMalformed = prepareDomainPredicate(malformed);
  const input = prepareDomainPredicateEvaluationInput({ context: {}, event: { type: 'CHECK' } });

  assert.throws(() => evaluateDomainPredicate(preparedMalformed, input), /unknown predicate operator/);

  const malformedGuard = prepareDomainWorkflowGuard({ guardId: 'malformed', predicate: malformed });
  assert.equal(evaluateDomainWorkflowGuard(malformedGuard, input), false);
});

test('preparation treats __proto__ as own JSON data and cannot inherit predicate authority', () => {
  const inheritedOperator = JSON.parse(
    '{"__proto__":{"op":"constant","value":true}}',
  ) as unknown as DomainPredicate;
  const protoContext = JSON.parse(
    '{"__proto__":{"allowed":true}}',
  ) as unknown as DomainPredicateEvaluationInput['context'];
  const input = prepareDomainPredicateEvaluationInput({ context: protoContext, event: { type: 'CHECK' } });

  const preparedMalformed = prepareDomainPredicate(inheritedOperator);
  assert.throws(() => evaluateDomainPredicate(preparedMalformed, input), /unknown predicate operator/);

  const malformedGuard = prepareDomainWorkflowGuard({ guardId: 'proto-smuggle', predicate: inheritedOperator });
  assert.equal(evaluateDomainWorkflowGuard(malformedGuard, input), false);

  const explicitDataPredicate = prepareDomainPredicate({
    op: 'eq',
    left: { source: 'context', path: ['__proto__', 'allowed'] },
    right: { source: 'literal', value: true },
  });
  assert.equal(evaluateDomainPredicate(explicitDataPredicate, input), true);
});
