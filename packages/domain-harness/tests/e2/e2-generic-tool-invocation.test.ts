/**
 * E2 executable reference — Generic Tool invocation evidence
 * (issue #887; authority #589@<pack-d> PACK-D E2 + readiness #705
 * VERDICT=READY_AFTER_DEPENDENCIES (predecessors since accepted) + Fresh
 * Review #623 F-01..F-03 bounds; DAG #534 E2 row <- T003B(#592)/T003C
 * (#614/#640/#866)/T004A(#616)/T002C(#631)/T002D(#688/#755)/T004B(#691/#870)/
 * T004C(#874/PR#880)).
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding).
 * SOURCE_MUTATION=NONE (packages/domain-harness/tests/e2 write set only).
 *
 * Reference-falsification scope under test (PACK-D E2 + #705 STALE_REJECTION /
 * NO_TOOL_RESULT_AUTHORITY / FIXTURE_BOUND):
 *  - ONE exact ordinary Tool Component crosses BOTH applicable invocation
 *    classes: `effect=none` (op.e2.query) dispatches ONLY through the T004B
 *    non-effectful seam and gains ZERO transition/business authority — the
 *    seam exposes no journal/occurrence/activator input (an extra field fails
 *    closed typed), the module imports nothing transition-related
 *    (executable import-graph proof), the durable effect store gains zero
 *    rows, and the result is status OBSERVED identity+output material only;
 *  - the effectful operation (op.e2.mutate, same exact Tool Component and
 *    same exact implementation pin family) routes ONLY through T004C onto an
 *    ALREADY-AUTHORITATIVE occurrence: the existing Central Admission +
 *    AdmissionDurableEffectJournal is the ONE effect authority, the
 *    occurrence pin must carry exact PRODUCTION class on the SAME final
 *    sealed Assembly (SIMULATION class, missing pin or replaced Assembly all
 *    fail closed before the effect), and the dispatch query carries the
 *    durable effect identity (effectId/durableControlTurnId/ordinal/logical
 *    time) derived by Central Admission — never caller-minted;
 *  - exact T003B/T003C provider/binding evidence and currentness is honored:
 *    the accepted consumer verifier decides mint membership, evidence digest,
 *    exact subject slot and exact implementation pin against the SAME final
 *    sealed Assembly BEFORE the opaque handle pairs; an exact-pin
 *    expectation mismatch and a replaced subject slot fail closed at the
 *    verifier; a candidate-order permutation of two compatible
 *    implementations fails AMBIGUOUS with byte-identical diagnostics (no
 *    first-insertion/registry-order authority);
 *  - stale/mismatched implementation, caller exposure or Assembly fails
 *    BEFORE any Tool call/effect: tampered request Assembly digest
 *    (ASSEMBLY_CURRENTNESS_MISMATCH), drifted Definition graph
 *    (DEFINITION_CURRENTNESS_MISMATCH), caller-forged exposure evidence
 *    (FORGED_EXPOSURE_EVIDENCE), exposure bound to another caller
 *    (INVOCATION_CALLER_MISMATCH), unminted binding lookalike
 *    (UNMINTED_TOOL_IMPLEMENTATION_BINDING), self-consistent forged Assembly
 *    content (ASSEMBLY_PROVENANCE_UNVERIFIED via the directly consumed T002B
 *    mint verifier), missing occurrence (GOVERNANCE_EXECUTION_PIN_MISSING),
 *    cross-class occurrence (AUTHORITY_CLASS_MISMATCH), occurrence pinned to
 *    a predecessor Assembly (OCCURRENCE_ASSEMBLY_MISMATCH),
 *    effectful-through-T004B (EFFECTFUL_OPERATION_REJECTED),
 *    effectless-through-T004C (EFFECTLESS_OPERATION_REJECTED) — every cell
 *    asserts zero dispatch, zero journal record and zero real-host write;
 *  - the Tool RETURN VALUE alone is never authoritative Domain state: a
 *    fabricated authoritative-looking payload from the effect=none path is
 *    OBSERVED-only (zero durable rows, zero pins, cannot mint exposure
 *    evidence), and on the effectful path mutating/ignoring the returned
 *    payload never alters the journaled record, the occurrence pin or the
 *    real host write — durable authority is Central Admission + journal +
 *    pin alone.
 *
 * REAL_HOST_POSTURE=REQUIRED (#623 classification: E2 production-effect path
 * YES): the effectful Tool executes a GENUINE better-sqlite3 (native binding)
 * SQLite database-file side effect exactly once under Central Admission; the
 * effect=none path proves the identical host store gains ZERO rows.
 *
 * Frozen subject (issue #887 EXECUTION_CLAIM rebind check — no drift):
 *   SUBJECT_HEAD=cb7eba1e1527f3e1677a4f3ecd14607d8175dc9d
 *   SUBJECT_TREE=b11125fc4226b05b331c69f23dbc9662a88b2c77
 *
 * Frozen manifest (REFERENCE_FIXTURE_FREEZE posted on #887 BEFORE any matrix
 * outcome was observed; verbatim values):
 *   MANIFEST_ID=E2_GENERIC_TOOL_INVOCATION_V1
 *   MANIFEST_VERSION=1
 *   MANIFEST_CANONICAL_JSON_SHA256=sha256:1b9e3f467d1cae182940513e7546b697bac940617b4e19041b7724d6a9b9cf94
 *   DEFINITION_FIXTURE=e2.tool.definition.v1
 *   TOOL_PIN=impl.e2.tool@1.0.0#sha256:2222…2222 (64x '2')
 *   KIND_PIN=impl.e2.kind@1.0.0#sha256:1111…1111 (64x '1')
 *   AUTHORITY_CLASS=PRODUCTION
 *   NEGATIVE_PERMUTATION_MATRIX=effect-none-t004b;effectful-t004c;effectful-through-t004b;effectless-through-t004c;effectful-no-occurrence;effectful-simulation-occurrence;occurrence-assembly-mismatch;stale-definition;tampered-request-assembly-digest;forged-exposure-evidence;stale-exposure-caller;unminted-binding-lookalike;tampered-binding-evidence;stale-binding-assembly;ambiguous-implementation-order-permutations;forged-assembly-lookalike;tool-return-not-authority
 *   REAL_HOST_POSTURE=REQUIRED
 *
 * FROZEN_IDENTITIES (captured once through the accepted seams, deterministic
 * across repeated construction; asserted live by the freeze cell; values are
 * the exact live seam formats — bare lowercase hex, the `sha256:` label used
 * in the #887 freeze comment is presentational):
 *   DEFINITION_GRAPH_DIGEST=8c4b4c2be2622c1f1649d033f42dba27d761f463f3d9b15af00e4486dd336331
 *   BASE_ASSEMBLY_DIGEST=36decff3ea51ad88639c82fdf5f82020c4c6074a4bbbe007faa92c248f43d1eb
 *   BINDING_DIGEST_V1=1fa3b13645e443a758acf8a90d3b4f589d6539b670acfffc6b9729fbf52fd7fd
 *   SUCCESSOR_ASSEMBLY_DIGEST_V1=f5ef1147d3503d42be9dd5526df2dea6f5a4fdd41d2427e2b3a0561df67288b5
 *   BINDING_DIGEST_V2=79b08edde21682d3a8b922f5a23a88b77e836a559ce95be8ed5201ccf980e2c5
 *   SUCCESSOR_ASSEMBLY_DIGEST_V2=c7d0f584b2a29a22199531c4d8cc1548f5c369689b5fd0a401c0abfbf482ca7d
 *   OCCURRENCE_PIN={workflowInstanceId: orders.e2:instance:1, bindingDigest: 5e8623db9c48ac2d541dce2e110311926cba79582242ce07fa85d9fdce69387c, assemblyDigest: <SUCCESSOR_ASSEMBLY_DIGEST_V1>, authorityClass: PRODUCTION}
 *
 * Pre-evidence identity capture (F-01/#625): DefinitionGraphDigest, base and
 * successor Assembly digests, T003C binding digests, the exact occurrence pin
 * identity, the exact pins and the matrix/permutation digests are constructed
 * through the accepted current seams ONCE, recorded via E2_FIXTURE_IDENTITIES
 * and asserted against the frozen block above; every matrix cell is evaluated
 * against that immutable identity block.
 *
 * OBSERVED_LIMITS:
 *  - L1 (manifest grammar): the freeze grammar behind
 *    MANIFEST_CANONICAL_JSON_SHA256 is executor-declared
 *    (canonicalJsonStringify over the manifest field set, utf8) — the same
 *    precedent as the E3/E9 terminals; the freeze is pinned by manifest
 *    id/version/verbatim field values and the behavioral matrix is
 *    independent of reproducing that serialization.
 *  - L2 (unreachable typed codes): TOOL_IMPLEMENTATION_BINDING_EVIDENCE_MISMATCH
 *    and MISSING_CURRENT_TOOL_IMPLEMENTATION_BINDING are not reachable
 *    through the public invoke seams for a forged object: module-private mint
 *    membership (UNMINTED_TOOL_IMPLEMENTATION_BINDING) is always the first
 *    gate for non-member objects, and a genuine member is deeply frozen. They
 *    remain reachable only at the T003C verifier against a genuine binding +
 *    replaced final Assembly — covered here via STALE/verify cells; the E5
 *    matrix covers the remaining T003C taxonomy.
 *  - L3 (exposure currentness): EXPOSURE_CURRENTNESS_MISMATCH is not
 *    independently reachable — exposure is minted over the same graph/Assembly
 *    the request admission re-proves, so any drift surfaces first as
 *    DEFINITION_CURRENTNESS_MISMATCH/ASSEMBLY_* mismatch; the stale-caller and
 *    forged-evidence cells cover the exposure-authority negatives.
 *  - L4 (digest label): the frozen identity values are compared in the exact
 *    live seam format (bare lowercase hex); the `sha256:` label prefix used
 *    in the #887 REFERENCE_FIXTURE_FREEZE comment is presentational and does
 *    not participate in any comparison.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

import type { ComponentEnvelope, CapabilityContractRef } from '../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../src/contracts/definition-graph.js';
import {
  canonicalJsonStringify,
  type Sha256Port,
} from '../../src/contracts/identity.js';
import type { JsonValue } from '../../src/contracts/json.js';
import { resolveCurrentCapabilityProvider } from '../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  type AssemblyImplementationBindingEvidence,
  type KindImplementationBindingInput,
  type SealedRuntimeAssembly,
} from '../../src/contracts/runtime-assembly.js';
import {
  bindToolImplementation,
  ToolImplementationBindingError,
  verifyToolImplementationBinding,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
  type ToolImplementationIdentity,
} from '../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  InvocationRequestError,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../src/contracts/invocation-request.js';
import {
  invokeNonEffectfulTool,
  NonEffectfulInvocationError,
  type NonEffectfulToolDispatchPort,
  type NonEffectfulToolDispatchQuery,
} from '../../src/contracts/non-effectful-invocation.js';
import {
  EffectfulInvocationError,
  invokeEffectfulTool,
  type EffectfulAdmissionPorts,
  type EffectfulToolDispatchPort,
  type EffectfulToolDispatchQuery,
  type InvokeEffectfulToolInput,
} from '../../src/contracts/effectful-invocation.js';
import { VolatileAdmissionEffectJournal } from '../../src/admission/effect-journal.js';
import type {
  CentralAdmissionRequest,
} from '../../src/admission/contracts.js';
import type { DomainWorkflowDefinition } from '../../src/workflow/index.js';
import type { DecisionResolverSource, ResolvedDecision } from '../../src/decision-resolver/index.js';
import type { WorkflowAddress } from '../../src/v2/contracts/workflow.js';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionBindingError,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DomainActivationBinding,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineBody,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../src/governance/index.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

// ---------------------------------------------------------------------------
// Frozen manifest constants (#887 REFERENCE_FIXTURE_FREEZE, verbatim).
// ---------------------------------------------------------------------------

const MANIFEST = {
  MANIFEST_ID: 'E2_GENERIC_TOOL_INVOCATION_V1',
  MANIFEST_VERSION: 1,
  MANIFEST_CANONICAL_JSON_SHA256:
    'sha256:1b9e3f467d1cae182940513e7546b697bac940617b4e19041b7724d6a9b9cf94',
  DEFINITION_FIXTURE: 'e2.tool.definition.v1',
  AUTHORITY_CLASS: 'PRODUCTION',
  REAL_HOST_POSTURE: 'REQUIRED',
} as const;

const MATRIX_CELLS = [
  'effect-none-t004b',
  'effectful-t004c',
  'effectful-through-t004b',
  'effectless-through-t004c',
  'effectful-no-occurrence',
  'effectful-simulation-occurrence',
  'occurrence-assembly-mismatch',
  'stale-definition',
  'tampered-request-assembly-digest',
  'forged-exposure-evidence',
  'stale-exposure-caller',
  'unminted-binding-lookalike',
  'tampered-binding-evidence',
  'stale-binding-assembly',
  'ambiguous-implementation-order-permutations',
  'forged-assembly-lookalike',
  'tool-return-not-authority',
] as const;

// ---------------------------------------------------------------------------
// Definition fixture (e2.tool.definition.v1) — neutral, non-product.
// ---------------------------------------------------------------------------

const E2_KIND = { kindId: 'kind.e2.neutral', version: '1.0.0' } as const;
const SEM_A: { readonly contractId: string; readonly version: string } = {
  contractId: 'sem.e2.schema',
  version: '1.0.0',
};
const CAP_A: CapabilityContractRef = { capabilityId: 'cap.e2.a', version: '1.0.0' };
const CONSUMER_ID = 'consumer.e2';
const TOOL_ID = 'tool.e2';
const OP_QUERY = 'op.e2.query';
const OP_MUTATE = 'op.e2.mutate';

const KIND_PIN = {
  implementationId: 'impl.e2.kind',
  implementationVersion: '1.0.0',
  implementationDigest: `sha256:${'1'.repeat(64)}`,
};
const TOOL_PIN: ToolImplementationIdentity = {
  implementationId: 'impl.e2.tool',
  implementationVersion: '1.0.0',
  implementationDigest: `sha256:${'2'.repeat(64)}`,
};
const TOOL_PIN_V2: ToolImplementationIdentity = {
  implementationId: 'impl.e2.tool',
  implementationVersion: '2.0.0',
  implementationDigest: `sha256:${'9'.repeat(64)}`,
};
const ALT_PIN: ToolImplementationIdentity = {
  implementationId: 'impl.e2.alt',
  implementationVersion: '1.0.0',
  implementationDigest: `sha256:${'5'.repeat(64)}`,
};

const UNRELATED_SLOT: AssemblyImplementationBindingEvidence = {
  subject: 'unrelated.e2.binding-slot-1',
  bindingDigest: `sha256:${'d'.repeat(64)}`,
};

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: CONSUMER_ID,
    kind: { ...E2_KIND },
    requiredSemanticContracts: [{ ...SEM_A }],
    requiredCapabilities: [{ ...CAP_A }],
    semanticBody: { note: 'e2 consumer' },
  };
}

function toolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: TOOL_ID,
    kind: { ...E2_KIND },
    requiredSemanticContracts: [{ ...SEM_A }],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        {
          operationId: OP_QUERY,
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'none',
        },
        {
          operationId: OP_MUTATE,
          inputSchema: { type: 'object' },
          outputSchema: {},
          effect: 'non-idempotent',
        },
      ],
      providesCapabilities: [{ ...CAP_A }],
    },
  };
}

/** The frozen neutral Definition graph e2.tool.definition.v1. */
function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e2.tool.v1',
    components: [consumer(), toolComponent()],
    relations: [],
  };
}

