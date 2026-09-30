// I-03-ASSEMBLY adversarial acceptance 1/3/4/11 — public compiler emission:
// the successor 0.3/2/3 tuple is emitted only with complete valid successor
// material, cross-profile tuples fail closed, successor package identity is
// material-bound and ordering-deterministic, and the public export surface is
// wired.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BusinessSourceCompileError,
  DomainDataCompileError,
  PUBLIC_COMPILER_OUTPUT_PROFILE,
  compileDomainPackage,
} from '../../packages/domain-harness-compiler/src/index.js';
import {
  assertCompiledPackageManifest,
  CompiledManifestValidationError,
} from '../../packages/domain-harness-compiler/src/package/manifest.js';
import { emitTargetCompiledPackageModule } from '../../packages/domain-harness-compiler/src/package/module-emitter.js';
import {
  ASSEMBLY_BINDING_CONTENTS,
  assemblyBindingModules,
  assemblyInventoryTool,
  assemblyRawPackage,
  assemblyTarget,
  compileAssemblyPackage,
} from './helpers.js';

test('I-03-ASSEMBLY: public compiler emits exactly the successor 0.3/2/3 package with complete successor material', () => {
  const compiled = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }],
    domainData: [{ key: 'tier', value: { level: 1 }, valueSchema: { type: 'object', additionalProperties: true } }],
    businessSources: [{ source: 'crm', valueSchema: { type: 'object', additionalProperties: true } }],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [
        { kind: 'domain-data', key: 'tier' },
        { kind: 'business', source: 'crm', selector: { accountId: '*' } },
      ],
      outputSchema: { type: 'object', additionalProperties: true },
    }],
  });

  assert.equal(compiled.manifest.formatVersion, '0.3');
  assert.equal(compiled.manifest.runtimeContractMajor, 2);
  assert.equal(compiled.manifest.executionEngineMajor, 3);
  assert.equal(PUBLIC_COMPILER_OUTPUT_PROFILE.formatVersion, '0.3');
  assert.equal(compiled.manifest.schemaContractVersion, 'domainharness-json-schema/1');
  assert.equal(compiled.manifest.domainData?.length, 1);
  assert.equal(compiled.manifest.domainData?.[0]?.key, 'tier');
  assert.equal(compiled.manifest.businessSources?.length, 1);
  assert.equal(compiled.manifest.businessSources?.[0]?.source, 'crm');
  assert.deepEqual(JSON.parse(JSON.stringify(compiled.domainData)), { tier: { level: 1 } });
  assert.doesNotThrow(() => assertCompiledPackageManifest(compiled.manifest));

  const effect = (compiled.manifest.workflows.parent?.definition as {
    states: { acting: { effects: Array<{ rejected: unknown[] }> } };
  }).states.acting.effects[0]!;
  assert.ok(Array.isArray(effect.rejected) && effect.rejected.length >= 1);
});

test('I-03-ASSEMBLY: successor emission fails closed when required successor material is absent or invalid', () => {
  assert.throws(
    () => compileDomainPackage({
      raw: assemblyRawPackage([{ workflowId: 'parent' }]),
      domainVersion: '1.0.0-assembly',
      target: { ...assemblyTarget(), packageDataBounds: undefined },
      bindingContents: ASSEMBLY_BINDING_CONTENTS,
    }),
    /requires target\.packageDataBounds/u,
  );

  const noRejectedRoutes = assemblyRawPackage([{
    workflowId: 'parent',
    rejected: [],
  }]);
  noRejectedRoutes.workflows.get('parent')!.states.acting!.effects = [
    {
      kind: 'domain-message',
      targetExpression: '$.child',
      messageType: 'NOTIFY',
    },
  ];
  assert.throws(
    () => compileAssemblyPackage({ raw: noRejectedRoutes }),
    /requires a non-empty total 'rejected' route array/u,
  );

  const nonTotalFallback = assemblyRawPackage([{
    workflowId: 'parent',
    rejected: [{ target: 'rejected', when: '$.never' }],
  }]);
  assert.throws(
    () => compileAssemblyPackage({ raw: nonTotalFallback }),
    /final domain-message rejected route must be unconditional/u,
  );

  const unknownRejectedTarget = assemblyRawPackage([{
    workflowId: 'parent',
    rejected: [{ target: 'nowhere' }],
  }]);
  assert.throws(
    () => compileAssemblyPackage({ raw: unknownRejectedTarget }),
    /targets unknown state 'nowhere'/u,
  );

  assert.throws(
    () => compileAssemblyPackage({
      projections: [{
        projectionId: 'overview',
        expression: '$',
        dependencies: [{ kind: 'domain-data', key: 'undeclared' }],
        outputSchema: { type: 'object' },
      }],
    }),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes("undeclared Domain Data key 'undeclared'")),
  );

  assert.throws(
    () => compileAssemblyPackage({
      domainData: [{ key: 'orphan', value: 1 }],
    }),
    (error: unknown) => error instanceof DomainDataCompileError
      && error.issues.some((issue) => issue.includes("orphan Domain Data key 'orphan'")),
  );

  assert.throws(
    () => compileAssemblyPackage({
      projections: [{
        projectionId: 'overview',
        expression: '$',
        dependencies: [{ kind: 'business', source: 'undeclared-crm', selector: {} }],
        outputSchema: { type: 'object' },
      }],
    }),
    (error: unknown) => error instanceof BusinessSourceCompileError
      && error.issues.some((issue) => issue.includes("undeclared Business Source 'undeclared-crm'")),
  );
});

