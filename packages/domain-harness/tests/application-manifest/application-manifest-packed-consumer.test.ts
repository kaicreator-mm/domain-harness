// Issue #310 / A2 I-007 clean external-consumer proof: packs the portable
// SDK tarball, installs it into a throwaway consumer exactly like a
// downstream application-composition layer, and drives the PROVISIONAL
// Application Manifest adapter using ONLY public package imports — never
// src/ paths. Journey: adopt manifest -> exact-entry compose through the
// #306 intake -> #307 binding/activation correlation, plus fail-closed
// ordering checks, all inside the packed package.
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
  adoptExternalAuthorityRef,
  adoptApplicationManifest,
  computeApplicationManifestDigest,
  composeSelectedApplicationManifest,
  correlateManifestRuntimeBinding,
  correlateManifestRuntimeActivation,
  isApplicationManifest,
  isManifestCompositionEvidence,
  isManifestRuntimeBindingCorrelation,
  isManifestRuntimeActivationCorrelation,
  bindValidatedComposition,
  activateRuntimeBinding,
  ApplicationManifestError,
} from '@kaicreator/domain-harness';

const baseline = { ...DAC_REFERENCE_BASELINE };
const sha256 = { digestUtf8: async (v) => 'consumer-sha256:' + v };

const manifestWire = {
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
manifestWire.packageId = await computeCompiledPackageId(manifestWire, sha256);
const compiledPackage = { manifest: manifestWire, bindings: {} };

const identity = () => ({
  baseline,
  semanticIdentity: 'domain:consumer:rules',
  authorityScope: 'dac://consumer/app',
  revisionIdentity: 'rev-000009',
  contentDigest: manifestWire.packageId,
});

const entry = {
  selected: adoptSelectedDomainDataRef(identity()),
  promotionDecision: adoptPromotionDecisionRef(identity()),
  applicationSelection: adoptApplicationSelectionRef(identity()),
};

const declared = {
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
};

const environment = {
  formatVersion: '1',
  runtimeContractMajor: 2,
  executionEngineMajor: 1,
  targetProfileId: 'consumer-host',
  hostCapabilities: [],
  implementation: { identity: 'consumer-runtime', version: '1.0.0', build: 'build-77' },
  sha256,
};

const authority = adoptExternalAuthorityRef({
  baseline: {
    contract: 'domain-application-contract', version: 'v0.0.2',
    baselineCommit: DAC_REFERENCE_BASELINE.baselineCommit,
  },
  authorityId: 'sor:consumer:billing',
  authorityScope: 'external://consumer/billing',
});

const draft = {
  baseline,
  contractVersion: 'dac-application-manifest/v0.0.2',
  applicationSemanticIdentity: 'app:consumer:rules',
  applicationRevisionIdentity: 'app-rev-1',
  manifestIdentity: 'manifest:consumer:rules:1',
  manifestContentDigest: 'pending',
  selectedDomainData: [entry],
  ...declared,
  uxContractRequirements: [
    { contractRole: 'view', semanticIdentity: 'ux-contract:rules:main', opaque: { shape: 'provisional' } },
  ],
  externalAuthorityDeclarations: [{ authority, capabilityRequirements: { requiresReconciliation: true } }],
};

// Digest is computed by the adapter over the exact presented content.
draft.manifestContentDigest = await computeApplicationManifestDigest(draft, { sha256 });
const manifest = await adoptApplicationManifest(draft, { sha256 });
assert.ok(isApplicationManifest(manifest));
assert.equal(isApplicationManifest({ ...manifest }), false);

// Compose the exact selected entry through the public #306 intake.
const evidence = await composeSelectedApplicationManifest({
  manifest,
  exactSelected: {
    semanticIdentity: entry.selected.semanticIdentity,
    revisionIdentity: entry.selected.revisionIdentity,
    contentDigest: entry.selected.contentDigest,
  },
  compiledPackage,
  environment,
});
assert.ok(isManifestCompositionEvidence(evidence));
assert.equal(evidence.validation.validatedPackageId, manifestWire.packageId);
assert.equal(
  evidence.manifestIdentity.manifestIdentity,
  'manifest:consumer:rules:1',
);

// Stage 4/5 evidence stays separate and correlates exactly.
const binding = await bindValidatedComposition(evidence.validation, { sha256 });
const correlation = correlateManifestRuntimeBinding(evidence, binding);
const activation = await activateRuntimeBinding(binding, {
  sha256, activationInstanceId: 'activation-consumer-1',
});
const activationCorrelation = correlateManifestRuntimeActivation(correlation, activation);
assert.ok(isManifestRuntimeBindingCorrelation(correlation));
assert.ok(isManifestRuntimeActivationCorrelation(activationCorrelation));

// Fail-closed ordering inside the packed package: an unstated exact entry
// never resolves (no order/default fallback), and evidence absorption into
// the manifest definition is rejected.
await assert.rejects(
  composeSelectedApplicationManifest({
    manifest,
    exactSelected: {
      semanticIdentity: 'domain:consumer:rules',
      revisionIdentity: 'rev-000009',
      contentDigest: 'drifted-digest',
    },
    compiledPackage,
    environment,
  }),
  (e) => e instanceof ApplicationManifestError && e.code === 'SELECTED_ENTRY_NOT_FOUND',
);
await assert.rejects(
  adoptApplicationManifest(
    { ...draft, opaque: { smuggledBinding: binding } },
    { sha256 },
  ),
  (e) => e instanceof ApplicationManifestError && e.code === 'MANIFEST_EVIDENCE_ABSORPTION',
);
await assert.rejects(
  adoptApplicationManifest(
    { ...draft, opaque: { currentWorkflowStep: 'step-3' } },
    { sha256 },
  ),
  (e) => e instanceof ApplicationManifestError && e.code === 'INSTANCE_STATE_LEAKAGE',
);

console.log('application-manifest-consumer-ok');
`;

test('#310 packed package delivers the Application Manifest adapter to a clean consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'domain-harness-t310-consumer-'));
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
      name: 'domain-harness-t310-external-consumer',
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
    assert.ok(stdout.includes('application-manifest-consumer-ok'), `consumer program must pass; got: ${stdout}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
