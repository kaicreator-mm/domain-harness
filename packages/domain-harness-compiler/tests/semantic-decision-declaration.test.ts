// v0.6 T001 (issue #497, frozen L2 A2/A7): compiled first-class Semantic
// Decision Declaration / compiler contract. Deterministic focused coverage of
// the twelve minimum task requirements: additive compatibility, portable
// compilation, stable identity, finite outcome/event vocabulary, structured
// result schema authority, query/read-only capability boundary, bounded
// Harness policy, decision-scoped currentness material, existing cache/
// promotion authority references, explicit semantic-unavailable disposition,
// rejection of provider/model/engine-state/adaptive authority, and fail-closed
// capability/version compatibility through the existing machinery.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { CapabilityId, CompiledPackageManifest, CompiledSemanticDecisionDescriptor, LoadedRawDomainPackage, RawProjectionDefinition, RawToolDefinition, TargetHostProfile } from '../src/index.js';
import type { BusinessSourceCompileEntry } from '../src/package/business-sources.js';
import {
  SEMANTIC_DECISION_CAPABILITY,
  SEMANTIC_DECISION_CONTRACT_VERSION_V1,
  semanticDecisionManifestIssues,
} from '@kaicreator/domain-harness/v2';
import { compileDomainPackage } from '../src/compile/compile-domain-package.js';
import { SemanticDecisionCompileError } from '../src/compile/semantic-decisions.js';
import { MissingTargetCapabilityError } from '../src/compile/capabilities.js';
import { loadRawDomainPackage } from '../src/raw/load-raw-package.js';
import { RawPackageDefinitionError } from '../src/raw/errors.js';
import {
  assertCompiledPackageManifest,
  CompiledManifestValidationError,
} from '../src/package/manifest.js';

const CAPS = {
  hash: 'crypto-hash-sha256@1',
  module: 'compiled-package-module@1',
  expression: 'expression-jsonata@1',
  semantic: SEMANTIC_DECISION_CAPABILITY,
} as const satisfies Readonly<Record<string, CapabilityId>>;

