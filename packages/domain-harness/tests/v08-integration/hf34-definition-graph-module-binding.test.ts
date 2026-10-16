/**
 * v0.8 T-G #1006 HF34 (B3a) — canonical DefinitionGraph digest ↔ approved
 * module bytes join at the selected BUILD→Host pre-effect seam.
 * ===========================================================================
 *
 * The four-row exact-join audit (PR #1086, tg1006-b1-b3-four-row-exact-join-
 * audit.md) records the HF34 gap: `computeDefinitionGraphDigest` proves
 * canonical/order-invariant identity and torn-snapshot safety
 * (tests/definition-graph/*), qualified BUILD B4 refuses module byte
 * substitution after approval (compiler tests/v08-qualified-package-a01),
 * and S05 proves Host registration currentness — but NO executed assertion
 * ties the DefinitionGraph digest itself to the specific approved K/S/B
 * module identity. A module byte pin alone is not a graph-to-module
 * provenance claim: the sharpest counterexample is a byte-IDENTICAL closure
 * presented under a DIFFERENT (swapped) definition graph.
 *
 * This file verifies exactly that missing association by composing the
 * existing seams — no second DefinitionGraph runtime, no new graph engine,
 * no production change:
 *
 * - one graph Component per sealed module whose `semanticBody` carries the
 *   module's exact byte digest, so the canonical graph digest G is a
 *   function of the APPROVED module bytes plus the definition structure;
 * - G is committed into the approved closure identity through the existing
 *   `rootPackageId` carrier (`app:v08:hf34:graph:<G>`): computeSubjectDigest
 *   covers rootPackageId + per-module digests + bindings, the issuer signs
 *   that subject, and the Host registration pin commits
 *   appId+audience+rootPackageId+closureDigest+module digests durably.
 *
 * Every rejection below lands on an EXISTING typed gate BEFORE any module
 * byte executes or any effect dispatches (zero-dispatch accounting reused
 * from S05): `GATEWAY_APP_CLOSURE_MISMATCH` fires at registration from the
 * durable pin comparison, strictly before `DomainHarness.load`.
 *
 * Vectors:
 *   HF34-P   positive: canonical digest order-invariance; approval subject
 *            equality; the digest recomputed from the DELIVERED sealed bytes
 *            equals the committed G; and the bound closure actually executes
 *            one real effectful occurrence on the real SQLite Host selected
 *            path (admission → journal → own capability handler output) —
 *            side effects happen exactly when the join holds.
 *   HF34-N1  swapped graph: a second legitimately approved closure over the
 *            BYTE-IDENTICAL modules whose only difference is the committed
 *            definition graph digest — refused pre-load for the graph-bound
 *            pinned appId; the pinned app keeps executing its own handler.
 *   HF34-N2  missing graph commitment: the same bytes sealed without any
 *            graph digest in the closure identity — refused pre-load; the
 *            join is mandatory, not optional.
 *   HF34-N3  torn snapshot: the graph is mutated while a digest promise is
 *            pending (the #555 adversarial Sha256Port pattern reused from
 *            definition-graph-torn-snapshot.test.ts) — the seam admits only
 *            the pre-suspension snapshot digest; the mutated graph's own
 *            digest differs, and its closure is refused pre-load.
 *   HF34-N4  late/stale graph: the definition evolved (business bytes v2 →
 *            new module digests → new graph digest); after the fresh appId
 *            is pinned to the evolved closure, the superseded original
 *            closure arrives late and is refused pre-load ("stale roots
 *            refuse before load"), while the evolved app still executes.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computeDefinitionGraphDigest,
  type DefinitionGraphEnvelope,
  type DefinitionRelation,
} from '../../src/contracts/definition-graph.js';
import type { ComponentEnvelope } from '../../src/contracts/component.js';
import type { JsonValue } from '../../src/contracts/json.js';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  BuildError,
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
  type UnsignedQualification,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import {
  bootstrapTrustedHost,
  createKernelGateway,
  mintPrincipalCredential,
  type KernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const examplesDir = new URL('../../../../examples/v08-domain-apps/', import.meta.url);

const AUDIENCE = 'dh-v08-hf34';
const TENANT = 't-hf34';
const CAPABILITY_ID = 'cap:quote-tools';
const APP_BOUND = 'hf34-graph-bound';
const APP_EVOLVED = 'hf34-graph-evolved';
const GRAPH_ID = 'graph.hf34-definition';

const realSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Definition graph over the sealed module slots (one Component per module;
// the semantic body carries the module's exact byte digest, so the canonical
// graph digest commits to the APPROVED bytes, not just to structure).
// ---------------------------------------------------------------------------

interface ModuleSlot {
  readonly componentId: string;
  readonly kindId: string;
  readonly modulePath: string;
}

const MODULE_SLOTS: readonly ModuleSlot[] = [
  { componentId: 'component.kernel-mechanism', kindId: 'v08.kernel-mechanism', modulePath: 'modules/kernel.mjs' },
  { componentId: 'component.standard-sdk', kindId: 'v08.standard-sdk', modulePath: 'modules/standard.mjs' },
  { componentId: 'component.business-policy', kindId: 'v08.business-policy', modulePath: 'modules/business.mjs' },
  { componentId: 'component.capability-quote-tools', kindId: 'v08.capability-quote-tools', modulePath: 'modules/capability.mjs' },
];

const GRAPH_RELATIONS: readonly DefinitionRelation[] = [
  {
    relationId: 'rel.business-depends-standard-sdk',
    relationKind: 'depends-on',
    sourceComponentId: 'component.business-policy',
    targetComponentId: 'component.standard-sdk',
  },
  {
    relationId: 'rel.standard-sdk-depends-kernel',
    relationKind: 'depends-on',
    sourceComponentId: 'component.standard-sdk',
    targetComponentId: 'component.kernel-mechanism',
  },
  {
    relationId: 'rel.business-consumes-capability',
    relationKind: 'consumes',
    sourceComponentId: 'component.business-policy',
    targetComponentId: 'component.capability-quote-tools',
  },
];

interface GraphOverrides {
  /** N1: definition-plane semantic change with byte-identical modules. */
  readonly swapBusinessSemantics?: boolean;
}

