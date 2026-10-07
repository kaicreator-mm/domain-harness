/**
 * T010A neutral Domain Definition fixture (issue #889; frozen authority
 * #589@issuecomment-5980528597 T010A section; readiness #718 PASS with
 * rebind reviews #730/#746 PASS CLOSED; T004C prerequisite accepted #880).
 *
 * One synthetic, non-product, non-Standard, non-self-referential reference
 * Domain Definition for the E11 journey (T010B/T010C reuse this module):
 *
 * - one neutral Workflow Semantic Component `wf.t010a` whose lifecycle is
 *   `READY -> DONE` via the admitted intent `complete` (must-understand:
 *   the exact Kind implementation below understands ONLY that admitted
 *   intent; any unknown/unadmitted intent fails closed at Assembly-bound
 *   admission);
 * - one Tool Component `tool.t010a` providing the small exact capability
 *   `cap.t010a.record` used by the Workflow, with one `effect=none`
 *   operation (`op.t010a.read`) and one effectful operation
 *   (`op.t010a.record`, effect `idempotent`);
 * - one explicit typed graph relation (`rel.t010a.wf-uses-tool`) plus the
 *   exact requires/provides capability dependency, so Definition graph
 *   composition and capability/Tool closure are exercised;
 * - exact Kind/Tool implementations and a test ResourceProvider bound
 *   through the SAME public Assembly ports (`sealRuntimeAssembly`,
 *   `resolveCurrentCapabilityProvider`, `bindToolImplementation`,
 *   `admitToolExposure`/`admitToolInvocationRequest`, Central Admission) —
 *   no private runtime shortcut exists anywhere in this fixture;
 * - all fixture names/IDs live in the `test.t010a`/`t010a` test namespace
 *   and are never published as Standard Component contracts (no Standard
 *   descriptor/set material is minted here at all).
 *
 * The effectful test executor uses a deterministic test-only in-memory
 * effect recorder. It is an in-executor observation sink for assertions
 * only: durable effect authority stays exclusively on the existing Central
 * Admission effect journal (VolatileAdmissionEffectJournal), and the
 * recorder is never consulted by any production seam — it can never become
 * a second journal.
 *
 * SOURCE_MUTATION=NONE: this module lives under the test namespace and
 * imports only accepted public contracts.
 */
import { createHash } from 'node:crypto';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import type { ContentDigest, Sha256Port } from '../../src/contracts/identity.js';
import type { JsonObject, JsonValue } from '../../src/contracts/json.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
  type ToolImplementationIdentity,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  validateToolComponent,
} from '../../src/contracts/tool-component.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../src/contracts/invocation-request.js';
import type {
  ResourceProvider,
  ResourceProviderResponse,
} from '../../src/contracts/resource-resolution.js';
import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';
import type {
  CentralAdmissionPorts,
  CentralAdmissionRequest,
} from '../../src/admission/contracts.js';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  createGovernanceExecutionPin,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineBody,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/effect-journal.js';
import type { DecisionResolverSource, ResolvedDecision } from '../../src/decision-resolver/index.js';

// ---------------------------------------------------------------------------
// Frozen fixture identity (test namespace only; never Standard material).
// ---------------------------------------------------------------------------

export const T010A_GRAPH_ID = 'graph.t010a.neutral';
export const T010A_WORKFLOW_COMPONENT_ID = 'wf.t010a';
export const T010A_TOOL_COMPONENT_ID = 'tool.t010a';
export const T010A_RELATION_ID = 'rel.t010a.wf-uses-tool';
export const T010A_KIND = { kindId: 'test.t010a-kind', version: '1.0.0' } as const;
export const T010A_CAPABILITY = { capabilityId: 'cap.t010a.record', version: '1.0.0' } as const;
export const T010A_OP_READ = 'op.t010a.read';
export const T010A_OP_RECORD = 'op.t010a.record';
export const T010A_EFFECT_TYPE = 'effect:t010a.record';
export const T010A_RESOURCE_KEY = 'res.t010a.audit-log';
/**
 * The one stable non-secret resource-currentness evidence of the fixture:
 * the test ResourceProvider attests exactly this pin, and the occurrence
 * activation pins exactly this evidence, so the T005C re-proof at effect
 * time compares identical exact material.
 */
