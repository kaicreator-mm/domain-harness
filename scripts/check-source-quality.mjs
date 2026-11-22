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
 // 只有单一公共 SDK 可以按职责开放 runtime/composition 子入口；其余内部 Workspace 仍仅开放包根。
 const sdk = dir === 'packages/domain-harness';
 const allowed = sdk ? ['.', './runtime', './composition'] : ['.'];
 assert.deepEqual(Object.keys(m.exports), allowed,
   '只能导出明确批准的公共 SDK 入口，禁止兼容/深层入口：'+dir);
 assert.equal(m.exports['.'].import,'./dist/index.js');
 if (sdk) {
  for (const name of ['runtime', 'composition']) {
   assert.deepEqual(m.exports['./'+name], {
    types:'./dist/'+name+'.d.ts', import:'./dist/'+name+'.js',
   }, 'SDK 子入口不得重定向到内部或其它 Workspace：'+name);
  }
 }
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

// 非阻断代码体积审计：语法树只测可执行函数体，声明式 Schema 与独立测试不以文件行数判错。
const sizeWarnings = [];
function collectSizeWarnings(file, source, { production = true } = {}) {
  const fileLines = source.split('\n').length;
  const maxFileLines = production ? 500 : 600;
  if (fileLines > maxFileLines) {
    sizeWarnings.push(`文件 ${file}：${fileLines} 行，建议按职责检查（阈值 ${maxFileLines}）`);
  }
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    file.endsWith('.mjs') ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const limit = production ? 100 : 200;
  function walk(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
         ts.isConstructorDeclaration(node) || ts.isArrowFunction(node) ||
         ts.isFunctionExpression(node)) && node.body) {
      const lines = source.slice(node.body.getStart(ast), node.body.getEnd()).split('\n').length;
      if (lines > limit) {
        const name = node.name?.getText(ast) ??
          (node.parent && ts.isVariableDeclaration(node.parent)
            ? node.parent.name.getText(ast) : '匿名函数');
        const firstLine = ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1;
        sizeWarnings.push(`函数 ${file}:${firstLine} ${name}：${lines} 行（阈值 ${limit}）`);
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
}
for (const dir of dirs) {
  for (const file of await scan(dir)) {
    collectSizeWarnings(file, await readFile(new URL(file, root), 'utf8'));
  }
}
for (const dir of ['packages/contracts/tests','tooling/build/tests',
    'packages/microkernel/tests','packages/domain-harness/tests']) {
  for (const file of await scan(dir)) {
    collectSizeWarnings(file, await readFile(new URL(file, root), 'utf8'), { production: false });
  }
}
for (const file of ['examples/basic-domain-app/consumer.mjs',
    'examples/basic-domain-app/verify-clean-install.mjs']) {
  collectSizeWarnings(file, await readFile(new URL(file, root), 'utf8'), { production: false });
}
if (sizeWarnings.length > 0) {
  console.warn(`代码体积维护性提示（${sizeWarnings.length} 项，非阻断）：\n` +
    sizeWarnings.map((warning) => ' - ' + warning).join('\n'));
}
console.log('源码命名、公共包根与全 Workspace 测试类型检查结构通过');