test('I-03-ASSEMBLY: cross-profile tuples fail closed at the manifest authority', () => {
  const compiled = compileAssemblyPackage({ workflows: [{ workflowId: 'parent' }] });
  for (const [label, tuple] of [
    ['0.3/2/2', { formatVersion: '0.3', runtimeContractMajor: 2, executionEngineMajor: 2 }],
    ['0.2/2/3', { formatVersion: '0.2', runtimeContractMajor: 2, executionEngineMajor: 3 }],
    ['unknown version', { formatVersion: '9.9', runtimeContractMajor: 2, executionEngineMajor: 3 }],
    ['unsupported runtime major', { formatVersion: '0.3', runtimeContractMajor: 3, executionEngineMajor: 3 }],
  ] as const) {
    const torn = structuredClone(compiled.manifest);
    torn.formatVersion = tuple.formatVersion;
    torn.runtimeContractMajor = tuple.runtimeContractMajor;
    torn.executionEngineMajor = tuple.executionEngineMajor;
    assert.throws(
      () => assertCompiledPackageManifest(torn),
      (error: unknown) => error instanceof CompiledManifestValidationError,
      `${label} must fail closed`,
    );
  }

  const smuggled = structuredClone(compiled.manifest);
  smuggled.formatVersion = '0.2';
  smuggled.executionEngineMajor = 2;
  delete (smuggled as { schemaContractVersion?: unknown }).schemaContractVersion;
  delete (smuggled as { packageDataBounds?: unknown }).packageDataBounds;
  delete (smuggled as { domainData?: unknown }).domainData;
  delete (smuggled as { businessSources?: unknown }).businessSources;
  assert.throws(
    () => assertCompiledPackageManifest(smuggled),
    (error: unknown) => error instanceof CompiledManifestValidationError,
    'a 0.2 tuple rebuild without recomputed identity fails closed',
  );
});

test('I-03-ASSEMBLY: successor package identity is material-bound and irrelevant-input-order deterministic', () => {
  const base = {
    domainData: [
      { key: 'alpha', value: { n: 1 } },
      { key: 'beta', value: { n: 2 } },
    ],
    businessSources: [
      { source: 'crm', valueSchema: { type: 'object', additionalProperties: true } },
    ],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [
        { kind: 'domain-data', key: 'alpha' },
        { kind: 'domain-data', key: 'beta' },
        { kind: 'business', source: 'crm', selector: {} },
      ],
      outputSchema: { type: 'object' },
    }],
  };

  const first = compileAssemblyPackage(base).manifest;
  const reordered = compileAssemblyPackage({
    ...base,
    domainData: [...base.domainData].reverse(),
  }).manifest;
  assert.equal(reordered.packageId, first.packageId);

  const changedValue = compileAssemblyPackage({
    ...base,
    domainData: [
      { key: 'alpha', value: { n: 999 } },
      { key: 'beta', value: { n: 2 } },
    ],
  }).manifest;
  assert.notEqual(changedValue.packageId, first.packageId);

  const changedSchema = compileAssemblyPackage({
    ...base,
    businessSources: [
      { source: 'crm', valueSchema: { type: 'object', properties: { extra: { type: 'string' } }, additionalProperties: true } },
    ],
  }).manifest;
  assert.notEqual(changedSchema.packageId, first.packageId);

  const changedBounds = compileAssemblyPackage({
    ...base,
    target: {
      ...assemblyTarget(),
      packageDataBounds: { ...assemblyTarget().packageDataBounds!, maxDomainDataEntries: 15 },
    },
  }).manifest;
  assert.notEqual(changedBounds.packageId, first.packageId);
});

