// I-03-ASSEMBLY R1 repair adversarial coverage (findings P1-1 / P2-2 / P2-3):
// the admitted successor package is a DomainHarness-owned deep-immutable
// canonical snapshot (mutate-after-activation cannot change any read), the
// public emitter preserves own special keys (`__proto__`, `constructor`)
// through real compile -> emit -> ESM import -> activate -> projection read,
// and activation independently rejects forged self-consistent artifacts whose
// projections depend on undeclared Domain Data keys / Business Sources before
// execution. Retained 0.2/2/2 identity semantics stay exactly historical.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDomainRuntime } from '../../packages/domain-harness/src/runtime/index.js';
import { StaticPackageRegistry } from '../../packages/domain-harness/src/package/registry.js';
import {
  PackageActivationError,
  validateCompiledPackageByProfile,
  validateSuccessorCompiledPackage,
} from '../../packages/domain-harness/src/package/index.js';
import { computeCompiledPackageId } from '../../packages/domain-harness/src/package/validation.js';
import { computeCanonicalJsonDigest } from '../../packages/domain-harness/src/contracts/identity.js';
import {
  LEGACY_COMPILED_ARTIFACT_PROFILE,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  type PackageDataBounds,
  type TargetCompiledDomainPackage,
} from '../../packages/domain-harness/src/v2/index.js';
import type { RuntimeStore } from '../../packages/domain-harness/src/v2/contracts/store.js';
import type { ProjectionSnapshot } from '../../packages/domain-harness/src/v2/contracts/projection.js';
import { emitTargetCompiledPackageModule } from '../../packages/domain-harness-compiler/src/package/module-emitter.js';
import {
  ASSEMBLY_BINDING_CONTENTS,
  HOST_MAXIMA,
  AssemblyMemoryStore,
  assemblyBindingModules,
  compileAssemblyPackage,
  createAssemblyHost,
} from './helpers.js';

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

interface TierFixture {
  readonly packageId: string;
  readonly input: {
    manifest: TargetCompiledDomainPackage['manifest'];
    bindings: Record<string, unknown>;
    domainData: Record<string, unknown>;
  };
}

function tierFixture(level: number): TierFixture {
  const compiled = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }],
    domainData: [{ key: 'tier', value: { level } }],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [{ kind: 'domain-data', key: 'tier' }],
      outputSchema: { type: 'object', additionalProperties: true },
    }],
  });
  return {
    packageId: compiled.manifest.packageId,
    input: { manifest: compiled.manifest, bindings: {}, domainData: compiled.domainData as Record<string, unknown> },
  };
}

function ownKeys(value: object): string[] {
  return Object.getOwnPropertyNames(value);
}

test('R1-P1: admitted successor package is an owned deep-immutable snapshot, immune to caller mutation', async () => {
  const host = createAssemblyHost();
  const policy = profilePolicy(host.sha256);
  const fixture = tierFixture(1);
  // Hostile caller keeps mutable aliases into everything it handed over.
  const hostile = structuredClone(fixture.input);

  const validated = await validateCompiledPackageByProfile(
    hostile,
    policy,
    { successor: validateSuccessorCompiledPackage },
  );
  assert.notEqual(validated, hostile);
  assert.notEqual(validated.manifest, hostile.manifest);
  assert.notEqual(validated.domainData, hostile.domainData);
  assert.equal(validated.manifest.packageId, fixture.packageId);

  // Nested material is frozen at every depth; the suites execute in sloppy
  // CJS via tsx, so each frozen write gets its own strict-mode function body.
  assert.throws(() => {
    'use strict';
    (validated.domainData!.tier as { level: number }).level = 999;
  }, TypeError);
  assert.throws(() => {
    'use strict';
    delete (validated.domainData as Record<string, unknown>).tier;
  }, TypeError);
  assert.throws(() => {
    'use strict';
    (validated.manifest.domainData![0] as { key: string }).key = 'smuggled';
  }, TypeError);
  assert.throws(() => {
    'use strict';
    (validated.manifest.businessSources![0] as unknown as { valueSchema: { type: string } }).valueSchema.type = 'string';
  }, TypeError, 'declared descriptor material must be equally frozen');

  // Caller-side mutation of the retained original changes nothing the
  // runtime can observe: same packageId, same reads, every time.
  (hostile.domainData.tier as { level: number }).level = 999;
  (hostile.manifest.domainData[0] as { contentDigest: string }).contentDigest = 'forged';
  assert.deepEqual(
    JSON.parse(JSON.stringify(validated.domainData!.tier)),
    { level: 1 },
  );
  assert.equal(validated.manifest.domainData![0]!.contentDigest !== 'forged', true);
  assert.equal(validated.manifest.packageId, fixture.packageId);
});

