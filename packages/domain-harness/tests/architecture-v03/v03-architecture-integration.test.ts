import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CONSUMED_RESEARCH,
  DOMAIN_OUTCOMES,
  PROMOTED_SUBWORKFLOW_DIGEST,
  buildSemanticIdentity,
  digestValue,
  llmAvoidanceRate,
  makeRequest,
  sealCandidate,
  validateCandidate,
} from './v03-architecture-integration-core.js';
import type { PromotedWorkflowArtifact, WorkflowCandidateDraft } from './v03-architecture-integration-core.js';
import {
  HARNESS_DIRECT_ACTOR_ROLES,
  PROMOTED_KNOWN_SUBWORKFLOW,
  compilePromotedSubworkflow,
  createIntegrationRuntime,
  makeChangedWorkflowDigest,
  runDeterministicBatch,
  runDomainRequest,
} from './v03-architecture-integration-xstate.js';

function stateValue(snapshot: Awaited<ReturnType<typeof runDomainRequest>>): string {
  return String(snapshot.value);
}

test('records the exact research SHAs consumed by the integration fixture', () => {
  assert.deepEqual(CONSUMED_RESEARCH, {
    issue187: '3cb9aa6f0579087a793ee8c30bedf8cdd8a36387',
    issue194: '0ace38118f000c71641c3e1bf8a94276ef4cec60',
    issue195: '419269f788de1d46e24af8bea19b041c8e36760f',
    issue196: '7c6c7a63b643fbaa5051db8e403dd15f7721dce8',
  });
});

test('full resolver ordering reaches schema/guard/XState authority for rule, cache, subworkflow, and Harness paths', async () => {
  const runtime = createIntegrationRuntime();

  const ruled = await runDomainRequest(runtime, makeRequest({ country: 'BLOCKED', description: 'blocked' }));
  assert.equal(stateValue(ruled), 'rejected');
  assert.equal(runtime.model.calls, 0);

  const harnessed = await runDomainRequest(runtime, makeRequest({
    requestId: 'harness-seed',
    workflowInstanceId: 'workflow-seed',
    sourceMessageId: 'message-seed',
    effectId: 'effect-seed',
  }));
  assert.equal(stateValue(harnessed), 'quoteRequested');
  assert.equal(runtime.model.calls, 1);

  const cached = await runDomainRequest(runtime, makeRequest({
    requestId: 'cache-copy',
    workflowInstanceId: 'workflow-copy',
    sourceMessageId: 'message-copy',
    effectId: 'effect-copy',
    unrelatedContext: { uiTheme: 'light', telemetryTraceId: 'trace-copy' },
  }));
  assert.equal(stateValue(cached), 'quoteRequested');
  assert.equal(runtime.model.calls, 1);

  const subworkflow = await runDomainRequest(runtime, makeRequest({
    requestId: 'known-low',
    requestKind: 'known-rfq',
    accountId: 'acct-low',
    description: 'known low score',
  }));
  assert.equal(stateValue(subworkflow), 'moreInformationRequired');
  assert.equal(runtime.subworkflows.plannerCalls, 0);
  assert.equal(runtime.model.calls, 1);

  assert.equal(runtime.resolver.metrics.ruleResolved, 1);
  assert.equal(runtime.resolver.metrics.semanticCacheHits, 1);
  assert.equal(runtime.resolver.metrics.subworkflowResolved, 1);
  assert.equal(runtime.resolver.metrics.harnessModelRequired, 1);
});

test('semantic cache reuses an exact semantic decision across workflow/message identity and ignores unrelated context', async () => {
  const runtime = createIntegrationRuntime();
  const firstRequest = makeRequest();
  const secondRequest = makeRequest({
    requestId: 'request-b',
    workflowInstanceId: 'workflow-b',
    sourceMessageId: 'message-b',
    effectId: 'effect-b',
    unrelatedContext: { uiTheme: 'contrast', telemetryTraceId: 'trace-b' },
  });

  assert.equal(buildSemanticIdentity(firstRequest).digest, buildSemanticIdentity(secondRequest).digest);
  const first = await runtime.resolver.resolve(firstRequest);
  const second = await runtime.resolver.resolve(secondRequest);

  assert.equal(first.source, 'harness');
  assert.equal(second.source, 'semantic-cache');
  assert.equal(runtime.model.calls, 1);
  assert.equal(second.freshModelCalls, 0);
});

