/**
 * T007C — Workflow authority/recovery regression evidence (issue #888;
 * controller #537 MERGE_FIRST; authority #589 PACK-C T007C section frozen at
 * issuecomment-5980512404; readiness #704 PASS CLOSED).
 *
 * Validation/integration concern, NOT new runtime design: this suite proves
 * the T007A (#848) / T007B (#868) adapter leaves the EXISTING authority model
 * intact, over the readiness #704 frozen F0-F9 fault/recovery matrix and the
 * issue #888 required fault cases:
 *
 *   F0  valid authoritative Workflow transition/effect baseline — the v0.7
 *       admitted Workflow Component compiles through the T007B bridge, runs on
 *       the ONE existing runtime, and its effectful Tool routes through T004C
 *       into the existing Central Admission occurrence + durable effect
 *       journal (exactly one executed effect, exactly one completed record);
 *   F1  stale Assembly rejects before transition/effect — a replaced Tool
 *       implementation (new sealed Assembly) rejects the compiled artifact
 *       (STALE) and the effectful invocation bound to the stale Assembly is
 *       refused (OCCURRENCE_ASSEMBLY_MISMATCH / currentness) with zero
 *       dispatch and zero journal records;
 *   F2  stale/forged compiled artifact or wrong Workflow KindImplementation
 *       pin rejects — a caller-minted look-alike artifact is UNTRUSTED before
 *       any execution, and an artifact compiled under a different exact
 *       KindImplementation pin is STALE;
 *   F3  crash before effect — a journal that cannot begin the durable record
 *       models the crash-before-effect checkpoint: no dispatch runs and no
 *       record exists; the retried turn then executes exactly once (no phantom
 *       duplicate, no leftover state);
 *   F4  crash after the effect may have occurred but before outcome
 *       persistence — the journal commit failure preserves the existing
 *       outcome-unknown posture (ADMISSION_EFFECT_JOURNAL_CONFLICT), the
 *       durable record stays 'started', and a retry fails
 *       ADMISSION_EFFECT_AMBIGUOUS without re-executing the possibly-done
 *       effect (never an unsafe automatic retry);
 *   F5  durable replay resolves the exact Definition + final Assembly +
 *       Workflow KindImplementation pins — activator recovery re-proves the
 *       pinned occurrence (bindingDigest/assemblyDigest/authority class) and
 *       the replayed turn reuses the SAME effect identity on the SAME journal
 *       lineage (disposition 'replayed', no re-dispatch);
 *   F6  duplicate command/effect idempotency — re-driving the SAME durable
 *       turn resolves the SAME effect identity through the durable journal
 *       boundary (not a local helper): one dispatch, one journal record;
 *   F7  wrong authority class — a SIMULATION-class occurrence can never mint
 *       production durable effect authority (AUTHORITY_CLASS_MISMATCH before
 *       any side effect, zero dispatch, zero journal records);
 *   F8  engine/adapter replacement — sealing a new Assembly over a different
 *       exact Workflow KindImplementation pin (T007A factory) invalidates the
 *       stale artifact/compiled currentness BEFORE execution while the
 *       Definition identity is untouched and ZERO Microkernel source edits are
 *       involved (tests only; structural import seam re-proven);
 *   F9  Raw/legacy direct bypass rejects before authoritative mutation — raw
 *       legacy workflow material (a caller-minted artifact look-alike, a
 *       non-Workflow Kind component, a legacy-class workflow definition) can
 *       never reach authoritative execution, and the transition-execution
 *       plane (T007B bridge) carries no admission/journal authority import, so
 *       no alternate effect-authority entry exists.
 *
 * Authority invariants re-proven at the composition level: exactly ONE
 * authoritative Runtime (the shipped engine reached only through the private
 * bridge; one state-machine dependency); Workflow transition admission remains
 * Central Admission / domain-occurrence anchored (no durable governance pin,
 * no admitted effect); the T004C seam is the only effectful Tool route (the
 * bridge never names a journal/occurrence/effect port); duplicate prevention
 * is demonstrated at the durable authority boundary; replay/recovery preserves
 * the same occurrence/effect identity (no fresh namespace is minted to escape
 * outcome-unknown).
 *
 * Pre-evidence identity capture (DefinitionGraphDigest, base/successor
 * Assembly digests, exact Workflow KindImplementation pin, T003C binding
 * digest, governance pin binding digest, artifact identity) is recorded ONCE
 * via T007C_FIXTURE_IDENTITIES (exact digests and non-secret identities only —
 * live handles/secrets are never frozen or serialized).
 *
 * MANIFEST (frozen fixture identities):
 *   MANIFEST_ID=T007C_WORKFLOW_AUTHORITY_RECOVERY_V1
 *   MANIFEST_VERSION=1
 *   DEFINITION_FIXTURE=t007c.workflow.authority.v1
 *   FAULT_MATRIX=F0;F1;F2;F3;F4;F5;F6;F7;F8;F9
 *   REQUIRED_FAULT_CASES=stale-assembly-compiled-artifact;crash-before-effect;crash-after-possible-effect-before-outcome-persistence;replay-from-durable-state;duplicate-command-effect-idempotency;wrong-authority-class
 *   MICROKERNEL_SOURCE_DIFF=0 (tests only; NO packages/domain-harness/src/**
 *   semantic changes; NO dist semantic changes)
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ComponentEnvelope } from '../../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../../src/contracts/definition-graph.js';
import type { Sha256Port } from '../../../src/contracts/identity.js';
import { resolveCurrentCapabilityProvider } from '../../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
} from '../../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../../src/contracts/invocation-request.js';
import {
  WorkflowBridgeError,
  compileWorkflowComponent,
  runCompiledWorkflow,
  type CompiledWorkflowArtifact,
  type WorkflowBridgeEvent,
} from '../../../src/adapters/workflow-runtime-bridge.js';
import {
  WORKFLOW_KIND_REF,
  WorkflowKindAdapterError,
  createWorkflowKindImplementation,
} from '../../../src/adapters/workflow-kind.js';
import {
  invokeEffectfulTool,
  EffectfulInvocationError,
  type EffectfulToolDispatchPort,
  type EffectfulToolDispatchQuery,
  type InvokeEffectfulToolInput,
} from '../../../src/contracts/effectful-invocation.js';
import type { DomainWorkflowDefinition } from '../../../src/workflow/index.js';
import type { DecisionResolverSource, ResolvedDecision } from '../../../src/decision-resolver/index.js';
import type { JsonValue } from '../../../src/contracts/json.js';
import type { WorkflowAddress } from '../../../src/v2/contracts/workflow.js';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionBindingError,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../../src/admission/effect-journal.js';
import { deriveDurableControlTurnId } from '../../../src/admission/admission.js';
import {
  CentralAdmissionError,
  type AdmissionDurableEffectJournal,
  type AdmissionEffectJournalRecord,
  type CentralAdmissionPorts,
  type CentralAdmissionRequest,
} from '../../../src/admission/contracts.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const MANIFEST = {
  MANIFEST_ID: 'T007C_WORKFLOW_AUTHORITY_RECOVERY_V1',
  MANIFEST_VERSION: 1,
  DEFINITION_FIXTURE: 't007c.workflow.authority.v1',
} as const;

const NEUTRAL_KIND = { kindId: 'test.semantic.neutral', version: '1.0.0' } as const;
const TOOL_KIND = { kindId: 'test.t007c-kind', version: '1.0.0' } as const;
const WORKFLOW_ENGINE_DIGEST_V1 = 'sha256:workflow-engine-t007c-v1';
const WORKFLOW_ENGINE_DIGEST_V2 = 'sha256:workflow-engine-t007c-v2';

const WORKFLOW_TARGET = 'orders.charge';
const WORKFLOW_INSTANCE_ID = 'orders.charge:instance:9';
const OCCURRENCE_TARGET: WorkflowAddress = { workflowId: 'orders.charge', instanceKey: 'instance:9' };
const NOW = '2026-10-06T12:00:00.000Z';
const EFFECT_TYPE = 'effect:charge';
const INPUT = { amount: 42 };
const TRIGGER_EVENT = 'QUOTE_DECIDED';

// ---------------------------------------------------------------------------
// Definition fixture: one neutral semantic Component, one admitted v0.7
// Workflow Semantic Component (T007A exact Kind), one consumer and one
// effectful Tool Component (T003C target of the T004C route).
// ---------------------------------------------------------------------------

function neutralComponent(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'component.neutral',
    kind: { ...NEUTRAL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'neutral test Kind' },
  };
}

function workflowComponent(
  transitions: readonly { transitionId: string; from: string; to: string; event?: string }[] = [
    { transitionId: 't-charge', from: 'review', to: 'charged', event: TRIGGER_EVENT },
  ],
  extraStates: readonly string[] = [],
): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'component.workflow',
    kind: { kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_REF.version },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      initial: 'review',
      states: [{ stateId: 'review' }, { stateId: 'charged' }, ...extraStates.map((stateId) => ({ stateId }))],
      transitions: transitions.map((transition) => ({ ...transition })),
    },
  };
}

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.a',
    kind: { ...TOOL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(effect: 'idempotent' | 'non-idempotent'): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.alpha',
    kind: { ...TOOL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.charge', inputSchema: { type: 'object' }, outputSchema: {}, effect },
      ],
      providesCapabilities: [{ capabilityId: 'cap.charge', version: '1.0.0' }],
    },
  };
}

function graph(effect: 'idempotent' | 'non-idempotent' = 'non-idempotent'): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.t007c',
    components: [neutralComponent(), workflowComponent(), consumer(), toolComponent(effect)],
    relations: [],
  };
}

function neutralKindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { ...NEUTRAL_KIND },
      implementation: {
        implementationId: 'impl.test.semantic.neutral',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:neutral-v1',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

function toolKindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { ...TOOL_KIND },
      implementation: {
        implementationId: 'impl.t007c-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl-t007c',
      },
    },
    understoodSemanticContracts: [],
    understoodCapabilities: [],
    validateComponent: () => {},
  };
}

function workflowKindBinding(engineDigest: string): KindImplementationBindingInput {
  // The T007A factory: replacing the engine is a new exact implementation
  // identity minted through this same descriptor seam.
  return createWorkflowKindImplementation({
    implementation: {
      implementationId: 'impl.workflow.engine',
      implementationVersion: '1.0.0',
      implementationDigest: engineDigest,
    },
  });
}

function toolCandidate(digestSuffix: string): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId: 'impl.charge.alpha',
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:impl.charge.alpha-${digestSuffix}`,
    },
    supportedOperations: ['op.charge'],
    handle: { kind: 'runtime-handle', id: `handle.charge#${digestSuffix}` },
  };
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(): InvocationCallerContext {
  return { callerId: 'caller.session-1', callerKind: 'workflow' };
}

// ---------------------------------------------------------------------------
// Governance / durable-occurrence hosts (same composite posture as the T004C
// recovery evidence): in-memory store + package-CDI authority + baselines.
// ---------------------------------------------------------------------------

class MemoryExactPackageCdiAuthority implements ExactPackageCdiAuthority {
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

class MemoryDurableExecutionStore implements DurableExecutionStore {
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

/** Journal wrapper whose beginEffect fails (crash-before-effect checkpoint). */
class FailingBeginJournal implements AdmissionDurableEffectJournal {
  constructor(private readonly inner: VolatileAdmissionEffectJournal) {}

