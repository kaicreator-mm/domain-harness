// T-025 example 3 — Candidate validation, promotion, and activation.
//
// The frozen authority ladder, walked with the real contracts:
//   proposal != validation != evaluation != promotion != activation
//
//   1. `validateCandidate` runs deterministic, baseline-bound validation of a
//      Rule Candidate envelope — it grants NO execution permission;
//   2. `PromotionActivationAuthority.promote` requires an explicit
//      human/operator authority action and re-binds the exact validated
//      digest — a Candidate can never promote itself;
//   3. promotion does not activate: fresh selection needs a separate explicit
//      `activate` action, and every authority action is audited append-once;
//   4. registry aliases resolve-once for FRESH selection under an exact
//      expected authority; revocation denies fresh selection while retained
//      exact recovery keeps working.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANDIDATE_BODY_SCHEMA_VERSION,
  CANDIDATE_ENVELOPE_SCHEMA_VERSION,
  MemoryAuthorityAuditStore,
  MemoryPromotedArtifactStore,
  PromotedArtifactContractError,
  PromotedArtifactRegistry,
  PromotionActivationAuthority,
  PromotionActivationAuthorityError,
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  validateCandidate,
  type CandidateBodySchemaArtifact,
  type CandidateContractAuthorityPort,
  type CandidateEnvelope,
  type CandidateValidationAuthority,
  type FreshSelectionActivationGrant,
  type FreshSelectionActivationPort,
  type GovernanceBaselineAuthorityBinding,
  type GovernanceBaselineIdentity,
  type JsonValue,
  type PromotedArtifactIdentity,
} from '@kaicreator/domain-harness';
import { exampleSha256 } from './support.js';

const DOMAIN_ID = 'orders';

/* ------------------------- deterministic validation ----------------------- */

const baselineIdentity: GovernanceBaselineIdentity = {
  domainId: DOMAIN_ID,
  governanceId: 'orders-governance',
  schemaVersion: '1',
  version: 'B1',
  contentDigest: 'governance-content-b1',
};

const orderInput = { kind: 'input-contract', artifactId: 'order-input', contentDigest: 'in-1' } as const;
const decisionOutput = { kind: 'output-contract', artifactId: 'decision-output', contentDigest: 'out-1' } as const;

async function ruleBodySchema(): Promise<CandidateBodySchemaArtifact> {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['operation'],
    properties: { operation: { type: 'string', minLength: 1 } },
  } as const;
  const material = { schemaVersion: CANDIDATE_BODY_SCHEMA_VERSION, candidateKind: 'rule' as const, schema };
  return {
    ...material,
    identity: {
      kind: 'candidate-body-schema',
      artifactId: 'rule-body-v1',
      contentDigest: await computeCanonicalJsonDigest(material, exampleSha256),
    },
  };
}

function ruleCandidateEnvelope(bodySchema: CandidateBodySchemaArtifact): CandidateEnvelope {
  return {
    schemaVersion: CANDIDATE_ENVELOPE_SCHEMA_VERSION,
    candidateKind: 'rule',
    candidateId: 'candidate:orders-cap-rule',
    bodyContract: bodySchema.identity,
    body: { operation: 'deny-quote-over-cap' },
    io: { inputs: [orderInput], outputs: [decisionOutput] },
    capabilities: [],
    tools: [],
    events: [],
    mutation: { kind: 'none' },
    references: [],
    applicability: [],
    hardInvariants: [],
  };
}

function validationAuthority(bodySchema: CandidateBodySchemaArtifact): CandidateValidationAuthority {
  return {
    governanceBaseline: baselineIdentity,
    bodyContracts: { rule: bodySchema.identity },
    allowedInputs: [orderInput],
    allowedOutputs: [decisionOutput],
    allowedCapabilities: [],
    allowedTools: [],
    allowedEvents: [],
    allowedMutationEffects: [],
    availableReferences: [],
    allowedApplicability: [],
    hardInvariants: [],
    maxControlNodes: 8,
    maxControlEdges: 12,
    maxControlSteps: 8,
  };
}

function contractAuthority(bodySchema: CandidateBodySchemaArtifact): CandidateContractAuthorityPort {
  return {
    async resolveExactBodySchema(reference) {
      const match = canonicalJsonStringify(reference) === canonicalJsonStringify(bodySchema.identity);
      return match ? bodySchema : undefined;
    },
  };
}

/**
 * The exact semantic material the validator digests (sorted canonical view of
 * the envelope). The example asserts this reconstruction matches the real
 * validator output, so promotion re-binds exactly what validation approved.
 * The canonical round-trip widens the typed references to plain JsonValue.
 */
function candidateSemanticMaterial(candidate: CandidateEnvelope): JsonValue {
  const material = {
    schemaVersion: candidate.schemaVersion,
    candidateKind: candidate.candidateKind,
    bodyContract: candidate.bodyContract,
    body: candidate.body,
    io: { inputs: [...candidate.io.inputs], outputs: [...candidate.io.outputs] },
    capabilities: [...candidate.capabilities].sort(),
    tools: [...candidate.tools],
    events: [...candidate.events].sort(),
    mutation: candidate.mutation,
    references: [...candidate.references],
    applicability: [...candidate.applicability],
    hardInvariants: [...candidate.hardInvariants],
    control: candidate.control === undefined ? null : candidate.control,
  };
  return JSON.parse(canonicalJsonStringify(material)) as JsonValue;
}

