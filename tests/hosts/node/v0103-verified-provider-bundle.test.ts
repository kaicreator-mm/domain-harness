import '../../assembly/cjs-package-bridge.ts';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import test from 'node:test';
import type { V10DocWriteCondition } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '../../../tooling/build/dist/index.js';
import { parse } from '../../../tooling/build/dist/generated/acorn.js';
import {
  activateGovernedV10Build, v10BuildPackageClosureDigest,
} from '../../../packages/host-node/dist/index.js';
import type { VerifiedProviderBundlePolicy } from '../../../packages/host-node/src/verified-provider-bundle.ts';
import { basicComposition, BUSINESS_PACKAGE_ID, PlainCasDocStore } from '../../assembly/helpers-v010.ts';
import { approve, APP_ID, DEPLOYMENT, NOW } from './fixtures-v0103-integrity/approval.ts';

const SPECIFIER = 'v0103-integrity-provider';
const GOOD = readFileSync(new URL('./fixtures-v0103-integrity/good.mjs', import.meta.url), 'utf8');
const SECRET = 'SYNTHETIC_PROVIDER_SECRET_MUST_NOT_ENTER_JOURNAL';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const globals = globalThis as typeof globalThis & {
  __v0103ProviderEvals?: number; __v0103ProviderCalls?: number; __v0103SecretGetterCalls?: number;
};

class Store extends PlainCasDocStore {
  writes = 0;
  override async put(key: string, value: unknown, condition: V10DocWriteCondition) {
    this.writes += 1;
    return super.put(key, value, condition);
  }
  async serialized() { return JSON.stringify(await Promise.all(this.keys().map(async key => [key, await this.get(key)]))); }
}

async function fixture(source = GOOD) {
  globals.__v0103ProviderEvals = 0; globals.__v0103ProviderCalls = 0; globals.__v0103SecretGetterCalls = 0;
  const dir = await mkdtemp(join(tmpdir(), 'dh-v0103-integrity-'));
  const root = join(dir, 'deployment');
  const staging = join(dir, 'protected-host');
  const packageRoot = join(root, 'node_modules', SPECIFIER);
  await mkdir(packageRoot, { recursive: true });
  await mkdir(staging);
  await writeFile(join(packageRoot, 'package.json'), JSON.stringify({ type: 'module', exports: './index.mjs' }));
  const artifact = join(packageRoot, 'index.mjs');
  await writeFile(artifact, source);
  const composition = await basicComposition();
  const cap = composition.modules.find(module => module.role === 'capability');
  assert.ok(cap);
  const business = composition.modules.find(module => module.role === 'business');
  assert.ok(business);
  assert.equal(typeof business.moduleSource, 'string');
  assert.ok(business.moduleSource !== undefined);
  const binding = "resource: { key: 'ledger', operation: 'reserve' },";
  assert.equal(business.moduleSource.split(binding).length, 2);
  const businessSource = business.moduleSource.replace(binding,
    binding + "\n        external: { permitTtlMs: 3600000, await: 'terminal' },");
  const capSource = `import { reserve } from '${SPECIFIER}';
export const MODULE_ID='capability-quote-tools@v08.1.0.0';
export const PACKAGE_KIND='capability'; export const ABI_VERSION='v08-capability-abi/1';
export const ENDPOINTS=[{endpointId:'capability:quote-tools',kind:'capability-endpoint'}];
export async function reserveLedger(input) {
  const output = await reserve(input);
  return {phase:'terminal',externalRef:'integrity:effect',outcome:{ok:true,output}};
}
export function previewTotal(input) { return {total:input.amount}; }`;
  const app = buildV10App({ ...composition, appId: APP_ID,
    modules: composition.modules.map(module => module === cap ? { ...module,
      moduleSource: capSource, moduleSha256: sha(capSource), externalEffect: true,
      externalImports: { node: [], npm: [SPECIFIER], native: [] } }
      : module === business ? { ...module, moduleSource: businessSource, moduleSha256: sha(businessSource) } : module),
    buildId: 'v0103-integrity-test',
  });
  const { decision, authorization } = approve(app);
  const store = new Store();
  const policy: VerifiedProviderBundlePolicy = {
    profile: 'VERIFIED_PROVIDER_BUNDLE_V1', subjectDigest: app.subjectDigest,
    packageClosureDigest: v10BuildPackageClosureDigest(app),
    provider: { specifier: SPECIFIER, artifactPath: relative(root, artifact), artifactSha256: sha(source) },
    allowedNodeBuiltins: [], stagingRoot: staging,
    parseModule: bytes => parse(bytes, { ecmaVersion: 2022, sourceType: 'module' }),
  };
  const options = { store, deployment: DEPLOYMENT, decision, authorization, now: () => NOW,
    deploymentRoot: root, providerIntegrity: policy };
  return { dir, root, staging, artifact, app, store, policy, options,
    async close() { await rm(dir, { recursive: true, force: true }); } };
}

