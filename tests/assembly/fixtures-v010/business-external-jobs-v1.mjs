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
 *
 * `effect:read-then-submit-probe` (#1222) is the POSITIVE witness of the
 * permitted-claim scoping: its handler performs an ordinary read Tool call
 * (the non-external `directory` capability) BEFORE the one authorized
 * external dispatch. The read must not consume the effect's durable dispatch
 * claim — the subsequent job.submit must still dispatch exactly once.
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
  'submitExpiringJob', 'submitDoubleDispatchProbe', 'submitConcurrentDispatchProbe',
  'submitReadThenExternalProbe',
];
export const EFFECT_TYPES = [
  'effect:job-submit', 'effect:job-status', 'effect:job-reconcile',
  'effect:notify-send', 'effect:unpermitted-probe', 'effect:cross-capability-probe',
  'effect:job-submit-expiring', 'effect:double-dispatch-probe', 'effect:concurrent-dispatch-probe',
  'effect:read-then-submit-probe',
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
          {
            // [C01 R1 P1-1 falsifier] ONE effect whose handler calls the
            // same external capability TWICE sequentially: the atomic
            // per-effect dispatch claim must ground exactly one invocation.
            transitionKey: 'probe-double-dispatch',
            trigger: { kind: 'event', eventType: 'DOUBLE_DISPATCH_PROBED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:double-dispatch-probe', inputFrom: JOB_INPUT_FROM }],
          },
          {
            // [C01 R1 P1-1 falsifier] The concurrent twin: Promise.all of two
            // calls in ONE handler must also ground exactly one invocation.
            transitionKey: 'probe-concurrent-dispatch',
            trigger: { kind: 'event', eventType: 'CONCURRENT_DISPATCH_PROBED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:concurrent-dispatch-probe', inputFrom: JOB_INPUT_FROM }],
          },
          {
            // [#1222 P-witness] ONE effect whose handler FIRST performs an
            // ordinary read Tool call (non-external directory lookup) and only
            // THEN the authorized external dispatch: the read never consumes
            // the effect's one durable claim.
            transitionKey: 'probe-read-then-external',
            trigger: { kind: 'event', eventType: 'READ_THEN_EXTERNAL_PROBED' },
            targetState: 'open',
            effectIntents: [{ effectType: 'effect:read-then-submit-probe', inputFrom: JOB_INPUT_FROM }],
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
      'rule:double-dispatch-probe': { ruleId: 'rule:double-dispatch-probe', eventType: 'DOUBLE_DISPATCH_PROBED', ...JOB_RULE_FIELDS },
      'rule:concurrent-dispatch-probe': { ruleId: 'rule:concurrent-dispatch-probe', eventType: 'CONCURRENT_DISPATCH_PROBED', ...JOB_RULE_FIELDS },
      'rule:read-then-submit-probe': { ruleId: 'rule:read-then-submit-probe', eventType: 'READ_THEN_EXTERNAL_PROBED', ...JOB_RULE_FIELDS },
    },
    intentBindings: {
      submitExternalJob: { trigger: { kind: 'event', eventType: 'JOB_SUBMITTED' }, ruleId: 'rule:job-submit', roles: ['requester'] },
      submitExpiringJob: { trigger: { kind: 'event', eventType: 'EXPIRING_JOB_SUBMITTED' }, ruleId: 'rule:expiring-job-submit', roles: ['requester'] },
      checkExternalJob: { trigger: { kind: 'event', eventType: 'JOB_STATUS_REQUESTED' }, ruleId: 'rule:job-status', roles: ['requester'] },
      reconcileExternalJob: { trigger: { kind: 'event', eventType: 'JOB_RECONCILE_REQUESTED' }, ruleId: 'rule:job-reconcile', roles: ['requester'] },
      sendNotification: { trigger: { kind: 'event', eventType: 'NOTIFICATION_REQUESTED' }, ruleId: 'rule:notify-send', roles: ['requester'] },
      submitUnpermittedJobProbe: { trigger: { kind: 'event', eventType: 'UNPERMITTED_JOB_PROBED' }, ruleId: 'rule:unpermitted-probe', roles: ['requester'] },
      submitCrossCapabilityProbe: { trigger: { kind: 'event', eventType: 'CROSS_CAPABILITY_PROBED' }, ruleId: 'rule:cross-capability-probe', roles: ['requester'] },
      submitDoubleDispatchProbe: { trigger: { kind: 'event', eventType: 'DOUBLE_DISPATCH_PROBED' }, ruleId: 'rule:double-dispatch-probe', roles: ['requester'] },
      submitConcurrentDispatchProbe: { trigger: { kind: 'event', eventType: 'CONCURRENT_DISPATCH_PROBED' }, ruleId: 'rule:concurrent-dispatch-probe', roles: ['requester'] },
      submitReadThenExternalProbe: { trigger: { kind: 'event', eventType: 'READ_THEN_EXTERNAL_PROBED' }, ruleId: 'rule:read-then-submit-probe', roles: ['requester'] },
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
      'effect:double-dispatch-probe': {
        semantics: 'non-idempotent',
        resource: { key: 'extjob', operation: 'job.submit' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        // A deliberately trusted-but-buggy Business: two SEQUENTIAL calls in
        // one effect. The second must be typed-refused before the provider.
        handler: async ({ input, effectId, resources }) => {
          await resources.call('extjob', 'job.submit', {
            requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
          });
          return await resources.call('extjob', 'job.submit', {
            requestId: `${String(input.requestId)}-second`, jobSpec: input.jobSpec ?? null, effectId,
          });
        },
      },
      'effect:concurrent-dispatch-probe': {
        semantics: 'non-idempotent',
        resource: { key: 'extjob', operation: 'job.submit' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        // The concurrent twin: both calls start together (the Promise.all
        // shape); the K claim arbitrates exactly one, and the loser is
        // typed-refused. allSettled keeps the winner observable so the test
        // asserts exactly one physical dispatch without timing races.
        handler: async ({ input, effectId, resources }) => {
          const results = await Promise.allSettled([
            resources.call('extjob', 'job.submit', {
              requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
            }),
            resources.call('extjob', 'job.submit', {
              requestId: `${String(input.requestId)}-second`, jobSpec: input.jobSpec ?? null, effectId,
            }),
          ]);
          const fulfilled = results.find((result) => result.status === 'fulfilled');
          if (fulfilled === undefined) {
            throw new Error('the concurrent probe grounded no dispatch');
          }
          return fulfilled.value;
        },
      },
      'effect:read-then-submit-probe': {
        semantics: 'non-idempotent',
        resource: { key: 'extjob', operation: 'job.submit' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        // [#1222 P-witness] An ordinary read Tool call (the non-external
        // `directory` capability) runs BEFORE the one authorized external
        // dispatch. The read is outside this effect's permit scope, so it must
        // not take the durable dispatch claim: job.submit still lands once.
        handler: async ({ input, effectId, resources }) => {
          const lookedUp = await resources.call('directory', 'directory.lookup', {
            key: `lookup:${String(input.requestId)}`,
          });
          if (lookedUp === null || typeof lookedUp !== 'object' || lookedUp.found !== true) {
            throw new Error('the preceding read Tool call did not answer its contract');
          }
          return await resources.call('extjob', 'job.submit', {
            requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
          });
        },
      },
    },
  };
}