  async getEffect(effectId: string): Promise<AdmissionEffectJournalRecord | null> {
    return this.inner.getEffect(effectId);
  }

  async beginEffect(
    _record: AdmissionEffectJournalRecord,
  ): Promise<{
    readonly disposition: 'created' | 'existing';
    readonly record: AdmissionEffectJournalRecord;
  }> {
    throw new Error('journal unavailable before any effect could begin (crash injection)');
  }

  async completeEffect(
    effectId: string,
    outcome:
      | { readonly status: 'completed'; readonly output: JsonValue; readonly completedAt: string }
      | { readonly status: 'failed'; readonly error: JsonValue; readonly completedAt: string },
  ): Promise<AdmissionEffectJournalRecord> {
    return this.inner.completeEffect(effectId, outcome);
  }

  snapshotRecords(): readonly AdmissionEffectJournalRecord[] {
    return this.inner.getRecords();
  }
}

/** Journal wrapper whose completeEffect fails (crash-after-effect checkpoint). */
class FailingCompleteJournal implements AdmissionDurableEffectJournal {
  completeCalls = 0;
  constructor(private readonly inner: VolatileAdmissionEffectJournal) {}

  async getEffect(effectId: string): Promise<AdmissionEffectJournalRecord | null> {
    return this.inner.getEffect(effectId);
  }

