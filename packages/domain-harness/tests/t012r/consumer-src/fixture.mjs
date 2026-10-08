/* eslint-disable -- T012 evidence-only clean-room consumer source; lint posture is not the evidence subject. */
/**
 * T012 clean-room transcription of the frozen T010A neutral Domain Definition
 * fixture (repo tests/fixtures/t010a-neutral-definition.ts, accepted at
 * 407b9ae4 via PR #910). This is a test-namespace fixture transcription, not
 * product source substitution: every production API used below is imported
 * from the PACKED public surfaces of the installed tarballs only.
 *
 * The frozen fixture digests this transcription is bound to:
 *   DefinitionGraphDigest 030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c
 *   T003C bindingDigest     8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87 (private seam at this candidate)
 *   final assemblyDigest    400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0 (private seam at this candidate)
 */
import { createHash } from 'node:crypto';

export const T010A_GRAPH_ID = 'graph.t010a.neutral';
export const T010A_WORKFLOW_COMPONENT_ID = 'wf.t010a';
export const T010A_TOOL_COMPONENT_ID = 'tool.t010a';
export const T010A_RELATION_ID = 'rel.t010a.wf-uses-tool';
export const T010A_KIND = { kindId: 'test.t010a-kind', version: '1.0.0' };
export const T010A_CAPABILITY = { capabilityId: 'cap.t010a.record', version: '1.0.0' };
export const T010A_OP_READ = 'op.t010a.read';
export const T010A_OP_RECORD = 'op.t010a.record';
export const T010A_EFFECT_TYPE = 'effect:t010a.record';
export const T010A_RESOURCE_KEY = 'res.t010a.audit-log';
export const T010A_RESOURCE_CURRENTNESS = {
  componentId: T010A_TOOL_COMPONENT_ID,
  providerId: 'provider.t010a-test',
  resourceKey: T010A_RESOURCE_KEY,
  revisionDigest: 'sha256:t010a-audit-log-revision-v1',
};
export const T010A_WORKFLOW_TARGET = 'wf.t010a';
export const T010A_WORKFLOW_INSTANCE_ID = 'wf.t010a:instance:1';
export const T010A_OCCURRENCE_TARGET = {
  workflowId: T010A_WORKFLOW_TARGET,
  instanceKey: 'instance:1',
};
export const T010A_NOW = '2026-10-07T00:00:00.000Z';
export const T010A_IDEMPOTENCY_KEY = 't010a:complete:1';

export const T010A_KIND_IMPLEMENTATION = {
  implementationId: 'impl.t010a-kind',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:t010a-kind-impl-content',
};

export const T010A_TOOL_IMPLEMENTATION = {
  implementationId: 'impl.t010a.tool',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:t010a-tool-impl-content',
};

export const FREEZE_DEFINITION_GRAPH_DIGEST =
  '030402bf802340d77f1ed88a3a4858dc2202b9b16bc590038d45cbf26b97825c';
export const FREEZE_BINDING_DIGEST =
  '8f5220bfc9c2e41c44cd06cdf36a5369662806a6e311fb1b5e338d2b2df86a87';
export const FREEZE_FINAL_ASSEMBLY_DIGEST =
  '400d668f9f806b7b7266c78b2322ffdf13bde07c8aa87a86edd9d78398d677c0';

export const t010aSha256 = {
  async digestUtf8(value) {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

export function t010aWorkflowComponent() {
  return {
    family: 'semantic',
    componentId: T010A_WORKFLOW_COMPONENT_ID,
    kind: T010A_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [T010A_CAPABILITY],
    semanticBody: {
      workflowKey: T010A_WORKFLOW_TARGET,
      lifecycle: { initial: 'READY', final: 'DONE' },
      states: [
        { stateKey: 'READY', kind: 'active' },
        { stateKey: 'DONE', kind: 'final' },
      ],
      intents: [
        { intentId: 'complete', admitted: true, fromState: 'READY', toState: 'DONE' },
      ],
    },
  };
}

export function t010aToolComponent() {
  return {
    family: 'tool',
    componentId: T010A_TOOL_COMPONENT_ID,
    kind: T010A_KIND,
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: T010A_OP_READ,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'none',
        },
        {
          operationId: T010A_OP_RECORD,
          inputSchema: { type: 'object' },
          outputSchema: { type: 'object' },
          effect: 'idempotent',
          declaredFailures: ['INVALID_NOTE'],
        },
      ],
      providesCapabilities: [T010A_CAPABILITY],
    },
  };
}

export function t010aDefinitionGraph() {
  return {
    graphId: T010A_GRAPH_ID,
    components: [t010aWorkflowComponent(), t010aToolComponent()],
    relations: [
      {
        relationId: T010A_RELATION_ID,
        relationKind: 'uses-capability',
        sourceComponentId: T010A_WORKFLOW_COMPONENT_ID,
        targetComponentId: T010A_TOOL_COMPONENT_ID,
      },
    ],
  };
}

const UNDERSTOOD_INTENTS = new Set(['complete']);

