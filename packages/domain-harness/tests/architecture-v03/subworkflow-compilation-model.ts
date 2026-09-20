import { createHash } from 'node:crypto';
import { assign, fromPromise, setup } from 'xstate';

export const SOURCE_187_VALIDATED_HEAD = '3cb9aa6f0579087a793ee8c30bedf8cdd8a36387';

export const DOMAIN_OUTCOMES = [
  'TECHNICAL_REVIEW_REQUIRED',
  'QUOTE_REQUESTED',
  'MORE_INFORMATION_REQUIRED',
  'REJECTED',
] as const;

export type DomainOutcome = (typeof DOMAIN_OUTCOMES)[number];
export type ContentDigest = `sha256:${string}`;
export type JsonScalar = string | number | boolean | null;

export interface DomainDecision {
  type: DomainOutcome;
  payload: {
    reasonCode: string;
  };
}

export interface DecisionTraceStep {
  stepId: string;
  stepType: 'fact' | 'tool' | 'decision' | 'result';
  inputRefs: string[];
  evidenceRefs: ContentDigest[];
  outcome: JsonScalar | Record<string, JsonScalar>;
  status: 'accepted' | 'rejected';
}

export interface DecisionTrace {
  version: 1;
  steps: DecisionTraceStep[];
  finalEvent: DomainDecision;
  status: 'accepted' | 'rejected';
}

export interface ContractShape {
  required: Record<string, 'string' | 'number' | 'boolean'>;
  schemaDigest: ContentDigest;
}

export interface OutputContract {
  allowedEvents: DomainOutcome[];
  schemaDigest: ContentDigest;
}

export interface ToolContractRef {
  name: string;
  capability: 'query';
  contractDigest: ContentDigest;
}

export interface ApplicabilityClause {
  field: string;
  op: 'eq';
  value: JsonScalar;
}

export interface QueryStep {
  id: string;
  kind: 'query';
  tool: string;
  inputField: string;
  outputKey: string;
  next: string;
}

export interface RuleStep {
  id: string;
  kind: 'rule';
  ruleDigest: ContentDigest;
  factKey: string;
  operator: 'gte' | 'eq';
  value: JsonScalar;
  onTrue: string;
  onFalse: string;
}

export interface ReasonedStep {
  id: string;
  kind: 'reasoned';
  resolver: 'HarnessMachine';
  allowedOutcomes: DomainOutcome[];
  onOutcome: Partial<Record<DomainOutcome, string>>;
}

export interface EmitStep {
  id: string;
  kind: 'emit';
  event: DomainOutcome;
  reasonCode: string;
}

export type WorkflowStep = QueryStep | RuleStep | ReasonedStep | EmitStep;

export interface WorkflowEdge {
  from: string;
  label: string;
  to: string;
}

export interface WorkflowCandidateDraft {
  kind: 'workflow-candidate-v1';
  candidateId: string;
  sourceLocation?: string;
  inputContract: ContractShape;
  outputContract: OutputContract;
  start: string;
  steps: Record<string, WorkflowStep>;
  edges: WorkflowEdge[];
  allowedTools: ToolContractRef[];
  referencedDomainDataDigests: ContentDigest[];
  applicability: {
    all: ApplicabilityClause[];
  };
  bounds: {
    maxSteps: number;
    maxReasonedCalls: number;
  };
}

export interface WorkflowCandidate extends WorkflowCandidateDraft {
  semanticDigest: ContentDigest;
}

export interface HarnessProposal {
  decision: DomainDecision;
  decisionTrace: DecisionTrace;
  candidate?: WorkflowCandidate;
}

export type HarnessResult =
  | {
      status: 'ok';
      decision: DomainDecision;
      decisionTrace: DecisionTrace;
      candidate?: WorkflowCandidate;
    }
  | {
      status: 'error';
      code: 'planner-error' | 'invalid-structured-result';
      message: string;
    };

export interface PlannerPort {
  generateStructured(input: Record<string, unknown>, signal: AbortSignal): Promise<unknown>;
}

export interface ValidationEnvironment {
  allowedOutcomes: readonly DomainOutcome[];
  tools: readonly ToolContractRef[];
  knownArtifactDigests: ReadonlySet<ContentDigest>;
  maxWorkflowSteps: number;
  maxReasonedCalls: number;
}