test('I-03-ASSEMBLY: retained successor-only fields are rejected on a legacy 0.2/2/2 manifest shape', () => {
  const compiled = compileAssemblyPackage({ workflows: [{ workflowId: 'parent' }] });
  const legacyShaped = structuredClone(compiled.manifest);
  legacyShaped.formatVersion = '0.2';
  legacyShaped.executionEngineMajor = 2;
  assert.throws(
    () => assertCompiledPackageManifest(legacyShaped),
    (error: unknown) => error instanceof CompiledManifestValidationError
      && error.issues.some((issue) => issue.includes('successor-only material')),
  );
});

test('I-03-ASSEMBLY: target module emission carries bundled domainData for successor packages only', () => {
  const withData = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent' }],
    domainData: [{ key: 'tier', value: { level: 1 } }],
    projections: [{
      projectionId: 'overview',
      expression: '$',
      dependencies: [{ kind: 'domain-data', key: 'tier' }],
      outputSchema: { type: 'object' },
    }],
  });
  const source = emitTargetCompiledPackageModule({
    manifest: withData.manifest,
    bindingModules: assemblyBindingModules(withData.manifest),
    domainData: withData.domainData,
  });
  // R1 P2 safe emission: manifest/domainData are double-encoded JSON rehydrated
  // through JSON.parse so every own key (including "__proto__") survives
  // object-literal evaluation; bindings are assigned on a null-prototype record.
  assert.match(source, /export const manifest = Object\.freeze\(JSON\.parse\(/u);
  assert.match(source, /export const domainData = Object\.freeze\(JSON\.parse\(/u);
  assert.match(source, /\\"tier\\"/u);
  assert.match(source, /Object\.freeze\(\{ manifest, bindings, domainData \}\)/u);
  assert.doesNotMatch(source, /export const domainData = Object\.freeze\(\{/u);

  assert.throws(
    () => emitTargetCompiledPackageModule({
      manifest: withData.manifest,
      bindingModules: assemblyBindingModules(withData.manifest),
    }),
    /requires its bundled domainData values/u,
  );

  const empty = compileAssemblyPackage({ workflows: [{ workflowId: 'parent' }] });
  const emptyModules = assemblyBindingModules(empty.manifest);
  const emptySource = emitTargetCompiledPackageModule({
    manifest: empty.manifest,
    bindingModules: emptyModules,
    domainData: empty.domainData,
  });
  assert.match(emptySource, /export const domainData = Object\.freeze\(JSON\.parse\("\{\}"\)\)/u);

  assert.throws(
    () => emitTargetCompiledPackageModule({
      manifest: empty.manifest,
      bindingModules: emptyModules,
      domainData: { smuggled: true },
    }),
    /domainData values do not match the manifest Domain Data descriptors/u,
    'emitted bundled values cannot smuggle keys outside the manifest descriptors',
  );
});

test('I-03-ASSEMBLY: host-local successor tool compiles with binding identity and total rejection routing', () => {
  const compiled = compileAssemblyPackage({
    workflows: [{ workflowId: 'parent', tool: assemblyInventoryTool() }],
    tools: [assemblyInventoryTool()],
  });
  const descriptor = compiled.manifest.tools['inventory.reserve'];
  assert.ok(descriptor);
  assert.equal(descriptor.execution.kind, 'host-local-domain-tool@1');
  assert.equal(descriptor.execution.bindingId, 'assembly-inventory-native-v1');
  assert.equal(descriptor.execution.digest, compiled.manifest.bindingDigests['assembly-inventory-native-v1']);
});