/** A drifted graph: one unrelated component added (same Tool identity). */
function driftedGraph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e2.tool.v1',
    components: [
      consumer(),
      toolComponent(),
      {
        family: 'semantic',
        componentId: 'observer.e2.unrelated',
        kind: { ...E2_KIND },
        requiredSemanticContracts: [{ ...SEM_A }],
        requiredCapabilities: [],
        semanticBody: { note: 'unrelated drift' },
      },
    ],
    relations: [],
  };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { ...E2_KIND },
      implementation: { ...KIND_PIN },
    },
    understoodSemanticContracts: [{ ...SEM_A }],
    understoodCapabilities: [{ ...CAP_A }],
    validateComponent: () => {},
  };
}

/** The frozen authority-rich base Assembly (kind pin + one unrelated slot). */
function sealInput(): Parameters<typeof sealRuntimeAssembly>[0] {
  return {
    definitionGraph: graph(),
    kindImplementations: [kindBinding()],
    implementationBindingEvidence: [{ ...UNRELATED_SLOT }],
  };
}

async function sealedAssembly(): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(sealInput(), realSha256);
}

function candidate(pin: ToolImplementationIdentity, handle: unknown): ToolImplementationCandidate {
  return {
    implementation: { ...pin },
    supportedOperations: [OP_QUERY, OP_MUTATE],
    handle,
  };
}

