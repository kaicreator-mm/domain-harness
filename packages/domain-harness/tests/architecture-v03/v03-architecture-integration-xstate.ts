import { assign, createActor, fromPromise, setup, toPromise } from 'xstate';
import {
  DEFAULT_DOMAIN_DATA,
  DecisionResolver,
  DurableEffectAuthority,
  PROMOTED_SUBWORKFLOW_DIGEST,
  SemanticDecisionCache,
  digestValue,
  makeRequest,
  promoteCandidate,
  sealCandidate,
  validateCandidate,
  validateDomainDecision,
} from './v03-architecture-integration-core.js';
import type {
  ContentDigest,
  DecisionTrace,
  DomainDecision,
  DomainRequest,
  HarnessResolution,
  HarnessResolver,
  PromotedWorkflowArtifact,
  ReusableSubworkflowResolver,
  SubworkflowResolution,
  WorkflowCandidateDraft,
} from './v03-architecture-integration-core.js';

export interface ModelPort {
  generate(request: DomainRequest, signal: AbortSignal): Promise<DomainDecision>;
}

export class FakeModelPort implements ModelPort {
  calls = 0;

  async generate(request: DomainRequest, signal: AbortSignal): Promise<DomainDecision> {
    if (signal.aborted) throw new Error('model call aborted');
    this.calls += 1;
    if (request.description.includes('custom quote')) {
      return {
        type: 'QUOTE_REQUESTED',
        payload: {
          reasonCode: 'model_custom_quote',
          proposedMutation: {
            kind: 'CREATE_QUOTE',
            quoteKey: `${request.cacheScope}:${request.accountId}`,
          },
        },
      };
    }
    return {
      type: 'TECHNICAL_REVIEW_REQUIRED',
      payload: { reasonCode: 'model_unknown_requires_review' },
    };
  }
}

interface HarnessContext {
  request: DomainRequest;
  model: ModelPort;
  decision: DomainDecision | null;
  decisionTrace: DecisionTrace | null;
}

interface ModelTaskInput {
  request: DomainRequest;
  model: ModelPort;
}

const modelTask = fromPromise<DomainDecision, ModelTaskInput>(
  async ({ input, signal }) => input.model.generate(input.request, signal),
);

function requireHarnessOutput(context: HarnessContext): HarnessResolution {
  if (context.decision === null || context.decisionTrace === null) {
    throw new Error('HarnessMachine completed without structured output');
  }
  return {
    decision: context.decision,
    decisionTrace: context.decisionTrace,
    modelCalls: 1,
  };
}

export const HARNESS_DIRECT_ACTOR_ROLES = ['modelTask'] as const;

export const HarnessMachine = setup({
  types: {
    context: {} as HarnessContext,
    input: {} as { request: DomainRequest; model: ModelPort },
    output: {} as HarnessResolution,
  },
  actors: { modelTask },
  guards: {
    structuredDecisionValid: ({ context }) => validateDomainDecision(context.decision),
  },
}).createMachine({
  id: 'v03-integration-harness-machine',
  initial: 'model',
  context: ({ input }) => ({
    request: input.request,
    model: input.model,
    decision: null,
    decisionTrace: null,
  }),
  output: ({ context }) => requireHarnessOutput(context),
  states: {
    model: {
      invoke: {
        src: 'modelTask',
        input: ({ context }) => ({ request: context.request, model: context.model }),
        onDone: {
          target: 'validate',
          actions: assign({
            decision: ({ event }) => event.output,
            decisionTrace: ({ context, event }) => ({
              version: 1,
              steps: [
                {
                  stepId: 'semantic-input',
                  kind: 'input',
                  evidenceRefs: [digestValue({
                    requestKind: context.request.requestKind,
                    country: context.request.country,
                    accountId: context.request.accountId,
                    description: context.request.description,
                  })],
                  outcome: 'unresolved-by-rule-cache-subworkflow',
                },
                {
                  stepId: 'model-call',
                  kind: 'model',
                  evidenceRefs: [DEFAULT_DOMAIN_DATA.compiledIntelligence.semantic.harnessPolicy],
                  outcome: event.output.type,
                },
                {
                  stepId: 'structured-domain-event',
                  kind: 'decision',
                  evidenceRefs: [DEFAULT_DOMAIN_DATA.compiledIntelligence.semantic.outputContract],
                  outcome: event.output.type,
                },
              ],
              finalEvent: event.output,
            }),
          }),
        },
        onError: { target: 'failed' },
      },
    },
    validate: {
      always: [
        { guard: 'structuredDecisionValid', target: 'succeeded' },
        { target: 'failed' },
      ],
    },
    succeeded: { type: 'final' },
    failed: { type: 'final' },
  },
});

