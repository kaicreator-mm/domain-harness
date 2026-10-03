// v0.6 T001 (issue #497, frozen L2 A2/A7): activation-side fail-closed
// behavior of the compiled semantic decision declaration contract. The
// successor activation authority independently revalidates the declarations
// (structure, declaration contract version, compiled capability, and the
// package-level reference closure), a host without the compiled
// semantic-decision capability fails closed as INCOMPATIBLE_PACKAGE, and a
// retained 0.2/2/2 manifest carrying the successor-only material fails
// activation instead of being silently ignored.
//
// v0.6 T001 R1 repair (issue #508, review #505 P1): activation also
// independently recomputes the declarationDigest from the exact canonical
// descriptor body and revalidates the embedded resultSchema through the
// existing DOMAIN_HARNESS_JSON_SCHEMA_V1 authority, so a recomputed outer
// packageId can never launder a stale digest or an off-contract schema.
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { compileDomainPackage } from '../../packages/domain-harness-compiler/src/index.js';
import { loadRawDomainPackage } from '../../packages/domain-harness-compiler/src/raw/load-raw-package.js';
import type {
  CapabilityId,
  CompiledPackageManifest,
  CompiledSemanticDecisionDescriptor,
  RawToolDefinition,
  TargetHostProfile,
} from '../../packages/domain-harness-compiler/src/raw/types.js';
import {
  PackageActivationError,
  validateCompiledPackage,
  validateSuccessorCompiledPackage,
} from '../../packages/domain-harness/src/package/index.js';
import { computeCompiledPackageId } from '../../packages/domain-harness/src/package/validation.js';
import {
  computeCanonicalJsonDigest,
  SEMANTIC_DECISION_CAPABILITY,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  type Sha256Port,
} from '../../packages/domain-harness/src/v2/index.js';