export interface ValidatedCandidate {
  kind: 'validated-candidate-v1';
  candidate: WorkflowCandidate;
  contentDigest: ContentDigest;
  validationEvidence: string[];
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

export type CandidateValidationResult =
  | { status: 'valid'; value: ValidatedCandidate }
  | { status: 'invalid'; errors: string[] };

export interface RuntimeQueryTool {
  name: string;
  contractDigest: ContentDigest;
  execute(input: unknown, signal: AbortSignal): Promise<unknown>;
}

export interface ReasonedStepPort {
  resolve(
    input: Readonly<Record<string, unknown>>,
    facts: Readonly<Record<string, unknown>>,
    allowedOutcomes: readonly DomainOutcome[],
    signal: AbortSignal,
  ): Promise<DomainDecision>;
}

export interface CompiledWorkflowRuntime {
  tools: readonly RuntimeQueryTool[];
  reasoned?: ReasonedStepPort;
}

export interface SubworkflowOutput {
  status: 'ok' | 'not-applicable' | 'error';
  decision?: DomainDecision;
  error?: string;
}

interface HarnessContext {
  planner: PlannerPort;
  input: Record<string, unknown>;
  raw: unknown;
  result: HarnessResult | null;
}

interface PlannerTaskInput {
  planner: PlannerPort;
  input: Record<string, unknown>;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

export function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value);
}

export function isDigest(value: unknown): value is ContentDigest {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/.test(value);
}

function isDomainOutcome(value: unknown, allowed = DOMAIN_OUTCOMES): value is DomainOutcome {
  return typeof value === 'string' && allowed.includes(value as DomainOutcome);
}

function parseDomainDecision(value: unknown, allowed = DOMAIN_OUTCOMES): DomainDecision | null {
  const record = asRecord(value);
  if (record === null || !hasExactKeys(record, ['type', 'payload'])) return null;
  if (!isDomainOutcome(record.type, allowed)) return null;
  const payload = asRecord(record.payload);
  if (payload === null || !hasExactKeys(payload, ['reasonCode'])) return null;
  if (typeof payload.reasonCode !== 'string' || payload.reasonCode.length === 0) return null;
  return { type: record.type, payload: { reasonCode: payload.reasonCode } };
}

function parseDecisionTrace(value: unknown, decision: DomainDecision): DecisionTrace | null {
  const record = asRecord(value);
  if (record === null || !hasExactKeys(record, ['version', 'steps', 'finalEvent', 'status'])) return null;
  if (record.version !== 1 || record.status !== 'accepted' || !Array.isArray(record.steps)) return null;
  const finalEvent = parseDomainDecision(record.finalEvent);
  if (finalEvent === null || JSON.stringify(finalEvent) !== JSON.stringify(decision)) return null;

  const steps: DecisionTraceStep[] = [];
  for (const rawStep of record.steps) {
    const step = asRecord(rawStep);
    if (step === null || !hasExactKeys(step, ['stepId', 'stepType', 'inputRefs', 'evidenceRefs', 'outcome', 'status'])) {
      return null;
    }
    if (typeof step.stepId !== 'string' || step.stepId.length === 0) return null;
    if (!['fact', 'tool', 'decision', 'result'].includes(String(step.stepType))) return null;
    if (!Array.isArray(step.inputRefs) || !step.inputRefs.every((item) => typeof item === 'string')) return null;
    if (!Array.isArray(step.evidenceRefs) || !step.evidenceRefs.every(isDigest)) return null;
    if (step.status !== 'accepted' && step.status !== 'rejected') return null;
    const outcome = step.outcome;
    if (
      typeof outcome !== 'string'
      && typeof outcome !== 'number'
      && typeof outcome !== 'boolean'
      && outcome !== null
      && asRecord(outcome) === null
    ) return null;
    steps.push(step as unknown as DecisionTraceStep);
  }

  return { version: 1, steps, finalEvent, status: 'accepted' };
}

const forbiddenKeys = new Set([
  'chainOfThought',
  'reasoningText',
  'hiddenReasoning',
  'code',
  'script',
  'providerInstruction',
  'providerSecret',
  'runtimeActorRef',
  'actorRef',
]);