  async beginEffect(record: AdmissionEffectJournalRecord) {
    return this.inner.beginEffect(record);
  }

  async completeEffect(
    _effectId: string,
    _outcome:
      | { readonly status: 'completed'; readonly output: JsonValue; readonly completedAt: string }
      | { readonly status: 'failed'; readonly error: JsonValue; readonly completedAt: string },
  ): Promise<AdmissionEffectJournalRecord> {
    this.completeCalls += 1;
    throw new Error('journal unavailable after possible effect (crash injection)');
  }

  snapshotRecords(): readonly AdmissionEffectJournalRecord[] {
    return this.inner.getRecords();
  }
}

async function governanceBody() {
  return createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version: 'B1',
      semantics: { hardInvariants: [], operatorAuthority: 'B1' },
    },
    realSha256,
  );
}

// ---------------------------------------------------------------------------
// The composed world: Definition graph -> sealed Assembly (T002B + T007A) ->
// T003C Tool binding -> final successor Assembly -> activation pin (T002C/D).
// ---------------------------------------------------------------------------

interface WorldOptions {
  effect?: 'idempotent' | 'non-idempotent';
  workflowEngineDigest?: string;
  toolDigestSuffix?: string;
  authorityClass?: 'PRODUCTION' | 'SIMULATION';
  skipActivation?: boolean;
}

interface World {
  g: DefinitionGraphEnvelope;
  workflow: ComponentEnvelope;
  baseAssembly: SealedRuntimeAssembly;
  finalAssembly: SealedRuntimeAssembly;
  binding: SealedToolImplementationBinding;
  admitted: AdmittedToolInvocationRequest;
  baselines: MemoryGovernanceBaselineStore;
  activator: AssemblyExecutionActivator;
  pin: GovernanceExecutionPin | undefined;
  coordinator: GovernanceExecutionCoordinator;
  journal: VolatileAdmissionEffectJournal;
  admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  definitionGraphDigest: string;
}

async function buildWorld(options: WorldOptions = {}): Promise<World> {
  const effect = options.effect ?? 'non-idempotent';
  const engineDigest = options.workflowEngineDigest ?? WORKFLOW_ENGINE_DIGEST_V1;
  const toolDigestSuffix = options.toolDigestSuffix ?? 'v1';
  const authorityClass = options.authorityClass ?? 'PRODUCTION';

  const g = graph(effect);
  const workflow = g.components.find((component) => component.componentId === 'component.workflow')!;
  const baseAssembly = await sealRuntimeAssembly(
    {
      definitionGraph: g,
      kindImplementations: [
        neutralKindBinding(),
        toolKindBinding(),
        workflowKindBinding(engineDigest),
      ],
    },
    realSha256,
  );
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { capabilityId: 'cap.charge', version: '1.0.0' },
    'consumer.a',
    digest,
    realSha256,
  );
  const binding = await bindToolImplementation({
    assembly: baseAssembly,
    selection: JSON.parse(JSON.stringify(selection)),
    currentDefinitionGraph: g,
    implementations: [toolCandidate(toolDigestSuffix)],
    sha256: realSha256,
  });
  const finalAssembly = binding.successorAssembly;
  const exposure = await admitToolExposure(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.charge',
      caller: caller(),
      assembly: finalAssembly,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.alpha',
      operationId: 'op.charge',
      input: INPUT,
      caller: caller(),
      definitionGraphDigest: finalAssembly.record.definitionGraphDigest,
      assemblyDigest: finalAssembly.assemblyDigest,
      exposure,
    },
    { assembly: finalAssembly, currentDefinitionGraph: g },
    realSha256,
  );

  const b1 = await governanceBody();
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(b1);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, realSha256);
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);
  const journal = new VolatileAdmissionEffectJournal();
  const admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'> = {
    governance: coordinator,
    baselines,
    effectJournal: journal,
  };

  let pin: GovernanceExecutionPin | undefined;
  if (!options.skipActivation) {
    pin = await activator.activate({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      binding: {
        domainId: 'orders',
        packageId: 'pkg-orders-1',
        domainIntelligenceContentDigest: 'cdi-orders-1',
        governanceBaseline: b1.identity,
      },
      assembly: finalAssembly,
      authorityClass,
      currentDefinitionGraph: g,
    });
  }

  return {
    g,
    workflow,
    baseAssembly,
    finalAssembly,
    binding,
    admitted,
    baselines,
    activator,
    pin,
    coordinator,
    journal,
    admissionPorts,
    definitionGraphDigest: digest,
  };
}

function admissionDefinition(): DomainWorkflowDefinition {
  return {
    workflowKey: 'component.workflow',
    initialState: 'review',
    initialContext: {},
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 't-charge',
            trigger: { kind: 'event', eventType: TRIGGER_EVENT },
            targetState: 'charged',
            effectIntents: [{ effectType: EFFECT_TYPE, input: INPUT, idempotencyKey: 'charge:1' }],
          },
        ],
      },
      { stateKey: 'charged', kind: 'final' },
    ],
  };
}

function resolvedDecision(): ResolvedDecision<JsonValue> {
  const source: DecisionResolverSource = 'harness-machine';
  return {
    source,
    structuredDecision: {
      decision: { outcome: 'charge', data: { amount: 42 } },
      event: { type: TRIGGER_EVENT, payload: { amount: 42 } },
    },
    provenance: {},
    freshModelCallCount: 1,
    llmAvoided: false,
    cacheDisposition: { read: 'disabled' },
    telemetry: [],
  };
}

const decisionSchema = {
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

function admissionRequest(
  turn: CentralAdmissionRequest['turn'] = { kind: 'message', sourceMessageId: 'msg:1' },
): CentralAdmissionRequest {
  return {
    target: OCCURRENCE_TARGET,
    turn,
    trigger: { kind: 'event', eventType: TRIGGER_EVENT },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition: admissionDefinition(),
    currentStateKey: 'review',
    context: {},
    event: { type: TRIGGER_EVENT, payload: { amount: 42 } },
    resolved: resolvedDecision(),
    decisionSchema,
    now: NOW,
  };
}

function recordingDispatch(calls: EffectfulToolDispatchQuery[]): EffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return { charged: true };
    },
  };
}

