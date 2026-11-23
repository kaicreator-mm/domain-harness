import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
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

test('Metadata 字段重复或展开覆盖必须拒绝，不能用旧 Order 伪报通过', () => {
  runCase({business:"export const packageMeta={id:'b',role:'core',order:2,order:0};"},
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),
      /GEN_DUPLICATE_METADATA_FIELD/u));
  runCase({business:"const overrides={order:0}; export const packageMeta={id:'b',role:'core',order:2,...overrides};"},
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),
      /GEN_NONSTATIC_METADATA/u));
  runCase({business:"export const packageMeta={id:'b',role:'core',get order(){return 2;}};"},
    x => assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),
      /GEN_NONSTATIC_METADATA/u));
});

test('TypeScript 原生 as const satisfies PackageMeta 可静态解析', () => {
  runCase({}, x => {
    const tsCore = join(x.root,'packages/business.mts');
    writeFileSync(tsCore, [
      'interface CoreMeta { readonly id: string; readonly role: "core"; readonly order: number }',
      'export const packageMeta = ({ id: "business", role: "core", order: 2 } as const) satisfies CoreMeta;',
    ].join('\n'));
    assert.deepEqual(validateNativeApp(x.manifest,[x.kdp,tsCore]),{
      packages:[{id:'kdp',order:0},{id:'business',order:2}],checked:2,
    });
  });
});

test('R149 P1：直接写入、let 绑定和 Object.assign 不再伪报静态 Order', () => {
  for (const business of [
    "export let packageMeta={id:'business',role:'core',order:2};",
    "export const packageMeta={id:'business',role:'core',order:2}; packageMeta.order=0;",
    "export const packageMeta={id:'business',role:'core',order:2}; packageMeta['order']=0;",
    "export const packageMeta={id:'business',role:'core',order:2}; Object.assign(packageMeta,{order:0});",
  ]) {
    runCase({business}, x => assert.throws(() =>
      validateNativeApp(x.manifest,[x.kdp,x.business]), /GEN_(?:MUTABLE|MUTATED)_METADATA/u));
  }
});

test('R149 P1：元数据直接别名须非 PASS，保持原生语言能力', () => {
  runCase({business:"export const packageMeta={id:'business',role:'core',order:2}; const same=packageMeta; same.order=0;"},
    x => {
      const result=validateNativeApp(x.manifest,[x.kdp,x.business]);
      assert.deepEqual(result.manualReviewPackages,['business']);
    });
});

test('R149 P1：TypeScript 纯类型依赖允许 devDependencies，值导入必须直接依赖', () => {
  runCase({}, x => {
    writeFileSync(x.manifest,JSON.stringify({
      dependencies:{'@kaicreator/domain-harness':'0.11.1'},
      devDependencies:{'types-only':'1.0.0'},
    }));
    const core=join(x.root,'packages/business.mts');
    const metadata="export const packageMeta={id:'business',role:'core',order:2} as const;\n";
    writeFileSync(core,
      "import type { Foo } from 'types-only';\nexport type {Foo} from 'types-only';\n"+metadata);
    assert.equal(validateNativeApp(x.manifest,[x.kdp,core]).checked,2);
    writeFileSync(core,
      "import { type Foo } from 'types-only';\n"+metadata);
    assert.equal(validateNativeApp(x.manifest,[x.kdp,core]).checked,2);
    writeFileSync(core,
      "import { type Foo, realValue } from 'types-only';\n"+metadata);
    assert.throws(() => validateNativeApp(x.manifest,[x.kdp,core]),
      /GEN_UNDECLARED_DIRECT_DEPENDENCY/u);
    writeFileSync(core,
      "import { realValue } from 'types-only';\n"+metadata);
    assert.throws(() => validateNativeApp(x.manifest,[x.kdp,core]),
      /GEN_UNDECLARED_DIRECT_DEPENDENCY/u);
  });
});

test('R149 P2：相对目录不是有效模块，NodeNext TS 源码 .js 输出映射可检查', () => {
  runCase({}, x => {
    const dir=join(x.root,'packages/helper-dir');
    mkdirSync(dir);
    writeFileSync(x.business,
      "import './helper-dir'; export const packageMeta={id:'business',role:'core',order:2};");
    assert.throws(() => validateNativeApp(x.manifest,[x.kdp,x.business]),
      /GEN_MISSING_DIRECT_IMPORT/u);

    const core=join(x.root,'packages/business.mts');
    writeFileSync(join(x.root,'packages/helper.ts'),'export const answer=42;');
    writeFileSync(core,
      "import './helper.js'; export const packageMeta={id:'business',role:'core',order:2} as const;");
    assert.equal(validateNativeApp(x.manifest,[x.kdp,core]).checked,2);
  });
});

test('R155 元数据括号别名不得静态 PASS，CLI 必须返回人工复核状态', () => {
  for (const expression of ['(packageMeta)','((packageMeta))']) {
    runCase({business:`export const packageMeta={id:'business',role:'core',order:2};
      const alias=${expression}; alias.order=0;`}, x => {
      assert.deepEqual(validateNativeApp(x.manifest,[x.kdp,x.business]).manualReviewPackages,
        ['business']);
      const run=spawnSync(process.execPath,[
        fileURLToPath(new URL('../validate-native-generation.mjs',import.meta.url)),
        '--manifest',x.manifest,'--core',x.kdp,'--core',x.business,
      ],{encoding:'utf8',timeout:12000});
      assert.equal(run.status,3,run.stderr);
      assert.equal(JSON.parse(run.stdout).status,'GEN_PARTIAL_REVIEW_REQUIRED');
    });
  }
});

test('R155 TypeScript 类型包装后的简单元数据别名必须人工复核', () => {
  runCase({}, x => {
    const core=join(x.root,'packages/business.mts');
    for (const expression of [
      '(packageMeta)',
      '(packageMeta as typeof packageMeta)',
      '((packageMeta as typeof packageMeta) satisfies typeof packageMeta)',
      'packageMeta!',
      '(<typeof packageMeta>packageMeta)',
    ]) {
      writeFileSync(core,`export const packageMeta={id:'business',role:'core',order:2} as const;
        const alias=${expression}; alias.order=0;`);
      assert.deepEqual(validateNativeApp(x.manifest,[x.kdp,core]).manualReviewPackages,
        ['business'],expression);
    }
  });
});

test('R155 非元数据普通括号别名不触发手动复核', () => {
  runCase({business:"const source={order:7}; const alias=(source); alias.order=0; export const packageMeta={id:'business',role:'core',order:2};"}, x => {
    assert.deepEqual(validateNativeApp(x.manifest,[x.kdp,x.business]),{
      packages:[{id:'kdp',order:0},{id:'business',order:2}],checked:2,
    });
  });
});
