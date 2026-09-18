import assert from 'node:assert/strict';
import test from 'node:test';
import type { CapabilityId, PackageRegistry } from '../../src/v2/index.js';
import {
  PackageActivationError,
  StaticPackageRegistry,
  listRetainedPackageIds,
  preflightPackageActivation,
  resolveDefaultPackage,
  resolvePinnedPackage,
} from '../../src/package/index.js';
import {
  TEST_POLICY_BASE,
  createCompiledPackage,
  createSha256Fake,
} from './fixture.js';

const hostCapabilities = ['crypto-hash-sha256@1'] as const satisfies readonly CapabilityId[];

function validationPolicy() {
  return {
    ...TEST_POLICY_BASE,
    hostCapabilities,
    sha256: createSha256Fake(),
  };
}

test('G27/G28: cross-version registry keeps A pinned while B is default for new instances', async () => {
  const packageA = await createCompiledPackage('1.0.0');
  const packageB = await createCompiledPackage('2.0.0');
  const registry = new StaticPackageRegistry([packageB, packageA], packageB.manifest.packageId);

  const preflight = await preflightPackageActivation({
    registry,
    store: {
      async listPinnedPackageIds() {
        return [packageA.manifest.packageId];
      },
    },
    validationPolicy: validationPolicy(),
  });

  assert.equal(resolveDefaultPackage(registry).manifest.domainVersion, '2.0.0');
  assert.equal(resolvePinnedPackage(registry, packageA.manifest.packageId).manifest.domainVersion, '1.0.0');
  assert.equal(preflight.defaultPackage.manifest.packageId, packageB.manifest.packageId);
  assert.deepEqual(preflight.retainedPackageIds, [packageA.manifest.packageId]);
  assert.equal(preflight.retainedPackages[0]?.manifest.packageId, packageA.manifest.packageId);
});

test('G28: retained package id inspection is unique and deterministic', async () => {
  const result = await listRetainedPackageIds({
    async listPinnedPackageIds() {
      return ['pkg-z', 'pkg-a', 'pkg-z', 'pkg-b'];
    },
  });
  assert.deepEqual(result, ['pkg-a', 'pkg-b', 'pkg-z']);
});

test('G28/G29: missing retained pin aborts activation with no default/latest fallback', async () => {
  const packageB = await createCompiledPackage('2.0.0');
  const registry = new StaticPackageRegistry([packageB], packageB.manifest.packageId);

  await assert.rejects(
    preflightPackageActivation({
      registry,
      store: {
        async listPinnedPackageIds() {
          return ['package-a-that-was-not-retained'];
        },
      },
      validationPolicy: validationPolicy(),
    }),
    (error: unknown) =>
      error instanceof PackageActivationError &&
      error.code === 'MISSING_RETAINED_PIN' &&
      error.details[0] === 'package-a-that-was-not-retained',
  );
});

test('G27: PackageRegistry package id listing is deterministic across insertion order', async () => {
  const packageA = await createCompiledPackage('1.0.0');
  const packageB = await createCompiledPackage('2.0.0');
  const first = new StaticPackageRegistry([packageB, packageA], packageB.manifest.packageId);
  const second = new StaticPackageRegistry([packageA, packageB], packageB.manifest.packageId);
  assert.deepEqual(first.listPackageIds(), second.listPackageIds());
  assert.deepEqual(first.listPackageIds(), [...first.listPackageIds()].sort());
});

test('G29: preflight validates supplied packages before retained-pin inspection', async () => {
  const compiledPackage = await createCompiledPackage('2.0.0');
  compiledPackage.manifest.packageId = 'corrupt-id';
  const registry = new StaticPackageRegistry([compiledPackage], compiledPackage.manifest.packageId);
  let pinRead = false;

  await assert.rejects(
    preflightPackageActivation({
      registry,
      store: {
        async listPinnedPackageIds() {
          pinRead = true;
          return [];
        },
      },
      validationPolicy: validationPolicy(),
    }),
    (error: unknown) =>
      error instanceof PackageActivationError && error.code === 'PACKAGE_ID_MISMATCH',
  );

  assert.equal(pinRead, false);
});

test('G29: inconsistent registry key cannot substitute a different package identity', async () => {
  const packageA = await createCompiledPackage('1.0.0');
  const alias = 'registry-alias-that-is-not-package-a';
  const registry: PackageRegistry = {
    defaultPackageId: alias,
    listPackageIds: () => [alias],
    get: (packageId) => (packageId === alias ? packageA : undefined),
    has: (packageId) => packageId === alias,
  };
  let pinRead = false;

  await assert.rejects(
    preflightPackageActivation({
      registry,
      store: {
        async listPinnedPackageIds() {
          pinRead = true;
          return [];
        },
      },
      validationPolicy: validationPolicy(),
    }),
    (error: unknown) =>
      error instanceof PackageActivationError && error.code === 'PACKAGE_ID_MISMATCH',
  );
  assert.equal(pinRead, false);
});

test('G29: default package must be part of the validated registry enumeration', async () => {
  const packageA = await createCompiledPackage('1.0.0');
  const packageB = await createCompiledPackage('2.0.0');
  const registry: PackageRegistry = {
    defaultPackageId: packageB.manifest.packageId,
    listPackageIds: () => [packageA.manifest.packageId],
    get: (packageId) => {
      if (packageId === packageA.manifest.packageId) return packageA;
      if (packageId === packageB.manifest.packageId) return packageB;
      return undefined;
    },
    has: (packageId) =>
      packageId === packageA.manifest.packageId || packageId === packageB.manifest.packageId,
  };
  let pinRead = false;

  await assert.rejects(
    preflightPackageActivation({
      registry,
      store: {
        async listPinnedPackageIds() {
          pinRead = true;
          return [];
        },
      },
      validationPolicy: validationPolicy(),
    }),
    (error: unknown) =>
      error instanceof PackageActivationError && error.code === 'DEFAULT_PACKAGE_MISSING',
  );
  assert.equal(pinRead, false);
});