function invocationInput(
  world: World,
  overrides: Partial<InvokeEffectfulToolInput> = {},
): InvokeEffectfulToolInput {
  return {
    request: world.admitted,
    binding: world.binding,
    currentDefinitionGraph: world.g,
    activator: world.activator,
    admissionRequest: admissionRequest(),
    admissionPorts: world.admissionPorts,
    effectType: EFFECT_TYPE,
    dispatch: recordingDispatch([]),
    sha256: realSha256,
    ...overrides,
  } as InvokeEffectfulToolInput;
}

async function compileWorkflow(world: World): Promise<CompiledWorkflowArtifact> {
  return compileWorkflowComponent({
    component: world.workflow,
    sealedAssembly: world.finalAssembly,
    currentDefinitionGraph: world.g,
    sha256: realSha256,
  });
}

function runWorkflow(
  world: World,
  artifact: CompiledWorkflowArtifact,
  events: readonly WorkflowBridgeEvent[],
) {
  return runCompiledWorkflow({
    artifact,
    component: world.workflow,
    sealedAssembly: world.finalAssembly,
    currentDefinitionGraph: world.g,
    sha256: realSha256,
    events,
  });
}

function expectAdmissionError(promise: Promise<unknown>, code: string): Promise<CentralAdmissionError> {
  return promise.then(
    () => {
      throw new Error(`expected CentralAdmissionError(${code}), but invocation resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof CentralAdmissionError,
        `expected CentralAdmissionError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

// ---------------------------------------------------------------------------
// Pre-evidence identity capture (recorded ONCE; every matrix cell runs
// against the same immutable identity block).
// ---------------------------------------------------------------------------

test('T007C fixture identities: the frozen world pins one exact Definition graph, one final Assembly, one Workflow KindImplementation and one governance occurrence lineage', async () => {
  const world = await buildWorld();
  const artifact = await compileWorkflow(world);
  assert.ok(world.pin, 'sanity: the PRODUCTION occurrence pin exists');

  console.log(
    'T007C_FIXTURE_IDENTITIES ' +
      JSON.stringify({
        manifestId: MANIFEST.MANIFEST_ID,
        manifestVersion: MANIFEST.MANIFEST_VERSION,
        definitionFixture: MANIFEST.DEFINITION_FIXTURE,
        definitionGraphDigest: world.definitionGraphDigest,
        baseAssemblyDigest: world.baseAssembly.assemblyDigest,
        finalAssemblyDigest: world.finalAssembly.assemblyDigest,
        workflowKindImplementationPin: artifact.identity.kindImplementation,
        toolBindingDigest: world.binding.evidence.bindingDigest,
        workflowComponentSemanticDigest: artifact.identity.componentSemanticDigest,
        artifactDefinitionGraphDigest: artifact.identity.definitionGraphDigest,
        artifactAssemblyDigest: artifact.identity.assemblyDigest,
        governancePinBindingDigest: world.pin.bindingDigest,
        governancePinAuthorityClass: world.pin.authorityClass,
        durableTurnId: deriveDurableControlTurnId(OCCURRENCE_TARGET, {
          kind: 'message',
          sourceMessageId: 'msg:1',
        }),
      }),
  );

  // The compiled artifact binds exactly the admission evidence of the SAME
  // world: exact Definition graph digest, exact final Assembly digest, exact
  // Workflow KindImplementation pin.
  assert.equal(artifact.identity.definitionGraphDigest, world.definitionGraphDigest);
  assert.equal(artifact.identity.assemblyDigest, world.finalAssembly.assemblyDigest);
  assert.equal(
    artifact.identity.kindImplementation.implementation.implementationDigest,
    WORKFLOW_ENGINE_DIGEST_V1,
  );
  assert.equal(world.pin.assemblyDigest, world.finalAssembly.assemblyDigest);
  assert.equal(world.pin.authorityClass, 'PRODUCTION');
});

// ---------------------------------------------------------------------------
// F0 — valid authoritative Workflow transition/effect baseline.
// ---------------------------------------------------------------------------

test('T007C F0: the admitted Workflow Component compiles and runs on the ONE runtime, and its effectful Tool executes through Central Admission on the pinned occurrence (one effect, one completed journal record)', async () => {
  const world = await buildWorld();
  const artifact = await compileWorkflow(world);

  // The transition executes on the one shipped runtime through the private
  // bridge: no journal, no occurrence material is reachable here.
  const run = await runWorkflow(world, artifact, [{ type: TRIGGER_EVENT }]);
  assert.equal(run.stateId, 'charged');
  assert.equal(world.journal.getRecords().length, 0, 'bridge execution never touches the journal');

  // The authoritative effect route: the SAME occurrence pinned at activation,
  // the SAME final Assembly, the exact admitted Tool invocation.
  const calls: EffectfulToolDispatchQuery[] = [];
  const result = await invokeEffectfulTool(invocationInput(world, { dispatch: recordingDispatch(calls) }));

  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.transitionKey, 't-charge');
  assert.equal(result.outcome.admitted.targetState, 'charged');
  assert.equal(result.outcome.admitted.effects.length, 1);
  assert.equal(result.outcome.admitted.effects[0]!.disposition, 'executed');
  assert.equal(calls.length, 1);

  // Exact identity composition: occurrence pin, exact pins in evidence.
  assert.equal(result.occurrence.workflowInstanceId, WORKFLOW_INSTANCE_ID);
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.equal(result.occurrence.assemblyDigest, world.finalAssembly.assemblyDigest);
  assert.equal(result.occurrence.pinBindingDigest, world.pin!.bindingDigest);
  assert.equal(result.invocation.definitionGraphDigest, world.definitionGraphDigest);

  const records = world.journal.getRecords();
  assert.equal(records.length, 1, 'exactly one durable journal record for the one effect');
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectId, result.outcome.admitted.effects[0]!.effectId);
  assert.equal(records[0]!.effectSemantics, 'non-idempotent', 'the classification derives from the exact current graph');
});

// ---------------------------------------------------------------------------
// Authority invariants at the composition level.
// ---------------------------------------------------------------------------

test('T007C invariant: exactly one authoritative Runtime — the transition-execution plane has no admission/journal authority import', () => {
  const bridgePath = fileURLToPath(
    new URL('../../../src/adapters/workflow-runtime-bridge.ts', import.meta.url),
  );
  const source = readFileSync(bridgePath, 'utf8');
  const imported = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);

  // The bridge reaches only the generic contract family, the existing internal
  // engine-neutral boundary, the T007A Kind adapter and the one shipped engine.
  const allowedImports = [
    '../contracts/component.js',
    '../contracts/component-digest.js',
    '../contracts/definition-graph.js',
    '../contracts/identity.js',
    '../contracts/json.js',
    '../contracts/record-safety.js',
    '../contracts/runtime-assembly.js',
    '../workflow/contract.js',
    '../workflow/internal/xstate-adapter.js',
    './workflow-kind.js',
    'xstate',
  ];
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the Workflow runtime bridge: ${specifier}`,
    );
  }

  // No authority plane is reachable from transition execution: the bridge can
  // never mint an occurrence, an admission, a journal record or an effect.
  for (const forbidden of ['../admission/', '../governance/', '../harness/', '../compiler/']) {
    assert.ok(!source.includes(`'${forbidden}`), `bridge must not import ${forbidden}`);
  }

  // One state-machine dependency for the whole package — no parallel runtime.
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
  ) as { dependencies: Record<string, string> };
  const engineDeps = Object.keys(packageJson.dependencies).filter((name) =>
    /state|engine|machine/i.test(name),
  );
  assert.deepEqual(engineDeps, ['xstate']);
});