const intent = (messageId = 'integrity:message', instanceKey = 'integrity:instance') => ({
  intentType: 'submitQuoteDecisionDynamic', instanceKey, messageId, input: { amount: 30, requestId: 'R-integrity' },
});
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
async function noEvaluation(f: Awaited<ReturnType<typeof fixture>>, app = f.app,
  policy: VerifiedProviderBundlePolicy = f.policy, code = 'VERIFIED_PROVIDER_ARTIFACT_UNSUPPORTED') {
  await assert.rejects(activateGovernedV10Build(app, { ...f.options, providerIntegrity: policy }), hasCode(code));
  assert.equal(globals.__v0103ProviderEvals, 0);
  assert.equal(globals.__v0103ProviderCalls, 0);
  assert.equal(f.store.writes, 0, 'denial precedes activation records, K state, pins and effects');
  assert.deepEqual(await readdir(f.staging), [], 'a refusal leaves no staging artifact');
}

test('GOOD: physical verified provider executes through real K, then PINNED_ONLY replays without a second effect', async () => {
  assert.equal(Number(process.versions.node.split('.')[0]), 24);
  const f = await fixture();
  try {
    const current = await activateGovernedV10Build(f.app, f.options);
    const receipt = await current.send(intent());
    assert.equal(receipt.status, 'admitted');
    assert.equal(current.kCounters(BUSINESS_PACKAGE_ID).effectDispatches, 1);
    assert.equal(globals.__v0103ProviderEvals, 1);
    assert.equal(globals.__v0103ProviderCalls, 1);
    assert.deepEqual(await readdir(f.staging), []);
    current.close();
    const restored = await activateGovernedV10Build(f.app, { ...f.options, selection: 'PINNED_ONLY' });
    try {
      assert.equal(restored.selection, 'PINNED_ONLY');
      assert.equal((await restored.send(intent())).status, 'admitted');
      assert.equal(globals.__v0103ProviderCalls, 1);
    } finally { restored.close(); }
  } finally { await f.close(); }
});

test('Provider-only byte replacement refuses before Provider evaluation or K mutation', async () => {
  const f = await fixture();
  try {
    await writeFile(f.artifact, GOOD + '\n// replaced bytes');
    await noEvaluation(f, f.app, f.policy, 'VERIFIED_PROVIDER_DIGEST_MISMATCH');
  } finally { await f.close(); }
});

test('Provider plus mutable sealed hash replacement cannot retain the old independently approved subject', async () => {
  const f = await fixture();
  try {
    await writeFile(f.artifact, GOOD + '\n// attacker provider');
    const changed = globalThis.structuredClone(f.app);
    const module = changed.modules.find(item => item.role === 'capability');
    assert.ok(module);
    const source = module.moduleSource + '\n// attacker mutable seal hash';
    Object.assign(module, { moduleSource: source, moduleSha256: sha(source) });
    assert.equal(changed.subjectDigest, f.app.subjectDigest);
    await noEvaluation(f, changed, f.policy, 'BUILD_CLOSURE_MISMATCH');
  } finally { await f.close(); }
});

test('missing protected approval/parser and attacker self-approval are fail closed', async () => {
  const f = await fixture();
  try {
    await noEvaluation(f, f.app, { ...f.policy, parseModule: undefined } as unknown as VerifiedProviderBundlePolicy,
      'VERIFIED_PROVIDER_TRUST_ANCHOR_MISSING');
    await noEvaluation(f, f.app, { ...f.policy, subjectDigest: 'f'.repeat(64) }, 'VERIFIED_PROVIDER_DIGEST_MISMATCH');
    await noEvaluation(f, f.app, { ...f.policy, parseModule() { throw new Error(SECRET); } });
  } finally { await f.close(); }
});

