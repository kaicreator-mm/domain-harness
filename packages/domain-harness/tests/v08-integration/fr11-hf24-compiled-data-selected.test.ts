/**
 * #1006 T-G FR11/HF24 — the ONE shared selected-path witness for compiler
 * produced compiled Domain Data and Business Sources.
 * ===========================================================================
 *
 * The compiler-side emission and refusals are already executed inherited
 * evidence (`domain-data-section` / `business-source-section` suites), and
 * the FR05 selected multi-source projection currentness/tenancy negatives
 * stay owned by `fr05-hf17-hf23-selected-physical.test.ts`. This file
 * closes ONLY the missing join those suites cannot prove:
 *
 *   1. PUBLIC-compiler output (domainData + businessSources sections and
 *      the compiled projection declarations that bind them) is packed by
 *      BUILD into the sealed Business module bytes, sealed through the
 *      REAL qualify → approve → build path, loaded by the REAL
 *      `DomainHarness.load` composition and REGISTERED on the trusted
 *      Host gateway.
 *   2. FR11-P: the compiled Domain Data is READ through the selected
 *      Host→K→SDK path (`queryDomainData`): the sealed SDK's retained
 *      projection returns the exact compiled values, content digests and
 *      declared valueSchema, ALWAYS in the compiled deterministic key
 *      order regardless of request order.
 *   3. HF24-P: one compiler-declared Business Source is bound INTO that
 *      same read through the SAME authenticated principal-qualified K
 *      instance read as `queryInstance`, admitted against the exact
 *      compiler-declared schema contract.
 *   4. Negatives (fail-closed BEFORE any effect): a compromised producer
 *      whose bundled value violates its own compiled valueSchema — with
 *      every digest honestly recomputed — refuses the LOAD typed
 *      (DOMAIN_DATA_SCHEMA_VIOLATION); a corrupted descriptor digest
 *      refuses the load typed (DOMAIN_DATA_DIGEST_MISMATCH); a
 *      substituted/undeclared business source (SDK_BUSINESS_SOURCE_
 *      UNDECLARED), a stale schema observation (SDK_BUSINESS_SOURCE_
 *      SCHEMA_VIOLATION) and an undeclared Domain Data key
 *      (SDK_DOMAIN_DATA_KEY_UNDECLARED) refuse the READ typed.
 *
 * No second runtime is booted anywhere: the raw successor runtime and its
 * StaticPackageRegistry remain the R3 evidence; this witness exercises
 * exclusively the selected v0.8 K/S/B closure.
 */
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { compileDomainPackage } from '../../../domain-harness-compiler/src/index.js';
import type {
  BusinessSourceCompileEntry,
  DomainDataCompileEntry,
} from '../../../domain-harness-compiler/src/index.js';
import type {
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawWorkflow,
  TargetHostProfile,
} from '../../../domain-harness-compiler/src/raw/types.js';
import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import { DomainHarness, QualifiedPackageError } from '../../src/public-v8/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import {
  bootstrapTrustedHost,
  createKernelGateway,
  type HostCredential,
  type KernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import { canonicalJsonStringify } from '../../src/contracts/identity.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1 } from '../../src/schema/domainharness-json-schema-v1.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sqliteTempPath } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);
const COMPILED_DATA_ANCHOR = '/* @compiledPackageData */ null';

const AUDIENCE = 'dh-v08-fr11hf24';
const APP_ID = 'compiled-data';
const TENANT = 't1';

/** The same tier contract the R3 raw-runtime consumer witness uses. */
const TIER_SCHEMA = {
  type: 'object',
  required: ['level'],
  additionalProperties: false,
  properties: { level: { type: 'integer', minimum: 0 } },
};

/**
 * The declared `crm` source contract: a REAL K instance snapshot (which
 * always carries the K-attested integer `stateRevision`) satisfies it; the
 * declared `ledger` source deliberately requires a field no instance
 * snapshot carries, so binding it is the stale-schema negative.
 */