function buildGraph(moduleDigests: ReadonlyMap<string, string>, overrides: GraphOverrides = {}): DefinitionGraphEnvelope {
  const components: ComponentEnvelope[] = MODULE_SLOTS.map((slot) => {
    const moduleSha256 = moduleDigests.get(slot.modulePath);
    assert.ok(moduleSha256 !== undefined, `graph fixture needs the digest of ${slot.modulePath}`);
    const semanticBody: Record<string, JsonValue> =
      overrides.swapBusinessSemantics === true && slot.componentId === 'component.business-policy'
        ? { modulePath: slot.modulePath, moduleSha256, policyRevision: 2 }
        : { modulePath: slot.modulePath, moduleSha256 };
    return {
      family: 'semantic',
      componentId: slot.componentId,
      kind: { kindId: slot.kindId, version: '1.0.0' },
      requiredSemanticContracts: [{ contractId: `contract.${slot.kindId}`, version: '1.0.0' }],
      requiredCapabilities: [{ capabilityId: `cap.${slot.kindId}`, version: '1.0.0' }],
      semanticBody,
    };
  });
  return { graphId: GRAPH_ID, components, relations: GRAPH_RELATIONS };
}

// ---------------------------------------------------------------------------
// REAL selected BUILD path over the REAL payload/examples module bytes
// (same fixture sources as S05), parameterized by the committed rootPackageId.
// ---------------------------------------------------------------------------

interface ModuleBytes {
  readonly kernel: string;
  readonly sdk: string;
  readonly business: string;
  readonly capability: string;
}

interface ModuleNamespace {
  readonly MODULE_ID: string;
  readonly ABI_VERSION: string;
  readonly ENDPOINTS: readonly { endpointId: string; kind: string }[];
  readonly INTENT_TYPES?: readonly string[];
}

async function importModuleSource(source: string): Promise<ModuleNamespace> {
  return (await import(`data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`)) as ModuleNamespace;
}

