/** v0.10.3 T-A: strict neutral DTO positive/negative, no provider or K Effects. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertLlmGenerateRequestV1, assertLlmGenerateResultV1,
  isLlmGenerateRequestV1, isLlmGenerateResultV1,
} from '../../packages/contracts/src/llm-generate-v1-guards.js';
import { LLM_GENERATE_CONTRACT_V1 } from '../../packages/contracts/src/llm-generate-v1.js';

const base = () => ({
  contractVersion: LLM_GENERATE_CONTRACT_V1,
  requestId: 'local-run-1',
  modelId: 'approved-model',
  deadlineUnixMs: 1790000000000,
  messages: [{role: 'user', content: 'test'}],
  maxOutputTokens: 200,
  outputFormat: 'text',
});
const result = () => ({
  contractVersion: LLM_GENERATE_CONTRACT_V1,
  requestId: 'local-run-1',
  providerKind: 'openai-compatible',
  modelId: 'approved-model',
  status: 'completed',
  text: 'ok',
  finishReason: 'stop',
  usage: { evidenceMode: 'unavailable' },
});
const failure = (status: string, errorCategory: string, reasonCode: string) => ({
  contractVersion: LLM_GENERATE_CONTRACT_V1,
  requestId: 'local-run-1',
  providerKind: 'openai-compatible',
  modelId: 'approved-model',
  status, errorCategory, reasonCode,
  usage: { evidenceMode: 'unavailable' },
});
const invalid = (f: () => unknown, label: string) =>
  test(label, () => assert.throws(() => assertLlmGenerateRequestV1(f()), /LLM_CONTRACT_INVALID/));
const invalidResult = (f: () => unknown, label: string) =>
  test(label, () => assert.throws(() => assertLlmGenerateResultV1(f()), /LLM_CONTRACT_INVALID/));

test('positive: approved neutral text/JSON request', () => {
  assertLlmGenerateRequestV1(base());
  assertLlmGenerateRequestV1({...base(), outputFormat: 'json', temperature: 0.4, outputSchemaRef:'catalog:s1'});
  assert.equal(isLlmGenerateRequestV1(base()), true);
});
test('positive: both provider result variants and unavailable usage', () => {
  assertLlmGenerateResultV1(result());
  assertLlmGenerateResultV1({...result(), providerKind:'anthropic-messages',
    status:'completed', finishReason:'tool_proposal',
    toolProposals:[{name:'suggest', argumentsJson:'{"name":"x"}'}]});
  assertLlmGenerateResultV1({...result(), usage:{evidenceMode:'provider-reported',inputTokens:21,outputTokens:5}});
  assertLlmGenerateResultV1(failure('unknown', 'OUTCOME_UNKNOWN', 'REMOTE_AMBIGUOUS'));
  assertLlmGenerateResultV1(failure('refused', 'DEADLINE', 'DEADLINE_BEFORE_DISPATCH'));
});
invalid(() => ({...base(), messages:[]}), 'negative: zero messages');
invalid(() => ({...base(), messages:Array(33).fill({role:'user',content:'x'})}), 'negative: oversized message list');
invalid(() => ({...base(), messages:[{role:'system',content:'x'.repeat(32769)}]}), 'negative: oversized message');
invalid(() => ({...base(), messages:[{role:'user',content:'x'.repeat(32768)},{role:'user',content:'x'.repeat(32768)},{role:'user',content:'x'}]}), 'negative: aggregate content');
invalid(() => ({...base(), modelId:''}), 'negative: model not specified');
invalid(() => ({...base(), deadlineUnixMs: Number.NaN}), 'negative: deadline non-finite');
invalid(() => ({...base(), maxOutputTokens:8193}), 'negative: output limit');
invalid(() => ({...base(), temperature:1.1}), 'negative: temperature limit');
invalid(() => ({...base(), arbitraryToken:'secret'}), 'negative: unrecognized key');
invalid(() => ({...base(), outputSchemaRef:''}), 'negative: empty schema ref');
invalidResult(() => ({...result(), usage:{evidenceMode:'unavailable',inputTokens:0}}), 'negative: unavailable token usage may not fabricate zero');
invalidResult(() => ({...result(), usage:{evidenceMode:'provider-reported',inputTokens:-1,outputTokens:2}}), 'negative: negative token usage');
invalidResult(() => ({...result(), providerKind:'other'}), 'negative: unknown provider');
invalidResult(() => ({...result(), status:'completed', finishReason:'tool_proposal'}), 'negative: missing tool proposals');
invalidResult(() => ({...result(), toolProposals:[{name:'x',argumentsJson:'not-json'}]}), 'negative: malformed tool proposal');
invalidResult(() => ({...result(), toolProposals:Array(9).fill({name:'x',argumentsJson:'{}'})}), 'negative: too many tool proposals');
invalidResult(() => (failure('unknown', 'DEADLINE', 'REMOTE_TIMEOUT')), 'negative: ambiguous result not classified OUTCOME_UNKNOWN');
invalidResult(() => (failure('failed', 'OUTCOME_UNKNOWN', 'REMOTE_FAILED')), 'negative: OUTCOME_UNKNOWN cannot be terminal failure');
invalidResult(() => (failure('failed', 'AUTH_DENIED', 'raw sdk: secret')), 'negative: no raw exception messages');
test('negative: type guards return false without leaking raw data', () => {
  assert.equal(isLlmGenerateResultV1({...result(), status:'success'}), false);
  assert.equal(isLlmGenerateRequestV1({...base(), requestId:''}), false);
});
