/**
 * E9 executable reference — Runtime Resource injection/currentness evidence
 * (issue #878; authority #589@<pack-d> PACK-D E9 + E9 bounded successor
 * rebind (diagnostic-redaction prerequisite #643 accepted / T005C canonical
 * #656 accepted-current) + #715 currentness + #625 reference-planning rebind;
 * DAG #534 E9 row <- T005A(Wave2)/T005B(#825/#864)/T005C(#781)).
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding).
 * SOURCE_MUTATION=NONE (tests/fixtures/evidence write set only).
 *
 * Reference-falsification scope under test (PACK-D E9 + #878):
 *  - logical requirements participate in Assembly identity as defined by
 *    T002B (§F canonical material) — never Definition-plane;
 *  - actual resolution occurs ONLY through one injected generic
 *    ResourceProvider: the kernel imports no SQLite/HTTP/filesystem/cloud
 *    implementation (asserted executably here), there is no registry/catalog/
 *    lookup, and the provider is consulted exactly once per applicable
 *    sealed-Assembly requirement in canonical order;
 *  - required missing/incompatible fails closed (typed) BEFORE the affected
 *    Tool invocation / effect authority: zero dispatch, zero journal record;
 *  - optional missing/incompatible is an EXPLICIT first-class `absent` entry
 *    — never an ambient/default/fallback handle;
 *  - secrets/live handles are excluded from Definition/Assembly identity,
 *    occurrence pins, frozen evidence and every diagnostic (#643 bounded
 *    classification; #794 Proxy containment — hostile response objects and
 *    adjacent trap vectors fail closed as deterministic typed errors whose
 *    fixed messages never echo provider-controlled material);
 *  - behaviorally relevant stable NON-SECRET resource currentness (exact
 *    provider identity + exact resource identity + exact revision digest) is
 *    captured at the T005B seam and enforced by the T005C activation/
 *    execution-currentness gate on the ONE existing pin hierarchy: a stale/
 *    replaced resource revision OR a replaced provider identity fails closed
 *    before the effect, and a required component-scope requirement activates
 *    only with exact evidence (no default/fallback pin; live values are never
 *    hashed or serialized);
 *  - torn-snapshot discipline: every authority-bearing input is snapshotted
 *    synchronously before the first provider suspension; every provider
 *    response is snapshotted synchronously right after its await; caller
 *    mutation mid-await cannot change requests or mint hybrid evidence;
 *  - the resolved handle is an OPAQUE runtime value: the kernel passes it
 *    through untouched, never inspects, digests, serializes or diagnoses it;
 *  - replacing a ResourceProvider requires ZERO Microkernel source edits:
 *    two different provider instances cross the identical generic port;
 *    provider replacement with a different provider identity truthfully
 *    invalidates pinned occurrence currentness;
 *  - provider-order-permutation: declaration/slot input order never changes
 *    assemblyDigest, provider call order or any result (canonical
 *    order-normalization; no source-order authority);
 *  - authority-rich sealed Assembly fidelity: non-empty resourceRequirements
 *    + exact KindImplementation pin + unrelated §G generic
 *    implementation-binding evidence slots are preserved BYTE-EXACT across
 *    binding/reseal/replacement probes;
 *  - REAL_HOST_POSTURE=REQUIRED: required host-resource evidence runs on a
 *    real supported host — a genuine better-sqlite3 (native binding) SQLite
 *    database file backs the injected ResourceProvider; portable identity
 *    probes do not substitute.
 *
 * Frozen subject (issue #878 HEAD_LEASE honored — no rebind needed):
 *   SUBJECT_HEAD=5885c7d2eb1d64c41ef5bb6da445887ccbaa53ff
 *   SUBJECT_TREE=<recorded below from live>
 *
 * Frozen manifest (REFERENCE_FIXTURE_FREEZE from #878, verbatim values):
 *   MANIFEST_ID=E9_RUNTIME_RESOURCE_INJECTION_V1
 *   MANIFEST_VERSION=1
 *   MANIFEST_CANONICAL_JSON_SHA256=58d4930a02f8ead3d9e0c8ef80ddabc85da078ab26c65d0750eff38c58917fc0
 *   DEFINITION_FIXTURE=e9.resource.definition.v1
 *   AUTHORITY_CLASS=PRODUCTION
 *   REAL_HOST_POSTURE=REQUIRED
 *   SECRETS_HANDLES=EXCLUDED_FROM_DEFINITION_ASSEMBLY_EVIDENCE_DIAGNOSTICS
 *   NEGATIVE_PERMUTATION_MATRIX=required-present;required-missing;optional-absent;incompatible;stale-revision;replaced-provider;provider-order-permutation;authority-rich-assembly-fidelity;diagnostic-redaction;no-ambient-fallback
 *
 * OBSERVED_LIMIT (#878 does not specify the canonical-JSON grammar behind
 * MANIFEST_CANONICAL_JSON_SHA256, same precedent as the E3 terminal): the
 * freeze is pinned here by manifest id/version/verbatim field values; the
 * behavioral matrix below is independent of reproducing that serialization.
 *
 * Pre-evidence identity capture (F-01, #625): DefinitionGraphDigest,
 * assemblyDigest, the exact unrelated §G pins, the exact KindImplementation
 * pin, the stable non-secret resource provider/resource/revision currentness
 * pins, the occurrence/execution currentness identity (pin bindingDigest) and
 * the fixture/permutation digests are constructed through the accepted
 * current seams ONCE, recorded via E9_FIXTURE_IDENTITIES (exact digests and
 * non-secret identities only — live secrets/handles are never frozen or
 * serialized), and every matrix cell is evaluated against that immutable
 * identity block.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

import type { ComponentEnvelope, CapabilityContractRef } from '../../../src/contracts/component.js';
import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
} from '../../../src/contracts/definition-graph.js';
import {
  canonicalJsonStringify,
  type Sha256Port,
} from '../../../src/contracts/identity.js';
import type { JsonValue } from '../../../src/contracts/json.js';
import { resolveCurrentCapabilityProvider } from '../../../src/contracts/capability-provision.js';
import {
  sealRuntimeAssembly,
  type AssemblyImplementationBindingEvidence,
  type KindImplementationBindingInput,
  type SealRuntimeAssemblyInput,
  type SealedRuntimeAssembly,
} from '../../../src/contracts/runtime-assembly.js';
import type {
  ResourceContractRef,
  ToolResourceRequirement,
  ToolResourceRequirementsDeclaration,
} from '../../../src/contracts/resource-requirements.js';
import {
  ResourceResolutionError,
  resolveToolResources,
  type ResolveToolResourcesOptions,
  type ResourceCurrentnessEvidence,
  type ResourceProvider,
  type ResourceProviderResponse,
  type ResourceResolutionRequest,
} from '../../../src/contracts/resource-resolution.js';
import {
  bindToolImplementation,
  type SealedToolImplementationBinding,
  type ToolImplementationCandidate,
  type ToolImplementationIdentity,
} from '../../../src/contracts/tool-implementation-binding.js';
import {
  admitToolExposure,
  admitToolInvocationRequest,
  type AdmittedToolInvocationRequest,
  type InvocationCallerContext,
  type ToolExposureAdmissionPolicy,
} from '../../../src/contracts/invocation-request.js';
import {
  invokeNonEffectfulTool,
  NonEffectfulInvocationError,
  type NonEffectfulToolDispatchPort,
  type NonEffectfulToolDispatchQuery,
} from '../../../src/contracts/non-effectful-invocation.js';
import {
  EffectfulInvocationError,
  invokeEffectfulTool,
  type EffectfulToolDispatchPort,
  type EffectfulToolDispatchQuery,
  type InvokeEffectfulToolInput,
} from '../../../src/contracts/effectful-invocation.js';
import { VolatileAdmissionEffectJournal } from '../../../src/admission/effect-journal.js';
import type {
  CentralAdmissionPorts,
  CentralAdmissionRequest,
} from '../../../src/admission/contracts.js';
import type { DomainWorkflowDefinition } from '../../../src/workflow/index.js';
import type { DecisionResolverSource, ResolvedDecision } from '../../../src/decision-resolver/index.js';
import type { WorkflowAddress } from '../../../src/v2/contracts/workflow.js';
import {
  AssemblyExecutionActivator,
  GovernanceExecutionCoordinator,
  MemoryGovernanceBaselineStore,
  createGovernanceBaselineBody,
  type DomainActivationBinding,
  type DurableExecutionStore,
  type ExactPackageCdiAuthority,
  type GovernanceBaselineBody,
  type GovernanceExecutionPin,
  type GovernancePackageCdiBinding,
} from '../../../src/governance/index.js';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Frozen manifest constants (#878 REFERENCE_FIXTURE_FREEZE, verbatim).
// ---------------------------------------------------------------------------

const MANIFEST = {
  MANIFEST_ID: 'E9_RUNTIME_RESOURCE_INJECTION_V1',
  MANIFEST_VERSION: 1,
  MANIFEST_CANONICAL_JSON_SHA256:
    '58d4930a02f8ead3d9e0c8ef80ddabc85da078ab26c65d0750eff38c58917fc0',
  DEFINITION_FIXTURE: 'e9.resource.definition.v1',
  AUTHORITY_CLASS: 'PRODUCTION',
  REAL_HOST_POSTURE: 'REQUIRED',
  SECRETS_HANDLES: 'EXCLUDED_FROM_DEFINITION_ASSEMBLY_EVIDENCE_DIAGNOSTICS',
  NEGATIVE_PERMUTATION_MATRIX:
    'required-present;required-missing;optional-absent;incompatible;stale-revision;replaced-provider;provider-order-permutation;authority-rich-assembly-fidelity;diagnostic-redaction;no-ambient-fallback',
} as const;

const MATRIX_CELLS = [
  'required-present',
  'required-missing',
  'optional-absent',
  'incompatible',
  'stale-revision',
  'replaced-provider',
  'provider-order-permutation',
  'authority-rich-assembly-fidelity',
  'diagnostic-redaction',
  'no-ambient-fallback',
] as const;

// ---------------------------------------------------------------------------
// Definition fixture (e9.resource.definition.v1) — neutral, non-product.
// ---------------------------------------------------------------------------

const E9_KIND = { kindId: 'kind.e9.neutral', version: '1.0.0' } as const;
const SEM_A: { readonly contractId: string; readonly version: string } = {
  contractId: 'sem.e9.schema',
  version: '1.0.0',
};
const CAP_A: CapabilityContractRef = { capabilityId: 'cap.e9.a', version: '1.0.0' };
const CONSUMER_ID = 'consumer.e9';
const TOOL_ID = 'tool.e9';
const OP_QUERY = 'op.e9.query';
const OP_MUTATE = 'op.e9.mutate';

const VAULT_KEY = 'res.e9.vault';
const CACHE_KEY = 'res.e9.cache';
const UNLISTED_KEY = 'res.e9.unlisted';
const VAULT_CONTRACT: ResourceContractRef = {
  contractId: 'res.contract.vault',
  version: '1.0.0',
};
const CACHE_CONTRACT: ResourceContractRef = {
  contractId: 'res.contract.cache',
  version: '1.0.0',
};

/** Live secret material — real host content, never identity, never evidence. */
const VAULT_SECRET = 'sk-live-e9-vault-secret-0001-deadbeefcafe';
const CACHE_SECRET = 'Bearer e9-cache-session-secret-0002';

