/**
 * v0.10 T09 (#1178) — ordinary selected Business workflow for recurring
 * proposal-only meta feedback.
 * ==============================================================
 *
 * This is deliberately a plain Business policy, not a Host/Meta runtime:
 * the selected Kernel still owns occurrence admission, state CAS, the
 * immutable original receipt and the journal. The workflow has ONE
 * recurring self-transition (`record`) whose guard accepts only a bounded
 * proposal record with `disposition: 'proposal-only'` and `effectCount: 0`,
 * and it declares NO effect intent and NO effect binding. A proposal can
 * therefore advance the workflow's own state, but it can never approve,
 * promote, publish, activate a BUILD or dispatch an external Effect.
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */
export const MODULE_ID = 'business-meta-feedback@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:meta-feedback', kind: 'business-policy' },
];
export const INTENT_TYPES = ['recordMetaFeedback', 'closeMetaFeedback'];
export const EFFECT_TYPES = [];

const ref = (name) => ({ source: 'event', path: ['payload', name] });
const lit = (value) => ({ source: 'literal', value });

/**
 * The only admitted proposal shape: data-only, explicitly non-effectful.
 * A proposal that carries any other disposition or a non-zero effect count
 * is denied by the selected Kernel guard, not silently reinterpreted here.
 */
const PROPOSAL_ONLY = {
  guardId: 'guard:proposal-only',
  predicate: {
    op: 'all',
    predicates: [
      { op: 'eq', left: ref('disposition'), right: lit('proposal-only') },
      { op: 'eq', left: ref('effectCount'), right: lit(0) },
      { op: 'exists', operand: ref('proposalId') },
      { op: 'exists', operand: ref('proposalDigest') },
    ],
  },
};

const decisionSchema = {
  isValid(value) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
    const decision = value.decision;
    const event = value.event;
    if (decision === null || typeof decision !== 'object' || Array.isArray(decision)) return false;
    if (event === null || typeof event !== 'object' || Array.isArray(event)) return false;
    if (typeof decision.outcome !== 'string' || typeof event.type !== 'string') return false;
    if (event.type === 'META_FEEDBACK_RECORDED') {
      const payload = event.payload;
      return payload !== null && typeof payload === 'object' && !Array.isArray(payload)
        && payload.disposition === 'proposal-only'
        && payload.effectCount === 0
        && typeof payload.proposalId === 'string'
        && payload.proposalId.length > 0
        && typeof payload.proposalDigest === 'string'
        && /^[0-9a-f]{64}$/.test(payload.proposalDigest);
    }
    return event.type === 'META_FEEDBACK_CLOSED';
  },
};

const workflowDefinition = {
  workflowKey: 'meta-feedback-loop',
  initialState: 'collecting',
  initialContext: {},
  guards: [PROPOSAL_ONLY],
  states: [
    {
      stateKey: 'collecting',
      transitions: [
        {
          transitionKey: 'record',
          trigger: { kind: 'event', eventType: 'META_FEEDBACK_RECORDED' },
          targetState: 'collecting',
          guardId: 'guard:proposal-only',
        },
        {
          transitionKey: 'close',
          trigger: { kind: 'event', eventType: 'META_FEEDBACK_CLOSED' },
          targetState: 'closed',
        },
      ],
    },
    { stateKey: 'closed', kind: 'final' },
  ],
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'meta-feedback',
    domainId: 'meta',
    workflowDefinition,
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'collecting',
    initialContext: {},
    rules: {
      'rule:meta-record': {
        ruleId: 'rule:meta-record',
        eventType: 'META_FEEDBACK_RECORDED',
        payloadFromInput: {
          disposition: 'disposition',
          effectCount: 'effectCount',
          proposalId: 'proposalId',
          proposalDigest: 'proposalDigest',
          evidenceDigest: 'evidenceDigest',
        },
      },
      'rule:meta-close': {
        ruleId: 'rule:meta-close',
        eventType: 'META_FEEDBACK_CLOSED',
        payloadFromInput: { closeReason: 'closeReason' },
      },
    },
    intentBindings: {
      recordMetaFeedback: {
        trigger: { kind: 'event', eventType: 'META_FEEDBACK_RECORDED' },
        ruleId: 'rule:meta-record',
        roles: ['approver', 'owner', 'requester'],
      },
      closeMetaFeedback: {
        trigger: { kind: 'event', eventType: 'META_FEEDBACK_CLOSED' },
        ruleId: 'rule:meta-close',
        roles: ['owner'],
      },
    },
    effectBindings: {},
  };
}
