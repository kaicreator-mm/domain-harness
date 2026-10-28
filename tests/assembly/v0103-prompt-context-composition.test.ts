/** #1447 Q-G01: bounded composed Prompt/Context -> selected B/BUILD route ->
 * K permit -> selected C/Host witness. Fixed version-identified private
 * Prompt template + validated bounded Context (selected Standard feature)
 * -> app-private semantic guard; deterministic rule reuse precedes the
 * selected model. The private Host resolves an opaque intent reference to a
 * request only after K has admitted the effect. No customer data or paid
 * provider is involved.
 *
 * Public-entry note: this file proves the in-repo composition through the
 * installed workspace public entry `@kaicreator/domain-harness-microkernel/
 * host-seam`; the packed clean-consumer proof of the same exports is owned by
 * the closed Integration task #1418 (0/1/2 selected packed consumer). */
import './cjs-package-bridge.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createTrustedAnthropicMessagesClient } from '../../packages/host-node/dist/llm/providers/anthropic/client.js';
import { assertLlmGenerateRequestV1, assertLlmGenerateResultV1 } from '../../packages/contracts/dist/llm-generate-v1-guards.js';
import { buildV10App } from '../../tooling/build/dist/index.js';
import { activateV10App } from '@kaicreator/domain-harness-microkernel/host-seam';
import { basicComposition, featureEntry, PlainCasDocStore, sha256HexSource } from './helpers-v010.js';

const requireSDK = createRequire(new URL('../../domain-packages/capabilities/llm-anthropic-messages/package.json', import.meta.url));
// A clean root npm ci deliberately does not alter the shared workspace manifest.
// Bootstrap only this isolated, locked authoring fixture when not yet installed.
try { requireSDK.resolve('@anthropic-ai/sdk'); } catch {
  const npmManifest = requireSDK.resolve('npm/package.json', { paths: [dirname(process.execPath), resolve(dirname(process.execPath), '../lib/node_modules')] });
  execFileSync(process.execPath, [process.env.npm_execpath ?? join(dirname(npmManifest), 'bin/npm-cli.js'), 'ci', '--ignore-scripts', '--prefix',
    fileURLToPath(new URL('../../domain-packages/capabilities/llm-anthropic-messages/', import.meta.url)),
    '--registry=https://registry.npmmirror.com'], { stdio: 'inherit', timeout: 120_000 });
}
const SDK = requireSDK('@anthropic-ai/sdk').default;
const secret = 'SYNTHETIC_KEY_PRIVATE_1447';
const privateContext = 'SYNTHETIC_PRIVATE_CONTEXT_1447';
const privatePrompt = 'SYNTHETIC_PRIVATE_PROMPT_1447';
const scope = { deployedAppId: 'dep:1', tenantId: 'tenant:1', appId: 'app:1',
  businessPackageId: 'B:agent', agentId: 'agent:1', threadId: 'thread:1' };
const template = Object.freeze({ id: 'app:classify', version: '1', prefix: privatePrompt });
const contextRequest = (content: string, revision = 'r1') => ({ scope,
  observations: [{ id: 'observation:1', kind: 'memory', scope, content,
    provenance: { source: 'memory:host-read', revision, observedBy: 'host:app' } }],
  budget: { maxEntries: 1, maxCharacters: 128 } });
type Assembled = { entries: { content: string; provenance: { revision: string } }[] };
type Neutral = { status: string; text?: string; usage?: { evidenceMode: string; inputTokens?: number; outputTokens?: number } };
function semanticDecision(value: Neutral): 'accept' | 'review' {
  if (value.status !== 'completed' || typeof value.text !== 'string') throw new Error('SEMANTIC_RESPONSE_INVALID');
  const result: unknown = JSON.parse(value.text);
  if (result === null || typeof result !== 'object' || Array.isArray(result) ||
      !('decision' in result) || (result.decision !== 'accept' && result.decision !== 'review') ||
      Object.keys(result).length !== 1) throw new Error('SEMANTIC_RESPONSE_INVALID');
  return result.decision;
}
function findNeutral(value: unknown): Neutral | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  if ('contractVersion' in value && (value as { contractVersion?: unknown }).contractVersion === 'dh.llm.generate/1') return value as Neutral;
  for (const child of Object.values(value)) { const found = findNeutral(child); if (found) return found; }
  return undefined;
}