function target(options: { readonly withSemanticCapability?: boolean } = {}): TargetHostProfile {
  const capabilities: CapabilityId[] = [CAPS.hash, CAPS.module, CAPS.expression];
  const bindings: Record<string, string> = {
    [CAPS.hash]: '@host/hash',
    [CAPS.module]: '@host/module',
    [CAPS.expression]: '@host/expression',
  };
  if (options.withSemanticCapability !== false) {
    capabilities.push(CAPS.semantic);
    bindings[CAPS.semantic] = '@host/semantic-decision';
  }
  return {
    id: 'node-test@1',
    capabilities,
    bindings,
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
  '@host/hash': 'export default function hash(data) { return digest(data); }\n',
  '@host/module': 'export default function loadModule(ref) { return import(ref); }\n',
  '@host/expression': 'export default function evaluate(expression, input) { return jsonata(expression).evaluate(input); }\n',
  '@host/semantic-decision': 'export default function semanticDecisionAdapter() { return boundedHarness; }\n',
};

/** Pure read-only Tool (effect 'none'): allowed to semantic reasoning. */
function readOnlyTool(toolId = 'claims.lookup'): RawToolDefinition {
  return {
    toolId,
    outputSchema: { type: 'object', additionalProperties: true },
    effect: 'none',
    executionKind: 'runtime-read',
  };
}

/** Mutation Tool: never allowed to semantic reasoning. */
function mutationTool(toolId: string, effect: 'idempotent' | 'non-idempotent'): RawToolDefinition {
  return {
    toolId,
    outputSchema: { type: 'object', additionalProperties: true },
    effect,
    executionKind: 'runtime-mutate',
  };
}

const RESULT_SCHEMA = {
  type: 'object',
  required: ['outcome'],
  additionalProperties: false,
  properties: { outcome: { enum: ['approve', 'reject'] } },
};

interface DecisionFields {
  allowedOutcomes?: string;
  allowedEventTypes?: string;
  queryCapabilities?: string;
  requiredProjections?: string;
  requiredRevisionSources?: string;
  cachePolicy?: string;
  promotedReference?: string;
  policyMaxSteps?: string;
  unavailable?: string;
}

function decisionYaml(fields: DecisionFields = {}): string {
  const lines = [
    'decisionId: approve-claim',
    'inputSelection: "$.claim"',
    'resultSchema: schemas/approve-claim.result.json',
    `allowedOutcomes: ${fields.allowedOutcomes ?? '[approve, reject]'}`,
    `allowedEventTypes: ${fields.allowedEventTypes ?? '[CLAIM_APPROVED, CLAIM_REJECTED]'}`,
    `queryCapabilities: ${fields.queryCapabilities ?? '[claims.lookup]'}`,
  ];
  if (fields.requiredProjections !== undefined) lines.push(`requiredProjections: ${fields.requiredProjections}`);
  if (fields.requiredRevisionSources !== undefined) lines.push(`requiredRevisionSources: ${fields.requiredRevisionSources}`);
  if (fields.cachePolicy !== undefined) lines.push(`cachePolicy: ${fields.cachePolicy}`);
  if (fields.promotedReference !== undefined) lines.push(`promotedReference: ${fields.promotedReference}`);
  lines.push('policy:');
  lines.push(`  maxSteps: ${fields.policyMaxSteps ?? '8'}`);
  lines.push(`unavailable: ${fields.unavailable ?? '{ kind: declared-event, eventType: CLAIM_REJECTED, outcome: reject }'}`);
  return `${lines.join('\n')}\n`;
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

interface RawFixture {
  readonly decisions?: Readonly<Record<string, string>>;
  readonly resultSchema?: unknown;
  readonly tools?: readonly RawToolDefinition[];
  readonly projections?: readonly RawProjectionDefinition[];
  readonly businessSources?: readonly BusinessSourceCompileEntry[];
}

async function writeRawPackage(fixture: RawFixture = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'domain-harness-t001-'));
  await mkdir(join(root, 'workflows'), { recursive: true });
  await writeFile(join(root, 'harness.yaml'), 'schemaVersion: "0.1"\nid: decision-domain\nlimits:\n  maxSteps: 16\n');
  await writeFile(join(root, 'workflows', 'basic.yaml'), WORKFLOW_YAML);
  if (fixture.decisions !== undefined && Object.keys(fixture.decisions).length > 0) {
    await mkdir(join(root, 'decisions'), { recursive: true });
    await mkdir(join(root, 'schemas'), { recursive: true });
    for (const [name, yaml] of Object.entries(fixture.decisions)) {
      await writeFile(join(root, 'decisions', `${name}.yaml`), yaml);
    }
    const schema = fixture.resultSchema ?? RESULT_SCHEMA;
    await writeFile(join(root, 'schemas', 'approve-claim.result.json'), JSON.stringify(schema));
  }
  return root;
}

function compileOptions(
  loaded: LoadedRawDomainPackage,
  fixture: RawFixture = {},
  profile: TargetHostProfile = target(),
) {
  return {
    raw: loaded,
    domainVersion: '1.0.0-t001',
    target: profile,
    bindingContents: BINDING_CONTENTS,
    ...(fixture.tools === undefined ? {} : { tools: [...fixture.tools] }),
    ...(fixture.projections === undefined ? {} : { projections: [...fixture.projections] }),
    ...(fixture.businessSources === undefined ? {} : { businessSources: [...fixture.businessSources] }),
  };
}

async function compileWithDecision(fixture: RawFixture = {}) {
  const effective: RawFixture = { decisions: { 'approve-claim': decisionYaml() }, ...fixture };
  const root = await writeRawPackage(effective);
  const loaded = await loadRawDomainPackage({ root });
  const manifest = compileDomainPackage(compileOptions(loaded, effective)).manifest;
  return { loaded, root, manifest };
}

async function loadFixture(fixture: RawFixture = {}): Promise<LoadedRawDomainPackage> {
  return loadRawDomainPackage({ root: await writeRawPackage(fixture) });
}

test('T001 R1: a v0.5-style package with no semantic-decision declaration loads and compiles unchanged', async () => {
  const loaded = await loadFixture();
  assert.equal(loaded.semanticDecisions?.size ?? 0, 0);
  const { manifest } = await compileWithDecision({ decisions: {} });
  assert.equal(manifest.semanticDecisions, undefined);
  assert.equal(manifest.semanticDecisionContractVersion, undefined);
  assert.ok(!manifest.requiredCapabilities.includes(SEMANTIC_DECISION_CAPABILITY));
  // The retained material keeps its exact historical manifest shape.
  assert.deepEqual(Object.keys(manifest).sort(), [
    'bindingDigests', 'businessSources', 'compatibility', 'domainData', 'domainId', 'domainVersion',
    'executionEngineMajor', 'formatVersion', 'packageDataBounds', 'packageId', 'projections',
    'requiredCapabilities', 'runtimeContractMajor', 'schemaContractVersion', 'schemas',
    'targetProfileId', 'tools', 'workflows',
  ]);
  assert.doesNotThrow(() => assertCompiledPackageManifest(manifest));
});

