import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import ts from 'typescript';

// 只检查当前新架构的类型标识符与公开包根，拒绝将旧版命名重新引入工作树。
const root = new URL('../', import.meta.url);
const dirs = ['packages/contracts/src','tooling/build/src','packages/microkernel/src','packages/domain-harness/src'];
async function scan(dir) {
 const files = [];
 for(const x of await readdir(new URL(dir+'/',root),{withFileTypes:true})) {
  const p = dir+'/'+x.name;
  if(x.isDirectory())files.push(...await scan(p));
  else if(x.isFile()&&p.endsWith('.ts'))files.push(p);
 }
 return files;
}
for(const dir of dirs){
 const files=await scan(dir);
 assert.ok(files.length>0,'缺失生产源码：'+dir);
 for(const file of files){
  assert.ok(!/(^|\/)v\d{2,}(\/|$)/iu.test(file),'存在版本化目录：'+file);
  const source=await readFile(new URL(file,root),'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true);
  assert.equal(ast.parseDiagnostics.length,0,'TypeScript 语法错误：'+file);
  function visit(node){if(ts.isIdentifier(node)&&/^(V\d+[A-Z]|buildV\d+[A-Z])/u.test(node.text))throw new Error('版本前缀类型/函数：'+file+' '+node.text);ts.forEachChild(node,visit)}
  visit(ast);
  // 对 TypeScript 注释执行词法检查，不扫描字符串或正则中的斜杠。
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, source);
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (kind !== ts.SyntaxKind.SingleLineCommentTrivia &&
        kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
    const comment = scanner.getTokenText();
    assert.ok(/\p{Script=Han}/u.test(comment),
      '生产代码注释必须使用中文：' + file + ':' + source.slice(0, scanner.getTokenPos()).split('\n').length);
  }
  assert.ok(!/@kaicreator\/[^'\s]+\/(?:legacy|v\d+)/u.test(source),
    '生产代码不得通过版本化或兼容包入口导入：' + file);
 }
}
for(const dir of ['packages/contracts','tooling/build','packages/microkernel','packages/domain-harness']){
 const m=JSON.parse(await readFile(new URL(dir+'/package.json',root),'utf8'));
 assert.deepEqual(Object.keys(m.exports),['.'],'包根之外不得保留兼容导出：'+dir);
 assert.equal(m.exports['.'].import,'./dist/index.js');
}
// R12/R14 实证：生产 TS 类型通过不代表测试 TS 通过；新的 Workspace 不能静默绕开测试编译。
const monorepo = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
assert.ok(Array.isArray(monorepo.workspaces) && monorepo.workspaces.length > 0, 'monorepo 缺少 workspaces');
assert.ok(typeof monorepo.scripts?.test === 'string' && monorepo.scripts.test.includes('npm run test:typecheck --workspaces'),
  '根 npm test 必须先执行全部 Workspace 的测试 Typecheck');
for (const workspace of monorepo.workspaces) {
  const pkg = JSON.parse(await readFile(new URL(workspace + '/package.json', root), 'utf8'));
  assert.ok(typeof pkg.scripts?.['test:typecheck'] === 'string' &&
    pkg.scripts['test:typecheck'].includes('tsc -p tsconfig.test.json'),
    'Workspace 缺少测试 Typecheck 命令：' + workspace);
  const testConfig = JSON.parse(await readFile(new URL(workspace + '/tsconfig.test.json', root), 'utf8'));
  assert.equal(testConfig.compilerOptions?.noEmit, true,
    '测试 Typecheck 不得输出产物：' + workspace);
  assert.ok(Array.isArray(testConfig.include) && testConfig.include.some((path) => path.startsWith('tests/')),
    '测试 Typecheck 未包含 tests 目录：' + workspace);
}

console.log('源码命名、公共包根与全 Workspace 测试类型检查结构通过');
