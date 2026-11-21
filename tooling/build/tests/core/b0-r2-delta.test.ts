/** R2 P1-02: a physical Function implementor and each Init resource need a
 * direct Extension authorization from the logical Element owner, not only the implementor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DomainPackageManifest } from '@kaicreator/domain-harness-contracts';
import { buildApp } from '../../src/index.js';
import { writeRaw } from './fixtures.js';
import { standardCase } from './standard-case.js';

interface ExternalCaseOptions {
  readonly ownerDeclaresImplementor?: boolean;
  readonly resourceFromThird?: boolean;
  readonly ownerDeclaresThird?: boolean;
}
function externalLifecycleInit(t: import('node:test').TestContext, options: ExternalCaseOptions = {}) {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const owner = input.packages.find((pkg) => pkg.id === 'orders-business')!;
  const implementor = input.packages.find((pkg) => pkg.id === 'orders-ext')!;
  const impl = writeRaw(scenario.ws.packageRoots['orders-ext']!, 'dist/r2-selected-init.mjs',
    new TextEncoder().encode('export function init() { return { status: "READY" }; }\n'));
  const resourcePackage = options.resourceFromThird ? 'aaa-ext' : 'orders-ext';
  const resource = writeRaw(scenario.ws.packageRoots[resourcePackage]!, 'content/r2-policy.json',
    new TextEncoder().encode('{"r2":"source-owner-auth"}\n'));
  const ownerDependsOn = owner.dependsOn.filter((dep) =>
    (options.ownerDeclaresImplementor !== false || dep.package !== 'orders-ext') &&
    (options.ownerDeclaresThird !== false || dep.package !== 'aaa-ext'));
  const changedOwner: DomainPackageManifest = {
    ...owner,
    dependsOn: ownerDependsOn,
    exports: [...owner.exports, { elementId: 'orders.app-main', functionId: 'init' }],
    targetVariants: owner.targetVariants.map((variant) => ({
      ...variant,
      implementations: variant.implementations.filter((binding) =>
        !(binding.elementId === 'orders.app-main' && binding.functionId === 'init')),
    })),
  };
  const changedImplementor: DomainPackageManifest = {
    ...implementor,
    dependsOn: options.resourceFromThird
      ? [...implementor.dependsOn, { package: 'aaa-ext', version: '1.0.0', interface: 'aaa.audit' }]
      : implementor.dependsOn,
    targetVariants: implementor.targetVariants.map((variant) => ({
      ...variant,
      implementations: [...variant.implementations, {
        elementId: 'orders.app-main', functionId: 'init', contractVersion: '1',
        entry: { module: impl, exportName: 'init' }, resources: [resource],
      }],
    })),
  };
  return {
    input: { ...input, packages: input.packages.map((pkg) =>
      pkg === owner ? changedOwner : pkg === implementor ? changedImplementor : pkg) },
    resource,
  };
}
function expectBuildCode(result: ReturnType<typeof buildApp>, code: string): void {
  assert.equal(result.ok, false, result.ok ? 'unexpectedly allowed' : result.message);
  if (!result.ok) assert.equal(result.code, code);
}

test('R2 P1-02 positive: logical Init owner directly declares selected external implementation and resource owner', (t) => {
  const { input, resource } = externalLifecycleInit(t);
  const result = buildApp(input);
  assert.equal(result.ok, true, result.ok ? '' : result.message);
  if (result.ok) {
    const business = result.lock.selectedPackages.find((pkg) => pkg.packageId === 'orders-business')!;
    assert.ok(business.initResources.some((r) => r.packageId === resource.packageId && r.digest === resource.digest));
    const selected = result.lock.selectedFunctions.find((fn) =>
      fn.ref.element.id === 'orders.app-main' && fn.ref.functionId === 'init')!;
    assert.equal(selected.implementation.module.packageId, 'orders-ext');
  }
});

test('R2 P1-02 negative: selected lifecycle implementor is not the logical owners direct Extension', (t) => {
  const { input } = externalLifecycleInit(t, { ownerDeclaresImplementor: false });
  expectBuildCode(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('R2 P1-02 negative: implementor may access third Extension but cannot grant resource to unapproved Init owner', (t) => {
  const { input } = externalLifecycleInit(t, {
    resourceFromThird: true, ownerDeclaresThird: false,
  });
  expectBuildCode(buildApp(input), 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('R2 P1-02 positive: third-Extension resource is legal when both implementor and Init owner declare it directly', (t) => {
  const { input, resource } = externalLifecycleInit(t, { resourceFromThird: true });
  const result = buildApp(input);
  assert.equal(result.ok, true, result.ok ? '' : result.message);
  if (result.ok) assert.ok(result.lock.selectedFunctions.some((fn) =>
    fn.ref.element.id === 'orders.app-main' && fn.resources.some((r) => r.digest === resource.digest)));
});