test('T007C invariant: Workflow transition admission remains Central Admission / occurrence anchored — no durable governance pin, no admitted effect', async () => {
  // An unbound occurrence store: Central Admission cannot admit anything
  // without the durable pin of the SAME workflow instance — there is no
  // alternate admission entry point for Workflow transitions.
  const world = await buildWorld({ skipActivation: true });
  const calls: EffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeEffectfulTool(invocationInput(world, { dispatch: recordingDispatch(calls) })),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceExecutionBindingError, `got ${String(error)}`);
      assert.equal(error.code, 'GOVERNANCE_EXECUTION_PIN_MISSING');
      return true;
    },
  );
  assert.equal(calls.length, 0, 'no Tool dispatch may happen without the pinned occurrence');
  assert.equal(world.journal.getRecords().length, 0, 'no journal record may exist without admission');

  // Binding the exact pin through the accepted activation path makes the SAME
  // invocation admissible — authority comes from the pinned occurrence only.
  const b1 = await governanceBody();
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-1',
    domainIntelligenceContentDigest: 'cdi-orders-1',
  });
  await world.activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-1',
      domainIntelligenceContentDigest: 'cdi-orders-1',
      governanceBaseline: b1.identity,
    },
    assembly: world.finalAssembly,
    authorityClass: 'PRODUCTION',
    currentDefinitionGraph: world.g,
  });
  const result = await invokeEffectfulTool(invocationInput(world, { dispatch: recordingDispatch(calls) }));
  assert.equal(result.outcome.status, 'admitted');
  assert.equal(calls.length, 1);
  assert.equal(world.journal.getRecords().length, 1);
});

// ---------------------------------------------------------------------------
// F1 — stale Assembly rejects before transition/effect.
// ---------------------------------------------------------------------------

test('T007C F1: a replaced Tool implementation (new sealed Assembly) rejects the stale compiled artifact AND refuses the stale-bound effectful invocation before any side effect', async () => {
  const worldV1 = await buildWorld({ toolDigestSuffix: 'v1' });
  const artifactV1 = await compileWorkflow(worldV1);

  // The world moves on: the Tool implementation is replaced (a new exact
  // implementation pin -> a new sealed Assembly identity).
  const worldV2 = await buildWorld({ toolDigestSuffix: 'v2' });
  assert.notEqual(worldV2.finalAssembly.assemblyDigest, worldV1.finalAssembly.assemblyDigest);
  assert.equal(worldV2.definitionGraphDigest, worldV1.definitionGraphDigest);

  // (a) The v1 compiled artifact is stale against the v2 Assembly — rejected
  //     BEFORE any transition executes, even though the machine would run.
  await assert.rejects(
    runCompiledWorkflow({
      artifact: artifactV1,
      component: worldV2.workflow,
      sealedAssembly: worldV2.finalAssembly,
      currentDefinitionGraph: worldV2.g,
      sha256: realSha256,
      events: [{ type: TRIGGER_EVENT }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'STALE_COMPILED_WORKFLOW_ARTIFACT');
      assert.equal(error.failureClass, 'STALE');
      return true;
    },
  );

  // (b) The effectful invocation still bound to the v1 Assembly can never ride
  //     the occurrence pinned under v2: the v2 occurrence pin and the v1
  //     dispatch anchor disagree, so the invocation fails closed at the
  //     occurrence/Assembly match before any dispatch and before any journal
  //     record.
  const calls: EffectfulToolDispatchQuery[] = [];
  await assert.rejects(
    invokeEffectfulTool(
      invocationInput(worldV2, {
        dispatch: recordingDispatch(calls),
        request: worldV1.admitted,
        binding: worldV1.binding,
        currentDefinitionGraph: worldV1.g,
      }),
    ),
    (error: unknown) => {
      assert.ok(error instanceof EffectfulInvocationError, `got ${String(error)}`);
      assert.equal(error.code, 'OCCURRENCE_ASSEMBLY_MISMATCH');
      return true;
    },
  );
  assert.equal(calls.length, 0, 'a stale Assembly never reaches the Tool dispatch');
  assert.equal(worldV2.journal.getRecords().length, 0, 'a stale Assembly never appends the journal');

  // The v2 world is intact: compile + run + effect under the exact current pins.
  const artifactV2 = await compileWorkflow(worldV2);
  assert.equal((await runWorkflow(worldV2, artifactV2, [{ type: TRIGGER_EVENT }])).stateId, 'charged');
  const result = await invokeEffectfulTool(invocationInput(worldV2, { dispatch: recordingDispatch(calls) }));
  assert.equal(result.outcome.status, 'admitted');
  assert.equal(calls.length, 1);
  assert.equal(worldV2.journal.getRecords().length, 1);
});

// ---------------------------------------------------------------------------
// F2 — stale/forged compiled artifact or wrong Workflow KindImplementation pin.
// ---------------------------------------------------------------------------

test('T007C F2: a caller-minted compiled-artifact look-alike is UNTRUSTED before execution, and an artifact bound to the wrong Workflow KindImplementation pin is STALE', async () => {
  const worldV1 = await buildWorld({ workflowEngineDigest: WORKFLOW_ENGINE_DIGEST_V1 });
  const artifactV1 = await compileWorkflow(worldV1);

  // (a) Forgery: a caller-constructed object carrying the COPIED public
  //     identity of the genuine artifact is not a compile-time mint — the
  //     module-private mint registry decides, so nothing executes.
  const forgedLookAlike = {
    identity: artifactV1.identity,
    routes: artifactV1.routes,
  } as unknown as CompiledWorkflowArtifact;
  await assert.rejects(
    runWorkflow(worldV1, forgedLookAlike, [{ type: TRIGGER_EVENT }]),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'UNTRUSTED_COMPILED_WORKFLOW_ARTIFACT');
      assert.equal(error.failureClass, 'TRUST');
      return true;
    },
  );
  assert.equal(worldV1.journal.getRecords().length, 0);

  // (b) Wrong Workflow KindImplementation pin: the world is re-sealed over a
  //     replacement engine implementation (same Definition graph, new exact
  //     pin); the v1 artifact fails STALE against the new Assembly.
  const worldV2 = await buildWorld({ workflowEngineDigest: WORKFLOW_ENGINE_DIGEST_V2 });
  await assert.rejects(
    runCompiledWorkflow({
      artifact: artifactV1,
      component: worldV2.workflow,
      sealedAssembly: worldV2.finalAssembly,
      currentDefinitionGraph: worldV2.g,
      sha256: realSha256,
      events: [{ type: TRIGGER_EVENT }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'STALE_COMPILED_WORKFLOW_ARTIFACT');
      return true;
    },
  );

  // (c) Sanity: the genuine artifact still runs against its own exact world.
  assert.equal((await runWorkflow(worldV1, artifactV1, [{ type: TRIGGER_EVENT }])).stateId, 'charged');
});

