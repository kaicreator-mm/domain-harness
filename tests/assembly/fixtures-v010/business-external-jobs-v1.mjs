/**
 * C01 fixture (#1177) — the Business Domain Package that drives BOTH
 * unrelated external effect adapters through the ONE selected K→C external
 * Effect Operation contract.
 * ===========================================================================
 *
 * Every effect binding below declares `external` on the selected contract:
 * the Kernel mints a live Effect Permit scoped to the declared capability
 * key and operation, and the trusted Host gate refuses any dispatch the
 * permit does not authorize. Two deliberately labeled PROBE bindings keep
 * the negative witnesses honest:
 *
 *   - `effect:unpermitted-probe` is NOT external: its handler still calls
 *     the sealed external capability — a Business reaching a credentialed
 *     external effect without a K-issued live permit is typed-refused with
 *     zero adapter dispatch.
 *   - `effect:cross-capability-probe` IS external (authorized for
 *     extnotify) but its handler calls the OTHER external capability
 *     (extjob): a live permit never crosses its scoped capability.
 *
 * `effect:job-submit-expiring` carries a 1s permit TTL for the expiry
 * witness; `effect:notify-send` is bound await:'terminal' so an accepted-only
 * provider ACK can never become success.
 */
export const MODULE_ID = 'business-external-jobs@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:external-jobs', kind: 'business-policy' },
];

export const INTENT_TYPES = [
  'submitExternalJob', 'checkExternalJob', 'reconcileExternalJob',
  'sendNotification', 'submitUnpermittedJobProbe', 'submitCrossCapabilityProbe',
  'submitExpiringJob',
];
export const EFFECT_TYPES = [
  'effect:job-submit', 'effect:job-status', 'effect:job-reconcile',
  'effect:notify-send', 'effect:unpermitted-probe', 'effect:cross-capability-probe',
  'effect:job-submit-expiring',
];

const JOB_INPUT_FROM = {
  requestId: { source: 'event', path: ['payload', 'requestId'] },
  jobSpec: { source: 'event', path: ['payload', 'jobSpec'] },
  jobId: { source: 'event', path: ['payload', 'jobId'] },
  idempotencyKey: { source: 'event', path: ['payload', 'idempotencyKey'] },
  channel: { source: 'event', path: ['payload', 'channel'] },
  message: { source: 'event', path: ['payload', 'message'] },
};

