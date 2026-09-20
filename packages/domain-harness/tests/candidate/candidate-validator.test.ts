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
const tool = { kind: 'tool', artifactId: 'catalog-query', contentDigest: 'tool-1', capability: 'query' } as const;
const reference = { kind: 'rule', artifactId: 'pricing-rule', contentDigest: 'rule-1' } as const;
const applicability = { kind: 'precondition', artifactId: 'domestic-order', contentDigest: 'pre-1' } as const;
const invariant = { kind: 'hard-invariant', artifactId: 'no-negative-total', contentDigest: 'inv-1' } as const;
const effect = { kind: 'effect-contract', artifactId: 'reserve-stock', contentDigest: 'effect-1' } as const;

function bodySchemaArtifact(candidateKind: CandidateKind, artifactId: string): CandidateBodySchemaArtifact {
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['operation'],
    properties: { operation: { type: 'string', minLength: 1 } },
  } as const;
  const semanticMaterial = { schemaVersion: CANDIDATE_BODY_SCHEMA_VERSION, candidateKind, schema };
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

function exactRefKey(value: { kind: string; artifactId: string; contentDigest: string }): string {
  return `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;
}

function contractAuthority(
  schemas: readonly CandidateBodySchemaArtifact[] = Object.values(bodySchemas),
): CandidateContractAuthorityPort {
  return {
    async resolveExactBodySchema(referenceToResolve) {
      return schemas.find((item) => exactRefKey(item.identity) === exactRefKey(referenceToResolve));
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
  assert.equal((await validate(workflowCandidate())).ok, true);
});

test('semantic digest is stable across set-like declaration ordering and candidate ids', async () => {
  const digestAuthority = authority({
    allowedCapabilities: ['catalog-read', 'audit-read'],
    allowedEvents: ['ORDER_APPROVED', 'ORDER_AUDITED'],
  });
  const first = await validate(workflowCandidate({
    capabilities: ['catalog-read', 'audit-read'],
    events: ['ORDER_APPROVED', 'ORDER_AUDITED'],
  }), digestAuthority);
  const second = await validate(workflowCandidate({
    candidateId: 'different-proposal-id',
    capabilities: ['audit-read', 'catalog-read'],
    events: ['ORDER_AUDITED', 'ORDER_APPROVED'],
  }), digestAuthority);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.equal(first.identity.candidateContentDigest, second.identity.candidateContentDigest);
  }
});

test('fails closed when exact body-schema authority is missing, mismatched, corrupt or permissive-by-tamper', async () => {
  const missingConfiguredContract = await validate(workflowCandidate(), authority({ bodyContracts: {} }));
  assert.equal(hasCode(missingConfiguredContract, 'BODY_VALIDATOR_REQUIRED'), true);

  const mismatchedCandidate = await validate(
    workflowCandidate({ bodyContract: { ...bodySchemas.workflow.identity, contentDigest: 'untrusted-body-contract' } }),
  );
  assert.equal(hasCode(mismatchedCandidate, 'BODY_CONTRACT_NOT_ALLOWED'), true);

  const missingResolvedSchema = await validate(workflowCandidate(), authority(), contractAuthority([]));
  assert.equal(hasCode(missingResolvedSchema, 'BODY_VALIDATOR_REQUIRED'), true);

  const tampered = {
    ...bodySchemas.workflow,
    schema: { type: 'object', additionalProperties: true, required: [], properties: {} },
  } as unknown as CandidateBodySchemaArtifact;
  const tamperedSchema = await validate(
    workflowCandidate(),
    authority(),
    contractAuthority([tampered, bodySchemas.rule, bodySchemas['decision-procedure'], bodySchemas.skill]),
  );
  assert.equal(hasCode(tamperedSchema, 'VALIDATION_AUTHORITY_INVALID'), true);
});

test('body schema rejects disguised executable material and actual functions', async () => {
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
  const result = await validate(workflowCandidate({
    io: {
      inputs: [{ ...input, contentDigest: 'in-unknown' }],
      outputs: [{ ...output, contentDigest: 'out-unknown' }],
    },
    capabilities: ['illegal-capability'],
    events: ['ILLEGAL_EVENT'],
    tools: [{ ...tool, contentDigest: 'tool-unknown' }],
    applicability: [{ ...applicability, contentDigest: 'pre-unknown' }],
    mutation: { kind: 'durable-effect', effects: [{ ...effect, contentDigest: 'effect-unknown' }] },
  }));
  for (const code of [
    'INPUT_CONTRACT_NOT_ALLOWED',
    'OUTPUT_CONTRACT_NOT_ALLOWED',
    'CAPABILITY_NOT_ALLOWED',
    'EVENT_NOT_ALLOWED',
    'TOOL_NOT_ALLOWED',
    'APPLICABILITY_NOT_ALLOWED',
    'MUTATION_PATH_INVALID',
  ]) {
    assert.equal(hasCode(result, code), true, code);
  }
  assert.equal(result.grantsExecutionPermission, false);

  const directResult = await validate({ ...workflowCandidate(), mutation: { kind: 'direct' } });
  assert.equal(hasCode(directResult, 'MUTATION_PATH_INVALID'), true);
});

test('rejects arbitrary code, provider secrets, private reasoning and runtime objects before validation', async () => {
  for (const [body, expected] of [
    [{ code: 'return true' }, 'ARBITRARY_CODE_FORBIDDEN'],
    [{ providerSecret: 'do-not-store' }, 'PROVIDER_SECRET_OR_STATE_FORBIDDEN'],
    [{ actorRef: 'actor-123' }, 'RUNTIME_OBJECT_FORBIDDEN'],
    [{ chainOfThought: 'private' }, 'PRIVATE_REASONING_FORBIDDEN'],
  ] as const) {
    assert.equal(hasCode(await validate(workflowCandidate({ body })), expected), true);
  }
  assert.equal(
    hasCode(await validate(workflowCandidate({ body: new Date() })), 'RUNTIME_OBJECT_FORBIDDEN'),
    true,
  );
});

test('rejects cyclic, oversized and unreachable control graphs', async () => {
  const cyclic = await validate(workflowCandidate({
    control: {
      startNode: 'a',
      nodes: ['a', 'b'],
      edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
      maxSteps: 2,
    },
  }));
  assert.equal(hasCode(cyclic, 'CONTROL_CYCLE_FORBIDDEN'), true);

  const oversized = await validate(workflowCandidate({
    control: {
      startNode: 'n0',
      nodes: ['n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'],
      edges: [
        { from: 'n0', to: 'n1' }, { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' }, { from: 'n3', to: 'n4' },
        { from: 'n4', to: 'n5' }, { from: 'n5', to: 'n6' },
        { from: 'n6', to: 'n7' }, { from: 'n7', to: 'n8' },
      ],
      maxSteps: 9,
    },
  }));
  assert.equal(hasCode(oversized, 'CONTROL_LIMIT_EXCEEDED'), true);

  const unreachable = await validate(workflowCandidate({
    control: {
      startNode: 'a',
      nodes: ['a', 'b', 'orphan'],
      edges: [{ from: 'a', to: 'b' }],
      maxSteps: 3,
    },
  }));
  assert.equal(hasCode(unreachable, 'CONTROL_INVALID'), true);
});

test('preserves mandatory Workflow specialization and fails closed on specialized rejection/exception', async () => {
  assert.equal(
    hasCode(await validate(workflowCandidate(), authority({ specializedValidators: {} })), 'SPECIALIZED_VALIDATOR_REQUIRED'),
    true,
  );

  const rejecting: CandidateSpecializedValidator = {
    candidateKind: 'workflow',
    validate() {
      return [{ code: 'WORKFLOW_DENIED', path: '$.body', message: 'denied by #204 specialization' }];
    },
  };
  assert.equal(
    hasCode(await validate(workflowCandidate(), authority({ specializedValidators: { workflow: rejecting } })), 'SPECIALIZED_REJECTED'),
    true,
  );

  const throwing: CandidateSpecializedValidator = {
    candidateKind: 'workflow',
    validate() {
      throw new Error('specialized validator unavailable');
    },
  };
  assert.equal(
    hasCode(await validate(workflowCandidate(), authority({ specializedValidators: { workflow: throwing } })), 'SPECIALIZED_REJECTED'),
    true,
  );
});

test('invalid validation authority fails closed before candidate validation', async () => {
  assert.equal(
    hasCode(await validate(workflowCandidate(), authority({ maxControlNodes: 0 })), 'VALIDATION_AUTHORITY_INVALID'),
    true,
  );
  assert.equal(
    hasCode(
      await validate(workflowCandidate(), authority({ governanceBaseline: { ...baseline, contentDigest: '' } })),
      'VALIDATION_AUTHORITY_INVALID',
    ),
    true,
  );
});

test('rejects unresolved exact references and incompatible Hard Invariants', async () => {
  const result = await validate(workflowCandidate({
    references: [{ ...reference, contentDigest: 'wrong' }],
    hardInvariants: [{ ...invariant, contentDigest: 'wrong' }],
  }));
  assert.equal(hasCode(result, 'EXACT_REFERENCE_UNRESOLVED'), true);
  assert.equal(hasCode(result, 'HARD_INVARIANT_INCOMPATIBLE'), true);
});

test('Governance validation evidence is reusable only for the same exact baseline in T-004', async () => {
  const validated = await validate(workflowCandidate());
  assert.equal(validated.ok, true);
  if (!validated.ok) return;

  assert.equal(
    canReuseValidationForGovernanceBaseline(validated.identity, baseline),
    true,
  );

  const changed: CandidateValidationGovernanceBaseline = {
    ...baseline,
    version: 'B2',
    contentDigest: 'gov-b2',
  };
  assert.equal(
    canReuseValidationForGovernanceBaseline(validated.identity, changed),
    false,
  );
});

test('unknown promotion/activation authority fields are rejected instead of being acted on', async () => {
  const result = await validate({
    ...workflowCandidate(),
    promotion: { authority: 'llm' },
    activation: { automatic: true },
  });
  assert.equal(hasCode(result, 'INVALID_ENVELOPE'), true);
  assert.equal(result.grantsExecutionPermission, false);
});