test('T001 R2: a valid semantic-decision declaration compiles into a portable first-class representation', async () => {
  const { loaded, manifest } = await compileWithDecision({ tools: [readOnlyTool()] });
  assert.equal(loaded.semanticDecisions?.size, 1);
  assert.equal(manifest.semanticDecisionContractVersion, SEMANTIC_DECISION_CONTRACT_VERSION_V1);
  assert.ok(manifest.requiredCapabilities.includes(SEMANTIC_DECISION_CAPABILITY));
  assert.equal(manifest.semanticDecisions?.length, 1);
  const decision = manifest.semanticDecisions?.[0] as CompiledSemanticDecisionDescriptor;
  assert.equal(decision.decisionId, 'approve-claim');
  assert.equal(decision.inputSelection, '$.claim');
  // Structured result schema authority is bundled, not an opaque free-form result.
  assert.deepEqual(decision.resultSchema, RESULT_SCHEMA);
  assert.deepEqual(decision.allowedOutcomes, ['approve', 'reject']);
  assert.deepEqual(decision.allowedEventTypes, ['CLAIM_APPROVED', 'CLAIM_REJECTED']);
  assert.deepEqual(decision.queryCapabilityIds, ['claims.lookup']);
  assert.deepEqual(decision.dependencyMaterial, { requiredProjectionIds: [], requiredRevisionSourceIds: [] });
  // Optional authoring cache policy materializes to the existing resolver default.
  assert.deepEqual(decision.cachePolicy, { mode: 'eligible' });
  assert.equal(decision.promotedReference, undefined);
  assert.deepEqual(decision.policy, { maxSteps: 8 });
  assert.deepEqual(decision.unavailable, { kind: 'declared-event', eventType: 'CLAIM_REJECTED', outcome: 'reject' });
  assert.match(decision.declarationDigest, /^[0-9a-f]{64}$/u);
  // Portable: a JSON wire round-trip preserves the descriptor exactly.
  const roundTrip = JSON.parse(JSON.stringify(manifest)) as CompiledPackageManifest;
  assert.deepEqual(roundTrip.semanticDecisions, manifest.semanticDecisions);
  assert.doesNotThrow(() => assertCompiledPackageManifest(manifest));
});

test('T001 R3: declaration identity is stable; duplicate and conflicting decision ids fail closed', async () => {
  const first = await compileWithDecision({ tools: [readOnlyTool()] });
  const second = await compileWithDecision({ tools: [readOnlyTool()] });
  const decisionA = first.manifest.semanticDecisions?.[0] as CompiledSemanticDecisionDescriptor;
  const decisionB = second.manifest.semanticDecisions?.[0] as CompiledSemanticDecisionDescriptor;
  assert.equal(decisionA.declarationDigest, decisionB.declarationDigest);
  assert.equal(first.manifest.packageId, second.manifest.packageId);

  // Duplicate decisionId across two authoring files fails the load.
  await assert.rejects(
    loadFixture({ decisions: { 'one': decisionYaml(), 'two': decisionYaml() } }),
    (error: unknown) => error instanceof RawPackageDefinitionError
      && error.issues.some((issue: string) => issue.includes("duplicate decisionId 'approve-claim'")),
  );

  // A hand-built descriptor array with duplicate ids fails the manifest assertion.
  const tampered = structuredClone(first.manifest);
  tampered.semanticDecisions = [...(tampered.semanticDecisions as CompiledSemanticDecisionDescriptor[]), decisionA];
  assert.throws(
    () => assertCompiledPackageManifest(tampered),
    (error: unknown) => error instanceof CompiledManifestValidationError
      && error.issues.some((issue) => issue.includes("duplicate decisionId 'approve-claim'")),
  );
});