const PROVIDER_A_ID = 'provider.e9.sqlite.v1';
const PROVIDER_C_ID = 'provider.e9.sqlite.replacement.v2';

const UNRELATED_SLOT_1: AssemblyImplementationBindingEvidence = {
  subject: 'unrelated.e9.binding-slot-1',
  bindingDigest: `sha256:${'a'.repeat(64)}`,
};
const UNRELATED_SLOT_2: AssemblyImplementationBindingEvidence = {
  subject: 'unrelated.e9.binding-slot-2',
  bindingDigest: `sha256:${'b'.repeat(64)}`,
};

const TOOL_PIN: ToolImplementationIdentity = {
  implementationId: 'impl.e9.tool',
  implementationVersion: '1.0.0',
  implementationDigest: `sha256:${'7'.repeat(64)}`,
};

function consumer(): ComponentEnvelope {
  return {
    family: 'semantic',
    componentId: CONSUMER_ID,
    kind: { ...E9_KIND },
    requiredSemanticContracts: [{ ...SEM_A }],
    requiredCapabilities: [{ ...CAP_A }],
    semanticBody: { note: 'e9 consumer' },
  };
}

function toolComponent(): ComponentEnvelope {
  return {
    family: 'tool',
    componentId: TOOL_ID,
    kind: { ...E9_KIND },
    requiredSemanticContracts: [{ ...SEM_A }],
    requiredCapabilities: [],
    semanticBody: {
      operations: [
        { operationId: OP_QUERY, inputSchema: { type: 'object' }, outputSchema: {}, effect: 'none' },
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

/** The frozen neutral Definition graph e9.resource.definition.v1. */
function graph(): DefinitionGraphEnvelope {
  return {
    graphId: 'graph.e9.resource.v1',
    components: [consumer(), toolComponent()],
    relations: [],
  };
}

function kindBinding(): KindImplementationBindingInput {
  return {
    pin: {
      kind: { ...E9_KIND },
      implementation: {
        implementationId: 'impl.e9.kind',
        implementationVersion: '1.0.0',
        implementationDigest: `sha256:${'c'.repeat(64)}`,
      },
    },
    understoodSemanticContracts: [{ ...SEM_A }],
    understoodCapabilities: [{ ...CAP_A }],
    validateComponent: () => {},
  };
}

/** The frozen T005A declaration (authority-rich: one required + one optional). */
function declaration(overrides: {
  readonly order?: 'canonical' | 'reversed';
  readonly vaultRequired?: boolean;
} = {}): ToolResourceRequirementsDeclaration {
  const vault: ToolResourceRequirement = {
    resourceKey: VAULT_KEY,
    contract: { ...VAULT_CONTRACT },
    required: overrides.vaultRequired ?? true,
  };
  const cache: ToolResourceRequirement = {
    resourceKey: CACHE_KEY,
    contract: { ...CACHE_CONTRACT },
    required: false,
  };
  const requirements = overrides.order === 'reversed' ? [cache, vault] : [vault, cache];
  return { componentId: TOOL_ID, requirements };
}

function sealInput(overrides: {
  readonly order?: 'canonical' | 'reversed';
  readonly vaultRequired?: boolean;
  readonly slots?: 'canonical' | 'reversed';
  readonly omitRequirements?: boolean;
} = {}): SealRuntimeAssemblyInput {
  const g = graph();
  return {
    definitionGraph: g,
    kindImplementations: [kindBinding()],
    ...(overrides.omitRequirements === true
      ? {}
      : {
          resourceRequirements: [
            { owner: toolComponent(), declaration: declaration(overrides) },
          ],
        }),
    implementationBindingEvidence:
      overrides.slots === 'reversed'
        ? [{ ...UNRELATED_SLOT_2 }, { ...UNRELATED_SLOT_1 }]
        : [{ ...UNRELATED_SLOT_1 }, { ...UNRELATED_SLOT_2 }],
  };
}

async function sealedAssembly(
  overrides: Parameters<typeof sealInput>[0] = {},
): Promise<SealedRuntimeAssembly> {
  return sealRuntimeAssembly(sealInput(overrides), realSha256);
}

function candidate(handle: unknown): ToolImplementationCandidate {
  return {
    implementation: { ...TOOL_PIN },
    supportedOperations: [OP_QUERY, OP_MUTATE],
    handle,
  };
}

const TOOL_HANDLE = { kind: 'test-tool-handle', id: 'handle.e9.tool#1' };

async function bindTool(
  assembly: SealedRuntimeAssembly,
  g: DefinitionGraphEnvelope,
  handle: unknown = TOOL_HANDLE,
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
    implementations: [candidate(handle)],
    sha256: realSha256,
    exactPin: { ...TOOL_PIN },
  });
}

// ---------------------------------------------------------------------------
// Real-host ResourceProvider: genuine better-sqlite3 SQLite database file.
// ---------------------------------------------------------------------------

interface E9ResourceRow {
  readonly resource_key: string;
  readonly contract_id: string;
  readonly contract_version: string;
  readonly revision: number;
  readonly content: string;
}

const PIN_DIGEST_DOMAIN = 'e9-pin-v1';

/**
 * A REAL host Runtime ResourceProvider backed by a genuine SQLite database
 * file through the better-sqlite3 native binding. The resolved handle is a
 * live opaque object carrying the real connection; the currentness pin is a
 * stable NON-SECRET revision digest computed from real row content.
 */
class RealSqliteResourceProvider implements ResourceProvider {
  readonly providerId: string;
  readonly #db: InstanceType<typeof Database>;
  readonly calls: ResourceResolutionRequest[] = [];

  constructor(providerId: string, db: InstanceType<typeof Database>) {
    this.providerId = providerId;
    this.#db = db;
  }

  get dbPath(): string {
    return this.#db.name;
  }

  async resolve(request: ResourceResolutionRequest): Promise<ResourceProviderResponse> {
    this.calls.push(request);
    const row = this.#db
      .prepare(
        'SELECT resource_key, contract_id, contract_version, revision, content FROM e9_resource WHERE resource_key = ?',
      )
      .get(request.resourceKey) as E9ResourceRow | undefined;
    if (row === undefined) {
      return { status: 'absent' };
    }
    if (
      request.contract !== undefined &&
      (row.contract_id !== request.contract.contractId ||
        row.contract_version !== request.contract.version)
    ) {
      return {
        status: 'incompatible',
        supportedContracts: [
          { contractId: row.contract_id, version: row.contract_version },
        ],
      };
    }
    const contentDigest = sha256Hex(row.content);
    const revisionDigest = `sha256:${sha256Hex(
      `${PIN_DIGEST_DOMAIN}|${this.providerId}|${row.resource_key}|${row.revision}|${contentDigest}`,
    )}`;
    return {
      status: 'resolved',
      handle: {
        kind: 'sqlite-live-handle',
        db: this.#db,
        resourceKey: row.resource_key,
        revision: row.revision,
        toString: () => 'HANDLE-SECRET-sqlite-live-handle',
      },
      contract: { contractId: row.contract_id, version: row.contract_version },
      currentnessPin: {
        providerId: this.providerId,
        resourceKey: row.resource_key,
        revisionDigest,
      },
    };
  }

  close(): void {
    this.#db.close();
  }
}

interface RealHost {
  readonly dir: string;
  readonly dbPath: string;
  readonly providerA: RealSqliteResourceProvider;
  bumpVaultSecret(): void;
  restoreVaultSecret(): void;
  vaultRevision(): number;
}

/** Seed the real SQLite host with three rows (one NOT in any Assembly). */
function createRealHost(): RealHost {
  const dir = mkdtempSync(join(tmpdir(), 'e9-resource-host-'));
  const dbPath = join(dir, 'e9-resources.sqlite');
  const db = new Database(dbPath);
  db.exec(
    'CREATE TABLE e9_resource (resource_key TEXT PRIMARY KEY, contract_id TEXT NOT NULL, contract_version TEXT NOT NULL, revision INTEGER NOT NULL, content TEXT NOT NULL)',
  );
  const insert = db.prepare(
    'INSERT INTO e9_resource (resource_key, contract_id, contract_version, revision, content) VALUES (?, ?, ?, 1, ?)',
  );
  insert.run(VAULT_KEY, VAULT_CONTRACT.contractId, VAULT_CONTRACT.version, VAULT_SECRET);
  insert.run(CACHE_KEY, CACHE_CONTRACT.contractId, CACHE_CONTRACT.version, CACHE_SECRET);
  // Deliberately contract-compatible with the vault requirement but listed
  // in NO sealed Assembly: ambient rows must never be resolved.
  insert.run(UNLISTED_KEY, VAULT_CONTRACT.contractId, VAULT_CONTRACT.version, 'sk-live-e9-unlisted');
  const providerA = new RealSqliteResourceProvider(PROVIDER_A_ID, db);
  return {
    dir,
    dbPath,
    providerA,
    bumpVaultSecret(): void {
      db.prepare(
        "UPDATE e9_resource SET revision = revision + 1, content = 'sk-live-e9-vault-secret-REVISED-9999' WHERE resource_key = ?",
      ).run(VAULT_KEY);
    },
    restoreVaultSecret(): void {
      db.prepare('UPDATE e9_resource SET revision = 1, content = ? WHERE resource_key = ?').run(
        VAULT_SECRET,
        VAULT_KEY,
      );
    },
    vaultRevision(): number {
      const row = db
        .prepare('SELECT revision FROM e9_resource WHERE resource_key = ?')
        .get(VAULT_KEY) as { revision: number } | undefined;
      return row?.revision ?? -1;
    },
  };
}

// ---------------------------------------------------------------------------
// Governance / admission harness (identical seam to the T004C/T005C matrices).
// ---------------------------------------------------------------------------

const WORKFLOW_TARGET = 'orders.e9.mutate';
const OCCURRENCE_TARGET: WorkflowAddress = {
  workflowId: 'orders.e9.mutate',
  instanceKey: 'instance:1',
};
const NOW = '2026-10-06T12:00:00.000Z';
const EFFECT_TYPE = 'effect:e9.mutate';
const INSTANCE_FROZEN = 'orders.e9:instance:1';
const INSTANCE_STALE = 'orders.e9:instance:2';
const INSTANCE_MISSING = 'orders.e9:instance:4';

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
      version: 'e9',
      semantics: { hardInvariants: [], operatorAuthority: 'e9' },
    },
    realSha256,
  );
  const baselines = new MemoryGovernanceBaselineStore();
  await baselines.putBody(baseline);
  const packageCdi = new MemoryExactPackageCdiAuthority();
  packageCdi.add({
    domainId: 'orders',
    packageId: 'pkg-orders-e9',
    domainIntelligenceContentDigest: 'cdi-orders-e9',
  });
  const store = new MemoryDurableExecutionStore();
  const activator = new AssemblyExecutionActivator(store, packageCdi, baselines, realSha256);
  const coordinator = new GovernanceExecutionCoordinator(store, realSha256);
  return {
    binding: {
      domainId: 'orders',
      packageId: 'pkg-orders-e9',
      domainIntelligenceContentDigest: 'cdi-orders-e9',
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
    workflowKey: 'e9-mutate',
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
              { effectType: EFFECT_TYPE, input: { amount: 42 }, idempotencyKey: 'e9:1' },
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
  return { callerId: 'caller.e9.session-1', callerKind: 'workflow' };
}

interface FrozenFixture {
  readonly g: DefinitionGraphEnvelope;
  readonly definitionGraphDigest: string;
  readonly baseAssembly: SealedRuntimeAssembly;
  readonly baseAssemblyDigest: string;
  readonly binding: SealedToolImplementationBinding;
  readonly bindingDigest: string;
  readonly successorAssemblyDigest: string;
  readonly kindPin: KindImplementationBindingInput['pin'];
  readonly unrelatedSlots: readonly AssemblyImplementationBindingEvidence[];
  readonly host: RealHost;
  readonly initialVaultPin: { providerId: string; resourceKey: string; revisionDigest: string };
  readonly initialCachePin: { providerId: string; resourceKey: string; revisionDigest: string };
  readonly vaultEvidence: readonly ResourceCurrentnessEvidence[];
  readonly allEvidence: readonly ResourceCurrentnessEvidence[];
  readonly frozenPin: GovernanceExecutionPin;
  readonly frozenPinBindingDigest: string;
  readonly matrixDigest: string;
  readonly requirementOrderDigest: string;
}

let frozenPromise: Promise<FrozenFixture> | undefined;

/** Identity capture preflight (part of the freeze, NOT an evidence result). */
async function freezeFixture(): Promise<FrozenFixture> {
  const g = graph();
  const definitionGraphDigest = await computeDefinitionGraphDigest(g, realSha256);
  const baseAssembly = await sealedAssembly();
  const binding = await bindTool(baseAssembly, g);
  const successorAssemblyDigest = binding.successorAssembly.assemblyDigest;

  // Real-host pins, captured through the accepted T005B seam itself.
  const host = createRealHost();
  const resolved = await resolveToolResources(
    {
      assembly: binding.successorAssembly,
      componentId: TOOL_ID,
      provider: host.providerA,
    },
  );
  const vaultEntry = resolved.resources.get(VAULT_KEY);
  const cacheEntry = resolved.resources.get(CACHE_KEY);
  if (
    vaultEntry === undefined ||
    vaultEntry.status !== 'resolved' ||
    vaultEntry.currentnessPin === undefined ||
    cacheEntry === undefined ||
    cacheEntry.status !== 'resolved' ||
    cacheEntry.currentnessPin === undefined
  ) {
    throw new Error('E9 freeze: the real-host resolution did not produce both stable pins');
  }
  const initialVaultPin = vaultEntry.currentnessPin;
  const initialCachePin = cacheEntry.currentnessPin;

  const vaultEvidence: readonly ResourceCurrentnessEvidence[] = [
    {
      componentId: TOOL_ID,
      providerId: initialVaultPin.providerId,
      resourceKey: initialVaultPin.resourceKey,
      revisionDigest: initialVaultPin.revisionDigest,
    },
  ];
  // The occurrence pins EVERY pin the provider supplies (the optional cache
  // pin participates when supplied) — the execution re-proof is exact-set.
  const allEvidence: readonly ResourceCurrentnessEvidence[] = [
    {
      componentId: TOOL_ID,
      providerId: initialCachePin.providerId,
      resourceKey: initialCachePin.resourceKey,
      revisionDigest: initialCachePin.revisionDigest,
    },
    ...vaultEvidence,
  ];

  // Occurrence/execution currentness identity on the ONE existing pin.
  const gov = await governanceHarness();
  const frozenPin = await gov.activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: INSTANCE_FROZEN,
    binding: gov.binding,
    assembly: binding.successorAssembly,
    authorityClass: 'PRODUCTION',
    resourceCurrentness: allEvidence,
    currentDefinitionGraph: g,
  });

  const matrixDigest = `sha256:${await realSha256.digestUtf8(
    canonicalJsonStringify([...MATRIX_CELLS].sort()),
  )}`;
  const requirementOrderDigest = `sha256:${await realSha256.digestUtf8(
    canonicalJsonStringify([CACHE_KEY, VAULT_KEY]),
  )}`;

  const frozen: FrozenFixture = {
    g,
    definitionGraphDigest,
    baseAssembly,
    baseAssemblyDigest: baseAssembly.assemblyDigest,
    binding,
    bindingDigest: binding.evidence.bindingDigest,
    successorAssemblyDigest,
    kindPin: baseAssembly.record.kindImplementations[0]!,
    unrelatedSlots: baseAssembly.record.implementationBindingEvidence,
    host,
    initialVaultPin,
    initialCachePin,
    vaultEvidence,
    allEvidence,
    frozenPin,
    frozenPinBindingDigest: frozenPin.bindingDigest,
    matrixDigest,
    requirementOrderDigest,
  };
  console.log(
    'E9_FIXTURE_IDENTITIES ' +
      JSON.stringify({
        manifestId: MANIFEST.MANIFEST_ID,
        manifestVersion: MANIFEST.MANIFEST_VERSION,
        definitionFixture: MANIFEST.DEFINITION_FIXTURE,
        definitionGraphDigest: frozen.definitionGraphDigest,
        baseAssemblyDigest: frozen.baseAssemblyDigest,
        bindingDigest: frozen.bindingDigest,
        successorAssemblyDigest: frozen.successorAssemblyDigest,
        kindImplementationPin: frozen.kindPin,
        unrelatedBindingSlots: frozen.unrelatedSlots,
        stableNonSecretResourcePins: {
          vault: { providerId: initialVaultPin.providerId, resourceKey: initialVaultPin.resourceKey, revisionDigest: initialVaultPin.revisionDigest },
          cache: { providerId: initialCachePin.providerId, resourceKey: initialCachePin.resourceKey, revisionDigest: initialCachePin.revisionDigest },
        },
        occurrenceCurrentnessIdentity: {
          workflowInstanceId: frozenPin.workflowInstanceId,
          bindingDigest: frozenPin.bindingDigest,
          assemblyDigest: frozenPin.assemblyDigest,
          authorityClass: frozenPin.authorityClass,
          resourceCurrentness: frozenPin.resourceCurrentness,
        },
        realHost: { kind: 'better-sqlite3', dbPath: host.dbPath, vaultRevision: host.vaultRevision() },
        matrixDigest: frozen.matrixDigest,
        requirementOrderDigest: frozen.requirementOrderDigest,
      }),
  );
  return frozen;
}

