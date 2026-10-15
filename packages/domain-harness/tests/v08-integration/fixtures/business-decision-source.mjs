/**
 * Business Domain Package — DecisionSource quote v1.0.0 (#1003 FR08
 * general / FR09 / FR12 fixture).
 * ==========================================================================
 *
 * A #1003-Builder-authored Business package whose intents are bound to
 * `decision-source` rule declarations — the compiled retained-resolver
 * vocabulary (Rule -> Exact Cache -> Promoted -> bounded Harness fallback)
 * the selected Kernel wires at its trusted load boundary and the retained
 * Standard SDK semantics (resolveRetainedDecision /
 * selectRetainedPromotedChild / checkRetainedEvidenceApplicability) select
 * over. Each rule carries its canonical `declarationDigest`, verified once
 * at the load boundary exactly like the SemanticDecision descriptors.
 *
 * This package owns business policy ONLY — no admission/journal/state
 * mechanism code, no kernel imports, no model calls, no cache or pin store
 * (those are Kernel-owned Host document records).
 *
 *   - `rule:ds-quote`     the full ordering fixture: a deterministic rule
 *                         leg (input-projected payload), an exact-cache leg
 *                         pinned to the `priceListRevision` dependency, a
 *                         governed promoted leg (approved pinned artifact,
 *                         gated on `route === 'promoted'`) and the bounded
 *                         harness fallback.
 *   - `rule:ds-drift`     harness + cache only: proves the dependency-drift
 *                         stale-cache miss (the first admitted turn
 *                         projects `priceListRevision`, so the second
 *                         lookup under the new dependency material cannot
 *                         serve the first turn's entry).
 *   - `rule:ds-revoked`   promoted-only leg referencing a REVOKED approved
 *                         artifact: the retained S selection refuses the
 *                         turn closed before any Kernel admission.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-decision-source@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:decision-source-quote', kind: 'business-policy' },
];

/** Intent types this policy binds. */
export const INTENT_TYPES = [
  'submitQuote',
  'submitDriftQuote',
  'submitRevokedChild',
];
/** Effect types this policy declares handlers for. */
export const EFFECT_TYPES = ['effect:reserve'];

/** Deny any decided event whose payload.amount exceeds 100 (cap invariant). */
const CAP_INVARIANT = {
  invariantId: 'inv:cap-100',
  predicate: {
    op: 'not',
    predicate: {
      op: 'gt',
      left: { source: 'event', path: ['payload', 'amount'] },
      right: { source: 'literal', value: 100 },
    },
  },
};

/** The decided amount must stay within the quota the decision itself declares. */
const GUARD_AMOUNT_WITHIN_QUOTA = {
  guardId: 'guard:amount-within-quota',
  predicate: {
    op: 'lte',
    left: { source: 'event', path: ['payload', 'amount'] },
    right: { source: 'event', path: ['payload', 'quotaAfter'] },
  },
};

function dsQuoteDefinition() {
  return {
    workflowKey: 'ds-quote',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_AMOUNT_WITHIN_QUOTA],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'decide',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'review',
            guardId: 'guard:amount-within-quota',
            effectIntents: [
              {
                effectType: 'effect:reserve',
                input: { reservation: 'ds-quote' },
              },
            ],
            // Write-once lineage: the first admitted turn durably fixes the
            // remaining quota and the price-list dependency revision every
            // later exact-cache lookup of this instance is pinned to.
            contextProjection: {
              remainingQuota: { source: 'event', path: ['payload', 'quotaAfter'] },
              priceListRevision: { source: 'event', path: ['payload', 'revision'] },
            },
          },
        ],
      },
    ],
  };
}

const decisionSchema = {
  isValid(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const decision = value.decision;
    const event = value.event;
    if (typeof decision !== 'object' || decision === null || Array.isArray(decision)) return false;
    if (typeof event !== 'object' || event === null || Array.isArray(event)) return false;
    return typeof decision.outcome === 'string'
      && typeof event.type === 'string';
  },
};