test('T001 R4: allowed outcomes and Domain Event types are finite and validated', async () => {
  for (const [key, value, expected] of [
    ['allowedOutcomes', '[]', 'must be a non-empty array of non-empty strings'],
    ['allowedOutcomes', '[approve, approve]', 'must not contain duplicates'],
    ['allowedOutcomes', '[approve, 3]', 'must be a non-empty array of non-empty strings'],
    ['allowedEventTypes', '[]', 'must be a non-empty array of non-empty strings'],
    ['allowedEventTypes', '[CLAIM_APPROVED, CLAIM_APPROVED]', 'must not contain duplicates'],
  ] as const) {
    await assert.rejects(
      loadFixture({ decisions: { 'approve-claim': decisionYaml({ [key]: value }) } }),
      (error: unknown) => error instanceof RawPackageDefinitionError
        && error.issues.some((issue: string) => issue.includes(key) && issue.includes(expected)),
      `expected failure for ${key}: ${value}`,
    );
  }
  // A missing required vocabulary field fails closed.
  const withoutOutcomes = decisionYaml()
    .split('\n')
    .filter((line) => !line.startsWith('allowedOutcomes:'))
    .join('\n');
  await assert.rejects(
    loadFixture({ decisions: { 'approve-claim': withoutOutcomes } }),
    RawPackageDefinitionError,
  );
});

test('T001 R5: structured result schema authority is explicit and validated through the existing schema machinery', async () => {
  // The schema is loaded into the package schema set through the loader.
  const loaded = await loadFixture({ decisions: { 'approve-claim': decisionYaml() }, tools: [readOnlyTool()] });
  const declaration = loaded.semanticDecisions?.get('approve-claim');
  assert.ok(declaration);
  assert.ok(loaded.schemas.has(`decision:approve-claim:result:${declaration.resultSchemaPath}`));

  // A missing schema file fails the load.
  await assert.rejects(
    loadFixture({
      decisions: { 'approve-claim': decisionYaml().replace('schemas/approve-claim.result.json', 'schemas/absent.json') },
    }),
    (error: unknown) => error instanceof RawPackageDefinitionError
      && error.issues.some((issue: string) => issue.includes('ENOENT')),
  );

  // A schema that is not valid JSON Schema fails the load.
  await assert.rejects(
    loadFixture({ decisions: { 'approve-claim': decisionYaml() }, resultSchema: { type: 'not-a-type' } }),
    (error: unknown) => error instanceof RawPackageDefinitionError
      && error.issues.some((issue: string) => issue.includes('JSON Schema compile failed')),
  );

  // A schema outside the DOMAIN_HARNESS_JSON_SCHEMA_V1 contract fails compile
  // even when it survived the generic loader check.
  const offContract = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    type: 'object',
  };
  const handBuilt: LoadedRawDomainPackage = {
    ...loaded,
    schemas: new Map([...loaded.schemas.entries()].map(([key, schema]) => [
      key,
      key.startsWith('decision:') ? offContract : schema,
    ])),
  };
  assert.throws(
    () => compileDomainPackage(compileOptions(handBuilt)),
    (error: unknown) => error instanceof SemanticDecisionCompileError
      && error.issues.some((issue) => issue.includes('$schema')),
  );
});

test('T001 R6: allowed reasoning capabilities are query/read-only; mutation/effect exposure is rejected', async () => {
  const compiled = await compileWithDecision({ tools: [readOnlyTool()] });
  assert.deepEqual(compiled.manifest.semanticDecisions?.[0]?.queryCapabilityIds, ['claims.lookup']);

  for (const effect of ['idempotent', 'non-idempotent'] as const) {
    const mutation = mutationTool('claims.lookup', effect);
    const loaded = await loadFixture({ decisions: { 'approve-claim': decisionYaml() }, tools: [mutation] });
    assert.throws(
      () => compileDomainPackage(compileOptions(loaded, { tools: [mutation] })),
      (error: unknown) => error instanceof SemanticDecisionCompileError
        && error.issues.some((issue) => issue.includes(`mutation/effect semantics '${effect}'`)),
      `expected rejection for effect '${effect}'`,
    );
  }

  // An undeclared capability identity fails closed.
  const loaded = await loadFixture({
    decisions: { 'approve-claim': decisionYaml({ queryCapabilities: '[claims.absent]' }) },
    tools: [readOnlyTool()],
  });
  assert.throws(
    () => compileDomainPackage(compileOptions(loaded, { tools: [readOnlyTool()] })),
    (error: unknown) => error instanceof SemanticDecisionCompileError
      && error.issues.some((issue) => issue.includes("'claims.absent' is not a declared Tool")),
  );
});

