/**
 * T04 fixture — the Business Domain Package that USES the selected C Memory
 * capability through the real Kernel effect dispatch (v0.10 integration
 * slice, #1171).
 * ====================================================================
 *
 * Domain policy for ONE business field: agent working notes kept in the
 * selected scoped-Memory capability. Every note operation flows the REAL
 * authoritative path — public intent → Kernel admission (rule projection,
 * schema, guard-free transition, journal) → the declared `effect:memory-op`
 * effect binding → the physical resources port → the sealed `memory`
 * capability handlers. Memory here is a STORAGE capability the Business
 * uses inside its effect handling; it neither replaces nor mints Kernel
 * State/Journal/Receipt/Permit authority.
 *
 * Scope identity is built from TRUSTED sources only: deployment constants
 * frozen in these BUILD-pinned bytes (including the one composed notes
 * thread). Raw caller input names only the note content
 * (op/key/value/...), never the scope.
 *
 * `submitForeignMemoryNote` is a deliberately labeled PROBE binding on its
 * own event type and effect type (`effect:foreign-memory-op`): its effect
 * handler constructs the same physical call with a tenant the App did NOT
 * select for Memory, so the activation test can prove the capability's
 * per-operation authorization typed-refuses an unselected scope with zero
 * physical mutation while the Kernel receipt stays honest (effect FAILED,
 * nothing invented).
 */

export const MODULE_ID = 'business-memory-notes@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:memory-notes', kind: 'business-policy' },
];

export const INTENT_TYPES = ['submitMemoryNote', 'submitForeignMemoryNote'];
export const EFFECT_TYPES = ['effect:memory-op', 'effect:foreign-memory-op'];

// Deployment identity constants frozen in BUILD-pinned bytes (the injective
// K record tuple belongs to the K successors; this slice fixes the values
// the selected App composed with).
const DEPLOYED_APP_ID = 'deploy:v010-t04-rich';
const APP_ID = 'app:v010-t04-rich';
const TENANT_ID = 'tenant:v010-t04-rich';
const AGENT_ID = 'agent:notes-writer';
const FOREIGN_TENANT_ID = 'tenant:v010-foreign-probe';
// The App composes ONE shared notes thread: every occurrence of this
// Business reads/writes the same scoped Memory namespace regardless of
// which Kernel instance carried the turn. (Binding per-occurrence thread
// identity is T05/T10 territory; this slice fixes the composed value.)
const THREAD_ID = 'thread:notes-shared';

const MEMORY_OP_INPUT_FROM = {
  op: { source: 'event', path: ['payload', 'op'] },
  key: { source: 'event', path: ['payload', 'key'] },
  value: { source: 'event', path: ['payload', 'value'] },
  expectedRevision: { source: 'event', path: ['payload', 'expectedRevision'] },
  ttlMs: { source: 'event', path: ['payload', 'ttlMs'] },
  requestId: { source: 'event', path: ['payload', 'requestId'] },
};