const CRM_SOURCE_SCHEMA = {
  type: 'object',
  required: ['stateRevision'],
  properties: { stateRevision: { type: 'integer' } },
  additionalProperties: true,
};
const LEDGER_SOURCE_SCHEMA = {
  type: 'object',
  required: ['ledgerAccount'],
  properties: { ledgerAccount: { type: 'string' } },
  additionalProperties: true,
};

const WITNESS_BOUNDS = {
  maxDomainDataEntries: 32,
  maxDomainDataEntryCanonicalBytes: 4096,
  maxTotalDomainDataCanonicalBytes: 16384,
  maxBusinessSources: 32,
  maxSchemaCanonicalBytes: 8192,
} as const;

/** Compile the witness through the PUBLIC compiler entry — the only fixture source. */
function compileWitness(): {
  readonly compound: Record<string, unknown>;
  readonly manifest: ReturnType<typeof compileDomainPackage>['manifest'];
} {
  const witnessWorkflow: RawWorkflow = {
    id: 'parent',
    sourcePath: '/authoring/parent.yaml',
    initial: 'start',
    states: {
      start: { id: 'start', final: false, done: [], error: [], events: { BEGIN: { routes: [{ target: 'done' }] } } },
      done: { id: 'done', final: true, done: [], error: [], events: {} },
    },
  };
  const raw: LoadedRawDomainPackage = {
    root: '/fr11-hf24-witness',
    schemaVersion: '0.1',
    domainId: 'witness.compiled',
    limits: { maxSteps: 16 },
    workflows: new Map([[witnessWorkflow.id, witnessWorkflow]]),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map([[witnessWorkflow.id, []]]),
  };
  const target: TargetHostProfile = {
    id: 'fr11-hf24-witness@1',
    capabilities: ['crypto-hash-sha256@1', 'compiled-package-module@1'],
    bindings: {
      'crypto-hash-sha256@1': 'fr11hf24-sha256-v1',
      'compiled-package-module@1': 'fr11hf24-module-v1',
    },
    packageDataBounds: { ...WITNESS_BOUNDS },
  };
  const domainData: readonly DomainDataCompileEntry[] = [
    { key: 'tier', value: { level: 1 }, valueSchema: TIER_SCHEMA },
    { key: 'cap', value: { limit: 50 } },
  ];
  const businessSources: readonly BusinessSourceCompileEntry[] = [
    { source: 'crm', valueSchema: CRM_SOURCE_SCHEMA },
    { source: 'ledger', valueSchema: LEDGER_SOURCE_SCHEMA },
  ];
  const projections: readonly RawProjectionDefinition[] = [
    {
      projectionId: 'proj:compiled-overview',
      expression: '$',
      dependencies: [
        { kind: 'domain-data', key: 'tier' },
        { kind: 'domain-data', key: 'cap' },
        { kind: 'business', source: 'crm', selector: {} },
        { kind: 'business', source: 'ledger', selector: {} },
      ],
      outputSchema: { type: 'object', additionalProperties: true },
    },
  ];
  const compiled = compileDomainPackage({
    raw,
    domainVersion: '1.0.0-fr11hf24',
    target,
    bindingContents: {
      'fr11hf24-sha256-v1': 'fr11hf24 witness sha256 adapter artifact',
      'fr11hf24-module-v1': 'fr11hf24 witness compiled module loader artifact',
    },
    domainData,
    businessSources,
    projections,
  });
  // The compiler emits deterministic compiled order ('cap' < 'tier'; 'crm'
  // < 'ledger') and the projection declarations that BIND every Domain
  // Data key and Business Source (orphan entries refuse compilation).
  assert.ok(compiled.manifest.domainData !== undefined && compiled.manifest.businessSources !== undefined);
  assert.deepEqual(
    compiled.manifest.domainData.map((descriptor) => descriptor.key),
    ['cap', 'tier'],
  );
  assert.deepEqual(
    compiled.manifest.businessSources.map((descriptor) => descriptor.source),
    ['crm', 'ledger'],
  );
  assert.deepEqual(Object.keys(compiled.manifest.projections), ['proj:compiled-overview']);
  // BUILD's source-to-module derivation: the exact compiler output compound
  // (both sections + the binding projection declarations) is what gets
  // packed into the sealed Business module bytes below.
  const compound = {
    domainData: {
      descriptors: compiled.manifest.domainData,
      values: compiled.domainData as Record<string, unknown>,
      packageDataBounds: compiled.manifest.packageDataBounds,
    },
    businessSources: {
      schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
      descriptors: compiled.manifest.businessSources,
    },
    projections: compiled.manifest.projections,
  };
  return { compound, manifest: compiled.manifest };
}