function moduleDigestsOf(bytes: ModuleBytes): Map<string, string> {
  return new Map([
    ['modules/kernel.mjs', sha256Hex(bytes.kernel)],
    ['modules/standard.mjs', sha256Hex(bytes.sdk)],
    ['modules/business.mjs', sha256Hex(bytes.business)],
    ['modules/capability.mjs', sha256Hex(bytes.capability)],
  ]);
}

interface SealedClosure {
  readonly root: SealedQualifiedPackageRoot;
  readonly unsigned: UnsignedQualification;
  readonly modulePathByPackageId: ReadonlyMap<string, string>;
}

async function sealClosure(rootPackageId: string, bytes: ModuleBytes): Promise<SealedClosure> {
  const [kernel, sdk, business, capability] = await Promise.all([
    importModuleSource(bytes.kernel),
    importModuleSource(bytes.sdk),
    importModuleSource(bytes.business),
    importModuleSource(bytes.capability),
  ]);
  const packages = [
    { packageId: kernel.MODULE_ID, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION, modulePath: 'modules/kernel.mjs', moduleSource: bytes.kernel, endpoints: kernel.ENDPOINTS },
    { packageId: sdk.MODULE_ID, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION, modulePath: 'modules/standard.mjs', moduleSource: bytes.sdk, endpoints: sdk.ENDPOINTS },
    { packageId: business.MODULE_ID, kind: 'business' as const, abiVersion: business.ABI_VERSION, modulePath: 'modules/business.mjs', moduleSource: bytes.business, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES ?? [] },
    { packageId: capability.MODULE_ID, kind: 'capability' as const, abiVersion: capability.ABI_VERSION, modulePath: 'modules/capability.mjs', moduleSource: bytes.capability, endpoints: capability.ENDPOINTS },
  ];
  const submission: QualificationSubmission = {
    rootPackageId,
    packages,
    bindings: [
      { role: 'kernel', packageId: kernel.MODULE_ID, endpointId: kernel.ENDPOINTS[0]!.endpointId },
      { role: 'standard-sdk', packageId: sdk.MODULE_ID, endpointId: sdk.ENDPOINTS[0]!.endpointId },
      { role: 'business', packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0]!.endpointId },
      ...[...(business.INTENT_TYPES ?? [])].map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0]!.endpointId,
      })),
      {
        role: 'capability' as const,
        capabilityId: CAPABILITY_ID,
        packageId: capability.MODULE_ID,
        endpointId: capability.ENDPOINTS[0]!.endpointId,
        handlers: [
          { operationId: 'quote.preview-total', handler: 'previewTotal' },
          { operationId: 'quote.reserve', handler: 'reserveLedger' },
        ],
      },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-16T00:00:00.000Z',
  });
  const root = buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-hf34',
  }) as SealedQualifiedPackageRoot;
  return { root, unsigned, modulePathByPackageId: new Map(packages.map((pkg) => [pkg.packageId, pkg.modulePath])) };
}

// ---------------------------------------------------------------------------
// ONE trusted host bootstrap per process (the trust channel is one-shot);
// every vector owns distinct appIds/instances on the shared real SQLite Host.
// ---------------------------------------------------------------------------

interface SharedContext {
  readonly handle: TrustedHostHandle;
  readonly gateway: KernelGateway;
  readonly dir: string;
  readonly bytes: ModuleBytes;
  readonly graph: DefinitionGraphEnvelope;
  /** Canonical digest of the admitted original definition graph. */
  readonly graphDigest: string;
  /** The original closure: real BUILD path, rootPackageId commits graphDigest. */
  readonly bound: SealedClosure;
  closed: boolean;
}

let shared: SharedContext;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'dh1006-hf34-'));
  const [kernel, sdk, business, capability] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('business-approval.mjs', examplesDir), 'utf8'),
    readFile(new URL('capability-quote-tools.mjs', examplesDir), 'utf8'),
  ]);
  const bytes: ModuleBytes = { kernel, sdk, business, capability };
  const graph = buildGraph(moduleDigestsOf(bytes));
  const graphDigest = await computeDefinitionGraphDigest(graph, realSha256);
  const bound = await sealClosure(`app:v08:hf34:graph:${graphDigest}`, bytes);
  const handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: join(dir, 'hf34.sqlite') },
  });
  const gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  shared = { handle, gateway, dir, bytes, graph, graphDigest, bound, closed: false };
});

