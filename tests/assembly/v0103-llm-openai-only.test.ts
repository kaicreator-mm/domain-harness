import './cjs-package-bridge.ts';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createOpenAIHostClient, OPENAI_REASON_CODES } from '../../packages/host-node/dist/llm/providers/openai/client.js';
import type { OpenAISDKConstructor } from '../../packages/host-node/dist/llm/providers/openai/client.js';
import { assertLlmGenerateResultV1 } from '../../packages/contracts/dist/llm-generate-v1-guards.js';
import { buildV10App } from '../../tooling/build/dist/index.js';
import { activateV10App } from '@kaicreator/domain-harness-microkernel/host-seam';
import { basicComposition, PlainCasDocStore, sha256HexSource } from './helpers-v010.ts';

const requireSDK = createRequire(new URL('../../domain-packages/capabilities/llm-openai-compatible/package.json', import.meta.url));
// A clean root npm ci deliberately does not alter the shared workspace manifest.
// Bootstrap only this isolated, locked authoring fixture when not yet installed.
try { requireSDK.resolve('openai'); } catch {
  const npmManifest = requireSDK.resolve('npm/package.json', { paths: [dirname(process.execPath), resolve(dirname(process.execPath), '../lib/node_modules')] });
  execFileSync(process.execPath, [process.env.npm_execpath ?? join(dirname(npmManifest), 'bin/npm-cli.js'), 'ci', '--ignore-scripts', '--prefix',
    fileURLToPath(new URL('../../domain-packages/capabilities/llm-openai-compatible/', import.meta.url)),
    '--registry=https://registry.npmmirror.com'], { stdio: 'inherit', timeout: 120_000 });
}
const SDK = requireSDK('openai').OpenAI as OpenAISDKConstructor;
const SECRET = 'SYNTHETIC_OPENAI_SECRET_MUST_NOT_ESCAPE';
const request = (extra = {}) => ({ contractVersion: 'dh.llm.generate/1', requestId: 'local:one', modelId: 'approved-model',
  deadlineUnixMs: Date.now() + 5000, messages: [{ role: 'user', content: 'bounded input' }], maxOutputTokens: 64, outputFormat: 'text', ...extra });
