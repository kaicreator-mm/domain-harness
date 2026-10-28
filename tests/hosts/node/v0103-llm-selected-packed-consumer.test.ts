import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(import.meta.url);
const npmManifest = require.resolve('npm/package.json', { paths: [dirname(process.execPath), resolve(dirname(process.execPath), '../lib/node_modules')] });
const npm = process.env.npm_execpath ?? join(dirname(npmManifest), 'bin/npm-cli.js');

// This program runs outside the repository and imports only installed packages.
// The actual Domain Package bytes are passed as data, as a BUILD input.
const physicalConsumer = String.raw`
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { V10_TARGET_PROFILE, sha256Hex, assertLlmGenerateRequestV1, assertLlmGenerateResultV1 } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '@kaicreator/domain-harness-build';
import { activateV10App } from '@kaicreator/domain-harness-microkernel/host-seam';
import { activateGovernedV10Build, v10BuildPackageClosureDigest, v10BuildActivationDecisionDigest } from '@kaicreator/domain-harness-host-node';
import { parse } from 'acorn';

const selected = process.argv.slice(2);
const [kernel, sdk, router, business, ledger, openaiSource, anthropicSource] = JSON.parse(await readFile('payload.json', 'utf8'));
const secrets = { openai: 'SYNTHETIC_OPENAI_CREDENTIAL', anthropic: 'SYNTHETIC_ANTHROPIC_CREDENTIAL' };
const calls = { openai: 0, anthropic: 0 };
let mode = 'good';
let observed;
const server = createServer(async (req, res) => {
  const kind = req.url.includes('chat/completions') ? 'openai' : 'anthropic';
  calls[kind]++;
  assert.equal(req.headers.authorization, 'Bearer ' + secrets[kind]);
  let body = ''; for await (const chunk of req) body += chunk;
  assert.equal(body.includes(secrets.openai) || body.includes(secrets.anthropic), false);
  observed?.(); observed = undefined;
  res.setHeader('content-type', 'application/json');
  res.setHeader('x-request-id', mode === 'reflect' ? secrets[kind] : 'request-' + kind);
  if (mode === 'hold') return;
  if (mode === '408' || mode === '504' || mode === '401') {
    res.statusCode = Number(mode); res.end(JSON.stringify({ error: { type: 'authentication_error', message: secrets[kind] } })); return;
  }
  if (kind === 'openai') res.end(JSON.stringify({ id: 'openai-id', model: 'model',
    choices: [mode === 'tools' ? { message: { role: 'assistant', content: null,
      tool_calls: [{ type: 'function', function: { name: 'lookup', arguments: '{"query":"a"}' } }] }, finish_reason: 'tool_calls' }
      : { message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 2, completion_tokens: 3 } }));
  else res.end(JSON.stringify({ id: mode === 'reflect' ? secrets[kind] : 'anthropic-id', type: 'message', role: 'assistant', model: 'model',
    content: mode === 'tools' ? [{ type: 'tool_use', id: 'tool-1', name: 'lookup', input: { query: 'a' } }] : [{ type: 'text', text: 'ok' }],
    stop_reason: mode === 'tools' ? 'tool_use' : 'end_turn', usage: { input_tokens: 2, output_tokens: 3 } }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const dto = { contractVersion: 'dh.llm.generate/1', requestId: 'packed-request', modelId: 'model',
  deadlineUnixMs: Date.now() + 25000, messages: [{ role: 'user', content: 'hello' }], maxOutputTokens: 32, outputFormat: 'text' };
const clients = {};
try {
  if (selected.includes('openai')) {
    const { default: OpenAI } = await import('openai');
    const { createOpenAIHostClient } = await import('@kaicreator/domain-harness-host-node/llm/openai');
    clients.openai = createOpenAIHostClient(OpenAI, { baseURL: 'http://127.0.0.1:' + port + '/v1',
      apiKey: secrets.openai, modelId: 'model', maxDeadlineMs: 30000, allowLoopbackHttp: true,
      toolCatalog: { ref: 'tools', functions: [{ name: 'lookup', description: 'proposal only', parameters: { type: 'object' } }] } }).generate;
    Object.defineProperty(globalThis, '__rOpenai', { value: clients.openai });
    const p = join('node_modules', 'domain-harness-openai-host'); await mkdir(p, { recursive: true });
    await writeFile(join(p, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }));
    await writeFile(join(p, 'index.mjs'), 'export const generate = globalThis.__rOpenai;');
  }
  if (selected.includes('anthropic')) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const { createTrustedAnthropicMessagesClient } = await import('@kaicreator/domain-harness-host-node/llm/anthropic');
    clients.anthropic = createTrustedAnthropicMessagesClient(Anthropic, { modelId: 'model', apiKey: secrets.anthropic,
      endpoint: 'http://127.0.0.1:' + port + '/v1/messages', allowLoopbackForTest: true,
      now: Date.now, fetchTransport: fetch, assertRequest: assertLlmGenerateRequestV1, assertResult: assertLlmGenerateResultV1,
      resolveTools: ref => ref === 'tools' ? [{ name: 'lookup', description: 'proposal only', input_schema: { type: 'object' } }] : undefined });
    Object.defineProperty(globalThis, '__dhV0103AnthropicHostGenerate', { value: clients.anthropic, writable: false, configurable: false });
  }
  const standard = sdk + '\nconst __dhv10RouterBundle = (() => {\n' + router.replace(/^export /gm, '') +
    '\nreturn { routeWorkflowIntent };\n})();\nexport const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;\n';
  const module = (packageId, role, abiVersion, source, endpoint, provides) => ({ packageId, role, abiVersion,
    moduleSource: source, moduleSha256: sha256Hex(source), endpoint, dependencies: [], provides, requires: [] });
  const modules = [
    module('v08-kernel-mechanism@1.0.0', 'kernel-primary', 'v08-kernel-abi/1', kernel, 'occurrence-runtime', ['kernel:occurrence-runtime/1']),
    module('standard-sdk@v08.1.0.0', 'standard-primary', 'v08-standard-sdk-abi/1', standard, 'rule-interpreter', ['standard:interpret/1', 'standard:route/1']),
    module('business-order-approval@v08.1.0.0', 'business', 'v08-business-abi/1', business, 'business-policy', ['business:policy/1', 'intent:submitQuoteDecisionDynamic']),
    { ...module('capability-quote-tools@v08.1.0.0', 'capability', 'v08-capability-abi/1', ledger, 'capability-endpoint', ['capability:ledger/1']),
      capabilityId: 'ledger', handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }] },
  ];
  const routes = [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }];
  for (const kind of selected) {
    const cap = kind === 'openai' ? 'llm.openai' : 'llm.anthropic';
    const intent = kind === 'openai' ? 'llmViaOpenAI' : 'llmViaAnthropic';
    const packageId = 'business-' + kind + '@v1';
    const source = business.replaceAll('business-order-approval@v08.1.0.0', packageId)
      .replaceAll('business:order-approval', 'business:' + kind)
      .replaceAll('submitQuoteDecisionDynamic', intent).replaceAll("'ledger'", "'" + cap + "'")
      .replaceAll("'reserve'", "'" + cap + ".generate'")
      .replace('resource: { key: \'' + cap + '\', operation: \'' + cap + '.generate\' },',
        'resource: { key: \'' + cap + '\', operation: \'' + cap + '.generate\' }, external: {permitTtlMs:30000,await:\'terminal\'},')
      .replace('{ ...input, effectId }', JSON.stringify(dto));
    assert.ok(source.includes('external: {permitTtlMs:30000'), 'external K permit binding must be present');
    modules.push(module(packageId, 'business', 'v08-business-abi/1', source, 'business-policy', ['business:' + kind + '/1', 'intent:' + intent]));
    modules.push({ ...module(kind === 'openai' ? 'capability-llm-openai-compatible' : 'capability-llm-anthropic-messages',
      'capability', 'v08-capability-abi/1', kind === 'openai' ? openaiSource : anthropicSource,
      'capability-endpoint', ['capability:' + cap + '/1']), capabilityId: cap, externalEffect: true,
      handlers: [{ operationId: cap + '.generate', handler: 'generate' }],
      externalImports: { node: [], npm: kind === 'openai' ? ['domain-harness-openai-host'] : [], native: [] } });
    routes.push({ intentId: intent, operationId: cap + '.generate', capabilityId: cap, handlerId: 'generate' });
  }
  const app = buildV10App({ appId: 'app:packed-r', audience: 'aud:packed-r', targetProfile: V10_TARGET_PROFILE,
    modules, routes, hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 }, buildId: 'packed-r' });
  for (const kind of selected) assert.equal(app.modules.find(m => m.capabilityId === 'llm.' + kind)?.externalEffect, true, 'BUILD must seal external Effect');
  const docs = new Map();
  const store = {
    async get(key) { const row = docs.get(key); return row ? structuredClone(row) : null; },
    async put(key, value, condition) { const old = docs.get(key);
      if (condition.kind === 'create' ? !!old : !old || old.revision !== condition.revision)
        throw Object.assign(new Error('conflict'), { code: 'HOST_CAS_CONFLICT' });
      const row = { value: structuredClone(value), revision: old ? old.revision + 1 : 0 }; docs.set(key, row); return { revision: row.revision }; },
    async remove(key, condition) { const old = docs.get(key);
      if (condition.kind === 'cas' && (!old || old.revision !== condition.revision)) throw Object.assign(new Error('conflict'), { code: 'HOST_CAS_CONFLICT' });
      docs.delete(key); },
  };
  if (selected.length === 1 && selected[0] === 'openai') {
    const artifact = join(process.cwd(), 'node_modules', 'domain-harness-openai-host', 'index.mjs');
    const ordinary = await readFile(artifact, 'utf8');
    const bundle = "export async function generate(input) { return {contractVersion:'dh.llm.generate/1',requestId:input.requestId,providerKind:'openai-compatible',modelId:'model',status:'completed',text:'verified',finishReason:'stop',usage:{evidenceMode:'unavailable'}}; }";
    const stage = await mkdtemp(join(tmpdir(), 'dh-r-protected-'));
    try {
      await writeFile(artifact, bundle);
      const now = Date.now();
      const deployment = { deployedAppId: 'deploy:packed-r', tenantId: 'tenant:packed-r', appId: app.appId };
      const decision = { kind: 'v10/build-activation-decision', decisionId: 'decision:packed-r', ...deployment,
        subjectDigest: app.subjectDigest, buildId: app.buildId, packageClosureDigest: v10BuildPackageClosureDigest(app),
        runtimeAbi: app.runtimeAbi, hostAbi: app.hostAbi, targetProfile: app.targetProfile,
        approvalRef: 'approval:packed-r', approvedAt: new Date(now - 1000).toISOString(), validUntil: new Date(now + 60000).toISOString() };
      const digest = v10BuildActivationDecisionDigest(decision);
      const authorization = { verify(request) {
        return request.decisionDigest === digest && request.build.subjectDigest === decision.subjectDigest &&
          request.build.packageClosureDigest === decision.packageClosureDigest
          ? { status: 'AUTHORIZED', decisionDigest: digest, authorizationRef: decision.approvalRef,
            subjectDigest: decision.subjectDigest, packageClosureDigest: decision.packageClosureDigest,
            authorizedAt: decision.approvedAt, expiresAt: decision.validUntil }
          : { status: 'DENIED', reasonCode: 'NO_APPROVAL', reason: 'protected approval mismatch' };
      } };
      const policy = { profile: 'VERIFIED_PROVIDER_BUNDLE_V1', subjectDigest: app.subjectDigest,
        packageClosureDigest: decision.packageClosureDigest,
        provider: { specifier: 'domain-harness-openai-host', artifactPath: 'node_modules/domain-harness-openai-host/index.mjs', artifactSha256: sha256Hex(bundle) },
        allowedNodeBuiltins: [], stagingRoot: stage, parseModule: source => parse(source, { ecmaVersion: 2022, sourceType: 'module' }) };
      const options = { store, deployment, decision, authorization, now: () => now, deploymentRoot: process.cwd(), providerIntegrity: policy };
      const verified = await activateGovernedV10Build(app, options);
      try { assert.equal((await verified.send({ intentType: 'llmViaOpenAI', instanceKey: 'seal:good', messageId: 'seal:good', input: { amount: 30, requestId: 'seal' } })).status, 'admitted'); }
      finally { verified.close(); }
      await writeFile(artifact, bundle + '\n// tampered');
      await assert.rejects(activateGovernedV10Build(app, options), { code: 'VERIFIED_PROVIDER_DIGEST_MISMATCH' });
      const changed = structuredClone(app);
      const sealed = changed.modules.find(m => m.capabilityId === 'llm.openai');
      sealed.moduleSource += '\n// altered seal'; sealed.moduleSha256 = sha256Hex(sealed.moduleSource);
      await assert.rejects(activateGovernedV10Build(changed, options), { code: 'BUILD_CLOSURE_MISMATCH' });
    } finally { await writeFile(artifact, ordinary); await rm(stage, { recursive: true, force: true }); }
  }
  const active = await activateV10App(app, { store, deploymentRoot: process.cwd() });
  const send = (intentType, id, amount = 30) => active.facade.send({ intentType, instanceKey: 'instance:' + id,
    messageId: 'message:' + id, input: { amount, requestId: id } });
  try {
    assert.equal((await send('submitQuoteDecisionDynamic', 'ordinary')).status, 'admitted');
    for (const kind of selected) {
      const intent = kind === 'openai' ? 'llmViaOpenAI' : 'llmViaAnthropic';
      const other = kind === 'openai' ? 'anthropic' : 'openai';
      let before = calls[kind], otherBefore = calls[other];
      const refused = await clients[kind](dto, AbortSignal.abort());
      assert.equal(refused.status, 'refused'); assert.equal(refused.errorCategory, 'CANCELLED');
      assert.equal(calls[kind], before);
      await send(intent, 'denied-' + kind, 75).catch(() => {});
      assert.equal(calls[kind], before, 'K denial must not dispatch');
      mode = 'good'; const first = await send(intent, 'good-' + kind);
      assert.equal(first.status, 'admitted'); assert.equal(calls[kind], before + 1); assert.equal(calls[other], otherBefore);
      assert.ok([...docs.keys()].some(key => key.includes('effect-permit')), 'K must mint an external Effect permit');
      assert.match(JSON.stringify(first), /provider-reported/);
      await send(intent, 'good-' + kind); assert.equal(calls[kind], before + 1);
      mode = 'reflect'; const reflected = await send(intent, 'reflect-' + kind);
      assert.equal(reflected.status, 'admitted'); assert.match(JSON.stringify(reflected), /local-correlation:packed-request/);
      mode = 'tools'; const deniedTool = await clients[kind](dto);
      assert.equal(deniedTool.status, 'failed'); assert.equal(deniedTool.errorCategory, 'UNSUPPORTED_FEATURE');
      const proposal = await clients[kind]({ ...dto, toolCatalogRef: 'tools' });
      assert.equal(proposal.status, 'completed'); assert.equal(proposal.finishReason, 'tool_proposal');
      assert.equal(proposal.toolProposals[0].name, 'lookup'); assert.equal('permit' in proposal, false);
      for (const method of ['cancel', 'deadline']) {
        mode = 'hold'; before = calls[kind];
        const seen = new Promise(resolve => { observed = resolve; });
        const controller = new AbortController();
        const pending = clients[kind]({ ...dto, requestId: kind + '-' + method,
          deadlineUnixMs: Date.now() + (method === 'deadline' ? 300 : 5000) }, controller.signal);
        await seen; if (method === 'cancel') controller.abort();
        const uncertain = await pending;
        assert.equal(uncertain.status, 'unknown'); assert.equal(uncertain.errorCategory, 'OUTCOME_UNKNOWN');
        assert.equal(calls[kind], before + 1);
      }
      mode = '401'; before = calls[kind];
      const failed = await clients[kind](dto); assert.equal(failed.status, 'failed'); assert.equal(failed.errorCategory, 'AUTH_DENIED');
      assert.equal(failed.reasonCode, kind === 'openai' ? 'OPENAI_AUTH_DENIED' : 'PROVIDER_AUTH_DENIED');
      assert.equal(calls[kind], before + 1);
      for (const status of ['408', '504']) {
        mode = status; before = calls[kind];
        const ambiguous = await clients[kind](dto);
        assert.equal(ambiguous.status, 'unknown'); assert.equal(ambiguous.errorCategory, 'OUTCOME_UNKNOWN');
        assert.equal(calls[kind], before + 1);
        before = calls[kind]; otherBefore = calls[other];
        await assert.rejects(send(intent, kind + '-' + status), { code: 'ADMISSION_EFFECT_FAILED' });
        assert.equal(calls[kind], before + 1); assert.equal(calls[other], otherBefore);
        const journal = [...docs].find(([key]) => key.includes('effect-journal') && key.includes(kind + '-' + status));
        assert.equal(journal?.[1].value.record.status, 'failed');
        assert.equal(journal?.[1].value.record.error.zeroExternalEffect, undefined);
        assert.ok([...docs.keys()].some(key => key.includes('admission-fence') && key.includes(kind + '-' + status)));
        await assert.rejects(send(intent, kind + '-' + status));
        assert.equal(calls[kind], before + 1, 'held uncertain effect must not retry');
      }
      const publicData = JSON.stringify([first, failed, [...docs]]);
      assert.equal(publicData.includes(secrets.openai) || publicData.includes(secrets.anthropic), false);
    }
  } finally { active.dispose(); }
} finally { server.closeAllConnections(); server.close(); }
`;