function frozen(): Promise<FrozenFixture> {
  frozenPromise ??= freezeFixture();
  return frozenPromise;
}

test.after(() => {
  // Best-effort hygiene; the evidence values above never depend on the files.
  if (frozenPromise !== undefined) {
    frozenPromise.then((fx) => {
      fx.host.providerA.close();
      rmSync(fx.host.dir, { recursive: true, force: true });
    });
  }
});

// ---------------------------------------------------------------------------
// Shared per-cell helpers (build admitted requests / invocation inputs).
// ---------------------------------------------------------------------------

async function admittedRequest(
  fx: FrozenFixture,
  operationId: string,
): Promise<AdmittedToolInvocationRequest> {
  const exposure = await admitToolExposure(
    {
      toolComponentId: TOOL_ID,
      operationId,
      caller: caller(),
      assembly: fx.binding.successorAssembly,
      currentDefinitionGraph: fx.g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  return admitToolInvocationRequest(
    {
      toolComponentId: TOOL_ID,
      operationId,
      input: { amount: 42 },
      caller: caller(),
      definitionGraphDigest: fx.binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest: fx.successorAssemblyDigest,
      exposure,
    },
    { assembly: fx.binding.successorAssembly, currentDefinitionGraph: fx.g },
    realSha256,
  );
}

function recordingDispatch(
  calls: EffectfulToolDispatchQuery[],
  output: unknown = { mutated: true },
): EffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return output;
    },
  };
}

