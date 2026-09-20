import assert from 'node:assert/strict';
import test from 'node:test';

import { canonicalJsonStringify, type Sha256Port } from '../../src/contracts/identity.js';
import {
  CANDIDATE_BODY_SCHEMA_VERSION,
  CANDIDATE_ENVELOPE_SCHEMA_VERSION,
  CANDIDATE_VALIDATOR_CONTRACT_VERSION,
  canReuseValidationForGovernanceBaseline,
  validateCandidate,
  type CandidateBodySchemaArtifact,
  type CandidateContractAuthorityPort,
  type CandidateEnvelope,
  type CandidateGovernanceValidationAuthoritySnapshot,
  type CandidateKind,
  type CandidateSpecializedValidator,
  type CandidateValidationAuthority,
  type CandidateValidationGovernanceBaseline,
} from '../../src/candidate/index.js';

const sha256: Sha256Port = {
  async digestUtf8(value) {
    return `test-sha256:${value}`;
  },
};

const baseline: CandidateValidationGovernanceBaseline = {
  domainId: 'orders',
  governanceId: 'orders-governance',
  schemaVersion: '1',
  version: 'B1',
  contentDigest: 'gov-b1',
};

const input = { kind: 'input-contract', artifactId: 'order-input', contentDigest: 'in-1' } as const;
const output = { kind: 'output-contract', artifactId: 'decision-output', contentDigest: 'out-1' } as const;
const tool = {
  kind: 'tool',
  artifactId: 'catalog-query',
  contentDigest: 'tool-1',
  capability: 'query',
} as const;
const reference = { kind: 'rule', artifactId: 'pricing-rule', contentDigest: 'rule-1' } as const;
const applicability = { kind: 'precondition', artifactId: 'domestic-order', contentDigest: 'pre-1' } as const;
const invariant = { kind: 'hard-invariant', artifactId: 'no-negative-total', contentDigest: 'inv-1' } as const;
const effect = { kind: 'effect-contract', artifactId: 'reserve-stock', contentDigest: 'effect-1' } as const;

function bodySchemaArtifact(candidateKind: CandidateKind, artifactId: string): CandidateBodySchemaArtifact {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['operation'],
    properties: {
      operation: { type: 'string', minLength: 1 },
    },
  } as const;
  const semanticMaterial = {
    schemaVersion: CANDIDATE_BODY_SCHEMA_VERSION,
    candidateKind,
    schema,
  };
  return {
    ...semanticMaterial,
    identity: {
      kind: 'candidate-body-schema',
      artifactId,
      contentDigest: `test-sha256:${canonicalJsonStringify(semanticMaterial)}`,
    },
  };
}

const bodySchemas: Record<CandidateKind, CandidateBodySchemaArtifact> = {
  rule: bodySchemaArtifact('rule', 'rule-body-v1'),
  'decision-procedure': bodySchemaArtifact('decision-procedure', 'procedure-body-v1'),
  skill: bodySchemaArtifact('skill', 'skill-body-v1'),
  workflow: bodySchemaArtifact('workflow', 'workflow-body-v1'),
};

const bodyContracts: CandidateValidationAuthority['bodyContracts'] = {
  rule: bodySchemas.rule.identity,
  'decision-procedure': bodySchemas['decision-procedure'].identity,
  skill: bodySchemas.skill.identity,
  workflow: bodySchemas.workflow.identity,
};

const workflowSpecialization: CandidateSpecializedValidator = {
  candidateKind: 'workflow',
  validate(candidate) {
    return candidate.body !== null && typeof candidate.body === 'object'
      ? []
      : [{ code: 'WORKFLOW_BODY', path: '$.body', message: 'workflow body must remain structured' }];
  },
};

function sameBaseline(a: CandidateValidationGovernanceBaseline, b: CandidateValidationGovernanceBaseline): boolean {
  return a.domainId === b.domainId
    && a.governanceId === b.governanceId
    && a.schemaVersion === b.schemaVersion
    && a.contentDigest === b.contentDigest;
}

