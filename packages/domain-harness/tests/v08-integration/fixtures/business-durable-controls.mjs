/**
 * Business Domain Package — durable controls v1.0.0 (#1062 HF18/HF32)
 * ====================================================================
 *
 * One sealed Business policy exercising the shared non-message durable
 * control turn seam of the selected Kernel:
 *
 *   HF18 — external work on instance 'waiting':
 *     resumeFromCallback  (callback turn)  waiting → resumed   (+reserve)
 *     timeOutOnDeadline   (timer turn)     waiting → timedOut  (+reserve)
 *     pingFromCallback    (callback turn)  waiting → progressing →
 *                            progressing (LEGAL SELF-LOOP) — drives the
 *                            [#1066 R1 P1-B] crash-window negative where a
 *                            re-submitted turn is business-legal and only
 *                            the protocol-level turn identity can refuse it
 *   HF32 — child invocation:
 *     runChildTask        (child message)  review  → taskDone  (+reserve)
 *     runChildTaskRestricted (role-gated: ONLY child-worker may run it —
 *                            the permanent-rejection negative)
 *     onChildDone         (child-terminal 'done')  waiting → childOk
 *     onChildError        (child-terminal 'error') waiting → childFailed
 *
 * The workflow definition is one state superset shared by parent and child
 * instances (the sealed policy owns one workflow per closure). Effects go
 * through the Host 'ledger' resource so physical tests can count dispatches
 * (zero-duplicate-Effect assertions).
 *
 * Kernel ABI: v08-business-abi/1 — endpoint export `getPolicy()`.
 */

export const MODULE_ID = 'business-durable-controls@v08.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:durable-controls', kind: 'business-policy' },
];

export const INTENT_TYPES = [
  'submitStart',
  'resumeFromCallback',
  'timeOutOnDeadline',
  'pingFromCallback',
  'runChildTask',
  'runChildTaskRestricted',
  'onChildDone',
  'onChildError',
];
export const EFFECT_TYPES = ['effect:reserve'];

const GUARD_OK = {
  guardId: 'guard:always',
  predicate: { op: 'constant', value: true },
};

/**
 * ONE shared state superset. The resume transition carries a per-callback
 * dynamic effect identity (inputFrom/idempotencyKeyFrom) ONLY in the
 * definition bound to `resumeFromCallback` — every other intent binds the
 * shared definition whose resume effect is static (the wiring validates
 * dynamic projections against EACH intent's own rule authorization, the
 * [#1003 Controller 090] discipline).
 */
function makeDefinition({ dynamicResume } = { dynamicResume: false }) {
  const resumeEffect = dynamicResume
    ? {
      effectType: 'effect:reserve',
      inputFrom: {
        amount: { source: 'event', path: ['payload', 'amount'] },
        requestId: { source: 'event', path: ['payload', 'requestId'] },
      },
      idempotencyKeyFrom: { template: 'reserve:cb:{requestId}' },
    }
    : { effectType: 'effect:reserve', input: { reservation: 'cb' }, idempotencyKey: 'reserve:cb:1' };
  return {
    workflowKey: 'durable-controls',
    initialState: 'review',
    initialContext: {},
    guards: [GUARD_OK],
    states: [
      {
        stateKey: 'review',
        transitions: [
          { transitionKey: 'start', trigger: { kind: 'event', eventType: 'WORK_STARTED' }, targetState: 'waiting', guardId: 'guard:always', effectIntents: [] },
          {
            transitionKey: 'child-task',
            trigger: { kind: 'event', eventType: 'CHILD_TASK' },
            targetState: 'taskDone',
            guardId: 'guard:always',
            effectIntents: [{ effectType: 'effect:reserve', input: { reservation: 'child' }, idempotencyKey: 'reserve:child:1' }],
          },
        ],
      },
      {
        stateKey: 'waiting',
        transitions: [
          {
            transitionKey: 'resume',
            trigger: { kind: 'event', eventType: 'CALLBACK_RESUMED' },
            targetState: 'resumed',
            guardId: 'guard:always',
            effectIntents: [resumeEffect],
          },
          {
            transitionKey: 'timeout',
            trigger: { kind: 'event', eventType: 'DEADLINE_TIMED_OUT' },
            targetState: 'timedOut',
            guardId: 'guard:always',
            effectIntents: [{ effectType: 'effect:reserve', input: { reservation: 'timeout' }, idempotencyKey: 'reserve:timeout:1' }],
          },
          {
            transitionKey: 'child-done',
            trigger: { kind: 'event', eventType: 'CHILD_DONE' },
            targetState: 'childOk',
            guardId: 'guard:always',
            effectIntents: [{ effectType: 'effect:reserve', input: { reservation: 'child-result' }, idempotencyKey: 'reserve:childresult:1' }],
          },
          {
            transitionKey: 'child-error',
            trigger: { kind: 'event', eventType: 'CHILD_ERROR' },
            targetState: 'childFailed',
            guardId: 'guard:always',
            effectIntents: [],
          },
          {
            // [#1066 R1 P1-B] The LEGAL SELF-LOOP entry: the same callback
            // trigger that begins progress also re-admits from 'progressing'
            // — the crash-replay duplicate a protocol-level turn identity
            // must refuse, where business-state refusals ('resumed' is
            // final) would only mask it.
            transitionKey: 'begin-progress',
            trigger: { kind: 'event', eventType: 'CALLBACK_PROGRESS' },
            targetState: 'progressing',
            guardId: 'guard:always',
            effectIntents: [{ effectType: 'effect:reserve', input: { reservation: 'progress' }, idempotencyKey: 'reserve:progress:1' }],
          },
        ],
      },
      {
        stateKey: 'progressing',
        transitions: [
          {
            transitionKey: 'progress-again',
            trigger: { kind: 'event', eventType: 'CALLBACK_PROGRESS' },
            targetState: 'progressing',
            guardId: 'guard:always',
            effectIntents: [{ effectType: 'effect:reserve', input: { reservation: 'progress' }, idempotencyKey: 'reserve:progress:1' }],
          },
        ],
      },
      { stateKey: 'resumed', kind: 'final' },
      { stateKey: 'timedOut', kind: 'final' },
      { stateKey: 'childOk', kind: 'final' },
      { stateKey: 'childFailed', kind: 'final' },
      { stateKey: 'taskDone', kind: 'final' },
    ],
  };
}

