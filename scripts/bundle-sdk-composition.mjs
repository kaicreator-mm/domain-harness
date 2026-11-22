/**
 * SDK 构建期把仓库内部的 Package 组合实现封进唯一公开 SDK。
 * tooling/build 只是 Monorepo 内部源码与测试，消费者不得安装第二个 BUILD 包。
 */
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { isBuiltin } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(repo, 'packages/domain-harness/dist');
const outfile = join(dist, 'composition.js');
const declaration = join(dist, 'composition.d.ts');

const result = await build({
  entryPoints: [join(repo, 'tooling/build/src/index.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  packages: 'bundle',
  external: ['@kaicreator/domain-harness-contracts'],
  // TypeScript 编译器的可选源码映射辅助不是 Package 组合运行必需依赖；
  // 禁止把其不受控的 require 留到最终 Consumer 环境。
  plugins: [{
    name: 'sdk-isolate-optional-source-map-support',
    setup(context) {
      context.onResolve({ filter: /^source-map-support$/u },
        () => ({ path: 'source-map-support', namespace: 'sdk-internal' }));
      context.onLoad({ filter: /^source-map-support$/u, namespace: 'sdk-internal' },
        () => ({ contents: 'module.exports = { install() {} };', loader: 'js' }));
    },
  }],
  // 兼容打包进 ESM 的第三方 CommonJS 依赖对 Node 内置模块的 require。
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  legalComments: 'external',
  metafile: true,
  logLevel: 'warning',
});

const outputs = Object.values(result.metafile.outputs);
assert.ok(outputs.some((output) => output.entryPoint?.endsWith('tooling/build/src/index.ts')),
  'SDK composition bundle must originate from the original validated implementation');
for (const output of outputs) {
  for (const imported of output.imports ?? []) {
    const name = imported.path;
    assert.ok(name === '@kaicreator/domain-harness-contracts' || isBuiltin(name),
      `SDK composition bundle leaked external implementation dependency: ${name}`);
  }
}
const compiled = readFileSync(outfile, 'utf8');
const types = readFileSync(declaration, 'utf8');
for (const value of ['buildApp', 'BuildRefusal', 'digestOfBytes']) {
  assert.match(compiled, new RegExp(`\\b${value}\\b`, 'u'), `SDK composition missing implementation ${value}`);
  assert.match(types, new RegExp(`\\b${value}\\b`, 'u'), `SDK composition missing public types ${value}`);
}
assert.equal(compiled.includes('@kaicreator/domain-harness-build'), false,
  'Consumer SDK must not resolve a separate BUILD package');
assert.equal(types.includes('@kaicreator/domain-harness-build'), false,
  'Public types must be self-contained within the SDK');
assert.ok(statSync(outfile).size > 1_000, 'SDK composition bundle unexpectedly empty');
console.log('SDK 内置 Package 组合实现已打包；公开 API 不依赖外部 BUILD。');
