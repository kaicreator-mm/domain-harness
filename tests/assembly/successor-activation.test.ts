// I-03-ASSEMBLY adversarial acceptance 2/3/5/10 — activation profile
// dispatch: the DomainHarness-owned successor validator independently
// revalidates package integrity/schema/bounds and host maxima, retained
// 0.2/2/2 fixtures keep their exact historical identity and validation, and a
// mixed registry activates through exact profile dispatch on one Runtime.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createDomainRuntime } from '../../packages/domain-harness/src/runtime/index.js';
import { StaticPackageRegistry } from '../../packages/domain-harness/src/package/registry.js';
import {
  PackageActivationError,
  validateCompiledPackageByProfile,
  validateSuccessorCompiledPackage,
} from '../../packages/domain-harness/src/package/index.js';
import { computeCompiledPackageId } from '../../packages/domain-harness/src/package/validation.js';
import {
  LEGACY_COMPILED_ARTIFACT_PROFILE,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  type PackageDataBounds,
  type TargetCompiledDomainPackage,
} from '../../packages/domain-harness/src/v2/index.js';
import type { RuntimeStore } from '../../packages/domain-harness/src/v2/contracts/store.js';
import {
  ASSEMBLY_BOUNDS,
  HOST_MAXIMA,
  AssemblyMemoryStore,
  assemblyTarget,
  compileAssemblyPackage,
  createAssemblyHost,
} from './helpers.js';

const LEGACY_DOMAIN_ID = 'assembly.retained-legacy';

/** Retained 0.2/2/2 fixture: hand-built engine-2 manifest, historical identity seam. */
function retainedLegacyPackage(sha256: { digestUtf8(value: string): Promise<string> }): Promise<TargetCompiledDomainPackage> {
  const manifest = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: LEGACY_DOMAIN_ID,
    domainVersion: '1.0.0-retained',
    packageId: 'pending',
    targetProfileId: 'assembly-host@1',
    requiredCapabilities: [],
    workflows: {
      retained: {
        workflowId: 'retained',
        definition: {
          initial: 'idle',
          states: {
            idle: {
              final: false,
              done: [],
              error: [],
              events: { ADVANCE: { routes: [{ target: 'finished' }] } },
            },
            finished: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 8 },
        },
        messageContracts: { ADVANCE: { type: 'ADVANCE', payloadSchema: {} } },
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  return computeCompiledPackageId(manifest, sha256).then((packageId) => ({
    manifest: { ...manifest, packageId },
    bindings: {},
  }));
}

function profilePolicy(
  sha256: { digestUtf8(value: string): Promise<string> },
  bounds: PackageDataBounds = HOST_MAXIMA,
) {
  return {
    supportedProfiles: [LEGACY_COMPILED_ARTIFACT_PROFILE, SUCCESSOR_COMPILED_ARTIFACT_PROFILE],
    hostCapabilities: [
      'crypto-hash-sha256@1',
      'compiled-package-module@1',
      'inventory-native@1',
    ] as const,
    sha256,
    targetProfileId: 'assembly-host@1',
    supportedPackageDataBounds: bounds,
  };
}

test('I-03-ASSEMBLY: publicly compiled successor package validates through the installed successor validator', async () => {
  const compiled = compileAssemblyPackage({ workflows: [{ workflowId: 'parent' }] });
  const host = createAssemblyHost();
  const policy = profilePolicy(host.sha256);
  const validated = await validateCompiledPackageByProfile(
    { manifest: compiled.manifest, bindings: {}, domainData: compiled.domainData },
    policy,
    { successor: validateSuccessorCompiledPackage },
  );
  assert.equal(validated.manifest.packageId, compiled.manifest.packageId);
  assert.equal(validated.manifest.executionEngineMajor, 3);
});

test('I-03-ASSEMBLY: successor activation independently revalidates integrity, schema, bounds and host maxima', async () => {
  const host = createAssemblyHost();
  const policy = profilePolicy(host.sha256);
  const compiled = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }],
    domainData: [{ key: 'tier', value: { level: 1 }, valueSchema: { type: 'object', properties: { level: { type: 'number' } }, additionalProperties: false } }],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [{ kind: 'domain-data', key: 'tier' }],
      outputSchema: { type: 'object' },
    }],
  });

  const tamperedValue = structuredClone(compiled);
  tamperedValue.domainData.tier = { level: 999 };
  await assert.rejects(
    validateCompiledPackageByProfile(
      { manifest: tamperedValue.manifest, bindings: {}, domainData: tamperedValue.domainData },
      policy,
      { successor: validateSuccessorCompiledPackage },
    ),
    /content digest does not match descriptor|PACKAGE_ID_MISMATCH/u,
  );

  const tamperedBounds = structuredClone(compiled.manifest);
  (tamperedBounds.packageDataBounds as { maxDomainDataEntries: number }).maxDomainDataEntries =
    tamperedBounds.packageDataBounds!.maxDomainDataEntries + 1;
  await assert.rejects(
    validateCompiledPackageByProfile(
      { manifest: tamperedBounds, bindings: {}, domainData: compiled.domainData },
      policy,
      { successor: validateSuccessorCompiledPackage },
    ),
    (error: unknown) => error instanceof PackageActivationError,
  );

  const missingValues = { manifest: compiled.manifest, bindings: {} };
  await assert.rejects(
    validateCompiledPackageByProfile(missingValues, policy, { successor: validateSuccessorCompiledPackage }),
    /must bundle its domainData values record/u,
  );

  const exceedHostMaxima = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }],
    target: {
      ...assemblyTarget(),
      packageDataBounds: {
        maxDomainDataEntries: HOST_MAXIMA.maxDomainDataEntries + 1,
        maxDomainDataEntryCanonicalBytes: ASSEMBLY_BOUNDS.maxDomainDataEntryCanonicalBytes,
        maxTotalDomainDataCanonicalBytes: ASSEMBLY_BOUNDS.maxTotalDomainDataCanonicalBytes,
        maxBusinessSources: ASSEMBLY_BOUNDS.maxBusinessSources,
        maxSchemaCanonicalBytes: ASSEMBLY_BOUNDS.maxSchemaCanonicalBytes,
      },
    },
  });
  await assert.rejects(
    validateCompiledPackageByProfile(
      { manifest: exceedHostMaxima.manifest, bindings: {}, domainData: exceedHostMaxima.domainData },
      policy,
      { successor: validateSuccessorCompiledPackage },
    ),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INCOMPATIBLE_PACKAGE'
      && error.details.some((detail) => detail.includes('maxDomainDataEntries')),
  );
});

