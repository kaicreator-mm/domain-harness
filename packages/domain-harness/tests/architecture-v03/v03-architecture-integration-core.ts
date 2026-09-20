import { createHash } from 'node:crypto';

export const CONSUMED_RESEARCH = {
  issue187: '3cb9aa6f0579087a793ee8c30bedf8cdd8a36387',
  issue194: '0ace38118f000c71641c3e1bf8a94276ef4cec60',
  issue195: '419269f788de1d46e24af8bea19b041c8e36760f',
  issue196: '7c6c7a63b643fbaa5051db8e403dd15f7721dce8',
} as const;

export const DOMAIN_OUTCOMES = [
  'TECHNICAL_REVIEW_REQUIRED',
  'QUOTE_REQUESTED',
  'MORE_INFORMATION_REQUIRED',
  'REJECTED',
] as const;

export type DomainOutcome = (typeof DOMAIN_OUTCOMES)[number];
export type ContentDigest = `sha256:${string}`;

export interface ProposedMutation {
  kind: 'CREATE_QUOTE';
  quoteKey: string;
}

export interface DomainDecision {
  type: DomainOutcome;
  payload: {
    reasonCode: string;
    proposedMutation?: ProposedMutation;
  };
}

export interface DecisionTraceStep {
  stepId: string;
  kind: 'input' | 'model' | 'decision';
  evidenceRefs: string[];
  outcome: string;
}

export interface DecisionTrace {
  version: 1;
  steps: DecisionTraceStep[];
  finalEvent: DomainDecision;
}

export interface SemanticContentDigests {
  rule: ContentDigest;
  knowledge: ContentDigest;
  skill: ContentDigest;
  tool: ContentDigest;
  outputContract: ContentDigest;
  harnessPolicy: ContentDigest;
}

export interface DomainRequest {
  requestId: string;
  workflowInstanceId: string;
  sourceMessageId: string;
  effectId: string;
  cacheScope: string;
  requestKind: string;
  country: string;
  accountId: string;
  description: string;
  quoteWindowOpen: boolean;
  cacheable: boolean;
  timeSensitive: boolean;
  unrelatedContext: {
    uiTheme: string;
    telemetryTraceId: string;
  };
  semanticContent?: Partial<SemanticContentDigests>;
  subworkflowArtifactDigest?: ContentDigest;
}

