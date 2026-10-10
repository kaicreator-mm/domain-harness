/**
 * Shared falsifier fixtures (experiment KPK-01)
 * =============================================
 * The v0.7-mirroring golden scenario constants (identical to
 * packages/domain-harness/tests/admission/helpers.ts @ v0.7): fixed clock,
 * target, message, event, guard, invariant and effect intent. Using the same
 * constants on both sides of the KPK-14 differential makes the semantic
 * comparison meaningful without claiming legacy API parity.
 */

import { createHash } from 'node:crypto';
import { load, buildPackageRoot, createMemoryHost } from '../index.mjs';

export const NOW = '2026-09-21T07:00:00.000Z';
export const TARGET = { workflowId: 'order-quote', instanceKey: 'instance:42' };
export const WORKFLOW_INSTANCE_ID = 'order-quote:instance:42';
export const MSG_1 = 'msg:1';
export const TURN_ID = 'turn:order-quote:instance%3A42:message:msg%3A1';
export const EFFECT_ID = `${TURN_ID}/effect/1`;

/** v0.7-side sha256 fixture port (identical to v0.7 admission test helpers). */
export const sha256Fixture = {
  async digestUtf8(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

export async function loadApprovalRuntime({ now = () => NOW, host } = {}) {
  const hostPorts = host ?? createMemoryHost({ now });
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });
  const runtime = await load(pkg, { hostPorts });
  return { runtime, host: hostPorts, pkg };
}

export async function openedApprovalRuntime(options = {}) {
  const ctx = await loadApprovalRuntime(options);
  await ctx.runtime.openInstance({ target: TARGET, correlationId: 'corr:42' });
  return ctx;
}

export function quoteIntent({ amount, messageId = MSG_1, role = 'requester', strict = false } = {}) {
  return {
    kind: 'kpk01/intent',
    intentType: strict ? 'submitQuoteDecisionStrict' : 'submitQuoteDecision',
    target: TARGET,
    messageId,
    input: { amount },
    caller: { role },
  };
}