function recordingQueryDispatch(
  calls: NonEffectfulToolDispatchQuery[],
): NonEffectfulToolDispatchPort {
  return {
    async dispatch(query) {
      calls.push(query);
      return { observed: true };
    },
  };
}

interface EffectfulCell {
  readonly input: InvokeEffectfulToolInput;
  readonly journal: VolatileAdmissionEffectJournal;
}

async function effectfulCell(
  fx: FrozenFixture,
  instanceId: string,
  provider: ResourceProvider | undefined,
  dispatch: EffectfulToolDispatchPort,
  extra: { resourceCurrentness?: readonly ResourceCurrentnessEvidence[] } = {},
): Promise<EffectfulCell> {
  const admitted = await admittedRequest(fx, OP_MUTATE);
  const gov = await governanceHarness();
  await gov.activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: instanceId,
    binding: gov.binding,
    assembly: fx.binding.successorAssembly,
    authorityClass: 'PRODUCTION',
    ...(extra.resourceCurrentness === undefined
      ? {}
      : { resourceCurrentness: extra.resourceCurrentness }),
    currentDefinitionGraph: fx.g,
  });
  const journal = new VolatileAdmissionEffectJournal();
  const admissionPorts: Omit<CentralAdmissionPorts, 'sha256' | 'effectTools'> = {
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
    input: {
      request: admitted,
      binding: fx.binding,
      currentDefinitionGraph: fx.g,
      activator: gov.activator,
      admissionRequest,
      admissionPorts,
      effectType: EFFECT_TYPE,
      dispatch,
      ...(provider === undefined ? {} : { resourceProvider: provider }),
      sha256: realSha256,
    },
  };
}

