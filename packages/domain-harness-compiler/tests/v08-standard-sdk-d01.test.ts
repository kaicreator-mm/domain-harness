/**
 * V08-ABI-D01 — Standard SDK *package-owned* five-Kind contract.
 * Native Node tests: the selected module is imported from its own ESM file
 * (not routed into DomainHarness Kernel or Host runtime).
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  ABI_VERSION, ENDPOINTS, MODULE_ID, PACKAGE_KIND, STANDARD_KINDS,
  StandardSdkError, interpret,
} from '../src/qualified-package/payload/standard-sdk-v1.mjs';
import { qualifyPackageClosure } from '../src/qualified-package/qualify.js';

function refused(code: string, execute: () => unknown): void {
  assert.throws(execute, (error: unknown) => error instanceof StandardSdkError && error.code === code);
}
const e = (kind: string, fields: Record<string, unknown> = {}) =>
  ({ id: 'declaration:1', kind, ...fields });

test('V08-ABI-D01-P1 actual module self-describes the selected Standard Package ABI', async () => {
  assert.equal(MODULE_ID, 'standard-sdk@v08.1.0.0');
  assert.equal(PACKAGE_KIND, 'standard-sdk');
  assert.equal(ABI_VERSION, 'v08-standard-sdk-abi/1');
  assert.deepEqual(STANDARD_KINDS, ['schema', 'rule', 'decision', 'workflow', 'operation']);
  assert.deepEqual(ENDPOINTS.map((x: { kind: string }) => x.kind), ['rule-interpreter']);
  const source = await readFile(fileURLToPath(new URL('../src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url)), 'utf8');
  // Real BUILD static analyzer must see required ABI exports and no bare
  // imports, calls to eval/Function or transitive dynamic imports.
  const business = (id: string, type: string, abi: string, handler: string) =>
    [
      `export const MODULE_ID=${JSON.stringify(id)};`,
      `export const PACKAGE_KIND=${JSON.stringify(type)};`,
      `export const ABI_VERSION=${JSON.stringify(abi)};`,
      'export const ENDPOINTS=[{endpointId:"policy",kind:"business-policy"}];',
      'export const INTENT_TYPES=["request"];',
      handler,
    ].join('\n');
  const k = [
    'export const MODULE_ID="kernel:fixture";',
    'export const PACKAGE_KIND="kernel";',
    'export const ABI_VERSION="v08-kernel-abi/1";',
    'export const ENDPOINTS=[{endpointId:"runtime",kind:"occurrence-runtime"}];',
    'export function createOccurrenceRuntime(){return {}};',
  ].join('\n');
  const b = business('business:fixture', 'business', 'v08-business-abi/1', 'export function getPolicy(){return {}};');
  const res = qualifyPackageClosure({
    rootPackageId: 'app:standard-test',
    packages: [
      { packageId: 'kernel:fixture', kind: 'kernel', abiVersion: 'v08-kernel-abi/1', modulePath: 'modules/kernel.mjs', moduleSource: k, endpoints: [{ endpointId: 'runtime', kind: 'occurrence-runtime' }] },
      { packageId: MODULE_ID, kind: 'standard-sdk', abiVersion: ABI_VERSION, modulePath: 'modules/sdk.mjs', moduleSource: source, endpoints: [{ endpointId: ENDPOINTS[0].endpointId, kind: ENDPOINTS[0].kind }] },
      { packageId: 'business:fixture', kind: 'business', abiVersion: 'v08-business-abi/1', modulePath: 'modules/business.mjs', moduleSource: b, endpoints: [{ endpointId: 'policy', kind: 'business-policy' }], intentTypes: ['request'] },
    ],
    bindings: [
      { role: 'kernel', packageId: 'kernel:fixture', endpointId: 'runtime' },
      { role: 'standard-sdk', packageId: MODULE_ID, endpointId: ENDPOINTS[0].endpointId },
      { role: 'business', packageId: 'business:fixture', endpointId: 'policy' },
      { role: 'intent', intentType: 'request', packageId: 'business:fixture', endpointId: 'policy' },
    ],
  });
  assert.equal(res.formatVersion, 'v08-build-qualification/1');
  assert.equal(res.packages.length, 3);
});

test('V08-ABI-D01-P2 rule reuses exact #994 deterministic payload projection, never commits a state', () => {
  const d = e('rule', { eventType: 'QUOTE_DECIDED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } });
  const r = interpret(d, { amount: 30, requestId: 'Q1' }) as any;
  assert.equal(r.structuredDecision.event.type, 'QUOTE_DECIDED');
  assert.deepEqual({ ...r.structuredDecision.event.payload }, { amount: 30, requestId: 'Q1' });
  assert.deepEqual({ ...r.structuredDecision.decision.data }, { amount: 30, requestId: 'Q1' });
  assert.equal(r.source, 'harness-machine');
  assert.equal(r.llmAvoided, true);
  assert.equal(Object.hasOwn(r, 'freshModelCallCount'), false);
  assert.deepEqual(r.modelCallEvidence, { status: 'unsupported' });
  assert.equal(Object.hasOwn(r, 'committed'), false);
});

test('V08-ABI-D01-P3 Schema/Decision/Workflow/Operation produce proposals, not effects', () => {
  const schema = interpret(e('schema', { required: ['partNo'], properties: { partNo: 'string', qty: 'number' } }), { partNo: 'A1', qty: 3 }) as any;
  assert.equal(schema.valid, true);
  assert.equal(interpret(e('schema', { required: ['qty'] }), {})['valid'], false);
  const d = e('decision', { cases: [{ when: { field: 'qty', equals: 3 }, outcome: 'eligible' }, { when: { field: 'qty', equals: 4 }, outcome: 'hold' }] });
  assert.equal(interpret(d, { qty: 3 })['outcome'], 'eligible');
  assert.equal(interpret(d, { qty: 5 })['outcome'], null);
  const w = interpret(e('workflow', { from: 'review', trigger: 'APPROVE', to: 'approved' }), { state: 'review', trigger: 'APPROVE' }) as any;
  assert.deepEqual({ ...w.candidate }, { from: 'review', to: 'approved', trigger: 'APPROVE' });
  assert.equal(Object.hasOwn(w, 'state'), false);
  const o = interpret(e('operation', { operationId: 'reserve', resourceKey: 'warehouse', inputFrom: { sku: 'sku' } }), { sku: 'P42' }) as any;
  assert.deepEqual({ ...o.proposal.input }, { sku: 'P42' });
  assert.equal(o.proposal.resourceKey, 'warehouse');
  assert.equal(Object.hasOwn(o, 'effectExecuted'), false);
});

test('V08-ABI-D01-N1 unsafe records, accessors and prototype keys denied without access', () => {
  let count = 0;
  const dangerous = { kind: 'rule', id: 'id:1', eventType: 'TEST' };
  Object.defineProperty(dangerous, 'payloadFromInput', { enumerable: true, get() { count++; return {}; } });
  refused('SDK_DATA_UNSAFE', () => interpret(dangerous, {}));
  assert.equal(count, 0);
  const input = JSON.parse('{"__proto__":1}');
  refused('SDK_DATA_UNSAFE', () => interpret(e('rule', { eventType: 'TEST' }), input));
  refused('SDK_DATA_UNSAFE', () => interpret(e('rule', { eventType: 'TEST' }), { nested: new Date() }));
});

test('V08-ABI-D01-N2 missing projection and unknown Kind fail closed', () => {
  refused('SDK_PROJECTION_MISSING', () => interpret(e('rule', { eventType: 'TEST', payloadFromInput: { x: 'missing' } }), {}));
  refused('SDK_KIND_UNSUPPORTED', () => interpret(e('Script'), {}));
  refused('SDK_DECLARATION_INVALID', () => interpret(e('operation', { operationId: '__proto__', resourceKey: 'warehouse' }), {}));
});

test('V08-ABI-D01-N3 bounded decisions, unsafe Outcome and real ModelPort claim ignored', () => {
  refused('SDK_DECLARATION_INVALID', () => interpret(e('decision', { cases: Array.from({ length: 65 }, () => ({ when: { field: 'x', equals: 1 }, outcome: 'ok' })) }), { x: 1 }));
  refused('SDK_DECLARATION_INVALID', () => interpret(e('decision', { cases: [{ when: { field: 'x', equals: 1 }, outcome: '__proto__' }] }), { x: 1 }));
  const fakeMeter = { freshModelCallCount: 999, modelCalls: { status: 'measured', count: 999 } };
  const r = interpret(e('rule', { eventType: 'TEST' }), { x: 1 }, fakeMeter) as any;
  assert.deepEqual(r.modelCallEvidence, { status: 'unsupported' });
  assert.equal(Object.hasOwn(r, 'freshModelCallCount'), false);
});

test('V08-ABI-D01-N4 no business/admission side effects or caller-injected operation', () => {
  const d = e('operation', { operationId: 'reserve', resourceKey: 'warehouse', inputFrom: { sku: 'sku' } });
  const r = interpret(d, { sku: 'P1', execute: true, callerRole: 'admin' }) as any;
  assert.deepEqual({ ...r.proposal.input }, { sku: 'P1' });
  assert.equal(Object.hasOwn(r, 'allow'), false);
  assert.equal(Object.hasOwn(r, 'journal'), false);
  assert.equal(Object.hasOwn(r, 'runtime'), false);
});