test('I-03-ASSEMBLY: retained 0.2/2/2 fixture keeps its exact historical identity and validation path', async () => {
  const host = createAssemblyHost();
  const legacy = await retainedLegacyPackage(host.sha256);
  const legacyAgain = await retainedLegacyPackage(host.sha256);
  assert.equal(legacy.manifest.packageId, legacyAgain.manifest.packageId);

  const validated = await validateCompiledPackageByProfile(legacy, profilePolicy(host.sha256));
  assert.equal(validated.manifest.packageId, legacy.manifest.packageId);
  assert.equal(validated.manifest.executionEngineMajor, 2);
  assert.equal(validated.manifest.formatVersion, '0.2');

  // Historical single-profile policy shape still validates the retained
  // fixture exactly (legacy policy lock).
  const legacyValidated = await validateCompiledPackageByProfile(legacy, {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    hostCapabilities: profilePolicy(host.sha256).hostCapabilities,
    sha256: host.sha256,
  });
  assert.equal(legacyValidated.manifest.packageId, legacy.manifest.packageId);
});

test('I-03-ASSEMBLY: mixed retained+successor registry activates on one Runtime through exact profile dispatch', async () => {
  const host = createAssemblyHost();
  const legacy = await retainedLegacyPackage(host.sha256);
  const successor = compileAssemblyPackage({ workflows: [{ workflowId: 'parent' }] });
  const registry = new StaticPackageRegistry(
    [
      legacy,
      { manifest: successor.manifest, bindings: {}, domainData: successor.domainData },
    ],
    legacy.manifest.packageId,
  );

  const runtime = await createDomainRuntime({
    packageRegistry: registry,
    store: new AssemblyMemoryStore() as unknown as RuntimeStore,
    bindings: host,
    supportedPackageDataBounds: { ...HOST_MAXIMA },
  });
  assert.equal(typeof runtime.send, 'function');

  // A successor package cannot activate on a runtime that did not enable
  // successor support (no host maxima declared).
  const successorOnly = new StaticPackageRegistry(
    [{ manifest: successor.manifest, bindings: {}, domainData: successor.domainData }],
    successor.manifest.packageId,
  );
  await assert.rejects(
    createDomainRuntime({
      packageRegistry: successorOnly,
      store: new AssemblyMemoryStore() as unknown as RuntimeStore,
      bindings: host,
    }),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INCOMPATIBLE_PACKAGE'
      && error.message.includes('profile is not enabled'),
  );

  // A torn manifest in the registry fails closed at activation.
  const torn = structuredClone(successor.manifest);
  torn.executionEngineMajor = 2;
  const tornRegistry = new StaticPackageRegistry(
    [{ manifest: torn, bindings: {}, domainData: successor.domainData }],
    torn.packageId,
  );
  await assert.rejects(
    createDomainRuntime({
      packageRegistry: tornRegistry,
      store: new AssemblyMemoryStore() as unknown as RuntimeStore,
      bindings: host,
      supportedPackageDataBounds: { ...HOST_MAXIMA },
    }),
    (error: unknown) => error instanceof PackageActivationError
      && error.code === 'INCOMPATIBLE_PACKAGE',
  );
});