export interface DomainData {
  facts: {
    blockedCountries: readonly string[];
  };
  compiledIntelligence: {
    semantic: SemanticContentDigests;
    reusableSubworkflowDigest: ContentDigest;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function digestValue(value: unknown): ContentDigest {
  return `sha256:${createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex')}`;
}

export const DEFAULT_SEMANTIC_CONTENT: SemanticContentDigests = {
  rule: digestValue({ rule: 'blocked-country', revision: 1 }),
  knowledge: digestValue({ knowledge: 'rfq-evaluation', revision: 4 }),
  skill: digestValue({ skill: 'service-request-evaluation', revision: 2 }),
  tool: digestValue({ tool: 'lookup_account_score', input: 'accountId:string', output: 'score:number' }),
  outputContract: digestValue({ outcomes: DOMAIN_OUTCOMES }),
  harnessPolicy: digestValue({ maxModelCalls: 1, mutationTools: false }),
};

export const PROMOTED_SUBWORKFLOW_DIGEST = digestValue({
  kind: 'workflow-candidate-v1',
  candidateId: 'known-rfq-score-v1',
  applicability: { requestKind: 'known-rfq', country: 'MM' },
  queryTool: 'lookup_account_score',
  threshold: 70,
  highOutcome: 'QUOTE_REQUESTED',
  lowOutcome: 'MORE_INFORMATION_REQUIRED',
  cycle: false,
});

export const DEFAULT_DOMAIN_DATA: DomainData = {
  facts: {
    blockedCountries: ['BLOCKED'],
  },
  compiledIntelligence: {
    semantic: DEFAULT_SEMANTIC_CONTENT,
    reusableSubworkflowDigest: PROMOTED_SUBWORKFLOW_DIGEST,
  },
};

export function resolvedSemanticContent(request: DomainRequest): SemanticContentDigests {
  return {
    ...DEFAULT_SEMANTIC_CONTENT,
    ...(request.semanticContent ?? {}),
  };
}

export interface SemanticIdentity {
  scope: string;
  digest: ContentDigest;
  canonicalPayload: string;
}

export function buildSemanticIdentity(request: DomainRequest): SemanticIdentity {
  const canonicalPayload = canonicalJson({
    domain: '@kaicreator/domain-harness-v03-research',
    decision: 'service-request-evaluation',
    input: {
      requestKind: request.requestKind,
      country: request.country,
      accountId: request.accountId,
      description: request.description,
    },
    semanticContent: resolvedSemanticContent(request),
  });
  return {
    scope: request.cacheScope,
    digest: digestValue(canonicalPayload),
    canonicalPayload,
  };
}

function cloneDecision(decision: DomainDecision): DomainDecision {
  return structuredClone(decision);
}

export class SemanticDecisionCache {
  readonly #entries = new Map<string, DomainDecision>();

  #key(identity: SemanticIdentity): string {
    return `${identity.scope}:${identity.digest}`;
  }

  get(identity: SemanticIdentity): DomainDecision | null {
    const decision = this.#entries.get(this.#key(identity));
    return decision === undefined ? null : cloneDecision(decision);
  }

  commit(identity: SemanticIdentity, decision: DomainDecision): void {
    this.#entries.set(this.#key(identity), cloneDecision(decision));
  }

  get size(): number {
    return this.#entries.size;
  }
}

export function validateDomainDecision(value: unknown): value is DomainDecision {
  if (!isRecord(value)) return false;
  if (typeof value.type !== 'string' || !DOMAIN_OUTCOMES.includes(value.type as DomainOutcome)) return false;
  if (!isRecord(value.payload)) return false;
  if (typeof value.payload.reasonCode !== 'string' || value.payload.reasonCode.length === 0) return false;
  const mutation = value.payload.proposedMutation;
  if (mutation === undefined) return true;
  return isRecord(mutation)
    && mutation.kind === 'CREATE_QUOTE'
    && typeof mutation.quoteKey === 'string'
    && mutation.quoteKey.length > 0;
}

export interface HarnessResolution {
  decision: DomainDecision;
  decisionTrace: DecisionTrace;
  modelCalls: number;
}

export interface HarnessResolver {
  resolve(request: DomainRequest): Promise<HarnessResolution>;
}

export type SubworkflowResolution =
  | {
      status: 'resolved';
      decision: DomainDecision;
      artifactDigest: ContentDigest;
      plannerCalls: 0;
      modelCalls: number;
    }
  | {
      status: 'not-applicable' | 'not-found';
      plannerCalls: 0;
      modelCalls: 0;
    };

export interface ReusableSubworkflowResolver {
  resolve(request: DomainRequest): Promise<SubworkflowResolution>;
}

export interface ResolutionMetrics {
  totalDomainDecisions: number;
  ruleResolved: number;
  semanticCacheHits: number;
  semanticCacheMisses: number;
  semanticCacheBypasses: number;
  subworkflowResolved: number;
  subworkflowMatches: number;
  subworkflowMisses: number;
  harnessModelRequired: number;
  actualModelCallCount: number;
  llmAvoidedDecisions: number;
}

export function createResolutionMetrics(): ResolutionMetrics {
  return {
    totalDomainDecisions: 0,
    ruleResolved: 0,
    semanticCacheHits: 0,
    semanticCacheMisses: 0,
    semanticCacheBypasses: 0,
    subworkflowResolved: 0,
    subworkflowMatches: 0,
    subworkflowMisses: 0,
    harnessModelRequired: 0,
    actualModelCallCount: 0,
    llmAvoidedDecisions: 0,
  };
}

export type ResolutionSource = 'rule' | 'semantic-cache' | 'subworkflow' | 'harness';

export interface ResolutionResult {
  source: ResolutionSource;
  decision: DomainDecision;
  freshModelCalls: number;
  semanticIdentity: SemanticIdentity | null;
  decisionTrace?: DecisionTrace;
  subworkflowArtifactDigest?: ContentDigest;
}

export class DecisionResolver {
  readonly metrics = createResolutionMetrics();

