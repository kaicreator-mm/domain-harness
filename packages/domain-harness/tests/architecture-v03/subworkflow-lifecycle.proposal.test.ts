import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InMemoryPromotedSubworkflowRegistry,
  compilePromotedSubworkflow,
  promoteValidatedCandidate,
  promotedSubworkflowContentDigest,
  sha256Canonical,
  validateWorkflowCandidate,
  type AvailableToolContract,
  type PromotionCommand,
  type WorkflowCandidate,
} from './subworkflow-lifecycle.proposal.js';
import {
  applicableB2bContext,
  compatibleRuntime,
  makeCandidate,
  riskTool,
  validationPolicy,
} from './subworkflow-lifecycle.examples.js';

const validationEvidence = {
  validatedAt: '2026-09-20T09:31:00Z',
  evidenceRefs: ['test:focused-lifecycle'],
};

const promotion: PromotionCommand = {
  version: '1.0.0',
  approvedBy: { authority: 'human-operator', principalId: 'release-owner' },
  evidenceRefs: ['issue:204'],
  promotedAt: '2026-09-20T09:32:00Z',
};

function validated(candidate: WorkflowCandidate = makeCandidate()) {
  return validateWorkflowCandidate(candidate, validationPolicy, validationEvidence);
}

function promoted(candidate: WorkflowCandidate = makeCandidate(), command: PromotionCommand = promotion) {
  return promoteValidatedCandidate(validated(candidate), command);
}

test('content digest consumes #205 semantic material and ignores representation/audit ordering', () => {
  const base = makeCandidate();
  const reordered = makeCandidate({
    semantic: {
      ...base.semantic,
      applicability: [...base.semantic.applicability].reverse(),
      steps: Object.fromEntries(Object.entries(base.semantic.steps).reverse()),
      edges: [...base.semantic.edges].reverse(),
      allowedTools: [...base.semantic.allowedTools].reverse(),
      referencedArtifacts: [...base.semantic.referencedArtifacts].reverse(),
      allowedEvents: [...base.semantic.allowedEvents].reverse(),
    },
    provenance: {
      ...base.provenance,
      proposedAt: '2099-01-01T00:00:00Z',
      evidenceRefs: ['different-audit-ref'],
    },
  });
  assert.equal(promotedSubworkflowContentDigest(base.semantic), promotedSubworkflowContentDigest(reordered.semantic));
});

test('behaviorally relevant workflow change invalidates content digest', () => {
  const base = makeCandidate();
  const changed = makeCandidate({
    semantic: {
      ...base.semantic,
      steps: {
        ...base.semantic.steps,
        decide: { kind: 'rule', fact: 'riskBand', op: 'eq', value: 'medium' },
      },
    },
  });
  assert.notEqual(promotedSubworkflowContentDigest(base.semantic), promotedSubworkflowContentDigest(changed.semantic));
});

test('Candidate -> Validated -> explicit human promotion -> XState child plan', () => {
  const checked = validated();
  assert.equal(checked.kind, 'validated-workflow-candidate-v1');
  assert.equal(checked.contentDigest, promotedSubworkflowContentDigest(checked.semantic));

  assert.throws(
    () => promoteValidatedCandidate(checked, { ...promotion, approvedBy: { authority: 'model' as never, principalId: 'planner' } }),
    /human-operator/,
  );

  const artifact = promoteValidatedCandidate(checked, promotion);
  const plan = compilePromotedSubworkflow(artifact);
  assert.equal(plan.runtime, 'xstate-child');
  assert.equal(plan.initial, 'applicability');
  assert.equal(plan.artifactIdentity.contentDigest, checked.contentDigest);
  assert.equal(plan.reasonedStepAuthority, 'harness-machine-only');
  assert.equal(plan.mutationAuthority, 'domain-harness-durable-effect-only');
  assert.deepEqual(plan.finalEvents, ['QUOTE_REJECTED', 'QUOTE_REQUESTED']);
});

test('compiler fails closed for raw/non-promoted artifact and post-promotion mutation', () => {
  assert.throws(() => compilePromotedSubworkflow(makeCandidate() as never), /promoted artifacts only/);
  const artifact = promoted();
  const changed = {
    ...artifact,
    semantic: {
      ...artifact.semantic,
      allowedEvents: ['QUOTE_REQUESTED'],
    },
  };
  assert.throws(() => compilePromotedSubworkflow(changed), /content changed after promotion/);
});

