/**
 * T05 fixture — the ordinary Business Agent Workflow (#1172).
 * ====================================================================
 *
 * The agent is NOT a separate runtime: it is one ordinary Business Domain
 * Package whose workflow state machine, rules, guard, intents and effect
 * bindings are driven exactly like every other Business turn —
 *
 *   public intent -> selected Kernel admission (schema/guard/transition)
 *   -> declared effect intent -> real Kernel effect journal/dispatch
 *   -> the sealed resources port -> selected C Memory / read-only C Tool
 *   -> authoritative K state CAS + immutable original receipt.
 *
 * Each Agent turn is composed from three supporting Standard features that
 * the HOST dispatches through the same selected App facade:
 *   - T05 Context Assembly (bounded, provenance-bearing, caller-untrusted),
 *   - T02 SemanticDecision (rule / reuse / pinned procedure / optional Model),
 *   - T03 workflow-control planner (bounded loop step + deterministic id).
 * The features are pure data producers: they never admit, never write Memory
 * and never mint a K permit. The Business package's commit effect is the ONE
 * governed mutation in this slice (a scoped Memory write dispatched as a
 * real Kernel effect); no external adapter, network client or second state
 * authority exists here.
 *
 * Scope identity comes from BUILD-pinned deployment constants only. Caller
 * input can name content and iteration budget, never the tenant/app/B/agent/
 * thread tuple, and never a Kernel/Host authority object.
 */

export const MODULE_ID = 'business-agent-workflow@v010.1.0.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [
  { endpointId: 'business:agent-workflow', kind: 'business-policy' },
];

export const INTENT_TYPES = ['agentCollectContext', 'agentCommitTurn', 'agentProbeForeignMemory'];
export const EFFECT_TYPES = ['effect:agent-context-read', 'effect:agent-turn-remember', 'effect:agent-foreign-read'];

const DEPLOYED_APP_ID = 'deploy:v010-t05-rich';
const APP_ID = 'app:v010-t05-rich';
const TENANT_ID = 'tenant:v010-t05-rich';
const AGENT_ID = 'agent:context-agent';
const THREAD_ID = 'thread:context-main';
const FOREIGN_TENANT_ID = 'tenant:v010-t05-foreign';

/** The Agent loop's own bounded step ceiling (also enforced by the guard below). */
export const AGENT_MAX_STEPS = 4;

const GUARD_WITHIN_TURN_BUDGET = {
  guardId: 'guard:agent-turn-budget',
  predicate: {
    op: 'lt',
    left: { source: 'event', path: ['payload', 'iteration'] },
    right: { source: 'literal', value: AGENT_MAX_STEPS },
  },
};

/**
 * The ONE rule-authorized payload projection of this Business. The selected
 * Kernel validates every transition's dynamic inputFrom against the rule of
 * EVERY intent binding that shares the definition, so all three rules map
 * the same bounded field set; non-commit turns carry nulls for the unused
 * commit fields (the projection requires the keys to exist).
 */
const AGENT_INPUT_PROJECTION = {
  iteration: 'iteration',
  note: 'note',
  decisionOutcome: 'decisionOutcome',
  decisionData: 'decisionData',
  contextDigest: 'contextDigest',
  contextEntries: 'contextEntries',
  modelCalls: 'modelCalls',
  modelCallEvidence: 'modelCallEvidence',
  requestId: 'requestId',
};

const COMMIT_INPUT_FROM = {
  iteration: { source: 'event', path: ['payload', 'iteration'] },
  note: { source: 'event', path: ['payload', 'note'] },
  decisionOutcome: { source: 'event', path: ['payload', 'decisionOutcome'] },
  decisionData: { source: 'event', path: ['payload', 'decisionData'] },
  contextDigest: { source: 'event', path: ['payload', 'contextDigest'] },
  contextEntries: { source: 'event', path: ['payload', 'contextEntries'] },
  modelCalls: { source: 'event', path: ['payload', 'modelCalls'] },
  modelCallEvidence: { source: 'event', path: ['payload', 'modelCallEvidence'] },
  requestId: { source: 'event', path: ['payload', 'requestId'] },
};

