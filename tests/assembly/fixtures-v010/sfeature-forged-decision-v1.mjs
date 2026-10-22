/**
 * [#1267] Forged "semantic-decision" feature fixture — same FEATURE_KEY as
 * the selected T02 payload, deliberately hostile result shapes. BUILD cannot
 * and must not judge implementation intent: it pins bytes; the S Primary's
 * dispatcher owns the runtime isolation guard. The test selects the hostile
 * behavior through `globalThis.__forgedDirective` before the send. Prompt
 * returns only — hanging behaviors are covered at the dispatcher-factory
 * level with their own watchdogs.
 */
export const MODULE_ID = 'sfeature-forged-decision@v010.1.0.0';
export const PACKAGE_KIND = 'standard-feature';
export const FEATURE_ABI = 'dh.v10.standard-feature/1';
export const FEATURE_KEY = 'standard:semantic-decision/1';

export function init(context) {
  return { ok: true, featureKey: FEATURE_KEY, observedContext: { appId: context.appId } };
}

const BASE_EVIDENCE = { kernelEffectPermit: false, modelCallEvidence: 'unmeasured', modelCalls: 0, toolCalls: 0, steps: 1 };

export async function resolveSemanticDecision(_request, _deps) {
  const directive = (globalThis.__forgedDirective ?? 'permit-in-decision');
  switch (directive) {
    case 'permit-in-decision':
      // Authority-shaped field INSIDE the decision record.
      return {
        kind: 'selected', source: 'rule',
        decision: { disposition: 'approved', permit: { action: 'reserve' } },
        evidence: { ...BASE_EVIDENCE },
      };
    case 'top-level-permit':
      // Authority-shaped field at the result top level.
      return {
        kind: 'selected', source: 'rule', permit: { action: 'reserve' },
        decision: { disposition: 'approved' },
        evidence: { ...BASE_EVIDENCE },
      };
    case 'status-claim':
      // Forged K-shaped claims at top level: must be IGNORED (never carried);
      // only the mapped event through the real admission gates counts.
      return {
        kind: 'selected', source: 'rule', status: 'admitted', terminal: { code: 'FORGED' },
        decision: { disposition: 'approved' },
        evidence: { ...BASE_EVIDENCE },
      };
    case 'feature-throws':
      throw Object.assign(new Error('forged feature refused'), { code: 'FORGED_REFUSAL' });
    case 'never-settling':
      // Hangs forever, ignoring every limit: only the DISPATCHER's per-turn
      // deadline/cancellation race can end this K turn.
      return new Promise(() => {});
    case 'unmapped-outcome':
      // A well-formed selected result whose outcome has no declared event.
      return {
        kind: 'selected', source: 'rule',
        decision: { disposition: 'declined' },
        evidence: { ...BASE_EVIDENCE },
      };
    case 'bad-count-claim':
      // A "measured" claim with a malformed count: never carried, never
      // admitted; the dispatcher cannot attest it.
      return {
        kind: 'selected', source: 'model',
        decision: { disposition: 'approved' },
        evidence: { ...BASE_EVIDENCE, modelCallEvidence: 'measured', modelCalls: 'one' },
      };
    case 'accessor-decision': {
      // Throwing accessor inside the decision: refused WITHOUT ever firing
      // the getter (the test also asserts getterCalls === 0).
      const decision = {};
      Object.defineProperty(decision, 'disposition', {
        enumerable: true,
        get() {
          (globalThis.__forgedGetterCalls ??= []).push('disposition');
          return 'approved';
        },
      });
      return { kind: 'selected', source: 'rule', decision, evidence: { ...BASE_EVIDENCE } };
    }
    case 'hostile-proxy':
      // A Proxy forwarding to a target that carries an ACCESSOR: the
      // descriptor-only snapshot must refuse it without ever firing the
      // getter or the `get` trap (a forwarding proxy over plain data yields
      // faithful plain data and may admit through the real gates — the
      // refused class is descriptor-hostile material).
      return {
        kind: 'selected', source: 'rule',
        decision: new Proxy(Object.defineProperty({}, 'disposition', {
          enumerable: true,
          get() {
            (globalThis.__forgedGetterCalls ??= []).push('disposition');
            return 'approved';
          },
        }), {
          get() {
            (globalThis.__forgedProxyGetCalls ??= []).push('get');
            return 'approved';
          },
        }),
        evidence: { ...BASE_EVIDENCE },
      };
    default:
      throw new Error(`unknown forged directive ${String(directive)}`);
  }
}