const completion = (extra = {}) => ({ id: 'completion-id-is-not-request-id', model: 'untrusted-response-alias',
  choices: [{ message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 2, completion_tokens: 3 }, ...extra });

test('OpenAI-only physical SDK/HTTP, typed boundary and selected C/K route', { timeout: 60_000 }, async t => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24);
  let mode = 'good'; let calls = 0; let received: Record<string, unknown> = {}; let auth: string | undefined; let wirePath: string | undefined;
  let observed: (() => void) | undefined;
  const server = createServer(async (req, res) => {
    calls++; auth = req.headers.authorization; wirePath = req.url;
    let raw = ''; for await (const part of req) raw += String(part);
    received = JSON.parse(raw) as Record<string, unknown>;
    observed?.(); observed = undefined;
    res.setHeader('content-type', 'application/json'); res.setHeader('x-request-id', 'req-observed');
    if (mode === 'hold') return; // Abort closes connection; no fabricated terminal response.
    if (mode === 'reset') { req.socket.destroy(); return; }
    if (mode.startsWith('http:')) {
      res.statusCode = Number(mode.slice(5));
      res.end(JSON.stringify({ error: { message: SECRET, code: res.statusCode === 400 ? 'context_length_exceeded' : SECRET } })); return;
    }
    if (mode === 'malformed') { res.end(JSON.stringify({ choices: [] })); return; }
    if (mode === 'oversized') { res.end(JSON.stringify(completion({ choices: [{ message: { content: 'x'.repeat(65537) }, finish_reason: 'stop' }] }))); return; }
    if (mode === 'tools' || mode === 'badtool') {
      res.end(JSON.stringify(completion({ choices: [{ message: { content: null, tool_calls: [{ type: 'function',
        function: { name: mode === 'tools' ? 'lookup' : 'shell', arguments: '{"query":"a"}' } }] }, finish_reason: 'tool_calls' }] }))); return;
    }
    if (mode === 'length' || mode === 'private-reason') {
      res.end(JSON.stringify(completion({ choices: [{ message: { content: 'partial' }, finish_reason: mode === 'length' ? 'length' : 'provider_private' }] }))); return;
    }
    if (mode === 'no-usage') { res.end(JSON.stringify(completion({ usage: null }))); return; }
    if (mode === 'json') { res.end(JSON.stringify(completion({ choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }] }))); return; }
    res.end(JSON.stringify(completion()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const baseURL = `http://127.0.0.1:${address.port}/v1`;
  const policy = { baseURL, apiKey: SECRET, modelId: 'approved-model', maxDeadlineMs: 10_000, allowLoopbackHttp: true };
  const client = createOpenAIHostClient(SDK, policy);
  const checked = async (extra = {}, selected = client) => { const r = await selected.generate(request(extra)); assertLlmGenerateResultV1(r); assert.equal(JSON.stringify(r).includes(SECRET), false); return r; };

  await t.test('success uses Chat Completions wire and observed request/finish/usage identity', async () => {
    const r = await checked(); assert.equal(r.status, 'completed');
    assert.equal(r.modelId, policy.modelId); assert.equal(r.providerKind, 'openai-compatible');
    assert.equal(r.providerRequestId, 'req-observed'); assert.notEqual(r.providerRequestId, 'completion-id-is-not-request-id');
    assert.deepEqual(r.usage, { evidenceMode: 'provider-reported', inputTokens: 2, outputTokens: 3 });
    assert.equal(wirePath, '/v1/chat/completions'); assert.equal(received.model, 'approved-model'); assert.equal(received.stream, false); assert.equal(received.max_tokens, 64);
    assert.equal(auth, `Bearer ${SECRET}`); assert.equal('apiKey' in received, false);
  });
  for (const [wire, expected] of [['length', 'length'], ['private-reason', 'other']]) await t.test(`finish ${wire} remains ${expected}`, async () => {
    mode = wire!; const r = await checked(); assert.equal(r.status, 'completed'); if (r.status === 'completed') assert.equal(r.finishReason, expected);
  });
  await t.test('missing usage is unavailable, never fabricated zero', async () => { mode = 'no-usage'; assert.deepEqual((await checked()).usage, { evidenceMode: 'unavailable' }); });
  await t.test('JSON mode uses explicit wire response_format', async () => { mode = 'json'; const r = await checked({ outputFormat: 'json' }); assert.equal(r.status, 'completed'); assert.deepEqual(received.response_format, { type: 'json_object' }); });
  for (const [extra, category] of [
    [{ modelId: 'prompt-selected-model' }, 'AUTH_DENIED'], [{ deadlineUnixMs: Date.now() - 1 }, 'DEADLINE'],
    [{ deadlineUnixMs: Date.now() + 999_999 }, 'DEADLINE'], [{ outputSchemaRef: 'unbound' }, 'UNSUPPORTED_FEATURE'],
    [{ toolCatalogRef: 'unbound' }, 'UNSUPPORTED_FEATURE'],
  ] as const) await t.test(`pre-dispatch ${category} refuses with zero HTTP`, async () => {
    const before = calls; const r = await checked(extra); assert.equal(r.status, 'refused'); assert.equal(r.errorCategory, category); assert.equal(calls, before);
  });
  await t.test('malformed DTO is typed and refuses before network', async () => {
    const before = calls; await assert.rejects(client.generate(request({ endpoint: SECRET })), /LLM_CONTRACT_INVALID_/); assert.equal(calls, before);
  });
  await t.test('Host pre-cancel is refusal/zero HTTP', async () => {
    const signal = AbortSignal.abort(); const before = calls; const r = await client.generate(request(), signal);
    assert.equal(r.status, 'refused'); assert.equal(r.errorCategory, 'CANCELLED'); assert.equal(calls, before);
  });
  for (const [status, category] of [[401, 'AUTH_DENIED'], [403, 'AUTH_DENIED'], [429, 'RATE_LIMITED'], [400, 'CONTEXT_OVERFLOW'], [500, 'UNAVAILABLE']] as const) await t.test(`terminal HTTP ${status} finite sanitized ${category}, no retry`, async () => {
    mode = `http:${status}`; const before = calls; const r = await checked(); assert.equal(r.status, 'failed');
    assert.equal(r.errorCategory, category); assert.ok(OPENAI_REASON_CODES.includes(r.reasonCode));
    assert.equal(calls, before + 1);
  });
  for (const malformed of ['malformed', 'oversized']) await t.test(`${malformed} terminal response fails without raw data`, async () => {
    mode = malformed; const r = await checked(); assert.equal(r.status, 'failed'); assert.equal(r.errorCategory, 'MALFORMED_RESPONSE');
  });
  const withTools = createOpenAIHostClient(SDK, { ...policy, toolCatalog: { ref: 'approved-tools', functions: [{ name: 'lookup', description: 'read-only proposal', parameters: { type: 'object', properties: { query: { type: 'string' } } } }] } });
  await t.test('unrequested terminal tool calls are typed failure, never text success', async () => {
    mode = 'tools'; const r = await checked(); assert.equal(r.status, 'failed'); assert.equal(r.errorCategory, 'UNSUPPORTED_FEATURE');
  });
  await t.test('approved tool proposals stay bounded JSON data; no Tool/K grant', async () => {
    mode = 'tools'; const r = await checked({ toolCatalogRef: 'approved-tools' }, withTools); assert.equal(r.status, 'completed');
    if (r.status === 'completed') { assert.equal(r.finishReason, 'tool_proposal'); assert.deepEqual(r.toolProposals, [{ name: 'lookup', argumentsJson: '{"query":"a"}' }]); assert.equal('permit' in r, false); }
  });
  await t.test('foreign tool name cannot gain approved catalog authority', async () => {
    mode = 'badtool'; const r = await checked({ toolCatalogRef: 'approved-tools' }, withTools); assert.equal(r.status, 'failed');
  });
  for (const kind of ['host-cancel', 'deadline']) await t.test(`after-send ${kind} remains UNKNOWN, never retries`, async () => {
    mode = 'hold'; const before = calls; const id = `sent:${kind}`;
    const seen = new Promise<void>(resolve => { observed = resolve; });
    const pending = client.generate(request({ requestId: id, deadlineUnixMs: Date.now() + (kind === 'deadline' ? 250 : 5000) }));
    await seen; if (kind === 'host-cancel') assert.equal(client.cancel(id), true);
    const r = await pending; assert.equal(r.status, 'unknown'); assert.equal(r.errorCategory, 'OUTCOME_UNKNOWN');
    assert.equal(calls, before + 1); assert.equal(client.cancel(id), false);
  });
  await t.test('connection reset after attempt stays UNKNOWN', async () => { mode = 'reset'; const before = calls; assert.equal((await checked()).status, 'unknown'); assert.equal(calls, before + 1); });
  await t.test('untrusted error getters cannot expose secret messages', async () => {
    class BrokenSDK { chat = { completions: { create: async () => { throw Object.defineProperty({}, 'status', { get() { throw new Error(SECRET); } }); } } }; }
    const broken = createOpenAIHostClient(BrokenSDK, policy); const r = await checked({}, broken); assert.equal(r.status, 'unknown');
  });
  await t.test('endpoint policy rejects plaintext remote/userinfo and has immutable model binding', async () => {
    assert.throws(() => createOpenAIHostClient(SDK, { ...policy, baseURL: 'http://example.com/v1' }), /OPENAI_HOST_POLICY_INVALID/);
    assert.throws(() => createOpenAIHostClient(SDK, { ...policy, baseURL: 'https://key@example.com/v1' }), /OPENAI_HOST_POLICY_INVALID/);
    const mutable = { ...policy }; const isolated = createOpenAIHostClient(SDK, mutable); mutable.modelId = 'changed';
    mode = 'good'; assert.equal((await checked({}, isolated)).modelId, 'approved-model');
  });

  await t.test('OpenAI-only selected BUILD route uses actual K Effect; replay sends once; UNKNOWN keeps fence and no secret Journal', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'dh-v0103-openai-'));
    const hostPath = join(dir, 'node_modules', 'domain-harness-openai-host'); await mkdir(hostPath, { recursive: true });
    const hostClient = new URL('../../packages/host-node/dist/llm/providers/openai/client.js', import.meta.url).href;
    const sdkPath = pathToFileURL(requireSDK.resolve('openai')).href;
    await writeFile(join(hostPath, 'package.json'), JSON.stringify({ type: 'module', exports: './binding.mjs' }));
    await writeFile(join(hostPath, 'binding.mjs'), `import OpenAI from ${JSON.stringify(sdkPath)}; import {createOpenAIHostClient} from ${JSON.stringify(hostClient)};
const client=createOpenAIHostClient(OpenAI,${JSON.stringify(policy)}); export const generate=client.generate;`);
    const source = await readFile(new URL('../../domain-packages/capabilities/llm-openai-compatible/module.mjs', import.meta.url), 'utf8');
    assert.equal(source.includes('anthropic'), false);
    const composition = await basicComposition();
    const business = composition.modules.find(m => m.role === 'business'); assert.ok(business && typeof business.moduleSource === 'string');
    const dto = request({ requestId: 'kernel:one' });
    const businessSource = business.moduleSource.replaceAll('submitQuoteDecisionDynamic', 'llmViaOpenAI')
      .replaceAll("'ledger'", "'llm.openai'").replaceAll("'reserve'", "'llm.openai.generate'")
      .replace("resource: { key: 'llm.openai', operation: 'llm.openai.generate' },", "resource: { key: 'llm.openai', operation: 'llm.openai.generate' }, external: {permitTtlMs:10000,await:'terminal'},")
      .replace('{ ...input, effectId }', JSON.stringify(dto));
    const cap = { packageId: 'capability-llm-openai-compatible', role: 'capability' as const, abiVersion: 'v08-capability-abi/1',
      moduleSource: source, moduleSha256: sha256HexSource(source), endpoint: 'capability-endpoint' as const,
      dependencies: [], provides: ['capability:llm.openai/1'], requires: [], capabilityId: 'llm.openai', externalEffect: true,
      handlers: [{ operationId: 'llm.openai.generate', handler: 'generate' }], externalImports: { node: [], npm: ['domain-harness-openai-host'], native: [] } };
    const app = buildV10App({ ...composition, modules: [...composition.modules.filter(m => m.role !== 'capability').map(m => m === business ? { ...m, provides: (m.provides ?? []).map(p => p.replace('submitQuoteDecisionDynamic', 'llmViaOpenAI')), moduleSource: businessSource, moduleSha256: sha256HexSource(businessSource) } : m), cap],
      routes: [{ intentId: 'llmViaOpenAI', operationId: 'llm.openai.generate', capabilityId: 'llm.openai', handlerId: 'generate' }] });
    assert.equal(app.modules.some(m => m.packageId.includes('anthropic')), false);
    assert.throws(() => buildV10App({ ...composition, routes: [{ intentId: 'llmViaAnthropic', operationId: 'llm.anthropic.generate', capabilityId: 'llm.anthropic', handlerId: 'generate' }] }), { code: 'V10_ROUTE_INVALID' });
    const store = new PlainCasDocStore(); const activation = await activateV10App(app, { store, deploymentRoot: dir });
    try {
      mode = 'good'; const before = calls; const intent = { intentType: 'llmViaOpenAI', instanceKey: 'instance:openai', messageId: 'message:openai', input: { amount: 30, requestId: 'kernel:one' } };
      assert.equal((await activation.facade.send(intent)).status, 'admitted'); assert.equal(calls, before + 1);
      await activation.facade.send(intent); assert.equal(calls, before + 1, 'actual K replay does not repeat physical model request');
      mode = 'reset'; await assert.rejects(activation.facade.send({ ...intent, instanceKey: 'instance:unknown', messageId: 'message:unknown' }), { code: 'ADMISSION_EFFECT_FAILED' });
      const rows = JSON.stringify(await Promise.all(store.keys().map(async key => [key, await store.get(key)])));
      assert.equal(rows.includes(SECRET), false); assert.match(rows, /UNKNOWN|unknown/);
    } finally { activation.dispose(); await rm(dir, { recursive: true, force: true }); }
  });
});