export const T010A_RESOURCE_CURRENTNESS = {
  componentId: T010A_TOOL_COMPONENT_ID,
  providerId: 'provider.t010a-test',
  resourceKey: T010A_RESOURCE_KEY,
  revisionDigest: 'sha256:t010a-audit-log-revision-v1',
} as const;
export const T010A_WORKFLOW_TARGET = 'wf.t010a';
export const T010A_WORKFLOW_INSTANCE_ID = 'wf.t010a:instance:1';
export const T010A_OCCURRENCE_TARGET: WorkflowAddress = {
  workflowId: T010A_WORKFLOW_TARGET,
  instanceKey: 'instance:1',
};
export const T010A_NOW = '2026-10-07T00:00:00.000Z';
export const T010A_IDEMPOTENCY_KEY = 't010a:complete:1';

export const T010A_KIND_IMPLEMENTATION: ToolImplementationIdentity = {
  implementationId: 'impl.t010a-kind',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:t010a-kind-impl-content',
};

export const T010A_TOOL_IMPLEMENTATION: ToolImplementationIdentity = {
  implementationId: 'impl.t010a.tool',
  implementationVersion: '1.0.0',
  implementationDigest: 'sha256:t010a-tool-impl-content',
};

export const t010aSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Neutral Definition graph (e11.t010a.neutral.definition.v1).
// ---------------------------------------------------------------------------

/**
 * Definition-plane semantic body of the neutral Workflow Component: the
 * lifecycle `READY -> DONE` is realized exclusively through the admitted
 * intent `complete`. The exact Kind implementation's must-understand
 * validator (below) understands exactly this intent and nothing else.
 */
