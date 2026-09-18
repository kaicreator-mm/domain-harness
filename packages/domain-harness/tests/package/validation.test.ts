import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapabilityId } from '../../src/v2/index.js';
import {
  PackageActivationError,
  computeCompiledPackageId,
  validateCompiledPackage,
} from '../../src/package/index.js';
import {
  TEST_POLICY_BASE,
  createCompiledPackage,
  createSha256Fake,
} from './fixture.js';

const hostCapabilities = ['crypto-hash-sha256@1'] as const satisfies readonly CapabilityId[];

function policy() {
  return {
    ...TEST_POLICY_BASE,
    hostCapabilities,
    sha256: createSha256Fake(),
  };
}

test('G29: malformed compiled package fails closed before execution', async () => {
  await assert.rejects(
    validateCompiledPackage({ manifest: null, bindings: {} }, policy()),
    (error: unknown) =>
      error instanceof PackageActivationError && error.code === 'INVALID_COMPILED_PACKAGE',
  );
});

test('G29: malformed nested workflow descriptor fails closed', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0');
  compiledPackage.manifest.workflows = {
    bad: {
      workflowId: 'bad',
      definition: {},
      messageContracts: {
        broken: {
          type: 'broken',
          payloadSchema: 'not-a-schema-object' as never,
        },
      },
    },
  };
  compiledPackage.manifest.packageId = await computeCompiledPackageId(
    compiledPackage.manifest,
    createSha256Fake(),
  );

  await assert.rejects(
    validateCompiledPackage(compiledPackage, policy()),
    (error: unknown) =>
      error instanceof PackageActivationError && error.code === 'INVALID_COMPILED_PACKAGE',
  );
});

test('G29: corrupt package identity fails closed', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0');
  compiledPackage.manifest.packageId = 'corrupt-id';

  await assert.rejects(
    validateCompiledPackage(compiledPackage, policy()),
    (error: unknown) =>
      error instanceof PackageActivationError && error.code === 'PACKAGE_ID_MISMATCH',
  );
});

test('G27/G29: incompatible runtime contract fails before activation', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0', { runtimeContractMajor: 99 });

  await assert.rejects(
    validateCompiledPackage(compiledPackage, policy()),
    (error: unknown) =>
      error instanceof PackageActivationError &&
      error.code === 'INCOMPATIBLE_PACKAGE' &&
      error.details.some((detail) => detail.includes('runtimeContractMajor')),
  );
});

test('G29: missing required host capability fails closed', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0', {
    requiredCapabilities: ['script-execution@1'],
  });

  await assert.rejects(
    validateCompiledPackage(compiledPackage, policy()),
    (error: unknown) =>
      error instanceof PackageActivationError &&
      error.code === 'INCOMPATIBLE_PACKAGE' &&
      error.details.includes('missing host capability script-execution@1'),
  );
});

test('G29: binding descriptor/digest mismatch fails closed', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0');
  compiledPackage.manifest.tools = {
    t: {
      toolId: 't',
      outputSchema: {},
      effect: 'none',
      execution: { kind: 'script', bindingId: 'binding-t', digest: 'digest-a' },
      requiredCapabilities: [],
    },
  };
  compiledPackage.manifest.bindingDigests = { 'binding-t': 'digest-b' };
  (compiledPackage.bindings as Record<string, unknown>)['binding-t'] = () => undefined;

  await assert.rejects(
    validateCompiledPackage(compiledPackage, policy()),
    (error: unknown) =>
      error instanceof PackageActivationError && error.code === 'BINDING_DIGEST_MISMATCH',
  );
});

test('G29: declared executable binding must be present before activation', async () => {
  const compiledPackage = await createCompiledPackage('1.0.0');
  compiledPackage.manifest.tools = {
    t: {
      toolId: 't',
      outputSchema: {},
      effect: 'none',
      execution: { kind: 'script', bindingId: 'binding-t', digest: 'digest-a' },
      requiredCapabilities: [],
    },
  };
  compiledPackage.manifest.bindingDigests = { 'binding-t': 'digest-a' };
  compiledPackage.manifest.packageId = await computeCompiledPackageId(
    compiledPackage.manifest,
    createSha256Fake(),
  );

  await assert.rejects(
    validateCompiledPackage(compiledPackage, policy()),
    (error: unknown) =>
      error instanceof PackageActivationError && error.code === 'MISSING_BINDING',
  );
});
