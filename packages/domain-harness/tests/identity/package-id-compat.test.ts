import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompiledPackageManifest } from '../../src/v2/index.js';
import {
  PackageActivationError,
  canonicalPackageIdentityMaterial,
  computeCompiledPackageId,
  validateCompiledPackage,
} from '../../src/package/index.js';
import {
  TEST_POLICY_BASE,
  createCompiledPackage,
  createSha256Fake,
} from '../package/fixture.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Exact v0.2 canonicalizer retained here as a compatibility oracle. */
function legacyCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => legacyCanonicalize(entry));
  if (isRecord(value)) {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) result[key] = legacyCanonicalize(value[key]);
    return result;
  }
  return value;
}

function legacyPackageIdentityMaterial(manifest: CompiledPackageManifest): string {
  const { packageId: _packageId, ...identityMaterial } = manifest;
  const encoded = JSON.stringify(legacyCanonicalize(identityMaterial));
  assert.notEqual(encoded, undefined);
  return encoded as string;
}

function validationPolicy() {
  return {
    ...TEST_POLICY_BASE,
    hostCapabilities: [],
    sha256: createSha256Fake(),
  };
}

test('T-001: packageId semantics are unchanged by shared canonicalization', async () => {
  const compiledPackage = await createCompiledPackage('1.2.3');
  const manifest = compiledPackage.manifest;

  const reordered: CompiledPackageManifest = {
    bindingDigests: manifest.bindingDigests,
    schemas: manifest.schemas,
    projections: manifest.projections,
    tools: manifest.tools,
    workflows: manifest.workflows,
    requiredCapabilities: manifest.requiredCapabilities,
    targetProfileId: manifest.targetProfileId,
    packageId: manifest.packageId,
    domainVersion: manifest.domainVersion,
    domainId: manifest.domainId,
    executionEngineMajor: manifest.executionEngineMajor,
    runtimeContractMajor: manifest.runtimeContractMajor,
    formatVersion: manifest.formatVersion,
    ...(manifest.compatibility === undefined ? {} : { compatibility: manifest.compatibility }),
  };

  assert.equal(
    canonicalPackageIdentityMaterial(reordered),
    canonicalPackageIdentityMaterial(manifest),
  );
  assert.equal(
    await computeCompiledPackageId(reordered, createSha256Fake()),
    manifest.packageId,
  );
});

test('T-001: packageId preserves exact v0.2 bytes for a legal __proto__ JSON key', async () => {
  const compiledPackage = await createCompiledPackage('1.2.3');
  const manifest = JSON.parse(JSON.stringify(compiledPackage.manifest)) as CompiledPackageManifest;
  manifest.compatibility = JSON.parse(
    '{"z":2,"__proto__":{"legacy":true},"a":1}',
  ) as NonNullable<CompiledPackageManifest['compatibility']>;

  const legacyMaterial = legacyPackageIdentityMaterial(manifest);
  assert.equal(canonicalPackageIdentityMaterial(manifest), legacyMaterial);
  assert.equal(legacyMaterial.includes('"__proto__"'), false);

  const sha256 = createSha256Fake();
  const legacyPackageId = await sha256.digestUtf8(legacyMaterial);
  assert.equal(await computeCompiledPackageId(manifest, createSha256Fake()), legacyPackageId);

  manifest.packageId = legacyPackageId;
  const validated = await validateCompiledPackage(
    { manifest, bindings: {} },
    validationPolicy(),
  );
  assert.equal(validated.manifest.packageId, legacyPackageId);
});

test('T-001: shared identity failures retain PackageActivationError taxonomy', async () => {
  class CustomCompatibility {
    readonly enabled = true;
  }

  const symbolKeyed: Record<string | symbol, unknown> = { visible: true };
  symbolKeyed[Symbol('hidden')] = 'not-json';

  const sparse: unknown[] = [];
  sparse.length = 2;
  sparse[1] = 'present';

  const nonEnumerable: Record<string, unknown> = { visible: true };
  Object.defineProperty(nonEnumerable, 'hidden', { value: 'not-json', enumerable: false });

  const accessor: Record<string, unknown> = {};
  Object.defineProperty(accessor, 'dynamic', {
    enumerable: true,
    get() {
      return 'not-data';
    },
  });

  const cases: readonly [string, unknown][] = [
    ['custom prototype', new CustomCompatibility()],
    ['symbol-keyed nested object', { nested: symbolKeyed }],
    ['sparse nested array', { nested: sparse }],
    ['non-enumerable nested property', { nested: nonEnumerable }],
    ['accessor nested property', { nested: accessor }],
  ];

  for (const [name, compatibility] of cases) {
    const compiledPackage = await createCompiledPackage(`taxonomy-${name}`);
    compiledPackage.manifest.compatibility = compatibility as NonNullable<
      CompiledPackageManifest['compatibility']
    >;

    await assert.rejects(
      validateCompiledPackage(compiledPackage, validationPolicy()),
      (error: unknown) =>
        error instanceof PackageActivationError && error.code === 'INVALID_COMPILED_PACKAGE',
      name,
    );
  }
});