function makeDefinition() {
  return {
    workflowKey: 'agent-context-loop',
    initialState: 'ready',
    initialContext: {},
    guards: [GUARD_WITHIN_TURN_BUDGET],
    states: [
      {
        stateKey: 'ready',
        transitions: [
          {
            // Read-only turn: actual scoped Memory search + Tool lookup run as
            // ONE Kernel effect. The returned observations carry the physical
            // source/revision provenance; the effect changes no business value.
            transitionKey: 'collect',
            trigger: { kind: 'event', eventType: 'AGENT_CONTEXT_REQUESTED' },
            targetState: 'ready',
            effectIntents: [
              {
                effectType: 'effect:agent-context-read',
                inputFrom: { requestId: { source: 'event', path: ['payload', 'requestId'] } },
                idempotencyKeyFrom: { template: 'agent-context:{requestId}' },
              },
            ],
          },
          {
            // The ONE governed mutation: a bounded turn record in scoped
            // Memory. The guard refuses an iteration beyond the Agent budget
            // BEFORE any journal/effect activity.
            transitionKey: 'commit',
            trigger: { kind: 'event', eventType: 'AGENT_TURN_COMMITTED' },
            targetState: 'ready',
            guardId: 'guard:agent-turn-budget',
            effectIntents: [
              {
                effectType: 'effect:agent-turn-remember',
                inputFrom: COMMIT_INPUT_FROM,
                idempotencyKeyFrom: { template: 'agent-turn:{requestId}' },
              },
            ],
          },
          {
            // Deliberately labeled probe on its own event/effect type: the
            // handler asks the selected Memory capability for a tenant this
            // App did NOT select, proving an honest typed failure with zero
            // physical rows while the Kernel receipt never invents success.
            transitionKey: 'probe',
            trigger: { kind: 'event', eventType: 'FOREIGN_MEMORY_PROBED' },
            targetState: 'ready',
            effectIntents: [
              {
                effectType: 'effect:agent-foreign-read',
                inputFrom: { requestId: { source: 'event', path: ['payload', 'requestId'] } },
                idempotencyKeyFrom: { template: 'agent-foreign:{requestId}' },
              },
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

function trustedScope() {
  return {
    deployedAppId: DEPLOYED_APP_ID,
    tenantId: TENANT_ID,
    appId: APP_ID,
    businessPackageId: MODULE_ID,
    agentId: AGENT_ID,
    threadId: THREAD_ID,
  };
}

function boundedText(value, limit) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return typeof text === 'string' ? text.slice(0, limit) : '';
}

function memoryObservation(row, effectId) {
  return {
    id: 'memory:' + String(row.key),
    kind: 'memory',
    content: boundedText(row.value, 1024),
    scope: trustedScope(),
    provenance: {
      source: boundedText(row.provenance.source, 256),
      revision: 'r' + String(row.revision),
      observedBy: ('effect:' + effectId).slice(0, 256),
    },
  };
}

function toolObservation(item, effectId) {
  return {
    id: 'tool:' + String(item.id),
    kind: 'tool',
    content: boundedText(item.text, 1024),
    scope: trustedScope(),
    provenance: {
      source: boundedText(item.provenance.source, 256),
      revision: boundedText(item.provenance.revision, 256),
      observedBy: ('effect:' + effectId).slice(0, 256),
    },
  };
}

function requireResources(resources, effectType) {
  if (resources === undefined || resources === null || typeof resources.call !== 'function') {
    throw new Error(effectType + ' requires the Host resources port');
  }
  return resources;
}

/** Read-only collect: scoped Memory search + read-only Tool lookup. */
function contextReadEffectHandler() {
  return async ({ effectId, resources }) => {
    const port = requireResources(resources, 'effect:agent-context-read');
    const memory = await port.call('memory', 'memory.search', {
      scope: trustedScope(),
      keyPrefix: 'agent:',
    });
    const tool = await port.call('tool', 'tool.lookup', {
      scope: trustedScope(),
      query: 'agent-context',
    });
    const observations = [
      ...memory.rows.map((row) => memoryObservation(row, effectId)),
      ...tool.items.map((item) => toolObservation(item, effectId)),
    ];
    return {
      ok: true,
      operation: 'agent.context-read',
      observations,
      counts: { memory: memory.rows.length, tool: tool.items.length },
    };
  };
}

/** The one governed mutation: bounded turn record in scoped Memory. */
function turnRememberEffectHandler() {
  return async ({ input, effectId, resources }) => {
    const port = requireResources(resources, 'effect:agent-turn-remember');
    const key = 'agent:turn:' + String(input.iteration);
    const value = {
      iteration: input.iteration,
      note: input.note,
      decisionOutcome: input.decisionOutcome,
      decisionData: input.decisionData,
      contextDigest: input.contextDigest,
      contextEntries: input.contextEntries,
      modelCalls: input.modelCalls,
      modelCallEvidence: input.modelCallEvidence,
      requestId: input.requestId,
    };
    const result = await port.call('memory', 'memory.put', {
      scope: trustedScope(),
      key,
      value,
      provenance: { source: 'effect:' + effectId, recordedBy: MODULE_ID },
    });
    return { ok: true, operation: 'agent.turn-remember', key, revision: result.revision };
  };
}

/** Honest cross-tenant probe: the capability must refuse with zero rows. */
function foreignReadEffectHandler() {
  return async ({ resources }) => {
    const port = requireResources(resources, 'effect:agent-foreign-read');
    const foreign = { ...trustedScope(), tenantId: FOREIGN_TENANT_ID };
    await port.call('memory', 'memory.search', { scope: foreign, keyPrefix: 'agent:' });
    throw new Error('effect:agent-foreign-read unexpectedly read a foreign tenant; the capability must deny it');
  };
}

export function getPolicy() {
  return {
    packageId: MODULE_ID,
    policyId: 'agent-context-loop',
    domainId: 'agent-workflow',
    workflowDefinition: makeDefinition(),
    decisionSchema,
    governanceSemantics: { hardInvariants: [] },
    initialStateKey: 'ready',
    initialContext: {},
    rules: {
      'rule:agent-collect': {
        ruleId: 'rule:agent-collect',
        eventType: 'AGENT_CONTEXT_REQUESTED',
        payloadFromInput: AGENT_INPUT_PROJECTION,
      },
      'rule:agent-commit': {
        ruleId: 'rule:agent-commit',
        eventType: 'AGENT_TURN_COMMITTED',
        payloadFromInput: AGENT_INPUT_PROJECTION,
      },
      'rule:agent-foreign-probe': {
        ruleId: 'rule:agent-foreign-probe',
        eventType: 'FOREIGN_MEMORY_PROBED',
        payloadFromInput: AGENT_INPUT_PROJECTION,
      },
    },
    intentBindings: {
      agentCollectContext: {
        trigger: { kind: 'event', eventType: 'AGENT_CONTEXT_REQUESTED' },
        ruleId: 'rule:agent-collect',
        roles: ['requester'],
      },
      agentCommitTurn: {
        trigger: { kind: 'event', eventType: 'AGENT_TURN_COMMITTED' },
        ruleId: 'rule:agent-commit',
        roles: ['requester'],
      },
      agentProbeForeignMemory: {
        trigger: { kind: 'event', eventType: 'FOREIGN_MEMORY_PROBED' },
        ruleId: 'rule:agent-foreign-probe',
        roles: ['requester'],
      },
    },
    effectBindings: {
      'effect:agent-context-read': {
        semantics: 'idempotent',
        resource: { key: 'memory', operation: 'memory.search' },
        handler: contextReadEffectHandler(),
      },
      'effect:agent-turn-remember': {
        semantics: 'idempotent',
        resource: { key: 'memory', operation: 'memory.put' },
        handler: turnRememberEffectHandler(),
      },
      'effect:agent-foreign-read': {
        semantics: 'idempotent',
        resource: { key: 'memory', operation: 'memory.search' },
        handler: foreignReadEffectHandler(),
      },
    },
  };
}
