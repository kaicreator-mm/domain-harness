import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateNativeApp } from '../validate-native-generation.mjs';

function fixture(overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dh-native-generation-'));
  mkdirSync(join(root, 'packages'));
  const manifest = join(root, 'package.json');
  const kdp = join(root, 'packages/kdp.mjs');
  const business = join(root, 'packages/business.mjs');
  writeFileSync(manifest, JSON.stringify({ type:'module', dependencies:
    {'@kaicreator/domain-harness':'0.11.0'} }));
  writeFileSync(kdp, overrides.kdp ??
    "export const packageMeta={id:'kdp',role:'core',order:0};\nexport class Init {}");
  writeFileSync(business, overrides.business ??
    "import { KernelLifecycle } from '@kaicreator/domain-harness';\nexport const packageMeta={id:'business',role:'core',order:2};");
  return {root,manifest,kdp,business};
}

function runCase(overrides, check) {
  const x = fixture(overrides);
  try { check(x); } finally { rmSync(x.root,{recursive:true,force:true}); }
}

test('生成期仅 AST 检查，允许 Order 跳号且不执行 Package', () => {
  runCase({}, x => {
    assert.deepEqual(validateNativeApp(x.manifest,[x.business,x.kdp]),{
      packages:[{id:'kdp',order:0},{id:'business',order:2}], checked:2,
    });
  });
});

test('非法或重复 Order、缺失 KDP 在生成期拒绝', () => {
  runCase({ business:"export const packageMeta={id:'b',role:'core',order:0};" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_DUPLICATE_ORDER/u));
  runCase({ business:"export const packageMeta={id:'b',role:'core',order:1.5};" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_INVALID_ORDER_OR_ID/u));
  runCase({ kdp:"export const packageMeta={id:'kdp',role:'core',order:3};" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_KDP_ORDER_ZERO_MISSING/u));
});

test('动态或缺失 Metadata 必须在生成期拒绝，Runtime 不重复证明', () => {
  runCase({ business:"const n=2; export const packageMeta={id:'b',role:'core',order:n};" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_NONSTATIC_CORE/u));
  runCase({ business:"export const other={id:'business',role:'core',order:2};" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_MISSING_METADATA/u));
  runCase({ business:"export const packageMeta={id:'b',role:'core',order:2}; import('./missing.mjs');" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_MISSING_DIRECT_IMPORT/u));
});

test('跨 Package 的第三方直接 import 必须存在于应用直接依赖', () => {
  runCase({ business:"import { read } from 'not-declared-provider'; export const packageMeta={id:'b',role:'core',order:2};" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_UNDECLARED_DIRECT_DEPENDENCY/u));
  runCase({ business:"import './missing.mjs'; export const packageMeta={id:'b',role:'core',order:2};" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_MISSING_DIRECT_IMPORT/u));
});

test('Core Order 与 Package ID 均唯一，不需要 Dummy Init 或自定义 Loader', () => {
  runCase({ business:"export const packageMeta={id:'kdp',role:'core',order:2};" },
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),/GEN_DUPLICATE_PACKAGE/u));
});

test('原生字面量 import() 允许正常使用，但仍验证直接依赖与文件存在', () => {
  runCase({business:"export const packageMeta={id:'b',role:'core',order:2}; void import('@kaicreator/domain-harness');"},
    x => assert.equal(validateNativeApp(x.manifest,[x.kdp,x.business]).checked,2));
  runCase({business:"export const packageMeta={id:'b',role:'core',order:2}; void import('undeclared-third-party');"},
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),
      /GEN_UNDECLARED_DIRECT_DEPENDENCY/u));
});

test('计算的 import() 不是框架禁用语法，作者必须复核不确定依赖', () => {
  runCase({business:"const specifier = getPluginName(); export const packageMeta={id:'b',role:'core',order:2}; void import(specifier);"},
    x => {
      const checked=validateNativeApp(x.manifest,[x.kdp,x.business]);
      assert.deepEqual(checked.manualReviewPackages,['b']);
      assert.equal(checked.checked,2);
    });
});
