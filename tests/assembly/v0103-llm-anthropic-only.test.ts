/** Issue #1417: physically controlled Anthropic Messages fake endpoint, no paid API.
 * The official @anthropic-ai/sdk is pinned C-privately as a locked authoring
 * fixture; the shared Host/workspace manifest stays untouched. */
import './cjs-package-bridge.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTrustedAnthropicMessagesClient } from '../../packages/host-node/dist/llm/providers/anthropic/client.js';
import type { AnthropicMessagesSDKConstructor, TrustedAnthropicHost } from '../../packages/host-node/dist/llm/providers/anthropic/client.js';
import { assertLlmGenerateRequestV1, assertLlmGenerateResultV1 } from '../../packages/contracts/dist/llm-generate-v1-guards.js';
import { normalizeExternalEffectEnvelope } from '../../packages/microkernel/dist/internal/external-effect.js';
import { buildV10App } from '../../tooling/build/dist/index.js';
import { activateV10App } from '@kaicreator/domain-harness-microkernel/host-seam';
import { basicComposition, PlainCasDocStore, sha256HexSource } from './helpers-v010.ts';
import { generate, CAPABILITY_ID, HANDLERS, EXTERNAL_EFFECT } from '../../domain-packages/capabilities/llm-anthropic-messages/modules/capability-llm-anthropic-messages.mjs';

const requireSDK = createRequire(new URL('../../domain-packages/capabilities/llm-anthropic-messages/package.json', import.meta.url));
// A clean root npm ci deliberately does not alter the shared workspace manifest.
// Bootstrap only this isolated, locked authoring fixture when not yet installed.
try { requireSDK.resolve('@anthropic-ai/sdk'); } catch {
  const npmManifest = requireSDK.resolve('npm/package.json', { paths: [dirname(process.execPath), resolve(dirname(process.execPath), '../lib/node_modules')] });
  execFileSync(process.execPath, [process.env.npm_execpath ?? join(dirname(npmManifest), 'bin/npm-cli.js'), 'ci', '--ignore-scripts', '--prefix',
    fileURLToPath(new URL('../../domain-packages/capabilities/llm-anthropic-messages/', import.meta.url)),
    '--registry=https://registry.npmmirror.com'], { stdio: 'inherit', timeout: 120_000 });
}
const SDK = requireSDK('@anthropic-ai/sdk').default as AnthropicMessagesSDKConstructor;

const modelId = 'claude-test-approved';
const SECRET = 'SYNTHETIC_ANTHROPIC_SECRET_MUST_NOT_ESCAPE';
const now = 1800000000000;
const request = (extra: Record<string, unknown> = {}) => ({ contractVersion: 'dh.llm.generate/1', requestId: 'local-1', modelId,
  deadlineUnixMs: now + 15000, maxOutputTokens: 250, outputFormat: 'text',
  messages: [{ role: 'system', content: 'act safely' }, { role: 'user', content: 'hello' }], ...extra });
const response = (extra: Record<string, unknown> = {}) => ({
  id: 'msg_test', type: 'message', role: 'assistant', stop_reason: 'end_turn',
  content: [{ type: 'text', text: 'hello back' }], usage: { input_tokens: 15, output_tokens: 7 }, ...extra });
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
  const host: TrustedAnthropicHost = { modelId, apiKey: SECRET,
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

test('real official SDK Messages wire system/text blocks and provenance, no implicit fallback', async () => {
  const f = await fixture();
  try {
    const client = createTrustedAnthropicMessagesClient(SDK, f.host);
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
    assert.equal(hit.headers['authorization'], `Bearer ${SECRET}`);
    assert.ok(nonEmptyVersion(hit.headers['anthropic-version']));
    const body = hit.body as Record<string, unknown>;
    assert.deepEqual(body.system, [{ type: 'text', text: 'act safely' }]);
    assert.deepEqual(body.messages, [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }]);
    assert.equal(body.model, modelId);
    assert.equal(body.max_tokens, 250);
    assert.equal(body.stream, false);
    assert.equal(JSON.stringify(hit.body).includes(SECRET), false);
    assert.equal(JSON.stringify(body).includes('openai'), false);
    assert.equal(JSON.stringify(actual).includes(SECRET), false);
  } finally { await f.close(); }
});

