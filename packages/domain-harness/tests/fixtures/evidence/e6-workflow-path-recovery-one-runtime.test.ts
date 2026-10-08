/**
 * E6 executable reference evidence — Workflow path/recovery/one Runtime
 * (issue #897; controller #537 MERGE_FIRST; authority #589 PACK-D E6 frozen
 * at issuecomment-5980528597; DAG: E6 <- T007A #848 / T007B #868 /
 * T007C #892, all landed at merge 02dc8b913a69698f3f57fb45b231b0d70d94c0b2).
 *
 * REFERENCE GATE (falsification, not demo): every claim below is proven by
 * executing the ACCEPTED production seams over a DISJOINT neutral test-only
 * fixture namespace (`e6.fulfillment.v1` — not the T007C `t007c.*`
 * namespace) that crosses the same public contracts as production. No
 * production source, barrel, package manifest, Product/L2/DAG mutation
 * exists in this change; the write set is this evidence directory only. A
 * discovered defect would be recorded as evidence (RESULT=REFUTED/PARTIAL),
 * never repaired here.
 *
 * BOUNDARY (issue #897 body): T007C (PR #892) already proved the F0-F9
 * crash/replay/recovery/no-duplicate matrix at #888@6036807715 (validation)
 * + #888@6037148650 (fresh review) + durable CI waiver #888@6037767236.
 * E6 CONSUMES those conclusions (reference, not re-run) and executes the
 * E6-SPECIFIC dimensions the issue names:
 *
 *   CONSUMED-FROM-T007C (evidence reference; matrix NOT duplicated here):
 *     - crash-before-effect / crash-after-possible-effect /
 *       replay-from-durable-state / duplicate-effect idempotency
 *         => T007C F3, F4, F5, F6 (#892@6cc469b8; validator terminal
 *            #888@6036807715 section (c)+(e); fresh review
 *            #888@6037148650 section (b) point 5);
 *     - outcome-unknown preserves existing reconciliation semantics
 *         => T007C F4 (record stays 'started', retry ADMISSION_EFFECT_AMBIGUOUS,
 *            zero re-dispatch);
 *     - stale compiled/Assembly/Kind evidence fails closed
 *         => T007C F1, F2, F8 (+F9 raw/legacy bypass);
 *     - one authoritative Runtime + Central Admission/occurrence anchoring
 *         => T007C F0 + the two composition invariants
 *            (#888@6036807715 section (c)).
 *
 *   NEWLY-PROVEN HERE (E6-specific supplementary experiments):
 *     A. Workflow kind binding + GENERIC DISPATCH CHAIN: the Workflow
 *        KindImplementation (T007A factory) and a neutral test Kind bind
 *        through the one generic `sealRuntimeAssembly` seam into the same
 *        normalized record structure; the kernel-owned generic kind-dispatch
 *        entry `admitComponentWithAssembly` admits BOTH components through
 *        the identical code path with zero kind-specific branching; an
 *        unbound/exact-version-mismatched Kind fails closed
 *        (ASSEMBLY_ADMISSION_KIND_NOT_BOUND); the T007B compile consumes the
 *        SAME sealed pin the generic record exposes (dispatch chain:
 *        seal -> record pin -> bridge artifact identity); engine replacement
 *        through the same factory moves Assembly identity only.
 *     B. ADAPTER-PRIVACY EVIDENCE-GRADE RE-REVIEW (XState/compiler private):
 *        (i) the generic authority contracts (`src/contracts/**`) are
 *        engine-free — no `xstate` token anywhere; (ii) the T007A descriptor
 *        adapter imports contracts only — no engine, no workflow-runtime
 *        surface; (iii) the transition-execution bridge allowlist is exact
 *        and carries no admission/governance/harness/compiler authority
 *        import; (iv) the Agent projection adapter is engine-free; (v) the
 *        package has exactly ONE state-machine dependency (`xstate`).
 *     C. ONE-RUNTIME + UNIQUE CENTRAL ADMISSION, bridge-level end-to-end on
 *        the disjoint fixture: the admitted Workflow Component compiles and
 *        runs on the one shipped runtime, the bridge run never touches the
 *        journal, and the effectful Tool routes through T004C into Central
 *        Admission on the pinned occurrence (exactly one dispatch, exactly
 *        one completed durable record); without the pinned occurrence the
 *        SAME invocation fails GOVERNANCE_EXECUTION_PIN_MISSING with zero
 *        dispatch and zero journal records (authority uniqueness re-derived
 *        end-to-end; T007C F0/invariant conclusion consumed and extended to
 *        the e6 namespace).
 *
 * Pre-evidence identity capture (DefinitionGraphDigest, base/successor
 * Assembly digests, exact Workflow KindImplementation pin, T003C binding
 * digest, governance pin binding digest, artifact identity) is recorded ONCE
 * via E6_FIXTURE_IDENTITIES (exact digests and non-secret identities only —
 * live handles/secrets are never frozen or serialized).
 *
 * MANIFEST (frozen fixture identities):
 *   MANIFEST_ID=E6_WORKFLOW_PATH_RECOVERY_ONE_RUNTIME_V1
 *   MANIFEST_VERSION=1
 *   DEFINITION_FIXTURE=e6.fulfillment.v1
 *   CONSUMED=T007C F0-F9 (#892@6cc469b8; #888@6036807715; #888@6037148650)
 *   NEWLY_PROVEN=A-kind-dispatch-chain;B-adapter-privacy-scan;C-one-runtime-e2e
 *   MICROKERNEL_SOURCE_DIFF=0 (tests only; NO packages/domain-harness/src/**
 *   semantic changes; NO dist semantic changes)
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
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
  admitComponentWithAssembly,
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
} from '../../../src/adapters/workflow-runtime-bridge.js';
import {
  WORKFLOW_KIND_REF,
  createWorkflowKindImplementation,
} from '../../../src/adapters/workflow-kind.js';
import {
  invokeEffectfulTool,
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
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../../src/governance/index.js';
import { VolatileAdmissionEffectJournal } from '../../../src/admission/effect-journal.js';
import {
  GovernanceExecutionBindingError,
} from '../../../src/governance/index.js';
import type { CentralAdmissionPorts, CentralAdmissionRequest } from '../../../src/admission/contracts.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

const MANIFEST = {
  MANIFEST_ID: 'E6_WORKFLOW_PATH_RECOVERY_ONE_RUNTIME_V1',
  MANIFEST_VERSION: 1,
  DEFINITION_FIXTURE: 'e6.fulfillment.v1',
} as const;

const NEUTRAL_KIND = { kindId: 'test.semantic.e6neutral', version: '1.0.0' } as const;
const TOOL_KIND = { kindId: 'test.e6-kind', version: '1.0.0' } as const;
const UNBOUND_KIND = { kindId: 'test.semantic.e6unbound', version: '1.0.0' } as const;
const NEUTRAL_KIND_V2 = { kindId: 'test.semantic.e6neutral', version: '2.0.0' } as const;
const WORKFLOW_ENGINE_DIGEST_V1 = 'sha256:workflow-engine-e6-v1';
const WORKFLOW_ENGINE_DIGEST_V2 = 'sha256:workflow-engine-e6-v2';

const WORKFLOW_TARGET = 'fulfillment.ship';
const WORKFLOW_INSTANCE_ID = 'fulfillment.ship:instance:7';
const OCCURRENCE_TARGET: WorkflowAddress = { workflowId: 'fulfillment.ship', instanceKey: 'instance:7' };
const NOW = '2026-10-07T12:00:00.000Z';
const EFFECT_TYPE = 'effect:ship';
const INPUT = { tracking: 'TRK-897' };
const TRIGGER_EVENT = 'SHIP_AUTHORIZED';

const SRC_ROOT = fileURLToPath(new URL('../../../src', import.meta.url));
const ADAPTERS_DIR = join(SRC_ROOT, 'adapters');
const CONTRACTS_DIR = join(SRC_ROOT, 'contracts');

// ---------------------------------------------------------------------------
// Definition fixture: one neutral semantic Component, one admitted v0.7
// Workflow Semantic Component (T007A exact Kind), one consumer and one
// effectful Tool Component (T003C target of the T004C route).
// ---------------------------------------------------------------------------

function neutralComponent(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'component.e6neutral',
    kind: { ...NEUTRAL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'neutral test Kind (e6 dispatch chain)' },
  };
}

function workflowComponent(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'component.e6workflow',
    kind: { kindId: WORKFLOW_KIND_REF.kindId, version: WORKFLOW_KIND_REF.version },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      initial: 'queued',
      states: [{ stateId: 'queued' }, { stateId: 'shipped' }],
      transitions: [{ transitionId: 't-ship', from: 'queued', to: 'shipped', event: TRIGGER_EVENT }],
    },
  };
}

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: 'consumer.e6a',
    kind: { ...TOOL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [{ capabilityId: 'cap.ship', version: '1.0.0' }],
    semanticBody: { note: 'consumer' },
  };
}

function toolComponent(effect: 'idempotent' | 'non-idempotent'): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: 'tool.shipper',
    kind: { ...TOOL_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: 'op.ship', inputSchema: { type: 'object' }, outputSchema: {}, effect },
      ],
      providesCapabilities: [{ capabilityId: 'cap.ship', version: '1.0.0' }],
    },
  };
}

function graph(effect: 'idempotent' | 'non-idempotent' = 'non-idempotent'): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e6',
    components: [neutralComponent(), workflowComponent(), consumer(), toolComponent(effect)],
    relations: [],
  };
}

function neutralKindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { ...NEUTRAL_KIND },
      implementation: {
        implementationId: 'impl.test.semantic.e6neutral',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:e6-neutral-v1',
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
        implementationId: 'impl.e6-kind',
        implementationVersion: '1.0.0',
        implementationDigest: 'sha256:kind-impl-e6',
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
      implementationId: 'impl.workflow.engine.e6',
      implementationVersion: '1.0.0',
      implementationDigest: engineDigest,
    },
  });
}

function toolCandidate(digestSuffix: string): ToolImplementationCandidate {
  return {
    implementation: {
      implementationId: 'impl.ship.shipper',
      implementationVersion: '1.0.0',
      implementationDigest: `sha256:impl.ship.shipper-${digestSuffix}`,
    },
    supportedOperations: ['op.ship'],
    handle: { kind: 'runtime-handle', id: `handle.ship#${digestSuffix}` },
  };
}

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(): InvocationCallerContext {
  return { callerId: 'caller.session-e6', callerKind: 'workflow' };
}

// ---------------------------------------------------------------------------
// Governance / durable-occurrence hosts (same composite posture as the T004C
// recovery evidence).
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

async function governanceBody() {
  return createGovernanceBaselineBody(
    {
      domainId: 'fulfillment',
      governanceId: 'fulfillment-governance',
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
  journal: VolatileAdmissionEffectJournal;
  admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'>;
  definitionGraphDigest: string;
}

async function buildWorld(options: WorldOptions = {}): Promise<World> {
  const effect = options.effect ?? 'non-idempotent';
  const engineDigest = options.workflowEngineDigest ?? WORKFLOW_ENGINE_DIGEST_V1;
  const toolDigestSuffix = options.toolDigestSuffix ?? 'v1';

  const g = graph(effect);
  const workflow = g.components.find((component) => component.componentId === 'component.e6workflow')!;
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
    { capabilityId: 'cap.ship', version: '1.0.0' },
    'consumer.e6a',
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
      toolComponentId: 'tool.shipper',
      operationId: 'op.ship',
      caller: caller(),
      assembly: finalAssembly,
      currentDefinitionGraph: g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: 'tool.shipper',
      operationId: 'op.ship',
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
    domainId: 'fulfillment',
    packageId: 'pkg-fulfillment-1',
    domainIntelligenceContentDigest: 'cdi-fulfillment-1',
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
        domainId: 'fulfillment',
        packageId: 'pkg-fulfillment-1',
        domainIntelligenceContentDigest: 'cdi-fulfillment-1',
        governanceBaseline: b1.identity,
      },
      assembly: finalAssembly,
      authorityClass: 'PRODUCTION',
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
    journal,
    admissionPorts,
    definitionGraphDigest: digest,
  };
}

function admissionDefinition(): DomainWorkflowDefinition {
  return {
    workflowKey: 'component.e6workflow',
    initialState: 'queued',
    initialContext: {},
    states: [
      {
        stateKey: 'queued',
        transitions: [
          {
            transitionKey: 't-ship',
            trigger: { kind: 'event', eventType: TRIGGER_EVENT },
            targetState: 'shipped',
            effectIntents: [{ effectType: EFFECT_TYPE, input: INPUT, idempotencyKey: 'ship:1' }],
          },
        ],
      },
      { stateKey: 'shipped', kind: 'final' },
    ],
  };
}

function resolvedDecision(): ResolvedDecision<JsonValue> {
  const source: DecisionResolverSource = 'harness-machine';
  return {
    source,
    structuredDecision: {
      decision: { outcome: 'ship', data: { tracking: 'TRK-897' } },
      event: { type: TRIGGER_EVENT, payload: { tracking: 'TRK-897' } },
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

function admissionRequest(): CentralAdmissionRequest {
  return {
    target: OCCURRENCE_TARGET,
    turn: { kind: 'message', sourceMessageId: 'msg:e6:1' },
    trigger: { kind: 'event', eventType: TRIGGER_EVENT },
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    definition: admissionDefinition(),
    currentStateKey: 'queued',
    context: {},
    event: { type: TRIGGER_EVENT, payload: { tracking: 'TRK-897' } },
    resolved: resolvedDecision(),
    decisionSchema,
    now: NOW,
  };
}

function recordingDispatch(calls: EffectfulToolDispatchQuery[]): EffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return { shipped: true };
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

// ---------------------------------------------------------------------------
// Pre-evidence identity capture (recorded ONCE; every experiment runs
// against the same immutable identity block).
// ---------------------------------------------------------------------------

test('E6 fixture identities: the frozen world pins one exact Definition graph, one final Assembly, one Workflow KindImplementation and one governance occurrence lineage', async () => {
  const world = await buildWorld();
  const artifact = await compileWorkflow(world);
  assert.ok(world.pin, 'sanity: the PRODUCTION occurrence pin exists');

  console.log(
    'E6_FIXTURE_IDENTITIES ' +
      JSON.stringify({
        manifestId: MANIFEST.MANIFEST_ID,
        manifestVersion: MANIFEST.MANIFEST_VERSION,
        definitionFixture: MANIFEST.DEFINITION_FIXTURE,
        definitionGraphDigest: world.definitionGraphDigest,
        baseAssemblyDigest: world.baseAssembly.assemblyDigest,
        finalAssemblyDigest: world.finalAssembly.assemblyDigest,
        workflowKindImplementationPin: artifact.identity.kindImplementation,
        toolBindingDigest: world.binding.evidence.bindingDigest,
        artifactDefinitionGraphDigest: artifact.identity.definitionGraphDigest,
        artifactAssemblyDigest: artifact.identity.assemblyDigest,
        governancePinBindingDigest: world.pin.bindingDigest,
        governancePinAuthorityClass: world.pin.authorityClass,
      }),
  );

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
// A — Workflow kind binding + GENERIC DISPATCH CHAIN (E6-specific; the
// same-seam binding is E3/T007C-adjacent, but the full dispatch chain —
// generic kernel admission over BOTH kinds + sealed-pin -> bridge identity —
// is newly proven here over the disjoint e6 fixture).
// ---------------------------------------------------------------------------

test('E6 A1/A2: Workflow and neutral Kinds bind through the ONE generic sealed-Assembly seam, and the kernel-owned generic dispatch admits BOTH components through the identical code path', async () => {
  const world = await buildWorld();
  const assembly = world.baseAssembly;

  // Same-seam binding: both pins live in the ONE normalized record structure,
  // sorted by exact Kind identity, with no kind-specific record fields. The
  // Workflow KindImplementation is structurally indistinguishable from the
  // neutral test Kind at the record level.
  const recordKinds = assembly.record.kindImplementations.map((pin) => pin.kind);
  assert.deepEqual(recordKinds, [...recordKinds].sort((a, b) =>
    a.kindId < b.kindId ? -1 : a.kindId > b.kindId ? 1 : a.version < b.version ? -1 : a.version > b.version ? 1 : 0,
  ));
  const workflowPin = assembly.record.kindImplementations.find(
    (pin) => pin.kind.kindId === WORKFLOW_KIND_REF.kindId && pin.kind.version === WORKFLOW_KIND_REF.version,
  );
  const neutralPin = assembly.record.kindImplementations.find(
    (pin) => pin.kind.kindId === NEUTRAL_KIND.kindId && pin.kind.version === NEUTRAL_KIND.version,
  );
  assert.ok(workflowPin, 'the Workflow pin is bound through the generic record');
  assert.ok(neutralPin, 'the neutral pin is bound through the generic record');
  assert.equal(workflowPin.implementation.implementationDigest, WORKFLOW_ENGINE_DIGEST_V1);
  assert.equal(assembly.bindings.length, assembly.record.kindImplementations.length);
  assert.equal(assembly.bindings.length, 3, 'neutral + tool + workflow, one generic binding each');

  // Generic dispatch: admitComponentWithAssembly is the kernel-owned generic
  // kind-dispatch entry — a single test-local dispatcher with ZERO
  // kind-specific branching drives BOTH components through it.
  async function genericDispatch(component: ComponentEnvelope) {
    // Identical body for every Kind: no kindId/version conditional anywhere.
    return admitComponentWithAssembly(component, assembly, {
      currentDefinitionGraph: world.g,
      sha256: realSha256,
    });
  }

  const neutralAdmission = await genericDispatch(neutralComponent());
  const workflowAdmission = await genericDispatch(world.workflow);
  assert.equal(neutralAdmission.status, 'ADMITTED');
  assert.equal(workflowAdmission.status, 'ADMITTED');
  assert.deepEqual(workflowAdmission.admittedKind, {
    kindId: WORKFLOW_KIND_REF.kindId,
    version: WORKFLOW_KIND_REF.version,
  });
  assert.deepEqual(workflowAdmission.admittedKindImplementation, workflowPin);
  assert.deepEqual(neutralAdmission.admittedKindImplementation, neutralPin);
  assert.equal(workflowAdmission.assemblyDigest, assembly.assemblyDigest);
  assert.equal(neutralAdmission.assemblyDigest, assembly.assemblyDigest);
  assert.equal(workflowAdmission.definitionGraphDigest, world.definitionGraphDigest);
});

test('E6 A3: an unbound Kind or an exact-version mismatch fails closed at the generic dispatch — never default/first/closest', async () => {
  const world = await buildWorld();
  const assembly = world.baseAssembly;

  const unboundComponent: ComponentEnvelope = {
    family: 'semantic',
    componentId: 'component.e6unbound',
    kind: { ...UNBOUND_KIND },
    requiredSemanticContracts: [],
    requiredCapabilities: [],
    semanticBody: { note: 'kind never bound at sealing' },
  };
  await assert.rejects(
    admitComponentWithAssembly(unboundComponent, assembly, {
      currentDefinitionGraph: world.g,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND');
      return true;
    },
  );

  // Exact-version discipline: the SAME kindId at a different exact version is
  // a different unbound Kind — no range/floating fallback exists.
  const versionMismatchComponent: ComponentEnvelope = {
    ...neutralComponent(),
    componentId: 'component.e6neutral-v2',
    kind: { ...NEUTRAL_KIND_V2 },
  };
  await assert.rejects(
    admitComponentWithAssembly(versionMismatchComponent, assembly, {
      currentDefinitionGraph: world.g,
      sha256: realSha256,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, 'ASSEMBLY_ADMISSION_KIND_NOT_BOUND');
      return true;
    },
  );
});

test('E6 A4/A5: the dispatch chain is seal -> generic record pin -> bridge artifact identity, and engine replacement moves Assembly identity only (same T007A factory seam)', async () => {
  const worldV1 = await buildWorld({ workflowEngineDigest: WORKFLOW_ENGINE_DIGEST_V1 });
  const artifactV1 = await compileWorkflow(worldV1);

  // Chain integrity: the compiled artifact is bound to EXACTLY the pin the
  // generic sealed record exposes for the Workflow Kind — the bridge consumes
  // the same dispatch source as every other Kind.
  const sealedWorkflowPin = worldV1.baseAssembly.record.kindImplementations.find(
    (pin) => pin.kind.kindId === WORKFLOW_KIND_REF.kindId && pin.kind.version === WORKFLOW_KIND_REF.version,
  )!;
  assert.deepEqual(artifactV1.identity.kindImplementation, sealedWorkflowPin);
  assert.equal(artifactV1.identity.definitionGraphDigest, worldV1.definitionGraphDigest);
  assert.equal(artifactV1.identity.assemblyDigest, worldV1.finalAssembly.assemblyDigest);

  // Engine replacement through the SAME T007A factory: new exact pin -> new
  // Assembly identity, unchanged Definition identity. (Complementary
  // re-derivation of the T007C F8 seam conclusion over the disjoint e6
  // fixture — the Assembly-plane movement itself is consumed from T007C F8.)
  const worldV2 = await buildWorld({ workflowEngineDigest: WORKFLOW_ENGINE_DIGEST_V2 });
  const artifactV2 = await compileWorkflow(worldV2);
  assert.equal(worldV2.definitionGraphDigest, worldV1.definitionGraphDigest);
  assert.notEqual(worldV2.finalAssembly.assemblyDigest, worldV1.finalAssembly.assemblyDigest);
  assert.equal(
    artifactV2.identity.kindImplementation.implementation.implementationDigest,
    WORKFLOW_ENGINE_DIGEST_V2,
  );
  // The stale v1 artifact fails closed BEFORE any transition on the v2 world
  // (stale-dimension authority consumed from T007C F1/F2/F8; re-derived here
  // once at the chain level to keep this suite self-contained).
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
  assert.equal((await runCompiledWorkflow({
    artifact: artifactV2,
    component: worldV2.workflow,
    sealedAssembly: worldV2.finalAssembly,
    currentDefinitionGraph: worldV2.g,
    sha256: realSha256,
    events: [{ type: TRIGGER_EVENT }],
  })).stateId, 'shipped');
});

// ---------------------------------------------------------------------------
// B — ADAPTER-PRIVACY EVIDENCE-GRADE RE-REVIEW (XState/compiler private).
// Consumes the T007C structural invariant conclusion and extends it to a
// package-wide, evidence-grade scan of the current head.
// ---------------------------------------------------------------------------

function listTypeScriptFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) {
      out.push(...listTypeScriptFiles(path));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      out.push(path);
    }
  }
  return out;
}

function importSpecifiers(source: string): string[] {
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
}

test('E6 B1/B2: the generic authority contracts and the T007A descriptor adapter are engine-free (no XState, no workflow-runtime surface anywhere)', () => {
  // (i) The generic authority contracts never IMPORT the engine or any
  // implementation plane: no `xstate` specifier, no workflow/adapters/
  // compiler surface. (Doc-comment boundary statements such as "No
  // Workflow/XState import is allowed" are negative documentation and are
  // not authority surface; the falsifiable check is the import graph.)
  for (const path of listTypeScriptFiles(CONTRACTS_DIR)) {
    for (const specifier of importSpecifiers(readFileSync(path, 'utf8'))) {
      assert.ok(
        specifier !== 'xstate' && !/xstate/i.test(specifier),
        `generic authority contract ${path} must not import the Workflow engine: ${specifier}`,
      );
      assert.ok(
        !/(\.\.\/)+(workflow|adapters|compiler)\//.test(specifier),
        `generic authority contract ${path} must not import an implementation plane: ${specifier}`,
      );
    }
  }

  // (ii) The T007A descriptor adapter imports contracts ONLY: no engine, no
  // workflow-runtime/internal surface, no sibling adapter. (Its header
  // documents the XState-privacy boundary in prose; the import graph is the
  // falsifiable surface.)
  const kindSource = readFileSync(join(ADAPTERS_DIR, 'workflow-kind.ts'), 'utf8');
  for (const specifier of importSpecifiers(kindSource)) {
    assert.ok(
      specifier.startsWith('../contracts/'),
      `workflow-kind.ts must import contracts only, got ${specifier}`,
    );
  }

  // (iv) The Agent projection adapter is engine-free as well: contracts only
  // (Agent plane composes generic invocation seams, never the engine).
  const agentSource = readFileSync(join(ADAPTERS_DIR, 'agent-tool-projection.ts'), 'utf8');
  for (const specifier of importSpecifiers(agentSource)) {
    assert.ok(
      specifier.startsWith('../contracts/'),
      `agent-tool-projection.ts must import contracts only, got ${specifier}`,
    );
  }
});

test('E6 B3/B4: the transition-execution bridge has an exact import allowlist with no admission/governance/harness/compiler authority plane, and the package has exactly ONE state-machine dependency', () => {
  const bridgeSource = readFileSync(join(ADAPTERS_DIR, 'workflow-runtime-bridge.ts'), 'utf8');
  const imported = importSpecifiers(bridgeSource);

  // Exact allowlist — same structural seam as the T007C invariant, re-derived
  // on the current head. The bridge reaches only the generic contract family,
  // the engine-neutral workflow boundary, the private xstate adapter and the
  // T007A Kind adapter.
  const allowedImports = [
    'xstate',
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
  ];
  for (const specifier of imported) {
    assert.ok(
      allowedImports.includes(specifier),
      `unexpected inward dependency of the Workflow runtime bridge: ${specifier}`,
    );
  }

  // No authority plane is reachable from transition execution.
  for (const forbidden of ['../admission/', '../governance/', '../harness/', '../compiler/']) {
    assert.ok(
      !bridgeSource.includes(`'${forbidden}`),
      `bridge must not import ${forbidden}`,
    );
  }

  // The engine-private xstate adapter is reached only through the internal
  // relative path; nothing else in the adapter directory names it.
  const adapterFiles = listTypeScriptFiles(ADAPTERS_DIR);
  for (const path of adapterFiles) {
    const source = readFileSync(path, 'utf8');
    assert.ok(
      !source.includes('xstate-adapter') || path.endsWith('workflow-runtime-bridge.ts'),
      `${path} must not reach the private xstate adapter`,
    );
  }

  // (v) One state-machine dependency for the whole package — no parallel
  // runtime can exist by dependency construction.
  const packageJson = JSON.parse(
    readFileSync(fileURLToPath(new URL('../../../package.json', import.meta.url)), 'utf8'),
  ) as { dependencies: Record<string, string> };
  const engineDeps = Object.keys(packageJson.dependencies).filter((name) =>
    /state|engine|machine/i.test(name),
  );
  assert.deepEqual(engineDeps, ['xstate']);
});

// ---------------------------------------------------------------------------
// C — ONE RUNTIME + UNIQUE CENTRAL ADMISSION, bridge-level end-to-end on the
// disjoint e6 fixture. Consumes T007C F0 + the composition invariants and
// re-derives the end-to-end authority chain in the e6 namespace.
// ---------------------------------------------------------------------------

test('E6 C1: the admitted Workflow Component compiles and runs on the ONE runtime; the bridge run never touches the journal; the effectful Tool executes through T004C into Central Admission on the pinned occurrence (one dispatch, one completed durable record)', async () => {
  const world = await buildWorld();
  const artifact = await compileWorkflow(world);

  // Transition execution on the one shipped runtime through the private
  // bridge: no journal, no occurrence material is reachable here.
  const run = await runCompiledWorkflow({
    artifact,
    component: world.workflow,
    sealedAssembly: world.finalAssembly,
    currentDefinitionGraph: world.g,
    sha256: realSha256,
    events: [{ type: TRIGGER_EVENT }],
  });
  assert.equal(run.stateId, 'shipped');
  assert.equal(world.journal.getRecords().length, 0, 'bridge execution never touches the journal');

  // The authoritative effect route: the SAME occurrence pinned at activation,
  // the SAME final Assembly, the exact admitted Tool invocation.
  const calls: EffectfulToolDispatchQuery[] = [];
  const result = await invokeEffectfulTool(invocationInput(world, { dispatch: recordingDispatch(calls) }));

  assert.equal(result.outcome.status, 'admitted');
  if (result.outcome.status !== 'admitted') return;
  assert.equal(result.outcome.admitted.transitionKey, 't-ship');
  assert.equal(result.outcome.admitted.targetState, 'shipped');
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

test('E6 C2: without the pinned occurrence the SAME invocation fails GOVERNANCE_EXECUTION_PIN_MISSING with zero dispatch and zero journal records; binding the exact pin through the accepted activation path makes the SAME invocation admissible — Central Admission authority is unique', async () => {
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

  // Authority comes from the pinned occurrence only: the accepted activation
  // path binds the exact pin, and the SAME invocation becomes admissible.
  const b1 = await governanceBody();
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'fulfillment',
    packageId: 'pkg-fulfillment-1',
    domainIntelligenceContentDigest: 'cdi-fulfillment-1',
  });
  await world.activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: WORKFLOW_INSTANCE_ID,
    binding: {
      domainId: 'fulfillment',
      packageId: 'pkg-fulfillment-1',
      domainIntelligenceContentDigest: 'cdi-fulfillment-1',
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
