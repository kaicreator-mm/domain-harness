// Issue #307 / A2 I-004 clean external-consumer proof: packs the portable SDK
// tarball, installs it into a throwaway consumer exactly like a downstream
// runtime host, and drives composition intake -> runtime binding -> technical
// activation using ONLY public package imports — never src/ paths. Also proves
// the fail-closed ordering (no binding without a genuine verdict; no
// activation without a genuine binding) inside the packed package.
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
  isRuntimeActivationRef,
  isRuntimeBindingRef,
  validateSelectedComposition,
  bindValidatedComposition,
  activateRuntimeBinding,
  isRuntimeBindingEvidence,
  RuntimeBindingError,
} from '@kaicreator/domain-harness';

const baseline = { ...DAC_REFERENCE_BASELINE };
const sha256 = { digestUtf8: async (v) => 'consumer-sha256:' + v };

// Same concrete compiled-package journey the #306 consumer proved.
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

const input = () => ({
  baseline,
  semanticIdentity: 'domain:consumer:rules',
  authorityScope: 'dac://consumer/app',
  revisionIdentity: 'rev-000009',
  contentDigest: manifest.packageId,
});

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
  environment: {
    formatVersion: '1',
    runtimeContractMajor: 2,
    executionEngineMajor: 1,
    targetProfileId: 'consumer-host',
    hostCapabilities: [],
    implementation: { identity: 'consumer-runtime', version: '1.0.0', build: 'build-77' },
    sha256,
  },
};

// Stage 3 -> 4 -> 5 through the public package only.
const verdict = await validateSelectedComposition(request);
const binding = await bindValidatedComposition(verdict, { sha256 });
const activation = await activateRuntimeBinding(binding, {
  sha256,
  activationInstanceId: 'activation-consumer-1',
});

assert.ok(isRuntimeBindingRef(binding.bindingRef));
assert.ok(isRuntimeActivationRef(activation.activationRef));
assert.ok(isRuntimeBindingEvidence(binding));
assert.equal(isApplicationSelectionRef(binding), false);
assert.equal(binding.validation, verdict);
assert.equal(activation.binding, binding);
assert.equal(activation.activatedPackageId, manifest.packageId);

// Fail-closed ordering in the packed package: a forged verdict copy cannot
// bind (compatibility PASS cannot be claimed), and the verdict itself cannot
// activate (no selection->activation shortcut).
const forged = Object.freeze({ ...verdict });
await assert.rejects(
  bindValidatedComposition(forged, { sha256 }),
  (e) => e instanceof RuntimeBindingError && e.code === 'NOT_A_VALIDATED_COMPOSITION',
);
await assert.rejects(
  activateRuntimeBinding(verdict, { sha256, activationInstanceId: 'x' }),
  (e) => e instanceof RuntimeBindingError && e.code === 'NOT_A_RUNTIME_BINDING',
);

console.log('runtime-binding-consumer-ok');
`;

test('#307 packed package delivers runtime binding and activation evidence to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t307-consumer-'));
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
      name: 'domain-harness-t307-external-consumer',
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
    assert.ok(stdout.includes('runtime-binding-consumer-ok'), `consumer program must pass; got: ${stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
