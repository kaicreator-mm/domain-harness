/** 生成方对源码正确性负责；SDK Composer 只按已选身份和字节执行封存。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DomainPackageManifest } from '@kaicreator/domain-harness-contracts';
import { buildApp } from '../../src/index.js';
import { composeApp } from '../../src/build.js';
import { writeRaw } from './fixtures.js';
import { standardCase } from './standard-case.js';

test('生成期拒绝恶意静态源码，独立 App 组合不在 SDK 重新解析源代码', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const business = input.packages.find(
    (pkg) => (pkg as DomainPackageManifest).id === 'orders-business',
  ) as DomainPackageManifest;
  const module = writeRaw(
    scenario.ws.packageRoots['orders-business']!,
    'dist/selected-generation-check.mjs',
    new TextEncoder().encode(
      'const load = globalThis["Function"];\nexport function init() { return load("return 1")(); }\nexport function exit() {}\n',
    ),
  );
  const revised: DomainPackageManifest = {
    ...business,
    targetVariants: business.targetVariants.map((variant) => ({
      ...variant,
      implementations: variant.implementations.map((implementation) =>
        implementation.functionId === 'init'
          ? { ...implementation, entry: { module, exportName: 'init' } }
          : implementation),
    })),
  };
  const candidate = {
    ...input,
    packages: input.packages.map((pkg) => pkg === business ? revised : pkg),
  };

  const sealed = composeApp(candidate);
  assert.equal(sealed.ok, true,
    sealed.ok ? '' : `App 组合不得重新证明 JavaScript 正确性: ${sealed.code}: ${sealed.message}`);
  const qualified = buildApp(candidate);
  assert.equal(qualified.ok, false, '生成方静态验证必须拒绝不合法的源码');
  if (!qualified.ok) assert.equal(qualified.code, 'DH_BUILD_DEPENDS_ON_UNSELECTED');
});

test('SDK 组合只封存生成方已提交的传递资源字节，拒绝未选 Owner', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const generated = writeRaw(
    scenario.ws.packageRoots['orders-business']!,
    'dist/generated-transitive.js',
    new TextEncoder().encode('export const selected = true;\n'),
  );

  const composed = composeApp({ ...input, generatedResources: [generated] });
  assert.equal(composed.ok, true, composed.ok ? '' : composed.message);
  if (composed.ok) {
    assert.equal(composed.lock.resourceDigests['orders-business/dist/generated-transitive.js'],
      generated.digest);
    assert.ok(composed.appPackage.files.some((file) =>
      file.path === 'node_modules/orders-business/dist/generated-transitive.js'));
  }

  const forbidden = composeApp({
    ...input,
    generatedResources: [{ ...generated, packageId: 'undeclared-package' }],
  });
  assert.equal(forbidden.ok, false, '未选 Package 不得注入安装资源');
  if (!forbidden.ok) assert.equal(forbidden.code, 'DH_BUILD_RESOURCE_MISSING');
});