export class XStateHarnessResolver implements HarnessResolver {
  constructor(private readonly model: ModelPort) {}

  async resolve(request: DomainRequest): Promise<HarnessResolution> {
    const actor = createActor(HarnessMachine, { input: { request, model: this.model } });
    actor.start();
    const result = await toPromise(actor) as HarnessResolution;
    if (!validateDomainDecision(result.decision)) throw new Error('HarnessMachine returned an invalid structured decision');
    return result;
  }
}

export interface AccountScorePort {
  lookup(accountId: string, signal: AbortSignal): Promise<number>;
}

export class DeterministicAccountScorePort implements AccountScorePort {
  calls = 0;
  constructor(private readonly scores: Readonly<Record<string, number>> = { 'acct-high': 85, 'acct-low': 35 }) {}

  async lookup(accountId: string, signal: AbortSignal): Promise<number> {
    if (signal.aborted) throw new Error('account score lookup aborted');
    this.calls += 1;
    return this.scores[accountId] ?? 50;
  }
}

const KNOWN_SUBWORKFLOW_DRAFT: WorkflowCandidateDraft = {
  kind: 'workflow-candidate-v1',
  candidateId: 'known-rfq-score-v1',
  applicability: {
    requestKind: 'known-rfq',
    country: 'MM',
  },
  queryTool: 'lookup_account_score',
  threshold: 70,
  highOutcome: 'QUOTE_REQUESTED',
  lowOutcome: 'MORE_INFORMATION_REQUIRED',
  cycle: false,
};

const sealedKnownCandidate = sealCandidate(KNOWN_SUBWORKFLOW_DRAFT);
const knownValidation = validateCandidate(sealedKnownCandidate);
if (knownValidation.status !== 'valid') throw new Error(`known research candidate invalid: ${knownValidation.errors.join(', ')}`);

export const PROMOTED_KNOWN_SUBWORKFLOW = promoteCandidate(
  knownValidation.value,
  'architecture-research',
  'issue-196-validated-reference',
);

if (PROMOTED_KNOWN_SUBWORKFLOW.contentDigest !== PROMOTED_SUBWORKFLOW_DIGEST) {
  throw new Error('integration subworkflow digest drifted from the recorded reference contract');
}

interface SubworkflowContext {
  request: DomainRequest;
  scorePort: AccountScorePort;
  score: number | null;
  decision: DomainDecision | null;
}

interface ScoreTaskInput {
  accountId: string;
  scorePort: AccountScorePort;
}

const scoreTask = fromPromise<number, ScoreTaskInput>(
  async ({ input, signal }) => input.scorePort.lookup(input.accountId, signal),
);

function requireSubworkflowDecision(context: SubworkflowContext): DomainDecision {
  if (context.decision === null) throw new Error('reusable subworkflow completed without decision');
  return context.decision;
}

function artifactApplicable(artifact: PromotedWorkflowArtifact, request: DomainRequest): boolean {
  return artifact.candidate.applicability.requestKind === request.requestKind
    && artifact.candidate.applicability.country === request.country;
}

