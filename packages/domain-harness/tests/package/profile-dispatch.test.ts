import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_COMPILED_ARTIFACT_PROFILE,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  type CapabilityId,
} from '../../src/v2/index.js';
import {
  PackageActivationError,
  validateCompiledPackageByProfile,
} from '../../src/package/index.js';
import {
  CompiledWorkflowIrError,
} from '../../src/runtime/compiled-workflow-ir.js';
import {
  decodeCompiledWorkflowDefinitionForProfile,
} from '../../src/runtime/compiled-workflow-dispatch.js';
import {
  createCompiledPackage,
  createSha256Fake,
} from './fixture.js';

const hostCapabilities = ['crypto-hash-sha256@1'] as const satisfies readonly CapabilityId[];

function profilePolicy() {
  return {
    supportedProfiles: [
      LEGACY_COMPILED_ARTIFACT_PROFILE,
      SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
    ],
    hostCapabilities,
    sha256: createSha256Fake(),
    targetProfileId: 'node-test',
  } as const;
}

test('I-FMT-03: exact legacy profile delegates to historical package validator', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0');
  const validated = await validateCompiledPackageByProfile(compiledPackage, profilePolicy());
  assert.equal(validated.manifest.packageId, compiledPackage.manifest.packageId);
  assert.equal(validated.manifest.formatVersion, '0.2');
  assert.equal(validated.manifest.executionEngineMajor, 2);
});

test('I-FMT-03: successor profile is recognized but cannot pass without feature validator', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0');
  compiledPackage.manifest.formatVersion = '0.3';
  compiledPackage.manifest.executionEngineMajor = 3;

  await assert.rejects(
    validateCompiledPackageByProfile(compiledPackage, profilePolicy()),
    (error: unknown) =>
      error instanceof PackageActivationError
      && error.code === 'INCOMPATIBLE_PACKAGE'
      && error.message.includes('feature validator is not installed'),
  );
});

for (const [name, profile] of [
  ['format-0.3 with engine-2', { formatVersion: '0.3', runtimeContractMajor: 2, executionEngineMajor: 2 }],
  ['format-0.2 with engine-3', { formatVersion: '0.2', runtimeContractMajor: 2, executionEngineMajor: 3 }],
  ['unknown format', { formatVersion: '9.9', runtimeContractMajor: 2, executionEngineMajor: 3 }],
  ['unsupported runtime major', { formatVersion: '0.3', runtimeContractMajor: 3, executionEngineMajor: 3 }],
] as const) {
  test(`I-FMT-03: ${name} fails closed as unsupported tuple`, async () => {
    const compiledPackage = await createCompiledPackage('1.0.0');
    compiledPackage.manifest.formatVersion = profile.formatVersion;
    compiledPackage.manifest.runtimeContractMajor = profile.runtimeContractMajor;
    compiledPackage.manifest.executionEngineMajor = profile.executionEngineMajor;

    await assert.rejects(
      validateCompiledPackageByProfile(compiledPackage, profilePolicy()),
      (error: unknown) =>
        error instanceof PackageActivationError
        && error.code === 'INCOMPATIBLE_PACKAGE'
        && error.message.includes('unsupported format/runtime/engine profile'),
    );
  });
}

test('I-FMT-03: legacy single-profile compatibility shape cannot select an arbitrary tuple', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0');
  await assert.rejects(
    validateCompiledPackageByProfile(compiledPackage, {
      formatVersion: '0.1',
      runtimeContractMajor: 2,
      executionEngineMajor: 1,
      hostCapabilities,
      sha256: createSha256Fake(),
      targetProfileId: 'node-test',
    }),
    (error: unknown) =>
      error instanceof PackageActivationError
      && error.code === 'INCOMPATIBLE_PACKAGE'
      && error.message.includes('may only select the frozen 0.2/2/2 profile'),
  );
});

test('I-FMT-03: workflow decoder dispatch preserves V2 and keeps V3 fail-closed without extension', () => {
  const definition = {
    initial: 'idle',
    states: {
      idle: {
        final: true,
        done: [],
        error: [],
        events: {},
      },
    },
  };

  const legacy = decodeCompiledWorkflowDefinitionForProfile(
    LEGACY_COMPILED_ARTIFACT_PROFILE,
    'workflow-a',
    definition,
  );
  assert.equal((legacy as { initial: string }).initial, 'idle');

  assert.throws(
    () => decodeCompiledWorkflowDefinitionForProfile(
      SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
      'workflow-a',
      definition,
    ),
    (error: unknown) =>
      error instanceof CompiledWorkflowIrError
      && error.message.includes('successor decoder extension is not installed'),
  );
});