test('R1-P1: runtime projection reads stay pinned to the admitted snapshot across hostile caller mutation', async () => {
  const host = createAssemblyHost();
  const primary = tierFixture(1);
  const secondary = tierFixture(2);
  const hostilePrimary = structuredClone(primary.input);
  const hostileSecondary = structuredClone(secondary.input);

  const runtime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry(
      [
        hostilePrimary as unknown as TargetCompiledDomainPackage,
        hostileSecondary as unknown as TargetCompiledDomainPackage,
      ],
      primary.packageId,
    ),
    store: new AssemblyMemoryStore() as unknown as RuntimeStore,
    bindings: host,
    supportedPackageDataBounds: { ...HOST_MAXIMA },
  });

  async function readTier(): Promise<{ level: number }> {
    const result = await runtime.query({ kind: 'projection', projectionId: 'overview', key: 'case-1' });
    const snapshot = (result as { value: ProjectionSnapshot }).value;
    const domainData = (snapshot.value as { domainData: Array<{ value: { level: number } }> }).domainData;
    return domainData[0]!.value;
  }

  assert.equal((await readTier()).level, 1);

  // Mutate both caller-retained package bodies after activation.
  (hostilePrimary.domainData.tier as { level: number }).level = 999;
  (hostileSecondary.domainData.tier as { level: number }).level = 777;
  assert.equal((await readTier()).level, 1, 'activated Domain Data cannot move under the same packageId');
  assert.equal((await readTier()).level, 1, 'repeated reads stay constant');

  // The source registry (public StaticPackageRegistry contract) still serves
  // the caller's own objects; only runtime-internal resolution is pinned.
  const hostileAgain = tierFixture(1);
  assert.equal(
    (hostileAgain.input.domainData.tier as { level: number }).level,
    1,
    'compiled fixtures remain caller-owned and mutable before admission',
  );
});