test('T001 R7: bounded Harness policy is required and validated', async () => {
  const compiled = await compileWithDecision({ tools: [readOnlyTool()] });
  assert.deepEqual(compiled.manifest.semanticDecisions?.[0]?.policy, { maxSteps: 8 });

  for (const maxSteps of ['0', '-3', '1.5']) {
    await assert.rejects(
      loadFixture({ decisions: { 'approve-claim': decisionYaml({ policyMaxSteps: maxSteps }) } }),
      (error: unknown) => error instanceof RawPackageDefinitionError
        && error.issues.some((issue: string) => issue.includes('must be a positive integer')),
      `expected rejection for maxSteps ${maxSteps}`,
    );
  }

  // The policy key set is closed: no extra bounds sneak in.
  const extraPolicy = decisionYaml().replace('  maxSteps: 8', '  maxSteps: 8\n  maxTokens: 100');
  await assert.rejects(
    loadFixture({ decisions: { 'approve-claim': extraPolicy } }),
    (error: unknown) => error instanceof RawPackageDefinitionError
      && error.issues.some((issue: string) => issue.includes('unsupported keys: maxTokens')),
  );

  // A missing policy fails closed.
  const withoutPolicy = decisionYaml()
    .split('\n')
    .filter((line) => line !== 'policy:' && line !== '  maxSteps: 8')
    .join('\n');
  await assert.rejects(loadFixture({ decisions: { 'approve-claim': withoutPolicy } }), RawPackageDefinitionError);
});

test('T001 R8: decision-scoped dependency/currentness material is representable without a generic work/obligation model', async () => {
  const fixture: RawFixture = {
    decisions: { 'approve-claim': decisionYaml({
      requiredProjections: '[claim.view]',
      requiredRevisionSources: '[claims.source]',
    }) },
    projections: [{
      projectionId: 'claim.view',
      expression: '$',
      dependencies: [{ kind: 'business', source: 'claims.source', selector: {} }],
      outputSchema: { type: 'object' },
    }],
    businessSources: [{ source: 'claims.source', valueSchema: { type: 'object' } }],
  };
  const compiled = await compileWithDecision({ ...fixture, tools: [readOnlyTool()] });
  assert.deepEqual(compiled.manifest.semanticDecisions?.[0]?.dependencyMaterial, {
    requiredProjectionIds: ['claim.view'],
    requiredRevisionSourceIds: ['claims.source'],
  });

  // Undeclared projection / Business Source references fail compile.
  const unknownProjection = await loadFixture({
    decisions: { 'approve-claim': decisionYaml({ requiredProjections: '[absent.projection]' }) },
  });
  assert.throws(
    () => compileDomainPackage(compileOptions(unknownProjection)),
    (error: unknown) => error instanceof SemanticDecisionCompileError
      && error.issues.some((issue) => issue.includes("required projection 'absent.projection'")),
  );
  const unknownSource = await loadFixture({
    decisions: { 'approve-claim': decisionYaml({ requiredRevisionSources: '[absent.source]' }) },
  });
  assert.throws(
    () => compileDomainPackage(compileOptions(unknownSource)),
    (error: unknown) => error instanceof SemanticDecisionCompileError
      && error.issues.some((issue) => issue.includes("required revision source 'absent.source'")),
  );

  // Generic work/obligation vocabulary is unrepresentable: closed key set.
  for (const forbidden of ['obligations: []', 'workItems: []', 'goals: []']) {
    await assert.rejects(
      loadFixture({ decisions: { 'approve-claim': `${decisionYaml()}${forbidden}\n` } }),
      (error: unknown) => error instanceof RawPackageDefinitionError
        && error.issues.some((issue: string) => issue.includes('unsupported keys')),
      `expected rejection of ${forbidden}`,
    );
  }
});