/** Seal the K/S/B(fixture) closure through the REAL BUILD path. */
async function sealCompiledClosure(compoundJson: string): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessTemplate] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('business-compiled-data.mjs', fixtureDir), 'utf8'),
  ]);
  assert.ok(businessTemplate.includes(COMPILED_DATA_ANCHOR), 'fixture compiled-data anchor drifted');
  const businessSource = businessTemplate.replace(COMPILED_DATA_ANCHOR, compoundJson);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`);
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:compiled-data',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID as string, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk' as const, packageId: sdk.MODULE_ID as string, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business' as const, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-16T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-fr11hf24',
  }) as SealedQualifiedPackageRoot;
}

let handle: TrustedHostHandle;
let gateway: KernelGateway;
let operator: HostCredential;
let requester: HostCredential;
let manifest: ReturnType<typeof compileWitness>['manifest'];

before(async () => {
  const { compound, manifest: compiledManifest } = compileWitness();
  manifest = compiledManifest;
  const root = await sealCompiledClosure(JSON.stringify(compound));
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('fr11hf24') },
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
  // The business-source observation target: a REAL K instance that has
  // admitted one turn, so the K read returns a live attested revision.
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey: 'crm-src' });
  await gateway.send(requester, {
    intentType: 'submitCompiledQuote',
    messageId: 'm-crm-1',
    input: { amount: 30 },
    target: { tenantId: TENANT, appId: APP_ID, instanceKey: 'crm-src' },
  });
});

after(async () => {
  await handle.host.close();
});

async function assertRefused(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code, `expected ${code}, got: ${String((error as Error)?.message ?? error)}`);
    return true;
  });
}

// ---------------------------------------------------------------------------
// FR11 + HF24 — the joined positive: compiled data READ on the selected path
// ---------------------------------------------------------------------------

test('FR11/HF24-P compiler output is readable through the selected Host→K→SDK path in compiled order', async () => {
  // Request keys in REVERSE compiled order: the sealed SDK projection must
  // still return entries in the compiled deterministic order ('cap','tier').
  const projection = await gateway.queryDomainData(requester, {
    appId: APP_ID,
    keys: ['tier', 'cap'],
    businessSources: [{ source: 'crm', instanceKey: 'crm-src' }],
  }) as {
    kind: string;
    authority: string;
    schemaContractVersion: string;
    compiledProjections: string[];
    entries: Array<{ key: string; value: unknown; contentDigest: string; valueSchema?: unknown }>;
    businessSourceContracts: Array<{ source: string; schemaContractVersion: string }>;
  };
  assert.equal(projection.kind, 'compiled-data-projection');
  assert.equal(projection.authority, 'proposal-only');
  assert.deepEqual(projection.entries.map((entry) => entry.key), ['cap', 'tier']);
  assert.deepEqual(JSON.parse(JSON.stringify(projection.entries[0]?.value)), { limit: 50 });

  const tier = projection.entries.find((entry) => entry.key === 'tier');
  assert.ok(tier, 'the compiled tier entry is readable');
  assert.deepEqual(JSON.parse(JSON.stringify(tier.value)), { level: 1 });
  // The exact compiled descriptor — digest AND declared valueSchema — is
  // what the selected read returns, not a re-derived approximation.
  const tierDescriptor = manifest.domainData?.find((descriptor) => descriptor.key === 'tier');
  assert.ok(tierDescriptor);
  assert.equal(tier.contentDigest, tierDescriptor.contentDigest);
  assert.equal((tier.valueSchema as { properties?: { level?: { minimum?: number } } })?.properties?.level?.minimum, 0);

  // HF24: the compiler-declared Business Source is bound INTO this read
  // through the authenticated principal-qualified K instance read, with
  // the exact frozen schema contract identity.
  assert.deepEqual(projection.businessSourceContracts, [
    { source: 'crm', schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1 },
  ]);
  assert.equal(projection.schemaContractVersion, DOMAIN_HARNESS_JSON_SCHEMA_V1);
  // The compiled projection declarations that BIND the sections ride the
  // sealed package as inert evidence (the read executes none of them).
  assert.deepEqual(projection.compiledProjections, ['proj:compiled-overview']);
});

// ---------------------------------------------------------------------------
// FR11-N — load-boundary negatives (BEFORE any effect, facade or mechanism)
// ---------------------------------------------------------------------------

test('FR11-N a self-consistent section whose bundled value violates its compiled valueSchema refuses the load', async () => {
  const { compound } = compileWitness();
  const tampered = JSON.parse(JSON.stringify(compound)) as {
    domainData: { descriptors: Array<{ key: string; contentDigest: string }>; values: Record<string, unknown> };
  };
  // Compromised-producer tamper: violate the schema, then recompute the
  // identity-bearing digest honestly so ONLY the schema contract is wrong.
  tampered.domainData.values.tier = { level: -1 };
  const tierDescriptor = tampered.domainData.descriptors.find((descriptor) => descriptor.key === 'tier');
  assert.ok(tierDescriptor);
  tierDescriptor.contentDigest = createHash('sha256')
    .update(canonicalJsonStringify({ level: -1 }))
    .digest('hex');

  await assert.rejects(
    DomainHarness.load(await sealCompiledClosure(JSON.stringify(tampered))),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal(error.code, 'DOMAIN_DATA_SCHEMA_VIOLATION');
      return true;
    },
  );
});

test('FR11-N a corrupted descriptor content digest refuses the load', async () => {
  const { compound } = compileWitness();
  const tampered = JSON.parse(JSON.stringify(compound)) as {
    domainData: { descriptors: Array<{ key: string; contentDigest: string }> };
  };
  const tierDescriptor = tampered.domainData.descriptors.find((descriptor) => descriptor.key === 'tier');
  assert.ok(tierDescriptor);
  // Valid digest FORMAT, wrong content: only the canonical recompute at the
  // trusted load boundary can catch this.
  tierDescriptor.contentDigest = '0'.repeat(64);

  await assert.rejects(
    DomainHarness.load(await sealCompiledClosure(JSON.stringify(tampered))),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError);
      assert.equal(error.code, 'DOMAIN_DATA_DIGEST_MISMATCH');
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// HF24-N + FR11-N — read-time negatives (fail-closed before any result)
// ---------------------------------------------------------------------------

test('HF24-N a substituted/undeclared Business Source refuses the read typed', async () => {
  await assertRefused(gateway.queryDomainData(requester, {
    appId: APP_ID,
    businessSources: [{ source: 'billing', instanceKey: 'crm-src' }],
  }), 'SDK_BUSINESS_SOURCE_UNDECLARED');
});

test('HF24-N a business-source observation that violates its declared schema (stale schema) refuses the read', async () => {
  // 'ledger' IS declared, but its compiler-declared contract requires a
  // field no K instance snapshot carries: the observation fails the
  // declared schema before anything enters the projection result.
  await assertRefused(gateway.queryDomainData(requester, {
    appId: APP_ID,
    businessSources: [{ source: 'ledger', instanceKey: 'crm-src' }],
  }), 'SDK_BUSINESS_SOURCE_SCHEMA_VIOLATION');
});

test('FR11-N an undeclared Domain Data key refuses the read typed', async () => {
  await assertRefused(gateway.queryDomainData(requester, {
    appId: APP_ID,
    keys: ['ghost'],
  }), 'SDK_DOMAIN_DATA_KEY_UNDECLARED');
});