export function containsForbiddenKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = containsForbiddenKey(item);
      if (found !== null) return found;
    }
    return null;
  }
  const record = asRecord(value);
  if (record === null) return null;
  for (const [key, item] of Object.entries(record)) {
    if (forbiddenKeys.has(key)) return key;
    const found = containsForbiddenKey(item);
    if (found !== null) return found;
  }
  return null;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  const record = asRecord(value);
  if (record === null) return value;
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, canonicalize(record[key])]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function digestValue(value: unknown): ContentDigest {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`;
}

function normalizedCandidateView(candidate: WorkflowCandidateDraft): Record<string, unknown> {
  const steps = Object.fromEntries(
    Object.entries(candidate.steps)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, step]) => [key, step]),
  );
  const edges = [...candidate.edges].sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right)));
  const allowedTools = [...candidate.allowedTools]
    .sort((left, right) => `${left.name}:${left.contractDigest}`.localeCompare(`${right.name}:${right.contractDigest}`));
  const referencedDomainDataDigests = [...candidate.referencedDomainDataDigests].sort();
  const applicability = {
    all: [...candidate.applicability.all]
      .sort((left, right) => canonicalJson(left).localeCompare(canonicalJson(right))),
  };
  const outputContract = {
    ...candidate.outputContract,
    allowedEvents: [...candidate.outputContract.allowedEvents].sort(),
  };

  return {
    kind: candidate.kind,
    candidateId: candidate.candidateId,
    inputContract: candidate.inputContract,
    outputContract,
    start: candidate.start,
    steps,
    edges,
    allowedTools,
    referencedDomainDataDigests,
    applicability,
    bounds: candidate.bounds,
  };
}

export function candidateContentDigest(candidate: WorkflowCandidateDraft): ContentDigest {
  return digestValue(normalizedCandidateView(candidate));
}

export function sealCandidate(draft: WorkflowCandidateDraft): WorkflowCandidate {
  return { ...draft, semanticDigest: candidateContentDigest(draft) };
}

export function candidateWithoutDigest(candidate: WorkflowCandidate): WorkflowCandidateDraft {
  const draft = { ...candidate } as unknown as Record<string, unknown>;
  delete draft.semanticDigest;
  return draft as unknown as WorkflowCandidateDraft;
}

function parseHarnessProposal(value: unknown): HarnessProposal | null {
  if (containsForbiddenKey(value) !== null) return null;
  const record = asRecord(value);
  if (record === null) return null;
  const keys = Object.keys(record).sort();
  const validKeys = keys.length === 2
    ? ['decision', 'decisionTrace']
    : ['candidate', 'decision', 'decisionTrace'];
  if (!hasExactKeys(record, validKeys)) return null;

  const decision = parseDomainDecision(record.decision);
  if (decision === null) return null;
  const decisionTrace = parseDecisionTrace(record.decisionTrace, decision);
  if (decisionTrace === null) return null;

  if (record.candidate === undefined) return { decision, decisionTrace };
  const candidate = record.candidate as WorkflowCandidate;
  const candidateRecord = asRecord(candidate);
  if (candidateRecord === null || candidateRecord.kind !== 'workflow-candidate-v1') return null;
  if (!isDigest(candidate.semanticDigest)) return null;
  if (candidateContentDigest(candidateWithoutDigest(candidate)) !== candidate.semanticDigest) return null;
  return { decision, decisionTrace, candidate };
}

function harnessResult(context: HarnessContext): HarnessResult {
  if (context.result === null) throw new Error('HarnessMachine completed without a result');
  return context.result;
}

const plannerTask = fromPromise<unknown, PlannerTaskInput>(
  async ({ input, signal }) => input.planner.generateStructured(input.input, signal),
);

export const HarnessMachine = setup({
  types: {
    context: {} as HarnessContext,
    input: {} as { planner: PlannerPort; input: Record<string, unknown> },
    output: {} as HarnessResult,
  },
  actors: { plannerTask },
  guards: {
    structuredResultValid: ({ context }) => parseHarnessProposal(context.raw) !== null,
  },
}).createMachine({
  id: 'research-harness-machine-with-workflow-candidate',
  initial: 'plan',
  context: ({ input }) => ({ planner: input.planner, input: input.input, raw: null, result: null }),
  output: ({ context }) => harnessResult(context),
  states: {
    plan: {
      invoke: {
        src: 'plannerTask',
        input: ({ context }) => ({ planner: context.planner, input: context.input }),
        onDone: {
          target: 'validateStructuredResult',
          actions: assign({ raw: ({ event }) => event.output }),
        },
        onError: {
          target: 'failed',
          actions: assign({
            result: ({ event }) => ({
              status: 'error',
              code: 'planner-error',
              message: errorMessage(event.error),
            }),
          }),
        },
      },
    },
    validateStructuredResult: {
      always: [
        {
          guard: 'structuredResultValid',
          target: 'succeeded',
          actions: assign({
            result: ({ context }) => {
              const parsed = parseHarnessProposal(context.raw);
              if (parsed === null) throw new Error('structuredResultValid guard disagreed with parser');
              return { status: 'ok', ...parsed };
            },
          }),
        },
        {
          target: 'failed',
          actions: assign({
            result: () => ({
              status: 'error',
              code: 'invalid-structured-result',
              message: 'Planner output failed structured result validation',
            }),
          }),
        },
      ],
    },
    succeeded: { type: 'final' },
    failed: { type: 'final' },
  },
});

