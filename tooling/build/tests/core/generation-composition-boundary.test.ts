/** 生成方对源码正确性负责；SDK Composer 只按已选身份和字节执行封存。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { DomainPackageManifest } from '@kaicreator/domain-harness-contracts';
import { buildApp } from '../../src/index.js';
import { composeApp } from '../../src/build.js';
import { buildApp as publicSdkComposition } from '../../src/composition-entry.js';
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
      file.path === 'packages/orders-business/dist/generated-transitive.js'));
  }

  const forbidden = composeApp({
    ...input,
    generatedResources: [{ ...generated, packageId: 'undeclared-package' }],
  });
  assert.equal(forbidden.ok, false, '未选 Package 不得注入安装资源');
  if (!forbidden.ok) assert.equal(forbidden.code, 'DH_BUILD_RESOURCE_MISSING');
});

test('公开 SDK 入口不可注入生成期回调或获得内部资源作用域', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  let calls = 0;
  const attempt = publicSdkComposition as unknown as (
    candidate: typeof input, untrustedCallback: () => void
  ) => ReturnType<typeof publicSdkComposition>;
  const composed = attempt(input, () => { calls++; });
  assert.equal(composed.ok, true, composed.ok ? '' : composed.message);
  assert.equal(calls, 0, '发布 SDK 忽略额外 callback，内部生成期校验接口不对外暴露');
});

test('R122 P1-01: 未参与 App 选定的 Domain 正确性仅由生成期检查', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const candidate = { ...input, domains: [{ kind: 'NotDomain', id: 'unselected-invalid' }] };
  const composed = publicSdkComposition(candidate);
  assert.equal(composed.ok, true,
    composed.ok ? '' : `SDK Composer must not validate unselected author Domain: ${composed.code}`);
  const generated = buildApp(candidate);
  assert.equal(generated.ok, false, 'creator must reject malformed authored Domain');
  if (!generated.ok) assert.equal(generated.code, 'DH_BUILD_SCHEMA_INVALID');
});

test('R122 P1-01: 内容值是否满足业务 Schema 仅由生成期负责', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  // 此值类型不满足作者规则，但其 JSON 和摘要本身合法且仍可确定性封存。
  scenario.eligibility.content[0]!.value = { minOrderTotal: 'invalid-number', regions: ['EU'] };
  const { input } = scenario.finalize();
  const composed = publicSdkComposition(input);
  assert.equal(composed.ok, true,
    composed.ok ? '' : `SDK Composer must only seal selected content bytes: ${composed.code}`);
  if (composed.ok) {
    assert.ok(composed.lock.selectedElements.some((entry) => entry.ref.id === scenario.eligibility.id));
    assert.ok(composed.lock.resourceDigests['orders-business/definitions/eligibility-1.0.0-1.json']);
  }
  const generated = buildApp(input);
  assert.equal(generated.ok, false, 'author must validate actual ContentBlock value against its declared schema');
  if (!generated.ok) assert.equal(generated.code, 'DH_BUILD_SCHEMA_INVALID');
});

test('生成期验证移走后 SDK 仍拒绝错误的选定 Element 字节摘要', (t) => {
  const scenario = standardCase();
  t.after(scenario.ws.dispose);
  const { input } = scenario.finalize();
  const tampered = input.packages.map((raw) => {
    const pkg = raw as DomainPackageManifest;
    if (pkg.id !== 'orders-business') return raw;
    return {
      ...pkg,
      elements: pkg.elements.map((entry) => entry.id === scenario.eligibility.id
        ? { ...entry, definitionRef: { ...entry.definitionRef, digest: `sha256:${'0'.repeat(64)}` as `sha256:${string}` } }
        : entry),
    };
  });
  const composed = publicSdkComposition({ ...input, packages: tampered });
  assert.equal(composed.ok, false, 'SDK must keep selected byte-integrity fallback');
  if (!composed.ok) assert.equal(composed.code, 'DH_BUILD_RESOURCE_DIGEST_MISMATCH');
});