test('clean packed Node consumer loads only selected public Host entries', { timeout: 120_000 }, async () => {
  assert.ok(Number(process.versions.node.split('.')[0]) >= 24);
  const dir = await mkdtemp(join(tmpdir(), 'dh-v0103-r-consumer-'));
  try {
    const pack = execFileSync(process.execPath, [npm, 'pack', '--json', '--pack-destination', dir,
      '--workspace', '@kaicreator/domain-harness-contracts', '--workspace', '@kaicreator/domain-harness-microkernel',
      '--workspace', '@kaicreator/domain-harness-host-node', '--workspace', '@kaicreator/domain-harness-build'], { cwd: root, encoding: 'utf8' });
    const tarballs = (JSON.parse(pack) as { filename: string }[]).map(p => join(dir, p.filename));
    assert.equal(tarballs.length, 4);
    await writeFile(join(dir, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
    execFileSync(process.execPath, [npm, 'install', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs,
      'openai@7.45.1', '@anthropic-ai/sdk@1.3.0', 'acorn@8.15.0'],
      { cwd: dir, encoding: 'utf8', timeout: 90_000 });
    const paths = [
      'domain-packages/kernel/basic/kernel-mechanism-v1.mjs',
      'domain-packages/standard/basic/standard-sdk-v1.mjs',
      'domain-packages/standard/basic/workflow-router.mjs',
      'examples/v08-domain-apps/business-approval.mjs',
      'examples/v08-domain-apps/capability-quote-tools.mjs',
      'domain-packages/capabilities/llm-openai-compatible/module.mjs',
      'domain-packages/capabilities/llm-anthropic-messages/modules/capability-llm-anthropic-messages.mjs',
    ];
    await writeFile(join(dir, 'payload.json'), JSON.stringify(await Promise.all(paths.map(p => readFile(join(root, p), 'utf8')))));
    const script = `
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
const loaded = [];
registerHooks({ load(url, context, next) { loaded.push(url); return next(url, context); } });
const contracts = await import('@kaicreator/domain-harness-contracts');
assert.equal(contracts.LLM_GENERATE_CONTRACT_V1, 'dh.llm.generate/1');
assert.equal(typeof contracts.assertLlmGenerateRequestV1, 'function');
const host = await import('@kaicreator/domain-harness-host-node');
assert.equal(typeof host.runMetaFeedbackWorkflow, 'function');
for (const name of process.argv.slice(2)) {
  const provider = await import('@kaicreator/domain-harness-host-node/llm/' + name);
  assert.equal(typeof provider[name === 'openai' ? 'createOpenAIHostClient' : 'createTrustedAnthropicMessagesClient'], 'function');
}
for (const name of ['openai', 'anthropic']) {
  assert.equal(loaded.some(url => url.includes('/llm/providers/' + name + '/')), process.argv.slice(2).includes(name));
}
`;
    await writeFile(join(dir, 'consumer.mjs'), script);
    const failures: string[] = [];
    for (const selection of [[], ['openai'], ['anthropic'], ['openai', 'anthropic']]) {
      const result = spawnSync(process.execPath, ['consumer.mjs', ...selection], { cwd: dir, encoding: 'utf8' });
      if (result.status !== 0) failures.push(`${selection.join('+') || 'zero'}: ${result.stderr || result.error}`);
    }
    assert.deepEqual(failures, []);
    // The App's own static route list narrows its string-valued SDK route ABI.
    // The SDK's runtime BUILD validation remains authoritative for arbitrary data.
    await writeFile(join(dir, 'consumer.ts'), `
import type { LlmGenerateRequestV1, LlmGenerateResultV1, V10RouteRowInput } from '@kaicreator/domain-harness-contracts';
import { createOpenAIHostClient } from '@kaicreator/domain-harness-host-node/llm/openai';
import { createTrustedAnthropicMessagesClient } from '@kaicreator/domain-harness-host-node/llm/anthropic';
const routes = [{ intentId: 'llmViaOpenAI', operationId: 'llm.openai.generate', capabilityId: 'llm.openai', handlerId: 'generate' }] as const satisfies readonly V10RouteRowInput[];
type SelectedIntent = typeof routes[number]['intentId'];
const selected: SelectedIntent = 'llmViaOpenAI';
// @ts-expect-error Anthropic was not selected by this App.
const unselected: SelectedIntent = 'llmViaAnthropic';
declare const request: LlmGenerateRequestV1;
declare const result: LlmGenerateResultV1;
void [request, result, selected, unselected, createOpenAIHostClient, createTrustedAnthropicMessagesClient];
`);
    execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict',
      '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022',
      '--typeRoots', join(root, 'node_modules/@types'), 'consumer.ts'], { cwd: dir, encoding: 'utf8' });
    await writeFile(join(dir, 'physical.mjs'), physicalConsumer);
    for (const selection of [[], ['openai'], ['anthropic'], ['openai', 'anthropic']]) {
      const result = spawnSync(process.execPath, ['physical.mjs', ...selection], { cwd: dir, encoding: 'utf8', timeout: 30_000 });
      assert.equal(result.status, 0, result.stderr || String(result.error));
      assert.doesNotMatch(result.stdout + result.stderr, /SYNTHETIC_(OPENAI|ANTHROPIC)_CREDENTIAL/);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
