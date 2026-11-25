/** 用唯一 SDK tarball 在全新仓外 npm 目录完成实际安装、类型和业务验收。 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyS05InstalledStandard } from './verify-s05-installed-standard.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'dh-native-sdk-only-'));
const packs = join(work, 'packs');
const consumer = join(work, 'consumer');
// Windows 上直接 spawn npm.cmd 会产生 EINVAL；改为 Node 执行 npm CLI。
const npmCli = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(process.execPath), '../node_modules/npm/bin/npm-cli.js'),
].find(candidate => candidate && existsSync(candidate));
if (!npmCli) throw new Error('NATIVE_CONSUMER_NPM_CLI_NOT_FOUND');
const npm = process.execPath;
const npmArgs = args => [npmCli, ...args];
// SDK 消费者的最低 Node 版本不同于仓库开发工具链；明确选定实际可执行文件。
const consumerNode = process.env.DH_NATIVE_CONSUMER_NODE ? resolve(process.env.DH_NATIVE_CONSUMER_NODE) : process.execPath;
const consumerNpmCli = [
  process.env.DH_NATIVE_CONSUMER_NPM_CLI,
  ...(consumerNode === process.execPath ? [npmCli] : []),
  resolve(dirname(consumerNode), 'node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(consumerNode), '../lib/node_modules/npm/bin/npm-cli.js'),
  resolve(dirname(consumerNode), '../node_modules/npm/bin/npm-cli.js'),
].find(candidate => candidate && existsSync(candidate));
if (!existsSync(consumerNode) || !consumerNpmCli) throw new Error('NATIVE_CONSUMER_RUNTIME_NOT_FOUND');
const consumerNpmArgs = args => [consumerNpmCli, ...args];
const registry = process.env.DH_NATIVE_NPM_REGISTRY;
if(registry && !/^https?:\/\//u.test(registry)) throw new Error('NATIVE_REGISTRY_INVALID');
const npmEnv = {...process.env, npm_config_ignore_scripts:'true'};
// 不继承额外 Node 启动 flag 或外部模块搜索目录，保证最低版本真实 ESM 消费。
delete npmEnv.NODE_OPTIONS;
delete npmEnv.NODE_PATH;
if (registry) npmEnv.npm_config_registry = registry;

function run(step, command, args, cwd, env = {}) {
  const result = spawnSync(command,args,{
    cwd,encoding:'utf8',timeout:150_000,maxBuffer:16*1024*1024,
    env:{...npmEnv,...env},windowsHide:true,
  });
  if(result.error || result.status !== 0) {
    // 不输出可能含 token 的 npm stderr；保留可诊断的受控 OS 错误码。
    // 仅保留受控 Business TypeScript 编译诊断，不输出 npm stderr 或环境。
    if (['INTENT_TYPECHECK','ACTION_TYPECHECK','COMBINED_TYPECHECK'].includes(step) && typeof result.stdout === 'string') {
      const diagnostic = result.stdout.split(/\r?\n/u)
        .map(line => line.replaceAll(cwd,'<consumer>').replaceAll(root,'<workspace>'))
        .filter(line => /^(?:(?:intent|action|combined|node_modules)\/[A-Za-z0-9_@./-]+\(\d+,\d+\): )?error TS\d{4}: /u.test(line))
        .slice(0,40);
      for(const line of diagnostic) console.error('NATIVE_CONSUMER_TS_DIAGNOSTIC '+line.slice(0,1000));
    }
    if (step === 'ACTION_PROBE' && typeof result.stdout === 'string') {
      for(const line of result.stdout.split(/\r?\n/u).filter(line => /^SDK_ACTION_CASE_FAILED \d{1,2}$/u.test(line)).slice(0,1)) console.error(line);
    }
    const code = result.error?.code;
    const safeCode = typeof code === 'string' && /^[A-Z0-9_]+$/u.test(code)
      ? code : 'NONE';
    throw new Error('NATIVE_CONSUMER_'+step+'_FAILED exit='+
      String(result.status)+' spawnCode='+safeCode);
  }
  return result.stdout;
}

mkdirSync(packs,{recursive:true});
mkdirSync(consumer,{recursive:true});
try {
  const packageDir=join(root,'packages/domain-harness');
  if(!existsSync(join(packageDir,'dist/index.js'))) {
    throw new Error('NATIVE_CONSUMER_MISSING_SDK_BUILD');
  }
  const runtime=JSON.parse(run('CONSUMER_RUNTIME',consumerNode,['--input-type=module','--eval',
    "console.log(JSON.stringify({node:process.versions.node,platform:process.platform,arch:process.arch}))",
  ],consumer));
  const [major,minor]=runtime.node.split('.').map(Number);
  assert.ok(major>22 || (major===22 && minor>=12),'NATIVE_CONSUMER_NODE_FLOOR');
  const consumerNpmVersion=run('CONSUMER_NPM_VERSION',consumerNode,consumerNpmArgs(['--version']),consumer).trim();
  const details=JSON.parse(run('PACK',npm,npmArgs([
    'pack',packageDir,'--json','--ignore-scripts','--pack-destination',packs,
  ]),root))[0];
  const tgz=join(packs,details.filename);
  const binary=readFileSync(tgz);
  const sha256=createHash('sha256').update(binary).digest('hex');
  const manifest={
    name:'dh-native-external-consumer',
    private:true,
    version:'1.0.0',
    type:'module',
    dependencies:{'@kaicreator/domain-harness':'file:'+tgz},
  };
  writeFileSync(join(consumer,'package.json'),JSON.stringify(manifest,null,2)+'\n');
  run('LOCK',consumerNode,consumerNpmArgs(['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund']),consumer);
  run('CLEAN_INSTALL',consumerNode,consumerNpmArgs(['ci','--ignore-scripts','--no-audit','--no-fund']),consumer);
  const installed=realpathSync(join(consumer,'node_modules/@kaicreator/domain-harness'));
  assert.notEqual(installed.startsWith(root),true,'must not be a workspace symlink');
  const installedPkg=JSON.parse(readFileSync(join(installed,'package.json'),'utf8'));
  const sourcePkg=JSON.parse(readFileSync(join(packageDir,'package.json'),'utf8'));
  assert.equal(installedPkg.name,sourcePkg.name);
  assert.equal(installedPkg.version,sourcePkg.version);
  assert.deepEqual(Object.keys(installedPkg.dependencies).sort(),['@photostructure/sqlite','xstate','yaml']);
  assert.deepEqual(Object.keys(installedPkg.exports),['.']);
  assert.deepEqual(Object.keys(manifest.dependencies),['@kaicreator/domain-harness']);
  assert.ok(existsSync(join(installed,'dist/index.d.ts')));
  assert.ok(existsSync(join(installed,'dist/index.js')));

  // T02：正式包不得携带任何事务控制替换入口。tarball 清单、已安装的模块文件与模块命名空间三层核对；
  // 仓内测试用的 instrumented 副本只存在于测试进程内，不得被打包。
  const packedPaths=(details.files||[]).map(file=>file.path);
  const standardS05=verifyS05InstalledStandard({packageDir,installed,consumer,consumerNode,packedPaths,run});
  assert.ok(packedPaths.includes('dist/standard-sqlite.js'),'NATIVE_CONSUMER_PACK_LIST_INCOMPLETE');
  assert.deepEqual(packedPaths.filter(path=>/INSTRUMENTED/iu.test(path)),[],'NATIVE_CONSUMER_INSTRUMENTED_FILE_PACKED');
  const shippedControl=readFileSync(join(installed,'dist/standard-sqlite.js'),'utf8');
  for(const marker of ['controlRunner','replaceControlRunnerForTests','runRealControl',
    'sqliteDriverTestHooks','sqliteControlHooks','export default']) {
    assert.equal(shippedControl.includes(marker),false,'NATIVE_CONSUMER_CONTROL_HOOK:'+marker);
  }
  assert.equal(shippedControl.split('this.#db.exec(sql)').length-1,1,'NATIVE_CONSUMER_CONTROL_SITE');
  writeFileSync(join(consumer,'no-hook-probe.mjs'),[
    "import assert from 'node:assert/strict';",
    "import * as sdk from '@kaicreator/domain-harness';",
    "const mod=await import(new URL('./standard-sqlite.js',import.meta.resolve('@kaicreator/domain-harness')));",
    "assert.equal('default' in sdk,false);",
    "assert.equal('default' in mod,false);",
    "assert.deepEqual(Object.keys(mod).sort(),['SQLiteDatabaseElement','SQLiteDatabaseError']);",
    "console.log('NO_CONTROL_HOOK');",
  ].join('\n'));
  assert.equal(run('NO_CONTROL_HOOK',consumerNode,['no-hook-probe.mjs'],consumer).trim(),'NO_CONTROL_HOOK');

  cpSync(join(root,'examples/native-domain-app/packages'),join(consumer,'packages'),{recursive:true});
  cpSync(join(root,'examples/native-domain-app/data'),join(consumer,'data'),{recursive:true});
  cpSync(join(root,'examples/native-domain-app/main.mjs'),join(consumer,'main.mjs'));
  const appResult=run('RUN',consumerNode,['main.mjs'],consumer);
  const app=JSON.parse(appResult.trim());
  assert.deepEqual({status:app.status,count:app.count,total:app.total,firstId:app.firstId},
    {status:'PASS',count:4,total:10,firstId:'a'});
  assert.deepEqual(app.retainedBehavior,{
    initWorkflow:true,policySelectedByData:'order-policy-allow',
    strictPolicyStatus:'REJECT',multiNodeNormal:5,rejectedBranchNodes:4,
    inventoryReusesStandardReader:true,singleNode:'COMPLETE',
  });
  assert.deepEqual(app.interaction,{independentIntents:true,wrongIntentRejected:true,revision:true,
    dependencyBlocked:true,closeWaited:true,exactAndShort:true});
  assert.deepEqual(app.cli,{cases:8,realReadline:true});
  // 明确锁定已安装 App 的跨 Reader/Guard/子 Hook 共享预算结果。
  assert.deepEqual(app.budget,{
    successReads:4,
    deniedReaderReads:2,
    deniedReaderCode:'WORKFLOW_CALL_BUDGET',
    deniedHookReads:4,
    deniedHookCode:'WORKFLOW_CALL_BUDGET',
    deniedStepReads:2,
    deniedStepCode:'WORKFLOW_STEP_BUDGET',
  });

  writeFileSync(join(consumer,'probe.mts'),[
    "import { KernelLifecycle, JsonReader, SQLiteDatabaseElement, StandardWorkflowSession } from '@kaicreator/domain-harness';",
    "const life = new KernelLifecycle([]);",
    "const file = new JsonReader().read('{\"x\":1}');",
    "const flow = new StandardWorkflowSession({maxCalls:1,maxSteps:2,maxDepth:0});",
    "import type { DomainAppContext, LifecycleInitContext, PackageInitElement, StaticCorePackage } from '@kaicreator/domain-harness';",
    "type Owned = DomainAppContext & { readonly onInitResult: (n: number) => void };",
    "class OwnedInit implements PackageInitElement<Owned> { start(ctx: LifecycleInitContext<Owned>) { ctx.onInitResult(42); } }",
    "const own: StaticCorePackage<Owned> = { packageMeta: { id:'kdp',role:'core',order:0 },Init: OwnedInit };",
    "const typedLife = new KernelLifecycle<Owned>([own]);",
    "// @ts-expect-error Owned-only Init cannot be assigned to the Base App",
    "const invalidInit: PackageInitElement<DomainAppContext> = new OwnedInit();",
    "// @ts-expect-error Core requiring Owned Context cannot be passed as Base Core",
    "const invalidCore: StaticCorePackage<DomainAppContext> = own;",
    "// @ts-expect-error Explicit Base Kernel cannot hold a Core requiring Owned Context",
    "const invalidKernel = new KernelLifecycle<DomainAppContext>([own]);",
    "class BaseInit implements PackageInitElement<DomainAppContext> {",
    "  async start(ctx: LifecycleInitContext<DomainAppContext>) {",
    "    // @ts-expect-error direct Extension requires unavailable Owned callback",
    "    await ctx.enter(new OwnedInit());",
    "  }",
    "}",
    "void invalidInit; void invalidCore; void invalidKernel; void BaseInit;",
    "void typedLife.start({appId:'typed',onInitResult:n => { void n; }});",
    "// @ts-expect-error App-owned callback is required by this App type",
    "void typedLife.start({appId:'missing'});",
    "// @ts-expect-error wrong callback is rejected by TypeScript",
    "void typedLife.start({appId:'wrong',onInitResult:42});",
    "void typedLife.execute(async () => 42);",
    "void new StandardWorkflowSession({maxCalls:1,maxSteps:2,maxDepth:0})",
    "  .run(ctx => ctx.invokeOutcome<number>(() => ({status:'REJECT',reason:{code:'DENIED',message:'denied'}})));",
    "const sqlite = new SQLiteDatabaseElement(':memory:');",
    "const inserted = sqlite.transaction(tx => tx.run('CREATE TABLE s (v INTEGER)', []).changes);",
    "const picked = sqlite.select<{ v: number }>('SELECT v FROM s', [], 1);",
    "// @ts-expect-error async callbacks cannot drive a synchronous transaction",
    "sqlite.transaction(async () => 1);",
    "// @ts-expect-error a returned Promise must be rejected before commit",
    "sqlite.transaction(() => Promise.resolve(1));",
    "// @ts-expect-error a Promise-carrying union is rejected as a transaction value",
    "sqlite.transaction(() => Math.random() > 0.5 ? 1 : Promise.resolve(2));",
    "sqlite.close();",
    "import { BoundedExpressionElement } from '@kaicreator/domain-harness';",
    "import type { ExpressionScalar, ExpressionLimits } from '@kaicreator/domain-harness';",
    "const expressionLimits: Partial<ExpressionLimits> = {maxOperations:1};",
    "const expressionValue: ExpressionScalar = new BoundedExpressionElement().evaluate(JSON.stringify({op:'literal',value:1}),'{}',expressionLimits);",
    "// @ts-expect-error raw object AST is not admitted",
    "new BoundedExpressionElement().evaluate({op:'literal',value:1},'{}');",
    "void expressionValue;",
    "void life; void file; void flow; void inserted; void picked; void sqlite;",
  ].join('\n'));
  writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify({
    compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',
      moduleResolution:'NodeNext',skipLibCheck:false,types:[],
      lib:['ES2022','DOM','ESNext.Disposable']},
    include:['probe.mts','s05-types.mts'],
  },null,2));
  run('TYPECHECK',process.execPath,[
    join(root,'node_modules/typescript/bin/tsc'),'-p',join(consumer,'tsconfig.json'),
  ],consumer);

  const deny=[
    "try { await import('@kaicreator/domain-harness/runtime');",
    "  process.exitCode=2;",
    "} catch (error) { if (error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED') process.exitCode=3; }",
  ].join('\n');
  run('PRIVATE_EXPORT',consumerNode,['--input-type=module','--eval',deny],consumer);

  // T02：安装树必须携带 tarball 自带的原生 prebuild（lifecycle 全程被忽略）。
  const prebuildDir=join(consumer,'node_modules/@photostructure/sqlite/prebuilds');
  assert.ok(existsSync(prebuildDir),'NATIVE_CONSUMER_MISSING_SQLITE_PREBUILDS');

  // T02：干净安装的 packed SDK 上跑真实文件 DB：rollback/reopen/两连接 CAS。
  writeFileSync(join(consumer,'sqlite-probe.mjs'),[
    "import assert from 'node:assert/strict';",
    "import { mkdtempSync, rmSync } from 'node:fs';",
    "import { tmpdir } from 'node:os';",
    "import { join } from 'node:path';",
    "import { SQLiteDatabaseElement, SQLiteDatabaseError } from '@kaicreator/domain-harness';",
    "const folder=mkdtempSync(join(tmpdir(),'dh-sdk-sqlite-'));",
    "const file=join(folder,'store.sqlite');",
    "const first=new SQLiteDatabaseElement(file);",
    "const second=new SQLiteDatabaseElement(file);",
    "try {",
    "  first.transaction(tx=>{",
    "    tx.run('CREATE TABLE resource (id INTEGER PRIMARY KEY, version INTEGER NOT NULL)', []);",
    "    tx.run('INSERT INTO resource VALUES (1, 0)', []);",
    "  });",
    "  assert.throws(()=>first.transaction(tx=>{",
    "    tx.run('UPDATE resource SET version=5 WHERE id=1', []);",
    "    throw Error('business-rollback');",
    "  }), /business-rollback/u);",
    "  const sql='UPDATE resource SET version=version+1 WHERE id=? AND version=?';",
    "  const applied=first.transaction(tx=>tx.run(sql,[1,0]).changes);",
    "  const refused=second.transaction(tx=>tx.run(sql,[1,0]).changes);",
    "  assert.equal(applied+refused,1);",
    "  assert.equal(second.select('SELECT version FROM resource WHERE id=1',[],1)[0]?.version,1);",
    "  try { new SQLiteDatabaseElement(join(folder,'missing','x.sqlite'));",
    "    assert.fail('open must fail');",
    "  } catch (error) {",
    "    if (!(error instanceof SQLiteDatabaseError && error.code==='OPEN' &&",
    "        !error.message.includes(folder))) throw error;",
    "  }",
    "  first.close();",
    "  const reopened=new SQLiteDatabaseElement(file);",
    "  assert.equal(reopened.select('SELECT version FROM resource WHERE id=1',[],1)[0]?.version,1);",
    "  reopened.close();",
    "  second.close();",
    "  console.log('SDK_SQLITE_PROBE_PASS');",
    "} finally {",
    "  try { first.close() } catch {}",
    "  try { second.close() } catch {}",
    "  rmSync(folder,{recursive:true,force:true});",
    "}",
  ].join('\n'));
  const sqliteResult=run('SQLITE_PROBE',consumerNode,['sqlite-probe.mjs'],consumer);
  assert.equal(sqliteResult.trim(),'SDK_SQLITE_PROBE_PASS');

  // T03：从唯一真实打包 SDK 根导入，验证跨领域 Scope/有向图与访问预算。
  writeFileSync(join(consumer,'vector-graph-probe.mjs'),[
    "import assert from 'node:assert/strict';",
    "import { VectorQueryElement, GraphQueryElement } from '@kaicreator/domain-harness';",
    "const candidates=[",
    "  {id:'r2',vector:[0,1],item:{domain:'repair'}},",
    "  {id:'secret',vector:[1],item:{domain:'inventory'}},",
    "  {id:'r1',vector:[1,0],item:{domain:'repair'}},",
    "];",
    "const v=new VectorQueryElement().search(candidates,[1,0],x=>x.domain==='repair',",
    "  {topK:1,maxVisited:3,dimension:2,metric:'COSINE'});",
    "assert.equal(v.matches[0]?.id,'r1');",
    "assert.equal(v.complete,true);",
    "const g=new GraphQueryElement().search([",
    "  {from:'A',to:'B',type:'PART'},{from:'B',to:'C',type:'PART'},",
    "  {from:'C',to:'A',type:'PART'},{from:'A',to:'X',type:'FOREIGN'},",
    "],{start:'A',target:'C',direction:'OUT',relationTypes:['PART'],",
    "limits:{maxDepth:2,maxVisited:12,maxReturned:1}});",
    "assert.deepEqual(g.paths[0]?.nodes,['A','B','C']);",
    "assert.equal(g.complete,true);",
    "const partial=new GraphQueryElement().search([",
    "  {from:'A',to:'B',type:'PART'},{from:'B',to:'C',type:'PART'},",
    "],{start:'A',target:'C',direction:'OUT',",
    "limits:{maxDepth:2,maxVisited:1,maxReturned:1}});",
    "assert.equal(partial.complete,false);",
    "assert.equal(partial.truncationReason,'VISIT_LIMIT');",
    "console.log('SDK_VECTOR_GRAPH_PROBE_PASS');",
  ].join('\n'));
  const queryResult=run('VECTOR_GRAPH_PROBE',consumerNode,['vector-graph-probe.mjs'],consumer);
  assert.equal(queryResult.trim(),'SDK_VECTOR_GRAPH_PROBE_PASS');

  // T04：实际仓外 SDK 根导入，有限表达式在两个独立业务输入上复用。
  writeFileSync(join(consumer,'expression-probe.mjs'),[
    "import assert from 'node:assert/strict';",
    "import { BoundedExpressionElement } from '@kaicreator/domain-harness';",
    "const e=new BoundedExpressionElement();",
    "const lit=value=>({op:'literal',value});",
    "const get=key=>({op:'get',path:[key]});",
    "const run=(ast,input,limits)=>e.evaluate(JSON.stringify(ast),JSON.stringify(input),limits);",
    "assert.equal(run({op:'sub',args:[get('stock'),get('reserved')]},{stock:12,reserved:3}),9);",
    "assert.equal(run({op:'le',args:[get('quote'),lit(80)]},{quote:50}),true);",
    "assert.equal(run({op:'and',args:[lit(false),get('missing')]},{},{maxOperations:2}),false);",
    "assert.throws(()=>run(get('stock'),{stock:12},{maxOperations:1}),/EXPRESSION_LIMIT/u);",
    "let touched=0;",
    "const poison={get op(){touched+=1;throw Error('getter');}};",
    "assert.throws(()=>e.evaluate(poison,'{}'),/EXPRESSION_INVALID/u);",
    "assert.equal(touched,0);",
    "assert.throws(()=>e.evaluate('!'.repeat(32769),'{}'),/EXPRESSION_LIMIT/u);",
    "console.log('SDK_EXPRESSION_PROBE_PASS');",
  ].join('\n'));
  assert.equal(run('EXPRESSION_PROBE',consumerNode,['expression-probe.mjs'],consumer).trim(),'SDK_EXPRESSION_PROBE_PASS');

  // T05：编译同一份 Business 源码及验证，不引入额外消费者直接依赖。
  cpSync(join(root,'examples/native-domain-app/intent'),join(consumer,'intent'),{recursive:true});
  writeFileSync(join(consumer,'tsconfig-intent.json'),JSON.stringify({
    compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',
      strict:true,noUnusedLocals:true,noUnusedParameters:true,noImplicitReturns:true,
      exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,verbatimModuleSyntax:true,
      // 与仓内 TS Profile 一致；依赖声明的完整检查仍由上方独立 TYPECHECK 执行。
      skipLibCheck:true,types:[],lib:['ES2022','DOM','ESNext.Disposable'],
      rootDir:'intent',outDir:'intent-dist'},include:['intent/**/*.ts'],
  },null,2));
  run('INTENT_TYPECHECK',process.execPath,[
    join(root,'node_modules/typescript/bin/tsc'),'--pretty','false','-p',join(consumer,'tsconfig-intent.json'),
  ],consumer);
  const intentProbe=[
    "import { intentCases } from './intent-dist/verify.js';",
    "for (const [, verify] of intentCases) await verify();",
    "console.log('SDK_INTENT_PROBE_PASS '+intentCases.length);",
  ].join('\n');
  assert.equal(run('INTENT_PROBE',consumerNode,[
    '--unhandled-rejections=strict','--input-type=module','--eval',intentProbe,
  ],consumer).trim(),'SDK_INTENT_PROBE_PASS 8');

  // T06：正式 SDK 与相同业务源码，在仓外独立进程中验证真实 Host 和持久 Receipt。
  cpSync(join(root,'examples/native-domain-app/action'),join(consumer,'action'),{recursive:true});
  writeFileSync(join(consumer,'tsconfig-action.json'),JSON.stringify({
    compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',
      strict:true,noUnusedLocals:true,noUnusedParameters:true,noImplicitReturns:true,
      exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,verbatimModuleSyntax:true,
      skipLibCheck:true,types:['node'],typeRoots:[join(root,'node_modules/@types')],
      lib:['ES2022','DOM','ESNext.Disposable'],rootDir:'action',outDir:'action-dist'},
    include:['action/**/*.ts'],
  },null,2));
  run('ACTION_TYPECHECK',process.execPath,[
    join(root,'node_modules/typescript/bin/tsc'),'--pretty','false','-p',join(consumer,'tsconfig-action.json'),
  ],consumer);
  const actionProbe=[
    "import { actionCases, interactiveActionCases } from './action-dist/verify.js';",
    "for (const [i, [, verify]] of [...actionCases,...interactiveActionCases].entries()) { try { await verify(); } catch { console.log('SDK_ACTION_CASE_FAILED '+i); throw Error('ACTION_CASE_FAILED'); } }",
    "console.log('SDK_ACTION_PROBE_PASS '+(actionCases.length+interactiveActionCases.length));",
  ].join('\n');
  assert.equal(run('ACTION_PROBE',consumerNode,[
    '--unhandled-rejections=strict','--input-type=module','--eval',actionProbe,
  ],consumer).trim(),'SDK_ACTION_PROBE_PASS 13');

  // T07：两个新增 Business Package 在同一个外部应用与实际 Host 中组合。
  cpSync(join(root,'examples/native-domain-app/combined'),join(consumer,'combined'),{recursive:true});
  writeFileSync(join(consumer,'tsconfig-combined.json'),JSON.stringify({
    compilerOptions:{target:'ES2022',module:'NodeNext',moduleResolution:'NodeNext',
      strict:true,noUnusedLocals:true,noUnusedParameters:true,noImplicitReturns:true,
      exactOptionalPropertyTypes:true,noUncheckedIndexedAccess:true,verbatimModuleSyntax:true,
      skipLibCheck:true,types:['node'],typeRoots:[join(root,'node_modules/@types')],
      lib:['ES2022','DOM','ESNext.Disposable'],rootDir:'.',outDir:'combined-dist'},
    include:['combined/**/*.ts','action/**/*.ts'],
  },null,2));
  run('COMBINED_TYPECHECK',process.execPath,[
    join(root,'node_modules/typescript/bin/tsc'),'--pretty','false','-p',join(consumer,'tsconfig-combined.json'),
  ],consumer);
  const combinedProbe=[
    "import { verifyCombined } from './combined-dist/combined/verify.js';",
    "await verifyCombined();",
    "console.log('SDK_COMBINED_PROBE_PASS');",
  ].join('\n');
  assert.equal(run('COMBINED_PROBE',consumerNode,[
    '--unhandled-rejections=strict','--input-type=module','--eval',combinedProbe,
  ],consumer).trim(),'SDK_COMBINED_PROBE_PASS');

  console.log(JSON.stringify({status:'NATIVE_SDK_ONLY_CONSUMER_PASS',
    directDependencies:Object.keys(manifest.dependencies),sha256,
    packageVersion:installedPkg.version,consumerRuntime:runtime,consumerNpmVersion,standardS05,
    api:'public-root',runtime:true,typescript:true,deniedPrivateSubpath:true,
    rootReaderBudget:true,deniedReaderBeforeEffects:true,deniedHookBeforeEffects:true,
    sqliteRuntime:true,sqliteCasTwoConnections:true,sqliteSanitizedOpenError:true,
    noTransactionControlHook:true,vectorGraphRuntime:true,expressionRuntime:true,intentWorkflows:true,authorizedAction:true,combinedProduct:true}));
} finally {
  if (process.env.DH_NATIVE_KEEP_EVIDENCE !== '1') rmSync(work,{recursive:true,force:true});
  else console.error('NATIVE_CONSUMER_EVIDENCE_DIR='+work);
}