test('R1-P2: own __proto__/constructor keys survive real compile -> emit -> ESM import -> activate -> projection read', async () => {
  const host = createAssemblyHost();
  const specialValue = JSON.parse('{"__proto__":{"level":1},"constructor":{"deep":true},"normal":5}');
  const compiled = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }],
    domainData: [
      { key: 'tier', value: specialValue },
      { key: '__proto__', value: 42 },
      { key: 'constructor', value: 7 },
    ],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [
        { kind: 'domain-data', key: 'tier' },
        { kind: 'domain-data', key: '__proto__' },
        { kind: 'domain-data', key: 'constructor' },
      ],
      outputSchema: { type: 'object', additionalProperties: true },
    }],
  });
  const source = emitTargetCompiledPackageModule({
    manifest: compiled.manifest,
    bindingModules: assemblyBindingModules(compiled.manifest),
    domainData: compiled.domainData,
  });
  // The raw emitted text must not embed the special keys as bare object
  // literal keys (double-encoded JSON.parse rehydration instead).
  assert.doesNotMatch(source, /export const domainData = Object\.freeze\(\{/u);

  const dir = await mkdtemp(join(tmpdir(), 'dh450-r1-emit-'));
  await mkdir(join(dir, 'bindings'), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
  await writeFile(join(dir, 'pkg.mjs'), source, 'utf8');
  for (const reference of Object.values(assemblyBindingModules(compiled.manifest))) {
    await writeFile(
      join(dir, reference.moduleSpecifier),
      `export const ${reference.exportName ?? 'binding'} = ${JSON.stringify(reference.content)};\n`,
      'utf8',
    );
  }
  const emitted = await import(pathToFileURL(join(dir, 'pkg.mjs')).href) as {
    default: TargetCompiledDomainPackage;
  };
  const emittedPackage = emitted.default;

  // Object-literal semantics must not have diverted the special keys: tier
  // keeps __proto__/constructor as own data keys, and its prototype is the
  // standard one — not the injected {level: 1} object.
  const emittedTier = emittedPackage.domainData!.tier as unknown as Record<string, unknown>;
  assert.deepEqual(
    ownKeys(emittedTier).sort(),
    ['__proto__', 'constructor', 'normal'],
  );
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(emittedTier, '__proto__')!.value,
    { level: 1 },
  );
  assert.equal(Object.getPrototypeOf(emittedTier), Object.prototype);
  assert.deepEqual(ownKeys(emittedPackage.domainData as object).sort(), ['__proto__', 'constructor', 'tier']);
  assert.equal((emittedPackage.domainData as Record<string, unknown>)['__proto__'], 42);
  assert.equal((emittedPackage.domainData as Record<string, unknown>).constructor, 7);

  // The emitted artifact activates through the real successor validator:
  // descriptor/value digest bijection holds over the special own keys.
  const policy = profilePolicy(host.sha256);
  const validated = await validateCompiledPackageByProfile(
    emittedPackage,
    policy,
    { successor: validateSuccessorCompiledPackage },
  );
  assert.equal(validated.manifest.packageId, compiled.manifest.packageId);
  assert.equal(validated.domainData!['__proto__'], 42);
  assert.equal(validated.domainData!.constructor, 7, 'own-key value, never the inherited Object constructor');

  // And a real Runtime reads the special keys from the admitted snapshot.
  const runtime = await createDomainRuntime({
    packageRegistry: new StaticPackageRegistry(
      [emittedPackage],
      compiled.manifest.packageId,
    ),
    store: new AssemblyMemoryStore() as unknown as RuntimeStore,
    bindings: host,
    supportedPackageDataBounds: { ...HOST_MAXIMA },
  });
  const result = await runtime.query({ kind: 'projection', projectionId: 'overview', key: 'case-1' });
  const snapshot = (result as { value: ProjectionSnapshot }).value;
  const domainData = (snapshot.value as { domainData: Array<{ key: string; value: unknown }> }).domainData;
  const byKey = new Map(domainData.map((entry) => [entry.key, entry.value]));
  const readTier = byKey.get('tier') as Record<string, unknown>;
  assert.deepEqual(ownKeys(readTier).sort(), ['__proto__', 'constructor', 'normal']);
  assert.deepEqual(JSON.parse(JSON.stringify(Object.getOwnPropertyDescriptor(readTier, '__proto__')!.value)), { level: 1 });
  assert.equal(byKey.get('__proto__'), 42);
  assert.equal(byKey.get('constructor'), 7);
});

test('R1-P2: forged self-consistent artifacts with undeclared projection dependencies fail at activation, not projection read', async () => {
  const host = createAssemblyHost();
  const policy = profilePolicy(host.sha256);
  const compiled = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }],
    domainData: [{ key: 'tier', value: { level: 1 } }],
    businessSources: [{ source: 'crm', valueSchema: { type: 'object', additionalProperties: true } }],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [
        { kind: 'domain-data', key: 'tier' },
        { kind: 'business', source: 'crm', selector: {} },
      ],
      outputSchema: { type: 'object', additionalProperties: true },
    }],
  });

  async function forgeWith(
    extraDependency: Record<string, unknown>,
  ): Promise<TargetCompiledDomainPackage> {
    const forged = structuredClone(compiled.manifest) as unknown as {
      packageId: string;
      projections: Record<string, { dependencies: unknown[] }>;
    };
    forged.projections.overview!.dependencies.push(extraDependency);
    const { packageId: _omitted, ...identityMaterial } = forged;
    forged.packageId = await computeCanonicalJsonDigest(identityMaterial, host.sha256);
    return {
      manifest: forged as unknown as TargetCompiledDomainPackage['manifest'],
      bindings: {},
      domainData: structuredClone(compiled.domainData as Record<string, unknown>),
    };
  }

  // Positive control: identity recomputation over the unextended manifest
  // keeps the package admissible (rejection below comes from closure, not
  // from a broken forged identity).
  const untouched = structuredClone(compiled.manifest) as unknown as { packageId: string };
  const { packageId: _keep, ...untouchedIdentity } = untouched;
  const recomputed = await computeCanonicalJsonDigest(untouchedIdentity, host.sha256);
  assert.equal(recomputed, compiled.manifest.packageId);
  await assert.doesNotReject(
    validateCompiledPackageByProfile(
      { manifest: compiled.manifest, bindings: {}, domainData: compiled.domainData },
      policy,
      { successor: validateSuccessorCompiledPackage },
    ),
  );

  for (const [label, dependency, pattern] of [
    ['undeclared domain-data key', { kind: 'domain-data', key: 'undeclared' }, /undeclared Domain Data key "undeclared"/u],
    ['undeclared business source', { kind: 'business', source: 'ghost', selector: {} }, /undeclared Business Source "ghost"/u],
    ['inherited-name key', { kind: 'domain-data', key: 'constructor' }, /undeclared Domain Data key "constructor"/u],
  ] as const) {
    const forged = await forgeWith(dependency as Record<string, unknown>);
    await assert.rejects(
      validateCompiledPackageByProfile(forged, policy, { successor: validateSuccessorCompiledPackage }),
      (error: unknown) => error instanceof PackageActivationError
        && error.code === 'INVALID_COMPILED_PACKAGE'
        && pattern.test(error.message),
      `${label} must fail activation admission`,
    );
    // The same forged artifact fails real Runtime creation (not first read).
    await assert.rejects(
      createDomainRuntime({
        packageRegistry: new StaticPackageRegistry([forged], forged.manifest.packageId),
        store: new AssemblyMemoryStore() as unknown as RuntimeStore,
        bindings: host,
        supportedPackageDataBounds: { ...HOST_MAXIMA },
      }),
      PackageActivationError,
      `${label} must fail runtime activation`,
    );
  }
});

