// Issue #306 / A2 I-003 clean external-consumer proof: packs the portable SDK
// tarball, installs it into a throwaway consumer exactly like a downstream
// application-composition layer, and drives the DAC-aware composition intake
// using ONLY public package imports — never src/ paths.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));

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

const CONSUMER_PROGRAM = `
import assert from 'node:assert/strict';
import {
  DAC_REFERENCE_BASELINE,
  computeCompiledPackageId,
  adoptApplicationSelectionRef,
  adoptCompatibilityTargetRef,
  adoptPromotionDecisionRef,
  adoptRuntimeContractRef,
  adoptRuntimeImplementationRef,
  adoptSelectedDomainDataRef,
  isApplicationSelectionRef,
  validateSelectedComposition,
  CompositionIntakeError,
} from '@kaicreator/domain-harness';

const baseline = { ...DAC_REFERENCE_BASELINE };
const sha256 = { digestUtf8: async (v) => 'consumer-sha256:' + v };

// Minimal concrete compiled package with a content-derived identity computed
// through the public identity API (same derivation the intake revalidates).
const manifest = {
  domainId: 'domain:consumer:rules',
  domainVersion: 'rev-000009',
  formatVersion: '1',
  runtimeContractMajor: 2,
  executionEngineMajor: 1,
  targetProfileId: 'consumer-host',
  requiredCapabilities: [],
  workflows: {}, tools: {}, projections: {}, schemas: {}, bindingDigests: {},
  packageId: 'pending',
};
manifest.packageId = await computeCompiledPackageId(manifest, sha256);
const compiledPackage = { manifest, bindings: {} };

const input = (over = {}) => ({
  baseline,
  semanticIdentity: 'domain:consumer:rules',
  authorityScope: 'dac://consumer/app',
  revisionIdentity: 'rev-000009',
  contentDigest: manifest.packageId,
  ...over,
});

const environment = {
  formatVersion: '1',
  runtimeContractMajor: 2,
  executionEngineMajor: 1,
  targetProfileId: 'consumer-host',
  hostCapabilities: [],
  implementation: { identity: 'consumer-runtime', version: '1.0.0', build: 'build-77' },
  sha256,
};

const request = {
  promotionDecision: adoptPromotionDecisionRef(input()),
  applicationSelection: adoptApplicationSelectionRef(input()),
  selectedDomainData: adoptSelectedDomainDataRef(input()),
  runtimeContract: adoptRuntimeContractRef({
    baseline, semanticIdentity: 'runtime-contract', authorityScope: 'runtime',
    revisionIdentity: '2',
  }),
  runtimeImplementation: adoptRuntimeImplementationRef({
    baseline, semanticIdentity: 'consumer-runtime', authorityScope: 'runtime',
    revisionIdentity: '1.0.0', contentDigest: 'build-77',
  }),
  compatibilityTarget: adoptCompatibilityTargetRef({
    baseline, semanticIdentity: 'target', authorityScope: 'runtime',
    revisionIdentity: 'consumer-host',
  }),
  compiledPackage,
  environment,
};

const verdict = await validateSelectedComposition(request);
assert.equal(verdict.validatedPackageId, manifest.packageId);
assert.equal(isApplicationSelectionRef(verdict), false);
assert.equal(verdict.provenance.applicationSelection, request.applicationSelection);

// Fail-closed in the packed package: a consistently drifted chain (promotion +
// selection + selected all pin the wrong digest) fails on the exact
// selected-ref -> package mapping, and an incompatible package fails closed
// with explicit-reselection semantics.
const drifted = { contentDigest: 'sha256:drift' };
await assert.rejects(
  validateSelectedComposition({
    ...request,
    promotionDecision: adoptPromotionDecisionRef(input(drifted)),
    applicationSelection: adoptApplicationSelectionRef(input(drifted)),
    selectedDomainData: adoptSelectedDomainDataRef(input(drifted)),
  }),
  (e) => e instanceof CompositionIntakeError && e.code === 'SELECTED_IDENTITY_MISMATCH',
);
const incompatible = {
  ...compiledPackage,
  manifest: { ...compiledPackage.manifest, runtimeContractMajor: 9 },
};
await assert.rejects(
  validateSelectedComposition({ ...request, compiledPackage: incompatible }),
  (e) => e instanceof CompositionIntakeError && e.code === 'INCOMPATIBLE_SELECTED_COMPOSITION',
);

console.log('composition-consumer-ok');
`;

test('#306 packed package delivers the DAC-aware composition intake to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t306-consumer-'));
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
      name: 'domain-harness-t306-external-consumer',
      private: true,
      type: 'module',
    }, null, 2));

    runNpm(['install', '--ignore-scripts', '--no-audit', '--no-fund', tarball], consumer);
    assert.equal(
      existsSync(join(consumer, 'node_modules', 'better-sqlite3')),
      false,
      'portable core consumer must not install better-sqlite3',
    );

    writeFileSync(join(consumer, 'index.mjs'), CONSUMER_PROGRAM);
    const stdout = run(process.execPath, ['index.mjs'], consumer);
    assert.ok(stdout.includes('composition-consumer-ok'), `consumer program must pass; got: ${stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
