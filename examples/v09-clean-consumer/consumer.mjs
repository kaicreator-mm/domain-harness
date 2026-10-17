/**
 * #1119 — the ordinary consumer app module of the v0.9 clean-consumer example.
 *
 * This file imports ONLY the published consumer app API subpath
 * `@kaicreator/domain-harness/v9` from the npm-installed package — never the
 * deployment entry, never a monorepo source path. The deployment operator
 * (operator.mjs) calls its request handlers inside the trusted Host request
 * scope it established.
 */
import assert from 'node:assert/strict';
import { DomainHarness, DomainHarnessV9Error } from '@kaicreator/domain-harness/v9';

/** The published consumer surface: exactly one verb, one argument. */
export function assertConsumerSurface() {
  assert.deepEqual(Object.keys(DomainHarness), ['load']);
  assert.equal(DomainHarness.load.length, 1);
  for (const privileged of [
    'attachV09TrustedBridge', 'runV09InTrustedHostScope', 'isV09AuthenticatedBridgeHarness',
    'createV09DomainHarnessBridge', 'createProtectedHostV09', 'issueV09ApprovalProof',
  ]) {
    assert.equal(Object.hasOwn(DomainHarness, privileged), false, `consumer value must not carry ${privileged}`);
  }
}

/** Map any public refusal onto its frozen D04 family code. */
async function outcome(promise) {
  return promise.then(
    (value) => ({ ok: true, value }),
    (error) => {
      assert.ok(error instanceof DomainHarnessV9Error, `expected a public DomainHarnessV9Error, got ${error?.constructor?.name}`);
      assert.equal(error.cause, undefined, 'public errors never carry a protected cause');
      return { ok: false, code: error.code };
    },
  );
}

/** One request: load the installed reference this deployment serves. */
export async function loadRequest(installedRef) {
  return outcome(DomainHarness.load(installedRef));
}

/** Hostile variant: try to smuggle a caller-supplied Host/verifier object. */
export async function loadRequestWithSmuggledAuthority(installedRef) {
  return outcome(DomainHarness.load(installedRef, { verifier: { verify: () => true }, host: { load: async () => 'FORGED_ACK' } }));
}

/** Send one business intent on a loaded facade. */
export async function sendRequest(facade, intent) {
  return outcome(facade.send(intent));
}

/** Query one business instance snapshot on a loaded facade. */
export async function queryRequest(facade, instanceKey) {
  return outcome(facade.query({ kind: 'instance', instanceKey }));
}

/** Subscribe a receipt observer; returns { subscription, received } helper. */
export async function subscribeRequest(facade) {
  const received = [];
  const result = await outcome(facade.subscribe((receipt) => received.push(receipt)));
  if (!result.ok) return result;
  return { ok: true, received, subscription: result.value };
}

/** Unsubscribe inside the same trusted request scope. */
export async function unsubscribeRequest(subscription) {
  return outcome(subscription.unsubscribe());
}

/** Stop the facade lifecycle (authenticated teardown). */
export async function stopRequest(facade) {
  return outcome(facade.stop());
}