// ---------------------------------------------------------------------------
// F3 — crash before effect: no effect committed; clean retry executes once.
// ---------------------------------------------------------------------------

test('T007C F3: a crash before the effect leaves zero dispatch and zero durable record; the retried turn then executes exactly once', async () => {
  const world = await buildWorld();
  const crashJournal = new FailingBeginJournal(world.journal);
  const calls: EffectfulToolDispatchQuery[] = [];

  // Crash injection at the durable begin checkpoint: the process dies before
  // the effect could begin — the Tool is never dispatched and no journal
  // record exists to recover from.
  await expectAdmissionError(
    invokeEffectfulTool(
      invocationInput(world, {
        dispatch: recordingDispatch(calls),
        admissionPorts: {
          governance: world.admissionPorts.governance,
          baselines: world.admissionPorts.baselines,
          effectJournal: crashJournal,
        },
      }),
    ),
    'ADMISSION_EFFECT_JOURNAL_CONFLICT',
  );
  assert.equal(calls.length, 0, 'the effect never ran');
  assert.equal(world.journal.getRecords().length, 0, 'no durable record exists after a crash before the effect');

  // Recovery of the SAME turn on the SAME occurrence: executes exactly once —
  // the begin checkpoint is idempotent against an empty journal and no
  // phantom state from the crashed attempt leaks into the retry.
  const retryCalls: EffectfulToolDispatchQuery[] = [];
  const result = await invokeEffectfulTool(invocationInput(world, { dispatch: recordingDispatch(retryCalls) }));
  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.effects[0]!.disposition, 'executed');
  assert.equal(retryCalls.length, 1);
  assert.equal(world.journal.getRecords().length, 1);
  assert.equal(world.journal.getRecords()[0]!.status, 'completed');
});

// ---------------------------------------------------------------------------
// F4 — crash after possible effect, before outcome persistence: fail-safe,
// never a duplicate effect.
// ---------------------------------------------------------------------------

test('T007C F4: a crash after the effect may have occurred preserves the outcome-unknown posture; the retry fails ambiguous and never re-executes', async () => {
  const world = await buildWorld();
  const crashJournal = new FailingCompleteJournal(world.journal);
  const calls: EffectfulToolDispatchQuery[] = [];

  // The Tool dispatch ran exactly once, but the outcome could not be
  // persisted: the existing owner posture surfaces the ambiguity.
  await expectAdmissionError(
    invokeEffectfulTool(
      invocationInput(world, {
        dispatch: recordingDispatch(calls),
        admissionPorts: {
          governance: world.admissionPorts.governance,
          baselines: world.admissionPorts.baselines,
          effectJournal: crashJournal,
        },
      }),
    ),
    'ADMISSION_EFFECT_JOURNAL_CONFLICT',
  );
  assert.equal(calls.length, 1, 'the effect itself ran exactly once in the crashed attempt');
  assert.equal(crashJournal.snapshotRecords().length, 1);
  assert.equal(crashJournal.snapshotRecords()[0]!.status, 'started', 'the durable record stays outcome-unknown');

  // A retry of the SAME turn resolves the SAME durable 'started' record and
  // fails closed ambiguous — uncertainty is never converted into an automatic
  // re-execution of a possibly-completed non-idempotent effect.
  const retryCalls: EffectfulToolDispatchQuery[] = [];
  await expectAdmissionError(
    invokeEffectfulTool(invocationInput(world, { dispatch: recordingDispatch(retryCalls) })),
    'ADMISSION_EFFECT_AMBIGUOUS',
  );
  assert.equal(retryCalls.length, 0);
  const records = world.journal.getRecords();
  assert.equal(records.length, 1, 'no second record, no second effect — the SAME lineage is preserved');
  assert.equal(records[0]!.status, 'started');
});

// ---------------------------------------------------------------------------
// F5 — durable replay resolves exact Definition + final Assembly + Workflow
// KindImplementation pins on the SAME occurrence/journal lineage.
// ---------------------------------------------------------------------------

