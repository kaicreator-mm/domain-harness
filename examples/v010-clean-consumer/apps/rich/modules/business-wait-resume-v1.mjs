/**
 * T11 Rich App-owned Business — the durable WAIT/RESUME slice (#1180).
 * ===================================================================
 *
 * An ordinary Business Workflow whose WAIT is a real Kernel state: the
 * parent instance parks in `waiting`, the process restarts over the same
 * physical SQLite file, and exactly ONE correlated callback turn resumes it.
 * The resume turn carries the ONE governed mutation of this slice: a real
 * K→C external notify Effect dispatched under a live K permit through the
 * SAME selected C01 contract the two independent adapters share.
 *
 * A timeout turn is the deadline branch: it reaches a typed terminal state
 * without dispatching any effect. A duplicate callback replays the K02
 * original receipt with zero new effect.
 */
export const MODULE_ID = 'business-wait-resume@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:wait-resume', kind: 'business-policy' },
];

export const INTENT_TYPES = ['openWait', 'resumeCallback', 'timeoutWait'];
export const EFFECT_TYPES = ['effect:wait-notify'];

const INPUT_FROM = {
  requestId: { source: 'event', path: ['payload', 'requestId'] },
  channel: { source: 'event', path: ['payload', 'channel'] },
  message: { source: 'event', path: ['payload', 'message'] },
};

function makeDefinition() {
  return {
    workflowKey: 'wait-resume',
    initialState: 'active',
    initialContext: {},
    guards: [],
    states: [
      {
        stateKey: 'active',
        transitions: [
          { transitionKey: 'park', trigger: { kind: 'event', eventType: 'WAIT_OPENED' }, targetState: 'waiting' },
        ],
      },
      {
        stateKey: 'waiting',
        transitions: [
          {
            transitionKey: 'resume',
            trigger: { kind: 'event', eventType: 'CALLBACK_ARRIVED' },
            targetState: 'resumed',
            effectIntents: [
              { effectType: 'effect:wait-notify', inputFrom: INPUT_FROM, idempotencyKeyFrom: { template: 'wait-notify:{requestId}' } },
            ],
          },
          { transitionKey: 'deadline', trigger: { kind: 'event', eventType: 'WAIT_TIMED_OUT' }, targetState: 'timedOut' },
        ],
      },
      { stateKey: 'resumed', kind: 'final' },
      { stateKey: 'timedOut', kind: 'final' },
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

function binding(eventType, ruleId) {
  return { trigger: { kind: 'event', eventType }, ruleId, roles: ['requester'] };
}

function rule(ruleId, eventType) {
  return { ruleId, eventType, payloadFromInput: { requestId: 'requestId', channel: 'channel', message: 'message' } };
}

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'wait-resume',
    domainId: 'control',
    workflowDefinition: makeDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'active',
    initialContext: {},
    rules: {
      'rule:wait-open': rule('rule:wait-open', 'WAIT_OPENED'),
      'rule:wait-callback': rule('rule:wait-callback', 'CALLBACK_ARRIVED'),
      'rule:wait-timeout': rule('rule:wait-timeout', 'WAIT_TIMED_OUT'),
    },
    intentBindings: {
      openWait: binding('WAIT_OPENED', 'rule:wait-open'),
      resumeCallback: binding('CALLBACK_ARRIVED', 'rule:wait-callback'),
      timeoutWait: binding('WAIT_TIMED_OUT', 'rule:wait-timeout'),
    },
    effectBindings: {
      'effect:wait-notify': {
        semantics: 'non-idempotent',
        resource: { key: 'extnotify', operation: 'notify.send' },
        external: { permitTtlMs: 3_600_000, await: 'phase' },
        handler: async ({ input, effectId, resources }) => {
          if (resources === undefined || typeof resources.call !== 'function') {
            throw new Error('effect:wait-notify requires the Host resources port');
          }
          return resources.call('extnotify', 'notify.send', {
            requestId: input.requestId,
            channel: input.channel ?? 'channel:wait',
            message: input.message ?? 'resumed',
            effectId,
          });
        },
      },
    },
  };
}