function makeDefinition() {
  return {
    workflowKey: 'external-jobs',
    initialState: 'open',
    initialContext: {},
    guards: [],
    states: [
      {
        // Self-loops: the work item stays alive across turns so submit /
        // status / reconcile / notification / probes on the composed thread
        // are separate occurrences (the same discipline as the T04 slice).
        stateKey: 'open',
        transitions: [
          {
            transitionKey: 'submit-job',
            trigger: { kind: 'event', eventType: 'JOB_SUBMITTED' },
            targetState: 'open',
            effectIntents: [
              { effectType: 'effect:job-submit', inputFrom: JOB_INPUT_FROM, idempotencyKeyFrom: { template: 'job:{requestId}' } },
            ],
          },
          {
            transitionKey: 'submit-expiring-job',
            trigger: { kind: 'event', eventType: 'EXPIRING_JOB_SUBMITTED' },
            targetState: 'open',
            effectIntents: [
              { effectType: 'effect:job-submit-expiring', inputFrom: JOB_INPUT_FROM, idempotencyKeyFrom: { template: 'expiring:{requestId}' } },
            ],
          },
          {
            transitionKey: 'check-job',
            trigger: { kind: 'event', eventType: 'JOB_STATUS_REQUESTED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:job-status', inputFrom: JOB_INPUT_FROM }],
          },
          {
            transitionKey: 'reconcile-job',
            trigger: { kind: 'event', eventType: 'JOB_RECONCILE_REQUESTED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:job-reconcile', inputFrom: JOB_INPUT_FROM }],
          },
          {
            transitionKey: 'send-notification',
            trigger: { kind: 'event', eventType: 'NOTIFICATION_REQUESTED' },
            targetState: 'open',
            effectIntents: [
              { effectType: 'effect:notify-send', inputFrom: JOB_INPUT_FROM, idempotencyKeyFrom: { template: 'notify:{requestId}' } },
            ],
          },
          {
            transitionKey: 'probe-unpermitted',
            trigger: { kind: 'event', eventType: 'UNPERMITTED_JOB_PROBED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:unpermitted-probe', inputFrom: JOB_INPUT_FROM }],
          },
          {
            transitionKey: 'probe-cross-capability',
            trigger: { kind: 'event', eventType: 'CROSS_CAPABILITY_PROBED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:cross-capability-probe', inputFrom: JOB_INPUT_FROM }],
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

function externalCall(key, operation, buildPayload) {
  return async ({ input, effectId, resources }) => {
    if (resources === undefined || typeof resources.call !== 'function') {
      throw new Error(`effect on ${key}:${operation} requires the Host resources port`);
    }
    return resources.call(key, operation, buildPayload(input, effectId));
  };
}

const JOB_RULE_FIELDS = {
  payloadFromInput: {
    requestId: 'requestId', jobSpec: 'jobSpec', jobId: 'jobId',
    idempotencyKey: 'idempotencyKey', channel: 'channel', message: 'message',
  },
};

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'external-jobs',
    domainId: 'operations',
    workflowDefinition: makeDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'open',
    initialContext: {},
    rules: {
      'rule:job-submit': { ruleId: 'rule:job-submit', eventType: 'JOB_SUBMITTED', ...JOB_RULE_FIELDS },
      'rule:expiring-job-submit': { ruleId: 'rule:expiring-job-submit', eventType: 'EXPIRING_JOB_SUBMITTED', ...JOB_RULE_FIELDS },
      'rule:job-status': { ruleId: 'rule:job-status', eventType: 'JOB_STATUS_REQUESTED', ...JOB_RULE_FIELDS },
      'rule:job-reconcile': { ruleId: 'rule:job-reconcile', eventType: 'JOB_RECONCILE_REQUESTED', ...JOB_RULE_FIELDS },
      'rule:notify-send': { ruleId: 'rule:notify-send', eventType: 'NOTIFICATION_REQUESTED', ...JOB_RULE_FIELDS },
      'rule:unpermitted-probe': { ruleId: 'rule:unpermitted-probe', eventType: 'UNPERMITTED_JOB_PROBED', ...JOB_RULE_FIELDS },
      'rule:cross-capability-probe': { ruleId: 'rule:cross-capability-probe', eventType: 'CROSS_CAPABILITY_PROBED', ...JOB_RULE_FIELDS },
    },
    intentBindings: {
      submitExternalJob: { trigger: { kind: 'event', eventType: 'JOB_SUBMITTED' }, ruleId: 'rule:job-submit', roles: ['requester'] },
      submitExpiringJob: { trigger: { kind: 'event', eventType: 'EXPIRING_JOB_SUBMITTED' }, ruleId: 'rule:expiring-job-submit', roles: ['requester'] },
      checkExternalJob: { trigger: { kind: 'event', eventType: 'JOB_STATUS_REQUESTED' }, ruleId: 'rule:job-status', roles: ['requester'] },
      reconcileExternalJob: { trigger: { kind: 'event', eventType: 'JOB_RECONCILE_REQUESTED' }, ruleId: 'rule:job-reconcile', roles: ['requester'] },
      sendNotification: { trigger: { kind: 'event', eventType: 'NOTIFICATION_REQUESTED' }, ruleId: 'rule:notify-send', roles: ['requester'] },
      submitUnpermittedJobProbe: { trigger: { kind: 'event', eventType: 'UNPERMITTED_JOB_PROBED' }, ruleId: 'rule:unpermitted-probe', roles: ['requester'] },
      submitCrossCapabilityProbe: { trigger: { kind: 'event', eventType: 'CROSS_CAPABILITY_PROBED' }, ruleId: 'rule:cross-capability-probe', roles: ['requester'] },
    },
    effectBindings: {
      'effect:job-submit': {
        semantics: 'non-idempotent',
        resource: { key: 'extjob', operation: 'job.submit' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        handler: externalCall('extjob', 'job.submit', (input, effectId) => ({
          requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
        })),
      },
      'effect:job-submit-expiring': {
        semantics: 'non-idempotent',
        resource: { key: 'extjob', operation: 'job.submit' },
        external: { permitTtlMs: 1_000, await: 'phase' },
        handler: externalCall('extjob', 'job.submit', (input, effectId) => ({
          requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
        })),
      },
      'effect:job-status': {
        semantics: 'idempotent',
        resource: { key: 'extjob', operation: 'job.status' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        handler: externalCall('extjob', 'job.status', (input) => ({ jobId: input.jobId })),
      },
      'effect:job-reconcile': {
        semantics: 'idempotent',
        resource: { key: 'extjob', operation: 'job.reconcile' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        handler: externalCall('extjob', 'job.reconcile', (input) => ({ idempotencyKey: input.idempotencyKey })),
      },
      'effect:notify-send': {
        semantics: 'non-idempotent',
        resource: { key: 'extnotify', operation: 'notify.send' },
        external: { permitTtlMs: 3_600_000, await: 'terminal' },
        handler: externalCall('extnotify', 'notify.send', (input, effectId) => ({
          requestId: input.requestId, channel: input.channel ?? null, message: input.message ?? null, effectId,
        })),
      },
      'effect:unpermitted-probe': {
        semantics: 'idempotent',
        resource: { key: 'extjob', operation: 'job.submit' },
        handler: externalCall('extjob', 'job.submit', (input, effectId) => ({
          requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
        })),
      },
      'effect:cross-capability-probe': {
        semantics: 'idempotent',
        resource: { key: 'extnotify', operation: 'notify.send' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        handler: externalCall('extjob', 'job.submit', (input, effectId) => ({
          requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
        })),
      },
    },
  };
}