test('T001 R9: cache/exact-reuse and promoted-known-process references use the existing resolver/promotion vocabulary', async () => {
  // Every frozen bypass reason is declarable; the compiled policy records it.
  for (const reason of [
    'non-cacheable',
    'time-sensitive',
    'live-dependency-without-semantic-revision',
    'dynamic-dependency-not-prebound',
    'explicit-domain-policy',
  ]) {
    const compiled = await compileWithDecision({
      decisions: { 'approve-claim': decisionYaml({ cachePolicy: `{ mode: bypass, reason: ${reason} }` }) },
      tools: [readOnlyTool()],
    });
    assert.deepEqual(compiled.manifest.semanticDecisions?.[0]?.cachePolicy, { mode: 'bypass', reason });
  }

  // An invented bypass reason fails closed.
  await assert.rejects(
    loadFixture({
      decisions: { 'approve-claim': decisionYaml({ cachePolicy: '{ mode: bypass, reason: model-cheaper }' }) },
    }),
    (error: unknown) => error instanceof RawPackageDefinitionError
      && error.issues.some((issue: string) => issue.includes('frozen resolver bypass reasons')),
  );

  // Promoted references resolve through the existing PromotedChildSelector vocabulary.
  const versionRef = await compileWithDecision({
    decisions: { 'approve-claim': decisionYaml({ promotedReference: '{ kind: version, artifactId: approve-process, version: 1.2.0 }' }) },
    tools: [readOnlyTool()],
  });
  assert.deepEqual(versionRef.manifest.semanticDecisions?.[0]?.promotedReference, {
    kind: 'version', artifactId: 'approve-process', version: '1.2.0',
  });
  const aliasRef = await compileWithDecision({
    decisions: { 'approve-claim': decisionYaml({ promotedReference: '{ kind: alias, artifactId: approve-process, alias: stable }' }) },
    tools: [readOnlyTool()],
  });
  assert.deepEqual(aliasRef.manifest.semanticDecisions?.[0]?.promotedReference, {
    kind: 'alias', artifactId: 'approve-process', alias: 'stable',
  });

  // Malformed promoted references fail closed.
  for (const promoted of [
    '{ kind: version, artifactId: p, version: 1.0.0, alias: also }',
    '{ kind: exact-digest, artifactId: p }',
    '{ kind: alias, artifactId: p }',
  ]) {
    await assert.rejects(
      loadFixture({ decisions: { 'approve-claim': decisionYaml({ promotedReference: promoted }) } }),
      RawPackageDefinitionError,
      `expected rejection: ${promoted}`,
    );
  }
});

test('T001 R10: an explicit semantic-unavailable disposition is required, finite, and vocabulary-bound', async () => {
  const failClosed = await compileWithDecision({
    decisions: { 'approve-claim': decisionYaml({ unavailable: '{ kind: fail-closed }' }) },
    tools: [readOnlyTool()],
  });
  assert.deepEqual(failClosed.manifest.semanticDecisions?.[0]?.unavailable, { kind: 'fail-closed' });

  // The declared-event disposition must use the declaration's own finite vocabulary.
  for (const [unavailable, expected] of [
    ['{ kind: declared-event, eventType: UNDECLARED_EVENT, outcome: reject }', "eventType 'UNDECLARED_EVENT'"],
    ['{ kind: declared-event, eventType: CLAIM_REJECTED, outcome: escalate }', "outcome 'escalate'"],
  ] as const) {
    await assert.rejects(
      loadFixture({ decisions: { 'approve-claim': decisionYaml({ unavailable }) } }),
      (error: unknown) => error instanceof RawPackageDefinitionError
        && error.issues.some((issue: string) => issue.includes(expected)),
    );
  }

  // A declaration without any unavailable disposition fails closed.
  const withoutUnavailable = decisionYaml()
    .split('\n')
    .filter((line) => !line.startsWith('unavailable:'))
    .join('\n');
  await assert.rejects(
    loadFixture({ decisions: { 'approve-claim': withoutUnavailable } }),
    RawPackageDefinitionError,
  );
});

