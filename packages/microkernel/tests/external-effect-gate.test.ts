/**
 * v0.10.2 T04 (#1324) — the Microkernel external-effect gate consumes the
 * K-owned read-only authority view (L2 §2), never a Host-side mirror:
 *
 *   - the K view is the ONLY durable-truth re-read; its refusal code and
 *     message cross unchanged (typed, zero adapter dispatch, marked attest);
 *   - a selected K WITHOUT the protocol export (readAuthorityView absent)
 *     refuses V10_EFFECT_PERMIT_REQUIRED with zero adapter dispatch and the
 *     pre-handler-refusal mark — the gate half of the T01k negative 1 slot;
 *   - the get-only docs port is the gate's only K access; the await policy
 *     comes from the view answer.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchThroughExternalEffectGate } from '../src/internal/external-effect.js';
import type { V10EffectAuthorityView } from '../src/internal/external-effect.js';
import { V10Error } from '@kaicreator/domain-harness-contracts';

const NOW = '2026-10-25T00:00:00.000Z';
const CLAIM = {
  effectId: 'effect:t04-1',
  durableControlTurnId: 'turn:t04-1',
  businessPackageId: 'pkg:quote@1.0.0',
  keys: { permit: 'k:permit', journal: 'k:journal', fence: 'k:fence', dispatchClaim: 'k:claim' },
};
const GOOD_ATTEST = { effectPermit: { ...CLAIM } };

function makeDeps(view: V10EffectAuthorityView | undefined, tally: { dispatches: number; refusals: string[] }) {
  return {
    docs: {
      get: async () => await Promise.resolve({ value: {}, revision: 1 }),
    },
    readAuthorityView: view,
    nowIso: () => NOW,
    onDispatch: () => { tally.dispatches += 1; },
    onRefusal: (code: string) => { tally.refusals.push(code); },
  };
}

test('T04-GATE-1: a K view refusal crosses unchanged with zero dispatch and the marked attest', async () => {
  const tally = { dispatches: 0, refusals: [] as string[] };
  const view: V10EffectAuthorityView = async () => ({ ok: false, code: 'V10_EFFECT_PERMIT_CONSUMED', message: 'K-issued effect permit is not live' });
  const attest = { effectPermit: { ...CLAIM } };
  await assert.rejects(
    () => dispatchThroughExternalEffectGate(makeDeps(view, tally), {
      capabilityId: 'cap:x', operationId: 'op:y', payload: {}, attest,
      invoke: async () => { throw new Error('must never dispatch'); },
    }),
    (error: unknown) => error instanceof V10Error && error.code === 'V10_EFFECT_PERMIT_CONSUMED',
  );
  assert.equal(tally.dispatches, 0);
  assert.deepEqual(tally.refusals, ['V10_EFFECT_PERMIT_CONSUMED']);
  assert.equal((attest as { preHandlerRefusal?: string }).preHandlerRefusal, 'V10_EFFECT_PERMIT_CONSUMED');
});

test('T04-GATE-2: no attest claim refuses before the view is ever consulted', async () => {
  const tally = { dispatches: 0, refusals: [] as string[] };
  let viewCalls = 0;
  const view: V10EffectAuthorityView = async () => { viewCalls += 1; return { ok: true, effectId: 'e', durableControlTurnId: 't', attempt: 1, awaitPolicy: 'phase' }; };
  await assert.rejects(
    () => dispatchThroughExternalEffectGate(makeDeps(view, tally), {
      capabilityId: 'cap:x', operationId: 'op:y', payload: {}, attest: {},
      invoke: async () => { throw new Error('must never dispatch'); },
    }),
    (error: unknown) => (error as V10Error).code === 'V10_EFFECT_PERMIT_REQUIRED',
  );
  assert.equal(viewCalls, 0, 'the claim-shape check precedes the K view');
  assert.equal(tally.dispatches, 0);
});

test('T04-GATE-3 (T01k negative-1 gate half): a K without the protocol export refuses with zero dispatch and the marked attest', async () => {
  const tally = { dispatches: 0, refusals: [] as string[] };
  const attest = { effectPermit: { ...CLAIM } };
  await assert.rejects(
    () => dispatchThroughExternalEffectGate(makeDeps(undefined, tally), {
      capabilityId: 'cap:x', operationId: 'op:y', payload: {}, attest,
      invoke: async () => { throw new Error('must never dispatch'); },
    }),
    (error: unknown) => error instanceof V10Error && error.code === 'V10_EFFECT_PERMIT_REQUIRED',
  );
  assert.equal(tally.dispatches, 0, 'adapter dispatch count is exactly zero');
  assert.deepEqual(tally.refusals, ['V10_EFFECT_PERMIT_REQUIRED']);
  assert.equal((attest as { preHandlerRefusal?: string }).preHandlerRefusal, 'V10_EFFECT_PERMIT_REQUIRED');
});

test('T04-GATE-4: an ok view answer dispatches once under the view-derived permit tuple and await policy', async () => {
  const tally = { dispatches: 0, refusals: [] as string[] };
  const readKeys: string[] = [];
  const view: V10EffectAuthorityView = async (options) => {
    readKeys.push(await Promise.resolve('checked')); // the view owns its own reads through get
    assert.equal(typeof options.get, 'function');
    return { ok: true, effectId: CLAIM.effectId, durableControlTurnId: CLAIM.durableControlTurnId, attempt: 2, awaitPolicy: 'phase' };
  };
  const envelope = await dispatchThroughExternalEffectGate(makeDeps(view, tally), {
    capabilityId: 'cap:x', operationId: 'op:y', payload: { a: 1 }, attest: { effectPermit: { ...CLAIM } },
    invoke: async (payload, context) => {
      assert.deepEqual(payload, { a: 1 });
      assert.deepEqual(context.effectPermit, { effectId: CLAIM.effectId, durableControlTurnId: CLAIM.durableControlTurnId, attempt: 2 });
      return { phase: 'accepted', externalRef: 'ref:1' };
    },
  });
  assert.equal(envelope.phase, 'accepted');
  assert.equal(tally.dispatches, 1);
  assert.deepEqual(tally.refusals, []);
});

test('T04-GATE-5: await terminal from the view fails closed on a non-terminal adapter envelope', async () => {
  const tally = { dispatches: 0, refusals: [] as string[] };
  const view: V10EffectAuthorityView = async () => ({ ok: true, effectId: 'e', durableControlTurnId: 't', attempt: 1, awaitPolicy: 'terminal' });
  await assert.rejects(
    () => dispatchThroughExternalEffectGate(makeDeps(view, tally), {
      capabilityId: 'cap:x', operationId: 'op:y', payload: {}, attest: { effectPermit: { ...CLAIM } },
      invoke: async () => ({ phase: 'accepted', externalRef: 'ref:1' }),
    }),
    (error: unknown) => error instanceof V10Error && error.code === 'V10_EXTERNAL_PENDING',
  );
  assert.equal(tally.dispatches, 1, 'the adapter ran; the refusal is honest post-dispatch');
  // No pre-handler-refusal mark after a real dispatch (#1108 K01 discipline).
  assert.equal((GOOD_ATTEST as { preHandlerRefusal?: string }).preHandlerRefusal, undefined);
});
