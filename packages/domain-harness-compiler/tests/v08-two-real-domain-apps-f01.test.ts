/**
 * T-F #1005 — real Domain App BUILD+policy contract pre-integration tests.
 *
 * These tests exercise the actual current-v0.8 compiler, physical selected
 * K/S module bytes and two DISTINCT Business policy modules. They do not
 * claim real Host/Kernel runtime E2E; that requires protected H↔K binding,
 * genuine issuer credentials, physical CAS and typed UX in F02/F03.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { qualifyPackageClosure } from '../src/qualified-package/qualify.js';
import { buildQualifiedPackage, BuildError } from '../src/qualified-package/build.js';
import { issueApprovalProof } from '../src/qualified-package/approval.js';
import * as approval from '../../../examples/v08-domain-apps/business-approval.mjs';
import * as engineering from '../../../examples/v08-domain-apps/business-engineering.mjs';
import * as sdk from '../../../domain-packages/standard/basic/standard-sdk-v1.mjs';
import * as kernel from '../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs';

const pinnedSources = {
  kernel: new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url),
  sdk: new URL('../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url),
  approval: new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url),
  engineering: new URL('../../../examples/v08-domain-apps/business-engineering.mjs', import.meta.url),
};
const ISSUER = 'issuer:genesis-test';
const SECRET = 'F01-local-external-issuer-proof-only-not-deployment-secret';

type AppKind = 'approval' | 'engineering';

async function unsignedApp(kind: AppKind) {
  const [kBytes, sBytes, bBytes] = await Promise.all([
    readFile(pinnedSources.kernel, 'utf8'),
    readFile(pinnedSources.sdk, 'utf8'),
    readFile(pinnedSources[kind], 'utf8'),
  ]);
  const business = kind === 'approval' ? approval : engineering;
  const appId = kind === 'approval' ? 'order-approval' : 'domainharness-engineering';
  const submission = {
    rootPackageId: `app:v08:${appId}`,
    packages: [
      {
        packageId: kernel.MODULE_ID, kind: 'kernel', abiVersion: kernel.ABI_VERSION,
        modulePath: 'modules/kernel.mjs', moduleSource: kBytes,
        endpoints: kernel.ENDPOINTS,
      },
      {
        packageId: sdk.MODULE_ID, kind: 'standard-sdk', abiVersion: sdk.ABI_VERSION,
        modulePath: 'modules/standard.mjs', moduleSource: sBytes,
        endpoints: sdk.ENDPOINTS,
      },
      {
        packageId: business.MODULE_ID, kind: 'business', abiVersion: business.ABI_VERSION,
        modulePath: 'modules/business.mjs', moduleSource: bBytes,
        endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES,
      },
    ],
    bindings: [
      { role: 'kernel', packageId: kernel.MODULE_ID, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk', packageId: sdk.MODULE_ID, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business', packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0].endpointId },
      ...business.INTENT_TYPES.map((intentType: string) => ({
        role: 'intent', intentType,
        packageId: business.MODULE_ID, endpointId: business.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const sources = new Map(submission.packages.map((item) => [item.modulePath, item.moduleSource]));
  return { kind, submission, unsigned, sources };
}

function attachExternallyApprovedRoot(app: Awaited<ReturnType<typeof unsignedApp>>) {
  // The issuer is a separate explicit act in this TEST, never a BUILD
  // self-authorizing step; producer only ATTACHES AND VERIFIES its proof.
  const approvalProof = issueApprovalProof({
    subjectDigest: app.unsigned.subjectDigest,
    issuerId: ISSUER, issuerSecret: SECRET,
    issuedAt: '2026-10-12T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned: app.unsigned,
    approval: approvalProof,
    trustedIssuers: new Map([[ISSUER, SECRET]]),
    moduleSources: app.sources,
    baseCommit: 'v0.8-integration-test',
  });
}

test('V08-TF-F01-BUILD-P: two independently qualified Domain Apps share exact selected Kernel/SDK bytes', async () => {
  const a = attachExternallyApprovedRoot(await unsignedApp('approval'));
  const e = attachExternallyApprovedRoot(await unsignedApp('engineering'));
  assert.equal(a.formatVersion, 'dhpkg/v8-qualified-root/1');
  assert.equal(e.formatVersion, 'dhpkg/v8-qualified-root/1');
  const byKind = (root: typeof a, kind: string) => root.packages.find((p) => p.kind === kind)!;
  for (const kind of ['kernel', 'standard-sdk']) {
    assert.equal(byKind(a, kind).moduleSha256, byKind(e, kind).moduleSha256);
    assert.equal(byKind(a, kind).moduleSource, byKind(e, kind).moduleSource);
    assert.equal(byKind(a, kind).packageId, byKind(e, kind).packageId);
  }
  assert.notEqual(byKind(a, 'business').moduleSha256, byKind(e, 'business').moduleSha256);
  assert.notEqual(a.approval.subjectDigest, e.approval.subjectDigest);
  assert.notEqual(a.build.closureDigest, e.build.closureDigest);
  assert.notEqual(a.rootPackageId, e.rootPackageId);
  assert.equal(Object.isFrozen(a), true);
  assert.equal(Object.isFrozen(e), true);
});

test('V08-TF-F01-BUILD-N: wrong Kernel binding cannot be qualified', async () => {
  const app = await unsignedApp('engineering');
  const invalid = structuredClone(app.submission);
  const k = invalid.bindings.find((b: any) => b.role === 'kernel')!;
  k.packageId = engineering.MODULE_ID;
  assert.throws(() => qualifyPackageClosure(invalid), (error: any) => error.code === 'QUALIFY_ROLE_BINDING_INVALID');
});

test('V08-TF-F01-BUILD-N: byte-swapped Kernel or Business after signed approval cannot seal', async () => {
  const app = await unsignedApp('engineering');
  const proof = issueApprovalProof({ subjectDigest: app.unsigned.subjectDigest, issuerId: ISSUER, issuerSecret: SECRET });
  const changedKernel = new Map(app.sources);
  changedKernel.set('modules/kernel.mjs', changedKernel.get('modules/kernel.mjs')! + '\n// injected substitute');
  const changedBusiness = new Map(app.sources);
  changedBusiness.set('modules/business.mjs', changedBusiness.get('modules/business.mjs')! + '\n// imported wrong business policy');
  for (const sources of [changedKernel, changedBusiness]) {
    assert.throws(() => buildQualifiedPackage({
      unsigned: app.unsigned, approval: proof,
      trustedIssuers: new Map([[ISSUER, SECRET]]), moduleSources: sources,
    }), (error: unknown) => error instanceof BuildError && error.code === 'BUILD_SUBJECT_DRIFT');
  }
});

test('V08-TF-F01-D2-P: Approval is an actual distinct Business policy with dynamic effect provenance', () => {
  assert.equal(approval.PACKAGE_KIND, 'business');
  assert.equal(approval.ABI_VERSION, 'v08-business-abi/1');
  const policy = approval.getPolicy();
  assert.equal(policy.workflowDefinition.workflowKey, 'order-quote');
  assert.equal(policy.initialStateKey, 'review');
  assert.deepEqual(policy.intentBindings.submitQuoteDecisionDynamic.roles, ['requester']);
  const selected = policy.intentBindings.submitQuoteDecisionDynamic.definition.states[0].transitions[0].effectIntents[0];
  assert.deepEqual(Object.keys(selected.inputFrom).sort(), ['amount', 'requestId']);
  assert.deepEqual(selected.idempotencyKeyFrom, { template: 'reserve:quote:{requestId}' });
  assert.equal(policy.effectBindings['effect:reserve'].semantics, 'non-idempotent');
  const resolved = sdk.interpret(policy.rules['rule:quote-decision-request'], { amount: 30, requestId: 'APX-R1' });
  assert.equal(resolved.structuredDecision.event.type, 'QUOTE_DECIDED');
});

test('V08-TF-F01-D3-P: Engineering defines non-toy three-transition approval/validation/release lifecycle', () => {
  assert.equal(engineering.PACKAGE_KIND, 'business');
  assert.equal(engineering.ABI_VERSION, 'v08-business-abi/1');
  assert.deepEqual(engineering.INTENT_TYPES, ['reviewChange', 'recordValidation', 'qualifyRelease']);
  const policy = engineering.getPolicy();
  assert.equal(policy.domainId, 'domainharness-engineering');
  assert.equal(policy.initialStateKey, 'change-proposed');
  assert.deepEqual(policy.workflowDefinition.states.map((s: any) => s.stateKey),
    ['change-proposed', 'reviewed', 'validation-passed', 'release-qualified']);
  assert.deepEqual(policy.intentBindings.reviewChange.roles, ['reviewer']);
  assert.deepEqual(policy.intentBindings.recordValidation.roles, ['validator']);
  assert.deepEqual(policy.intentBindings.qualifyRelease.roles, ['release-manager']);
  assert.equal(policy.effectBindings['effect:record-engineering-evidence'].semantics, 'idempotent');
  for (const state of policy.workflowDefinition.states.slice(0, 3)) {
    const transition = state.transitions[0];
    assert.equal(transition.effectIntents.length, 1);
    assert.equal(transition.effectIntents[0].effectType, 'effect:record-engineering-evidence');
  }
  assert.equal(policy.governanceSemantics.hardInvariants[0].invariantId, 'inv:no-revoked-evidence');
  const resolved = sdk.interpret(policy.rules['rule:qualify-release'], {
    changeId: 'DH-42', validationId: 'VAL-42', testedSha: 'sha256:head',
    qualifiedSha: 'sha256:head', releaseApproved: true, revoked: false,
  });
  assert.equal(resolved.structuredDecision.event.type, 'RELEASE_QUALIFIED');
  assert.deepEqual(resolved.modelCallEvidence, { status: 'unsupported' });
});

test('V08-TF-F01-D3-N: engineering role and exact SHA guards cannot be dropped from the policy', () => {
  const policy = engineering.getPolicy();
  const release = policy.workflowDefinition.states[2].transitions[0];
  const guard = policy.workflowDefinition.guards.find((g: any) => g.guardId === release.guardId);
  assert.equal(guard.predicate.op, 'all');
  // [#1005 D3 lineage] The release guard binds the attestation to the
  // durably COMMITTED lineage (context operands), not to the submitted
  // envelope itself: qualifiedSha must equal the committed testedSha.
  const exactSha = guard.predicate.predicates.find((p: any) =>
    p.op === 'eq' && p.left?.path?.[1] === 'qualifiedSha' && p.right?.source === 'context' && p.right?.path?.[0] === 'testedSha');
  assert.ok(exactSha, 'release requires the qualified SHA to equal the COMMITTED testedSha lineage');
  const sameValidation = guard.predicate.predicates.find((p: any) =>
    p.op === 'eq' && p.left?.path?.[1] === 'validationId' && p.right?.source === 'context' && p.right?.path?.[0] === 'validationId');
  assert.ok(sameValidation, 'release requires the very validationId K committed at the validation stage');
  const validation = policy.workflowDefinition.states[1].transitions[0];
  const validationGuard = policy.workflowDefinition.guards.find((g: any) => g.guardId === validation.guardId);
  const testedIsReviewed = validationGuard.predicate.predicates.find((p: any) =>
    p.op === 'eq' && p.left?.path?.[1] === 'testedSha' && p.right?.source === 'context' && p.right?.path?.[0] === 'reviewedSha');
  assert.ok(testedIsReviewed, 'validation must test the exact SHA the review committed');
  // Stage-declared contextProjection lineage (Kernel #1034 contract).
  assert.deepEqual(policy.workflowDefinition.states[0].transitions[0].contextProjection, {
    changeId: { source: 'event', path: ['payload', 'changeId'], type: 'string' },
    reviewedSha: { source: 'event', path: ['payload', 'reviewedSha'], type: 'string' },
  });
  assert.deepEqual(policy.workflowDefinition.states[1].transitions[0].contextProjection, {
    changeId: { source: 'event', path: ['payload', 'changeId'], type: 'string' },
    validationId: { source: 'event', path: ['payload', 'validationId'], type: 'string' },
    testedSha: { source: 'event', path: ['payload', 'testedSha'], type: 'string' },
  });
  assert.deepEqual(policy.workflowDefinition.states[2].transitions[0].contextProjection, {
    qualifiedSha: { source: 'event', path: ['payload', 'qualifiedSha'], type: 'string' },
  });
  assert.equal(policy.intentBindings.qualifyRelease.roles.includes('requester'), false);
  assert.equal(policy.intentBindings.qualifyRelease.roles.includes('release-manager'), true);
});
