import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';

/** 本版只扫描真实原生 SDK；删除旧系统后绝不再引用其源码。 */
const root = new URL('../', import.meta.url);
async function scan(dir) {
  const result = [];
  for (const item of await readdir(new URL(dir + '/', root), {withFileTypes:true})) {
    const path = dir + '/' + item.name;
    if (item.isDirectory()) result.push(...await scan(path));
    else if (item.isFile() && path.endsWith('.ts')) result.push(path);
  }
  return result;
}
const source = await scan('packages/domain-harness/src');
assert.ok(source.length >= 4, 'SDK 原生核心源码缺失');
for (const path of source) {
  const text = await readFile(new URL(path,root),'utf8');
  const ast = ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'TypeScript 源码语法无效：'+path);
  assert.doesNotMatch(text, /@kaicreator\/domain-harness-(?:contracts|microkernel|build)/u,
    '旧内部 Package 不能留在新 SDK：'+path);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest,false,ts.LanguageVariant.Standard,text);
  for (let token=scanner.scan(); token!==ts.SyntaxKind.EndOfFileToken; token=scanner.scan()) {
    if (token!==ts.SyntaxKind.SingleLineCommentTrivia &&
        token!==ts.SyntaxKind.MultiLineCommentTrivia) continue;
    assert.match(scanner.getTokenText(),/\p{Script=Han}/u,
      '生产源码注释需使用中文：'+path);
  }
}
const sdk=JSON.parse(await readFile(new URL('packages/domain-harness/package.json',root),'utf8'));
assert.deepEqual(Object.keys(sdk.exports), ['.'], '只能导出本版原生 SDK 包根');
assert.deepEqual(Object.keys(sdk.dependencies).sort(), ['xstate','yaml'],
  'SDK 不应继续依赖旧 Contracts/Microkernel 或第二组合系统');
assert.equal(sdk.engines.node, '>=22.12.0');
const app=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
assert.deepEqual(app.workspaces,['packages/domain-harness']);
assert.ok(app.scripts.test.includes('test:typecheck') && app.scripts.test.includes('test:generation'),
  '测试 Typecheck 与生成期负例必须先运行');
const tests=await scan('packages/domain-harness/tests');
assert.ok(tests.length>=5,'独立原生回归测试不足');
console.log(JSON.stringify({status:'SOURCE_QUALITY_PASS',sources:source.length,tests:tests.length}));