function expectResourceError(
  promise: Promise<unknown>,
  code: ResourceResolutionError['code'],
): Promise<ResourceResolutionError> {
  return promise.then(
    () => {
      throw new Error(`expected ResourceResolutionError(${code}), but resolution resolved`);
    },
    (error: unknown) => {
      assert.ok(
        error instanceof ResourceResolutionError,
        `expected ResourceResolutionError, got ${String(error)}`,
      );
      assert.equal(error.code, code);
      return error;
    },
  );
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

function assertNoSecretLeak(text: string): void {
  for (const forbidden of [
    VAULT_SECRET,
    CACHE_SECRET,
    'sk-live',
    'Bearer',
    'HANDLE-SECRET',
    'deadbeef',
    'REVISED-9999',
  ]) {
    assert.ok(!text.includes(forbidden), `diagnostic/identity material leaked "${forbidden}": ${text}`);
  }
}

/** One-shot provider from a per-key response script. */
function scriptedProvider(
  script: (request: ResourceResolutionRequest) => ResourceProviderResponse | Promise<ResourceProviderResponse>,
): { provider: ResourceProvider; calls: ResourceResolutionRequest[] } {
  const calls: ResourceResolutionRequest[] = [];
  return {
    calls,
    provider: {
      async resolve(request) {
        calls.push(request);
        return script(request);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Matrix cell 1: required-present (REAL HOST end-to-end, both invocation classes).
// ---------------------------------------------------------------------------

test('E9 required-present: real-host SQLite ResourceProvider injects the opaque handle + stable non-secret pin through the T005B seam', async () => {
  const fx = await frozen();
  const provider = fx.host.providerA;
  provider.calls.length = 0;

  const result = await resolveToolResources({
    assembly: fx.binding.successorAssembly,
    componentId: TOOL_ID,
    provider,
  });

  // Exactly one consult per applicable sealed-Assembly requirement, in
  // canonical resourceKey order — and NEVER for the unlisted ambient row.
  assert.deepEqual(
    provider.calls.map((request) => request.resourceKey),
    [CACHE_KEY, VAULT_KEY],
  );
  for (const request of provider.calls) {
    assert.equal(request.componentId, TOOL_ID);
    assert.equal(Object.isFrozen(request), true);
    assertNoSecretLeak(JSON.stringify(request));
  }
  assert.ok(provider.calls.every((request) => request.resourceKey !== UNLISTED_KEY));

  const vault = result.resources.get(VAULT_KEY);
  const cache = result.resources.get(CACHE_KEY);
  if (
    vault === undefined ||
    vault.status !== 'resolved' ||
    vault.currentnessPin === undefined ||
    cache === undefined ||
    cache.status !== 'resolved' ||
    cache.currentnessPin === undefined
  ) {
    throw new Error('E9: expected both resources resolved with stable pins');
  }

  // The captured pins are EXACTLY the frozen stable non-secret identities.
  assert.deepEqual(vault.currentnessPin, fx.initialVaultPin);
  assert.deepEqual(cache.currentnessPin, fx.initialCachePin);
  assert.equal(vault.currentnessPin.resourceKey, VAULT_KEY);
  assert.match(vault.currentnessPin.revisionDigest, /^sha256:[0-9a-f]{64}$/);

  // The handle is the provider's own opaque live object (real SQLite
  // connection inside) — passed through untouched, never inspected.
  assert.equal(
    typeof (vault.handle as { db: { prepare: unknown } }).db.prepare,
    'function',
  );
  assert.equal((vault.handle as { resourceKey: string }).resourceKey, VAULT_KEY);

  // The resolution result/map is runtime-only: it is not identity material.
  assert.equal(result.componentId, TOOL_ID);
  assert.equal(Object.isFrozen(result), true);
});

test('E9 required-present: non-effectful invocation dispatches the resolved opaque resources (T004B seam)', async () => {
  const fx = await frozen();
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const admitted = await admittedRequest(fx, OP_QUERY);

  const result = await invokeNonEffectfulTool({
    request: admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch: recordingQueryDispatch(calls),
    resourceProvider: fx.host.providerA,
    sha256: realSha256,
  });

  assert.equal(result.status, 'OBSERVED');
  assert.equal(calls.length, 1);
  const query = calls[0]!;
  const vault = query.resources.get(VAULT_KEY);
  const cache = query.resources.get(CACHE_KEY);
  if (
    vault === undefined ||
    vault.status !== 'resolved' ||
    cache === undefined ||
    cache.status !== 'resolved'
  ) {
    throw new Error('E9: expected the dispatch query to carry both resolved resources');
  }
  assert.equal(
    typeof (vault.handle as { db: { prepare: unknown } }).db.prepare,
    'function',
  );
});

// ---------------------------------------------------------------------------
// Matrix cell 2: required-missing (fail-closed BEFORE invocation/effect).
// ---------------------------------------------------------------------------

test('E9 required-missing: typed fail-closed at T005B, before the affected non-effectful invocation', async () => {
  const fx = await frozen();
  const absentVault = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? { status: 'absent' }
      : { status: 'resolved', handle: { cache: true }, contract: { ...CACHE_CONTRACT } },
  );

  const error = await expectResourceError(
    resolveToolResources({
      assembly: fx.binding.successorAssembly,
      componentId: TOOL_ID,
      provider: absentVault.provider,
    }),
    'MISSING_REQUIRED_RESOURCE',
  );
  assert.ok(error.message.includes(`"${VAULT_KEY}"`));
  assertNoSecretLeak(error.message);

  // Invocation-level: the failure lands BEFORE any Tool dispatch. The T005B
  // typed failure propagates unchanged through the T004B seam.
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const admitted = await admittedRequest(fx, OP_QUERY);
  await expectResourceError(
    invokeNonEffectfulTool({
      request: admitted,
      binding: fx.binding,
      currentDefinitionGraph: fx.g,
      dispatch: recordingQueryDispatch(calls),
      resourceProvider: absentVault.provider,
      sha256: realSha256,
    }),
    'MISSING_REQUIRED_RESOURCE',
  );
  assert.equal(calls.length, 0);
});

test('E9 required-missing: fail-closed BEFORE the durable effect — zero dispatch, zero journal record', async () => {
  const fx = await frozen();
  const absentVault = scriptedProvider(() => ({ status: 'absent' }) as ResourceProviderResponse);
  const calls: EffectfulToolDispatchQuery[] = [];
  const cell = await effectfulCell(
    fx,
    INSTANCE_MISSING,
    absentVault.provider,
    recordingDispatch(calls),
    { resourceCurrentness: fx.allEvidence },
  );

  const error = await expectResourceError(
    invokeEffectfulTool(cell.input),
    'MISSING_REQUIRED_RESOURCE',
  );
  assertNoSecretLeak(error.message);
  assert.equal(calls.length, 0, 'zero Tool dispatch before the effect');
  assert.equal(cell.journal.getRecords().length, 0, 'zero durable journal record');
});

// ---------------------------------------------------------------------------
// Matrix cell 3: optional-absent (explicit absence, never ambient fallback).
// ---------------------------------------------------------------------------

test('E9 optional-absent: missing optional resource is a first-class explicit absence entry', async () => {
  const fx = await frozen();
  const absentCache = scriptedProvider((request) =>
    request.resourceKey === CACHE_KEY
      ? { status: 'absent' }
      : {
          status: 'resolved',
          handle: { vault: true },
          contract: { ...VAULT_CONTRACT },
          currentnessPin: { ...fx.initialVaultPin },
        },
  );

  const result = await resolveToolResources({
    assembly: fx.binding.successorAssembly,
    componentId: TOOL_ID,
    provider: absentCache.provider,
  });
  const cache = result.resources.get(CACHE_KEY);
  if (cache === undefined || cache.status !== 'absent') {
    throw new Error('E9: expected an explicit absence entry for the missing optional resource');
  }
  assert.deepEqual(cache, { resourceKey: CACHE_KEY, status: 'absent' });
  assert.equal('handle' in cache, false, 'no ambient/default handle exists');
  assert.equal('currentnessPin' in cache, false);
  assert.equal(Object.isFrozen(cache), true);

  // Invocation succeeds; the dispatch query carries the EXPLICIT absence.
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const admitted = await admittedRequest(fx, OP_QUERY);
  await invokeNonEffectfulTool({
    request: admitted,
    binding: fx.binding,
    currentDefinitionGraph: fx.g,
    dispatch: recordingQueryDispatch(calls),
    resourceProvider: absentCache.provider,
    sha256: realSha256,
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]!.resources.get(CACHE_KEY), {
    resourceKey: CACHE_KEY,
    status: 'absent',
  });
});

// ---------------------------------------------------------------------------
// Matrix cell 4: incompatible (exact contract mismatch fails closed).
// ---------------------------------------------------------------------------

test('E9 incompatible: provider-reported incompatibility and exact-contract mismatch fail closed before invocation/effect', async () => {
  const fx = await frozen();

  // (a) provider-reported incompatible on a REQUIRED resource.
  const incompatibleVault = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? {
          status: 'incompatible',
          supportedContracts: [{ contractId: 'res.contract.vault', version: '9.9.9' }],
        }
      : { status: 'absent' },
  );
  const errorA = await expectResourceError(
    resolveToolResources({
      assembly: fx.binding.successorAssembly,
      componentId: TOOL_ID,
      provider: incompatibleVault.provider,
    }),
    'INCOMPATIBLE_RESOURCE',
  );
  assert.ok(errorA.message.includes(`"${VAULT_KEY}"`));
  assertNoSecretLeak(errorA.message);

  // (b) resolved WITHOUT the exact pinned contract (status string alone is
  // never trusted): wrong claimed version on a required resource.
  const wrongContract = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? {
          status: 'resolved',
          handle: { vault: true },
          contract: { contractId: 'res.contract.vault', version: '2.0.0' },
        }
      : { status: 'absent' },
  );
  await expectResourceError(
    resolveToolResources({
      assembly: fx.binding.successorAssembly,
      componentId: TOOL_ID,
      provider: wrongContract.provider,
    }),
    'INCOMPATIBLE_RESOURCE',
  );

  // (c) optional incompatible degrades to the EXPLICIT absence entry.
  const incompatibleCache = scriptedProvider((request) =>
    request.resourceKey === CACHE_KEY
      ? { status: 'incompatible', supportedContracts: [{ contractId: 'res.contract.cache', version: '0.0.1' }] }
      : {
          status: 'resolved',
          handle: { vault: true },
          contract: { ...VAULT_CONTRACT },
          currentnessPin: { ...fx.initialVaultPin },
        },
  );
  const resultC = await resolveToolResources({
    assembly: fx.binding.successorAssembly,
    componentId: TOOL_ID,
    provider: incompatibleCache.provider,
  });
  assert.deepEqual(resultC.resources.get(CACHE_KEY), { resourceKey: CACHE_KEY, status: 'absent' });

  // (d) effectful invocation with an incompatible required resource: zero
  // dispatch and zero durable journal record before any effect authority.
  const calls: EffectfulToolDispatchQuery[] = [];
  const cell = await effectfulCell(
    fx,
    'orders.e9:instance:incompatible',
    incompatibleVault.provider,
    recordingDispatch(calls),
    { resourceCurrentness: fx.allEvidence },
  );
  await expectResourceError(invokeEffectfulTool(cell.input), 'INCOMPATIBLE_RESOURCE');
  assert.equal(calls.length, 0);
  assert.equal(cell.journal.getRecords().length, 0);
});

// ---------------------------------------------------------------------------
// Matrix cell 5: stale-revision (T005C currentness enforcement, real host).
// ---------------------------------------------------------------------------

test('E9 stale-revision: real-host resource replacement fails closed at the T005C gate BEFORE the effect', async () => {
  const fx = await frozen();
  assert.equal(fx.host.vaultRevision(), 1);
  const calls: EffectfulToolDispatchQuery[] = [];
  const cell = await effectfulCell(
    fx,
    INSTANCE_STALE,
    fx.host.providerA,
    recordingDispatch(calls),
    { resourceCurrentness: fx.allEvidence },
  );

  // Real host resource revision replacement between activation and execution.
  fx.host.bumpVaultSecret();
  try {
    assert.equal(fx.host.vaultRevision(), 2);
    await assert.rejects(invokeEffectfulTool(cell.input), (error: unknown) => {
      assert.ok(
        error instanceof Error,
        `expected a typed governance currentness failure, got ${String(error)}`,
      );
      assert.ok(
        'code' in error && error.code === 'RESOURCE_CURRENTNESS_MISMATCH',
        `expected RESOURCE_CURRENTNESS_MISMATCH, got ${String(error)}`,
      );
      assertNoSecretLeak((error as Error).message);
      return true;
    });
    assert.equal(calls.length, 0, 'stale revision: zero Tool dispatch');
    assert.equal(cell.journal.getRecords().length, 0, 'stale revision: zero durable journal record');
  } finally {
    fx.host.restoreVaultSecret();
    assert.equal(fx.host.vaultRevision(), 1);
  }
});

test('E9 stale-revision: activation without exact required currentness evidence fails closed before any durable bind', async () => {
  const fx = await frozen();
  const gov = await governanceHarness();
  await assert.rejects(
    gov.activator.activate({
      workflowTarget: WORKFLOW_TARGET,
      workflowInstanceId: 'orders.e9:instance:no-evidence',
      binding: gov.binding,
      assembly: fx.binding.successorAssembly,
      authorityClass: 'PRODUCTION',
      currentDefinitionGraph: fx.g,
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(
        'code' in error && error.code === 'RESOURCE_CURRENTNESS_PIN_REQUIRED',
        `expected RESOURCE_CURRENTNESS_PIN_REQUIRED, got ${String(error)}`,
      );
      return true;
    },
  );
  // No durable bind happened: the pin store stays empty for that occurrence.
  assert.equal(
    await gov.store.getGovernanceExecutionPin('orders.e9:instance:no-evidence'),
    undefined,
  );
});

// ---------------------------------------------------------------------------
// Matrix cell 6: replaced-provider (zero kernel edits; identity invalidation).
// ---------------------------------------------------------------------------

test('E9 replaced-provider: a replacement provider instance crosses the identical generic port with zero Microkernel source edits', async () => {
  const fx = await frozen();

  // Provider B: a brand-new instance over the SAME real host DB and the same
  // provider identity. No kernel code changes in any way — the port is
  // injected per call.
  const dbB = new Database(fx.host.dbPath, { readonly: true });
  const providerB = new RealSqliteResourceProvider(PROVIDER_A_ID, dbB);
  try {
    const resultB = await resolveToolResources({
      assembly: fx.binding.successorAssembly,
      componentId: TOOL_ID,
      provider: providerB,
    });
    const vaultB = resultB.resources.get(VAULT_KEY);
    if (vaultB === undefined || vaultB.status !== 'resolved' || vaultB.currentnessPin === undefined) {
      throw new Error('E9: replacement provider did not resolve the vault with a pin');
    }
    assert.deepEqual(vaultB.currentnessPin, fx.initialVaultPin);
    assert.deepEqual(
      providerB.calls.map((request) => request.resourceKey),
      [CACHE_KEY, VAULT_KEY],
    );
    // Provider A was not consulted during the replacement resolution.
    const callsBefore = fx.host.providerA.calls.length;
    await resolveToolResources({
      assembly: fx.binding.successorAssembly,
      componentId: TOOL_ID,
      provider: providerB,
    });
    assert.equal(fx.host.providerA.calls.length, callsBefore);

    // Non-effectful invocation through the replacement provider succeeds.
    const calls: NonEffectfulToolDispatchQuery[] = [];
    const admitted = await admittedRequest(fx, OP_QUERY);
    await invokeNonEffectfulTool({
      request: admitted,
      binding: fx.binding,
      currentDefinitionGraph: fx.g,
      dispatch: recordingQueryDispatch(calls),
      resourceProvider: providerB,
      sha256: realSha256,
    });
    assert.equal(calls.length, 1);
  } finally {
    providerB.close();
  }
});

test('E9 replaced-provider: a replaced provider IDENTITY truthfully invalidates pinned occurrence currentness before the effect', async () => {
  const fx = await frozen();
  // Provider C: same real DB, DIFFERENT provider identity — the stable pin
  // digest changes with the attesting provider, so the pinned occurrence
  // (frozen with provider A's pin) must fail closed.
  const dbC = new Database(fx.host.dbPath, { readonly: true });
  const providerC = new RealSqliteResourceProvider(PROVIDER_C_ID, dbC);
  try {
    const calls: EffectfulToolDispatchQuery[] = [];
    const cell = await effectfulCell(
      fx,
      'orders.e9:instance:5',
      providerC,
      recordingDispatch(calls),
      { resourceCurrentness: fx.allEvidence },
    );
    await assert.rejects(invokeEffectfulTool(cell.input), (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(
        'code' in error && error.code === 'RESOURCE_CURRENTNESS_MISMATCH',
        `expected RESOURCE_CURRENTNESS_MISMATCH for the replaced provider, got ${String(error)}`,
      );
      return true;
    });
    assert.equal(calls.length, 0);
    assert.equal(cell.journal.getRecords().length, 0);
  } finally {
    providerC.close();
  }
});

// ---------------------------------------------------------------------------
// Matrix cell 7: provider-order-permutation (no source-order authority).
// ---------------------------------------------------------------------------

test('E9 provider-order-permutation: declaration/evidence-slot input order never changes any digest, call order or result', async () => {
  const fx = await frozen();

  // (a) Reversed T005A declaration requirement order => IDENTICAL Assembly
  // identity (canonical §F order-normalization at sealing).
  const reversedRequirements = await sealedAssembly({ order: 'reversed' });
  assert.equal(
    reversedRequirements.assemblyDigest,
    fx.baseAssemblyDigest,
    'requirement declaration order is not identity',
  );

  // (b) Reversed §G evidence-slot input order => IDENTICAL Assembly identity.
  const reversedSlots = await sealedAssembly({ slots: 'reversed' });
  assert.equal(
    reversedSlots.assemblyDigest,
    fx.baseAssemblyDigest,
    'evidence-slot input order is not identity',
  );

  // (c) Canonical provider call order + identical results across declaration
  // orders: the provider is consulted in (componentId, resourceKey) order.
  const provider = fx.host.providerA;
  provider.calls.length = 0;
  const result = await resolveToolResources({
    assembly: reversedRequirements,
    componentId: TOOL_ID,
    provider,
  });
  assert.deepEqual(
    provider.calls.map((request) => request.resourceKey),
    [CACHE_KEY, VAULT_KEY],
  );
  const vault = result.resources.get(VAULT_KEY);
  if (vault === undefined || vault.status !== 'resolved' || vault.currentnessPin === undefined) {
    throw new Error('E9: permuted-order resolution did not produce the vault pin');
  }
  assert.deepEqual(vault.currentnessPin, fx.initialVaultPin);
});

// ---------------------------------------------------------------------------
// Matrix cell 8: authority-rich-assembly-fidelity (byte-exact preservation).
// ---------------------------------------------------------------------------

test('E9 authority-rich-assembly-fidelity: unrelated sealed material is preserved byte-exact across binding/reseal/replacement probes', async () => {
  const fx = await frozen();

  // The frozen base Assembly is authority-rich: non-empty resource
  // requirements, one exact KindImplementation pin, two unrelated §G slots.
  assert.equal(fx.baseAssembly.record.resourceRequirements.length, 1);
  assert.ok(fx.baseAssembly.record.resourceRequirements[0]!.requirements.length >= 2);
  assert.equal(fx.baseAssembly.record.kindImplementations.length, 1);
  assert.equal(fx.unrelatedSlots.length, 2);
  assert.deepEqual(fx.unrelatedSlots, [
    { subject: 'unrelated.e9.binding-slot-1', bindingDigest: `sha256:${'a'.repeat(64)}` },
    { subject: 'unrelated.e9.binding-slot-2', bindingDigest: `sha256:${'b'.repeat(64)}` },
  ]);

  // (a) The T003C binding successor preserves every unrelated field byte-exact.
  const successorRecord = fx.binding.successorAssembly.record;
  assert.deepEqual(successorRecord.kindImplementations, [fx.kindPin]);
  assert.deepEqual(
    successorRecord.implementationBindingEvidence.filter(
      (slot) => slot.subject.startsWith('unrelated.'),
    ),
    [...fx.unrelatedSlots],
  );
  assert.equal(successorRecord.definitionGraphDigest, fx.definitionGraphDigest);
  assert.deepEqual(successorRecord.resourceRequirements, fx.baseAssembly.record.resourceRequirements);

  // (b) A fresh reseal of the identical material reproduces the identical
  // record byte-exact.
  const resealed = await sealedAssembly();
  assert.equal(
    canonicalJsonStringify(resealed.record),
    canonicalJsonStringify(fx.baseAssembly.record),
  );

  // (c) Resolution/provider replacement never mutates the sealed Assembly:
  // the record is byte-identical before and after resolutions through
  // providers A, B and C.
  const before = canonicalJsonStringify(fx.binding.successorAssembly.record);
  const dbB = new Database(fx.host.dbPath, { readonly: true });
  const providerB = new RealSqliteResourceProvider(PROVIDER_A_ID, dbB);
  const dbC = new Database(fx.host.dbPath, { readonly: true });
  const providerC = new RealSqliteResourceProvider(PROVIDER_C_ID, dbC);
  try {
    await resolveToolResources({ assembly: fx.binding.successorAssembly, componentId: TOOL_ID, provider: fx.host.providerA });
    await resolveToolResources({ assembly: fx.binding.successorAssembly, componentId: TOOL_ID, provider: providerB });
    await resolveToolResources({ assembly: fx.binding.successorAssembly, componentId: TOOL_ID, provider: providerC });
  } finally {
    providerB.close();
    providerC.close();
  }
  assert.equal(canonicalJsonStringify(fx.binding.successorAssembly.record), before);
});

// ---------------------------------------------------------------------------
// Matrix cell 9: diagnostic-redaction (#643 classification + #794 containment).
// ---------------------------------------------------------------------------

test('E9 diagnostic-redaction: provider free text, secret-shaped keys, symbols and hostile Proxies never reach a diagnostic', async () => {
  const fx = await frozen();
  const resolveBase: Omit<ResolveToolResourcesOptions, 'provider'> = {
    assembly: fx.binding.successorAssembly,
    componentId: TOOL_ID,
  };

  // (a) Provider throws with secret-shaped free text: typed, redacted. The
  // throw happens on the REQUIRED vault call (canonical order: cache first).
  const throwing = scriptedProvider((request) => {
    if (request.resourceKey === VAULT_KEY) {
      throw new Error('provider internal boom sk-live-deadbeef token=Bearer xyz');
    }
    return { status: 'absent' };
  });
  const errorA = await expectResourceError(
    resolveToolResources({ ...resolveBase, provider: throwing.provider }),
    'RESOURCE_PROVIDER_FAILURE',
  );
  assert.ok(errorA.message.includes(`"${VAULT_KEY}"`));
  assertNoSecretLeak(errorA.message);

  // (b) Secret-shaped provider-controlled own key on a resolved response:
  // classified, never echoed.
  const secretKeyResponse = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? ({
          status: 'resolved',
          handle: {},
          contract: { ...VAULT_CONTRACT },
          ['sk-live-deadbeefdeadbeefdeadbeef' as string]: true,
        } as unknown as ResourceProviderResponse)
      : { status: 'absent' },
  );
  const errorB = await expectResourceError(
    resolveToolResources({ ...resolveBase, provider: secretKeyResponse.provider }),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assert.ok(errorB.message.includes('<redacted:secret-shaped'));
  assertNoSecretLeak(errorB.message);

  // (c) Overlong provider-controlled own key: length-only classification.
  const overlongKeyResponse = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? ({
          status: 'resolved',
          handle: {},
          contract: { ...VAULT_CONTRACT },
          [`k${'x'.repeat(200)}`]: true,
        } as unknown as ResourceProviderResponse)
      : { status: 'absent' },
  );
  const errorC = await expectResourceError(
    resolveToolResources({ ...resolveBase, provider: overlongKeyResponse.provider }),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assert.ok(errorC.message.includes('<redacted:overlong,len=201'));
  assertNoSecretLeak(errorC.message);

  // (d) Prototype-pollution own key: classified, never echoed.
  const protoKeyResponse = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? ({
          status: 'resolved',
          handle: {},
          contract: { ...VAULT_CONTRACT },
          ['__proto__']: true,
        } as unknown as ResourceProviderResponse)
      : { status: 'absent' },
  );
  const errorD = await expectResourceError(
    resolveToolResources({ ...resolveBase, provider: protoKeyResponse.provider }),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assert.ok(errorD.message.includes('<redacted:prototype-name'));
  assert.ok(!errorD.message.includes('__proto__'));

  // (e) Symbol-keyed property: the symbol DESCRIPTION is never diagnosed.
  const symbolDescribed = Symbol('trap-desc-sk-live-secret');
  const symbolResponse = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? ({
          status: 'resolved',
          handle: {},
          contract: { ...VAULT_CONTRACT },
          [symbolDescribed]: 'x',
        } as unknown as ResourceProviderResponse)
      : { status: 'absent' },
  );
  const errorE = await expectResourceError(
    resolveToolResources({ ...resolveBase, provider: symbolResponse.provider }),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assertNoSecretLeak(errorE.message);
  assert.ok(!errorE.message.includes('trap-desc'));

  // (f) #794 adjacent thenable vector: a hostile response whose get-trap
  // throws on the engine's `then` probe rejects the provider CALL itself —
  // contained at the call boundary as RESOURCE_PROVIDER_FAILURE, trap text
  // never propagated.
  const thenableTrapProxy: ResourceProviderResponse = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') {
          throw new Error('TRAP_SECRET_THEN sk-live-thenable');
        }
        return undefined;
      },
    },
  ) as ResourceProviderResponse;
  const thenableProvider = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY ? thenableTrapProxy : { status: 'absent' },
  );
  const errorF1 = await expectResourceError(
    resolveToolResources({ ...resolveBase, provider: thenableProvider.provider }),
    'RESOURCE_PROVIDER_FAILURE',
  );
  assert.ok(!errorF1.message.includes('TRAP_SECRET'));
  assertNoSecretLeak(errorF1.message);

  // (g) #794 hostile non-thenable Proxy response (inspection traps throw):
  // deterministic typed containment at the RESPONSE boundary; the trap text
  // never propagates.
  const hostileProxy: ResourceProviderResponse = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === 'then') return undefined;
        if (prop === 'status') return 'resolved';
        throw new Error('TRAP_SECRET_OWNKEYS sk-live-trap');
      },
      ownKeys() {
        throw new Error('TRAP_SECRET_OWNKEYS sk-live-trap');
      },
    },
  ) as ResourceProviderResponse;
  const proxyProvider = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? hostileProxy
      : { status: 'absent' },
  );
  const errorG = await expectResourceError(
    resolveToolResources({ ...resolveBase, provider: proxyProvider.provider }),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assert.ok(errorG.message.includes('could not be safely inspected'));
  assert.ok(!errorG.message.includes('TRAP_SECRET'));
  assertNoSecretLeak(errorG.message);

  // (h) The real provider's opaque handle is never stringified into any
  // failure path (its toString() would leak the marker): a required resource
  // resolved WITHOUT the exact contract fails closed and the diagnostic is
  // built from Assembly identity only.
  const wrongContractWithHandle = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? {
          status: 'resolved',
          handle: { toString: () => 'HANDLE-SECRET-x' },
          contract: { contractId: 'res.contract.vault', version: '2.0.0' },
        }
      : { status: 'absent' },
  );
  const errorH = await expectResourceError(
    resolveToolResources({ ...resolveBase, provider: wrongContractWithHandle.provider }),
    'INCOMPATIBLE_RESOURCE',
  );
  assertNoSecretLeak(errorH.message);
});