/**
 * The approved promoted-artifact material (BUILD-approved sealed bytes; the
 * Kernel owns the durable pin, the retained S selection owns eligibility).
 * `promoted:retired-review` is the same governed material after revocation.
 */
const PROMOTED_ARTIFACTS = {
  'promoted:quote-review': {
    artifactId: 'promoted:quote-review',
    contentDigest: 'sha256:quote-review-v1',
    applicable: true,
    compatible: true,
    candidate: {
      decision: { outcome: 'approve' },
      event: { type: 'QUOTE_DECIDED', payload: { amount: 7, quotaAfter: 60, revision: 'r1' } },
    },
  },
  'promoted:retired-review': {
    artifactId: 'promoted:retired-review',
    contentDigest: 'sha256:retired-review-v1',
    revoked: true,
    candidate: {
      decision: { outcome: 'approve' },
      event: { type: 'QUOTE_DECIDED', payload: { amount: 7, quotaAfter: 60, revision: 'r1' } },
    },
  },
};

const ALWAYS = { op: 'constant', value: true };
const ROUTE_PROMOTED = {
  op: 'eq',
  left: { source: 'event', path: ['payload', 'route'] },
  right: { source: 'literal', value: 'promoted' },
};

const RULES = {
  'rule:ds-quote': {
    kind: 'decision-source',
    id: 'rule:ds-quote',
    decisionId: 'dec:ds-quote',
    declarationDigest: '5e167d3d0a1eaf5809640f976eab134a8d53ce540f42b1f5b6d8396e55ffe507',
    payloadFromInput: { amount: 'amount', quotaAfter: 'quotaAfter', revision: 'revision' },
    rule: {
      when: ALWAYS,
      outcome: 'approve',
      eventType: 'QUOTE_DECIDED',
    },
    cache: { dependencies: ['priceListRevision'] },
    promoted: {
      artifactId: 'promoted:quote-review',
      contentDigest: 'sha256:quote-review-v1',
      when: ROUTE_PROMOTED,
    },
    harness: { modelOperation: 'quote-decide' },
  },
  'rule:ds-drift': {
    kind: 'decision-source',
    id: 'rule:ds-drift',
    decisionId: 'dec:ds-drift',
    declarationDigest: 'ee82af05d75c050f7c9ab3517303b068a66ca9e52981f3c3dada5252b23f4159',
    payloadFromInput: { amount: 'amount', quotaAfter: 'quotaAfter', revision: 'revision' },
    cache: { dependencies: ['priceListRevision'] },
    harness: { modelOperation: 'quote-decide' },
  },
  'rule:ds-revoked': {
    kind: 'decision-source',
    id: 'rule:ds-revoked',
    decisionId: 'dec:ds-revoked',
    declarationDigest: '56f9999c7c3686c33f26102f7a8f6d0312477be4894a8ff447236849e0d1dc3f',
    payloadFromInput: { amount: 'amount', quotaAfter: 'quotaAfter', revision: 'revision' },
    promoted: {
      artifactId: 'promoted:retired-review',
      contentDigest: 'sha256:retired-review-v1',
      when: ALWAYS,
    },
  },
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'decision-source-quote',
    domainId: 'orders',
    workflowDefinition: dsQuoteDefinition(),
    strictWorkflowDefinition: dsQuoteDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [CAP_INVARIANT] },
    initialStateKey: 'review',
    initialContext: {},
    rules: RULES,
    promotedArtifacts: PROMOTED_ARTIFACTS,
    intentBindings: {
      submitQuote: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:ds-quote',
        roles: ['requester'],
        definition: dsQuoteDefinition(),
      },
      submitDriftQuote: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:ds-drift',
        roles: ['requester'],
        definition: dsQuoteDefinition(),
      },
      submitRevokedChild: {
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        ruleId: 'rule:ds-revoked',
        roles: ['requester'],
        definition: dsQuoteDefinition(),
      },
    },
    effectBindings: {
      'effect:reserve': {
        semantics: 'non-idempotent',
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined) {
            throw new Error('effect:reserve requires the Host resource port');
          }
          return resources.call('ledger', 'reserve', { ...input, effectId });
        },
      },
    },
  };
}
