/**
 * Issue #1379 authoring-template Business Domain Package.
 * =====================================================================
 *
 * One Business that demonstrates the three #1305 authoring paths against
 * PHYSICALLY SEPARATE selected capability modules:
 *
 *   - `submitAuthoringReview` runs a PRIVATE pure helper (`priorityScore`,
 *     module-internal, not exported, not a Tool, no separate operation)
 *     and then calls the read-only capability `inventory.get` — no K permit,
 *     no external effect.
 *   - `submitAuthoringJob` is the GOVERNED path: the binding declares
 *     `external` so the selected Kernel mints a live Effect Permit and the
 *     `jobs.submit` external Effect Operation dispatches exactly once.
 *   - `submitUnpermittedJobProbe` is the permitless NEGATIVE: same sealed
 *     `jobs.submit` route, no `external` declaration — the K→C external
 *     Effect gate must typed-refuse with ZERO adapter dispatch.
 *
 * This package owns business policy only and imports nothing (the sealed
 * capability adapters are reached exclusively through the kernel-owned
 * `resources` port handed to each effect handler).
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */
export const MODULE_ID = 'business-authoring-review@v0102.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:authoring-review', kind: 'business-policy' },
];
export const INTENT_TYPES = ['submitAuthoringReview', 'submitAuthoringJob', 'submitUnpermittedJobProbe'];
export const EFFECT_TYPES = ['effect:review-run', 'effect:job-submit', 'effect:unpermitted-probe'];

/**
 * Per-intent event projections: each effect inputFrom stays inside its OWN
 * rule-authorized fields. The RULE projection below is the full workflow
 * field set (the Rich `JOB_RULE_FIELDS` discipline): wiring validates every
 * dynamic effect intent of the shared workflowDefinition against EACH
 * intent binding's rule, so the projection must cover every field any
 * transition of this workflow may reference.
 */
const WORKFLOW_RULE_FIELDS = {
  payloadFromInput: { sku: 'sku', amount: 'amount', requestId: 'requestId', jobSpec: 'jobSpec' },
};
const REVIEW_INPUT_FROM = {
  sku: { source: 'event', path: ['payload', 'sku'] },
  amount: { source: 'event', path: ['payload', 'amount'] },
};
const JOB_INPUT_FROM = {
  requestId: { source: 'event', path: ['payload', 'requestId'] },
  jobSpec: { source: 'event', path: ['payload', 'jobSpec'] },
};

/**
 * PRIVATE pure helper (#1305 B path): deterministic, module-internal, never
 * exported and never registered as an operation. Its observable proof is the
 * `score` field of the review effect output.
 */
function priorityScore(sku, amount) {
  const prefix = String(sku ?? '').slice(0, 4);
  const tier = Number(amount) >= 100 ? 'high' : 'normal';
  return `${prefix}-${tier}`;
}

function makeDefinition() {
  return {
    workflowKey: 'authoring-review',
    initialState: 'open',
    initialContext: {},
    guards: [],
    states: [
      {
        // Self-loop: the instance stays alive so review / job / probe are
        // separate occurrences on the same thread (the Rich discipline).
        stateKey: 'open',
        transitions: [
          {
            transitionKey: 'run-review',
            trigger: { kind: 'event', eventType: 'AUTHORING_REVIEW_REQUESTED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:review-run', inputFrom: REVIEW_INPUT_FROM, idempotencyKeyFrom: { template: 'review:{sku}' } }],
          },
          {
            transitionKey: 'submit-job',
            trigger: { kind: 'event', eventType: 'AUTHORING_JOB_SUBMITTED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:job-submit', inputFrom: JOB_INPUT_FROM, idempotencyKeyFrom: { template: 'job:{requestId}' } }],
          },
          {
            transitionKey: 'probe-unpermitted',
            trigger: { kind: 'event', eventType: 'AUTHORING_JOB_PROBED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:unpermitted-probe', inputFrom: JOB_INPUT_FROM }],
          },
        ],
      },
      { stateKey: 'closed', kind: 'final' },
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
    return typeof decision.outcome === 'string' && typeof event.type === 'string';
  },
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'authoring-review',
    domainId: 'authoring',
    workflowDefinition: makeDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'open',
    initialContext: {},
    rules: {
      'rule:authoring-review': { ruleId: 'rule:authoring-review', eventType: 'AUTHORING_REVIEW_REQUESTED', ...WORKFLOW_RULE_FIELDS },
      'rule:authoring-job': { ruleId: 'rule:authoring-job', eventType: 'AUTHORING_JOB_SUBMITTED', ...WORKFLOW_RULE_FIELDS },
      'rule:authoring-job-probe': { ruleId: 'rule:authoring-job-probe', eventType: 'AUTHORING_JOB_PROBED', ...WORKFLOW_RULE_FIELDS },
    },
    intentBindings: {
      submitAuthoringReview: { trigger: { kind: 'event', eventType: 'AUTHORING_REVIEW_REQUESTED' }, ruleId: 'rule:authoring-review', roles: ['requester'] },
      submitAuthoringJob: { trigger: { kind: 'event', eventType: 'AUTHORING_JOB_SUBMITTED' }, ruleId: 'rule:authoring-job', roles: ['requester'] },
      submitUnpermittedJobProbe: { trigger: { kind: 'event', eventType: 'AUTHORING_JOB_PROBED' }, ruleId: 'rule:authoring-job-probe', roles: ['requester'] },
    },
    effectBindings: {
      // Private helper + read-only capability: no K permit, no external gate.
      'effect:review-run': {
        semantics: 'idempotent',
        resource: { key: 'inventory', operation: 'inventory.get' },
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined || typeof resources.call !== 'function') {
            throw new Error('effect:review-run requires the kernel resources port');
          }
          const score = priorityScore(input.sku, input.amount);
          const inventory = await resources.call('inventory', 'inventory.get', { sku: input.sku });
          return { ok: true, score, inventory, effectId };
        },
      },
      // GOVERNED external effect: the `external` declaration makes the Kernel
      // mint a live permit scoped to jobs:jobs.submit before the dispatch.
      'effect:job-submit': {
        semantics: 'non-idempotent',
        resource: { key: 'jobs', operation: 'jobs.submit' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined || typeof resources.call !== 'function') {
            throw new Error('effect:job-submit requires the kernel resources port');
          }
          return resources.call('jobs', 'jobs.submit', {
            requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
          });
        },
      },
      // PERMITLESS negative: same sealed route, NO `external` declaration —
      // the gate must refuse before the adapter with zero dispatch.
      'effect:unpermitted-probe': {
        semantics: 'idempotent',
        resource: { key: 'jobs', operation: 'jobs.submit' },
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined || typeof resources.call !== 'function') {
            throw new Error('effect:unpermitted-probe requires the kernel resources port');
          }
          return resources.call('jobs', 'jobs.submit', {
            requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
          });
        },
      },
    },
  };
}