test('R1-P1: retained 0.2/2/2 validation keeps its exact historical caller-identity semantics', async () => {
  const host = createAssemblyHost();
  const manifest = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'assembly.retained-legacy',
    domainVersion: '1.0.0-retained',
    packageId: 'pending',
    targetProfileId: 'assembly-host@1',
    requiredCapabilities: [],
    workflows: {},
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  const legacy: TargetCompiledDomainPackage = {
    manifest: manifest as unknown as TargetCompiledDomainPackage['manifest'],
    bindings: {},
  };
  legacy.manifest.packageId = await computeCompiledPackageId(legacy.manifest, host.sha256);

  const validated = await validateCompiledPackageByProfile(legacy, profilePolicy(host.sha256));
  assert.equal(validated, legacy, 'legacy validation returns the caller’s exact object (historical identity)');
  assert.equal(Object.isFrozen(validated.manifest), false, 'legacy material keeps historical (unfrozen) semantics');
});

test('R1-P1: executable binding slots become an owned frozen own-key view while handles stay identity-bound', async () => {
  const host = createAssemblyHost();
  const compiled = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }],
    domainData: [{ key: 'tier', value: { level: 1 } }],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [{ kind: 'domain-data', key: 'tier' }],
      outputSchema: { type: 'object', additionalProperties: true },
    }],
  });
  const cryptoHandle = { handle: 'crypto' };
  const protoHandle = { handle: 'proto' };
  const bindings = Object.create(null) as Record<string, unknown>;
  bindings['assembly-sha256-v1'] = cryptoHandle;
  bindings['__proto__'] = protoHandle;

  const validated = await validateCompiledPackageByProfile(
    { manifest: compiled.manifest, bindings, domainData: compiled.domainData },
    profilePolicy(host.sha256),
    { successor: validateSuccessorCompiledPackage },
  );
  assert.deepEqual(ownKeys(validated.bindings as object).sort(), ['__proto__', 'assembly-sha256-v1']);
  assert.equal(
    Object.prototype.hasOwnProperty.call(validated.bindings, '__proto__'),
    true,
    'a __proto__ binding id stays an own binding slot',
  );
  assert.equal((validated.bindings as Record<string, unknown>)['assembly-sha256-v1'], cryptoHandle);
  assert.equal(Object.getOwnPropertyDescriptor(validated.bindings, '__proto__')!.value, protoHandle);
  assert.equal(Object.isFrozen(validated.bindings), true);
  assert.throws(() => {
    'use strict';
    (validated.bindings as Record<string, unknown>)['smuggled'] = { handle: 'x' };
  }, TypeError);
  assert.equal(ASSEMBLY_BINDING_CONTENTS['assembly-sha256-v1'] !== undefined, true, 'fixture binding content exists');
});