test('T001 R11: provider/model names, engine state ids and Adaptive Region/Goal/Obligation/JIT fields are unrepresentable authority', async () => {
  const forbiddenTopLevel = [
    'provider: openai',
    'model: gpt-4o',
    'modelRouting: { primary: openai }',
    'providerFallback: [anthropic]',
    'engineStateId: reviewing',
    'adaptiveRegion: review-loop',
    'goalRuntime: {}',
    'obligationGraph: []',
    'jitGraph: {}',
  ];
  for (const forbidden of forbiddenTopLevel) {
    await assert.rejects(
      loadFixture({ decisions: { 'approve-claim': `${decisionYaml()}${forbidden}\n` } }),
      (error: unknown) => error instanceof RawPackageDefinitionError
        && error.issues.some((issue: string) => issue.includes('unsupported keys')),
      `expected rejection of top-level '${forbidden}'`,
    );
  }

  // Nested smuggling into closed sub-objects fails closed too.
  const nestedInPolicy = decisionYaml().replace('  maxSteps: 8', '  maxSteps: 8\n  model: gpt-4o');
  const nestedInUnavailable = decisionYaml()
    .replace(
      'unavailable: { kind: declared-event, eventType: CLAIM_REJECTED, outcome: reject }',
      [
        'unavailable:',
        '  kind: declared-event',
        '  eventType: CLAIM_REJECTED',
        '  outcome: reject',
        '  provider: openai',
      ].join('\n'),
    );
  for (const nested of [nestedInPolicy, nestedInUnavailable]) {
    await assert.rejects(
      loadFixture({ decisions: { 'approve-claim': nested } }),
      (error: unknown) => error instanceof RawPackageDefinitionError
        && error.issues.some((issue: string) => issue.includes('unsupported keys')),
    );
  }

  // The compiled contract carries none of that vocabulary anywhere.
  const compiled = await compileWithDecision({ tools: [readOnlyTool()] });
  const serialized = JSON.stringify(compiled.manifest.semanticDecisions);
  assert.doesNotMatch(serialized, /"(provider|model|modelRouting|providerFallback|engineStateId|adaptiveRegion|goal|obligation|jit)/u);
});

test('T001 R12: compiled capability/version requirements fail closed through the existing compatibility machinery', async () => {
  // (a) A target profile without the semantic-decision capability fails compile.
  const loaded = await loadFixture({ decisions: { 'approve-claim': decisionYaml() }, tools: [readOnlyTool()] });
  assert.throws(
    () => compileDomainPackage(compileOptions(loaded, {}, target({ withSemanticCapability: false }))),
    (error: unknown) => error instanceof MissingTargetCapabilityError && error.missing.includes(SEMANTIC_DECISION_CAPABILITY),
  );

  // (b) A manifest with descriptors but a foreign declaration version fails closed.
  const { manifest } = await compileWithDecision({ tools: [readOnlyTool()] });
  const wrongVersion = structuredClone(manifest);
  wrongVersion.semanticDecisionContractVersion = 'semantic-declaration.v2' as never;
  assert.throws(
    () => assertCompiledPackageManifest(wrongVersion),
    (error: unknown) => error instanceof CompiledManifestValidationError
      && error.issues.some((issue) => issue.includes('must be exactly')),
  );

  // (c) The capability is required whenever descriptors exist.
  const withoutCapability = structuredClone(manifest);
  withoutCapability.requiredCapabilities = withoutCapability.requiredCapabilities
    .filter((capability) => capability !== SEMANTIC_DECISION_CAPABILITY);
  assert.throws(
    () => assertCompiledPackageManifest(withoutCapability),
    (error: unknown) => error instanceof CompiledManifestValidationError
      && error.issues.some((issue) => issue.includes(`require capability '${SEMANTIC_DECISION_CAPABILITY}'`)),
  );

  // (d) Version and descriptors are inseparable.
  const withoutVersion = structuredClone(manifest) as CompiledPackageManifest & { semanticDecisionContractVersion?: string };
  delete withoutVersion.semanticDecisionContractVersion;
  assert.throws(
    () => assertCompiledPackageManifest(withoutVersion),
    (error: unknown) => error instanceof CompiledManifestValidationError
      && error.issues.some((issue) => issue.includes('must be present together')),
  );

  // (e) Retained 0.2/2/2 manifests can never carry semantic-decision material.
  const legacy = structuredClone(manifest) as unknown as Record<string, unknown>;
  legacy.formatVersion = '0.2';
  legacy.runtimeContractMajor = 2;
  legacy.executionEngineMajor = 2;
  delete legacy.schemaContractVersion;
  delete legacy.packageDataBounds;
  delete legacy.domainData;
  delete legacy.businessSources;
  assert.throws(
    () => assertCompiledPackageManifest(legacy as never),
    (error: unknown) => error instanceof CompiledManifestValidationError
      && error.issues.some((issue) => issue.includes('successor-only material and must be absent on a 0.2/2/2 manifest')),
  );

  // (f) The compiler-independent structural validator rejects malformed descriptors.
  assert.ok(semanticDecisionManifestIssues([{ decisionId: 'x' }]).length > 0);
  assert.ok(semanticDecisionManifestIssues([]).length > 0);
  assert.ok(semanticDecisionManifestIssues('nope').length > 0);
  assert.deepEqual(semanticDecisionManifestIssues(manifest.semanticDecisions), []);
});