  constructor(
    private readonly cache: SemanticDecisionCache,
    private readonly subworkflows: ReusableSubworkflowResolver,
    private readonly harness: HarnessResolver,
    private readonly domainData: DomainData = DEFAULT_DOMAIN_DATA,
  ) {}

  #deterministicRule(request: DomainRequest): DomainDecision | null {
    if (!this.domainData.facts.blockedCountries.includes(request.country)) return null;
    return {
      type: 'REJECTED',
      payload: { reasonCode: 'stable_blocked_country_rule' },
    };
  }

  #finish(result: ResolutionResult): ResolutionResult {
    if (result.freshModelCalls === 0) this.metrics.llmAvoidedDecisions += 1;
    return result;
  }

  async resolve(request: DomainRequest): Promise<ResolutionResult> {
    this.metrics.totalDomainDecisions += 1;

    const ruleDecision = this.#deterministicRule(request);
    if (ruleDecision !== null) {
      this.metrics.ruleResolved += 1;
      return this.#finish({
        source: 'rule',
        decision: ruleDecision,
        freshModelCalls: 0,
        semanticIdentity: null,
      });
    }

    const cacheEligible = request.cacheable && !request.timeSensitive;
    const identity = cacheEligible ? buildSemanticIdentity(request) : null;
    if (identity === null) {
      this.metrics.semanticCacheBypasses += 1;
    } else {
      const cached = this.cache.get(identity);
      if (cached !== null) {
        if (!validateDomainDecision(cached)) throw new Error('cached decision failed current schema validation');
        this.metrics.semanticCacheHits += 1;
        return this.#finish({
          source: 'semantic-cache',
          decision: cached,
          freshModelCalls: 0,
          semanticIdentity: identity,
        });
      }
      this.metrics.semanticCacheMisses += 1;
    }

    const subworkflow = await this.subworkflows.resolve(request);
    if (subworkflow.status === 'resolved') {
      if (!validateDomainDecision(subworkflow.decision)) throw new Error('subworkflow returned invalid decision');
      this.metrics.subworkflowResolved += 1;
      this.metrics.subworkflowMatches += 1;
      this.metrics.actualModelCallCount += subworkflow.modelCalls;
      if (identity !== null) this.cache.commit(identity, subworkflow.decision);
      return this.#finish({
        source: 'subworkflow',
        decision: subworkflow.decision,
        freshModelCalls: subworkflow.modelCalls,
        semanticIdentity: identity,
        subworkflowArtifactDigest: subworkflow.artifactDigest,
      });
    }
    this.metrics.subworkflowMisses += 1;

    const harness = await this.harness.resolve(request);
    if (!validateDomainDecision(harness.decision)) throw new Error('HarnessMachine returned invalid decision');
    this.metrics.harnessModelRequired += 1;
    this.metrics.actualModelCallCount += harness.modelCalls;
    if (identity !== null) this.cache.commit(identity, harness.decision);
    return this.#finish({
      source: 'harness',
      decision: harness.decision,
      freshModelCalls: harness.modelCalls,
      semanticIdentity: identity,
      decisionTrace: harness.decisionTrace,
    });
  }
}

export function llmAvoidanceRate(metrics: ResolutionMetrics): number {
  if (metrics.totalDomainDecisions === 0) return 0;
  return metrics.llmAvoidedDecisions / metrics.totalDomainDecisions;
}

export interface MutationResult {
  effectId: string;
  quoteKey: string;
  applicationNumber: number;
}

export class DurableEffectAuthority {
  readonly #committed = new Map<string, MutationResult>();
  applications = 0;

  execute(effectId: string, decision: DomainDecision): MutationResult | null {
    if (decision.payload.proposedMutation === undefined) return null;
    const committed = this.#committed.get(effectId);
    if (committed !== undefined) return structuredClone(committed);

    this.applications += 1;
    const result: MutationResult = {
      effectId,
      quoteKey: decision.payload.proposedMutation.quoteKey,
      applicationNumber: this.applications,
    };
    this.#committed.set(effectId, result);
    return structuredClone(result);
  }
}

export interface WorkflowCandidateDraft {
  kind: 'workflow-candidate-v1';
  candidateId: string;
  applicability: {
    requestKind: string;
    country: string;
  };
  queryTool: string;
  threshold: number;
  highOutcome: DomainOutcome | string;
  lowOutcome: DomainOutcome | string;
  cycle: boolean;
  arbitraryCode?: string;
}