test('oversized approved artifact is refused before parsing or evaluation', async () => {
  const f = await fixture(GOOD + '\n//' + 'x'.repeat(4 * 1024 * 1024));
  try { await noEvaluation(f); } finally { await f.close(); }
});

for (const [label, source] of [
  ['relative sidecar', "import './sidecar.mjs'; export function reserve(){return {}; }"],
  ['external npm', "import 'unapproved-npm'; export function reserve(){return {}; }"],
  ['dynamic import', "export function reserve(){return import('node:fs');}"],
  ['require', "export function reserve(){return require('fs');}"],
  ['runtime eval', "export function reserve(){return eval('1');}"],
  ['function constructor', "export function reserve(){return new Function('return 1')();}"],
  ['computed reflection', "export function reserve(){return globalThis['eval']('1');}"],
  ['unapproved builtin', "import fs from 'node:fs'; export function reserve(){return {}; }"],
  ['native addon sidecar', "import './addon.node'; export function reserve(){return {}; }"],
] as const) {
  test(`unsupported ${label} is refused physically before evaluation`, async () => {
    const f = await fixture(source);
    try { await noEvaluation(f); } finally { await f.close(); }
  });
}

test('approved Node builtin is supported; missing native/transitive graph is not silently accepted', async () => {
  const source = "import {basename} from 'node:path'; export function reserve(){return {name:basename('/safe/file')};}";
  const f = await fixture(source);
  try {
    const activation = await activateGovernedV10Build(f.app, { ...f.options,
      providerIntegrity: { ...f.policy, allowedNodeBuiltins: ['node:path'] } });
    try { assert.equal((await activation.send(intent())).status, 'admitted'); } finally { activation.close(); }
  } finally { await f.close(); }
});

test('path escape, symlink artifact and mutable staging under deployment are refused', async () => {
  const f = await fixture();
  try {
    await noEvaluation(f, f.app, { ...f.policy, provider: { ...f.policy.provider, artifactPath: '../outside.mjs' } });
    await noEvaluation(f, f.app, { ...f.policy, stagingRoot: f.root });
    const link = join(f.root, 'linked-provider');
    await symlink(join(f.root, 'node_modules', SPECIFIER), link, process.platform === 'win32' ? 'junction' : 'dir');
    const linked = join(link, 'index.mjs');
    await noEvaluation(f, f.app, { ...f.policy, provider: { ...f.policy.provider, artifactPath: relative(f.root, linked) } });
  } finally { await f.close(); }
});

for (const mode of ['throw', 'getter', 'async-rejection', 'returned-getter'] as const) {
  test(`Provider ${mode} becomes fixed typed failure/held UNKNOWN, with zero secret in real K Journal`, async () => {
    const error = mode === 'getter'
      ? `const error = Object.create(null); Object.defineProperty(error,'message',{get(){globalThis.__v0103SecretGetterCalls += 1; throw new Error('${SECRET}');}}); throw error;`
      : mode === 'returned-getter'
        ? `const result = {}; Object.defineProperty(result,'value',{enumerable:true,get(){throw new Error('${SECRET}');}}); return result;`
        : `throw new Error('${SECRET}');`;
    const source = `export ${mode === 'async-rejection' ? 'async ' : ''}function reserve(){${error}}`;
    const f = await fixture(source);
    try {
      const activation = await activateGovernedV10Build(f.app, f.options);
      try {
        await assert.rejects(activation.send(intent()), caught => {
          assert.equal((caught as { code: string }).code, 'ADMISSION_EFFECT_FAILED');
          assert.equal((caught as Error).message.includes(SECRET), false);
          assert.equal((caught as { zeroExternalEffect?: boolean }).zeroExternalEffect, undefined);
          return true;
        });
        const journal = await f.store.serialized();
        assert.equal(journal.includes(SECRET), false);
        assert.ok(journal.includes('verified provider operation outcome is unknown'));
        assert.ok(journal.includes('admission-fence'), 'uncertain external effect retains its K fence');
        assert.equal(globals.__v0103SecretGetterCalls, 0);
      } finally { activation.close(); }
    } finally { await f.close(); }
  });
}