test('reusable promoted subworkflow executes without planner reconstruction and fails closed when artifact/applicability does not match', async () => {
  const runtime = createIntegrationRuntime();
  assert.equal(PROMOTED_KNOWN_SUBWORKFLOW.contentDigest, PROMOTED_SUBWORKFLOW_DIGEST);

  const resolved = await runtime.resolver.resolve(makeRequest({
    requestKind: 'known-rfq',
    accountId: 'acct-high',
    description: 'known high score unique',
  }));
  assert.equal(resolved.source, 'subworkflow');
  assert.equal(resolved.subworkflowArtifactDigest, PROMOTED_SUBWORKFLOW_DIGEST);
  assert.equal(runtime.subworkflows.plannerCalls, 0);
  assert.equal(runtime.model.calls, 0);

  const changedArtifact = await runtime.resolver.resolve(makeRequest({
    requestId: 'changed-artifact',
    requestKind: 'known-rfq',
    accountId: 'acct-other',
    description: 'changed artifact should fall through',
    subworkflowArtifactDigest: makeChangedWorkflowDigest(),
  }));
  assert.equal(changedArtifact.source, 'harness');
  assert.equal(runtime.model.calls, 1);

  const inapplicable = await runtime.resolver.resolve(makeRequest({
    requestId: 'wrong-country',
    requestKind: 'known-rfq',
    country: 'TH',
    accountId: 'acct-th',
    description: 'known pattern wrong country',
  }));
  assert.equal(inapplicable.source, 'harness');
  assert.equal(runtime.model.calls, 2);
});

test('genuinely unknown semantics use HarnessMachine and return a structured DecisionTrace rather than a state id', async () => {
  const runtime = createIntegrationRuntime();
  const result = await runtime.resolver.resolve(makeRequest({
    requestId: 'unknown',
    accountId: 'acct-unknown',
    description: 'novel technical request',
  }));

  assert.equal(result.source, 'harness');
  assert.equal(result.decision.type, 'TECHNICAL_REVIEW_REQUIRED');
  assert.ok(result.decisionTrace !== undefined);
  assert.equal(result.decisionTrace?.version, 1);
  assert.equal(result.decisionTrace?.finalEvent.type, 'TECHNICAL_REVIEW_REQUIRED');
  assert.equal('stateId' in result.decision, false);
  assert.deepEqual(HARNESS_DIRECT_ACTOR_ROLES, ['modelTask']);
});

test('cached decision still passes through current guard and a changed guard can reject transition', async () => {
  const runtime = createIntegrationRuntime();
  const first = await runDomainRequest(runtime, makeRequest({
    workflowInstanceId: 'guard-open',
    sourceMessageId: 'guard-open-message',
    effectId: 'guard-open-effect',
    quoteWindowOpen: true,
  }));
  assert.equal(stateValue(first), 'quoteRequested');
  assert.equal(runtime.model.calls, 1);

  const staleUnderCurrentGuard = await runDomainRequest(runtime, makeRequest({
    requestId: 'guard-closed',
    workflowInstanceId: 'guard-closed',
    sourceMessageId: 'guard-closed-message',
    effectId: 'guard-closed-effect',
    quoteWindowOpen: false,
  }));
  assert.equal(stateValue(staleUnderCurrentGuard), 'guardRejected');
  assert.equal(runtime.model.calls, 1);
  assert.equal(runtime.resolver.metrics.semanticCacheHits, 1);
});

test('time-sensitive/non-cacheable invocation bypasses semantic reuse', async () => {
  const runtime = createIntegrationRuntime();
  const request = makeRequest({ accountId: 'acct-live', description: 'live technical request', timeSensitive: true });
  const first = await runtime.resolver.resolve(request);
  const second = await runtime.resolver.resolve(makeRequest({
    ...request,
    requestId: 'live-second',
    workflowInstanceId: 'live-workflow-second',
    sourceMessageId: 'live-message-second',
    effectId: 'live-effect-second',
  }));

  assert.equal(first.source, 'harness');
  assert.equal(second.source, 'harness');
  assert.equal(runtime.model.calls, 2);
  assert.equal(runtime.resolver.metrics.semanticCacheBypasses, 2);
});

