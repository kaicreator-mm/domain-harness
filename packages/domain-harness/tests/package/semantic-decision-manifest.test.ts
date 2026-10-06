// v0.7 T000-SD (issue #708; #589@5998374763 PACK-E/T000 addendum, source
// #528@5997492142): focused package manifest + successor activation coverage
// for the final-v0.6 frozen Semantic Decision public/package surface. The
// v2 public contract is available; compiled package metadata carries the
// frozen contract version/descriptors; malformed/unsupported/stale material
// fails closed before activation; resolution authority stays on the existing
// DecisionResolver -> Central Admission path (no second execution authority
// is representable in this contract surface).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  DOMAIN_HARNESS_JSON_SCHEMA_V1,
  SEMANTIC_DECISION_CAPABILITY,
  SEMANTIC_DECISION_CONTRACT_VERSION_V1,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  semanticDecisionManifestIssues,
  type CapabilityId,
  type CompiledPackageManifest,
  type PackageDataBounds,
  type Sha256Port,
} from '../../src/v2/index.js';
import {
  PackageActivationError,
  computeCompiledPackageId,
  validateManifestShape,
  validateSuccessorCompiledPackage,
} from '../../src/package/index.js';
import { computeCanonicalJsonDigest } from '../../src/contracts/identity.js';

function sha256(): Sha256Port {
  return {
    async digestUtf8(value: string): Promise<string> {
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
}

const HOST_CAPABILITIES = [
  'crypto-hash-sha256@1',
  SEMANTIC_DECISION_CAPABILITY,
] as const satisfies readonly CapabilityId[];

const SUPPORTED_BOUNDS: PackageDataBounds = {
  maxDomainDataEntries: 32,
  maxDomainDataEntryCanonicalBytes: 1024,
  maxTotalDomainDataCanonicalBytes: 8192,
  maxBusinessSources: 32,
  maxSchemaCanonicalBytes: 4096,
};

const RESULT_SCHEMA = {
  type: 'object',
  required: ['outcome'],
  additionalProperties: false,
  properties: { outcome: { enum: ['approve', 'reject'] } },
} as const;

function descriptorBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    decisionId: 'quote.approval',
    inputSelection: '$.claim',
    resultSchema: RESULT_SCHEMA,
    allowedOutcomes: ['approve', 'reject'],
    allowedEventTypes: ['QuoteApproved', 'QuoteRejected'],
    queryCapabilityIds: [],
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: [] },
    cachePolicy: { mode: 'eligible' },
    policy: { maxSteps: 4 },
    unavailable: { kind: 'fail-closed' },
    ...overrides,
  };
}

async function descriptorWithDigest(overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const body = descriptorBody(overrides);
  return { ...body, declarationDigest: await computeCanonicalJsonDigest(body, sha256()) };
}

async function successorManifest(options: {
  readonly decisions?: readonly unknown[];
  readonly semanticDecisionContractVersion?: string;
  readonly requiredCapabilities?: readonly CapabilityId[];
  readonly tools?: Record<string, unknown>;
  readonly bindingDigests?: Record<string, unknown>;
} = {}): Promise<CompiledPackageManifest> {
  const manifest = {
    ...SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
    schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1,
    domainId: 'fixture-domain',
    domainVersion: '1.0.0',
    packageId: 'pending',
    targetProfileId: 'node-test',
    requiredCapabilities: options.requiredCapabilities ?? [SEMANTIC_DECISION_CAPABILITY],
    workflows: {},
    tools: options.tools ?? {},
    projections: {},
    schemas: {},
    bindingDigests: options.bindingDigests ?? {},
    packageDataBounds: SUPPORTED_BOUNDS,
    domainData: [],
    businessSources: [],
    ...(options.decisions === undefined
      ? (options.semanticDecisionContractVersion === undefined ? {} : {
        semanticDecisionContractVersion: options.semanticDecisionContractVersion,
      })
      : {
        semanticDecisionContractVersion:
          options.semanticDecisionContractVersion ?? SEMANTIC_DECISION_CONTRACT_VERSION_V1,
        semanticDecisions: options.decisions,
      }),
  } as CompiledPackageManifest;
  (manifest as { packageId: string }).packageId = await computeCompiledPackageId(manifest, sha256());
  return manifest;
}

function activationPolicy() {
  return {
    supportedProfiles: [SUCCESSOR_COMPILED_ARTIFACT_PROFILE],
    hostCapabilities: HOST_CAPABILITIES,
    sha256: sha256(),
    targetProfileId: 'node-test',
    supportedPackageDataBounds: SUPPORTED_BOUNDS,
  } as const;
}

function messageOf(error: unknown): string {
  return error instanceof PackageActivationError ? error.message : '';
}

function activate(manifest: CompiledPackageManifest) {
  return validateSuccessorCompiledPackage({ manifest, bindings: {}, domainData: {} }, activationPolicy());
}

test('T000-SD: v2 public surface carries the frozen Semantic Decision contract constants', () => {
  assert.equal(SEMANTIC_DECISION_CAPABILITY, 'semantic-decision@1');
  assert.equal(SEMANTIC_DECISION_CONTRACT_VERSION_V1, 'semantic-declaration.v1');
  assert.equal(typeof semanticDecisionManifestIssues, 'function');
});

test('T000-SD: a manifest without semantic-decision material still passes shape validation', async () => {
  const manifest = await successorManifest();
  assert.doesNotThrow(() => validateManifestShape(manifest));
});