test('top-level Provider exception is sanitized before any activation/K write', async () => {
  const f = await fixture(`throw new Error('${SECRET}'); export function reserve(){return {};}`);
  try {
    await assert.rejects(activateGovernedV10Build(f.app, f.options), error => {
      assert.equal((error as Error).message.includes(SECRET), false); return true;
    });
    assert.equal(f.store.writes, 0);
    assert.deepEqual(await readdir(f.staging), []);
  } finally { await f.close(); }
});

test('original deployment mutation after measured bytes cannot change the imported snapshot', async () => {
  const f = await fixture();
  try {
    let bundleParsed = false;
    const attacker = `throw new Error('${SECRET}');`;
    const policy = { ...f.policy, parseModule(source: string) {
      if (source === GOOD) { bundleParsed = true; writeFileSync(f.artifact, attacker); }
      return parse(source, { ecmaVersion: 2022, sourceType: 'module' });
    } };
    const activation = await activateGovernedV10Build(f.app, { ...f.options, providerIntegrity: policy });
    try {
      assert.ok(bundleParsed);
      assert.equal(readFileSync(f.artifact, 'utf8'), attacker);
      assert.equal((await activation.send(intent())).status, 'admitted');
      assert.equal(globals.__v0103ProviderCalls, 1);
    } finally { activation.close(); }
  } finally { await f.close(); }
});

test('sealed module byte substitution cannot hide behind unchanged embedded module/subject hashes', async () => {
  const f = await fixture();
  try {
    const changed = globalThis.structuredClone(f.app);
    const module = changed.modules.find(item => item.role === 'capability');
    assert.ok(module);
    Object.assign(module, { moduleSource: module.moduleSource + '\nthrow new Error("not evaluated");' });
    await noEvaluation(f, changed, f.policy, 'VERIFIED_PROVIDER_DIGEST_MISMATCH');
  } finally { await f.close(); }
});

test('concurrent activations with equal sealed descriptors resolve their own independently verified bundles', async () => {
  const a = await fixture(GOOD.replace("'verified-ledger'", "'bundle-A'"));
  const b = await fixture(GOOD.replace("'verified-ledger'", "'bundle-B'"));
  try {
    assert.equal(a.app.subjectDigest, b.app.subjectDigest);
    const [left, right] = await Promise.all([
      activateGovernedV10Build(a.app, a.options), activateGovernedV10Build(b.app, b.options),
    ]);
    try {
      const [lr, rr] = await Promise.all([left.send(intent()), right.send(intent())]);
      assert.ok(JSON.stringify(lr).includes('bundle-A'));
      assert.equal(JSON.stringify(lr).includes('bundle-B'), false);
      assert.ok(JSON.stringify(rr).includes('bundle-B'));
      assert.equal(JSON.stringify(rr).includes('bundle-A'), false);
      assert.deepEqual(await readdir(a.staging), []);
      assert.deepEqual(await readdir(b.staging), []);
    } finally { left.close(); right.close(); }
  } finally { await a.close(); await b.close(); }
});

test('absent integrity option preserves the historical trusted activation path', async () => {
  const f = await fixture();
  try {
    const { providerIntegrity: _strict, ...options } = f.options;
    const activation = await activateGovernedV10Build(f.app, options);
    try { assert.equal((await activation.send(intent())).status, 'admitted'); } finally { activation.close(); }
  } finally { await f.close(); }
});

test('TRUSTED_DEPLOYMENT remains opt-out of strict byte approval', async () => {
  const f = await fixture();
  try {
    await writeFile(f.artifact, GOOD + '\n// ordinary Host-owned deployment');
    const activation = await activateGovernedV10Build(f.app, { ...f.options, providerIntegrity: { profile: 'TRUSTED_DEPLOYMENT' } });
    try {
      assert.equal((await activation.send(intent())).status, 'admitted');
      assert.equal(globals.__v0103ProviderCalls, 1);
    } finally { activation.close(); }
  } finally { await f.close(); }
});