test('E9 diagnostic-redaction: currentness-pin smuggling attempts fail closed at the structural fence', async () => {
  const fx = await frozen();

  // A pin carrying an unknown (secret-riding) field is structurally
  // unrepresentable: typed failure, key classified, secret never echoed.
  const smuggledPin = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? ({
          status: 'resolved',
          handle: {},
          contract: { ...VAULT_CONTRACT },
          currentnessPin: {
            providerId: PROVIDER_A_ID,
            resourceKey: VAULT_KEY,
            revisionDigest: `sha256:${'d'.repeat(64)}`,
            credential: 'sk-live-pin-smuggle',
          },
        } as unknown as ResourceProviderResponse)
      : { status: 'absent' },
  );
  const error = await expectResourceError(
    resolveToolResources({
      assembly: fx.binding.successorAssembly,
      componentId: TOOL_ID,
      provider: smuggledPin.provider,
    }),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
  assertNoSecretLeak(error.message);

  // A pin for a DIFFERENT resource is never currentness evidence.
  const wrongResourcePin = scriptedProvider((request) =>
    request.resourceKey === VAULT_KEY
      ? {
          status: 'resolved',
          handle: {},
          contract: { ...VAULT_CONTRACT },
          currentnessPin: {
            providerId: PROVIDER_A_ID,
            resourceKey: CACHE_KEY,
            revisionDigest: `sha256:${'e'.repeat(64)}`,
          },
        }
      : { status: 'absent' },
  );
  await expectResourceError(
    resolveToolResources({
      assembly: fx.binding.successorAssembly,
      componentId: TOOL_ID,
      provider: wrongResourcePin.provider,
    }),
    'INVALID_RESOURCE_PROVIDER_RESPONSE',
  );
});