export function compilePromotedSubworkflow(
  artifact: PromotedWorkflowArtifact,
  scorePort: AccountScorePort,
) {
  if (artifact.kind !== 'promoted-workflow-v1') throw new Error('raw or merely validated candidates are not executable');
  if (artifact.contentDigest !== artifact.candidate.semanticDigest) throw new Error('promoted artifact digest mismatch');
  const revalidation = validateCandidate(artifact.candidate);
  if (revalidation.status !== 'valid') throw new Error(`promoted artifact failed current validation: ${revalidation.errors.join(', ')}`);

  return setup({
    types: {
      context: {} as SubworkflowContext,
      input: {} as DomainRequest,
      output: {} as DomainDecision,
    },
    actors: { scoreTask },
    guards: {
      highScore: ({ context }) => context.score !== null && context.score >= artifact.candidate.threshold,
    },
  }).createMachine({
    id: `compiled-${artifact.candidate.candidateId}`,
    initial: 'lookup',
    context: ({ input }) => ({ request: input, scorePort, score: null, decision: null }),
    output: ({ context }) => requireSubworkflowDecision(context),
    states: {
      lookup: {
        invoke: {
          src: 'scoreTask',
          input: ({ context }) => ({ accountId: context.request.accountId, scorePort: context.scorePort }),
          onDone: {
            target: 'route',
            actions: assign({ score: ({ event }) => event.output }),
          },
          onError: { target: 'failed' },
        },
      },
      route: {
        always: [
          {
            guard: 'highScore',
            target: 'succeeded',
            actions: assign({
              decision: ({ context }) => ({
                type: artifact.candidate.highOutcome as DomainDecision['type'],
                payload: {
                  reasonCode: 'promoted_subworkflow_high_score',
                  proposedMutation: {
                    kind: 'CREATE_QUOTE',
                    quoteKey: `${context.request.cacheScope}:${context.request.accountId}`,
                  },
                },
              }),
            }),
          },
          {
            target: 'succeeded',
            actions: assign({
              decision: () => ({
                type: artifact.candidate.lowOutcome as DomainDecision['type'],
                payload: { reasonCode: 'promoted_subworkflow_low_score' },
              }),
            }),
          },
        ],
      },
      succeeded: { type: 'final' },
      failed: { type: 'final' },
    },
  });
}

export class PromotedSubworkflowResolver implements ReusableSubworkflowResolver {
  plannerCalls = 0;

  constructor(
    private readonly scorePort: AccountScorePort,
    private readonly artifact: PromotedWorkflowArtifact = PROMOTED_KNOWN_SUBWORKFLOW,
  ) {}

  async resolve(request: DomainRequest): Promise<SubworkflowResolution> {
    const requestedDigest = request.subworkflowArtifactDigest ?? this.artifact.contentDigest;
    if (requestedDigest !== this.artifact.contentDigest) {
      return { status: 'not-found', plannerCalls: 0, modelCalls: 0 };
    }
    if (!artifactApplicable(this.artifact, request)) {
      return { status: 'not-applicable', plannerCalls: 0, modelCalls: 0 };
    }

    const machine = compilePromotedSubworkflow(this.artifact, this.scorePort);
    const actor = createActor(machine, { input: request });
    actor.start();
    const decision = await toPromise(actor) as DomainDecision;
    if (!validateDomainDecision(decision)) throw new Error('compiled subworkflow returned invalid decision');
    return {
      status: 'resolved',
      decision,
      artifactDigest: this.artifact.contentDigest,
      plannerCalls: 0,
      modelCalls: 0,
    };
  }
}

interface DomainMachineContext {
  request: DomainRequest;
  resolver: DecisionResolver;
  resolution: Awaited<ReturnType<DecisionResolver['resolve']>> | null;
}

interface ResolveTaskInput {
  request: DomainRequest;
  resolver: DecisionResolver;
}

const resolveDecisionTask = fromPromise<Awaited<ReturnType<DecisionResolver['resolve']>>, ResolveTaskInput>(
  async ({ input }) => input.resolver.resolve(input.request),
);

