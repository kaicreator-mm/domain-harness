/** N07 public TS/ESM API contract: no fake Host bootstrap or effect runtime. */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as publicV9 from '../src/public-v9/index.js';
import type {
  V9DomainFacade, V9DomainHarness, V9PublicSendIntent,
  V9WorkflowRouterResult,
} from '../src/public-v9/index.js';

/**
 * Compile-only negative assertions: never called at runtime. These ensure
 * public load is exactly a single installed STRING and ordinary intent/data
 * cannot bring an issuer, principal or Host port into the contract.
 */
function typeContract(harness: V9DomainHarness, facade: V9DomainFacade) {
  const installedOnly = harness.load('dhv9inst-opaque-host-issued-string');
  void installedOnly;
  // @ts-expect-error raw sealed roots are not accepted by public load
  harness.load({ formatVersion: 'dh.v9.sealed-root/1' });
  // @ts-expect-error no public Host verifier / options overload
  harness.load('dhv9inst-token', { verifyApproval: () => true });
  const input: V9PublicSendIntent = {
    intentType: 'demo.request', instanceKey: 'i-1', messageId: 'm-1', input: { text: 'hello' },
  };
  void facade.send(input);
  // @ts-expect-error public send cannot mint caller principal or roles
  facade.send({ intentType: 'demo.request', instanceKey: 'i-1', messageId: 'm-1', caller: { role: 'admin' } });
  // @ts-expect-error protected H verifier is not a public scoped query kind
  facade.query({ kind: 'host-ports', instanceKey: 'i-1' });
  // @ts-expect-error no raw Kernel or Host namespace getter
  void facade.getModuleNamespace();
}
void typeContract;

const selected = {
  kind: 'selected', operationId: 'create', capabilityId: 'storage',
  handlerId: 'append', basisDigest: 'sha256-selected-basis',
} as const satisfies V9WorkflowRouterResult;
const ambiguous = {
  kind: 'ambiguous', intentId: 'demo.request', candidateOperationIds: ['a', 'b'],
} as const satisfies V9WorkflowRouterResult;
const denied = { kind: 'denied', reasonCode: 'SCOPE' } as const satisfies V9WorkflowRouterResult;
const missing = { kind: 'missing', intentId: 'demo.request' } as const satisfies V9WorkflowRouterResult;

test('V09-N07-API01: public runtime exports are the wired one-verb value plus the frozen error surface', () => {
  // #1132/#1118 wired the real protected facade: DomainHarness exposes
  // exactly load(installedRef) under the trusted Host request scope. The
  // namespace still carries no privileged name.
  assert.deepEqual(Object.keys(publicV9).sort(), [
    'DomainHarness', 'DomainHarnessV9Error', 'V9_PUBLIC_ERROR_CODES', 'publicInstalledReferenceFailure',
  ]);
  assert.deepEqual(Object.keys(publicV9.DomainHarness), ['load']);
  assert.equal(publicV9.DomainHarness.load.length, 1);
  assert.equal('createProtectedHostV09' in publicV9, false);
  assert.equal('issueV09ApprovalProof' in publicV9, false);
  assert.equal('getModuleNamespace' in publicV9, false);
  assert.equal('install' in publicV9, false);
});

test('V09-N07-API02: Standard selection discriminants preserve D05 pure outcomes', () => {
  assert.equal(selected.kind, 'selected');
  assert.equal(selected.capabilityId, 'storage');
  assert.equal(ambiguous.kind, 'ambiguous');
  assert.deepEqual(ambiguous.candidateOperationIds, ['a', 'b']);
  assert.equal(denied.kind, 'denied');
  assert.equal(missing.kind, 'missing');
});
