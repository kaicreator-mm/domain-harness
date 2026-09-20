import assert from 'node:assert/strict';
import test from 'node:test';

import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  CANDIDATE_ENVELOPE_SCHEMA_VERSION,
  CANDIDATE_VALIDATOR_CONTRACT_VERSION,
  canReuseValidationForGovernanceBaseline,
  validateCandidate,
  type CandidateEnvelope,
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

const workflowSpecialization: CandidateSpecializedValidator = {
  candidateKind: 'workflow',
  validate(candidate) {
    return candidate.body !== null && typeof candidate.body === 'object'
      ? []
      : [{ code: 'WORKFLOW_BODY', path: '$.body', message: 'workflow body must remain structured' }];
  },
};

function authority(overrides: Partial<CandidateValidationAuthority> = {}): CandidateValidationAuthority {
  return {
    governanceBaseline: baseline,
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

function hasCode(result: Awaited<ReturnType<typeof validateCandidate>>, code: string): boolean {
  return !result.ok && result.rejections.some((item) => item.code === code);
}

test('accepts a fully allowlisted candidate and grants no execution permission', async () => {
  const result = await validateCandidate(workflowCandidate(), authority(), sha256);
  assert.equal(result.ok, true);
  assert.equal(result.grantsExecutionPermission, false);
  if (!result.ok) return;
  assert.equal(result.identity.validatorContractVersion, CANDIDATE_VALIDATOR_CONTRACT_VERSION);
  assert.equal(result.identity.governanceBaseline.contentDigest, baseline.contentDigest);
  assert.equal('promoted' in result.identity, false);
  assert.equal('active' in result.identity, false);
});

test('uses one envelope for Rule, DecisionProcedure, Skill and Workflow Candidates', async () => {
  for (const candidateKind of ['rule', 'decision-procedure', 'skill'] as const) {
    const raw = {
      ...workflowCandidate(),
      candidateKind,
      mutation: { kind: 'none' },
    } as Record<string, unknown>;
    delete raw.control;
    const result = await validateCandidate(raw, authority(), sha256);
    assert.equal(result.ok, true, `${candidateKind} should pass the common validator`);
    assert.equal(result.grantsExecutionPermission, false);
  }
  const workflow = await validateCandidate(workflowCandidate(), authority(), sha256);
  assert.equal(workflow.ok, true);
});

test('semantic digest is stable across set-like declaration ordering and candidate ids', async () => {
  const digestAuthority = authority({
    allowedCapabilities: ['catalog-read', 'audit-read'],
    allowedEvents: ['ORDER_APPROVED', 'ORDER_AUDITED'],
  });
  const first = await validateCandidate(
    workflowCandidate({
      capabilities: ['catalog-read', 'audit-read'],
      events: ['ORDER_APPROVED', 'ORDER_AUDITED'],
    }),
    digestAuthority,
    sha256,
  );
  const second = await validateCandidate(
    workflowCandidate({
      candidateId: 'different-proposal-id',
      capabilities: ['audit-read', 'catalog-read'],
      events: ['ORDER_AUDITED', 'ORDER_APPROVED'],
      body: { operation: 'approve-order' },
    }),
    digestAuthority,
    sha256,
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) assert.equal(first.identity.candidateContentDigest, second.identity.candidateContentDigest);
});

test('fails closed on illegal I/O, capability, event, tool, applicability and mutation effect', async () => {
  const illegalTool = { ...tool, contentDigest: 'tool-unknown' };
  const illegalApplicability = { ...applicability, contentDigest: 'pre-unknown' };
  const illegalEffect = { ...effect, contentDigest: 'effect-unknown' };
  const result = await validateCandidate(
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
    authority(),
    sha256,
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
  const directResult = await validateCandidate(directMutation, authority(), sha256);
  assert.equal(hasCode(directResult, 'MUTATION_PATH_INVALID'), true);
});

test('rejects arbitrary code, provider secrets and runtime objects before validation', async () => {
  for (const [body, expected] of [
    [{ code: 'return true' }, 'ARBITRARY_CODE_FORBIDDEN'],
    [{ providerSecret: 'do-not-store' }, 'PROVIDER_SECRET_OR_STATE_FORBIDDEN'],
    [{ actorRef: 'actor-123' }, 'RUNTIME_OBJECT_FORBIDDEN'],
    [{ chainOfThought: 'private' }, 'PRIVATE_REASONING_FORBIDDEN'],
  ] as const) {
    const result = await validateCandidate(workflowCandidate({ body }), authority(), sha256);
    assert.equal(hasCode(result, expected), true);
  }

  const result = await validateCandidate(workflowCandidate({ body: new Date() }), authority(), sha256);
  assert.equal(hasCode(result, 'RUNTIME_OBJECT_FORBIDDEN'), true);
});

test('rejects control cycles and preserves mandatory Workflow specialization', async () => {
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
  const cycleResult = await validateCandidate(cyclic, authority(), sha256);
  assert.equal(hasCode(cycleResult, 'CONTROL_CYCLE_FORBIDDEN'), true);

  const noSpecialization = await validateCandidate(
    workflowCandidate(),
    authority({ specializedValidators: {} }),
    sha256,
  );
  assert.equal(hasCode(noSpecialization, 'SPECIALIZED_VALIDATOR_REQUIRED'), true);
});

test('rejects unresolved exact references and incompatible Hard Invariants', async () => {
  const result = await validateCandidate(
    workflowCandidate({
      references: [{ ...reference, contentDigest: 'wrong' }],
      hardInvariants: [{ ...invariant, contentDigest: 'wrong' }],
    }),
    authority(),
    sha256,
  );
  assert.equal(hasCode(result, 'EXACT_REFERENCE_UNRESOLVED'), true);
  assert.equal(hasCode(result, 'HARD_INVARIANT_INCOMPATIBLE'), true);
});

test('changed Governance Baseline requires revalidation unless exact reviewed compatibility matches', async () => {
  const result = await validateCandidate(workflowCandidate(), authority(), sha256);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  const b2 = { ...baseline, version: 'B2', contentDigest: 'gov-b2' };
  assert.equal(canReuseValidationForGovernanceBaseline(result.identity, b2), false);
  assert.equal(
    canReuseValidationForGovernanceBaseline(result.identity, b2, {
      kind: 'reviewed-exact-governance-compatibility',
      validatorContractVersion: CANDIDATE_VALIDATOR_CONTRACT_VERSION,
      candidateKind: 'workflow',
      from: baseline,
      to: b2,
      reviewDigest: 'review-b1-b2',
    }),
    true,
  );
});

test('unknown promotion/activation authority fields are rejected instead of being acted on', async () => {
  const raw = {
    ...workflowCandidate(),
    promotion: { authority: 'llm' },
    activation: { automatic: true },
  };
  const result = await validateCandidate(raw, authority(), sha256);
  assert.equal(hasCode(result, 'INVALID_ENVELOPE'), true);
  assert.equal(result.grantsExecutionPermission, false);
});
