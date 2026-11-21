/** R40: 固有 K/S/B 层级之上按 App 选择 SDK 功能，不要求将全部 SDK 模块放进稳定 KDP。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  ContentDigest,
  DomainPackageManifest,
  PackageDependency,
  PackageLayer,
  PackageRole,
} from '@kaicreator/domain-harness-contracts';
import { buildApp } from '../../src/index.js';
import { selectPackageClosure } from '../../src/package-selection.js';
import { descriptor, manifest } from './fixtures.js';
import { standardCase } from './standard-case.js';

const init = {
  namespace: 'fixture', id: 'fixture.init', version: '1.0.0' as const,
  digest: `sha256:${'a'.repeat(64)}` as ContentDigest,
};

function packageOf(
  id: string, layer: PackageLayer, role: PackageRole,
  order?: number, dependsOn: readonly PackageDependency[] = [],
): DomainPackageManifest {
  return manifest(id, '1.0.0', {
    layer, role, ...(order !== undefined ? { order } : {}), init,
    dependsOn, exports: [{ interfaceId: `${id}.api` }],
  });
}

function examplePool() {
  const packages = [
    packageOf('kdp', 'kernel', 'primary', 0),
    packageOf('sdk-base', 'sdk', 'primary', 1),
    packageOf('business', 'business', 'primary', 2),
    packageOf('sdk-reader', 'sdk', 'extension'),
    packageOf('sdk-workflow', 'sdk', 'extension'),
  ];
  const pool = new Map(packages.map((pkg) => [pkg.id, pkg]));
  const selected = descriptor({
    roots: {
      kernelPrimary: { package: 'kdp', version: '1.0.0' },
      cores: [
        { package: 'sdk-base', version: '1.0.0' },
        { package: 'business', version: '1.0.0' },
      ],
    },
  });
  return { pool, selected };
}

test('R40: stable KDP with different App-selected SDK features', () => {
  const { pool, selected } = examplePool();
  const base = selectPackageClosure(selected, pool);
  assert.deepEqual([...base.selected.keys()].sort(), ['business', 'kdp', 'sdk-base']);
  assert.ok(!base.selected.has('sdk-reader'));
  assert.ok(!base.selected.has('sdk-workflow'));

  const appWithReader = selectPackageClosure({
    ...selected, extensions: [{ package: 'sdk-reader', version: '1.0.0' }],
  }, pool);
  assert.deepEqual([...appWithReader.selected.keys()].sort(),
    ['business', 'kdp', 'sdk-base', 'sdk-reader']);
  assert.ok(!appWithReader.selected.has('sdk-workflow'));
});

test('R40: required direct SDK extension is selected; unrelated feature remains excluded', () => {
  const { pool, selected } = examplePool();
  const business = pool.get('business')!;
  pool.set('business', { ...business, dependsOn: [
    { package: 'sdk-reader', version: '1.0.0', interface: 'sdk-reader.api' },
  ] });
  const result = selectPackageClosure(selected, pool);
  assert.ok(result.selected.has('sdk-reader'));
  assert.deepEqual(result.dependsOnEdges.get('business'), ['sdk-reader']);
  assert.ok(!result.selected.has('sdk-workflow'));
});

test('R40: undeclared/missing SDK dependency fails closed', () => {
  const { pool, selected } = examplePool();
  const business = pool.get('business')!;
  pool.set('business', { ...business, dependsOn: [
    { package: 'sdk-missing', version: '1.0.0', interface: 'sdk-missing.api' },
  ] });
  assert.throws(() => selectPackageClosure(selected, pool),
    { code: 'DH_BUILD_DEPENDS_ON_UNSELECTED' });
});

test('R40: a Primary cannot be smuggled through the Extension selection', () => {
  const { pool, selected } = examplePool();
  assert.throws(() => selectPackageClosure({
    ...selected, roots: { ...selected.roots, cores: [] },
    extensions: [{ package: 'business', version: '1.0.0' }],
  }, pool), { code: 'DH_BUILD_PRIMARY_MISSING' });
});

test('R40: full BUILD does not require or seal an unselected SDK Package', (t) => {
  const fixture = standardCase();
  t.after(fixture.ws.dispose);
  const { input } = fixture.finalize();
  const base = buildApp(input);
  assert.equal(base.ok, true);
  if (!base.ok) return;
  // 候选池里存在该完整 Manifest，但没有对应文件根或分发产物；
  // 如果 BUILD 错误地强制集成全部 SDK 功能，构建会拒绝。
  const unused = packageOf('sdk-unused-feature', 'sdk', 'extension');
  const withUnused = buildApp({ ...input, packages: [...input.packages, unused] });
  assert.equal(withUnused.ok, true);
  if (!withUnused.ok) return;
  assert.deepEqual(withUnused.lockBytes, base.lockBytes);
  assert.equal(withUnused.appPackage.packageDigest, base.appPackage.packageDigest);
  assert.ok(!withUnused.lock.selectedPackages.some((pkg) => pkg.packageId === unused.id));
});