test('T007C F5: replay from durable state re-proves the exact pinned Assembly/authority class and reuses the SAME effect identity without re-dispatch', async () => {
  const recoveryTurn: CentralAdmissionRequest['turn'] = {
    kind: 'recovery',
    durableRecoveryActionId: 'rec:1',
    resumeOrdinal: 1,
  };
  const world = await buildWorld();
  const artifact = await compileWorkflow(world);
  const turnId = deriveDurableControlTurnId(OCCURRENCE_TARGET, recoveryTurn);

  const calls: EffectfulToolDispatchQuery[] = [];
  const first = await invokeEffectfulTool(
    invocationInput(world, {
      dispatch: recordingDispatch(calls),
      admissionRequest: admissionRequest(recoveryTurn),
    }),
  );
  assert.equal(first.outcome.status, 'admitted');
  if (first.outcome.status !== 'admitted') return;
  assert.equal(first.outcome.admitted.effects[0]!.disposition, 'executed');
  assert.equal(first.outcome.admitted.effects[0]!.effectId, `${turnId}/effect/1`);

  // Durable replay: the SAME occurrence resolves the SAME exact Assembly
  // identity and the SAME pinned PRODUCTION class; the compiled artifact pins
  // are exactly what the recovery re-proves.
  const recovered = await world.activator.recover({
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    expectedAssembly: world.finalAssembly,
    expectedAuthorityClass: 'PRODUCTION',
  });
  assert.equal(recovered.assemblyDigest, world.finalAssembly.assemblyDigest);
  assert.equal(recovered.assemblyDigest, artifact.identity.assemblyDigest);
  assert.equal(recovered.pin.bindingDigest, world.pin!.bindingDigest);
  assert.equal(recovered.pin.authorityClass, 'PRODUCTION');

  // Re-driving the SAME recovery turn (process-restart posture) resolves the
  // SAME effect identity on the SAME journal lineage — replayed, no dispatch.
  const replay = await invokeEffectfulTool(
    invocationInput(world, {
      dispatch: recordingDispatch(calls),
      admissionRequest: admissionRequest(recoveryTurn),
    }),
  );
  assert.equal(replay.outcome.status, 'admitted');
  if (replay.outcome.status !== 'admitted') return;
  assert.equal(replay.outcome.admitted.effects[0]!.disposition, 'replayed');
  assert.equal(replay.outcome.admitted.effects[0]!.effectId, `${turnId}/effect/1`);
  assert.equal(calls.length, 1);
  assert.equal(world.journal.getRecords().length, 1, 'no fresh effect namespace is minted to escape outcome-unknown');

  // Cross-class / cross-Assembly replay substitution fails closed: an
  // occurrence with no durable pin cannot be replayed at all, and a replaced
  // Assembly is never an acceptable replay target for the pinned occurrence.
  const unbound = await buildWorld({ skipActivation: true, toolDigestSuffix: 'v2' });
  await assert.rejects(
    unbound.activator.recover({
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      expectedAssembly: unbound.finalAssembly,
    }),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceExecutionBindingError, `got ${String(error)}`);
      assert.equal(error.code, 'GOVERNANCE_EXECUTION_PIN_MISSING');
      return true;
    },
  );
  await assert.rejects(
    world.activator.recover({
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      expectedAssembly: unbound.finalAssembly,
    }),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceExecutionBindingError, `got ${String(error)}`);
      assert.equal(error.code, 'ASSEMBLY_REPLAY_MISMATCH');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// F6 — duplicate command/effect idempotency at the durable authority boundary.
// ---------------------------------------------------------------------------

test('T007C F6: re-driving the SAME durable turn replays the completed effect identity through the journal — one dispatch, one record', async () => {
  const world = await buildWorld();
  const calls: EffectfulToolDispatchQuery[] = [];
  const dispatch = recordingDispatch(calls);

  const first = await invokeEffectfulTool(invocationInput(world, { dispatch }));
  assert.equal(first.outcome.status, 'admitted');
  if (first.outcome.status !== 'admitted') return;
  const firstEffect = first.outcome.admitted.effects[0]!;
  assert.equal(firstEffect.disposition, 'executed');
  assert.equal(calls.length, 1);

  // Duplicate command (message redelivery / caller retry of the SAME turn):
  // the durable journal boundary — not a local helper — resolves the SAME
  // effect identity and replays the recorded outcome.
  const second = await invokeEffectfulTool(invocationInput(world, { dispatch }));
  assert.equal(second.outcome.status, 'admitted');
  if (second.outcome.status !== 'admitted') return;
  const secondEffect = second.outcome.admitted.effects[0]!;
  assert.equal(secondEffect.disposition, 'replayed');
  assert.equal(secondEffect.effectId, firstEffect.effectId);
  assert.deepEqual(secondEffect.output, { charged: true });
  assert.equal(calls.length, 1, 'a completed effect is never re-executed');

  const records = world.journal.getRecords();
  assert.equal(records.length, 1, 'duplicate prevention holds at the durable authority boundary');
  assert.equal(records[0]!.status, 'completed');
  assert.equal(records[0]!.effectId, firstEffect.effectId);
});

// ---------------------------------------------------------------------------
// F7 — wrong authority class: SIMULATION can never mint production effects.
// ---------------------------------------------------------------------------

