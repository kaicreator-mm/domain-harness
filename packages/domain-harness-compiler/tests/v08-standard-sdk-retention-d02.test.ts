/**
 * V08 T-D source-first retained-function *bounded semantic* probes.
 * Historic sources pinned at version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521:
 * FR05 projection blob 52b3127d..., FR08 resolver blob 25e8a621...,
 * HF23 agent projection blob 70932bed...
 * NF05/NF06 legacy v0.6 source references remain assigned but actual
 * full owner-path + Host durable append requires T-F/T-G runtime proof.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  StandardSdkError,
  projectRetainedRead,
  resolveRetainedDecision,
  projectRetainedAgentTools,
  makeRetainedDecisionReceipt,
  selectRetainedPromotedChild,
  coalesceRetainedObservations,
  checkRetainedEvidenceApplicability,
} from '../src/qualified-package/payload/standard-sdk-v1.mjs';

function refuses(code: string, fn: () => unknown) {
  assert.throws(fn, (error: unknown) => error instanceof StandardSdkError && error.code === code);
}

test('V08-FR05-P projection of two exact pinned revision sources yields a nonauthoritative candidate', () => {
  const result = projectRetainedRead({
    projectionId: 'part:card',
    dependencies: [{ name: 'stock', expectedRevision: 'v5' }, { name: 'quote', expectedRevision: 'v7' }],
    fields: { inventory: 'stock', offer: 'quote' },
  }, {
    stock: { revision: 'v5', value: { qty: 6 } },
    quote: { revision: 'v7', value: { price: 42 } },
  });
  assert.equal(result.kind, 'projection');
  assert.deepEqual({ ...result.candidate.inventory }, { qty: 6 });
  assert.deepEqual({ ...result.candidate.offer }, { price: 42 });
  assert.deepEqual({ ...result.sourceRevisions }, { stock: 'v5', quote: 'v7' });
  assert.deepEqual(result.revisionEvidence, { status: 'unmeasured' });
  assert.equal(Object.hasOwn(result, 'authorize'), false);
});

test('V08-FR05-N projection refuses stale, missing, duplicated, and injected sources before exposure', () => {
  const spec = { projectionId: 'part:card', dependencies: [{ name: 'stock', expectedRevision: 'v5' }], fields: { inventory: 'stock' } };
  refuses('SDK_PROJECTION_STALE', () => projectRetainedRead(spec, { stock: { revision: 'v4', value: { qty: 3 } } }));
  refuses('SDK_PROJECTION_MISSING', () => projectRetainedRead(spec, {}));
  refuses('SDK_PROJECTION_INVALID', () => projectRetainedRead({ ...spec, fields: { leak: 'private' } }, { stock: { revision: 'v5', value: null } }));
  refuses('SDK_PROJECTION_INVALID', () => projectRetainedRead({ ...spec, dependencies: [...spec.dependencies, ...spec.dependencies] }, { stock: { revision: 'v5', value: 3 } }));
  let reads = 0;
  const injected: Record<string, unknown> = {};
  Object.defineProperty(injected, 'stock', { enumerable: true, get() { reads++; return { revision: 'v5', value: 'secret' }; } });
  refuses('SDK_DATA_UNSAFE', () => projectRetainedRead(spec, injected));
  assert.equal(reads, 0);
});

test('V08-FR08-P source order Rule > exact cache > promoted > harness is immutable', () => {
  const result = resolveRetainedDecision({
    decisionId: 'dec:quote',
    observations: {
      rule: { status: 'match', candidate: { outcome: 'approve' } },
      'exact-cache': { status: 'match', exactCurrent: true, candidate: { outcome: 'stale-other' } },
      'promoted-subworkflow': { status: 'match', artifactCurrent: true, candidate: { outcome: 'promoted' } },
      'harness-machine': { status: 'match', candidate: { outcome: 'harness' } },
    },
  });
  assert.equal(result.selectedSource, 'rule');
  assert.deepEqual({ ...result.candidate }, { outcome: 'approve' });
  assert.equal(result.provenance.authority, 'proposal-only');
  assert.deepEqual(result.modelCallEvidence, { status: 'unsupported' });
  const hit = resolveRetainedDecision({ decisionId: 'dec:quote', observations: { rule: { status: 'miss' }, 'exact-cache': { status: 'match', exactCurrent: true, candidate: 4 } } });
  assert.equal(hit.selectedSource, 'exact-cache');
});

test('V08-FR08-N cache currentness and promoted revocation deny reject, never blind retry', () => {
  refuses('SDK_DECISION_SOURCE_REFUSED', () => resolveRetainedDecision({
    decisionId: 'dec:quote', observations: { rule: { status: 'miss' }, 'exact-cache': { status: 'match', exactCurrent: false, candidate: { outcome: 'deny' } }, 'harness-machine': { status: 'match', candidate: 'unsafe-fallback' } },
  }));
  refuses('SDK_DECISION_SOURCE_REFUSED', () => resolveRetainedDecision({
    decisionId: 'dec:quote', observations: { 'promoted-subworkflow': { status: 'revoked-deny' }, 'harness-machine': { status: 'match', candidate: 'unsafe-fallback' } },
  }));
  const promoted = resolveRetainedDecision({
    decisionId: 'dec:quote', observations: { 'exact-cache': { status: 'miss' }, 'promoted-subworkflow': { status: 'match', artifactCurrent: true, candidate: { action: 'review' } } },
  });
  assert.equal(promoted.selectedSource, 'promoted-subworkflow');
  refuses('SDK_DECISION_HARNESS_UNCONFIGURED', () => resolveRetainedDecision({ decisionId: 'dec:quote', observations: { rule: { status: 'miss' } } }));
});

test('V08-HF23-P and V08-HF23-N agent query operation surface is bounded and nonauthoritative', () => {
  const result = projectRetainedAgentTools([
    { operationId: 'read:stock', agentExposed: true, effectClass: 'none' },
    { operationId: 'internal:export', agentExposed: false, effectClass: 'effect' },
  ]);
  assert.deepEqual(result.tools, [{ operationId: 'read:stock', effectClass: 'none', authority: 'projection-only' }]);
  refuses('SDK_AGENT_MUTATION_REFUSED', () => projectRetainedAgentTools([{ operationId: 'remove:stock', agentExposed: true, effectClass: 'effect' }]));
  refuses('SDK_TOOL_SURFACE_INVALID', () => projectRetainedAgentTools(Array.from({ length: 65 }, (_, i) => ({ operationId: `read:${i}`, agentExposed: false, effectClass: 'none' }))));
  refuses('SDK_TOOL_SURFACE_INVALID', () => projectRetainedAgentTools([{ operationId: 'read:stock' }, { operationId: 'read:stock' }]));
});

test('V08-NF05-P/NF06-P bounded decision receipt proposal never performs durable append', () => {
  const result = makeRetainedDecisionReceipt({ decisionId: 'dec:quote', turnId: 'turn:1', source: 'rule', decision: { outcome: 'approve' } });
  assert.equal(result.eventType, 'DECISION_RECEIPT');
  assert.equal(result.durableAppend, 'required-by-kernel');
  assert.equal(result.authority, 'proposal-only');
  assert.equal(Object.hasOwn(result, 'journal'), false);
  refuses('SDK_DECISION_RECEIPT_INVALID', () => makeRetainedDecisionReceipt({ decisionId: 'dec:quote', turnId: 'turn:1', source: 'rule' }));
});

test('V08-FR09-P/N selected promoted child is exact, approved and durably pinned before K can run it', () => {
  const exact = { artifactId: 'child:review', contentDigest: 'sha256:123' };
  const approved = { ...exact, revoked: false, applicable: true, compatible: true };
  const result = selectRetainedPromotedChild({ requested: exact, approved, pinCommitted: true });
  assert.equal(result.authority, 'proposal-only');
  assert.equal(result.operation, 'run-in-authoritative-kernel-only');
  refuses('SDK_CHILD_IDENTITY_MISMATCH', () => selectRetainedPromotedChild({ requested: exact, approved: { ...approved, contentDigest: 'sha256:different' }, pinCommitted: true }));
  refuses('SDK_CHILD_NOT_ELIGIBLE', () => selectRetainedPromotedChild({ requested: exact, approved: { ...approved, revoked: true }, pinCommitted: true }));
  refuses('SDK_CHILD_PIN_REQUIRED', () => selectRetainedPromotedChild({ requested: exact, approved, pinCommitted: false }));
});

test('V08-HF17-P/N coalesces monotonic observation revisions, refuses inconsistent duplicates', () => {
  const result = coalesceRetainedObservations([
    { subscriptionId: 'sub:1', epoch: 1, revision: 'rev:1' },
    { subscriptionId: 'sub:2', epoch: 1, revision: 'rev:2' },
    { subscriptionId: 'sub:1', epoch: 2, revision: 'rev:3' },
  ]);
  assert.deepEqual(result.observations, [
    { subscriptionId: 'sub:1', epoch: 2, revision: 'rev:3' },
    { subscriptionId: 'sub:2', epoch: 1, revision: 'rev:2' },
  ]);
  assert.equal(result.authority, 'projection-only');
  refuses('SDK_SUBSCRIPTION_STALE', () => coalesceRetainedObservations([{ subscriptionId: 'sub:1', epoch: 2, revision: 'rev:3' }, { subscriptionId: 'sub:1', epoch: 1, revision: 'rev:1' }]));
  refuses('SDK_SUBSCRIPTION_AMBIGUOUS', () => coalesceRetainedObservations([{ subscriptionId: 'sub:1', epoch: 2, revision: 'rev:3' }, { subscriptionId: 'sub:1', epoch: 2, revision: 'rev:4' }]));
});

test('V08-FR12-P/N governed evaluation evidence is scope pinned and not runtime authority', () => {
  const expected = { packageId: 'business:parts', baselineDigest: 'sha256:approved', durableAuditRequired: true };
  const result = checkRetainedEvidenceApplicability({ packageId: 'business:parts', baselineDigest: 'sha256:approved', durableAudit: true }, expected);
  assert.equal(result.eligibleForHostVerification, true);
  assert.equal(result.authority, 'proposal-only');
  refuses('SDK_EVIDENCE_SCOPE_MISMATCH', () => checkRetainedEvidenceApplicability({ packageId: 'business:other', baselineDigest: 'sha256:approved', durableAudit: true }, expected));
  refuses('SDK_EVIDENCE_DURABILITY_REQUIRED', () => checkRetainedEvidenceApplicability({ packageId: 'business:parts', baselineDigest: 'sha256:approved', durableAudit: false }, expected));
});