/* ------------------------- operator authority seam ------------------------ */

class RecordingActivationPort implements FreshSelectionActivationPort {
  currentGovernanceBaseline: GovernanceBaselineIdentity = { ...baselineIdentity };
  freshSelection: FreshSelectionActivationGrant | undefined;

  async readCurrentGovernanceBaseline(domainId: string): Promise<GovernanceBaselineIdentity> {
    assert.equal(domainId, DOMAIN_ID);
    return structuredClone(this.currentGovernanceBaseline);
  }

  async publishFreshSelection(grant: FreshSelectionActivationGrant): Promise<void> {
    this.freshSelection = structuredClone(grant);
    this.currentGovernanceBaseline = structuredClone(grant.authorityBinding.governanceBaseline);
  }
}

function authorityBinding(): GovernanceBaselineAuthorityBinding {
  return {
    domainId: DOMAIN_ID,
    packageId: 'pkg-orders-b1',
    domainIntelligenceContentDigest: 'cdi-orders-b1',
    governanceBaseline: { ...baselineIdentity },
  };
}

function operatorAction<Action extends 'promote' | 'activate'>(
  action: Action,
  actionId: string,
): { readonly action: Action; readonly actionId: string; readonly actor: { readonly kind: 'human-operator'; readonly actorId: string; readonly operatorId: string }; readonly recordedAt: string } {
  return {
    action,
    actionId,
    actor: { kind: 'human-operator', actorId: 'user:42', operatorId: 'operator:release-manager' },
    recordedAt: '2026-09-22T00:00:00.000Z',
  };
}

function operatorEvaluation() {
  return {
    evaluationId: 'evaluation:orders-cap-rule:1',
    evaluatedUnder: {
      domainId: baselineIdentity.domainId,
      governanceId: baselineIdentity.governanceId,
      schemaVersion: baselineIdentity.schemaVersion,
      contentDigest: baselineIdentity.contentDigest,
    },
    verdict: 'allow' as const,
    hardInvariantsSatisfied: true,
  };
}

async function authorityStack() {
  const bodySchema = await ruleBodySchema();
  const candidate = ruleCandidateEnvelope(bodySchema);
  const validation = await validateCandidate(
    candidate,
    validationAuthority(bodySchema),
    contractAuthority(bodySchema),
    exampleSha256,
  );
  const registry = new PromotedArtifactRegistry(new MemoryPromotedArtifactStore(), exampleSha256);
  const auditStore = new MemoryAuthorityAuditStore();
  const activationPort = new RecordingActivationPort();
  const service = new PromotionActivationAuthority(registry, auditStore, activationPort, exampleSha256);
  return { activationPort, auditStore, candidate, registry, service, validation };
}

/* --------------------------------- tests ---------------------------------- */

test('example: deterministic validation is baseline-bound and grants no execution permission', async () => {
  const { validation, candidate } = await authorityStack();
  if (!validation.ok) assert.fail(`expected a valid Candidate, got ${JSON.stringify(validation.rejections)}`);
  assert.equal(validation.identity.candidateKind, 'rule');
  assert.equal(validation.identity.validatorContractVersion, 'candidate-validator-v1');
  assert.equal(validation.identity.governanceBaseline.contentDigest, baselineIdentity.contentDigest);
  assert.equal(validation.grantsExecutionPermission, false, 'validation never grants execution');

  // The digest the validator produced is exactly what promotion will re-bind.
  const material = candidateSemanticMaterial(candidate);
  assert.equal(
    await computeCanonicalJsonDigest(material, exampleSha256),
    validation.identity.candidateContentDigest,
  );
});

test('example: an undeclared capability fails validation closed', async () => {
  const bodySchema = await ruleBodySchema();
  const tampered: CandidateEnvelope = {
    ...ruleCandidateEnvelope(bodySchema),
    capabilities: ['filesystem-write'],
  };
  const rejected = await validateCandidate(
    tampered,
    validationAuthority(bodySchema),
    contractAuthority(bodySchema),
    exampleSha256,
  );
  assert.equal(rejected.ok, false);
  if (rejected.ok) assert.fail('expected rejection');
  assert.ok(rejected.rejections.some((failure) => failure.code === 'CAPABILITY_NOT_ALLOWED'));
  assert.equal(rejected.grantsExecutionPermission, false);
});