test('T000-SD: valid materialized declarations pass shape validation and activation', async () => {
  const decision = await descriptorWithDigest();
  const manifest = await successorManifest({ decisions: [decision] });
  assert.doesNotThrow(() => validateManifestShape(manifest));

  const admitted = await activate(manifest);
  assert.equal(admitted.manifest.semanticDecisionContractVersion, SEMANTIC_DECISION_CONTRACT_VERSION_V1);
  assert.equal(admitted.manifest.semanticDecisions?.length, 1);
  assert.equal(admitted.manifest.semanticDecisions?.[0]?.decisionId, 'quote.approval');
});

test('T000-SD: semantic-decision manifest material is successor-only on a 0.2/2/2 manifest', async () => {
  const decision = await descriptorWithDigest();
  const manifest = {
    ...(await successorManifest({ decisions: [decision] })),
    formatVersion: '0.2',
    executionEngineMajor: 2,
    packageId: 'pending',
  } as CompiledPackageManifest;
  assert.throws(
    () => validateManifestShape(manifest),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INVALID_COMPILED_PACKAGE'
      && messageOf(error).includes('successor-only'),
  );
});

test('T000-SD: contract version and descriptors must be present together', async () => {
  const versionOnly = await successorManifest({ semanticDecisionContractVersion: SEMANTIC_DECISION_CONTRACT_VERSION_V1 });
  assert.equal((versionOnly as unknown as Record<string, unknown>).semanticDecisionContractVersion, SEMANTIC_DECISION_CONTRACT_VERSION_V1);
  assert.equal((versionOnly as unknown as Record<string, unknown>).semanticDecisions, undefined);
  assert.throws(
    () => validateManifestShape(versionOnly),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('must be present together'),
  );

  const decision = await descriptorWithDigest();
  const decisionsOnly = await successorManifest({ decisions: [decision] });
  delete (decisionsOnly as unknown as Record<string, unknown>).semanticDecisionContractVersion;
  assert.throws(
    () => validateManifestShape(decisionsOnly),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('must be present together'),
  );
});

test('T000-SD: the declaration contract version must be exactly the frozen version', async () => {
  const decision = await descriptorWithDigest();
  const manifest = await successorManifest({
    decisions: [decision],
    semanticDecisionContractVersion: 'semantic-declaration.v0-unknown',
  });
  assert.throws(
    () => validateManifestShape(manifest),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes(`must be exactly ${SEMANTIC_DECISION_CONTRACT_VERSION_V1}`),
  );
});

test('T000-SD: declarations require the compiled semantic-decision capability in requiredCapabilities', async () => {
  const decision = await descriptorWithDigest();
  const manifest = await successorManifest({
    decisions: [decision],
    requiredCapabilities: ['crypto-hash-sha256@1'],
  });
  assert.throws(
    () => validateManifestShape(manifest),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes(`capability "${SEMANTIC_DECISION_CAPABILITY}"`),
  );
});

test('T000-SD: malformed declarations (non-canonical arrays) fail closed at shape validation', async () => {
  const decision = await descriptorWithDigest({ allowedOutcomes: ['reject', 'approve'] });
  // The digest stays well-formed; only canonical ordering is wrong, so the
  // compiler-independent structural validator is the rejecting authority.
  const manifest = await successorManifest({ decisions: [decision] });
  assert.throws(
    () => validateManifestShape(manifest),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('must be sorted'),
  );
});

test('T000-SD: activation fails closed on a stale but well-formed declarationDigest', async () => {
  const tampered = await descriptorWithDigest();
  const digest = tampered.declarationDigest as string;
  tampered.declarationDigest = (digest[0] === '0' ? '1' : '0') + digest.slice(1);
  const manifest = await successorManifest({ decisions: [tampered] });
  await assert.rejects(
    activate(manifest),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('declarationDigest does not match'),
  );
});

test('T000-SD: activation closes declarations against the exact manifest sections', async () => {
  const undeclaredProjection = await descriptorWithDigest({
    dependencyMaterial: { requiredProjectionIds: ['missing.projection'], requiredRevisionSourceIds: [] },
  });
  await assert.rejects(
    activate(await successorManifest({ decisions: [undeclaredProjection] })),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('undeclared projection "missing.projection"'),
  );

  const undeclaredSource = await descriptorWithDigest({
    dependencyMaterial: { requiredProjectionIds: [], requiredRevisionSourceIds: ['ledger'] },
  });
  await assert.rejects(
    activate(await successorManifest({ decisions: [undeclaredSource] })),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('undeclared Business Source "ledger"'),
  );

  const undeclaredTool = await descriptorWithDigest({ queryCapabilityIds: ['claims.lookup'] });
  await assert.rejects(
    activate(await successorManifest({ decisions: [undeclaredTool] })),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('undeclared Tool capability "claims.lookup"'),
  );
});

test('T000-SD: activation rejects mutation/effect tools exposed to semantic reasoning', async () => {
  const mutationTool = {
    toolId: 'claims.adjust',
    outputSchema: { type: 'object', additionalProperties: true },
    effect: 'non-idempotent',
    requiredCapabilities: [],
    execution: { kind: 'tool-binding', bindingId: 'claims-adjust-binding' },
  };
  const decision = await descriptorWithDigest({ queryCapabilityIds: ['claims.adjust'] });
  const manifest = await successorManifest({
    decisions: [decision],
    tools: { 'claims.adjust': mutationTool },
    bindingDigests: { 'claims-adjust-binding': 'fixture-digest' },
  });
  await assert.rejects(
    activate(manifest),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('bounded to query/read-only capabilities'),
  );
});

test('T000-SD: activation revalidates the embedded result schema under the existing schema authority', async () => {
  const offContractSchema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
  };
  const decision = await descriptorWithDigest({ resultSchema: offContractSchema });
  const manifest = await successorManifest({ decisions: [decision] });
  await assert.rejects(
    activate(manifest),
    (error: unknown) => error instanceof PackageActivationError
      && messageOf(error).includes('resultSchema is not a valid'),
  );
});