// ---------------------------------------------------------------------------
// Matrix cell 10: no-ambient-fallback.
// ---------------------------------------------------------------------------

test('E9 no-ambient-fallback: a requirements-bearing Assembly without an injected provider fails closed; no default/latest/order lookup exists', async () => {
  const fx = await frozen();

  // (a) T004B: no provider injected, applicable requirements present.
  const calls: NonEffectfulToolDispatchQuery[] = [];
  const admitted = await admittedRequest(fx, OP_QUERY);
  const errorA = await expectNonEffectfulError(
    invokeNonEffectfulTool({
      request: admitted,
      binding: fx.binding,
      currentDefinitionGraph: fx.g,
      dispatch: recordingQueryDispatch(calls),
      sha256: realSha256,
    }),
    'MISSING_RESOURCE_PROVIDER',
  );
  assert.ok(errorA.message.includes('no ambient, default, or fallback resource exists'));
  assert.equal(calls.length, 0);

  // (b) T004C: same fail-closed boundary before any effect authority.
  const effectCalls: EffectfulToolDispatchQuery[] = [];
  const cell = await effectfulCell(
    fx,
    'orders.e9:instance:6',
    undefined,
    recordingDispatch(effectCalls),
    { resourceCurrentness: fx.allEvidence },
  );
  const errorB = await expectEffectfulError(
    invokeEffectfulTool(cell.input),
    'MISSING_RESOURCE_PROVIDER',
  );
  assertNoSecretLeak(errorB.message);
  assert.equal(effectCalls.length, 0);
  assert.equal(cell.journal.getRecords().length, 0);

  // (c) Direct seam: a missing provider field is not representable.
  const missingProvider = await expectResourceError(
    resolveToolResources({
      assembly: fx.binding.successorAssembly,
      componentId: TOOL_ID,
      // Deliberately absent provider — hostile input surface.
    } as unknown as ResolveToolResourcesOptions),
    'INVALID_RESOLUTION_INPUT',
  );
  assertNoSecretLeak(missingProvider.message);

  // (d) The ambient DB row that matches NO sealed-Assembly requirement is
  // never resolved — requirements not in the Assembly are never requested.
  assert.ok(
    fx.host.providerA.calls.every((request) => request.resourceKey !== UNLISTED_KEY),
    'the unlisted ambient resource was never consulted',
  );
});