async function bindTool(
  assembly: SealedRuntimeAssembly,
  g: DefinitionGraphEnvelope,
  pin: ToolImplementationIdentity,
  handle: unknown,
): Promise<SealedToolImplementationBinding> {
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(
    g,
    { ...CAP_A },
    CONSUMER_ID,
    digest,
    realSha256,
  );
  return bindToolImplementation({
    assembly,
    selection: JSON.parse(JSON.stringify(selection)) as typeof selection,
    currentDefinitionGraph: g,
    implementations: [candidate(pin, handle)],
    sha256: realSha256,
    exactPin: { ...pin },
  });
}

// ---------------------------------------------------------------------------
// Real host: genuine better-sqlite3 SQLite database file backing the Tool
// side effect (production-effect path REAL_HOST_POSTURE=REQUIRED).
// ---------------------------------------------------------------------------

interface E2EffectRow {
  readonly operation_id: string;
  readonly input: string;
  readonly effect_id: string;
}

interface RealHost {
  readonly dir: string;
  readonly dbPath: string;
  readonly db: InstanceType<typeof Database>;
  effectCount(): number;
  effects(): readonly E2EffectRow[];
  close(): void;
}

/** Fresh real SQLite host per cell: zero rows is the pre-call baseline. */
function createRealHost(): RealHost {
  const dir = mkdtempSync(join(tmpdir(), 'e2-tool-host-'));
  const db = new Database(join(dir, 'e2-effects.sqlite'));
  db.exec(
    'CREATE TABLE e2_effect (seq INTEGER PRIMARY KEY AUTOINCREMENT, operation_id TEXT NOT NULL, input TEXT NOT NULL, effect_id TEXT NOT NULL)',
  );
  return {
    dir,
    dbPath: db.name,
    db,
    effectCount(): number {
      return (db.prepare('SELECT COUNT(*) AS n FROM e2_effect').get() as { n: number }).n;
    },
    effects(): readonly E2EffectRow[] {
      return db
        .prepare('SELECT operation_id, input, effect_id FROM e2_effect ORDER BY seq')
        .all() as readonly E2EffectRow[];
    },
    close(): void {
      db.close();
    },
  };
}

// ---------------------------------------------------------------------------
// Governance / admission harness (identical seam to the E3/E9 matrices).
// ---------------------------------------------------------------------------

const WORKFLOW_TARGET = 'orders.e2.mutate';
const OCCURRENCE_TARGET: WorkflowAddress = {
  workflowId: 'orders.e2.mutate',
  instanceKey: 'instance:1',
};
const NOW = '2026-10-07T09:00:00.000Z';
const EFFECT_TYPE = 'effect:e2.mutate';
const INSTANCE_FROZEN = 'orders.e2:instance:1';
const INSTANCE_V2 = 'orders.e2:instance:2';
const INSTANCE_SIM = 'orders.e2:instance:3';
const INSTANCE_MISSING = 'orders.e2:instance:4';

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

  pinCount(): number {
    return this.#pins.size;
  }

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

  async putGovernanceBoundSnapshot(snapshot: { readonly workflowInstanceId: string }): Promise<void> {
    this.#snapshots.set(snapshot.workflowInstanceId, snapshot);
  }
}

interface GovernanceHarness {
  readonly binding: DomainActivationBinding;
  readonly activator: AssemblyExecutionActivator;
  readonly store: MemoryDurableExecutionStore;
  readonly coordinator: GovernanceExecutionCoordinator;
  readonly baselines: MemoryGovernanceBaselineStore;
  readonly packageCdi: MemoryExactPackageCdiAuthority;
}

async function governanceHarness(): Promise<GovernanceHarness> {
  const baseline: GovernanceBaselineBody = await createGovernanceBaselineBody(
    {
      domainId: 'orders',
      governanceId: 'orders-governance',
      schemaVersion: '1',
      version: 'e2',
      semantics: { hardInvariants: [], operatorAuthority: 'e2' },
    },
    realSha256,
  );
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(baseline);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-e2',
    domainIntelligenceContentDigest: 'cdi-orders-e2',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, realSha256);
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);
  return {
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-e2',
      domainIntelligenceContentDigest: 'cdi-orders-e2',
      governanceBaseline: baseline.identity,
    },
    activator,
    store,
    coordinator,
    baselines,
    packageCdi,
  };
}

function workflowDefinition(): DomainWorkflowDefinition {
  return {
    workflowKey: 'e2-mutate',
    initialState: 'review',
    initialContext: {},
    guards: [
      {
        guardId: 'guard:amount-ok',
        predicate: {
          op: 'lte',
          left: { source: 'event', path: ['payload', 'amount'] },
          right: { source: 'literal', value: 1000 },
        },
      },
    ],
    states: [
      {
        stateKey: 'review',
        transitions: [
          {
            transitionKey: 'mutate',
            trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
            targetState: 'mutated',
            guardId: 'guard:amount-ok',
            effectIntents: [
              { effectType: EFFECT_TYPE, input: { amount: 42 }, idempotencyKey: 'e2:1' },
            ],
          },
        ],
      },
      { stateKey: 'mutated', kind: 'final' },
    ],
  };
}