test('composed bounded context, private prompt, selected K permit, Host response and replay', { timeout: 30000 }, async () => {
  const contextSource = await readFile(new URL('../../domain-packages/standard/features/context-assembly/modules/sfeature-context-assembly-v1.mjs', import.meta.url), 'utf8');
  const cSource = await readFile(new URL('../../domain-packages/capabilities/llm-anthropic-messages/modules/capability-llm-anthropic-messages.mjs', import.meta.url), 'utf8');
  const feature = await featureEntry({ fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: contextSource, featureExport: 'assembleBoundedContext' });
  const composition = await basicComposition({ features: [feature] });
  const business = composition.modules.find(m => m.role === 'business');
  assert.ok(business && typeof business.moduleSource === 'string');
  // Only an opaque reference crosses K; the Host owns private prompt resolution.
  const businessSource = business.moduleSource.replaceAll('submitQuoteDecisionDynamic', 'llmViaAnthropic')
    .replaceAll("'ledger'", "'llm.anthropic'").replaceAll("'reserve'", "'llm.anthropic.generate'")
    .replace("resource: { key: 'llm.anthropic', operation: 'llm.anthropic.generate' },", "resource: { key: 'llm.anthropic', operation: 'llm.anthropic.generate' }, external: {permitTtlMs:10000,await:'terminal'},")
    .replace('{ ...input, effectId }', "{ requestId: 'opaque:request:1' }");
  const cap = { packageId: 'capability-llm-anthropic-messages', role: 'capability' as const, abiVersion: 'v08-capability-abi/1',
    moduleSource: cSource, moduleSha256: sha256HexSource(cSource), endpoint: 'capability-endpoint' as const,
    dependencies: [], provides: ['capability:llm.anthropic/1'], requires: [], capabilityId: 'llm.anthropic', externalEffect: true,
    handlers: [{ operationId: 'llm.anthropic.generate', handler: 'generate' }] };
  const modules = [...composition.modules.filter(m => m.role !== 'capability').map(m => m === business
    ? { ...m, provides: (m.provides ?? []).map(p => p.replace('submitQuoteDecisionDynamic', 'llmViaAnthropic')),
      moduleSource: businessSource, moduleSha256: sha256HexSource(businessSource) } : m), cap];
  const route = { intentId: 'llmViaAnthropic', operationId: 'llm.anthropic.generate', capabilityId: 'llm.anthropic', handlerId: 'generate' };
  const app = buildV10App({ ...composition, modules, routes: [route] });
  assert.throws(() => buildV10App({ ...composition, modules, routes: [{ ...route, capabilityId: 'unselected' }] }), { code: 'V10_ROUTE_INVALID' });
  const dir = await mkdtemp(join(tmpdir(), 'dh-i1447-'));
  const store = new PlainCasDocStore();
  let sends = 0; let mode = 'good'; let rendered = 0; let permitObserved = false;
  let outgoing: Record<string, unknown> | undefined;
  let boundRequest: Record<string, unknown> | undefined;
  const host = createTrustedAnthropicMessagesClient(SDK, { modelId: 'approved-model', apiKey: secret,
    now: () => 1800000000000, assertRequest: assertLlmGenerateRequestV1, assertResult: assertLlmGenerateResultV1,
    fetchTransport: (async (_resource: unknown, init?: RequestInit) => {
      sends++;
      const keys = store.keys();
      const permitKey = keys.find(key => key.includes('effect-permit'));
      const journalKey = keys.find(key => key.includes('effect-journal'));
      const permit = permitKey ? (await store.get(permitKey))?.value as { state?: string; effectId?: string } : undefined;
      const journal = journalKey ? (await store.get(journalKey))?.value as { record?: { status?: string; effectId?: string } } : undefined;
      permitObserved = permit?.state === 'live' && journal?.record?.status === 'started' &&
        permit.effectId === journal.record.effectId;
      outgoing = JSON.parse(String(init?.body)) as Record<string, unknown>;
      if (mode === 'unknown') throw new Error('synthetic transport uncertainty');
      const content = mode === 'malformed' ? [{ type: 'unknown', data: privateContext }]
        : mode === 'tool' ? [{ type: 'tool_use', name: 'unselected-shell', input: {} }]
        : [{ type: 'thinking', thinking: 'SYNTHETIC_THINKING_1447', signature: 'SYNTHETIC_SIGNATURE_1447' },
          { type: 'text', text: '{"decision":"accept"}' }];
      return new Response(JSON.stringify({ id: 'message:fake', type: 'message', role: 'assistant', stop_reason: 'end_turn', content,
        ...(mode === 'no-usage' ? {} : { usage: { input_tokens: 5, output_tokens: 3 } }) }),
        { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch });
  Object.defineProperty(globalThis, '__dhV0103AnthropicHostGenerate', { value: async (input: { requestId: string }) => {
    assert.equal(input.requestId, 'opaque:request:1');
    assert.ok(boundRequest);
    return host(boundRequest);
  }, writable: false, configurable: false, enumerable: false });
  const activation = await activateV10App(app, { store, deploymentRoot: dir });
  const intent = { intentType: 'llmViaAnthropic', instanceKey: 'instance:1', messageId: 'message:1', input: { amount: 30, requestId: 'business:1' } };
  async function prepare(content: string, version = '1', revision = 'r1') {
    if (version !== template.version || revision !== 'r1' || content.length > 128) throw new Error('CONTEXT_OR_VERSION_INVALID');
    const assembled = await activation.facade.invokeSelectedStandardFeature('standard:context-assembly/1', contextRequest(content, revision)) as Assembled;
    assert.equal(assembled.entries[0]?.provenance.revision, 'r1');
    if (assembled.entries[0]?.content === 'KNOWN_RULE') return { reused: true as const, decision: 'accept' as const };
    rendered++;
    boundRequest = { contractVersion: 'dh.llm.generate/1', requestId: 'opaque:request:1', modelId: 'approved-model',
      deadlineUnixMs: 1800000015000, maxOutputTokens: 128, outputFormat: 'text',
      messages: [{ role: 'user', content: `${template.prefix}: ${assembled.entries[0]!.content}` }] };
    return { reused: false as const };
  }
  try {
    const before = sends;
    for (const args of [[privateContext, '2', 'r1'], [privateContext, '1', 'stale'], ['x'.repeat(129), '1', 'r1']] as const)
      await assert.rejects(prepare(...args), /CONTEXT_OR_VERSION_INVALID/);
    assert.deepEqual(await prepare('KNOWN_RULE'), { reused: true, decision: 'accept' });
    assert.deepEqual(await prepare('KNOWN_RULE'), { reused: true, decision: 'accept' });
    assert.equal(sends, before); assert.equal(rendered, 0);
    assert.deepEqual(await prepare(privateContext), { reused: false });
    const response = await activation.facade.send(intent);
    assert.equal(response.status, 'admitted'); assert.equal(sends, 1); assert.equal(rendered, 1); assert.equal(permitObserved, true);
    assert.match(JSON.stringify(outgoing), new RegExp(privatePrompt));
    const dto = findNeutral(response); assert.ok(dto);
    assert.equal(semanticDecision(dto), 'accept');
    assert.deepEqual(dto.usage, { evidenceMode: 'provider-reported', inputTokens: 5, outputTokens: 3 });
    await activation.facade.send(intent); assert.equal(sends, 1);
    for (const nextMode of ['malformed', 'tool', 'no-usage', 'unknown']) {
      mode = nextMode; const count = sends;
      const next = { ...intent, instanceKey: `instance:${mode}`, messageId: `message:${mode}` };
      if (mode === 'unknown') {
        await assert.rejects(activation.facade.send(next), { code: 'ADMISSION_EFFECT_FAILED' });
        await assert.rejects(activation.facade.send(next));
      }
      else {
        const result = await activation.facade.send(next);
        const value = findNeutral(result); assert.ok(value);
        if (mode === 'no-usage') assert.deepEqual(value.usage, { evidenceMode: 'unavailable' });
        else { assert.equal(value.status, 'failed'); assert.throws(() => semanticDecision(value), /SEMANTIC_RESPONSE_INVALID/); }
      }
      assert.equal(sends, count + 1, `${mode} must not retry`);
    }
    assert.throws(() => semanticDecision({ status: 'completed', text: '{"decision":"invented"}' }), /SEMANTIC_RESPONSE_INVALID/);
    const journal = JSON.stringify(await Promise.all(store.keys().map(async key => [key, await store.get(key)])));
    for (const forbidden of [secret, privateContext, privatePrompt, 'SYNTHETIC_THINKING_1447', 'SYNTHETIC_SIGNATURE_1447'])
      assert.equal(journal.includes(forbidden), false);
    assert.match(journal, /UNKNOWN|unknown/);
  } finally { activation.dispose(); await rm(dir, { recursive: true, force: true }); }
});