after(async () => {
  if (!shared.closed) await shared.handle.host.close();
  await rm(shared.dir, { recursive: true, force: true });
});

function credential(appId: string, roles: readonly string[], subject: string): string {
  return mintPrincipalCredential({
    issuerId: INTEG_ISSUER,
    grantId: `g-hf34-${appId}-${subject}`,
    tenantId: TENANT,
    appId,
    subject,
    audience: AUDIENCE,
    roles,
    issuedAt: '2026-10-16T00:00:00.000Z',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }, INTEG_ISSUER_SECRET) as unknown as string;
}

function invoke(appId: string, cred: string, request: { operationId: string; input: unknown; instanceKey: string; messageId: string }): Promise<unknown> {
  return shared.gateway.invokeOperation(cred, {
    appId,
    capabilityId: CAPABILITY_ID,
    operationId: request.operationId,
    input: request.input,
    instanceKey: request.instanceKey,
    messageId: request.messageId,
  });
}

async function journalRecords(): Promise<{ effectId: string; status: string; output?: unknown }[]> {
  const keys = await shared.handle.host.docs.list('v08-kernel:effect-journal:');
  const records: { effectId: string; status: string; output?: unknown }[] = [];
  for (const key of keys) {
    const doc = await shared.handle.host.docs.get(key);
    const record = (doc?.value as { record?: { effectId?: string; status?: string; output?: unknown } } | null)?.record;
    if (record !== undefined) {
      records.push({
        effectId: String(record.effectId ?? key),
        status: String(record.status ?? 'unknown'),
        ...(Object.hasOwn(record, 'output') ? { output: record.output } : {}),
      });
    }
  }
  return records;
}

/**
 * A second gateway on the SAME physical Host: its in-memory app map is
 * empty, so a registration of an already-live appId reaches the DURABLE pin
 * comparison (the S05 forged-closure pattern — the in-memory gateway would
 * refuse earlier with GATEWAY_APP_ALREADY_REGISTERED before the pin).
 */
function rivalGateway(): KernelGateway {
  return createKernelGateway({ host: shared.handle.host, gatewaySessionCap: shared.handle.gatewaySessionCap });
}

async function callCode(run: () => Promise<unknown>): Promise<{ receipt?: Record<string, unknown>; code?: string; message?: string }> {
  try {
    return { receipt: (await run()) as Record<string, unknown> };
  } catch (error) {
    return { code: String((error as { code?: unknown })?.code ?? ''), message: String((error as Error)?.message ?? error) };
  }
}

/** The own capability handler's durable effect output (no foreign handler marker). */
function isOwnHandlerOutput(output: unknown, requestId: string): boolean {
  const record = output as Record<string, unknown> | null | undefined;
  return record !== null && typeof record === 'object'
    && record.reserved === true
    && record.handler === undefined
    && typeof record.ledgerEntryId === 'string'
    && record.ledgerEntryId.startsWith('ledger:')
    && record.requestId === requestId;
}