function exactRefKey(value: { kind: string; artifactId: string; contentDigest: string }): string {
  return `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;
}

function contractAuthority(options: {
  readonly schemas?: readonly CandidateBodySchemaArtifact[];
  readonly governance?: readonly CandidateGovernanceValidationAuthoritySnapshot[];
} = {}): CandidateContractAuthorityPort {
  const schemas = options.schemas ?? Object.values(bodySchemas);
  const governance = options.governance ?? [];
  return {
    async resolveExactBodySchema(referenceToResolve) {
      return schemas.find((item) => exactRefKey(item.identity) === exactRefKey(referenceToResolve));
    },
    async resolveExactGovernanceValidationAuthority(target) {
      return governance.find((item) => sameBaseline(item.governanceBaseline, target));
    },
  };
}

function authority(overrides: Partial<CandidateValidationAuthority> = {}): CandidateValidationAuthority {
  return {
    governanceBaseline: baseline,
    bodyContracts,
    allowedInputs: [input],
    allowedOutputs: [output],
    allowedCapabilities: ['catalog-read'],
    allowedTools: [tool],
    allowedEvents: ['ORDER_APPROVED'],
    allowedMutationEffects: [effect],
    availableReferences: [reference],
    allowedApplicability: [applicability],
    hardInvariants: [invariant],
    maxControlNodes: 8,
    maxControlEdges: 12,
    maxControlSteps: 8,
    specializedValidators: { workflow: workflowSpecialization },
    ...overrides,
  };
}

function workflowCandidate(overrides: Record<string, unknown> = {}): CandidateEnvelope {
  return {
    schemaVersion: CANDIDATE_ENVELOPE_SCHEMA_VERSION,
    candidateKind: 'workflow',
    candidateId: 'candidate-1',
    bodyContract: bodySchemas.workflow.identity,
    body: { operation: 'approve-order' },
    io: { inputs: [input], outputs: [output] },
    capabilities: ['catalog-read'],
    tools: [tool],
    events: ['ORDER_APPROVED'],
    mutation: { kind: 'durable-effect', effects: [effect] },
    references: [reference],
    applicability: [applicability],
    hardInvariants: [invariant],
    control: {
      startNode: 'start',
      nodes: ['start', 'finish'],
      edges: [{ from: 'start', to: 'finish' }],
      maxSteps: 2,
    },
    ...overrides,
  } as CandidateEnvelope;
}

async function validate(
  value: unknown,
  validationAuthority: CandidateValidationAuthority = authority(),
  exactAuthority: CandidateContractAuthorityPort = contractAuthority(),
) {
  return validateCandidate(value, validationAuthority, exactAuthority, sha256);
}

function hasCode(result: Awaited<ReturnType<typeof validateCandidate>>, code: string): boolean {
  return !result.ok && result.rejections.some((item) => item.code === code);
}

test('accepts a fully allowlisted candidate and grants no execution permission', async () => {
  const result = await validate(workflowCandidate());
  assert.equal(result.ok, true);
  assert.equal(result.grantsExecutionPermission, false);
  if (!result.ok) return;
  assert.equal(result.identity.validatorContractVersion, CANDIDATE_VALIDATOR_CONTRACT_VERSION);
  assert.equal(result.identity.governanceBaseline.contentDigest, baseline.contentDigest);
  assert.equal('promoted' in result.identity, false);
  assert.equal('active' in result.identity, false);
});

test('uses one envelope with exact body contracts for Rule, DecisionProcedure, Skill and Workflow Candidates', async () => {
  for (const candidateKind of ['rule', 'decision-procedure', 'skill'] as const) {
    const raw = {
      ...workflowCandidate(),
      candidateKind,
      bodyContract: bodySchemas[candidateKind].identity,
      mutation: { kind: 'none' },
    } as Record<string, unknown>;
    delete raw.control;
    const result = await validate(raw);
    assert.equal(result.ok, true, `${candidateKind} should pass the common validator`);
    assert.equal(result.grantsExecutionPermission, false);
  }
  const workflow = await validate(workflowCandidate());
  assert.equal(workflow.ok, true);
});

test('semantic digest is stable across set-like declaration ordering and candidate ids', async () => {
  const digestAuthority = authority({
    allowedCapabilities: ['catalog-read', 'audit-read'],
    allowedEvents: ['ORDER_APPROVED', 'ORDER_AUDITED'],
  });
  const first = await validate(
    workflowCandidate({
      capabilities: ['catalog-read', 'audit-read'],
      events: ['ORDER_APPROVED', 'ORDER_AUDITED'],
    }),
    digestAuthority,
  );
  const second = await validate(
    workflowCandidate({
      candidateId: 'different-proposal-id',
      capabilities: ['audit-read', 'catalog-read'],
      events: ['ORDER_AUDITED', 'ORDER_APPROVED'],
      body: { operation: 'approve-order' },
    }),
    digestAuthority,
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) assert.equal(first.identity.candidateContentDigest, second.identity.candidateContentDigest);
});

test('fails closed when exact body-schema authority is missing, mismatched or tampered', async () => {
  const missingConfiguredContract = await validate(workflowCandidate(), authority({ bodyContracts: {} }));
  assert.equal(hasCode(missingConfiguredContract, 'BODY_VALIDATOR_REQUIRED'), true);

  const mismatchedCandidate = await validate(
    workflowCandidate({ bodyContract: { ...bodySchemas.workflow.identity, contentDigest: 'untrusted-body-contract' } }),
  );
  assert.equal(hasCode(mismatchedCandidate, 'BODY_CONTRACT_NOT_ALLOWED'), true);

  const missingResolvedSchema = await validate(
    workflowCandidate(),
    authority(),
    contractAuthority({ schemas: [] }),
  );
  assert.equal(hasCode(missingResolvedSchema, 'BODY_VALIDATOR_REQUIRED'), true);

  const trusted = bodySchemas.workflow;
  const tampered = {
    ...trusted,
    schema: {
      type: 'object',
      additionalProperties: true,
    },
  } as unknown as CandidateBodySchemaArtifact;
  const tamperedSchema = await validate(
    workflowCandidate(),
    authority(),
    contractAuthority({ schemas: [tampered, bodySchemas.rule, bodySchemas['decision-procedure'], bodySchemas.skill] }),
  );
  assert.equal(hasCode(tamperedSchema, 'VALIDATION_AUTHORITY_INVALID'), true);
});

test('body schema rejects arbitrary executable material even under non-blacklisted field names', async () => {
  const disguised = await validate(
    workflowCandidate({ body: { operation: 'approve-order', handler: 'return process.exit(0)' } }),
  );
  assert.equal(hasCode(disguised, 'BODY_SCHEMA_INVALID'), true);

  const executable = await validate(
    workflowCandidate({ body: { operation: 'approve-order', handler: () => true } }),
  );
  assert.equal(hasCode(executable, 'ARBITRARY_CODE_FORBIDDEN'), true);
});

test('fails closed on illegal I/O, capability, event, tool, applicability and mutation effect', async () => {
  const illegalTool = { ...tool, contentDigest: 'tool-unknown' };
  const illegalApplicability = { ...applicability, contentDigest: 'pre-unknown' };
  const illegalEffect = { ...effect, contentDigest: 'effect-unknown' };
  const result = await validate(
    workflowCandidate({
      io: {
        inputs: [{ ...input, contentDigest: 'in-unknown' }],
        outputs: [{ ...output, contentDigest: 'out-unknown' }],
      },
      capabilities: ['illegal-capability'],
      events: ['ILLEGAL_EVENT'],
      tools: [illegalTool],
      applicability: [illegalApplicability],
      mutation: { kind: 'durable-effect', effects: [illegalEffect] },
    }),
  );
  assert.equal(hasCode(result, 'INPUT_CONTRACT_NOT_ALLOWED'), true);
  assert.equal(hasCode(result, 'OUTPUT_CONTRACT_NOT_ALLOWED'), true);
  assert.equal(hasCode(result, 'CAPABILITY_NOT_ALLOWED'), true);
  assert.equal(hasCode(result, 'EVENT_NOT_ALLOWED'), true);
  assert.equal(hasCode(result, 'TOOL_NOT_ALLOWED'), true);
  assert.equal(hasCode(result, 'APPLICABILITY_NOT_ALLOWED'), true);
  assert.equal(hasCode(result, 'MUTATION_PATH_INVALID'), true);
  assert.equal(result.grantsExecutionPermission, false);

  const directMutation = { ...workflowCandidate(), mutation: { kind: 'direct' } };
  const directResult = await validate(directMutation);
  assert.equal(hasCode(directResult, 'MUTATION_PATH_INVALID'), true);
});

test('rejects arbitrary code, provider secrets, private reasoning and runtime objects before validation', async () => {
  for (const [body, expected] of [
    [{ code: 'return true' }, 'ARBITRARY_CODE_FORBIDDEN'],
    [{ providerSecret: 'do-not-store' }, 'PROVIDER_SECRET_OR_STATE_FORBIDDEN'],
    [{ actorRef: 'actor-123' }, 'RUNTIME_OBJECT_FORBIDDEN'],
    [{ chainOfThought: 'private' }, 'PRIVATE_REASONING_FORBIDDEN'],
  ] as const) {
    const result = await validate(workflowCandidate({ body }));
    assert.equal(hasCode(result, expected), true);
  }

  const result = await validate(workflowCandidate({ body: new Date() }));
  assert.equal(hasCode(result, 'RUNTIME_OBJECT_FORBIDDEN'), true);
});

test('rejects cyclic, oversized and unreachable control graphs', async () => {
  const cyclic = workflowCandidate({
    control: {
      startNode: 'a',
      nodes: ['a', 'b'],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
      ],
      maxSteps: 2,
    },
  });
  const cycleResult = await validate(cyclic);
  assert.equal(hasCode(cycleResult, 'CONTROL_CYCLE_FORBIDDEN'), true);

  const oversized = workflowCandidate({
    control: {
      startNode: 'n0',
      nodes: ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'],
      edges: [
        { from: 'n0', to: 'n1' },
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
        { from: 'n3', to: 'n4' },
        { from: 'n4', to: 'n5' },
        { from: 'n5', to: 'n6' },
        { from: 'n6', to: 'n7' },
        { from: 'n7', to: 'n8' },
      ],
      maxSteps: 9,
    },
  });
  const oversizedResult = await validate(oversized);
  assert.equal(hasCode(oversizedResult, 'CONTROL_LIMIT_EXCEEDED'), true);

  const unreachable = workflowCandidate({
    control: {
      startNode: 'a',
      nodes: ['a', 'b', 'orphan'],
      edges: [{ from: 'a', to: 'b' }],
      maxSteps: 3,
    },
  });
  const unreachableResult = await validate(unreachable);
  assert.equal(hasCode(unreachableResult, 'CONTROL_INVALID'), true);
});

test('preserves mandatory Workflow specialization and fails closed on specialized rejection/exception', async () => {
  const noSpecialization = await validate(
    workflowCandidate(),
    authority({ specializedValidators: {} }),
  );
  assert.equal(hasCode(noSpecialization, 'SPECIALIZED_VALIDATOR_REQUIRED'), true);

  const rejecting: CandidateSpecializedValidator = {
    candidateKind: 'workflow',
    validate() {
      return [{ code: 'WORKFLOW_DENIED', path: '$.body', message: 'denied by #204 specialization' }];
    },
  };
  const rejected = await validate(
    workflowCandidate(),
    authority({ specializedValidators: { workflow: rejecting } }),
  );
  assert.equal(hasCode(rejected, 'SPECIALIZED_REJECTED'), true);

  const throwing: CandidateSpecializedValidator = {
    candidateKind: 'workflow',
    validate() {
      throw new Error('specialized validator unavailable');
    },
  };
  const exception = await validate(
    workflowCandidate(),
    authority({ specializedValidators: { workflow: throwing } }),
  );
  assert.equal(hasCode(exception, 'SPECIALIZED_REJECTED'), true);
});

test('invalid validation authority fails closed before candidate validation', async () => {
  const invalidBounds = await validate(
    workflowCandidate(),
    authority({ maxControlNodes: 0 }),
  );
  assert.equal(hasCode(invalidBounds, 'VALIDATION_AUTHORITY_INVALID'), true);

  const invalidBaseline = await validate(
    workflowCandidate(),
    authority({ governanceBaseline: { ...baseline, contentDigest: '' } }),
  );
  assert.equal(hasCode(invalidBaseline, 'VALIDATION_AUTHORITY_INVALID'), true);
});

test('rejects unresolved exact references and incompatible Hard Invariants', async () => {
  const result = await validate(
    workflowCandidate({
      references: [{ ...reference, contentDigest: 'wrong' }],
      hardInvariants: [{ ...invariant, contentDigest: 'wrong' }],
    }),
  );
  assert.equal(hasCode(result, 'EXACT_REFERENCE_UNRESOLVED'), true);
  assert.equal(hasCode(result, 'HARD_INVARIANT_INCOMPATIBLE'), true);
});

test('changed Governance Baseline requires exact retained-governance authority resolution', async () => {
  const result = await validate(workflowCandidate());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const b2: CandidateValidationGovernanceBaseline = { ...baseline, version: 'B2', contentDigest: 'gov-b2' };

  assert.equal(
    await canReuseValidationForGovernanceBaseline(result.identity, b2, contractAuthority()),
    false,
  );

  const wrongSnapshot: CandidateGovernanceValidationAuthoritySnapshot = {
    governanceBaseline: baseline,
    governanceContractContentDigest: baseline.contentDigest,
    reviewedValidationCompatibilities: [],
  };
  assert.equal(
    await canReuseValidationForGovernanceBaseline(
      result.identity,
      b2,
      contractAuthority({ governance: [wrongSnapshot] }),
    ),
    false,
  );

  const mismatchedGovernanceDigest: CandidateGovernanceValidationAuthoritySnapshot = {
    governanceBaseline: b2,
    governanceContractContentDigest: 'not-b2',
    reviewedValidationCompatibilities: [{
      kind: 'reviewed-exact-governance-compatibility',
      validatorContractVersion: CANDIDATE_VALIDATOR_CONTRACT_VERSION,
      candidateKind: 'workflow',
      from: baseline,
      to: b2,
      governanceContractContentDigest: b2.contentDigest,
      reviewDigest: 'review-b1-b2',
    }],
  };
  assert.equal(
    await canReuseValidationForGovernanceBaseline(
      result.identity,
      b2,
      contractAuthority({ governance: [mismatchedGovernanceDigest] }),
    ),
    false,
  );

  const reviewedTargetAuthority: CandidateGovernanceValidationAuthoritySnapshot = {
    governanceBaseline: b2,
    governanceContractContentDigest: b2.contentDigest,
    reviewedValidationCompatibilities: [{
      kind: 'reviewed-exact-governance-compatibility',
      validatorContractVersion: CANDIDATE_VALIDATOR_CONTRACT_VERSION,
      candidateKind: 'workflow',
      from: baseline,
      to: b2,
      governanceContractContentDigest: b2.contentDigest,
      reviewDigest: 'review-b1-b2',
    }],
  };
  assert.equal(
    await canReuseValidationForGovernanceBaseline(
      result.identity,
      b2,
      contractAuthority({ governance: [reviewedTargetAuthority] }),
    ),
    true,
  );
});

test('governance authority resolver failure cannot self-attest compatibility', async () => {
  const result = await validate(workflowCandidate());
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const b2: CandidateValidationGovernanceBaseline = { ...baseline, version: 'B2', contentDigest: 'gov-b2' };
  const failingAuthority: CandidateContractAuthorityPort = {
    ...contractAuthority(),
    async resolveExactGovernanceValidationAuthority() {
      throw new Error('registry unavailable');
    },
  };
  assert.equal(
    await canReuseValidationForGovernanceBaseline(result.identity, b2, failingAuthority),
    false,
  );
});

test('unknown promotion/activation authority fields are rejected instead of being acted on', async () => {
  const raw = {
    ...workflowCandidate(),
    promotion: { authority: 'llm' },
    activation: { automatic: true },
  };
  const result = await validate(raw);
  assert.equal(hasCode(result, 'INVALID_ENVELOPE'), true);
  assert.equal(result.grantsExecutionPermission, false);
});