function resolvedFrom(
  source: DecisionResolverSource,
  structuredDecision: JsonValue,
): ResolvedDecision<JsonValue> {
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

const ADMIT_ALL: ToolExposureAdmissionPolicy = { decideAdmission: () => ({ admitted: true }) };

function caller(): InvocationCallerContext {
  return { callerId: 'caller.e2.session-1', callerKind: 'workflow' };
}

// ---------------------------------------------------------------------------
// Frozen identity block (F-01 pre-execution freeze, asserted live below).
// ---------------------------------------------------------------------------

const FROZEN = {
  // Digest values are the exact live seam formats (bare lowercase hex);
  // the `sha256:` label prefix used in the #887 freeze comment is
  // presentational (see LIMITS L4).
  DEFINITION_GRAPH_DIGEST:
    '8c4b4c2be2622c1f1649d033f42dba27d761f463f3d9b15af00e4486dd336331',
  BASE_ASSEMBLY_DIGEST:
    '36decff3ea51ad88639c82fdf5f82020c4c6074a4bbbe007faa92c248f43d1eb',
  BINDING_DIGEST_V1:
    '1fa3b13645e443a758acf8a90d3b4f589d6539b670acfffc6b9729fbf52fd7fd',
  SUCCESSOR_ASSEMBLY_DIGEST_V1:
    'f5ef1147d3503d42be9dd5526df2dea6f5a4fdd41d2427e2b3a0561df67288b5',
  BINDING_DIGEST_V2:
    '79b08edde21682d3a8b922f5a23a88b77e836a559ce95be8ed5201ccf980e2c5',
  SUCCESSOR_ASSEMBLY_DIGEST_V2:
    'c7d0f584b2a29a22199531c4d8cc1548f5c369689b5fd0a401c0abfbf482ca7d',
  OCCURRENCE_BINDING_DIGEST:
    '5e8623db9c48ac2d541dce2e110311926cba79582242ce07fa85d9fdce69387c',
} as const;

interface FrozenFixture {
  readonly g: DefinitionGraphEnvelope;
  readonly definitionGraphDigest: string;
  readonly baseAssembly: SealedRuntimeAssembly;
  readonly baseAssemblyDigest: string;
  readonly bindingV1: SealedToolImplementationBinding;
  readonly bindingDigestV1: string;
  readonly successorAssemblyDigestV1: string;
  readonly handleV1: unknown;
  readonly bindingV2: SealedToolImplementationBinding;
  readonly bindingDigestV2: string;
  readonly successorAssemblyDigestV2: string;
  readonly kindPin: KindImplementationBindingInput['pin'];
  readonly unrelatedSlot: readonly AssemblyImplementationBindingEvidence[];
  readonly matrixDigest: string;
  readonly permutationDigest: string;
}

let frozenPromise: Promise<FrozenFixture> | undefined;

/** Identity capture preflight (part of the freeze, NOT an evidence result). */
async function freezeFixture(): Promise<FrozenFixture> {
  const g = graph();
  const definitionGraphDigest = await computeDefinitionGraphDigest(g, realSha256);
  const baseAssembly = await sealedAssembly();
  const handleV1 = { kind: 'e2-handle', id: 'handle.e2.tool#1' };
  const bindingV1 = await bindTool(baseAssembly, g, TOOL_PIN, handleV1);
  const bindingV2 = await bindTool(
    bindingV1.successorAssembly,
    g,
    TOOL_PIN_V2,
    { kind: 'e2-handle', id: 'handle.e2.tool#2' },
  );

  const matrixDigest = `sha256:${await realSha256.digestUtf8(
    canonicalJsonStringify([...MATRIX_CELLS].sort()),
  )}`;
  const permutationDigest = `sha256:${await realSha256.digestUtf8(
    canonicalJsonStringify({
      ambiguousPair: [ALT_PIN.implementationId, TOOL_PIN.implementationId].sort(),
      orders: ['forward', 'reversed'],
    }),
  )}`;

  const frozen: FrozenFixture = {
    g,
    definitionGraphDigest,
    baseAssembly,
    baseAssemblyDigest: baseAssembly.assemblyDigest,
    bindingV1,
    bindingDigestV1: bindingV1.evidence.bindingDigest,
    successorAssemblyDigestV1: bindingV1.successorAssembly.assemblyDigest,
    handleV1,
    bindingV2,
    bindingDigestV2: bindingV2.evidence.bindingDigest,
    successorAssemblyDigestV2: bindingV2.successorAssembly.assemblyDigest,
    kindPin: baseAssembly.record.kindImplementations[0]!,
    unrelatedSlot: baseAssembly.record.implementationBindingEvidence,
    matrixDigest,
    permutationDigest,
  };

  // The frozen identities were captured pre-execution through the accepted
  // seams; the live construction MUST reproduce them byte-exactly.
  assert.equal(definitionGraphDigest, FROZEN.DEFINITION_GRAPH_DIGEST);
  assert.equal(baseAssembly.assemblyDigest, FROZEN.BASE_ASSEMBLY_DIGEST);
  assert.equal(bindingV1.evidence.bindingDigest, FROZEN.BINDING_DIGEST_V1);
  assert.equal(bindingV1.successorAssembly.assemblyDigest, FROZEN.SUCCESSOR_ASSEMBLY_DIGEST_V1);
  assert.equal(bindingV2.evidence.bindingDigest, FROZEN.BINDING_DIGEST_V2);
  assert.equal(bindingV2.successorAssembly.assemblyDigest, FROZEN.SUCCESSOR_ASSEMBLY_DIGEST_V2);

  // The V2 reseal proves Definition identity is unchanged while Assembly
  // identity splits (F-03 fidelity baseline: the unrelated T002B slot and the
  // exact KindImplementation pin are preserved byte-exact across the rebind
  // chain; the ONLY attributable delta is the tool.e2 subject slot moving
  // from BINDING_DIGEST_V1 to BINDING_DIGEST_V2).
  assert.equal(bindingV2.successorAssembly.record.definitionGraphDigest, definitionGraphDigest);
  assert.deepEqual(bindingV2.successorAssembly.record.kindImplementations, [frozen.kindPin]);
  for (const slot of frozen.unrelatedSlot) {
    assert.ok(
      bindingV2.successorAssembly.record.implementationBindingEvidence.some(
        (candidate) =>
          candidate.subject === slot.subject && candidate.bindingDigest === slot.bindingDigest,
      ),
      'the unrelated implementation-binding evidence slot is preserved byte-exact across the V2 reseal',
    );
  }
  assert.ok(
    bindingV2.successorAssembly.record.implementationBindingEvidence.some(
      (candidate) =>
        candidate.subject === TOOL_ID && candidate.bindingDigest === frozen.bindingDigestV2,
    ),
    'the tool.e2 subject slot carries the V2 binding digest after the rebind',
  );
  assert.equal(
    bindingV2.successorAssembly.record.implementationBindingEvidence.filter(
      (candidate) => candidate.subject === TOOL_ID,
    ).length,
    1,
    'exactly one current tool.e2 subject slot exists — the replaced slot is history, not authority',
  );

  console.log(
    'E2_FIXTURE_IDENTITIES ' +
      JSON.stringify({
        manifestId: MANIFEST.MANIFEST_ID,
        manifestVersion: MANIFEST.MANIFEST_VERSION,
        definitionFixture: MANIFEST.DEFINITION_FIXTURE,
        definitionGraphDigest: frozen.definitionGraphDigest,
        baseAssemblyDigest: frozen.baseAssemblyDigest,
        bindingDigestV1: frozen.bindingDigestV1,
        successorAssemblyDigestV1: frozen.successorAssemblyDigestV1,
        bindingDigestV2: frozen.bindingDigestV2,
        successorAssemblyDigestV2: frozen.successorAssemblyDigestV2,
        kindImplementationPin: frozen.kindPin,
        unrelatedBindingSlot: frozen.unrelatedSlot,
        matrixDigest: frozen.matrixDigest,
        permutationDigest: frozen.permutationDigest,
      }),
  );
  return frozen;
}

function frozen(): Promise<FrozenFixture> {
  frozenPromise ??= freezeFixture();
  return frozenPromise;
}

// ---------------------------------------------------------------------------
// Shared per-cell helpers.
// ---------------------------------------------------------------------------

async function admitExposure(
  fx: FrozenFixture,
  operationId: string,
  forCaller: InvocationCallerContext = caller(),
) {
  return admitToolExposure(
    {
      toolComponentId: TOOL_ID,
      operationId,
      caller: forCaller,
      assembly: fx.bindingV1.successorAssembly,
      currentDefinitionGraph: fx.g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
}

async function admittedRequest(
  fx: FrozenFixture,
  operationId: string,
  forCaller: InvocationCallerContext = caller(),
): Promise<AdmittedToolInvocationRequest> {
  const exposure = await admitExposure(fx, operationId, forCaller);
  return admitToolInvocationRequest(
    {
      toolComponentId: TOOL_ID,
      operationId,
      input: { amount: 42 },
      caller: forCaller,
      definitionGraphDigest: fx.bindingV1.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: fx.successorAssemblyDigestV1,
      exposure,
    },
    { assembly: fx.bindingV1.successorAssembly, currentDefinitionGraph: fx.g },
    realSha256,
  );
}

/** Real-host dispatch: the host invokes its own opaque handle (the handle is
 *  opaque — the host closure holds the live SQLite connection). The effectful
 *  operation performs a genuine write; the effect=none operation never
 *  touches the store. When `expectedHandle` is given, the dispatch asserts it
 *  received the exact verifier-paired opaque handle reference. */
function realHostDispatch(
  host: RealHost,
  calls: unknown[],
  expectedHandle?: unknown,
): EffectfulToolDispatchPort & NonEffectfulToolDispatchPort {
  const dispatch = async (query: EffectfulToolDispatchQuery | NonEffectfulToolDispatchQuery): Promise<unknown> => {
    calls.push(query);
    if (expectedHandle !== undefined) {
      assert.ok(
        Object.is(query.handle, expectedHandle),
        'the dispatched handle is the exact T003C-verifier-paired opaque handle',
      );
    }
    if (query.operationId === OP_MUTATE) {
      host.db
        .prepare('INSERT INTO e2_effect (operation_id, input, effect_id) VALUES (?, ?, ?)')
        .run(query.operationId, canonicalJsonStringify(query.input), (query as EffectfulToolDispatchQuery).effectId ?? '');
      return { effected: true, amount: (query.input as { amount: number }).amount };
    }
    // The effect=none Tool fabricates an authoritative-LOOKING payload; it is
    // observational only (asserted by the matrix cells).
    return { state: 'DONE', balance: 999, occurrence: 'forged-occurrence-e2' };
  };
  return { dispatch };
}

interface EffectfulCell {
  readonly input: InvokeEffectfulToolInput;
  readonly journal: VolatileAdmissionEffectJournal;
  readonly gov: GovernanceHarness;
}

async function effectfulCell(
  fx: FrozenFixture,
  instanceId: string,
  dispatch: EffectfulToolDispatchPort,
  binding: SealedToolImplementationBinding = fx.bindingV1,
): Promise<EffectfulCell> {
  const admitted = await admittedRequest(fx, OP_MUTATE);
  const gov = await governanceHarness();
  const journal = new VolatileAdmissionEffectJournal();
  const admissionPorts: Omit<EffectfulAdmissionPorts, 'sha256' | 'effectTools'> = {
    governance: gov.coordinator,
    baselines: gov.baselines,
    effectJournal: journal,
  };
  const admissionRequest: CentralAdmissionRequest = {
    target: { ...OCCURRENCE_TARGET },
    turn: { kind: 'message', sourceMessageId: 'msg:1' },
    trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
    workflowInstanceId: instanceId,
    definition: workflowDefinition(),
    currentStateKey: 'review',
    context: {},
    event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
    resolved: resolvedFrom('harness-machine', {
      decision: { outcome: 'mutate', data: { amount: 42 } },
      event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
    }),
    decisionSchema,
    now: NOW,
  };
  return {
    journal,
    gov,
    input: {
      request: admitted,
      binding,
      currentDefinitionGraph: fx.g,
      activator: gov.activator,
      admissionRequest,
      admissionPorts,
      effectType: EFFECT_TYPE,
      dispatch,
      sha256: realSha256,
    },
  };
}

function expectNonEffectfulError(
  promise: Promise<unknown>,
  code: NonEffectfulInvocationError['code'],
): Promise<NonEffectfulInvocationError> {
  return promise.then(
    () => {
      throw new Error(`expected NonEffectfulInvocationError(${code}), but invocation resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof NonEffectfulInvocationError,
        `expected NonEffectfulInvocationError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

function expectEffectfulError(
  promise: Promise<unknown>,
  code: EffectfulInvocationError['code'],
): Promise<EffectfulInvocationError> {
  return promise.then(
    () => {
      throw new Error(`expected EffectfulInvocationError(${code}), but invocation resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof EffectfulInvocationError,
        `expected EffectfulInvocationError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

function expectInvocationRequestError(
  promise: Promise<unknown>,
  code: InvocationRequestError['code'],
): Promise<InvocationRequestError> {
  return promise.then(
    () => {
      throw new Error(`expected InvocationRequestError(${code}), but admission resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof InvocationRequestError,
        `expected InvocationRequestError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

function expectBindingError(
  promise: Promise<unknown>,
  code: ToolImplementationBindingError['code'],
): Promise<ToolImplementationBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected ToolImplementationBindingError(${code}), but binding resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof ToolImplementationBindingError,
        `expected ToolImplementationBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

function expectGovernanceError(
  promise: Promise<unknown>,
  code: GovernanceExecutionBindingError['code'],
): Promise<GovernanceExecutionBindingError> {
  return promise.then(
    () => {
      throw new Error(`expected GovernanceExecutionBindingError(${code}), but governance resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof GovernanceExecutionBindingError,
        `expected GovernanceExecutionBindingError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
}

function assertZeroDispatchZeroJournalZeroEffect(
  calls: readonly unknown[],
  journal: VolatileAdmissionEffectJournal | undefined,
  host: RealHost | undefined,
  store?: MemoryDurableExecutionStore,
): void {
  assert.equal(calls.length, 0, 'zero Tool dispatch before the call/effect boundary');
  if (journal !== undefined) {
    assert.equal(journal.getRecords().length, 0, 'zero durable journal record');
  }
  if (host !== undefined) {
    assert.equal(host.effectCount(), 0, 'zero real-host effect write');
  }
  if (store !== undefined) {
    assert.equal(store.pinCount(), 0, 'zero governance occurrence pins minted');
  }
}

// ---------------------------------------------------------------------------
// Matrix cell 1: effect=none via T004B — observational, zero authority gained.
// ---------------------------------------------------------------------------

test('E2 effect-none-t004b: effect=none invocation dispatches through T004B and gains no transition/business authority', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const calls: unknown[] = [];
    const admitted = await admittedRequest(fx, OP_QUERY);

    const result = await invokeNonEffectfulTool({
      request: admitted,
      binding: fx.bindingV1,
      currentDefinitionGraph: fx.g,
      dispatch: realHostDispatch(host, calls, fx.handleV1),
      sha256: realSha256,
    });

    // OBSERVED-only result: identity + portable output, nothing authority-
    // bearing is representable on the result shape.
    assert.equal(result.status, 'OBSERVED');
    assert.deepEqual(Object.keys(result).sort(), [
      'assemblyDigest',
      'bindingDigest',
      'definitionGraphDigest',
      'implementation',
      'operationId',
      'output',
      'status',
      'toolComponentId',
    ]);
    assert.equal(result.toolComponentId, TOOL_ID);
    assert.equal(result.operationId, OP_QUERY);
    assert.deepEqual(result.implementation, TOOL_PIN);
    assert.equal(result.bindingDigest, FROZEN.BINDING_DIGEST_V1);
    assert.equal(result.definitionGraphDigest, FROZEN.DEFINITION_GRAPH_DIGEST);
    assert.equal(result.assemblyDigest, FROZEN.SUCCESSOR_ASSEMBLY_DIGEST_V1);

    // The dispatch query is authority-free: no caller, no effect identity, no
    // journal/occurrence material — exactly {handle, operationId, input, resources}.
    assert.equal(calls.length, 1);
    const query = calls[0] as NonEffectfulToolDispatchQuery;
    assert.deepEqual(Object.keys(query).sort(), ['handle', 'input', 'operationId', 'resources']);
    assert.equal(query.operationId, OP_QUERY);
    assert.deepEqual(query.input, { amount: 42 });
    assert.equal(query.resources.size, 0, 'no resource requirements on the frozen fixture');

    // ZERO authority gained: no durable effect row, and the seam cannot even
    // express a journal/activator (structurally rejected, typed).
    assert.equal(host.effectCount(), 0, 'effect=none leaves the real host store untouched');
    await expectNonEffectfulError(
      invokeNonEffectfulTool({
        request: admitted,
        binding: fx.bindingV1,
        currentDefinitionGraph: fx.g,
        dispatch: realHostDispatch(host, []),
        // @ts-expect-error authority material is not representable on T004B
        effectJournal: new VolatileAdmissionEffectJournal(),
        sha256: realSha256,
      }),
      'INVALID_INVOCATION_INPUT',
    );
    await expectNonEffectfulError(
      invokeNonEffectfulTool({
        request: admitted,
        binding: fx.bindingV1,
        currentDefinitionGraph: fx.g,
        dispatch: realHostDispatch(host, []),
        // @ts-expect-error authority material is not representable on T004B
        activator: (await governanceHarness()).activator,
        sha256: realSha256,
      }),
      'INVALID_INVOCATION_INPUT',
    );
    assert.equal(host.effectCount(), 0);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

test('E2 effect-none-t004b: the T004B module imports no transition/journal/occurrence authority (executable import-graph proof)', () => {
  const seamPath = new URL('../../src/contracts/non-effectful-invocation.ts', import.meta.url);
  const source = readFileSync(seamPath, 'utf8');
  const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] as string);
  for (const authorityModule of [
    '../admission',
    '../governance',
    '../engine',
    '../workflow',
    'xstate',
    '../execution',
    '../instance',
  ]) {
    for (const specifier of specifiers) {
      assert.ok(
        !specifier.includes(authorityModule),
        `T004B seam must not import "${authorityModule}" (saw: ${specifiers.join(', ')})`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Matrix cell 2: effectful via T004C — existing authoritative occurrence +
// Central Admission, ONE effect authority, real host effect.
// ---------------------------------------------------------------------------

test('E2 effectful-t004c: effectful invocation requires an existing authoritative occurrence and executes exactly one durable effect on the real host', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const admitted = await admittedRequest(fx, OP_MUTATE);
    const gov = await governanceHarness();
    const pin = await gov.activator.activate({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: INSTANCE_FROZEN,
      binding: gov.binding,
      assembly: fx.bindingV1.successorAssembly,
      authorityClass: 'PRODUCTION',
      currentDefinitionGraph: fx.g,
    });
    // The activated pin IS the frozen occurrence identity.
    assert.equal(pin.bindingDigest, FROZEN.OCCURRENCE_BINDING_DIGEST);
    assert.equal(pin.assemblyDigest, FROZEN.SUCCESSOR_ASSEMBLY_DIGEST_V1);
    assert.equal(pin.authorityClass, 'PRODUCTION');

    const journal = new VolatileAdmissionEffectJournal();
    const calls: unknown[] = [];
    const result = await invokeEffectfulTool({
      request: admitted,
      binding: fx.bindingV1,
      currentDefinitionGraph: fx.g,
      activator: gov.activator,
      admissionRequest: {
        target: { ...OCCURRENCE_TARGET },
        turn: { kind: 'message', sourceMessageId: 'msg:1' },
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        workflowInstanceId: INSTANCE_FROZEN,
        definition: workflowDefinition(),
        currentStateKey: 'review',
        context: {},
        event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
        resolved: resolvedFrom('harness-machine', {
          decision: { outcome: 'mutate', data: { amount: 42 } },
          event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
        }),
        decisionSchema,
        now: NOW,
      },
      admissionPorts: {
        governance: gov.coordinator,
        baselines: gov.baselines,
        effectJournal: journal,
      },
      effectType: EFFECT_TYPE,
      dispatch: realHostDispatch(host, calls, fx.handleV1),
      sha256: realSha256,
    });

    assert.equal(result.outcome.status, 'admitted');
    assert.equal(calls.length, 1);
    const query = calls[0] as EffectfulToolDispatchQuery;
    // The dispatch carries the durable effect identity derived by Central
    // Admission — never caller-minted.
    assert.equal(query.operationId, OP_MUTATE);
    assert.deepEqual(query.input, { amount: 42 });
    assert.equal(query.effectType, EFFECT_TYPE);
    assert.equal(typeof query.effectId, 'string');
    assert.ok(query.effectId.length > 0);
    assert.equal(typeof query.durableControlTurnId, 'string');
    assert.equal(query.operationOrdinal, 1, 'the single journaled effect intent is ordinal 1 in the durable turn');
    assert.equal(typeof query.logicalTime, 'string');

    // Exactly ONE durable journal record through the ONE existing authority.
    const records = journal.getRecords();
    assert.equal(records.length, 1);
    assert.equal(records[0]!.effectType, EFFECT_TYPE);

    // The real host side effect executed exactly once with the journaled input.
    assert.equal(host.effectCount(), 1);
    assert.deepEqual(host.effects(), [
      {
        operation_id: OP_MUTATE,
        input: canonicalJsonStringify({ amount: 42 }),
        effect_id: query.effectId,
      },
    ]);

    // Exact occurrence + invocation identity on the result (audit only).
    assert.equal(result.occurrence.workflowInstanceId, INSTANCE_FROZEN);
    assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
    assert.equal(result.occurrence.pinBindingDigest, FROZEN.OCCURRENCE_BINDING_DIGEST);
    assert.equal(result.occurrence.assemblyDigest, FROZEN.SUCCESSOR_ASSEMBLY_DIGEST_V1);
    assert.deepEqual(result.invocation.implementation, TOOL_PIN);
    assert.equal(result.invocation.bindingDigest, FROZEN.BINDING_DIGEST_V1);
    assert.equal(result.invocation.definitionGraphDigest, FROZEN.DEFINITION_GRAPH_DIGEST);
    assert.equal(result.invocation.effectType, EFFECT_TYPE);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Matrix cells 3/4: invocation-class gates fail closed before call/effect.
// ---------------------------------------------------------------------------

test('E2 effectful-through-t004b: an effectful operation can never use the effect=none path', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const admitted = await admittedRequest(fx, OP_MUTATE);
    const calls: unknown[] = [];
    const error = await expectNonEffectfulError(
      invokeNonEffectfulTool({
        request: admitted,
        binding: fx.bindingV1,
        currentDefinitionGraph: fx.g,
        dispatch: realHostDispatch(host, calls),
        sha256: realSha256,
      }),
      'EFFECTFUL_OPERATION_REJECTED',
    );
    assert.ok(error.message.includes(OP_MUTATE));
    assertZeroDispatchZeroJournalZeroEffect(calls, undefined, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

test('E2 effectless-through-t004c: an effect=none operation can never use the effectful path (zero journal)', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    // Admit the effect=none operation through T004A, then attempt the T004C
    // route against an activated occurrence.
    const exposure = await admitExposure(fx, OP_QUERY);
    const request = await admitToolInvocationRequest(
      {
        toolComponentId: TOOL_ID,
        operationId: OP_QUERY,
        input: { amount: 42 },
        caller: caller(),
        definitionGraphDigest: fx.definitionGraphDigest,
        assemblyDigest: fx.successorAssemblyDigestV1,
        exposure,
      },
      { assembly: fx.bindingV1.successorAssembly, currentDefinitionGraph: fx.g },
      realSha256,
    );
    const gov = await governanceHarness();
    await gov.activator.activate({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: INSTANCE_V2,
      binding: gov.binding,
      assembly: fx.bindingV1.successorAssembly,
      authorityClass: 'PRODUCTION',
      currentDefinitionGraph: fx.g,
    });
    const journal = new VolatileAdmissionEffectJournal();
    const calls: unknown[] = [];
    const error = await expectEffectfulError(
      invokeEffectfulTool({
        request,
        binding: fx.bindingV1,
        currentDefinitionGraph: fx.g,
        activator: gov.activator,
        admissionRequest: {
          target: { ...OCCURRENCE_TARGET },
          turn: { kind: 'message', sourceMessageId: 'msg:1' },
          trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
          workflowInstanceId: INSTANCE_V2,
          definition: workflowDefinition(),
          currentStateKey: 'review',
          context: {},
          event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
          resolved: resolvedFrom('harness-machine', {
            decision: { outcome: 'mutate', data: { amount: 42 } },
            event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
          }),
          decisionSchema,
          now: NOW,
        },
        admissionPorts: {
          governance: gov.coordinator,
          baselines: gov.baselines,
          effectJournal: journal,
        },
        effectType: EFFECT_TYPE,
        dispatch: realHostDispatch(host, calls),
        sha256: realSha256,
      }),
      'EFFECTLESS_OPERATION_REJECTED',
    );
    assert.ok(error.message.includes(OP_QUERY));
    assertZeroDispatchZeroJournalZeroEffect(calls, journal, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Matrix cells 5/6/7: occurrence authority gates on the effectful route.
// ---------------------------------------------------------------------------

test('E2 effectful-no-occurrence: an effectful invocation without an existing authoritative occurrence fails closed before any effect', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const calls: unknown[] = [];
    const cell = await effectfulCell(fx, INSTANCE_MISSING, realHostDispatch(host, calls));
    await expectGovernanceError(invokeEffectfulTool(cell.input), 'GOVERNANCE_EXECUTION_PIN_MISSING');
    assertZeroDispatchZeroJournalZeroEffect(calls, cell.journal, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

test('E2 effectful-simulation-occurrence: a SIMULATION-class occurrence never mints production effect authority', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const calls: unknown[] = [];
    const cell = await effectfulCell(fx, INSTANCE_SIM, realHostDispatch(host, calls));
    await cell.gov.activator.activate({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: INSTANCE_SIM,
      binding: cell.gov.binding,
      assembly: fx.bindingV1.successorAssembly,
      authorityClass: 'SIMULATION',
      currentDefinitionGraph: fx.g,
    });
    await expectGovernanceError(invokeEffectfulTool(cell.input), 'AUTHORITY_CLASS_MISMATCH');
    assertZeroDispatchZeroJournalZeroEffect(calls, cell.journal, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

test('E2 occurrence-assembly-mismatch: an occurrence pinned to a predecessor Assembly never rides a replaced Assembly', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    // Occurrence activated on the V1 final Assembly; the invocation is
    // admitted against the V2 successor (same Definition identity, replaced
    // implementation pin).
    const calls: unknown[] = [];
    const cell = await effectfulCell(fx, INSTANCE_FROZEN, realHostDispatch(host, calls), fx.bindingV2);
    await cell.gov.activator.activate({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: INSTANCE_FROZEN,
      binding: cell.gov.binding,
      assembly: fx.bindingV1.successorAssembly,
      authorityClass: 'PRODUCTION',
      currentDefinitionGraph: fx.g,
    });
    // The request inside the cell was admitted against V1; re-admit against V2.
    const exposureV2 = await admitToolExposure(
      {
        toolComponentId: TOOL_ID,
        operationId: OP_MUTATE,
        caller: caller(),
        assembly: fx.bindingV2.successorAssembly,
        currentDefinitionGraph: fx.g,
        policy: ADMIT_ALL,
      },
      realSha256,
    );
    const requestV2 = await admitToolInvocationRequest(
      {
        toolComponentId: TOOL_ID,
        operationId: OP_MUTATE,
        input: { amount: 42 },
        caller: caller(),
        definitionGraphDigest: fx.definitionGraphDigest,
        assemblyDigest: fx.successorAssemblyDigestV2,
        exposure: exposureV2,
      },
      { assembly: fx.bindingV2.successorAssembly, currentDefinitionGraph: fx.g },
      realSha256,
    );
    const error = await expectEffectfulError(
      invokeEffectfulTool({ ...cell.input, request: requestV2 }),
      'OCCURRENCE_ASSEMBLY_MISMATCH',
    );
    assert.ok(error.message.includes(INSTANCE_FROZEN));
    assertZeroDispatchZeroJournalZeroEffect(calls, cell.journal, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Matrix cells 8/9/10/11: stale/mismatched Assembly, Definition and caller
// exposure fail closed before any Tool call.
// ---------------------------------------------------------------------------

test('E2 stale-definition: a drifted current Definition graph fails closed at re-admission before dispatch', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const admitted = await admittedRequest(fx, OP_QUERY);
    const calls: unknown[] = [];
    let seen: unknown;
    try {
      await invokeNonEffectfulTool({
        request: admitted,
        binding: fx.bindingV1,
        currentDefinitionGraph: driftedGraph(),
        dispatch: realHostDispatch(host, calls),
        sha256: realSha256,
      });
    } catch (error) {
      seen = error;
    }
    // The T004A owner-seam typed failure propagates unchanged through T004B.
    assert.ok(seen instanceof InvocationRequestError, `expected InvocationRequestError, got ${String(seen)}`);
    assert.equal((seen as InvocationRequestError).code, 'DEFINITION_CURRENTNESS_MISMATCH');
    assertZeroDispatchZeroJournalZeroEffect(calls, undefined, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

test('E2 tampered-request-assembly-digest: a stale/mismatched Assembly claim fails closed before dispatch', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const admitted = await admittedRequest(fx, OP_QUERY);
    // Byte-level tamper: the request claims the V2 Assembly digest while the
    // dispatch anchor is V1 (same Definition identity — isolates the Assembly
    // currentness gate).
    const tampered = {
      ...admitted,
      assemblyDigest: fx.successorAssemblyDigestV2,
      exposure: admitted.exposure,
    } as AdmittedToolInvocationRequest;
    const calls: unknown[] = [];
    let seen: unknown;
    try {
      await invokeNonEffectfulTool({
        request: tampered,
        binding: fx.bindingV1,
        currentDefinitionGraph: fx.g,
        dispatch: realHostDispatch(host, calls),
        sha256: realSha256,
      });
    } catch (error) {
      seen = error;
    }
    assert.ok(seen instanceof InvocationRequestError, `expected InvocationRequestError, got ${String(seen)}`);
    assert.equal((seen as InvocationRequestError).code, 'ASSEMBLY_CURRENTNESS_MISMATCH');
    assertZeroDispatchZeroJournalZeroEffect(calls, undefined, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

test('E2 forged-exposure-evidence: caller-constructed exposure evidence can never carry mint authority', async () => {
  const fx = await frozen();
  const genuine = await admitExposure(fx, OP_QUERY);
  // Byte-perfect content copy — no mint registry membership.
  const forged = JSON.parse(JSON.stringify(genuine)) as typeof genuine;

  let seen: unknown;
  try {
    await admitToolInvocationRequest(
      {
        toolComponentId: TOOL_ID,
        operationId: OP_QUERY,
        input: { amount: 42 },
        caller: caller(),
        definitionGraphDigest: fx.definitionGraphDigest,
        assemblyDigest: fx.successorAssemblyDigestV1,
        exposure: forged,
      },
      { assembly: fx.bindingV1.successorAssembly, currentDefinitionGraph: fx.g },
      realSha256,
    );
  } catch (error) {
    seen = error;
  }
  assert.ok(seen instanceof InvocationRequestError, `expected InvocationRequestError, got ${String(seen)}`);
  assert.equal((seen as InvocationRequestError).code, 'FORGED_EXPOSURE_EVIDENCE');

  // The same forged evidence propagates unchanged when smuggled through the
  // invocation seam — still zero dispatch.
  const host = createRealHost();
  try {
    const calls: unknown[] = [];
    const admitted = await admittedRequest(fx, OP_QUERY);
    const smuggled = { ...admitted, exposure: forged } as AdmittedToolInvocationRequest;
    let seen2: unknown;
    try {
      await invokeNonEffectfulTool({
        request: smuggled,
        binding: fx.bindingV1,
        currentDefinitionGraph: fx.g,
        dispatch: realHostDispatch(host, calls),
        sha256: realSha256,
      });
    } catch (error) {
      seen2 = error;
    }
    assert.ok(
      seen2 instanceof InvocationRequestError,
      `expected InvocationRequestError, got ${String(seen2)}`,
    );
    assert.equal((seen2 as InvocationRequestError).code, 'FORGED_EXPOSURE_EVIDENCE');
    assertZeroDispatchZeroJournalZeroEffect(calls, undefined, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

test('E2 stale-exposure-caller: exposure minted for another caller cannot be ridden', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const foreignCaller: InvocationCallerContext = { callerId: 'caller.e2.foreign', callerKind: 'agent' };
    await expectInvocationRequestError(
      admitToolInvocationRequest(
        {
          toolComponentId: TOOL_ID,
          operationId: OP_QUERY,
          input: { amount: 42 },
          caller: foreignCaller,
          definitionGraphDigest: fx.definitionGraphDigest,
          assemblyDigest: fx.successorAssemblyDigestV1,
          // Genuine exposure minted for the ORIGINAL caller.
          exposure: await admitExposure(fx, OP_QUERY),
        },
        { assembly: fx.bindingV1.successorAssembly, currentDefinitionGraph: fx.g },
        realSha256,
      ),
      'INVOCATION_CALLER_MISMATCH',
    );
    assert.equal(host.effectCount(), 0);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Matrix cells 12/13/14: exact T003C binding evidence/currentness honored.
// ---------------------------------------------------------------------------

test('E2 unminted-binding-lookalike: a field-copied binding can never carry binding authority (T004B and T004C)', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    // The lookalike keeps a GENUINE successor-Assembly reference (provenance
    // passes) but is not a mint registry member — the T003C verifier is the
    // first binding gate on both invocation classes.
    const lookalike = {
      evidence: JSON.parse(JSON.stringify(fx.bindingV1.evidence)),
      successorAssembly: fx.bindingV1.successorAssembly,
      implementationHandle: { kind: 'forged-handle' },
    };
    const admitted = await admittedRequest(fx, OP_QUERY);
    const calls: unknown[] = [];
    let seen: unknown;
    try {
      await invokeNonEffectfulTool({
        request: admitted,
        // @ts-expect-error the lookalike is not a SealedToolImplementationBinding
        binding: lookalike,
        currentDefinitionGraph: fx.g,
        dispatch: realHostDispatch(host, calls),
        sha256: realSha256,
      });
    } catch (error) {
      seen = error;
    }
    assert.ok(
      seen instanceof ToolImplementationBindingError,
      `expected ToolImplementationBindingError, got ${String(seen)}`,
    );
    assert.equal((seen as ToolImplementationBindingError).code, 'UNMINTED_TOOL_IMPLEMENTATION_BINDING');
    assertZeroDispatchZeroJournalZeroEffect(calls, undefined, host);

    // Same lookalike on the effectful route: zero dispatch, zero journal.
    const calls2: unknown[] = [];
    const cell = await effectfulCell(fx, INSTANCE_MISSING, realHostDispatch(host, calls2));
    let seen2: unknown;
    try {
      await invokeEffectfulTool({ ...cell.input, binding: lookalike as SealedToolImplementationBinding });
    } catch (error) {
      seen2 = error;
    }
    assert.ok(
      seen2 instanceof ToolImplementationBindingError,
      `expected ToolImplementationBindingError, got ${String(seen2)}`,
    );
    assert.equal((seen2 as ToolImplementationBindingError).code, 'UNMINTED_TOOL_IMPLEMENTATION_BINDING');
    assertZeroDispatchZeroJournalZeroEffect(calls2, cell.journal, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

test('E2 tampered-binding-evidence / stale-binding-assembly: exact pin and subject-slot currentness are honored at the T003C verifier', async () => {
  const fx = await frozen();
  // (a) A consumer-supplied exact pin that differs in version/digest fails
  //     closed — the pin is never resolved against candidates or recency.
  const pinError = await expectBindingError(
    verifyToolImplementationBinding({
      binding: fx.bindingV1,
      finalAssembly: fx.bindingV1.successorAssembly,
      expectedImplementationPin: TOOL_PIN_V2,
      sha256: realSha256,
    }),
    'TOOL_IMPLEMENTATION_PIN_MISMATCH',
  );
  assert.ok(pinError.message.includes('impl.e2.tool'));

  // (b) The same genuine binding verified against the V2 successor Assembly
  //     (subject slot replaced by the rebind) is STALE — never reused.
  await expectBindingError(
    verifyToolImplementationBinding({
      binding: fx.bindingV1,
      finalAssembly: fx.bindingV2.successorAssembly,
      sha256: realSha256,
    }),
    'STALE_TOOL_IMPLEMENTATION_BINDING',
  );

  // (c) The positive control: the genuine binding verifies current against
  //     its OWN final Assembly and pairs only now.
  const verified = await verifyToolImplementationBinding({
    binding: fx.bindingV1,
    finalAssembly: fx.bindingV1.successorAssembly,
    expectedImplementationPin: TOOL_PIN,
    sha256: realSha256,
  });
  assert.equal(verified.status, 'VERIFIED_CURRENT');
  assert.deepEqual(verified.evidence.implementation, TOOL_PIN);
  assert.equal(verified.currentness.finalAssemblyDigest, FROZEN.SUCCESSOR_ASSEMBLY_DIGEST_V1);
});

// ---------------------------------------------------------------------------
// Matrix cell 15: ambiguous implementation — candidate-order permutations are
// identical fail-closed outcomes (no first-insertion authority).
// ---------------------------------------------------------------------------

test('E2 ambiguous-implementation-order-permutations: two compatible implementations without an exact pin fail AMBIGUOUS identically under both orders', async () => {
  const fx = await frozen();
  const g = fx.g;
  const digest = await computeDefinitionGraphDigest(g, realSha256);
  const selection = await resolveCurrentCapabilityProvider(g, { ...CAP_A }, CONSUMER_ID, digest, realSha256);
  const forward = [candidate(TOOL_PIN, {}), candidate(ALT_PIN, {})];
  const reversed = [candidate(ALT_PIN, {}), candidate(TOOL_PIN, {})];

  const run = (implementations: readonly ToolImplementationCandidate[]) =>
    bindToolImplementation({
      assembly: fx.baseAssembly,
      selection: JSON.parse(JSON.stringify(selection)) as typeof selection,
      currentDefinitionGraph: g,
      implementations,
      sha256: realSha256,
    });

  const errorForward = await expectBindingError(run(forward), 'AMBIGUOUS_TOOL_IMPLEMENTATION');
  const errorReversed = await expectBindingError(run(reversed), 'AMBIGUOUS_TOOL_IMPLEMENTATION');
  assert.deepEqual(
    [...errorForward.conflictingImplementationIds],
    [...errorReversed.conflictingImplementationIds],
  );
  assert.deepEqual(
    [...errorForward.conflictingImplementationIds].sort(),
    [ALT_PIN.implementationId, TOOL_PIN.implementationId],
  );
  assert.equal(errorForward.message, errorReversed.message, 'permutation-invariant diagnostics');
});

// ---------------------------------------------------------------------------
// Matrix cell 16: forged Assembly content — the T002B mint verifier is
// consumed directly over the exact dispatch anchor.
// ---------------------------------------------------------------------------

test('E2 forged-assembly-lookalike: a self-consistent forged Assembly fails ASSEMBLY_PROVENANCE_UNVERIFIED before any dispatch', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    const forgedAssembly = JSON.parse(
      JSON.stringify(fx.bindingV1.successorAssembly),
    ) as SealedRuntimeAssembly;
    const lookalike = {
      evidence: fx.bindingV1.evidence,
      successorAssembly: forgedAssembly,
      implementationHandle: { kind: 'forged-handle' },
    };
    const admitted = await admittedRequest(fx, OP_QUERY);
    const calls: unknown[] = [];
    const error = await expectNonEffectfulError(
      invokeNonEffectfulTool({
        request: admitted,
        // @ts-expect-error the lookalike is not a SealedToolImplementationBinding
        binding: lookalike,
        currentDefinitionGraph: fx.g,
        dispatch: realHostDispatch(host, calls),
        sha256: realSha256,
      }),
      'ASSEMBLY_PROVENANCE_UNVERIFIED',
    );
    assert.ok(error.message.includes('sealRuntimeAssembly'));
    assertZeroDispatchZeroJournalZeroEffect(calls, undefined, host);

    // Same forged anchor on the effectful route, before any admission work.
    const calls2: unknown[] = [];
    const cell = await effectfulCell(fx, INSTANCE_MISSING, realHostDispatch(host, calls2));
    await expectEffectfulError(
      invokeEffectfulTool({ ...cell.input, binding: lookalike as SealedToolImplementationBinding }),
      'ASSEMBLY_PROVENANCE_UNVERIFIED',
    );
    assertZeroDispatchZeroJournalZeroEffect(calls2, cell.journal, host);
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Matrix cell 17: the Tool return value alone is never authoritative Domain
// state (both invocation classes).
// ---------------------------------------------------------------------------

test('E2 tool-return-not-authority: an authoritative-looking effect=none payload mints nothing, and an effectful payload can be discarded without touching durable authority', async () => {
  const fx = await frozen();
  const host = createRealHost();
  try {
    // (a) effect=none: the Tool returns fabricated Domain state. The result is
    // OBSERVED-only; the durable world is unchanged; the payload cannot mint
    // exposure evidence for any follow-up call.
    const calls: unknown[] = [];
    const admitted = await admittedRequest(fx, OP_QUERY);
    const observed = await invokeNonEffectfulTool({
      request: admitted,
      binding: fx.bindingV1,
      currentDefinitionGraph: fx.g,
      dispatch: realHostDispatch(host, calls),
      sha256: realSha256,
    });
    assert.equal(observed.status, 'OBSERVED');
    assert.deepEqual(observed.output, {
      state: 'DONE',
      balance: 999,
      occurrence: 'forged-occurrence-e2',
    });
    assert.equal(host.effectCount(), 0, 'fabricated state never became a durable effect');
    assert.equal(calls.length, 1);

    // The returned payload cannot be used as admission evidence for a new
    // invocation: it is not minted by admitToolExposure (FORGED) — return
    // values never mint authority.
    let seen: unknown;
    try {
      await admitToolInvocationRequest(
        {
          toolComponentId: TOOL_ID,
          operationId: OP_QUERY,
          input: { amount: 42 },
          caller: caller(),
          definitionGraphDigest: fx.definitionGraphDigest,
          assemblyDigest: fx.successorAssemblyDigestV1,
          // @ts-expect-error an OBSERVED output is not AdmittedToolExposure
          exposure: observed.output,
        },
        { assembly: fx.bindingV1.successorAssembly, currentDefinitionGraph: fx.g },
        realSha256,
      );
    } catch (error) {
      seen = error;
    }
    assert.ok(seen instanceof InvocationRequestError, `expected InvocationRequestError, got ${String(seen)}`);
    assert.equal((seen as InvocationRequestError).code, 'FORGED_EXPOSURE_EVIDENCE');

    // (b) effectful: the Tool's returned payload is discardable — durable
    // authority (journal record + occurrence pin + real host write) is
    // identical regardless of what the Tool returned, and mutating the
    // returned object afterwards changes nothing.
    const gov = await governanceHarness();
    await gov.activator.activate({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: INSTANCE_FROZEN,
      binding: gov.binding,
      assembly: fx.bindingV1.successorAssembly,
      authorityClass: 'PRODUCTION',
      currentDefinitionGraph: fx.g,
    });
    const journal = new VolatileAdmissionEffectJournal();
    const calls2: unknown[] = [];
    const dispatchDiscardable: EffectfulToolDispatchPort = {
      async dispatch(query) {
        calls2.push(query);
        assert.ok(
          Object.is(query.handle, fx.handleV1),
          'the dispatched handle is the exact T003C-verifier-paired opaque handle',
        );
        host.db
          .prepare('INSERT INTO e2_effect (operation_id, input, effect_id) VALUES (?, ?, ?)')
          .run(query.operationId, canonicalJsonStringify(query.input), query.effectId);
        // A payload that PRETENDS to be the authoritative Domain outcome.
        return { outcome: 'DONE', state: 'mutated', occurrence: 'caller-forged' };
      },
    };
    const result = await invokeEffectfulTool({
      request: await admittedRequest(fx, OP_MUTATE),
      binding: fx.bindingV1,
      currentDefinitionGraph: fx.g,
      activator: gov.activator,
      admissionRequest: {
        target: { ...OCCURRENCE_TARGET },
        turn: { kind: 'message', sourceMessageId: 'msg:1' },
        trigger: { kind: 'event', eventType: 'QUOTE_DECIDED' },
        workflowInstanceId: INSTANCE_FROZEN,
        definition: workflowDefinition(),
        currentStateKey: 'review',
        context: {},
        event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
        resolved: resolvedFrom('harness-machine', {
          decision: { outcome: 'mutate', data: { amount: 42 } },
          event: { type: 'QUOTE_DECIDED', payload: { amount: 42 } },
        }),
        decisionSchema,
        now: NOW,
      },
      admissionPorts: {
        governance: gov.coordinator,
        baselines: gov.baselines,
        effectJournal: journal,
      },
      effectType: EFFECT_TYPE,
      dispatch: dispatchDiscardable,
      sha256: realSha256,
    });
    assert.equal(result.outcome.status, 'admitted');
    assert.equal(calls2.length, 1);
    assert.equal(host.effectCount(), 1);

    // Mutating the returned payload changes NOTHING durable.
    const recordsBefore = canonicalJsonStringify(journal.getRecords());
    const payload = result.outcome as unknown as Record<string, unknown>;
    for (const key of Object.keys(payload)) {
      delete payload[key];
    }
    assert.equal(canonicalJsonStringify(journal.getRecords()), recordsBefore, 'journal untouched by payload mutation');
    assert.equal(host.effectCount(), 1, 'real host write untouched by payload mutation');
    const pin = await gov.activator.requireProductionEffectAuthority(INSTANCE_FROZEN);
    assert.equal(pin.bindingDigest, FROZEN.OCCURRENCE_BINDING_DIGEST, 'occurrence pin untouched');
  } finally {
    host.close();
    rmSync(host.dir, { recursive: true, force: true });
  }
});