test('HF34-P: graph digest binds the approved module bytes and the bound closure executes on the real selected Host', { timeout: 180_000 }, async () => {
  // Canonical identity is order-insensitive: a reordered presentation of the
  // SAME definition computes the SAME digest, so the join is on canonical
  // graph identity, never on incidental component/relation order.
  const reordered: DefinitionGraphEnvelope = {
    graphId: shared.graph.graphId,
    components: [...shared.graph.components].reverse(),
    relations: [...shared.graph.relations].slice().reverse(),
  };
  assert.equal(await computeDefinitionGraphDigest(reordered, realSha256), shared.graphDigest);

  // The graph's component material carries EXACTLY the byte identities the
  // qualification pinned (the join uses the approval's own module digests).
  for (const pkg of shared.bound.unsigned.packages) {
    const slot = MODULE_SLOTS.find((candidate) => candidate.modulePath === shared.bound.modulePathByPackageId.get(pkg.packageId));
    assert.ok(slot !== undefined);
    const component = shared.graph.components.find((candidate) => candidate.componentId === slot.componentId);
    assert.ok(component !== undefined);
    assert.equal(
      (component.semanticBody as { moduleSha256?: unknown }).moduleSha256,
      pkg.moduleSha256,
      `graph component ${slot.componentId} pins the approved ${pkg.packageId} byte digest`,
    );
  }

  // Equality positive: the canonical digest recomputed from the DELIVERED
  // sealed bytes equals the committed graph digest, which is part of the
  // approved closure identity the Host pins.
  const deliveredDigests = new Map<string, string>();
  for (const pkg of shared.bound.root.packages) {
    assert.equal(sha256Hex(pkg.moduleSource), pkg.moduleSha256, 'delivered bytes still hash to the approved pin');
    deliveredDigests.set(shared.bound.modulePathByPackageId.get(pkg.packageId)!, sha256Hex(pkg.moduleSource));
  }
  assert.equal(await computeDefinitionGraphDigest(buildGraph(deliveredDigests), realSha256), shared.graphDigest);
  assert.ok(
    shared.bound.root.rootPackageId.endsWith(shared.graphDigest),
    'the approved closure identity commits the canonical DefinitionGraph digest',
  );
  assert.equal(shared.bound.root.build.closureDigest, shared.bound.unsigned.subjectDigest);

  // The real selected path: registration pins the graph-bound identity, and
  // one effectful occurrence runs admission → journal → own handler output.
  await shared.gateway.registerApp({ appId: APP_BOUND, packageRoot: shared.bound.root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });
  const cred = credential(APP_BOUND, ['requester'], 'hf34-user');
  const op = credential(APP_BOUND, ['platform-operator'], 'hf34-op');
  await shared.gateway.activateGenesis(op, { appId: APP_BOUND, instanceKey: 'q-hf34-p' });
  const baseline = (await journalRecords()).map((record) => record.effectId);
  const effect = (await invoke(APP_BOUND, cred, {
    operationId: 'quote.reserve', input: { amount: 20, requestId: 'HF34-P-1' }, instanceKey: 'q-hf34-p', messageId: 'm-hf34-p-1',
  })) as Record<string, unknown>;
  assert.equal(effect.status, 'admitted');
  const fresh = (await journalRecords()).filter((record) => !baseline.includes(record.effectId));
  assert.equal(fresh.length, 1, 'exactly one durable effect for the bound app');
  assert.equal(fresh[0]?.status, 'completed');
  assert.ok(isOwnHandlerOutput(fresh[0]?.output, 'HF34-P-1'), `the bound closure executed its OWN handler (got ${JSON.stringify(fresh[0]?.output)})`);
});

