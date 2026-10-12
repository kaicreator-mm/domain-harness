/**
 * V08-FR02 — portable safe expression semantics inside the selected Standard
 * SDK payload (T-D #1003, Task Pack #1003@6122005527, JIT Claim
 * V08_TD_FR02_SELECTED_S_IMPL).
 *
 * Historic v0.7 oracle pins (@86110c616b8cb18c730553e4cdab7ef555214521):
 *   expression-runtime.ts       c37cf23d4987088df8218a124d5a29efdd758e7c
 *   portable-expression.test.ts c9cf11e3114ccf5f1174cf77d174032de15cf6c7
 *   with policy.ts / json-boundary.ts observable semantics retained.
 *
 * v0.8 sealed-module adaptations (documented delta; NO v0.7 ABI promise):
 *   - evaluation is reachable through interpret() as a data-only Rule
 *     declaration field `payloadExpression` — an admissible sealed
 *     declaration, not a proposal-only helper;
 *   - JSONata is not embedded: a bounded deterministic grammar subset is
 *     interpreted, so the sealed module keeps no library import, no eval and
 *     no second runtime;
 *   - `$now()`/`$millis()` are injected from the declaration logicalTime;
 *     the module never reads an ambient clock;
 *   - the v0.7 wall-clock `timeoutMs` becomes a deterministic fixed-rate
 *     evaluation step budget (fail-closed SDK_EXPRESSION_TIMEOUT): same
 *     denial semantics with zero ambient time dependence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  MODULE_ID, ABI_VERSION, ENDPOINTS, StandardSdkError, interpret,
} from '../src/qualified-package/payload/standard-sdk-v1.mjs';
import { qualifyPackageClosure } from '../src/qualified-package/qualify.js';

const LEGACY_CLOCK = '2026-09-17T02:00:00.123Z';
const LEGACY_EXPRESSION = '{"value": input.value * 2, "now": $now(), "millis": $millis()}';

function refused(code: string, fn: () => unknown): void {
  assert.throws(fn, (error: unknown) => error instanceof StandardSdkError && error.code === code);
}

function expressionRule(source: string, fields: Record<string, unknown> = {}) {
  return {
    id: 'rule:fr02-expression',
    kind: 'rule',
    eventType: 'QUOTE_DECIDED',
    payloadExpression: { source, logicalTime: LEGACY_CLOCK, ...fields },
  };
}

function evaluate(source: string, input: unknown, fields: Record<string, unknown> = {}): any {
  return interpret(expressionRule(source, fields), input as never);
}

function payloadOf(result: any): any {
  // v0.7 semantics: callers receive plain JSON (JSON round-trip), so
  // deepEqual against literals is valid without spreading.
  return result.structuredDecision.event.payload;
}

test('V08-FR02-P1 exact v0.7 observed {value:42,now,millis} through a sealed Rule payloadExpression', () => {
  const result = evaluate(LEGACY_EXPRESSION, { input: { value: 21 } });
  const expected = { value: 42, now: LEGACY_CLOCK, millis: Date.parse(LEGACY_CLOCK) };
  assert.deepEqual(payloadOf(result), expected);
  assert.deepEqual({ ...result.structuredDecision.decision.data }, expected);
  assert.equal(result.kind, 'rule');
  assert.equal(result.source, 'harness-machine');
  assert.equal(result.llmAvoided, true);
  assert.deepEqual(result.modelCallEvidence, { status: 'unsupported' });
  assert.equal(Object.hasOwn(result, 'freshModelCallCount'), false);
  assert.equal(Object.hasOwn(result, 'committed'), false);
});

test('V08-FR02-P2 replay is deterministic and the clock is injected logical time, never ambient', () => {
  const first = evaluate(LEGACY_EXPRESSION, { input: { value: 21 } });
  const second = evaluate(LEGACY_EXPRESSION, { input: { value: 21 } });
  assert.deepEqual(second, first);
  const shifted = evaluate(LEGACY_EXPRESSION, { input: { value: 21 } }, {
    logicalTime: '2027-01-02T03:04:05.678Z',
  });
  assert.deepEqual(payloadOf(shifted), {
    value: 42,
    now: '2027-01-02T03:04:05.678Z',
    millis: Date.parse('2027-01-02T03:04:05.678Z'),
  });
});

test('V08-FR02-P3 bounded deterministic grammar subset evaluates portable JSON safely', () => {
  const scope = { input: { a: 4, first: 'a', last: 'b', items: [10, 20, 30], zero: 0 } };
  assert.deepEqual(payloadOf(evaluate('(input.a + 2) * input.a - 3 % 2', scope)), 23);
  assert.deepEqual(payloadOf(evaluate('{"eq": input.a = 21, "ne": input.a != 21}', scope)), { eq: false, ne: true });
  assert.deepEqual(payloadOf(evaluate('input.a >= 4 and input.a < 5 or false', scope)), true);
  assert.deepEqual(payloadOf(evaluate('input.first & "-" & input.last', scope)), 'a-b');
  assert.deepEqual(
    payloadOf(evaluate('[input.a, {"k": input.items[1]}, -input.a, true, false, null, "s", 1.5e2]', scope)),
    [4, { k: 20 }, -4, true, false, null, 's', 150],
  );
  // Current K shorthand ({ruleId,eventType,...} without an explicit kind)
  // composes with the expression path on the same data-only contract.
  const shorthand = {
    ruleId: 'rule:fr02-shorthand',
    eventType: 'QUOTE_DECIDED',
    payloadExpression: { source: '{"doubled": input.value * 2}', logicalTime: LEGACY_CLOCK },
  };
  const shorthanded = interpret(shorthand, { input: { value: 5 } }) as any;
  assert.equal(shorthanded.provenance.declarationId, 'rule:fr02-shorthand');
  assert.deepEqual(payloadOf(shorthanded), { doubled: 10 });
});

test('V08-FR02-P4 retained v0.7 outputSchema validation applies to the expression result', () => {
  const schema = { required: ['score'], properties: { score: 'number' } };
  assert.deepEqual(
    payloadOf(evaluate('{"score": input.raw * 2}', { input: { raw: 21 } }, { outputSchema: schema })),
    { score: 42 },
  );
  refused('SDK_EXPRESSION_OUTPUT_INVALID', () =>
    evaluate('{"score": "wrong"}', { input: { raw: 21 } }, { outputSchema: schema }));
  refused('SDK_EXPRESSION_OUTPUT_INVALID', () =>
    evaluate('{"other": 1}', { input: { raw: 21 } }, { outputSchema: schema }));
});

test('V08-FR02-P5 the extended payload module still passes sealed BUILD closure qualification', async () => {
  const source = await readFile(
    fileURLToPath(new URL('../src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url)),
    'utf8',
  );
  const business = [
    'export const MODULE_ID="business:fixture";',
    'export const PACKAGE_KIND="business";',
    'export const ABI_VERSION="v08-business-abi/1";',
    'export const ENDPOINTS=[{endpointId:"policy",kind:"business-policy"}];',
    'export const INTENT_TYPES=["request"];',
    'export function getPolicy(){return {}};',
  ].join('\n');
  const k = [
    'export const MODULE_ID="kernel:fixture";',
    'export const PACKAGE_KIND="kernel";',
    'export const ABI_VERSION="v08-kernel-abi/1";',
    'export const ENDPOINTS=[{endpointId:"runtime",kind:"occurrence-runtime"}];',
    'export function createOccurrenceRuntime(){return {}};',
  ].join('\n');
  const res = qualifyPackageClosure({
    rootPackageId: 'app:standard-fr02',
    packages: [
      { packageId: 'kernel:fixture', kind: 'kernel', abiVersion: 'v08-kernel-abi/1', modulePath: 'modules/kernel.mjs', moduleSource: k, endpoints: [{ endpointId: 'runtime', kind: 'occurrence-runtime' }] },
      { packageId: MODULE_ID, kind: 'standard-sdk', abiVersion: ABI_VERSION, modulePath: 'modules/sdk.mjs', moduleSource: source, endpoints: [{ endpointId: ENDPOINTS[0].endpointId, kind: ENDPOINTS[0].kind }] },
      { packageId: 'business:fixture', kind: 'business', abiVersion: 'v08-business-abi/1', modulePath: 'modules/business.mjs', moduleSource: business, endpoints: [{ endpointId: 'policy', kind: 'business-policy' }], intentTypes: ['request'] },
    ],
    bindings: [
      { role: 'kernel', packageId: 'kernel:fixture', endpointId: 'runtime' },
      { role: 'standard-sdk', packageId: MODULE_ID, endpointId: ENDPOINTS[0].endpointId },
      { role: 'business', packageId: 'business:fixture', endpointId: 'policy' },
      { role: 'intent', intentType: 'request', packageId: 'business:fixture', endpointId: 'policy' },
    ],
  });
  assert.equal(res.formatVersion, 'v08-build-qualification/1');
  // Sealed-module floor: no import statement and no dynamic code evaluation
  // entered the payload while gaining expression semantics.
  assert.doesNotMatch(source, /(?:^|\n)\s*import\b/);
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /\bnew\s+Function\b/);
});

test('V08-FR02-N1 $eval/$random/clock-argument/unknown-function policy denials fail closed', () => {
  const denial = (code: string, pattern: RegExp, source: string) => {
    assert.throws(
      () => evaluate(source, {}),
      (error: unknown) =>
        error instanceof StandardSdkError && error.code === code && pattern.test(error.message),
    );
  };
  denial('SDK_EXPRESSION_FORBIDDEN', /\$eval is forbidden/, '$eval("1+1")');
  denial('SDK_EXPRESSION_FORBIDDEN', /\$random is forbidden/, '$random()');
  denial('SDK_EXPRESSION_FORBIDDEN', /arguments are not supported/, '$now("[Y]")');
  denial('SDK_EXPRESSION_FORBIDDEN', /arguments are not supported/, '$millis("ignored")');
  denial('SDK_EXPRESSION_FORBIDDEN', /\$eval is forbidden/, 'input.value + $eval');
  denial('SDK_EXPRESSION_FORBIDDEN', /unknown or forbidden/, '$sum(input.items)');
  denial('SDK_EXPRESSION_FORBIDDEN', /unknown or forbidden/, '$dateNow()');
});

test('V08-FR02-N2 deterministic timeout budget and UTF-8 byte limits fail closed', () => {
  // v0.7 utf8ByteLength semantics: '缅甸' is 6 UTF-8 bytes, not 2 chars.
  assert.throws(
    () => evaluate('1', { text: '缅甸' }, { maxInputBytes: 10 }),
    (error: unknown) => error instanceof StandardSdkError && error.code === 'SDK_EXPRESSION_BOUNDS' && /maxInputBytes/.test(error.message),
  );
  assert.throws(
    () => evaluate('"缅甸"', {}, { maxOutputBytes: 5 }),
    (error: unknown) => error instanceof StandardSdkError && error.code === 'SDK_EXPRESSION_BOUNDS' && /maxOutputBytes/.test(error.message),
  );
  // timeoutMs maps to a fixed-rate deterministic step budget; the smallest
  // legal declaration budget (1ms = 512 steps) cannot evaluate a
  // 1000-element structure (1001 nodes, still inside the AST budget).
  assert.throws(
    () => evaluate(`[${Array.from({ length: 1000 }, () => '1').join(',')}]`, {}, { timeoutMs: 1 }),
    (error: unknown) => error instanceof StandardSdkError && error.code === 'SDK_EXPRESSION_TIMEOUT',
  );
  // Bounded expression cost: AST node budget and source length budget.
  assert.throws(
    () => evaluate(`[${Array.from({ length: 5000 }, () => '1').join(',')}]`, {}),
    (error: unknown) => error instanceof StandardSdkError && error.code === 'SDK_EXPRESSION_BOUNDS' && /node budget/.test(error.message),
  );
  assert.throws(
    () => evaluate(`${'1 + '.repeat(30000)}1`, {}),
    (error: unknown) => error instanceof StandardSdkError && error.code === 'SDK_EXPRESSION_BOUNDS' && /source length/.test(error.message),
  );
});

test('V08-FR02-N3 malicious values, unsafe results and invalid declarations fail closed', () => {
  // v0.7 detected cycles via a WeakSet walk (isPortableJsonValue); the sealed
  // v0.8 snapshot is depth-bounded instead, so a cyclic input fails closed
  // deterministically as SDK_DATA_BOUNDS before any expression evaluation.
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  refused('SDK_DATA_BOUNDS', () => evaluate('1', cyclic));
  refused('SDK_DATA_UNSAFE', () => evaluate('1', { bad: Number.NaN }));

  let getterReads = 0;
  const accessor = { kind: 'rule', id: 'rule:fr02-getter', eventType: 'QUOTE_DECIDED' };
  Object.defineProperty(accessor, 'payloadExpression', {
    enumerable: true,
    get() {
      getterReads += 1;
      return { source: '1', logicalTime: LEGACY_CLOCK };
    },
  });
  refused('SDK_DATA_UNSAFE', () => interpret(accessor, {}));
  assert.equal(getterReads, 0);

  refused('SDK_EXPRESSION_UNSAFE', () => evaluate('{"__proto__": 1}', {}));
  refused('SDK_EXPRESSION_UNSAFE', () => evaluate('1 / input.zero', { input: { zero: 0 } }));
  refused('SDK_EXPRESSION_UNSAFE', () => evaluate('input.missing.deep', { input: {} }));
  refused('SDK_EXPRESSION_UNSAFE', () => evaluate('input.value & 1', { input: { value: 's' } }));
  refused('SDK_EXPRESSION_UNSAFE', () => evaluate('(1', {}));

  refused('SDK_DECLARATION_INVALID', () => evaluate('1', {}, { logicalTime: 'not-a-timestamp' }));
  refused('SDK_DECLARATION_INVALID', () => interpret({
    id: 'rule:fr02-missing-source', kind: 'rule', eventType: 'QUOTE_DECIDED',
    payloadExpression: { logicalTime: LEGACY_CLOCK },
  }, {}));
  refused('SDK_DECLARATION_INVALID', () => interpret({
    id: 'rule:fr02-ambiguous', kind: 'rule', eventType: 'QUOTE_DECIDED',
    payloadFromInput: { amount: 'amount' },
    payloadExpression: { source: '1', logicalTime: LEGACY_CLOCK },
  }, { amount: 1 }));
  refused('SDK_DECLARATION_INVALID', () => evaluate('1', {}, { timeoutMs: 0 }));
  refused('SDK_DECLARATION_INVALID', () => evaluate('1', {}, { maxInputBytes: 10_000_000 }));
});
