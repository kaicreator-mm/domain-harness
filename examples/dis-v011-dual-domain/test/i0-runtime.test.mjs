/**
 * I0 (#1533) — public-SDK-entry wiring of the D1 Element/AOT contract layer
 * (#1530) and the D2 bounded execution envelope (#1531) over the REAL
 * dual-domain source-pinned snapshot bytes delivered by D3 (#1532).
 *
 * Everything D1/D2 is called through the package's public export entry
 * (`dist/index.js`, the module `exports['.']` serves) — never via internal
 * module paths or test helpers. The selected Function implementations are the
 * actual pinned snapshot modules (Tally rule chain + xDownload knowledge),
 * byte-verified against their originating Git blobs before they run inside the
 * bounded envelope. Every outcome stays unattested: this wiring is an
 * engineering preview, not authority.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

// The public SDK export entry of the DIS Runtime package.
import {
  ELEMENT_MANIFEST_SCHEMA, parseElementManifest, resolveDependencyClosure,
  validateSemanticRelations, lockAot, resolveLockedFunction, assertFunctionBindings,
  ElementContractError, createBoundedEnvelope, digest,
} from '../../../packages/dis-v011-runtime/dist/index.js';
// D3's own consumer qualification (production example code, not a test helper):
// pin table + `git hash-object` grammar + the structural external-effect deny.
import { gitBlobSha, PINNED, qualifyProjectConsumers } from '../consumer.mjs';

const TARGET = 'linux-x64-node24';
const readSnapshot = async (file) => await readFile(new URL('../snapshots/' + file, import.meta.url));

const TALLY_INPUT = {
  issueRef: 'https://github.com/kaicreator-mm/tally/issues/331',
  issueNumber: 331,
  sourceSha: 'a'.repeat(40),
  claimRef: 'claim:i0-wiring-not-authority',
  dependenciesComplete: true,
};

// The four selected Functions, exactly as the dual-domain declaration pins them.
const FUNCTION_PINS = {
  assessTaskEvidence: 'tally/business.mjs',
  projectReleaseReadiness: 'tally/release-readiness.mjs',
  describeDownloadPolicy: 'xdownload/business-download.mjs',
  acquire: 'xdownload/capability-acquisition-stub.mjs',
};

const MANIFEST = {
  schema: ELEMENT_MANIFEST_SCHEMA,
  relations: [
    // A semantic cycle over the downloads pair: legal metadata, never a
    // static dependency edge (R3), re-proven through the public entry.
    { from: 'downloads.confirmation', to: 'downloads.acquisition', kind: 'constrains' },
    { from: 'downloads.acquisition', to: 'downloads.confirmation', kind: 'cooperates-with' },
  ],
  consumers: [
    {
      id: 'tally',
      repository: 'kaicreator-mm/tally',
      sourceCommit: 'e988321439f65b55936a691c02250b6d62a29409',
      domainId: 'tally-engineering',
      sources: [
        { file: 'tally/business.mjs', originalPath: PINNED['tally/business.mjs'].originalPath, gitBlob: PINNED['tally/business.mjs'].gitBlob },
        { file: 'tally/release-readiness.mjs', originalPath: PINNED['tally/release-readiness.mjs'].originalPath, gitBlob: PINNED['tally/release-readiness.mjs'].gitBlob },
      ],
      elements: [
        { id: 'tally.tasks', description: '工程 Task 的 Claim/Evidence 评估', functions: [
          { id: 'assessTaskEvidence', exportName: 'assessTaskEvidence', source: 'tally/business.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/task-evidence.input.json', outputSchemaRef: 'schemas/tally/task-evidence.output.json' },
        ] },
        { id: 'tally.release', description: '独立 RQ 授权前的证据投影', dependsOn: ['tally.tasks'], functions: [
          { id: 'projectReleaseReadiness', exportName: 'projectReleaseReadiness', source: 'tally/release-readiness.mjs', implementation: 'rule', effects: 'none', inputSchemaRef: 'schemas/tally/release-readiness.input.json', outputSchemaRef: 'schemas/tally/release-readiness.output.json' },
        ] },
      ],
    },
    {
      id: 'xdownload',
      repository: 'kaicreator-mm/xDownload',
      sourceCommit: 'e904f08c478b15147b1c07fbe53c610d2d81851f',
      domainId: 'downloads',
      sources: [
        { file: 'xdownload/business-download.mjs', originalPath: PINNED['xdownload/business-download.mjs'].originalPath, gitBlob: PINNED['xdownload/business-download.mjs'].gitBlob },
        { file: 'xdownload/capability-acquisition-stub.mjs', originalPath: PINNED['xdownload/capability-acquisition-stub.mjs'].originalPath, gitBlob: PINNED['xdownload/capability-acquisition-stub.mjs'].gitBlob },
      ],
      elements: [
        { id: 'downloads.confirmation', description: '确认下载 Intent 与字节预算', functions: [
          { id: 'describeDownloadPolicy', exportName: 'getPolicy', source: 'xdownload/business-download.mjs', implementation: 'knowledge', effects: 'none', inputSchemaRef: 'schemas/xdownload/download-policy.input.json', outputSchemaRef: 'schemas/xdownload/download-policy.output.json' },
        ] },
        { id: 'downloads.acquisition', description: '受 KDP permit 约束的真实外部采集 Effect', dependsOn: ['downloads.confirmation'], functions: [
          { id: 'acquire', exportName: 'acquire', source: 'xdownload/capability-acquisition-stub.mjs', implementation: 'external-effect', effects: 'non-idempotent', inputSchemaRef: 'schemas/xdownload/acquisition.input.json', outputSchemaRef: 'schemas/xdownload/acquisition.output.json' },
        ] },
      ],
    },
  ],
};

const snapshotText = {};
const snapshotModules = {};
for (const [functionId, file] of Object.entries(FUNCTION_PINS)) {
  const bytes = await readSnapshot(file);
  assert.equal(gitBlobSha(bytes), PINNED[file].gitBlob, `${file} bytes must match its originating Git blob`);
  snapshotText[file] = bytes.toString('utf8');
  snapshotModules[functionId] = await import(new URL('../snapshots/' + file, import.meta.url).href);
}

const aotPins = (overrides = {}) => Object.fromEntries(Object.entries(FUNCTION_PINS).map(([functionId, file]) => [functionId, {
  path: file, sha256: digest(overrides[file] ?? snapshotText[file]), target: TARGET,
}]));
const bindingCandidates = (overrides = {}) => Object.fromEntries(Object.entries(FUNCTION_PINS).map(([functionId, file]) => [functionId, {
  path: file, target: TARGET, content: overrides[file] ?? snapshotText[file],
}]));

function sealDualDomainAot(overrides) {
  const manifest = parseElementManifest(MANIFEST);
  const closure = resolveDependencyClosure(manifest);
  const relations = validateSemanticRelations(manifest);
  const lock = lockAot(manifest, aotPins(overrides), { expectedTarget: TARGET });
  assertFunctionBindings(lock, bindingCandidates(overrides));
  return { manifest, closure, relations, lock };
}

const throwsElementCode = (fn, code) => assert.throws(fn, (error) => error instanceof ElementContractError && error.code === code);

test('P-I0-1: public SDK entry runs the real pinned dual-domain Functions inside the bounded envelope', async () => {
  const { closure, lock } = sealDualDomainAot();
  assert.deepEqual(closure.order, ['tally.tasks', 'tally.release', 'downloads.confirmation', 'downloads.acquisition']);
  assert.equal(resolveLockedFunction(lock, 'acquire').target, TARGET);

  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 4, maxWorkUnits: 8, wallClockMs: 10_000 },
    providers: [{ kind: 'local-deterministic', id: 'i0-dual-domain-runner' }],
  });

  // Tally selected rule: the REAL pinned bytes, executed unattested.
  const assessment = await envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () =>
      snapshotModules.assessTaskEvidence.assessTaskEvidence({ ...TALLY_INPUT })),
  });
  assert.equal(assessment.status, 'COMPLETED');
  assert.equal(assessment.disposition, 'OBSERVED');
  assert.equal(assessment.attested, false);
  assert.equal(assessment.authority, 'NONE');
  assert.equal(assessment.provider.kind, 'local-deterministic');
  assert.equal(assessment.output.state, 'OBSERVED_INPUT_ONLY');
  assert.equal(assessment.output.admitted, false);

  // xDownload selected knowledge Function from the second real domain.
  const policy = await envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () =>
      snapshotModules.describeDownloadPolicy.getPolicy()),
  });
  assert.equal(policy.status, 'COMPLETED');
  assert.equal(policy.attested, false);
  assert.equal(policy.output.packageId, 'business-download@0.2.0-t03');
  // Reserve/settle trace events exist for both runs and stay unattested.
  for (const outcome of [assessment, policy]) {
    assert.ok(outcome.trace.some((event) => event.type === 'budget-reserved' && event.attested === false));
    assert.ok(outcome.trace.some((event) => event.type === 'budget-settled' && event.attested === false));
  }
});

test('P-I0-2: a legally re-sealed rule revision observably changes the runtime result', async () => {
  // Same input contract, revised admission semantics — a NEW selection, not drift.
  const revisionSource = 'export function assessTaskEvidence(input) {\n'
    + '  if (!input || input.dependenciesComplete !== true) {\n'
    + "    return Object.freeze({ state: 'UNQUALIFIED_INPUT', reason: 'DEPENDENCIES_UNVERIFIED', admitted: false, taskPass: false });\n"
    + '  }\n'
    + "  return Object.freeze({ state: 'REVISED_OBSERVATION', reason: 'REVISION_ADMITS_COMPLETE_DEPENDENCIES', issueRef: input.issueRef, sourceSha: input.sourceSha, admitted: true, taskPass: true });\n"
    + '}\n';
  const revisionModule = await import('data:text/javascript;base64,'
    + Buffer.from(revisionSource, 'utf8').toString('base64'));

  const original = sealDualDomainAot();
  const revised = sealDualDomainAot({ 'tally/business.mjs': revisionSource });
  // Re-sealing the same revision is deterministic; it is a different lock.
  assert.equal(sealDualDomainAot({ 'tally/business.mjs': revisionSource }).lock.lockSha256, revised.lock.lockSha256);
  assert.notEqual(revised.lock.lockSha256, original.lock.lockSha256);

  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 2, maxWorkUnits: 4, wallClockMs: 10_000 },
    providers: [{ kind: 'local-deterministic', id: 'i0-revision-runner' }],
  });
  const revisionOutcome = await envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () =>
      revisionModule.assessTaskEvidence({ ...TALLY_INPUT })),
  });
  assert.equal(revisionOutcome.status, 'COMPLETED');
  assert.equal(revisionOutcome.output.state, 'REVISED_OBSERVATION');
  assert.equal(revisionOutcome.output.admitted, true);
  // Same input, different selected revision ⇒ different observable result
  // (the pinned rule stays admitted:false — see P-I0-1).
  assert.notEqual(revisionOutcome.output.state, 'OBSERVED_INPUT_ONLY');
  assert.notEqual(revisionOutcome.output.admitted, false);
});

test('N-I0-3: revised bytes presented against the un-re-sealed lock fail closed with zero execution', () => {
  const revisionSource = 'export function assessTaskEvidence(input) {\n'
    + "  return Object.freeze({ state: 'FORGED', admitted: true });\n"
    + '}\n';
  const original = sealDualDomainAot();
  throwsElementCode(
    () => assertFunctionBindings(original.lock, bindingCandidates({ 'tally/business.mjs': revisionSource })),
    'ELEMENT_FUNCTION_DIGEST_MISMATCH',
  );
  // The sealed lock keeps resolving only its own pinned entry.
  assert.equal(resolveLockedFunction(original.lock, 'assessTaskEvidence').sha256, digest(snapshotText['tally/business.mjs']));
});

test('N-I0-4: the unauthorized external Effect is refused with zero dispatch, and provider impersonation is rejected', async () => {
  // Structural deny in the example's consumer adapter: acquire may never be
  // invoked directly — this throws before any adapter dispatch can happen.
  const declaration = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
  const qualified = await qualifyProjectConsumers(declaration);
  await assert.rejects(
    () => qualified.invoke('downloads.acquisition.acquire', { url: 'https://example.invalid/x', bytes: 1 }),
    (error) => error.code === 'DIS_EXTERNAL_EFFECT_KDP_REQUIRED',
  );

  // Provider admission through the public entry: an authority kind this
  // envelope can never serve is refused before execution and before budget.
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 1, maxWorkUnits: 1, wallClockMs: 10_000 },
    providers: [{ kind: 'fixture', id: 'i0-fixture-label' }],
  });
  const impersonated = await envelope.execute({
    providerKind: 'llm',
    run: () => {
      throw new Error('MUST_NOT_RUN');
    },
  });
  assert.equal(impersonated.status, 'PROVIDER_REJECTED');
  assert.equal(impersonated.code, 'PROVIDER_KIND_FORBIDDEN');
  assert.equal(impersonated.output, null);
  assert.equal(envelope.remaining().steps, 1, 'rejection spends no budget');
  assert.ok(impersonated.trace.some((event) => event.type === 'provider-rejected'));
});

test('N-I0-5: budget exhaustion mid-chain fails closed with no partial success', async () => {
  const { lock } = sealDualDomainAot();
  assert.ok(lock.closure.includes('tally.tasks'));
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 1, maxWorkUnits: 4, wallClockMs: 10_000 },
    providers: [{ kind: 'local-deterministic', id: 'i0-exhaustion-runner' }],
  });
  const first = await envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 2 }, async () =>
      snapshotModules.assessTaskEvidence.assessTaskEvidence({ ...TALLY_INPUT })),
  });
  assert.equal(first.status, 'COMPLETED');

  const second = await envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () =>
      snapshotModules.projectReleaseReadiness.projectReleaseReadiness({
        repository: 'kaicreator-mm/tally',
        sourceSha: TALLY_INPUT.sourceSha,
        observedAsOf: new Date(0).toISOString(),
        gates: {},
      })),
  });
  assert.equal(second.status, 'BUDGET_EXHAUSTED');
  assert.equal(second.axis, 'steps');
  assert.equal(second.output, null);
  assert.equal(second.attested, false);
  assert.equal(envelope.remaining().steps, 0);
});

test('P-I0-6: the dependent release Function consumes the rule output inside the envelope and stays BLOCKED', async () => {
  const envelope = createBoundedEnvelope({
    budget: { maxSteps: 2, maxWorkUnits: 4, wallClockMs: 10_000 },
    providers: [{ kind: 'local-deterministic', id: 'i0-chain-runner' }],
  });
  const assessment = await envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () =>
      snapshotModules.assessTaskEvidence.assessTaskEvidence({ ...TALLY_INPUT })),
  });
  const observedAsOf = new Date(0).toISOString();
  const readiness = await envelope.execute({
    providerKind: 'local-deterministic',
    run: (ctx) => ctx.step({ workUnits: 1 }, async () =>
      snapshotModules.projectReleaseReadiness.projectReleaseReadiness({
        repository: 'kaicreator-mm/tally',
        sourceSha: TALLY_INPUT.sourceSha,
        observedAsOf,
        gates: {
          nativeClaims: {
            status: assessment.output.admitted === false ? 'UNKNOWN' : 'PASS',
            observedAsOf,
            evidenceRef: TALLY_INPUT.issueRef,
          },
        },
      })),
  });
  assert.equal(readiness.status, 'COMPLETED');
  assert.equal(readiness.attested, false);
  // The REAL pinned projection honestly stays BLOCKED: zero authority.
  assert.equal(readiness.output.status, 'BLOCKED');
  assert.equal(readiness.output.reason, 'REQUIRED_EVIDENCE_INCOMPLETE');
  assert.equal(readiness.output.authorization, 'NONE');
  assert.equal(readiness.output.canPublish, false);
});