const definition = makeDefinition();
const resumeDefinition = makeDefinition({ dynamicResume: true });

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
    policyId: 'durable-controls',
    domainId: 'controls',
    workflowDefinition: definition,
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'review',
    initialContext: {},
    rules: {
      'rule:start': { ruleId: 'rule:start', eventType: 'WORK_STARTED', payloadFromInput: { amount: 'amount' } },
      'rule:resume': { ruleId: 'rule:resume', eventType: 'CALLBACK_RESUMED', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },
      'rule:timeout': { ruleId: 'rule:timeout', eventType: 'DEADLINE_TIMED_OUT' },
      'rule:progress': { ruleId: 'rule:progress', eventType: 'CALLBACK_PROGRESS', payloadFromInput: { amount: 'amount', requestId: 'requestId' } },
      'rule:child-task': { ruleId: 'rule:child-task', eventType: 'CHILD_TASK', payloadFromInput: { amount: 'amount' } },
      'rule:child-done': { ruleId: 'rule:child-done', eventType: 'CHILD_DONE', payloadFromInput: { amount: 'amount' } },
      'rule:child-error': { ruleId: 'rule:child-error', eventType: 'CHILD_ERROR', payloadFromInput: { reason: 'reason' } },
    },
    intentBindings: {
      submitStart: { trigger: { kind: 'event', eventType: 'WORK_STARTED' }, ruleId: 'rule:start', roles: ['requester'] },
      resumeFromCallback: { trigger: { kind: 'event', eventType: 'CALLBACK_RESUMED' }, ruleId: 'rule:resume', roles: ['requester'], definition: resumeDefinition },
      timeOutOnDeadline: { trigger: { kind: 'event', eventType: 'DEADLINE_TIMED_OUT' }, ruleId: 'rule:timeout', roles: ['requester'] },
      pingFromCallback: { trigger: { kind: 'event', eventType: 'CALLBACK_PROGRESS' }, ruleId: 'rule:progress', roles: ['requester'] },
      runChildTask: { trigger: { kind: 'event', eventType: 'CHILD_TASK' }, ruleId: 'rule:child-task', roles: ['requester'] },
      runChildTaskRestricted: { trigger: { kind: 'event', eventType: 'CHILD_TASK' }, ruleId: 'rule:child-task', roles: ['child-worker'] },
      onChildDone: { trigger: { kind: 'event', eventType: 'CHILD_DONE' }, ruleId: 'rule:child-done', roles: ['requester'] },
      onChildError: { trigger: { kind: 'event', eventType: 'CHILD_ERROR' }, ruleId: 'rule:child-error', roles: ['requester'] },
    },
    effectBindings: {
      'effect:reserve': {
        semantics: 'idempotent',
        resource: { key: 'ledger', operation: 'reserve' },
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
