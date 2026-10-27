/** Issue #1417: physically controlled Anthropic Messages fake endpoint, no paid API. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { assertLlmGenerateRequestV1, assertLlmGenerateResultV1 } from '../../packages/contracts/src/llm-generate-v1-guards.js';
import { createTrustedAnthropicMessagesClient } from '../../packages/host-node/src/llm/providers/anthropic/client.js';
import type { TrustedAnthropicHost } from '../../packages/host-node/src/llm/providers/anthropic/client.js';
import { generate, CAPABILITY_ID, HANDLERS, EXTERNAL_EFFECT } from '../../domain-packages/capabilities/llm-anthropic-messages/modules/capability-llm-anthropic-messages.mjs';

const modelId = 'claude-test-approved';
const now = 1800000000000;
const request = () => ({ contractVersion: 'dh.llm.generate/1', requestId: 'local-1', modelId,
  deadlineUnixMs: now + 15000, maxOutputTokens: 250, outputFormat: 'text',
  messages: [{ role: 'system', content: 'act safely' }, { role: 'user', content: 'hello' }] });
const response = (extra: Record<string, unknown> = {}) => ({
  id: 'msg_test', type: 'message', role: 'assistant', stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'hello back' }], usage: { input_tokens: 15, output_tokens: 7 }, ...extra,
});
type Reply = { status?: number; body?: unknown; hold?: boolean };
async function fixture(reply: Reply = {}) {
  const seen: { method: string; headers: Record<string, unknown>; body: unknown }[] = [];
  const server = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += String(chunk);
    seen.push({ method: req.method ?? '', headers: req.headers, body: JSON.parse(raw) });
    if (reply.hold) return;
    res.writeHead(reply.status ?? 200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(reply.body ?? response()));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('bad server');
  const endpoint = `http://127.0.0.1:${address.port}/v1/messages`;
  const host: TrustedAnthropicHost = { modelId, apiKey: 'test-not-a-real-secret',
    endpoint, allowLoopbackForTest: true, now: () => now, fetchTransport: fetch,
    assertRequest: assertLlmGenerateRequestV1, assertResult: assertLlmGenerateResultV1 };
  return { host, seen, endpoint, close: async () => { server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}

test('C descriptor is Anthropic-only and requires immutable Host port', async () => {
  assert.equal(CAPABILITY_ID, 'llm.anthropic');
  assert.equal(EXTERNAL_EFFECT, true);
  assert.deepEqual(HANDLERS, [{ operationId: 'llm.anthropic.generate', handler: 'generate' }]);
  await assert.rejects(() => generate(request()), /ANTHROPIC_TRUSTED_HOST_UNAVAILABLE/);
});

test('real local HTTP Messages wire system/text blocks and provenance, no implicit fallback', async () => {
  const f = await fixture();
  try {
    const client = createTrustedAnthropicMessagesClient(f.host);
    const actual = await client(request());
    assert.equal(actual.status, 'completed');
    if (actual.status !== 'completed') throw new Error('no result');
    assert.equal(actual.text, 'hello back');
    assert.equal(actual.providerKind, 'anthropic-messages');
    assert.equal(actual.providerRequestId, 'msg_test');
    assert.deepEqual(actual.usage, { evidenceMode: 'provider-reported', inputTokens: 15, outputTokens: 7 });
    assert.equal(f.seen.length, 1);
    const hit = f.seen[0]!;
    assert.equal(hit.method, 'POST');
    assert.equal(hit.headers['anthropic-version'], '2023-06-01');
    assert.equal(hit.headers['x-api-key'], 'test-not-a-real-secret');
    const body = hit.body as Record<string, unknown>;
    assert.deepEqual(body.system, [{ type: 'text', text: 'act safely' }]);
    assert.deepEqual(body.messages, [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]);
    assert.equal(body.model, modelId);
    assert.equal(body.max_tokens, 250);
    assert.equal(JSON.stringify(body).includes('openai'), false);
    assert.equal(JSON.stringify(actual).includes('test-not-a-real-secret'), false);
  } finally { await f.close(); }
});

test('before-send security refusals send zero requests', async () => {
  const f = await fixture();
  try {
    const client = createTrustedAnthropicMessagesClient(f.host);
    assert.deepEqual((await client({ ...request(), modelId: 'not-allowed' })).status, 'refused');
    assert.deepEqual((await client({ ...request(), deadlineUnixMs: now - 1 })).status, 'refused');
    assert.deepEqual((await client({ ...request(), outputFormat: 'json' })).status, 'refused');
    assert.deepEqual((await client({ ...request(), toolCatalogRef: 'caller-controlled' })).status, 'refused');
    assert.deepEqual((await client(request(), AbortSignal.abort())).status, 'refused');
    assert.equal(f.seen.length, 0);
    assert.throws(() => createTrustedAnthropicMessagesClient({ ...f.host,
      endpoint: 'https://evil.invalid/v1/messages', allowLoopbackForTest: false }), /ENDPOINT_UNAPPROVED/);
  } finally { await f.close(); }
});

test('tool_use becomes bounded non-authoritative data, never executed', async () => {
  const f = await fixture({ body: response({ stop_reason: 'tool_use', content: [
    { type: 'text', text: 'suggest' }, { type: 'tool_use', id: 'toolu_1', name: 'read_plan', input: { target: 'allowed' } },
  ] }) });
  let toolRuns = 0;
  try {
    const tools = [{ name: 'read_plan', description: 'proposal only', input_schema: { type: 'object' as const } }];
    const client = createTrustedAnthropicMessagesClient({ ...f.host,
      resolveTools: () => { toolRuns += 1; return tools; } });
    const result = await client({ ...request(), toolCatalogRef: 'host-approved' });
    assert.equal(result.status, 'completed');
    if (result.status !== 'completed') throw new Error('invalid');
    assert.equal(result.finishReason, 'tool_proposal');
    assert.deepEqual(result.toolProposals, [{ name: 'read_plan', argumentsJson: '{"target":"allowed"}' }]);
    assert.equal(toolRuns, 1); // catalog resolver only; no Tool handler ran
    assert.equal(f.seen.length, 1);
  } finally { await f.close(); }
});

test('unexpected unselected tool block refuses instead of text success', async () => {
  const f = await fixture({ body: response({ stop_reason: 'tool_use', content: [
    { type: 'tool_use', id: 'toolu_1', name: 'execute', input: { dangerous: true } },
  ] }) });
  try {
    const r = await createTrustedAnthropicMessagesClient(f.host)(request());
    assert.deepEqual({ status: r.status, reasonCode: r.status === 'completed' ? null : r.reasonCode },
      { status: 'failed', reasonCode: 'UNAPPROVED_TOOL_PROPOSAL' });
    assert.equal(f.seen.length, 1);
  } finally { await f.close(); }
});

test('finite provider status, missing usage and malformed output are truthful', async () => {
  for (const [reply, expected] of [
    [{ status: 401 }, 'AUTH_DENIED'], [{ status: 429 }, 'RATE_LIMITED'],
    [{ body: response({ usage: {} }) }, 'completed'],
    [{ body: { raw: 'secret-never-leak' } }, 'MALFORMED_RESPONSE'],
  ] as const) {
    const f = await fixture(reply);
    try {
      const r = await createTrustedAnthropicMessagesClient(f.host)(request());
      if (expected === 'completed') { assert.equal(r.status, 'completed');
        assert.deepEqual(r.usage, { evidenceMode: 'unavailable' }); }
      else { assert.equal(r.status, 'failed');
        if (r.status !== 'completed') assert.equal(r.errorCategory, expected); }
      assert.equal(JSON.stringify(r).includes('secret-never-leak'), false);
    } finally { await f.close(); }
  }
});

test('network throw after dispatch stays UNKNOWN, never retry or fabricate zero usage', async () => {
  let sends = 0;
  const fake = async () => { sends += 1; throw Error('secret remote exception'); };
  const client = createTrustedAnthropicMessagesClient({ modelId, apiKey: 'test-key', now: () => now,
    fetchTransport: fake as typeof fetch, assertRequest: assertLlmGenerateRequestV1,
    assertResult: assertLlmGenerateResultV1 });
  const r = await client(request());
  assert.deepEqual(r, { contractVersion: 'dh.llm.generate/1', requestId: 'local-1',
    providerKind: 'anthropic-messages', modelId, status: 'unknown', errorCategory: 'OUTCOME_UNKNOWN',
    reasonCode: 'SENT_OUTCOME_UNKNOWN', usage: { evidenceMode: 'unavailable' } });
  assert.equal(sends, 1);
});