test('content invalidation is scoped: semantic content changes cache identity, workflow artifact change only invalidates subworkflow selection', () => {
  const base = makeRequest();
  const changedRule = makeRequest({
    semanticContent: {
      rule: digestValue({ rule: 'blocked-country', revision: 2 }),
    },
  });
  const changedWorkflow = makeRequest({ subworkflowArtifactDigest: makeChangedWorkflowDigest() });

  assert.notEqual(buildSemanticIdentity(base).digest, buildSemanticIdentity(changedRule).digest);
  assert.equal(buildSemanticIdentity(base).digest, buildSemanticIdentity(changedWorkflow).digest);
});

test('invalid WorkflowCandidate cannot become executable without deterministic validation and explicit promotion', () => {
  const invalidDraft: WorkflowCandidateDraft = {
    kind: 'workflow-candidate-v1',
    candidateId: 'bad-candidate',
    applicability: { requestKind: 'known-rfq', country: 'MM' },
    queryTool: 'unknown_tool',
    threshold: 70,
    highOutcome: 'ILLEGAL_EVENT',
    lowOutcome: DOMAIN_OUTCOMES[2],
    cycle: true,
    arbitraryCode: 'eval(userInput)',
  };
  const invalid = sealCandidate(invalidDraft);
  const validation = validateCandidate(invalid);
  assert.equal(validation.status, 'invalid');
  if (validation.status === 'invalid') {
    assert.ok(validation.errors.some((item) => item.includes('unknown tool')));
    assert.ok(validation.errors.some((item) => item.includes('illegal event')));
    assert.ok(validation.errors.some((item) => item.includes('cycles')));
    assert.ok(validation.errors.some((item) => item.includes('arbitrary executable code')));
  }

  const runtime = createIntegrationRuntime();
  assert.throws(
    () => compilePromotedSubworkflow(invalid as unknown as PromotedWorkflowArtifact, runtime.scorePort),
    /not executable/,
  );
});

test('cached reasoning never implies mutation execution; every mutation stays behind durable effect authority', async () => {
  const runtime = createIntegrationRuntime();
  const first = await runtime.resolver.resolve(makeRequest({ effectId: 'mutation-a' }));
  const cached = await runtime.resolver.resolve(makeRequest({
    requestId: 'mutation-copy',
    workflowInstanceId: 'mutation-workflow-copy',
    sourceMessageId: 'mutation-message-copy',
    effectId: 'mutation-b',
  }));

  assert.equal(first.source, 'harness');
  assert.equal(cached.source, 'semantic-cache');
  assert.equal(runtime.effects.applications, 0);

  const applied = runtime.effects.execute('mutation-b', cached.decision);
  assert.ok(applied !== null);
  assert.equal(runtime.effects.applications, 1);
  runtime.effects.execute('mutation-b', cached.decision);
  assert.equal(runtime.effects.applications, 1);

  const anotherCached = await runtime.resolver.resolve(makeRequest({
    requestId: 'mutation-third',
    workflowInstanceId: 'mutation-workflow-third',
    sourceMessageId: 'mutation-message-third',
    effectId: 'mutation-c',
  }));
  assert.equal(anotherCached.source, 'semantic-cache');
  runtime.effects.execute('mutation-c', anotherCached.decision);
  assert.equal(runtime.effects.applications, 2);
});

test('deterministic batch records LLM avoidance metrics', async () => {
  const runtime = createIntegrationRuntime();
  await runDeterministicBatch(runtime);
  const metrics = runtime.resolver.metrics;

  assert.equal(metrics.totalDomainDecisions, 8);
  assert.equal(metrics.ruleResolved, 2);
  assert.equal(metrics.semanticCacheHits, 1);
  assert.equal(metrics.semanticCacheMisses, 4);
  assert.equal(metrics.semanticCacheBypasses, 1);
  assert.equal(metrics.subworkflowResolved, 2);
  assert.equal(metrics.subworkflowMatches, 2);
  assert.equal(metrics.subworkflowMisses, 3);
  assert.equal(metrics.harnessModelRequired, 3);
  assert.equal(metrics.actualModelCallCount, 3);
  assert.equal(metrics.llmAvoidedDecisions, 5);
  assert.equal(runtime.model.calls, 3);
  assert.equal(runtime.subworkflows.plannerCalls, 0);
  assert.equal(llmAvoidanceRate(metrics), 0.625);
});
