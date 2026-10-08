/**
 * T001E `./v7` packed-dist portability test (issue #551).
 *
 * Mirrors `tests/root-portability.test.ts`: `npm pack` the package, install
 * the tarball into a throwaway consumer, and import the new successor entry
 * `@kaicreator/domain-harness/v7` from the packed `dist`. Proves the 15
 * runtime bindings ship with the right kinds, the exact runtime closure holds
 * at dist level (no internal helper leaks), the tarball contains the built
 * entry files, the root entry stays additive/identity-stable, and the legacy
 * `./v2` entry remains untouched in both directions.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

/** The exactly-15 runtime bindings promised by the `./v7` entry (sorted). */
const V7_RUNTIME_SORTED = [
  'ComponentAdmissionError',
  'ComponentContractError',
  'ComponentDigestError',
  'COMPONENT_FAMILIES',
  'COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7',
  'DEFINITION_GRAPH_DIGEST_DOMAIN',
  'DefinitionGraphContractError',
  'ToolComponentContractError',
  'admitComponent',
  'componentSemanticDigestMaterial',
  'computeComponentSemanticDigest',
  'computeDefinitionGraphDigest',
  'validateComponentEnvelope',
  'validateDefinitionGraphEnvelope',
  'validateToolComponent',
].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') return run('npm', args, cwd);
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
}

test('#551 packed package exposes the additive ./v7 successor entry in a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-public-v7-portable-'));
  const packs = join(root, 'packs');
  const consumer = join(root, 'consumer');

  try {
    mkdirSync(packs, { recursive: true });
    mkdirSync(consumer, { recursive: true });

    runNpm(['pack', '--pack-destination', packs], packageRoot);
    const tarballs = readdirSync(packs).filter((name) => name.endsWith('.tgz'));
    assert.equal(tarballs.length, 1, 'core pack must produce exactly one tarball');
    const tarball = join(packs, tarballs[0]!);

    writeFileSync(join(consumer, 'package.json'), JSON.stringify({
      name: 'domain-harness-public-v7-portability-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
    // The installed tree is the unpacked tarball: these assertions prove the
    // tarball contains the built successor entry files.
    const installedDist = join(
      consumer,
      'node_modules',
      '@kaicreator',
      'domain-harness',
      'dist',
    );
    assert.equal(
      existsSync(join(installedDist, 'public-v7', 'index.js')),
      true,
      'packed package must ship dist/public-v7/index.js',
    );
    assert.equal(
      existsSync(join(installedDist, 'public-v7', 'index.d.ts')),
      true,
      'packed package must ship dist/public-v7/index.d.ts',
    );

    writeFileSync(join(consumer, 'index.mjs'), `
import assert from 'node:assert/strict';
import * as v7 from '@kaicreator/domain-harness/v7';

// Exact runtime closure at dist level: exactly the 15 promised names.
assert.deepEqual(Object.keys(v7).sort(), ${JSON.stringify(V7_RUNTIME_SORTED)});

// Consts.
assert.deepEqual(v7.COMPONENT_FAMILIES, ['semantic', 'tool']);
assert.ok(Object.isFrozen(v7.COMPONENT_FAMILIES));
assert.equal(typeof v7.COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7, 'string');
assert.ok(v7.COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7.length > 0);
assert.equal(typeof v7.DEFINITION_GRAPH_DIGEST_DOMAIN, 'string');
assert.ok(v7.DEFINITION_GRAPH_DIGEST_DOMAIN.length > 0);
assert.notEqual(v7.COMPONENT_SEMANTIC_DIGEST_DOMAIN_V0_7, v7.DEFINITION_GRAPH_DIGEST_DOMAIN);

// Functions.
for (const name of [
  'validateComponentEnvelope',
  'componentSemanticDigestMaterial',
  'computeComponentSemanticDigest',
  'validateDefinitionGraphEnvelope',
  'computeDefinitionGraphDigest',
  'admitComponent',
  'validateToolComponent',
]) {
  assert.equal(typeof v7[name], 'function');
}

// Error classes.
for (const name of [
  'ComponentContractError',
  'ComponentDigestError',
  'DefinitionGraphContractError',
  'ComponentAdmissionError',
  'ToolComponentContractError',
]) {
  assert.equal(typeof v7[name], 'function');
  assert.ok(new v7[name]('X', 'probe') instanceof Error);
}

// Internal helpers stay unreachable from the packed surface.
for (const helper of [
  'fail',
  'requireAdmissibleEnvelopeShape',
  'canonicalizeJson',
  'computeCanonicalJsonDigest',
  'lexicalCompare',
]) {
  assert.equal(helper in v7, false);
}

// Deterministic round trip through ./v7 only (reachability, no new behavior).
const envelope = {
  family: 'semantic',
  componentId: 'consumer.probe.alpha',
  kind: { kindId: 'consumer.kind.rule', version: '1.0.0' },
  requiredSemanticContracts: [{ contractId: 'consumer.contract.alpha', version: '2.0.0' }],
  requiredCapabilities: [],
  semanticBody: { enabled: true },
};
v7.validateComponentEnvelope(envelope);
const consumerSha = { digestUtf8: async (value) => 'consumer-stub-' + value.length };
const digest = await v7.computeComponentSemanticDigest(envelope, consumerSha);
assert.equal(typeof digest, 'string');
assert.ok(digest.length > 0);

// Root entry: additive and identity-stable.
const root = await import('@kaicreator/domain-harness');
assert.equal(root.DOMAIN_HARNESS_VERSION, '0.2.0');
assert.equal(typeof root.createDomainRuntime, 'function');
assert.equal(typeof root.validateComponentEnvelope, 'function');
assert.deepEqual(root.COMPONENT_FAMILIES, ['semantic', 'tool']);

// Legacy ./v2 entry stays untouched in both directions.
const v2 = await import('@kaicreator/domain-harness/v2');
assert.deepEqual(v2.COMPILED_ARTIFACT_KINDS, [
  'rule',
  'knowledge',
  'skill',
  'tool',
  'output-schema',
  'workflow',
  'promoted-subworkflow',
  'harness-config',
]);
assert.equal(typeof v2.compileCompiledArtifactIdentity, 'function');
assert.equal('validateComponentEnvelope' in v2, false);
assert.equal('COMPONENT_FAMILIES' in v2, false);
`);

    run(process.execPath, ['index.mjs'], consumer);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
