import {
  sha256Canonical,
  type ApplicabilityContext,
  type AvailableToolContract,
  type CandidateValidationPolicy,
  type CompiledArtifactIdentity,
  type RuntimeCompatibilityContext,
  type WorkflowCandidate,
} from './subworkflow-lifecycle.proposal.js';

export const riskTool: AvailableToolContract = {
  identity: {
    kind: 'tool',
    artifactId: 'risk-score-query',
    version: '2.1.0',
    contentDigest: sha256Canonical({ input: 'country', output: 'risk-band', capability: 'query' }),
  },
  capability: 'query',
};

export const policyArtifact: CompiledArtifactIdentity = {
  kind: 'knowledge',
  artifactId: 'trade-risk-policy',
  version: '2026.09',
  contentDigest: sha256Canonical({ blockedRiskBand: 'high' }),
};

export const validationPolicy: CandidateValidationPolicy = {
  policyId: 'promoted-subworkflow-validator-v1',
  policyDigest: sha256Canonical({ policy: 'v1', cycles: 'reject', mutationTools: 'reject' }),
  allowedEvents: ['QUOTE_REQUESTED', 'QUOTE_REJECTED'],
  allowedTools: [riskTool],
  maxSteps: 12,
  maxReasonedCalls: 1,
};

export function makeCandidate(overrides: Partial<WorkflowCandidate> = {}): WorkflowCandidate {
  const candidate: WorkflowCandidate = {
    kind: 'workflow-candidate-v1',
    candidateId: 'candidate-risk-quote-v1',
    domainId: 'trade-quote',
    semantic: {
      artifactId: 'risk-aware-quote',
      inputSchema: { type: 'object', required: ['country', 'segment'] },
      outputSchema: { type: 'object', event: ['QUOTE_REQUESTED', 'QUOTE_REJECTED'] },
      applicability: [{ source: 'input', selector: 'segment', op: 'eq', value: 'b2b' }],
      steps: {
        lookup: {
          kind: 'query',
          toolArtifactId: riskTool.identity.artifactId,
          toolContentDigest: riskTool.identity.contentDigest,
          inputField: 'country',
          outputFact: 'riskBand',
        },
        decide: { kind: 'rule', fact: 'riskBand', op: 'eq', value: 'high' },
        reject: { kind: 'emit', eventType: 'QUOTE_REJECTED' },
        quote: { kind: 'emit', eventType: 'QUOTE_REQUESTED' },
      },
      edges: [
        { from: 'lookup', to: 'decide', when: 'done' },
        { from: 'decide', to: 'reject', when: 'true' },
        { from: 'decide', to: 'quote', when: 'false' },
      ],
      allowedTools: [riskTool.identity],
      referencedArtifacts: [policyArtifact],
      allowedEvents: ['QUOTE_REQUESTED', 'QUOTE_REJECTED'],
      bounds: { startStep: 'lookup', maxSteps: 4, maxReasonedCalls: 0 },
    },
    compatibility: {
      formatVersion: 'v0.3',
      runtimeContractMajor: 3,
      executionEngineMajor: 1,
      requiredCapabilities: ['query-port'],
    },
    provenance: {
      proposedBy: 'harness-machine',
      sourceInvocationId: 'invocation-001',
      evidenceRefs: ['decision-trace:001'],
      proposedAt: '2026-09-20T09:30:00Z',
    },
  };
  return { ...candidate, ...overrides };
}

export const compatibleRuntime: RuntimeCompatibilityContext = {
  formatVersion: 'v0.3',
  runtimeContractMajor: 3,
  executionEngineMajor: 1,
  hostCapabilities: ['query-port'],
  availableArtifacts: [policyArtifact],
  availableTools: [riskTool],
};

export const applicableB2bContext: ApplicabilityContext = {
  input: { country: 'MM', segment: 'b2b' },
  domainFacts: {},
  workflowContext: {},
};