test('HF34-N1: a byte-identical closure under a SWAPPED definition graph is refused before load and dispatch', { timeout: 180_000 }, async () => {
  // The falsifier the audit demands: module byte pin alone cannot catch a
  // definition-plane swap. Both closures seal the EXACT same module bytes;
  // only the committed graph digest differs.
  const swappedDigest = await computeDefinitionGraphDigest(buildGraph(moduleDigestsOf(shared.bytes), { swapBusinessSemantics: true }), realSha256);
  assert.notEqual(swappedDigest, shared.graphDigest, 'the swapped definition graph has a different canonical identity');
  const swapped = await sealClosure(`app:v08:hf34:graph:${swappedDigest}`, shared.bytes);
  const identityOf = (closure: SealedClosure): string[] =>
    closure.root.packages.map((pkg) => `${pkg.packageId}:${pkg.moduleSha256}`).sort();
  assert.deepEqual(identityOf(swapped), identityOf(shared.bound), 'the two closures are BYTE-IDENTICAL — only the committed graph digest differs');
  assert.notEqual(swapped.root.rootPackageId, shared.bound.root.rootPackageId);

  // Refused at registration from the durable pin, strictly BEFORE load: the
  // swapped-graph closure's module bytes never execute, nothing dispatches.
  const dispatchBefore = shared.handle.host.resources.callCount();
  const refused = await callCode(() => rivalGateway().registerApp({ appId: APP_BOUND, packageRoot: swapped.root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' }));
  assert.equal(refused.code, 'GATEWAY_APP_CLOSURE_MISMATCH', `the swapped-graph closure refuses typed (got ${refused.code}: ${refused.message})`);
  assert.equal(shared.handle.host.resources.callCount(), dispatchBefore, 'the refused registration dispatched nothing');

  // The graph-bound pinned app keeps executing its own handler afterwards.
  const cred = credential(APP_BOUND, ['requester'], 'hf34-user');
  const op = credential(APP_BOUND, ['platform-operator'], 'hf34-op');
  await shared.gateway.activateGenesis(op, { appId: APP_BOUND, instanceKey: 'q-hf34-n1' });
  const baseline = (await journalRecords()).map((record) => record.effectId);
  const effect = (await invoke(APP_BOUND, cred, {
    operationId: 'quote.reserve', input: { amount: 5, requestId: 'HF34-N1-1' }, instanceKey: 'q-hf34-n1', messageId: 'm-hf34-n1-1',
  })) as Record<string, unknown>;
  assert.equal(effect.status, 'admitted');
  const fresh = (await journalRecords()).filter((record) => !baseline.includes(record.effectId));
  assert.ok(fresh.length === 1 && fresh[0]?.status === 'completed' && isOwnHandlerOutput(fresh[0]?.output, 'HF34-N1-1'), 'the pinned graph-bound app still executes its own handler');
});

test('HF34-N2: the same bytes sealed WITHOUT a graph commitment are refused before load for a graph-bound app', { timeout: 180_000 }, async () => {
  // A second legitimately approved, well-formed closure over the identical
  // modules whose identity carries NO canonical graph digest. For the
  // graph-bound pinned app this is a MISSING association — refused pre-load.
  const unbound = await sealClosure('app:v08:hf34:graph-unbound', shared.bytes);
  assert.deepEqual(
    unbound.root.packages.map((pkg) => `${pkg.packageId}:${pkg.moduleSha256}`).sort(),
    shared.bound.root.packages.map((pkg) => `${pkg.packageId}:${pkg.moduleSha256}`).sort(),
    'byte-identical modules; only the graph commitment is missing',
  );
  assert.ok(!unbound.root.rootPackageId.endsWith(shared.graphDigest));

  const dispatchBefore = shared.handle.host.resources.callCount();
  const refused = await callCode(() => rivalGateway().registerApp({ appId: APP_BOUND, packageRoot: unbound.root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' }));
  assert.equal(refused.code, 'GATEWAY_APP_CLOSURE_MISMATCH', `the graphless closure refuses typed (got ${refused.code}: ${refused.message})`);
  assert.equal(shared.handle.host.resources.callCount(), dispatchBefore, 'the refused registration dispatched nothing');
});

test('HF34-N3: a mid-flight torn graph can never capture the admitted identity; its closure is refused before load', { timeout: 180_000 }, async () => {
  // The #555 adversarial pattern reused from definition-graph-torn-snapshot:
  // mutate the caller-owned graph while the FIRST component digest promise
  // is still pending. The seam must admit only the pre-suspension snapshot.
  type MutableComponent = { -readonly [K in keyof ComponentEnvelope]: ComponentEnvelope[K] };
  type MutableGraph = {
    -readonly [K in keyof DefinitionGraphEnvelope]: DefinitionGraphEnvelope[K] extends readonly (infer T)[] ? T[] : DefinitionGraphEnvelope[K];
  };
  const buildVictim = (): MutableGraph => JSON.parse(JSON.stringify(shared.graph)) as MutableGraph;
  const victim = buildVictim();
  let mutationCalls = 0;
  const adversarial: Sha256Port = {
    async digestUtf8(value: string): Promise<string> {
      if (mutationCalls === 0) {
        // Not yet hashed at this suspension: the graphId (hashed at graph
        // level), the later components and the relation list.
        victim.graphId = 'graph.hf34-mutated-after-admission';
        const capabilityComponent = victim.components.find((component) => component.componentId === 'component.capability-quote-tools') as MutableComponent;
        capabilityComponent.semanticBody = { ...(capabilityComponent.semanticBody as Record<string, unknown>), policyRevision: 999 };
        victim.components.push({
          family: 'semantic',
          componentId: 'component.hf34-torn-extra',
          kind: { kindId: 'v08.hf34-torn-extra', version: '1.0.0' },
          requiredSemanticContracts: [{ contractId: 'contract.v08.hf34-torn-extra', version: '1.0.0' }],
          requiredCapabilities: [{ capabilityId: 'cap.v08.hf34-torn-extra', version: '1.0.0' }],
          semanticBody: { modulePath: 'modules/torn-extra.mjs', moduleSha256: sha256Hex('torn-extra-bytes') },
        });
        victim.relations.push({
          relationId: 'rel.kernel-supports-torn-extra',
          relationKind: 'supports',
          sourceComponentId: 'component.kernel-mechanism',
          targetComponentId: 'component.hf34-torn-extra',
        });
      }
      mutationCalls += 1;
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };

  const tornDigest = await computeDefinitionGraphDigest(victim as unknown as DefinitionGraphEnvelope, adversarial);
  assert.equal(tornDigest, shared.graphDigest, 'the seam admits only the pre-suspension snapshot digest, never a torn hybrid');
  const mutatedDigest = await computeDefinitionGraphDigest(victim as unknown as DefinitionGraphEnvelope, realSha256);
  assert.notEqual(mutatedDigest, shared.graphDigest, 'the mutated graph can never reproduce the admitted identity');

  // Pre-effect consequence: a legitimately approved closure committed to the
  // torn/mutated graph digest is NOT the pinned graph-bound closure.
  const torn = await sealClosure(`app:v08:hf34:graph:${mutatedDigest}`, shared.bytes);
  const dispatchBefore = shared.handle.host.resources.callCount();
  const refused = await callCode(() => rivalGateway().registerApp({ appId: APP_BOUND, packageRoot: torn.root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' }));
  assert.equal(refused.code, 'GATEWAY_APP_CLOSURE_MISMATCH', `the torn-graph closure refuses typed (got ${refused.code}: ${refused.message})`);
  assert.equal(shared.handle.host.resources.callCount(), dispatchBefore, 'the refused registration dispatched nothing');
});

test('HF34-N4: a LATE closure of the superseded graph is refused before load; the evolved graph-bound app still executes', { timeout: 180_000 }, async () => {
  // Definition evolution: the business module bytes change (v2), so their
  // approved digests change and the canonical graph digest changes with them.
  const evolvedBusiness = `${shared.bytes.business}\n// v0.8 T-G #1006 HF34: evolved business bytes (definition v2)\n`;
  const evolvedBytes: ModuleBytes = { ...shared.bytes, business: evolvedBusiness };
  const evolvedDigest = await computeDefinitionGraphDigest(buildGraph(moduleDigestsOf(evolvedBytes)), realSha256);
  assert.notEqual(evolvedDigest, shared.graphDigest);
  const evolved = await sealClosure(`app:v08:hf34:graph:${evolvedDigest}`, evolvedBytes);
  await shared.gateway.registerApp({ appId: APP_EVOLVED, packageRoot: evolved.root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' });

  // The superseded original-graph closure arrives LATE for the appId now
  // durably pinned to the evolved closure: refused BEFORE load — its module
  // bytes never execute, nothing dispatches.
  const dispatchBefore = shared.handle.host.resources.callCount();
  const late = await callCode(() => rivalGateway().registerApp({ appId: APP_EVOLVED, packageRoot: shared.bound.root, genesisRoles: ['platform-operator'], authorityClass: 'PRODUCTION' }));
  assert.equal(late.code, 'GATEWAY_APP_CLOSURE_MISMATCH', `the stale root refuses typed (got ${late.code}: ${late.message})`);
  assert.ok((late.message ?? '').includes('stale roots refuse before load'), `the refusal names the stale-root currentness guard (got: ${late.message})`);
  assert.equal(shared.handle.host.resources.callCount(), dispatchBefore, 'the refused late registration dispatched nothing');

  // The CURRENT (evolved) app still executes its own handler on the same Host.
  const cred = credential(APP_EVOLVED, ['requester'], 'hf34-evo');
  const op = credential(APP_EVOLVED, ['platform-operator'], 'hf34-evo-op');
  await shared.gateway.activateGenesis(op, { appId: APP_EVOLVED, instanceKey: 'q-hf34-n4' });
  const baseline = (await journalRecords()).map((record) => record.effectId);
  const effect = (await invoke(APP_EVOLVED, cred, {
    operationId: 'quote.reserve', input: { amount: 8, requestId: 'HF34-N4-1' }, instanceKey: 'q-hf34-n4', messageId: 'm-hf34-n4-1',
  })) as Record<string, unknown>;
  assert.equal(effect.status, 'admitted');
  const fresh = (await journalRecords()).filter((record) => !baseline.includes(record.effectId));
  assert.ok(fresh.length === 1 && fresh[0]?.status === 'completed' && isOwnHandlerOutput(fresh[0]?.output, 'HF34-N4-1'), 'the evolved graph-bound app still executes its own handler');
});

test('HF34-B: swapped module BYTES under the admitted graph digest are refused at seal time (BUILD_SUBJECT_DRIFT)', { timeout: 60_000 }, async () => {
  // The byte side of the join: the approval commits the module digests the
  // graph was computed over, so presenting SWAPPED bytes at seal time —
  // while keeping the graph-committed rootPackageId — is a typed BUILD
  // refusal before any module is executed. (Reuses the A01-B4 seam with the
  // graph-bound identity.)
  const swappedKernel = `${shared.bytes.kernel}\n// v0.8 T-G #1006 HF34: swapped kernel bytes\n`;
  const graphPinned = await sealClosureDraft(shared.graphDigest, shared.bytes);
  const swappedSources = new Map(graphPinned.moduleSources);
  swappedSources.set('modules/kernel.mjs', swappedKernel);
  assert.throws(
    () => buildQualifiedPackage({ unsigned: graphPinned.unsigned, approval: graphPinned.approval, trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]), moduleSources: swappedSources, baseCommit: 'v0.8-hf34' }),
    (error: unknown) => error instanceof BuildError && error.code === 'BUILD_SUBJECT_DRIFT',
    'swapped module bytes cannot seal under the graph-committed approval',
  );
  // And the swapped bytes would change the canonical graph digest itself —
  // the definition graph never vouches for bytes it was not computed over.
  const swappedGraphDigest = await computeDefinitionGraphDigest(
    buildGraph(new Map([...moduleDigestsOf(shared.bytes), ['modules/kernel.mjs', sha256Hex(swappedKernel)]])),
    realSha256,
  );
  assert.notEqual(swappedGraphDigest, shared.graphDigest);
});

/** A closure draft kept unsealed: unsigned qualification + minted approval + module sources. */
async function sealClosureDraft(graphDigest: string, bytes: ModuleBytes): Promise<{ unsigned: UnsignedQualification; approval: ReturnType<typeof issueApprovalProof>; moduleSources: Map<string, string> }> {
  const sealed = await sealClosure(`app:v08:hf34:graph:${graphDigest}`, bytes);
  // Re-derive the approval for the same subject (the sealed root's approval
  // is already attached; sealing again with drifted bytes needs the proof
  // object itself, so mint an identical-purpose one here).
  const approval = issueApprovalProof({
    subjectDigest: sealed.unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-16T00:00:00.000Z',
  });
  const moduleSources = new Map<string, string>();
  for (const pkg of sealed.root.packages) {
    moduleSources.set(sealed.modulePathByPackageId.get(pkg.packageId)!, pkg.moduleSource);
  }
  return { unsigned: sealed.unsigned, approval, moduleSources };
}
