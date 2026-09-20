import assert from 'node:assert/strict';
import test from 'node:test';
import type { CompiledPackageManifest } from '../../src/v2/index.js';
import {
  canonicalPackageIdentityMaterial,
  computeCompiledPackageId,
} from '../../src/package/index.js';
import { createCompiledPackage, createSha256Fake } from '../package/fixture.js';

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