function nonEmptyVersion(value: unknown): boolean {
  return typeof value === 'string' && /^20\d\d-\d\d-\d\d$/u.test(value);
}

test('before-send security refusals send zero requests', async () => {
  const f = await fixture();
  try {
    const client = createTrustedAnthropicMessagesClient(SDK, f.host);
    assert.deepEqual((await client({ ...request(), modelId: 'not-allowed' })).status, 'refused');
    assert.deepEqual((await client({ ...request(), deadlineUnixMs: now - 1 })).status, 'refused');
    assert.deepEqual((await client({ ...request(), outputFormat: 'json' })).status, 'refused');
    assert.deepEqual((await client({ ...request(), toolCatalogRef: 'caller-controlled' })).status, 'refused');
    assert.deepEqual((await client(request(), AbortSignal.abort())).status, 'refused');
    assert.equal(f.seen.length, 0);
    assert.throws(() => createTrustedAnthropicMessagesClient(SDK, { ...f.host,
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
    const client = createTrustedAnthropicMessagesClient(SDK, { ...f.host,
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
    const r = await createTrustedAnthropicMessagesClient(SDK, f.host)(request());
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
      const r = await createTrustedAnthropicMessagesClient(SDK, f.host)(request());
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
  const client = createTrustedAnthropicMessagesClient(SDK, { modelId, apiKey: 'test-key', now: () => now,
    fetchTransport: fake as typeof fetch, assertRequest: assertLlmGenerateRequestV1,
    assertResult: assertLlmGenerateResultV1 });
  const r = await client(request());
  assert.deepEqual(r, { contractVersion: 'dh.llm.generate/1', requestId: 'local-1',
    providerKind: 'anthropic-messages', modelId, status: 'unknown', errorCategory: 'OUTCOME_UNKNOWN',
    reasonCode: 'SENT_OUTCOME_UNKNOWN', usage: { evidenceMode: 'unavailable' } });
  assert.equal(sends, 1);
});

test('official SDK durability, private stop reasons, snapshot and selected K route', { timeout: 120_000 }, async t => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24);
  let mode = 'good'; let calls = 0; let received: Record<string, unknown> = {};
  let observed: (() => void) | undefined;
  const server = createServer(async (req, res) => {
    calls++; let raw = ''; for await (const part of req) raw += String(part);
    received = JSON.parse(raw) as Record<string, unknown>;
    observed?.(); observed = undefined;
    res.setHeader('content-type', 'application/json');
    res.setHeader('request-id', 'req-observed');
    if (mode === 'hold') return; // Abort closes the connection; no fabricated terminal response.
    if (mode === 'reset') { req.socket.destroy(); return; }
    if (mode.startsWith('http:')) {
      res.statusCode = Number(mode.slice(5));
      res.end(JSON.stringify({ type: 'error', error: { type: 'provider_error', message: SECRET } })); return;
    }
    if (mode === 'malformed') { res.end(JSON.stringify({ raw: 'secret-never-leak' })); return; }
    if (mode === 'reflect-secret' || mode === 'reflect-secret-embedded') {
      res.end(JSON.stringify(response({ id: mode === 'reflect-secret' ? SECRET : `prefix-${SECRET}-suffix` }))); return;
    }
    if (mode === 'private-reason' || mode === 'stop-sequence') {
      res.end(JSON.stringify(response({ stop_reason: mode === 'private-reason' ? 'provider_private_disposition' : 'stop_sequence' }))); return;
    }
    if (mode === 'refusal') { res.end(JSON.stringify(response({ stop_reason: 'refusal' }))); return; }
    if (mode === 'continuation') { res.end(JSON.stringify(response({ stop_reason: 'pause_turn' }))); return; }
    if (mode === 'context-window') { res.end(JSON.stringify(response({ stop_reason: 'model_context_window_exceeded' }))); return; }
    if (mode === 'tools' || mode === 'badtool') {
      res.end(JSON.stringify(response({ stop_reason: 'tool_use', content: [
        mode === 'tools' ? { type: 'text', text: 'suggest' } : { type: 'tool_use', id: 'toolu_x', name: 'shell', input: { dangerous: true } },
        ...(mode === 'tools' ? [{ type: 'tool_use', id: 'toolu_1', name: 'read_plan', input: { target: 'allowed' } }] : []),
      ] }))); return;
    }
    res.end(JSON.stringify(response()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const endpoint = `http://127.0.0.1:${address.port}/v1/messages`;
  const host: TrustedAnthropicHost = { modelId, apiKey: SECRET, endpoint, allowLoopbackForTest: true,
    now: () => now, fetchTransport: fetch,
    assertRequest: assertLlmGenerateRequestV1, assertResult: assertLlmGenerateResultV1 };
  const client = createTrustedAnthropicMessagesClient(SDK, host);
  const checked = async (extra: Record<string, unknown> = {}, selected = client) => {
    const r = await selected(request(extra)); assertLlmGenerateResultV1(r);
    assert.equal(JSON.stringify(r).includes(SECRET), false); return r; };

  await t.test('reflected provider request id containing credentials is omitted, never leaked', async () => {
    for (const wire of ['reflect-secret', 'reflect-secret-embedded']) {
      mode = wire; const r = await checked(); assert.equal(r.status, 'completed');
      assert.equal(r.providerRequestId, undefined);
      assert.equal(JSON.stringify(r).includes(SECRET), false);
    }
    mode = 'good'; assert.equal((await checked()).providerRequestId, 'msg_test');
  });

  await t.test('unknown private stop_reason stays completed/other; known dispositions keep their mapping', async () => {
    mode = 'private-reason'; const r = await checked();
    assert.equal(r.status, 'completed');
    if (r.status === 'completed') { assert.equal(r.finishReason, 'other'); assert.equal(r.text, 'hello back'); }
    mode = 'stop-sequence'; const s = await checked();
    assert.equal(s.status, 'completed');
    if (s.status === 'completed') assert.equal(s.finishReason, 'stop');
  });
  await t.test('known unsupported continuation and refusal stay terminal refusals, not other', async () => {
    mode = 'continuation'; const r = await checked();
    assert.deepEqual({ status: r.status, category: r.status === 'completed' ? null : r.errorCategory,
      code: r.status === 'completed' ? null : r.reasonCode },
      { status: 'failed', category: 'UNSUPPORTED_FEATURE', code: 'CONTINUATION_UNSUPPORTED' });
    mode = 'context-window'; const w = await checked();
    if (w.status !== 'completed') assert.equal(w.reasonCode, 'CONTINUATION_UNSUPPORTED');
    else throw new Error('continuation must fail');
    mode = 'refusal'; const q = await checked();
    assert.deepEqual({ status: q.status, category: q.status === 'completed' ? null : q.errorCategory },
      { status: 'refused', category: 'UNAVAILABLE' });
  });

  await t.test('sent HTTP 408/504 stays UNKNOWN (not terminal unavailable) with no retry', async () => {
    for (const status of [408, 504]) {
      mode = `http:${status}`; const before = calls; const r = await checked();
      assert.equal(r.status, 'unknown');
      if (r.status !== 'completed') { assert.equal(r.errorCategory, 'OUTCOME_UNKNOWN');
        assert.equal(r.reasonCode, 'SENT_OUTCOME_UNKNOWN'); }
      assert.equal(r.providerRequestId, 'req-observed');
      assert.equal(calls, before + 1, `HTTP ${status} must not retry inside the client`);
    }
  });
  await t.test('other finite provider statuses keep sanitized categories with no retry', async () => {
    for (const [status, category] of [[400, 'UNSUPPORTED_FEATURE'], [413, 'CONTEXT_OVERFLOW'], [500, 'UNAVAILABLE']] as const) {
      mode = `http:${status}`; const before = calls; const r = await checked();
      assert.equal(r.status, 'failed');
      if (r.status !== 'completed') assert.equal(r.errorCategory, category);
      assert.equal(calls, before + 1);
    }
  });
  await t.test('malformed terminal body fails without echoing raw data', async () => {
    mode = 'malformed'; const r = await checked();
    assert.deepEqual({ status: r.status, category: r.status === 'completed' ? null : r.errorCategory },
      { status: 'failed', category: 'MALFORMED_RESPONSE' });
    assert.equal(JSON.stringify(r).includes('secret-never-leak'), false);
  });

  await t.test('max-deadline window refuses pre-send with zero HTTP', async () => {
    const narrow = createTrustedAnthropicMessagesClient(SDK, { ...host, maxDeadlineWindowMs: 1000 });
    const before = calls; const r = await narrow(request());
    assert.deepEqual({ status: r.status, code: r.status === 'completed' ? null : r.reasonCode },
      { status: 'refused', code: 'DEADLINE_WINDOW_UNAPPROVED' });
    assert.equal(calls, before);
  });
  await t.test('after-send host cancel remains UNKNOWN with exactly one request', async () => {
    mode = 'hold'; const before = calls;
    const controller = new AbortController();
    const seen = new Promise<void>(resolve => { observed = resolve; });
    const pending = client(request({ requestId: 'sent:cancel' }), controller.signal);
    await seen; observed = undefined;
    controller.abort();
    const r = await pending; assertLlmGenerateResultV1(r);
    assert.equal(r.status, 'unknown');
    if (r.status !== 'completed') assert.equal(r.errorCategory, 'OUTCOME_UNKNOWN');
    assert.equal(calls, before + 1, 'cancel after send must not repeat the physical request');
    assert.equal(JSON.stringify(r).includes(SECRET), false);
  });
  await t.test('after-send deadline remains UNKNOWN with exactly one request', async () => {
    mode = 'hold'; const before = calls;
    const seen = new Promise<void>(resolve => { observed = resolve; });
    const pending = client(request({ requestId: 'sent:deadline', deadlineUnixMs: now + 300 }));
    await seen; observed = undefined;
    const r = await pending; assertLlmGenerateResultV1(r);
    assert.equal(r.status, 'unknown');
    if (r.status !== 'completed') assert.equal(r.errorCategory, 'OUTCOME_UNKNOWN');
    assert.equal(calls, before + 1, 'deadline after send must not repeat the physical request');
  });
  await t.test('connection reset after send stays UNKNOWN', async () => {
    mode = 'reset'; const before = calls; const r = await checked({ requestId: 'sent:reset' });
    assert.equal(r.status, 'unknown');
    assert.equal(calls, before + 1);
  });

  await t.test('post-construction host mutation cannot change approved policy or leak tokens', async () => {
    const spy = createServer((req, res) => { calls++; res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(response({ id: 'msg_from_spy' }))); });
    await new Promise<void>(resolve => spy.listen(0, '127.0.0.1', resolve));
    const spyAddress = spy.address(); assert.ok(spyAddress && typeof spyAddress !== 'string');
    try {
      const before = calls;
      const mutable = { ...host };
      const isolated = createTrustedAnthropicMessagesClient(SDK, mutable);
      // Mutate every snapshotted field on the ORIGINAL host object afterwards.
      mutable.modelId = 'prompt-implanted-model';
      mutable.apiKey = 'ATTACKER_ROTATED_SECRET';
      mutable.endpoint = `http://127.0.0.1:${spyAddress.port}/v1/messages`;
      mutable.assertRequest = () => { /* permissive guard mutation */ };
      mutable.assertResult = () => { /* permissive guard mutation */ };
      mutable.resolveTools = () => [{ name: 'shell', description: 'dangerous', input_schema: { type: 'object' } }];
      mutable.maxDeadlineWindowMs = 1;
      mode = 'good';
      const r = await isolated(request()); assertLlmGenerateResultV1(r);
      assert.equal(r.status, 'completed');
      assert.equal(r.modelId, modelId, 'approved model snapshot is authoritative');
      assert.equal(calls, before + 1, 'the request went to the original approved endpoint, not the mutated one');
      assert.equal(received.model, modelId);
      const mutatedModel = await isolated(request({ requestId: 'mutated-model', modelId: 'prompt-implanted-model' }));
      assert.equal(mutatedModel.status, 'refused');
      if (mutatedModel.status !== 'completed') assert.equal(mutatedModel.reasonCode, 'MODEL_NOT_SELECTED');
      assert.equal(calls, before + 1, 'mutated model attempt must not authorize I/O');
      const permissiveGuard = await isolated({ garbage: 'no contract at all' });
      assert.equal(permissiveGuard.status, 'refused');
      if (permissiveGuard.status !== 'completed') assert.equal(permissiveGuard.reasonCode, 'INVALID_REQUEST');
      assert.equal(calls, before + 1, 'relaxed mutated guard cannot bypass the snapshotted A contract');
      const flattened = JSON.stringify([r, mutatedModel, permissiveGuard]);
      assert.equal(flattened.includes(SECRET), false, 'no old token leak');
      assert.equal(flattened.includes('ATTACKER_ROTATED_SECRET'), false, 'no new token leak');
    } finally { spy.closeAllConnections(); await new Promise<void>(resolve => spy.close(() => resolve())); }
  });

  // From here the trusted Host-only immutable adapter is wired exactly like the
  // real R composition: a non-writable, non-configurable global slot. This must
  // stay after every test that requires the slot to be absent.
  const hostGenerate = (input: unknown): Promise<unknown> => client(input);
  Object.defineProperty(globalThis, '__dhV0103AnthropicHostGenerate',
    { value: hostGenerate, writable: false, configurable: false, enumerable: false });

  await t.test('module generate settles the actual K terminal envelope; UNKNOWN is never settled', async () => {
    mode = 'good';
    const direct = await client(request()); assertLlmGenerateResultV1(direct);
    const envelope = await generate(request()) as Record<string, unknown>;
    assert.deepEqual(envelope, { phase: 'terminal', externalRef: 'msg_test',
      outcome: { ok: true, output: direct } });
    const normalized = normalizeExternalEffectEnvelope(envelope);
    assert.equal(normalized.phase, 'terminal');
    if (normalized.phase === 'terminal') { assert.equal(normalized.outcome.ok, true); }
    assert.equal(JSON.stringify(normalized).includes(SECRET), false);
    // A bounded stable correlation fallback when the provider id is absent:
    mode = 'reflect-secret';
    const reflected = await generate(request({ requestId: 'fallback:one' })) as Record<string, unknown>;
    assert.equal(reflected.externalRef, 'local-correlation:fallback:one');
    assert.equal(normalizeExternalEffectEnvelope(reflected).phase, 'terminal');
    // UNKNOWN: the module throws a typed sanitized error; the K fence/Journal
    // owns it, so no settled terminal envelope may exist.
    mode = 'http:408';
    await assert.rejects(() => generate(request({ requestId: 'unknown:one' })),
      (e: unknown) => (e as { code?: string }).code === 'ANTHROPIC_OUTCOME_UNKNOWN');
    mode = 'reset';
    await assert.rejects(() => generate(request({ requestId: 'unknown:two' })),
      (e: unknown) => (e as { code?: string }).code === 'ANTHROPIC_OUTCOME_UNKNOWN');
    assert.equal(JSON.stringify(String(normalizeExternalEffectEnvelope(envelope))).includes(SECRET), false);
  });

  await t.test('Anthropic-only selected BUILD route uses actual K Effect; replay sends once; UNKNOWN keeps fence and no secret Journal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dh-v0103-anthropic-'));
    const source = await readFile(new URL('../../domain-packages/capabilities/llm-anthropic-messages/modules/capability-llm-anthropic-messages.mjs', import.meta.url), 'utf8');
    assert.equal(source.includes('openai'), false);
    const composition = await basicComposition();
    const business = composition.modules.find(m => m.role === 'business'); assert.ok(business && typeof business.moduleSource === 'string');
    const dto = request({ requestId: 'kernel:one' });
    const businessSource = business.moduleSource.replaceAll('submitQuoteDecisionDynamic', 'llmViaAnthropic')
      .replaceAll("'ledger'", "'llm.anthropic'").replaceAll("'reserve'", "'llm.anthropic.generate'")
      .replace("resource: { key: 'llm.anthropic', operation: 'llm.anthropic.generate' },", "resource: { key: 'llm.anthropic', operation: 'llm.anthropic.generate' }, external: {permitTtlMs:10000,await:'terminal'},")
      .replace('{ ...input, effectId }', JSON.stringify(dto));
    const cap = { packageId: 'capability-llm-anthropic-messages', role: 'capability' as const, abiVersion: 'v08-capability-abi/1',
      moduleSource: source, moduleSha256: sha256HexSource(source), endpoint: 'capability-endpoint' as const,
      dependencies: [], provides: ['capability:llm.anthropic/1'], requires: [], capabilityId: 'llm.anthropic', externalEffect: true,
      handlers: [{ operationId: 'llm.anthropic.generate', handler: 'generate' }] };
    const app = buildV10App({ ...composition, modules: [...composition.modules.filter(m => m.role !== 'capability').map(m => m === business ? { ...m, provides: (m.provides ?? []).map(p => p.replace('submitQuoteDecisionDynamic', 'llmViaAnthropic')), moduleSource: businessSource, moduleSha256: sha256HexSource(businessSource) } : m), cap],
      routes: [{ intentId: 'llmViaAnthropic', operationId: 'llm.anthropic.generate', capabilityId: 'llm.anthropic', handlerId: 'generate' }] });
    assert.equal(app.modules.some(m => m.packageId.includes('openai')), false);
    assert.throws(() => buildV10App({ ...composition, routes: [{ intentId: 'llmViaOpenAI', operationId: 'llm.openai.generate', capabilityId: 'llm.openai', handlerId: 'generate' }] }), { code: 'V10_ROUTE_INVALID' });
    const store = new PlainCasDocStore(); const activation = await activateV10App(app, { store, deploymentRoot: dir });
    try {
      mode = 'good'; const before = calls; const intent = { intentType: 'llmViaAnthropic', instanceKey: 'instance:anthropic', messageId: 'message:anthropic', input: { amount: 30, requestId: 'kernel:one' } };
      assert.equal((await activation.facade.send(intent)).status, 'admitted'); assert.equal(calls, before + 1);
      await activation.facade.send(intent); assert.equal(calls, before + 1, 'actual K replay does not repeat physical model request');
      for (const [wire, id] of [['reset', 'reset'], ['http:408', 'http-408'], ['http:504', 'http-504']] as const) {
        mode = wire; const beforeUnknown = calls;
        await assert.rejects(activation.facade.send({ ...intent, instanceKey: `instance:unknown:${id}`, messageId: `message:unknown:${id}` }), { code: 'ADMISSION_EFFECT_FAILED' });
        assert.equal(calls, beforeUnknown + 1, `${wire} must not retry inside the actual C/K route`);
        const unknownRows = JSON.stringify(await Promise.all(store.keys().map(async key => [key, await store.get(key)])));
        assert.equal(unknownRows.includes(SECRET), false); assert.match(unknownRows, /UNKNOWN|unknown/);
      }
      for (const wire of ['reflect-secret', 'reflect-secret-embedded']) {
        mode = wire;
        assert.equal((await activation.facade.send({ ...intent, instanceKey: `instance:${wire}`, messageId: `message:${wire}` })).status, 'admitted');
        const reflectedRows = JSON.stringify(await Promise.all(store.keys().map(async key => [key, await store.get(key)])));
        assert.equal(reflectedRows.includes(SECRET), false); assert.match(reflectedRows, /local-correlation:kernel:one/);
      }
      const rows = JSON.stringify(await Promise.all(store.keys().map(async key => [key, await store.get(key)])));
      assert.equal(rows.includes(SECRET), false);
    } finally { activation.dispose(); await rm(dir, { recursive: true, force: true }); }
  });
});