test('validator rejects unknown tool and digest mismatch', () => {
  const base = makeCandidate();
  const unknownIdentity = { kind: 'tool' as const, artifactId: 'unknown-query', contentDigest: sha256Canonical({ v: 1 }) };
  const candidate = makeCandidate({
    semantic: {
      ...base.semantic,
      steps: {
        ...base.semantic.steps,
        lookup: { kind: 'query', toolArtifactId: 'unknown-query', toolContentDigest: unknownIdentity.contentDigest },
      },
      allowedTools: [unknownIdentity],
    },
  });
  assert.throws(() => validated(candidate), /not allowlisted/);
});

test('validator rejects mutation-capable tools so mutation remains durable-effect authority', () => {
  const mutationTool: AvailableToolContract = {
    identity: { kind: 'tool', artifactId: 'write-order', contentDigest: sha256Canonical({ capability: 'mutation' }) },
    capability: 'mutation',
  };
  const base = makeCandidate();
  const candidate = makeCandidate({
    semantic: {
      ...base.semantic,
      steps: {
        ...base.semantic.steps,
        lookup: {
          kind: 'query',
          toolArtifactId: mutationTool.identity.artifactId,
          toolContentDigest: mutationTool.identity.contentDigest,
        },
      },
      allowedTools: [mutationTool.identity],
    },
  });
  assert.throws(
    () => validateWorkflowCandidate(candidate, { ...validationPolicy, allowedTools: [riskTool, mutationTool] }, validationEvidence),
    /cannot execute inside promoted solving workflow/,
  );
});

test('validator rejects illegal Domain Event and private/arbitrary execution authority fields', () => {
  const base = makeCandidate();
  const illegalEvent = makeCandidate({
    semantic: {
      ...base.semantic,
      steps: { ...base.semantic.steps, quote: { kind: 'emit', eventType: 'ADMIN_OVERRIDE' } },
      allowedEvents: [...base.semantic.allowedEvents, 'ADMIN_OVERRIDE'],
    },
  });
  assert.throws(() => validated(illegalEvent), /not allowed by validator policy/);

  const arbitraryCode = makeCandidate({
    semantic: {
      ...base.semantic,
      steps: { ...base.semantic.steps, lookup: { ...(base.semantic.steps.lookup as object), code: 'eval(userInput)' } as never },
    },
  });
  assert.throws(() => validated(arbitraryCode), /forbidden execution-authority field/);
});

test('validator rejects cycles and therefore cannot execute an unbounded loop', () => {
  const base = makeCandidate();
  const cyclic = makeCandidate({
    semantic: {
      ...base.semantic,
      steps: {
        ...base.semantic.steps,
        quote: { kind: 'query', toolArtifactId: riskTool.identity.artifactId, toolContentDigest: riskTool.identity.contentDigest },
      },
      edges: [
        ...base.semantic.edges.filter((edge) => (edge as { to?: string }).to !== 'quote'),
        { from: 'decide', to: 'quote', when: 'false' },
        { from: 'quote', to: 'decide', when: 'done' },
      ],
    },
  });
  assert.throws(() => validated(cyclic), /cycle is not supported/);
});

test('registry uses explicit exact digest/version/alias selection and never implicit latest', () => {
  const registry = new InMemoryPromotedSubworkflowRegistry();
  const artifact = promoted();
  registry.promote(artifact);
  registry.setAlias({
    domainId: artifact.domainId,
    artifactId: artifact.identity.artifactId,
    alias: 'stable',
    contentDigest: artifact.identity.contentDigest,
    selectedBy: promotion.approvedBy,
    selectedAt: '2026-09-20T09:33:00Z',
    evidenceRefs: ['issue:204'],
  });

  const byDigest = registry.resolve(
    artifact.domainId,
    { kind: 'exact-digest', artifactId: artifact.identity.artifactId, contentDigest: artifact.identity.contentDigest },
    compatibleRuntime,
    applicableB2bContext,
  );
  assert.equal(byDigest.ok, true);

  const byVersion = registry.resolve(
    artifact.domainId,
    { kind: 'exact-version', artifactId: artifact.identity.artifactId, version: '1.0.0' },
    compatibleRuntime,
    applicableB2bContext,
  );
  assert.equal(byVersion.ok, true);

  const byAlias = registry.resolve(
    artifact.domainId,
    { kind: 'selection-alias', artifactId: artifact.identity.artifactId, alias: 'stable' },
    compatibleRuntime,
    applicableB2bContext,
  );
  assert.equal(byAlias.ok, true);

  const missingAlias = registry.resolve(
    artifact.domainId,
    { kind: 'selection-alias', artifactId: artifact.identity.artifactId, alias: 'latest' },
    compatibleRuntime,
    applicableB2bContext,
  );
  assert.deepEqual(missingAlias, { ok: false, reason: 'not-found', details: [] });
});