export interface WorkflowCandidate extends WorkflowCandidateDraft {
  semanticDigest: ContentDigest;
}

export interface ValidatedCandidate {
  kind: 'validated-candidate-v1';
  candidate: WorkflowCandidate;
  evidence: string[];
}

export interface PromotedWorkflowArtifact {
  kind: 'promoted-workflow-v1';
  artifactVersion: 1;
  candidate: WorkflowCandidate;
  contentDigest: ContentDigest;
  promotion: {
    selectedBy: string;
    evidenceRef: string;
  };
}

function candidateDigestView(candidate: WorkflowCandidateDraft): Omit<WorkflowCandidateDraft, 'arbitraryCode'> & { arbitraryCode?: string } {
  const view: Omit<WorkflowCandidateDraft, 'arbitraryCode'> & { arbitraryCode?: string } = {
    kind: candidate.kind,
    candidateId: candidate.candidateId,
    applicability: candidate.applicability,
    queryTool: candidate.queryTool,
    threshold: candidate.threshold,
    highOutcome: candidate.highOutcome,
    lowOutcome: candidate.lowOutcome,
    cycle: candidate.cycle,
  };
  if (candidate.arbitraryCode !== undefined) view.arbitraryCode = candidate.arbitraryCode;
  return view;
}

export function sealCandidate(draft: WorkflowCandidateDraft): WorkflowCandidate {
  return {
    ...draft,
    semanticDigest: digestValue(candidateDigestView(draft)),
  };
}

export type CandidateValidationResult =
  | { status: 'valid'; value: ValidatedCandidate }
  | { status: 'invalid'; errors: string[] };

export function validateCandidate(candidate: WorkflowCandidate): CandidateValidationResult {
  const errors: string[] = [];
  if (candidate.queryTool !== 'lookup_account_score') errors.push(`unknown tool: ${candidate.queryTool}`);
  if (!DOMAIN_OUTCOMES.includes(candidate.highOutcome as DomainOutcome)) errors.push(`illegal event: ${candidate.highOutcome}`);
  if (!DOMAIN_OUTCOMES.includes(candidate.lowOutcome as DomainOutcome)) errors.push(`illegal event: ${candidate.lowOutcome}`);
  if (candidate.cycle) errors.push('control cycles are rejected by this research validator');
  if (candidate.arbitraryCode !== undefined) errors.push('arbitrary executable code is forbidden');
  if (candidate.semanticDigest !== digestValue(candidateDigestView(candidate))) errors.push('semantic digest mismatch');
  if (errors.length > 0) return { status: 'invalid', errors };
  return {
    status: 'valid',
    value: {
      kind: 'validated-candidate-v1',
      candidate,
      evidence: ['schema-valid', 'tool-allowed', 'event-set-valid', 'acyclic', 'content-addressed'],
    },
  };
}

export function promoteCandidate(
  validated: ValidatedCandidate,
  selectedBy: string,
  evidenceRef: string,
): PromotedWorkflowArtifact {
  if (validated.kind !== 'validated-candidate-v1') throw new Error('candidate must be explicitly validated before promotion');
  return {
    kind: 'promoted-workflow-v1',
    artifactVersion: 1,
    candidate: validated.candidate,
    contentDigest: validated.candidate.semanticDigest,
    promotion: { selectedBy, evidenceRef },
  };
}

export function makeRequest(overrides: Partial<DomainRequest> = {}): DomainRequest {
  const base: DomainRequest = {
    requestId: 'request-a',
    workflowInstanceId: 'workflow-a',
    sourceMessageId: 'message-a',
    effectId: 'effect-a',
    cacheScope: 'tenant-a',
    requestKind: 'novel',
    country: 'MM',
    accountId: 'acct-high',
    description: 'custom quote request',
    quoteWindowOpen: true,
    cacheable: true,
    timeSensitive: false,
    unrelatedContext: {
      uiTheme: 'dark',
      telemetryTraceId: 'trace-a',
    },
  };
  return {
    ...base,
    ...overrides,
    unrelatedContext: overrides.unrelatedContext ?? base.unrelatedContext,
  };
}