test('E9 no-ambient-fallback: an Assembly with NO requirements needs no provider and resolves an empty scope', async () => {
  const fx = await frozen();
  const bareAssembly = await sealedAssembly({ omitRequirements: true });
  const bareBinding = await bindTool(bareAssembly, fx.g, TOOL_HANDLE);

  const calls: NonEffectfulToolDispatchQuery[] = [];
  const exposure = await admitToolExposure(
    {
      toolComponentId: TOOL_ID,
      operationId: OP_QUERY,
      caller: caller(),
      assembly: bareBinding.successorAssembly,
      currentDefinitionGraph: fx.g,
      policy: ADMIT_ALL,
    },
    realSha256,
  );
  const admitted = await admitToolInvocationRequest(
    {
      toolComponentId: TOOL_ID,
      operationId: OP_QUERY,
      input: { amount: 42 },
      caller: caller(),
      definitionGraphDigest: bareAssembly.record.definitionGraphDigest,
      assemblyDigest: bareBinding.successorAssembly.assemblyDigest,
      exposure,
    },
    { assembly: bareBinding.successorAssembly, currentDefinitionGraph: fx.g },
    realSha256,
  );
  await invokeNonEffectfulTool({
    request: admitted,
    binding: bareBinding,
    currentDefinitionGraph: fx.g,
    dispatch: recordingQueryDispatch(calls),
    sha256: realSha256,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.resources.size, 0);
});

// ---------------------------------------------------------------------------
// Matrix cell 11: requirements are Assembly-plane identity (T002B), and
// secret host content is excluded from every identity.
// ---------------------------------------------------------------------------

test('E9 assembly-identity: logical requirements participate in Assembly identity, never Definition identity', async () => {
  const fx = await frozen();

  // Flipping the required criticality changes the Assembly digest...
  const optionalVault = await sealedAssembly({ vaultRequired: false });
  assert.notEqual(optionalVault.assemblyDigest, fx.baseAssemblyDigest);
  // ...while the Definition identity is untouched (declarations are not
  // Definition-graph material).
  assert.equal(optionalVault.record.definitionGraphDigest, fx.definitionGraphDigest);
  assert.equal(fx.baseAssembly.record.definitionGraphDigest, fx.definitionGraphDigest);

  // Live secret host content is not identity: mutating real DB content
  // leaves BOTH digests unchanged (only the runtime revision pin moves).
  fx.host.bumpVaultSecret();
  try {
    const afterMutation = await sealedAssembly();
    assert.equal(afterMutation.assemblyDigest, fx.baseAssemblyDigest);
    assert.equal(afterMutation.record.definitionGraphDigest, fx.definitionGraphDigest);
  } finally {
    fx.host.restoreVaultSecret();
  }
});

test('E9 secret-exclusion: secrets/handles are structurally absent from Definition/Assembly identity, occurrence pins and frozen evidence', async () => {
  const fx = await frozen();

  // Sealed Assembly record: closed §F fields only — no secret/handle surface.
  const recordText = canonicalJsonStringify(fx.baseAssembly.record);
  assertNoSecretLeak(recordText);
  assert.ok(!recordText.includes('provider.e9'), 'no provider identity in Assembly identity');

  // Occurrence pin material: exact identity + non-secret digest entries only.
  const pinText = canonicalJsonStringify({
    bindingDigest: fx.frozenPinBindingDigest,
    resourceCurrentness: fx.frozenPin.resourceCurrentness,
    assemblyDigest: fx.frozenPin.assemblyDigest,
  });
  assertNoSecretLeak(pinText);
  for (const entry of fx.frozenPin.resourceCurrentness ?? []) {
    assert.deepEqual(Object.keys(entry).sort(), [
      'componentId',
      'providerId',
      'resourceKey',
      'revisionDigest',
    ]);
  }

  // The successor Assembly (dispatched at runtime) equally carries no
  // secret/handle material.
  assertNoSecretLeak(canonicalJsonStringify(fx.binding.successorAssembly.record));
});

// ---------------------------------------------------------------------------
// Matrix cell 12: torn-snapshot discipline (sync snapshot before await).
// ---------------------------------------------------------------------------

test('E9 torn-snapshot: caller mutation mid-await cannot change the synchronously snapshotted authority', async () => {
  const fx = await frozen();

  // The caller's options object is hostile: it self-mutates DURING the
  // provider suspension (mid-await), attempting to redirect the resolution.
  const options: {
    assembly: SealedRuntimeAssembly;
    componentId: string;
    provider: ResourceProvider;
  } = {
    assembly: fx.binding.successorAssembly,
    componentId: TOOL_ID,
    provider: {
      async resolve(request) {
        if (request.resourceKey === CACHE_KEY) {
          // Mid-await: the caller swaps its OWN option fields.
          (options as { componentId: string }).componentId = 'tool.e9.HIJACKED';
          (options as { assembly: unknown }).assembly = {};
          return { status: 'absent' };
        }
        return {
          status: 'resolved',
          handle: { vault: true },
          contract: { ...VAULT_CONTRACT },
          currentnessPin: { ...fx.initialVaultPin },
        };
      },
    },
  };

  const result = await resolveToolResources(options);
  // The snapshot taken synchronously BEFORE the first suspension is
  // authoritative: the hijack had zero effect.
  assert.equal(result.componentId, TOOL_ID);
  const vault = result.resources.get(VAULT_KEY);
  assert.ok(vault !== undefined && vault.status === 'resolved');

  // Provider-response snapshot discipline: a provider mutating an EARLIER
  // response object while a LATER requirement resolves cannot retroactively
  // change the already-snapshotted entry (each response is snapshotted
  // synchronously right after its own await).
  const mutableCacheResponse: Record<string, unknown> = {
    status: 'resolved',
    handle: { cache: true },
    contract: { ...CACHE_CONTRACT },
  };
  const mutatingProvider: ResourceProvider = {
    async resolve(request) {
      if (request.resourceKey === VAULT_KEY) {
        mutableCacheResponse['status'] = 'absent';
        mutableCacheResponse['contract'] = { contractId: 'HACK', version: '9.9.9' };
        return {
          status: 'resolved',
          handle: { vault: true },
          contract: { ...VAULT_CONTRACT },
          currentnessPin: { ...fx.initialVaultPin },
        };
      }
      return mutableCacheResponse as unknown as ResourceProviderResponse;
    },
  };
  const result2 = await resolveToolResources({
    assembly: fx.binding.successorAssembly,
    componentId: TOOL_ID,
    provider: mutatingProvider,
  });
  const cache2 = result2.resources.get(CACHE_KEY);
  if (cache2 === undefined || cache2.status !== 'resolved') {
    throw new Error(
      'E9: the earlier provider response was not protected by its synchronous snapshot',
    );
  }
  const vault2 = result2.resources.get(VAULT_KEY);
  if (vault2 === undefined || vault2.status !== 'resolved' || vault2.currentnessPin === undefined) {
    throw new Error('E9: expected the vault to resolve during the mutation probe');
  }
  assert.deepEqual(vault2.currentnessPin, fx.initialVaultPin);
});

// ---------------------------------------------------------------------------
// Matrix cell 13: real-host effect end-to-end (required host resource on a
// real supported host through the ONE Central Admission path).
// ---------------------------------------------------------------------------

test('E9 required-present: real-host required resource executes the effect through Central Admission under exact occurrence currentness', async () => {
  const fx = await frozen();
  const admitted = await admittedRequest(fx, OP_MUTATE);
  const gov = await governanceHarness();
  const pin = await gov.activator.activate({
    workflowTarget: WORKFLOW_TARGET,
    workflowInstanceId: INSTANCE_FROZEN,
    binding: gov.binding,
    assembly: fx.binding.successorAssembly,
    authorityClass: 'PRODUCTION',
    resourceCurrentness: fx.allEvidence,
    currentDefinitionGraph: fx.g,
  });
  // The occurrence pin IS the frozen identity (same instance, same digests).
  assert.equal(pin.bindingDigest, fx.frozenPinBindingDigest);
  assert.deepEqual(pin.resourceCurrentness, fx.frozenPin.resourceCurrentness);

  const journal = new VolatileAdmissionEffectJournal();
  const calls: EffectfulToolDispatchQuery[] = [];
  const result = await invokeEffectfulTool({
    request: admitted,
    binding: fx.binding,
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
    dispatch: recordingDispatch(calls),
    resourceProvider: fx.host.providerA,
    sha256: realSha256,
  });

  assert.equal(result.outcome.status, 'admitted');
  assert.equal(calls.length, 1);
  const query = calls[0]!;
  const vault = query.resources.get(VAULT_KEY);
  if (vault === undefined || vault.status !== 'resolved') {
    throw new Error('E9: expected the effect dispatch to carry the resolved vault');
  }
  // The dispatched handle is the real opaque SQLite live handle.
  assert.equal(
    typeof (vault.handle as { db: { prepare: unknown } }).db.prepare,
    'function',
  );

  // Exactly one durable effect through the ONE journal; no secret/handle
  // material in the journaled record.
  const records = journal.getRecords();
  assert.equal(records.length, 1);
  assertNoSecretLeak(canonicalJsonStringify(records[0]!));
});

// ---------------------------------------------------------------------------
// Matrix cell 14: zero concrete provider imports in the kernel resource seam
// (executable import-graph evidence).
// ---------------------------------------------------------------------------

test('E9 provider-injection: the kernel resource seam imports no concrete resource implementation', async () => {
  const seamPath = new URL('../../../src/contracts/resource-resolution.ts', import.meta.url);
  const source = readFileSync(seamPath, 'utf8');
  const specifiers = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1] as string);
  for (const concrete of [
    'better-sqlite3',
    'node:http',
    'node:https',
    'node:net',
    'node:fs',
    'pg',
    'mysql',
    'redis',
    'ioredis',
    '@aws-sdk',
    'aws-sdk',
  ]) {
    assert.ok(
      !specifiers.includes(concrete),
      `kernel resource seam must not import "${concrete}" (saw: ${specifiers.join(', ')})`,
    );
  }
  // The only value imports are the shared record-safety primitive and the
  // sibling contract types — the provider is a pure behavior port.
  assert.ok(specifiers.includes('./record-safety.js'));
  assert.ok(specifiers.includes('./runtime-assembly.js'));
});