test('example: promotion requires explicit human/operator authority and never activates', async () => {
  const stack = await authorityStack();
  if (!stack.validation.ok) assert.fail('expected valid Candidate');
  const material = candidateSemanticMaterial(stack.candidate);

  // A Candidate-originated "promotion" is not an authority transition.
  const forged = {
    action: { ...operatorAction('promote', 'promote:orders-cap-rule:1'), actor: { kind: 'candidate', actorId: 'candidate:orders-cap-rule', operatorId: 'none' } },
    artifactId: 'orders-cap-rule',
    version: '1.0.0',
    validation: stack.validation,
    authorityBinding: authorityBinding(),
    semanticMaterial: material,
    evaluation: operatorEvaluation(),
  } as const;
  await assert.rejects(
    // The forged actor shape is deliberately outside the contract.
    () => stack.service.promote(forged as unknown as Parameters<typeof stack.service.promote>[0]),
    (error: unknown) =>
      error instanceof PromotionActivationAuthorityError
      && error.code === 'HUMAN_OPERATOR_AUTHORITY_REQUIRED',
  );

  const promoted = await stack.service.promote({
    action: operatorAction('promote', 'promote:orders-cap-rule:1'),
    artifactId: 'orders-cap-rule',
    version: '1.0.0',
    validation: stack.validation,
    authorityBinding: authorityBinding(),
    semanticMaterial: material,
    evaluation: operatorEvaluation(),
  });
  assert.equal(promoted.promoted.body.identity.artifactId, 'orders-cap-rule');
  assert.equal(promoted.audit.action, 'promote');
  assert.equal(
    stack.activationPort.freshSelection,
    undefined,
    'promotion does not imply activation',
  );
});

test('example: activation is a second explicit authority action; audit is append-once', async () => {
  const stack = await authorityStack();
  if (!stack.validation.ok) assert.fail('expected valid Candidate');
  const promoted = await stack.service.promote({
    action: operatorAction('promote', 'promote:orders-cap-rule:1'),
    artifactId: 'orders-cap-rule',
    version: '1.0.0',
    validation: stack.validation,
    authorityBinding: authorityBinding(),
    semanticMaterial: candidateSemanticMaterial(stack.candidate),
    evaluation: operatorEvaluation(),
  });

  const activated = await stack.service.activate({
    action: operatorAction('activate', 'activate:orders-cap-rule:1'),
    artifactId: 'orders-cap-rule',
    version: '1.0.0',
    expectedArtifact: promoted.promoted.body.identity,
    authorityBinding: authorityBinding(),
    evaluation: operatorEvaluation(),
  });
  assert.equal(activated.audit.action, 'activate');
  assert.ok(stack.activationPort.freshSelection !== undefined, 'fresh selection grant published');

  // Replaying either authority actionId conflicts instead of rewriting history.
  await assert.rejects(
    () => stack.auditStore.put(promoted.audit),
    (error: unknown) =>
      error instanceof PromotionActivationAuthorityError && error.code === 'AUDIT_IDENTITY_CONFLICT',
  );
});

test('example: alias selection resolves once under exact authority; revocation denies fresh selection only', async () => {
  const stack = await authorityStack();
  if (!stack.validation.ok) assert.fail('expected valid Candidate');
  const promoted = await stack.service.promote({
    action: operatorAction('promote', 'promote:orders-cap-rule:1'),
    artifactId: 'orders-cap-rule',
    version: '1.0.0',
    validation: stack.validation,
    authorityBinding: authorityBinding(),
    semanticMaterial: candidateSemanticMaterial(stack.candidate),
    evaluation: operatorEvaluation(),
  });
  const identity: PromotedArtifactIdentity = promoted.promoted.body.identity;

  const alias = await stack.registry.bindAlias({
    artifactId: 'orders-cap-rule',
    alias: 'stable',
    artifact: identity,
    expectedRevision: 0,
  });
  assert.equal(alias.revision, 1);

  const selected = await stack.registry.selectAlias({
    artifactId: 'orders-cap-rule',
    alias: 'stable',
    expectedAuthority: authorityBinding(),
  });
  assert.equal(selected.body.identity.contentDigest, identity.contentDigest);

  // A stale caller snapshot is rejected instead of silently re-resolving.
  await assert.rejects(
    () =>
      stack.registry.selectAlias({
        artifactId: 'orders-cap-rule',
        alias: 'stable',
        expectedRevision: 99,
        expectedAuthority: authorityBinding(),
      }),
    (error: unknown) => error instanceof PromotedArtifactContractError,
  );

  await stack.registry.revoke(identity, {
    recordId: 'revocation:orders-cap-rule:1',
    authorityRef: 'operator:release-manager',
    recordedAt: '2026-09-22T01:00:00.000Z',
    reason: 'superseded by orders-cap-rule 1.1.0',
  });
  await assert.rejects(
    () =>
      stack.registry.selectAlias({
        artifactId: 'orders-cap-rule',
        alias: 'stable',
        expectedAuthority: authorityBinding(),
      }),
    (error: unknown) =>
      error instanceof PromotedArtifactContractError && error.code === 'PROMOTED_ARTIFACT_REVOKED',
  );

  // Recovery of an already-pinned execution still resolves the exact artifact.
  const recovered = await stack.registry.recoverExact(identity, authorityBinding());
  assert.equal(recovered.body.identity.contentDigest, identity.contentDigest);
});