export function t010aWorkflowComponent(): ComponentEnvelope {
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

/**
 * The one Tool Component: a small exact capability (record + read back a
 * deterministic note) used by the Workflow. Declares one `effect=none`
 * operation and one effectful (`idempotent`) operation, and provides the
 * exact capability the Workflow requires.
 */
export function t010aToolComponent(): ComponentEnvelope {
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

/**
 * The neutral Definition graph: two bound Components and one explicit typed
 * relation so graph composition (relation material included exactly once in
 * the normalized graph identity) is exercised alongside the capability
 * requires/provides dependency.
 */
export function t010aDefinitionGraph(): DefinitionGraphEnvelope {
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

// ---------------------------------------------------------------------------
// Exact Kind implementation: must-understand admission of the only admitted
// intent `complete` (READY -> DONE). Unknown or unadmitted intents fail
// closed here — the sealed Assembly-bound admission invokes this validator.
// ---------------------------------------------------------------------------

const UNDERSTOOD_INTENTS = new Set(['complete']);

function t010aWorkflowSemanticsValidator(envelope: ComponentEnvelope): void {
  const body = envelope.semanticBody as {
    workflowKey?: unknown;
    lifecycle?: { initial?: unknown; final?: unknown };
    states?: readonly { stateKey?: unknown; kind?: unknown }[];
    intents?: readonly {
      intentId?: unknown;
      admitted?: unknown;
      fromState?: unknown;
      toState?: unknown;
    }[];
  };
  if (typeof body !== 'object' || body === null) {
    throw new Error('T010A fixture Kind understands only the neutral workflow semantic body');
  }
  if (body.workflowKey !== T010A_WORKFLOW_TARGET) {
    throw new Error('T010A fixture Kind: unknown workflowKey (must-understand fail-closed)');
  }
  if (body.lifecycle?.initial !== 'READY' || body.lifecycle?.final !== 'DONE') {
    throw new Error(
      'T010A fixture Kind: lifecycle must be exactly READY -> DONE (must-understand fail-closed)',
    );
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
    throw new Error(
      'T010A fixture Kind: exactly one admitted intent is understood (must-understand fail-closed)',
    );
  }
  const intent = intents[0]!;
  if (
    typeof intent.intentId !== 'string' ||
    !UNDERSTOOD_INTENTS.has(intent.intentId) ||
    intent.admitted !== true ||
    intent.fromState !== 'READY' ||
    intent.toState !== 'DONE'
  ) {
    throw new Error(
      'T010A fixture Kind: unknown or unadmitted intent (only the admitted intent `complete` from READY to DONE is understood)',
    );
  }
}

/**
 * The ONE exact Kind implementation validator of this fixture. Semantic
 * components are validated against the understood READY -> DONE /
 * intent-`complete` semantics; Tool components delegate to the public T003A
 * Tool declaration validator (the Kind contract stays the single source of
 * truth — never reimplemented here).
 */
export function t010aKindValidator(envelope: ComponentEnvelope): void {
  if (envelope.family === 'tool') {
    validateToolComponent(envelope);
    return;
  }
  t010aWorkflowSemanticsValidator(envelope);
}

/** Exact KindImplementation binding input for `sealRuntimeAssembly`. */
export function t010aKindImplementationBinding(): KindImplementationBindingInput {
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

// ---------------------------------------------------------------------------
// Deterministic test-only executor + effect recorder (never a second journal).
// ---------------------------------------------------------------------------

export interface T010aRecordedCall {
  readonly operationId: string;
  readonly input: JsonValue;
}

/**
 * Deterministic test-only Tool executor. The effectful operation appends to
 * an in-memory recorder so tests can assert the exact effect input; the
 * effect=none operation only appends to a separate observation list. This
 * recorder is an in-executor observation sink: durable effect authority
 * stays exclusively on the Central Admission effect journal, no production
 * seam ever reads it, and it grants no occurrence/transition authority.
 */
export class T010aTestExecutor {
  readonly #effects: T010aRecordedCall[] = [];
  readonly #observations: T010aRecordedCall[] = [];

  async run(operationId: string, input: JsonValue): Promise<JsonObject> {
    if (operationId === T010A_OP_RECORD) {
      this.#effects.push(Object.freeze({ operationId, input }));
      return { recorded: true, effectCount: this.#effects.length };
    }
    this.#observations.push(Object.freeze({ operationId, input }));
    return { observed: true, observationCount: this.#observations.length };
  }

  effects(): readonly T010aRecordedCall[] {
    return this.#effects;
  }

  observations(): readonly T010aRecordedCall[] {
    return this.#observations;
  }
}

/** Exact Tool implementation candidate pinning the executor as opaque handle. */
export function t010aToolCandidate(executor: T010aTestExecutor): ToolImplementationCandidate {
  return {
    implementation: T010A_TOOL_IMPLEMENTATION,
    supportedOperations: [T010A_OP_READ, T010A_OP_RECORD],
    handle: executor,
  };
}

// ---------------------------------------------------------------------------
// Test ResourceProvider (injected host-integration port; same public seam
// every host uses — the core never resolves resources by itself).
// ---------------------------------------------------------------------------

/**
 * Test ResourceProvider resolving the fixture's one logical resource
 * `res.t010a.audit-log` (required, narrowed to the effectful operation).
 * Unknown keys resolve absent; the provider never fabricates resources.
 */
export function t010aResourceProvider(): ResourceProvider {
  return {
    async resolve(request): Promise<ResourceProviderResponse> {
      if (request.resourceKey !== T010A_RESOURCE_KEY) {
        return { status: 'absent' };
      }
      const resolved: Extract<ResourceProviderResponse, { status: 'resolved' }> = {
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

// ---------------------------------------------------------------------------
// Assembly ports: seal -> capability selection -> exact implementation bind.
// ---------------------------------------------------------------------------

export interface T010aAssemblyBundle {
  readonly graph: DefinitionGraphEnvelope;
  readonly assembly: SealedRuntimeAssembly;
  readonly definitionGraphDigest: ContentDigest;
}

/**
 * Seal the Runtime Assembly over the neutral Definition graph through the
 * public T002B port. The logical resource requirement (required, narrowed to
 * the effectful operation) participates in Assembly identity (T005A/T002B);
 * no implementation handle enters any identity material.
 */
export async function buildT010aAssembly(
  graph: DefinitionGraphEnvelope = t010aDefinitionGraph(),
  sha256: Sha256Port = t010aSha256,
): Promise<T010aAssemblyBundle> {
  const assembly = await sealRuntimeAssembly(
    {
      definitionGraph: graph,
      kindImplementations: [t010aKindImplementationBinding()],
      resourceRequirements: [
        {
          owner: t010aToolComponent(),
          declaration: {
            componentId: T010A_TOOL_COMPONENT_ID,
            requirements: [
              {
                resourceKey: T010A_RESOURCE_KEY,
                contract: { contractId: 'test.t010a-audit-log', version: '1.0.0' },
                operationId: T010A_OP_RECORD,
                required: true,
              },
            ],
          },
        },
      ],
    },
    sha256,
  );
  const definitionGraphDigest = await computeDefinitionGraphDigest(graph, sha256);
  return { graph, assembly, definitionGraphDigest };
}

/**
 * Capability/Tool closure: the Workflow's exact required capability is
 * resolved to its current provider through the public T003B port (exactly
 * one compatible provider — never registry-order/first-wins), and the exact
 * Tool implementation is bound through the public T003C port. The sealed
 * binding pairs the executor handle OUTSIDE every digest material.
 */
export async function bindT010aTool(
  bundle: T010aAssemblyBundle,
  executor: T010aTestExecutor,
  sha256: Sha256Port = t010aSha256,
): Promise<SealedToolImplementationBinding> {
  const selection = await resolveCurrentCapabilityProvider(
    bundle.graph,
    T010A_CAPABILITY,
    T010A_WORKFLOW_COMPONENT_ID,
    bundle.definitionGraphDigest,
    sha256,
  );
  return bindToolImplementation({
    assembly: bundle.assembly,
    selection: JSON.parse(JSON.stringify(selection)) as typeof selection,
    currentDefinitionGraph: bundle.graph,
    implementations: [t010aToolCandidate(executor)],
    sha256,
  });
}

// ---------------------------------------------------------------------------
// T004A invocation-request admission over the SAME Assembly ports.
// ---------------------------------------------------------------------------

export const T010A_ADMIT_ALL: ToolExposureAdmissionPolicy = {
  decideAdmission: () => ({ admitted: true }),
};

export function t010aCaller(overrides: Partial<InvocationCallerContext> = {}): InvocationCallerContext {
  return { callerId: 'caller.t010a-session-1', callerKind: 'workflow', ...overrides };
}

/**
 * Admit one Tool operation invocation through the public T004A seam
 * (exposure admission + invocation-request admission) against the exact
 * current sealed successor Assembly. No private shortcut: every gate is the
 * same port a production host uses.
 */
export async function admitT010aOperation(
  binding: SealedToolImplementationBinding,
  bundle: T010aAssemblyBundle,
  operationId: string,
  input: JsonValue,
  sha256: Sha256Port = t010aSha256,
): Promise<AdmittedToolInvocationRequest> {
  const exposure = await admitToolExposure(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId,
      caller: t010aCaller(),
      assembly: binding.successorAssembly,
      currentDefinitionGraph: bundle.graph,
      policy: T010A_ADMIT_ALL,
    },
    sha256,
  );
  return admitToolInvocationRequest(
    {
      toolComponentId: T010A_TOOL_COMPONENT_ID,
      operationId,
      input,
      caller: t010aCaller(),
      definitionGraphDigest: binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: binding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: binding.successorAssembly, currentDefinitionGraph: bundle.graph },
    sha256,
  );
}

// ---------------------------------------------------------------------------
// Effectful occurrence context: ONE already-authoritative PRODUCTION
// occurrence through the accepted T002C/T002D activation + existing Central
// Admission durable-effect path (T004C prerequisite, accepted #880).
// ---------------------------------------------------------------------------

export class T010aMemoryExactPackageCdiAuthority implements ExactPackageCdiAuthority {
  readonly #records = new Map<string, GovernancePackageCdiBinding>();

  add(binding: GovernancePackageCdiBinding): void {
    this.#records.set(this.#key(binding), { ...binding });
  }

  async resolveExactPackageCdi(
    binding: GovernancePackageCdiBinding,
  ): Promise<GovernancePackageCdiBinding | undefined> {
    const record = this.#records.get(this.#key(binding));
    return record === undefined ? undefined : { ...record };
  }

  #key(binding: GovernancePackageCdiBinding): string {
    return `${binding.domainId} ${binding.packageId} ${binding.domainIntelligenceContentDigest}`;
  }
}

export class T010aMemoryDurableExecutionStore implements DurableExecutionStore {
  readonly #pins = new Map<string, unknown>();
  readonly #snapshots = new Map<string, unknown>();

  async getGovernanceExecutionPin(id: string): Promise<unknown> {
    return this.#pins.get(id);
  }

  async bindGovernanceExecutionPin(
    pin: GovernanceExecutionPin,
  ): Promise<'inserted' | 'existing' | 'conflict'> {
    const existing = this.#pins.get(pin.workflowInstanceId);
    if (existing === undefined) {
      this.#pins.set(pin.workflowInstanceId, pin);
      return 'inserted';
    }
    return JSON.stringify(existing) === JSON.stringify(pin) ? 'existing' : 'conflict';
  }

  async getGovernanceBoundSnapshot(id: string): Promise<unknown> {
    return this.#snapshots.get(id);
  }

  async putGovernanceBoundSnapshot(
    snapshot: { readonly workflowInstanceId: string },
  ): Promise<void> {
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

/**
 * Engine-neutral runtime lifecycle of the fixture Workflow: initial state
 * READY, one transition on the admitted intent `complete` to the final
 * state DONE, carrying the durable effect intent of the Tool's effectful
 * operation. This is the SAME lifecycle the Definition-plane semantic body
 * declares — product vocabulary only, no engine identity.
 */
export function t010aWorkflowDefinition(
  effectInput: JsonValue = { note: 't010a-note' },
): DomainWorkflowDefinition {
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

function t010aResolvedDecision(source: DecisionResolverSource, structuredDecision: JsonValue): ResolvedDecision<JsonValue> {
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

const T010A_DECISION_SCHEMA = {
  isValid(value: JsonValue): boolean {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    return (
      typeof record['decision'] === 'object' &&
      record['decision'] !== null &&
      typeof record['event'] === 'object' &&
      record['event'] !== null
    );
  },
};

async function t010aGovernanceBody(sha256: Sha256Port): Promise<GovernanceBaselineBody> {
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

export interface T010aOccurrenceContext {
  readonly binding: SealedToolImplementationBinding;
  readonly bundle: T010aAssemblyBundle;
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly packageCdi: T010aMemoryExactPackageCdiAuthority;
  readonly store: T010aMemoryDurableExecutionStore;
  readonly activator: AssemblyExecutionActivator;
  readonly pin: GovernanceExecutionPin;
  readonly coordinator: GovernanceExecutionCoordinator;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  readonly admissionRequest: CentralAdmissionRequest;
  readonly definition: DomainWorkflowDefinition;
}

export interface T010aOccurrenceOptions {
  /** The exact invocation input the effect intent must realize (intent closure). */
  readonly effectInput?: JsonValue;
  /** Skip activation: no authoritative occurrence pin exists (negative path). */
  readonly skipActivation?: boolean;
}

/**
 * Build ONE already-authoritative PRODUCTION occurrence for the fixture
 * Workflow and the Tool's effectful operation. Activation crosses the
 * accepted T002C/T002D seams; the admission request is the existing Central
 * Admission input shape; the durable effect journal is the ONE existing
 * journal. `effectInput` must equal the later T004C invocation input (the
 * admission effect path executes exactly the admitted intent material).
 */
export async function buildT010aOccurrenceContext(
  binding: SealedToolImplementationBinding,
  bundle: T010aAssemblyBundle,
  options: T010aOccurrenceOptions = {},
  sha256: Sha256Port = t010aSha256,
): Promise<T010aOccurrenceContext> {
  const effectInput = options.effectInput ?? { note: 't010a-note' };
  const b1 = await t010aGovernanceBody(sha256);
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const packageCdi = new T010aMemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 't010a',
    packageId: 'pkg-t010a-1',
    domainIntelligenceContentDigest: 'cdi-t010a-1',
  });
  const store = new T010aMemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, sha256);
  const activationBinding = {
    domainId: 't010a',
    packageId: 'pkg-t010a-1',
    domainIntelligenceContentDigest: 'cdi-t010a-1',
    governanceBaseline: b1.identity,
  };
  const pin =
    options.skipActivation === true
      ? await createGovernanceExecutionPin(
          {
            workflowTarget: T010A_WORKFLOW_TARGET,
            workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
            binding: activationBinding,
          },
          sha256,
        )
      : await activator.activate({
          workflowTarget: T010A_WORKFLOW_TARGET,
          workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
          binding: activationBinding,
          assembly: binding.successorAssembly,
          authorityClass: 'PRODUCTION',
          resourceCurrentness: [T010A_RESOURCE_CURRENTNESS],
          currentDefinitionGraph: bundle.graph,
        });
  const coordinator = new GovernanceExecutionCoordinator(store, sha256);
  const journal = new VolatileAdmissionEffectJournal();
  const definition = t010aWorkflowDefinition(effectInput);
  const admissionRequest: CentralAdmissionRequest = {
    target: { ...T010A_OCCURRENCE_TARGET },
    turn: { kind: 'message', sourceMessageId: 'msg:t010a:1' },
    trigger: { kind: 'event', eventType: 'T010A_COMPLETE_REQUESTED' },
    workflowInstanceId: T010A_WORKFLOW_INSTANCE_ID,
    definition,
    currentStateKey: 'READY',
    context: {},
    event: { type: 'T010A_COMPLETE_REQUESTED', payload: { note: 't010a-note' } },
    resolved: t010aResolvedDecision('harness-machine', {
      decision: { outcome: 'complete', data: { note: 't010a-note' } },
      event: { type: 'T010A_COMPLETE_REQUESTED', payload: { note: 't010a-note' } },
    }),
    decisionSchema: T010A_DECISION_SCHEMA,
    now: T010A_NOW,
  };

  return {
    binding,
    bundle,
    baselines,
    packageCdi,
    store,
    activator,
    pin,
    coordinator,
    journal,
    admissionPorts: { governance: coordinator, baselines, effectJournal: journal },
    admissionRequest,
    definition,
  };
}
