/**
 * C01 fixture (#1177, review R1 P1-2) — the SECOND Business (B2) of the
 * scoped two-B witness. It shares the SAME workflowId (`external-jobs`) and
 * the SAME instanceKey as B1 in the physical test, but its K02 scoped
 * identity appends ITS OWN businessPackageId — so every K record (instance,
 * fence, journal, permit, dispatch claim, receipt) stays physically disjoint
 * from B1's under ONE SQLite file.
 *
 * B2 drives the same selected K→C external Effect Operation through the
 * shared `extjob` capability with its own intent/effect/binding names.
 */
export const MODULE_ID = 'business-external-jobs-b@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:external-jobs-b', kind: 'business-policy' },
];

export const INTENT_TYPES = ['submitSecondBJob'];
export const EFFECT_TYPES = ['effect:second-job-submit'];

const INPUT_FROM = {
  requestId: { source: 'event', path: ['payload', 'requestId'] },
  jobSpec: { source: 'event', path: ['payload', 'jobSpec'] },
  jobId: { source: 'event', path: ['payload', 'jobId'] },
  idempotencyKey: { source: 'event', path: ['payload', 'idempotencyKey'] },
  channel: { source: 'event', path: ['payload', 'channel'] },
  message: { source: 'event', path: ['payload', 'message'] },
};

function makeDefinition() {
  return {
    // The SAME workflow key as B1: the two B are distinguished ONLY by their
    // scoped deployment tuple, exactly the T10/T11 scenario C01 must support.
    workflowKey: 'external-jobs',
    initialState: 'open',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'open',
        transitions: [
          {
            transitionKey: 'submit-second-job',
            trigger: { kind: 'event', eventType: 'SECOND_JOB_SUBMITTED' },
            targetState: 'open',
            effectIntents: [
              { effectType: 'effect:second-job-submit', inputFrom: INPUT_FROM, idempotencyKeyFrom: { template: 'second:{requestId}' } },
            ],
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
    policyId: 'external-jobs-b',
    domainId: 'operations',
    workflowDefinition: makeDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'open',
    initialContext: {},
    rules: {
      'rule:second-job-submit': {
        ruleId: 'rule:second-job-submit',
        eventType: 'SECOND_JOB_SUBMITTED',
        payloadFromInput: {
          requestId: 'requestId', jobSpec: 'jobSpec', jobId: 'jobId',
          idempotencyKey: 'idempotencyKey', channel: 'channel', message: 'message',
        },
      },
    },
    intentBindings: {
      submitSecondBJob: { trigger: { kind: 'event', eventType: 'SECOND_JOB_SUBMITTED' }, ruleId: 'rule:second-job-submit', roles: ['requester'] },
    },
    effectBindings: {
      'effect:second-job-submit': {
        semantics: 'non-idempotent',
        resource: { key: 'extjob', operation: 'job.submit' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined || typeof resources.call !== 'function') {
            throw new Error('effect:second-job-submit requires the Host resources port');
          }
          return resources.call('extjob', 'job.submit', {
            requestId: input.requestId, jobSpec: input.jobSpec ?? null, effectId,
          });
        },
      },
    },
  };
}