function makeDefinition() {
  return {
    workflowKey: 'agent-notes',
    initialState: 'editing',
    initialContext: {},
    guards: [],
    states: [
      {
        // Self-loops: the note instance stays alive across turns so put/get/
        // search/delete on the SAME scope/thread are separate occurrences.
        stateKey: 'editing',
        transitions: [
          {
            transitionKey: 'record',
            trigger: { kind: 'event', eventType: 'MEMORY_NOTED' },
            targetState: 'editing',
            effectIntents: [
              {
                effectType: 'effect:memory-op',
                inputFrom: MEMORY_OP_INPUT_FROM,
                idempotencyKeyFrom: { template: 'memo:{requestId}' },
              },
            ],
          },
          {
            transitionKey: 'probe',
            trigger: { kind: 'event', eventType: 'FOREIGN_MEMORY_PROBED' },
            targetState: 'editing',
            effectIntents: [
              {
                effectType: 'effect:foreign-memory-op',
                inputFrom: MEMORY_OP_INPUT_FROM,
                idempotencyKeyFrom: { template: 'foreign-probe:{requestId}' },
              },
            ],
          },
        ],
      },
      { stateKey: 'archived', kind: 'final' },
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

function scopeFor(tenantId) {
  return {
    deployedAppId: DEPLOYED_APP_ID,
    tenantId,
    appId: APP_ID,
    businessPackageId: MODULE_ID,
    agentId: AGENT_ID,
    threadId: THREAD_ID,
  };
}

/** The one shared effect handler; `foreign` selects the probe tenant. */
function memoryEffectHandler(foreign) {
  return async ({ input, effectId, logicalTime, resources }) => {
    if (resources === undefined || typeof resources.call !== 'function') {
      throw new Error((foreign ? 'effect:foreign-memory-op' : 'effect:memory-op') + ' requires the Host resources port');
    }
    const scope = scopeFor(foreign ? FOREIGN_TENANT_ID : TENANT_ID);
    const op = input.op === 'get' || input.op === 'search' || input.op === 'delete' ? input.op : 'put';
    // The Kernel's logicalTime is an ISO instant string; TTL math needs ms.
    const logicalMs = typeof logicalTime === 'number' ? logicalTime : Date.parse(String(logicalTime));
    if (op === 'put') {
      const payload = {
        scope,
        key: input.key,
        value: input.value,
        provenance: { source: `effect:${effectId}`, recordedBy: MODULE_ID },
      };
      if (input.expectedRevision !== undefined && input.expectedRevision !== null) {
        payload.expectedRevision = input.expectedRevision;
      }
      if (input.ttlMs !== undefined && input.ttlMs !== null) {
        payload.expiresAtMs = logicalMs + input.ttlMs;
      }
      return resources.call('memory', 'memory.put', payload);
    }
    if (op === 'get') {
      return resources.call('memory', 'memory.get', { scope, key: input.key });
    }
    if (op === 'search') {
      return resources.call('memory', 'memory.search', { scope, keyPrefix: input.key ?? '' });
    }
    return resources.call('memory', 'memory.delete', { scope, key: input.key, revision: input.expectedRevision });
  };
}

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'memory-notes',
    domainId: 'notes',
    workflowDefinition: makeDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'editing',
    initialContext: {},
    rules: {
      'rule:memory-note': {
        ruleId: 'rule:memory-note',
        eventType: 'MEMORY_NOTED',
        payloadFromInput: {
          op: 'op', key: 'key', value: 'value',
          expectedRevision: 'expectedRevision', ttlMs: 'ttlMs', requestId: 'requestId',
        },
      },
      'rule:foreign-memory-note': {
        ruleId: 'rule:foreign-memory-note',
        eventType: 'FOREIGN_MEMORY_PROBED',
        payloadFromInput: {
          op: 'op', key: 'key', value: 'value',
          expectedRevision: 'expectedRevision', ttlMs: 'ttlMs', requestId: 'requestId',
        },
      },
    },
    intentBindings: {
      submitMemoryNote: {
        trigger: { kind: 'event', eventType: 'MEMORY_NOTED' },
        ruleId: 'rule:memory-note',
        roles: ['requester'],
      },
      submitForeignMemoryNote: {
        trigger: { kind: 'event', eventType: 'FOREIGN_MEMORY_PROBED' },
        ruleId: 'rule:foreign-memory-note',
        roles: ['requester'],
      },
    },
    effectBindings: {
      'effect:memory-op': {
        semantics: 'idempotent',
        resource: { key: 'memory', operation: 'memory.put' },
        handler: memoryEffectHandler(false),
      },
      'effect:foreign-memory-op': {
        semantics: 'idempotent',
        resource: { key: 'memory', operation: 'memory.put' },
        handler: memoryEffectHandler(true),
      },
    },
  };
}