test('T007C F7: a SIMULATION-class occurrence fails AUTHORITY_CLASS_MISMATCH before any side effect, and no caller material can upgrade it', async () => {
  const world = await buildWorld({ authorityClass: 'SIMULATION' });
  assert.equal(world.pin!.authorityClass, 'SIMULATION');
  const calls: EffectfulToolDispatchQuery[] = [];

  await assert.rejects(
    invokeEffectfulTool(invocationInput(world, { dispatch: recordingDispatch(calls) })),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceExecutionBindingError, `got ${String(error)}`);
      assert.equal(error.code, 'AUTHORITY_CLASS_MISMATCH');
      return true;
    },
  );
  assert.equal(calls.length, 0, 'no Tool dispatch may happen under a SIMULATION pin');
  assert.equal(world.journal.getRecords().length, 0, 'no journal record may exist under a SIMULATION pin');

  // The exact pinned class is woven into the durable pin digest: replaying the
  // SIMULATION occurrence with a PRODUCTION expectation fails closed.
  await assert.rejects(
    world.activator.recover({
      workflowInstanceId: WORKFLOW_INSTANCE_ID,
      expectedAssembly: world.finalAssembly,
      expectedAuthorityClass: 'PRODUCTION',
    }),
    (error: unknown) => {
      assert.ok(error instanceof GovernanceExecutionBindingError, `got ${String(error)}`);
      assert.equal(error.code, 'AUTHORITY_CLASS_MISMATCH');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// F8 — engine/adapter replacement: Assembly concern only, zero Microkernel
// edits, Definition identity untouched, stale currentness fails before run.
// ---------------------------------------------------------------------------

test('T007C F8: replacing the Workflow engine invalidates the stale artifact before execution while Definition identity and Microkernel source remain unchanged', async () => {
  const worldV1 = await buildWorld({ workflowEngineDigest: WORKFLOW_ENGINE_DIGEST_V1 });
  const artifactV1 = await compileWorkflow(worldV1);

  // Replacement engine implementation: a new exact pin minted through the
  // SAME T007A factory and consumed by the SAME generic sealed-Assembly seam.
  const worldV2 = await buildWorld({ workflowEngineDigest: WORKFLOW_ENGINE_DIGEST_V2 });
  const artifactV2 = await compileWorkflow(worldV2);

  // Definition identity is stable across the replacement; Assembly identity
  // and the bound pin move.
  assert.equal(worldV2.definitionGraphDigest, worldV1.definitionGraphDigest);
  assert.notEqual(worldV2.finalAssembly.assemblyDigest, worldV1.finalAssembly.assemblyDigest);
  assert.notEqual(artifactV2.identity.assemblyDigest, artifactV1.identity.assemblyDigest);
  assert.equal(
    artifactV2.identity.kindImplementation.implementation.implementationDigest,
    WORKFLOW_ENGINE_DIGEST_V2,
  );

  // The stale v1 artifact/compiled currentness fails BEFORE any transition.
  await assert.rejects(
    runCompiledWorkflow({
      artifact: artifactV1,
      component: worldV2.workflow,
      sealedAssembly: worldV2.finalAssembly,
      currentDefinitionGraph: worldV2.g,
      sha256: realSha256,
      events: [{ type: TRIGGER_EVENT }],
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'STALE_COMPILED_WORKFLOW_ARTIFACT');
      assert.equal(error.failureClass, 'STALE');
      return true;
    },
  );

  // The replacement compiles and runs through the same bridge — the seam did
  // not change. MICROKERNEL_SOURCE_DIFF=0 by construction: this suite adds
  // tests only and re-proves the structural seam here.
  assert.equal((await runWorkflow(worldV2, artifactV2, [{ type: TRIGGER_EVENT }])).stateId, 'charged');

  const bridgePath = fileURLToPath(
    new URL('../../../src/adapters/workflow-runtime-bridge.ts', import.meta.url),
  );
  const kindPath = fileURLToPath(new URL('../../../src/adapters/workflow-kind.ts', import.meta.url));
  for (const path of [bridgePath, kindPath]) {
    const source = readFileSync(path, 'utf8');
    for (const forbidden of ['../admission/', '../governance/']) {
      assert.ok(!source.includes(`'${forbidden}`), `${path} must not import ${forbidden}`);
    }
  }
});

// ---------------------------------------------------------------------------
// F9 — Raw/legacy direct bypass rejects before authoritative mutation.
// ---------------------------------------------------------------------------

test('T007C F9: raw/legacy workflow material cannot bypass admitted v0.7 Component semantics — forged artifact, wrong Kind and legacy definition all fail closed', async () => {
  const world = await buildWorld();
  const artifact = await compileWorkflow(world);

  // (a) A caller-minted artifact carrying copied identity material is not
  //     executable (already the F2 forgery cell; re-proven here as the raw
  //     bypass attempt at the transition-execution entry).
  const rawLookAlike = {
    identity: artifact.identity,
    routes: artifact.routes,
  } as unknown as CompiledWorkflowArtifact;
  await assert.rejects(runWorkflow(world, rawLookAlike, [{ type: TRIGGER_EVENT }]), (error: unknown) => {
    assert.ok(error instanceof WorkflowBridgeError);
    assert.equal(error.code, 'UNTRUSTED_COMPILED_WORKFLOW_ARTIFACT');
    return true;
  });

  // (b) A raw legacy Component that is not exactly the admitted Workflow Kind
  //     can never compile: the bridge serves exactly one Kind, through the
  //     sealed Assembly binding, validated by the sealed validator handle.
  const rawNeutral = neutralComponent();
  await assert.rejects(
    compileWorkflowComponent({
      component: rawNeutral,
      sealedAssembly: world.finalAssembly,
      currentDefinitionGraph: world.g,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof WorkflowBridgeError);
      assert.equal(error.code, 'WORKFLOW_BRIDGE_KIND_MISMATCH');
      return true;
    },
  );

  // (c) Legacy-class workflow semantics (engine-private material injected into
  //     the closed-world semantic body) fail closed at the T007A validator
  //     before any compile/execution: unknown semantic fields are never
  //     guessed around.
  const legacyBodyComponent: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'component.workflow',
    kind: { kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_REF.version },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      initial: 'review',
      states: [{ stateId: 'review' }, { stateId: 'charged' }],
      transitions: [
        {
          transitionId: 't-charge',
          from: 'review',
          to: 'charged',
          event: TRIGGER_EVENT,
          // Legacy engine-private material (guard/action) is NOT closed-world
          // v0.7 semantic material.
          legacyGuard: 'amount > 0',
        } as never,
      ],
    },
  };
  await assert.rejects(
    compileWorkflowComponent({
      component: legacyBodyComponent,
      sealedAssembly: world.finalAssembly,
      currentDefinitionGraph: world.g,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(
        error instanceof WorkflowBridgeError || error instanceof WorkflowKindAdapterError,
        `got ${String(error)}`,
      );
      assert.ok(
        error.code === 'WORKFLOW_BRIDGE_KIND_MISMATCH' ||
          error.code === 'INVALID_WORKFLOW_SEMANTIC_BODY' ||
          error.code === 'UNKNOWN_WORKFLOW_SEMANTIC_FIELD' ||
          error.code === 'INVALID_WORKFLOW_TRANSITION',
        `unexpected code ${(error as { code?: string }).code}`,
      );
      return true;
    },
  );

  // (d) Structural: the transition-execution plane cannot mint journal or
  //     occurrence authority (no admission/governance import), so a raw
  //     legacy transition can never produce a durable effect by side channel.
  const bridgeSource = readFileSync(
    fileURLToPath(new URL('../../../src/adapters/workflow-runtime-bridge.ts', import.meta.url)),
    'utf8',
  );
  assert.ok(!bridgeSource.includes("'../admission/"), 'no admission import in the bridge');
  assert.ok(!bridgeSource.includes("'../governance/"), 'no governance import in the bridge');
  assert.equal(world.journal.getRecords().length, 0, 'every bypass attempt left the journal untouched');
});
