import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateContentDigest,
  digestValue,
  sealCandidate,
  type DomainDecision,
  type PlannerPort,
  type PromotedWorkflowArtifact,
  type WorkflowCandidate,
} from './subworkflow-compilation-model.js';
import { compilePromotedWorkflow } from './subworkflow-compilation-compiler.js';
import { promoteCandidate, validateCandidate } from './subworkflow-compilation-validation.js';
import {
  baseDraft,
  decision,
  environment,
  lookupContractDigest,
  queryRuntime,
  runHarness,
  trace,
  validateOrThrow,
} from './subworkflow-compilation-fixture.js';

test('S5: a candidate that references an unknown tool is rejected', () => {
  const draft = baseDraft();
  draft.allowedTools = [{ name: 'unknown_tool', capability: 'query', contractDigest: lookupContractDigest }];
  const lookup = draft.steps.lookup;
  if (lookup?.kind !== 'query') throw new Error('fixture mismatch');
  lookup.tool = 'unknown_tool';
  const result = validateCandidate(sealCandidate(draft), environment);
  assert.equal(result.status, 'invalid');
  if (result.status === 'invalid') assert.match(result.errors.join('\n'), /unknown tool/);
});

test('S6: arbitrary executable code or provider-specific instruction is rejected', () => {
  const candidate = sealCandidate(baseDraft()) as WorkflowCandidate & { providerInstruction?: string };
  candidate.providerInstruction = 'execute arbitrary provider prompt';
  const result = validateCandidate(candidate, environment);
  assert.equal(result.status, 'invalid');
  if (result.status === 'invalid') assert.match(result.errors.join('\n'), /forbidden field: providerInstruction/);

  const draft = baseDraft();
  const lookup = draft.steps.lookup as unknown as Record<string, unknown>;
  lookup.code = 'return process.env.SECRET';
  const codeCandidate = sealCandidate(draft);
  const codeResult = validateCandidate(codeCandidate, environment);
  assert.equal(codeResult.status, 'invalid');
  if (codeResult.status === 'invalid') assert.match(codeResult.errors.join('\n'), /forbidden field: code/);
});

test('S7: a candidate that emits an illegal Domain Event is rejected', () => {
  const draft = baseDraft();
  const emitQuote = draft.steps.emit_quote;
  if (emitQuote?.kind !== 'emit') throw new Error('fixture mismatch');
  emitQuote.event = 'APPROVED' as DomainDecision['type'];
  draft.outputContract.allowedEvents = ['TECHNICAL_REVIEW_REQUIRED', 'APPROVED' as DomainDecision['type']];
  const result = validateCandidate(sealCandidate(draft), environment);
  assert.equal(result.status, 'invalid');
  if (result.status === 'invalid') assert.match(result.errors.join('\n'), /illegal Domain Event|output contract allows illegal event/);
});

test('S8: an unbounded/control cycle is rejected under the spike rule that all cycles are illegal', () => {
  const draft = baseDraft();
  const route = draft.steps.route;
  if (route?.kind !== 'rule') throw new Error('fixture mismatch');
  route.onFalse = 'lookup';
  draft.edges = [
    { from: 'lookup', label: 'next', to: 'route' },
    { from: 'route', label: 'true', to: 'emit_review' },
    { from: 'route', label: 'false', to: 'lookup' },
  ];
  delete draft.steps.emit_quote;
  draft.bounds.maxSteps = 3;
  const result = validateCandidate(sealCandidate(draft), environment);
  assert.equal(result.status, 'invalid');
  if (result.status === 'invalid') assert.match(result.errors.join('\n'), /cycle/);
});


test('S10: content-identical candidates keep a stable digest across source-path and declaration-order relocation', () => {
  const first = sealCandidate(baseDraft());
  const relocated = baseDraft();
  relocated.sourceLocation = 'other/folder/candidate.json';
  relocated.steps = {
    emit_quote: relocated.steps.emit_quote!,
    route: relocated.steps.route!,
    emit_review: relocated.steps.emit_review!,
    lookup: relocated.steps.lookup!,
  };
  relocated.edges = [...relocated.edges].reverse();
  relocated.referencedDomainDataDigests = [...relocated.referencedDomainDataDigests].reverse();
  relocated.outputContract.allowedEvents = [...relocated.outputContract.allowedEvents].reverse();
  relocated.applicability.all = [...relocated.applicability.all].reverse();
  const second = sealCandidate(relocated);

  assert.equal(first.semanticDigest, second.semanticDigest);
  assert.equal(candidateContentDigest(first), first.semanticDigest);
});

test('S11: behaviorally relevant rule/tool contract changes change the semantic content digest', () => {
  const original = sealCandidate(baseDraft());
  const changedRule = baseDraft();
  const route = changedRule.steps.route;
  if (route?.kind !== 'rule') throw new Error('fixture mismatch');
  route.value = 80;
  const changedRuleCandidate = sealCandidate(changedRule);

  const changedTool = baseDraft();
  changedTool.allowedTools[0] = {
    name: 'lookup_account_score',
    capability: 'query',
    contractDigest: digestValue({ tool: 'lookup_account_score', input: 'accountId:string', output: 'score:number', revision: 2 }),
  };
  const changedToolCandidate = sealCandidate(changedTool);

  assert.notEqual(original.semanticDigest, changedRuleCandidate.semanticDigest);
  assert.notEqual(original.semanticDigest, changedToolCandidate.semanticDigest);
});

test('S12: candidate -> validated -> promoted is explicit; compiler rejects a merely validated candidate', () => {
  const candidate = sealCandidate(baseDraft());
  const validated = validateOrThrow(candidate);

  assert.throws(
    () => compilePromotedWorkflow(validated as unknown as PromotedWorkflowArtifact, { tools: queryRuntime() }),
    /explicitly promoted/,
  );

  const artifact = promoteCandidate(validated, {
    selectedBy: 'human-or-policy-selection',
    evidenceRef: 'issue-196-acceptance',
  });
  assert.equal(artifact.kind, 'promoted-workflow-v1');
  assert.equal(artifact.contentDigest, candidate.semanticDigest);
});

test('S13: mutation capability cannot be smuggled into the reusable workflow and must remain outside the research compiler', () => {
  const candidate = sealCandidate(baseDraft()) as unknown as Record<string, unknown>;
  const tools = candidate.allowedTools as Array<Record<string, unknown>>;
  tools[0] = { ...tools[0], capability: 'mutation' };
  const result = validateCandidate(candidate, environment);
  assert.equal(result.status, 'invalid');
  if (result.status === 'invalid') assert.match(result.errors.join('\n'), /forbidden mutation capability/);
});

test('S14: HarnessMachine rejects free-form private reasoning fields instead of storing or executing them', async () => {
  const planner: PlannerPort = {
    async generateStructured(): Promise<unknown> {
      const finalEvent = decision('QUOTE_REQUESTED', 'structured_only');
      return {
        decision: finalEvent,
        decisionTrace: trace(finalEvent),
        chainOfThought: 'private reasoning must never be accepted by this contract',
      };
    },
  };
  const snapshot = await runHarness(planner);
  assert.deepEqual(snapshot.output, {
    status: 'error',
    code: 'invalid-structured-result',
    message: 'Planner output failed structured result validation',
  });
});