test('registry rejects version reuse for different content', () => {
  const registry = new InMemoryPromotedSubworkflowRegistry();
  const first = promoted();
  registry.promote(first);
  const base = makeCandidate();
  const secondCandidate = makeCandidate({
    candidateId: 'candidate-risk-quote-v2',
    semantic: {
      ...base.semantic,
      applicability: [{ source: 'input', selector: 'segment', op: 'in', values: ['b2b', 'enterprise'] }],
    },
  });
  const second = promoted(secondCandidate, { ...promotion, promotedAt: '2026-09-20T09:35:00Z' });
  assert.throws(() => registry.promote(second), /version already names different semantic content/);
});

test('applicability and compatibility fail closed before child invocation', () => {
  const registry = new InMemoryPromotedSubworkflowRegistry();
  const artifact = promoted();
  registry.promote(artifact);
  const selection = { kind: 'exact-digest' as const, artifactId: artifact.identity.artifactId, contentDigest: artifact.identity.contentDigest };

  const notApplicable = registry.resolve(
    artifact.domainId,
    selection,
    compatibleRuntime,
    { ...applicableB2bContext, input: { country: 'MM', segment: 'consumer' } },
  );
  assert.equal(notApplicable.ok, false);
  if (!notApplicable.ok) assert.equal(notApplicable.reason, 'not-applicable');

  const missingSelector = registry.resolve(
    artifact.domainId,
    selection,
    compatibleRuntime,
    { ...applicableB2bContext, input: { country: 'MM' } },
  );
  assert.equal(missingSelector.ok, false);
  if (!missingSelector.ok) assert.equal(missingSelector.reason, 'invalid-applicability-context');

  const incompatible = registry.resolve(
    artifact.domainId,
    selection,
    { ...compatibleRuntime, hostCapabilities: [] },
    applicableB2bContext,
  );
  assert.equal(incompatible.ok, false);
  if (!incompatible.ok) assert.deepEqual(incompatible.details, ['capability:query-port']);
});

test('revocation is append-only audit evidence and blocks fresh selection without auto fallback', () => {
  const registry = new InMemoryPromotedSubworkflowRegistry();
  const artifact = promoted();
  registry.promote(artifact);
  registry.revoke({
    domainId: artifact.domainId,
    artifactId: artifact.identity.artifactId,
    contentDigest: artifact.identity.contentDigest,
    version: artifact.identity.version,
    revokedBy: promotion.approvedBy,
    revokedAt: '2026-09-20T09:40:00Z',
    reason: 'behavior superseded',
  });
  const result = registry.resolve(
    artifact.domainId,
    { kind: 'exact-digest', artifactId: artifact.identity.artifactId, contentDigest: artifact.identity.contentDigest },
    compatibleRuntime,
    applicableB2bContext,
  );
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, 'revoked');
  const audit = registry.auditTrail();
  assert.equal(audit.promotions.length, 1);
  assert.equal(audit.revocations.length, 1);
  assert.equal(audit.revocations[0]?.contentDigest, artifact.identity.contentDigest);
});

test('promotion/audit metadata never changes #205 content digest', () => {
  const checked = validated();
  const one = promoteValidatedCandidate(checked, promotion);
  const two = promoteValidatedCandidate(checked, {
    ...promotion,
    version: '1.0.1',
    approvedBy: { authority: 'human-operator', principalId: 'another-owner' },
    promotedAt: '2030-01-01T00:00:00Z',
    evidenceRefs: ['release:other'],
  });
  assert.equal(one.identity.contentDigest, two.identity.contentDigest);
  assert.notEqual(one.identity.version, two.identity.version);
});