function realSha256(): Sha256Port {
  return {
    async digestUtf8(value: string): Promise<string> {
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
}

const CAPS = {
  hash: 'crypto-hash-sha256@1',
  module: 'compiled-package-module@1',
  expression: 'expression-jsonata@1',
  semantic: SEMANTIC_DECISION_CAPABILITY,
} as const satisfies Readonly<Record<string, CapabilityId>>;

function target(): TargetHostProfile {
  return {
    id: 'activation-host@1',
    capabilities: Object.values(CAPS),
    bindings: {
      [CAPS.hash]: '@host/hash',
      [CAPS.module]: '@host/module',
      [CAPS.expression]: '@host/expression',
      [CAPS.semantic]: '@host/semantic-decision',
    },
    packageDataBounds: {
      maxDomainDataEntries: 16,
      maxDomainDataEntryCanonicalBytes: 2048,
      maxTotalDomainDataCanonicalBytes: 8192,
      maxBusinessSources: 8,
      maxSchemaCanonicalBytes: 4096,
    },
  };
}

const BINDING_CONTENTS: Readonly<Record<string, string>> = {
  '@host/hash': 'hash adapter',
  '@host/module': 'module loader adapter',
  '@host/expression': 'expression adapter',
  '@host/semantic-decision': 'bounded semantic decision adapter',
};

function readOnlyTool(): RawToolDefinition {
  return {
    toolId: 'claims.lookup',
    outputSchema: { type: 'object', additionalProperties: true },
    effect: 'none',
    executionKind: 'runtime-read',
    bindingCapability: CAPS.expression,
    requiredCapabilities: [CAPS.expression],
  };
}

const WORKFLOW_YAML = [
  'initial: calculate',
  'states:',
  '  calculate:',
  '    invoke:',
  '      expr: "$.value * 2"',
  '    on:',
  '      done:',
  '        target: completed',
  '      error:',
  '        target: failed',
  '  completed:',
  '    final: true',
  '  failed:',
  '    final: true',
  '',
].join('\n');

const DECISION_YAML = [
  'decisionId: approve-claim',
  'inputSelection: "$.claim"',
  'resultSchema: schemas/approve-claim.result.json',
  'allowedOutcomes: [approve, reject]',
  'allowedEventTypes: [CLAIM_APPROVED, CLAIM_REJECTED]',
  'queryCapabilities: [claims.lookup]',
  'requiredProjections: [claim.view]',
  'requiredRevisionSources: [claims.source]',
  'policy:',
  '  maxSteps: 8',
  'unavailable:',
  '  kind: declared-event',
  '  eventType: CLAIM_REJECTED',
  '  outcome: reject',
  '',
].join('\n');

async function compileSuccessorPackageWithDecision(): Promise<{
  manifest: CompiledPackageManifest;
  domainData: Readonly<Record<string, unknown>>;
}> {
  const root = await mkdtemp(join(tmpdir(), 'domain-harness-t001-activation-'));
  await mkdir(join(root, 'workflows'), { recursive: true });
  await mkdir(join(root, 'decisions'), { recursive: true });
  await mkdir(join(root, 'schemas'), { recursive: true });
  await writeFile(join(root, 'harness.yaml'), 'schemaVersion: "0.1"\nid: activation-domain\nlimits:\n  maxSteps: 16\n');
  await writeFile(join(root, 'workflows', 'basic.yaml'), WORKFLOW_YAML);
  await writeFile(join(root, 'decisions', 'approve-claim.yaml'), DECISION_YAML);
  await writeFile(
    join(root, 'schemas', 'approve-claim.result.json'),
    JSON.stringify({ type: 'object', required: ['outcome'], additionalProperties: false, properties: { outcome: { enum: ['approve', 'reject'] } } }),
  );
  const loaded = await loadRawDomainPackage({ root });
  const compiled = compileDomainPackage({
    raw: loaded,
    domainVersion: '1.0.0-t001',
    target: target(),
    bindingContents: BINDING_CONTENTS,
    tools: [readOnlyTool()],
    projections: [{
      projectionId: 'claim.view',
      expression: '$',
      dependencies: [{ kind: 'business', source: 'claims.source', selector: {} }],
      outputSchema: { type: 'object' },
    }],
    businessSources: [{ source: 'claims.source', valueSchema: { type: 'object' } }],
  });
  return { manifest: compiled.manifest, domainData: compiled.domainData };
}

function successorPolicy(hostCapabilities: readonly CapabilityId[]) {
  return {
    supportedProfiles: [SUCCESSOR_COMPILED_ARTIFACT_PROFILE],
    hostCapabilities,
    sha256: realSha256(),
    supportedPackageDataBounds: {
      maxDomainDataEntries: 32,
      maxDomainDataEntryCanonicalBytes: 4096,
      maxTotalDomainDataCanonicalBytes: 16384,
      maxBusinessSources: 32,
      maxSchemaCanonicalBytes: 8192,
    },
  };
}

test('T001: a publicly compiled successor package with a semantic decision activates through the existing successor validator', async () => {
  const { manifest, domainData } = await compileSuccessorPackageWithDecision();
  assert.equal(manifest.semanticDecisions?.length, 1);
  const validated = await validateSuccessorCompiledPackage(
    { manifest, bindings: { '@host/expression': 'host-read-adapter' }, domainData },
    successorPolicy(Object.values(CAPS)),
  );
  assert.equal(validated.manifest.packageId, manifest.packageId);
  assert.equal(validated.manifest.semanticDecisions?.length, 1);
});

test('T001: a host without the compiled semantic-decision capability fails closed as incompatible', async () => {
  const { manifest, domainData } = await compileSuccessorPackageWithDecision();
  const withoutSemantic = Object.values(CAPS).filter((capability) => capability !== SEMANTIC_DECISION_CAPABILITY);
  await assert.rejects(
    validateSuccessorCompiledPackage(
      { manifest, bindings: { '@host/expression': 'host-read-adapter' }, domainData },
      successorPolicy(withoutSemantic),
    ),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INCOMPATIBLE_PACKAGE'
      && error.details.some((detail: string) => detail.includes(`missing host capability ${SEMANTIC_DECISION_CAPABILITY}`)),
  );
});

test('T001: activation closure fails closed on undeclared projection references', async () => {
  const { manifest, domainData } = await compileSuccessorPackageWithDecision();
  const tampered = structuredClone(manifest);
  const decisions = tampered.semanticDecisions as CompiledSemanticDecisionDescriptor[];
  decisions[0] = {
    ...decisions[0],
    dependencyMaterial: { ...decisions[0].dependencyMaterial, requiredProjectionIds: ['absent.projection'] },
  };
  tampered.packageId = await computeCompiledPackageId(tampered, realSha256());
  await assert.rejects(
    validateSuccessorCompiledPackage(
      { manifest: tampered, bindings: { '@host/expression': 'host-read-adapter' }, domainData },
      successorPolicy(Object.values(CAPS)),
    ),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INVALID_COMPILED_PACKAGE'
      && error.message.includes('requires undeclared projection "absent.projection"'),
  );
});

test('T001: activation closure fails closed when a mutation Tool is exposed to semantic reasoning', async () => {
  const { manifest, domainData } = await compileSuccessorPackageWithDecision();
  // Model the declared query capability as a mutation Tool in the manifest.
  const tampered = structuredClone(manifest);
  const mutationTool = {
    ...tampered.tools['claims.lookup'],
    effect: 'idempotent' as const,
  };
  tampered.tools = { ...tampered.tools, 'claims.lookup': mutationTool };
  tampered.packageId = await computeCompiledPackageId(tampered, realSha256());
  await assert.rejects(
    validateSuccessorCompiledPackage(
      { manifest: tampered, bindings: { '@host/expression': 'host-read-adapter' }, domainData },
      successorPolicy(Object.values(CAPS)),
    ),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INVALID_COMPILED_PACKAGE'
      && error.message.includes('mutation/effect semantics "idempotent"'),
  );
});

// v0.6 T001 R1 repair (issue #508, review #505 P1): the successor activation
// trust boundary must independently prove the declaration's own content
// identity and result-schema authority, so recomputing the outer packageId
// can never launder tampered declaration material.
test('T001 R1: activation rejects declaration material mutation that retains a stale well-formed declarationDigest', async () => {
  const { manifest, domainData } = await compileSuccessorPackageWithDecision();
  const tampered = structuredClone(manifest);
  const decisions = tampered.semanticDecisions as CompiledSemanticDecisionDescriptor[];
  // Behaviorally relevant mutation (the input-selection authority) that keeps
  // every reference-closure and schema-shape check intact...
  decisions[0] = { ...decisions[0], inputSelection: '$.claim.amount' };
  // ...while the declarationDigest is deliberately left stale but well-formed.
  assert.match(decisions[0].declarationDigest, /^[0-9a-f]{64}$/);
  tampered.packageId = await computeCompiledPackageId(tampered, realSha256());
  await assert.rejects(
    validateSuccessorCompiledPackage(
      { manifest: tampered, bindings: { '@host/expression': 'host-read-adapter' }, domainData },
      successorPolicy(Object.values(CAPS)),
    ),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INVALID_COMPILED_PACKAGE'
      && error.message.includes('declarationDigest does not match the canonical descriptor body'),
  );
});

test('T001 R1: activation rejects an off-contract embedded resultSchema even with a digest-consistent declaration', async () => {
  const { manifest, domainData } = await compileSuccessorPackageWithDecision();
  const tampered = structuredClone(manifest);
  const decisions = tampered.semanticDecisions as CompiledSemanticDecisionDescriptor[];
  // Off-contract under DOMAIN_HARNESS_JSON_SCHEMA_V1: an unknown/custom
  // keyword smuggled into the embedded result schema. The inner
  // declarationDigest is honestly recomputed over the tampered body (so the
  // digest self-integrity check passes and only the schema authority can
  // reject this), and the outer packageId is recomputed as well.
  const offContractSchema = {
    type: 'object',
    required: ['outcome'],
    additionalProperties: false,
    properties: { outcome: { enum: ['approve', 'reject'] } },
    'x-smuggled-routing': { model: 'unauthorized' },
  };
  const { declarationDigest: _stale, ...body } = decisions[0];
  decisions[0] = {
    ...body,
    resultSchema: offContractSchema,
    declarationDigest: await computeCanonicalJsonDigest(
      { ...body, resultSchema: offContractSchema },
      realSha256(),
    ),
  };
  tampered.packageId = await computeCompiledPackageId(tampered, realSha256());
  await assert.rejects(
    validateSuccessorCompiledPackage(
      { manifest: tampered, bindings: { '@host/expression': 'host-read-adapter' }, domainData },
      successorPolicy(Object.values(CAPS)),
    ),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INVALID_COMPILED_PACKAGE'
      && error.message.includes('resultSchema is not a valid domainharness-json-schema/1 schema'),
  );
});

test('T001: malformed semantic-decision manifest material fails activation before execution', async () => {
  const { manifest, domainData } = await compileSuccessorPackageWithDecision();
  // Descriptors without the exact declaration contract version.
  const withoutVersion = structuredClone(manifest) as CompiledPackageManifest & { semanticDecisionContractVersion?: string };
  delete withoutVersion.semanticDecisionContractVersion;
  withoutVersion.packageId = await computeCompiledPackageId(withoutVersion, realSha256());
  await assert.rejects(
    validateSuccessorCompiledPackage(
      { manifest: withoutVersion, bindings: { '@host/expression': 'host-read-adapter' }, domainData },
      successorPolicy(Object.values(CAPS)),
    ),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INVALID_COMPILED_PACKAGE'
      && error.message.includes('must be present together'),
  );

  // A structurally invalid descriptor array.
  const malformed = structuredClone(manifest);
  (malformed as { semanticDecisions?: unknown }).semanticDecisions = [{ decisionId: 'broken' }];
  malformed.packageId = await computeCompiledPackageId(malformed, realSha256());
  await assert.rejects(
    validateSuccessorCompiledPackage(
      { manifest: malformed, bindings: { '@host/expression': 'host-read-adapter' }, domainData },
      successorPolicy(Object.values(CAPS)),
    ),
    (error: unknown) => error instanceof PackageActivationError && error.code === 'INVALID_COMPILED_PACKAGE',
  );
});

test('T001: a retained 0.2/2/2 manifest carrying semantic-decision material fails activation', async () => {
  const { manifest } = await compileSuccessorPackageWithDecision();
  const legacy = structuredClone(manifest) as unknown as Record<string, unknown>;
  legacy.formatVersion = '0.2';
  legacy.runtimeContractMajor = 2;
  legacy.executionEngineMajor = 2;
  delete legacy.schemaContractVersion;
  delete legacy.packageDataBounds;
  delete legacy.domainData;
  delete legacy.businessSources;
  legacy.packageId = await computeCompiledPackageId(legacy as never, realSha256());
  await assert.rejects(
    validateCompiledPackage({ manifest: legacy, bindings: {} }, {
      formatVersion: '0.2',
      runtimeContractMajor: 2,
      executionEngineMajor: 2,
      hostCapabilities: [CAPS.hash],
      sha256: realSha256(),
    }),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INVALID_COMPILED_PACKAGE'
      && error.message.includes('successor-only'),
  );
});