function t010aWorkflowSemanticsValidator(envelope) {
  const body = envelope.semanticBody;
  if (typeof body !== 'object' || body === null) {
    throw new Error('T010A fixture Kind understands only the neutral workflow semantic body');
  }
  if (body.workflowKey !== T010A_WORKFLOW_TARGET) {
    throw new Error('T010A fixture Kind: unknown workflowKey (must-understand fail-closed)');
  }
  if (body.lifecycle?.initial !== 'READY' || body.lifecycle?.final !== 'DONE') {
    throw new Error('T010A fixture Kind: lifecycle must be exactly READY -> DONE');
  }
  const stateKeys = new Set((body.states ?? []).map((state) => state.stateKey));
  if (!stateKeys.has('READY') || !stateKeys.has('DONE')) {
    throw new Error('T010A fixture Kind: READY and DONE states are required');
  }
  const doneState = (body.states ?? []).find((state) => state.stateKey === 'DONE');
  if (doneState?.kind !== 'final') {
    throw new Error('T010A fixture Kind: DONE must be a final state');
  }
  const intents = body.intents ?? [];
  if (intents.length !== 1) {
    throw new Error('T010A fixture Kind: exactly one admitted intent is understood');
  }
  const intent = intents[0];
  if (
    typeof intent.intentId !== 'string' ||
    !UNDERSTOOD_INTENTS.has(intent.intentId) ||
    intent.admitted !== true ||
    intent.fromState !== 'READY' ||
    intent.toState !== 'DONE'
  ) {
    throw new Error('T010A fixture Kind: unknown or unadmitted intent');
  }
}

/** The ONE exact Kind implementation validator of this fixture. */
export function t010aKindValidator(envelope) {
  if (envelope.family === 'tool') {
    // Delegated to the public T003A validator (injected by the caller to keep
    // this module free of any import beyond the packed public surface).
    return t010aKindValidator.toolValidator(envelope);
  }
  t010aWorkflowSemanticsValidator(envelope);
}
t010aKindValidator.toolValidator = (envelope) => {
  throw new Error('t010aKindValidator.toolValidator must be injected by the harness');
};

export function t010aKindImplementationBinding() {
  return {
    pin: {
      kind: T010A_KIND,
      implementation: T010A_KIND_IMPLEMENTATION,
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [T010A_CAPABILITY],
    validateComponent: t010aKindValidator,
  };
}

/** Deterministic test-only Tool executor (observation sink, never a journal). */
export class T010aTestExecutor {
  #effects = [];
  #observations = [];

  async run(operationId, input) {
    if (operationId === T010A_OP_RECORD) {
      this.#effects.push(Object.freeze({ operationId, input }));
      return { recorded: true, effectCount: this.#effects.length };
    }
    this.#observations.push(Object.freeze({ operationId, input }));
    return { observed: true, observationCount: this.#observations.length };
  }

  effects() {
    return this.#effects;
  }

  observations() {
    return this.#observations;
  }
}

export function t010aToolCandidate(executor) {
  return {
    implementation: T010A_TOOL_IMPLEMENTATION,
    supportedOperations: [T010A_OP_READ, T010A_OP_RECORD],
    handle: executor,
  };
}

/** Test ResourceProvider: resolves the one logical resource, never fabricates. */
export function t010aResourceProvider() {
  return {
    async resolve(request) {
      if (request.resourceKey !== T010A_RESOURCE_KEY) {
        return { status: 'absent' };
      }
      const resolved = {
        status: 'resolved',
        handle: { sink: 't010a-test-audit-log' },
        currentnessPin: {
          providerId: T010A_RESOURCE_CURRENTNESS.providerId,
          resourceKey: T010A_RESOURCE_CURRENTNESS.resourceKey,
          revisionDigest: T010A_RESOURCE_CURRENTNESS.revisionDigest,
        },
      };
      if (request.contract !== undefined) {
        return { ...resolved, contract: request.contract };
      }
      return resolved;
    },
  };
}

export function t010aWorkflowDefinition(effectInput = { note: 't010a-note' }) {
  return {
    workflowKey: T010A_WORKFLOW_TARGET,
    initialState: 'READY',
    initialContext: {},
    states: [
      {
        stateKey: 'READY',
        transitions: [
          {
            transitionKey: 'complete',
            trigger: { kind: 'event', eventType: 'T010A_COMPLETE_REQUESTED' },
            targetState: 'DONE',
            effectIntents: [
              {
                effectType: T010A_EFFECT_TYPE,
                input: effectInput,
                idempotencyKey: T010A_IDEMPOTENCY_KEY,
              },
            ],
          },
        ],
      },
      { stateKey: 'DONE', kind: 'final' },
    ],
  };
}

export function t010aResolvedDecision(source, structuredDecision) {
  return {
    source,
    structuredDecision,
    provenance: {},
    freshModelCallCount: source === 'harness-machine' ? 1 : 0,
    llmAvoided: source !== 'harness-machine',
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}

export const T010A_DECISION_SCHEMA = {
  isValid(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value;
    return (
      typeof record['decision'] === 'object' &&
      record['decision'] !== null &&
      typeof record['event'] === 'object' &&
      record['event'] !== null
    );
  },
};

export async function t010aGovernanceBody(sha256, createGovernanceBaselineBody) {
  return createGovernanceBaselineBody(
    {
      domainId: 't010a',
      governanceId: 't010a-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    sha256,
  );
}

export class T010aMemoryExactPackageCdiAuthority {
  #records = new Map();

  add(binding) {
    this.#records.set(this.#key(binding), { ...binding });
  }

  async resolveExactPackageCdi(binding) {
    const record = this.#records.get(this.#key(binding));
    return record === undefined ? undefined : { ...record };
  }

  #key(binding) {
    return `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`;
  }
}

export class T010aMemoryDurableExecutionStore {
  #pins = new Map();
  #snapshots = new Map();

  async getGovernanceExecutionPin(id) {
    return this.#pins.get(id);
  }

  async bindGovernanceExecutionPin(pin) {
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    return JSON.stringify(existing) === JSON.stringify(pin) ? 'existing' : 'conflict';
  }

  async getGovernanceBoundSnapshot(id) {
    return this.#snapshots.get(id);
  }

  async putGovernanceBoundSnapshot(snapshot) {
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}