export function createDomainMachine(resolver: DecisionResolver) {
  return setup({
    types: {
      context: {} as DomainMachineContext,
      input: {} as DomainRequest,
    },
    actors: { resolveDecisionTask },
    guards: {
      resolutionValid: ({ context }) => context.resolution !== null && validateDomainDecision(context.resolution.decision),
      isTechnicalReview: ({ context }) => context.resolution?.decision.type === 'TECHNICAL_REVIEW_REQUIRED',
      isMoreInformation: ({ context }) => context.resolution?.decision.type === 'MORE_INFORMATION_REQUIRED',
      isRejected: ({ context }) => context.resolution?.decision.type === 'REJECTED',
    },
  }).createMachine({
    id: 'v03-integrated-domain-machine',
    initial: 'evaluating',
    context: ({ input }) => ({ request: input, resolver, resolution: null }),
    states: {
      evaluating: {
        invoke: {
          src: 'resolveDecisionTask',
          input: ({ context }) => ({ request: context.request, resolver: context.resolver }),
          onDone: {
            target: 'schemaAndGuardAuthority',
            actions: assign({ resolution: ({ event }) => event.output }),
          },
          onError: { target: 'failed' },
        },
      },
      schemaAndGuardAuthority: {
        always: [
          { guard: 'resolutionValid', target: 'route' },
          { target: 'failed' },
        ],
      },
      route: {
        always: [
          { guard: 'isTechnicalReview', target: 'technicalReviewRequired' },
          {
            guard: ({ context }) => context.resolution?.decision.type === 'QUOTE_REQUESTED' && context.request.quoteWindowOpen,
            target: 'quoteRequested',
          },
          {
            guard: ({ context }) => context.resolution?.decision.type === 'QUOTE_REQUESTED' && !context.request.quoteWindowOpen,
            target: 'guardRejected',
          },
          { guard: 'isMoreInformation', target: 'moreInformationRequired' },
          { guard: 'isRejected', target: 'rejected' },
          { target: 'failed' },
        ],
      },
      technicalReviewRequired: { type: 'final' },
      quoteRequested: { type: 'final' },
      moreInformationRequired: { type: 'final' },
      rejected: { type: 'final' },
      guardRejected: { type: 'final' },
      failed: { type: 'final' },
    },
  });
}

export interface IntegrationRuntime {
  cache: SemanticDecisionCache;
  model: FakeModelPort;
  scorePort: DeterministicAccountScorePort;
  harness: XStateHarnessResolver;
  subworkflows: PromotedSubworkflowResolver;
  resolver: DecisionResolver;
  effects: DurableEffectAuthority;
}

export function createIntegrationRuntime(): IntegrationRuntime {
  const cache = new SemanticDecisionCache();
  const model = new FakeModelPort();
  const scorePort = new DeterministicAccountScorePort();
  const harness = new XStateHarnessResolver(model);
  const subworkflows = new PromotedSubworkflowResolver(scorePort);
  const resolver = new DecisionResolver(cache, subworkflows, harness);
  return {
    cache,
    model,
    scorePort,
    harness,
    subworkflows,
    resolver,
    effects: new DurableEffectAuthority(),
  };
}

export async function runDomainRequest(runtime: IntegrationRuntime, request: DomainRequest) {
  const machine = createDomainMachine(runtime.resolver);
  const actor = createActor(machine, { input: request });
  actor.start();
  await toPromise(actor);
  return actor.getSnapshot();
}

export async function runDeterministicBatch(runtime: IntegrationRuntime): Promise<void> {
  const requests: DomainRequest[] = [
    makeRequest({ requestId: 'rule-1', country: 'BLOCKED', description: 'blocked request' }),
    makeRequest({ requestId: 'cache-seed', workflowInstanceId: 'workflow-seed', sourceMessageId: 'message-seed', effectId: 'effect-seed' }),
    makeRequest({
      requestId: 'cache-hit',
      workflowInstanceId: 'workflow-second',
      sourceMessageId: 'message-second',
      effectId: 'effect-second',
      unrelatedContext: { uiTheme: 'light', telemetryTraceId: 'trace-second' },
    }),
    makeRequest({ requestId: 'subworkflow-high', requestKind: 'known-rfq', accountId: 'acct-high', description: 'known high score' }),
    makeRequest({ requestId: 'harness-novel', accountId: 'acct-novel', description: 'novel technical request' }),
    makeRequest({ requestId: 'time-sensitive', accountId: 'acct-time', description: 'time-sensitive technical request', timeSensitive: true }),
    makeRequest({ requestId: 'rule-2', country: 'BLOCKED', description: 'blocked request two' }),
    makeRequest({ requestId: 'subworkflow-low', requestKind: 'known-rfq', accountId: 'acct-low', description: 'known low score' }),
  ];

  for (const request of requests) {
    await runDomainRequest(runtime, request);
  }
}

export function makeChangedWorkflowDigest(): ContentDigest {
  return digestValue({ promotedWorkflow: 'known-rfq-score-v2', threshold: 75 });
}
