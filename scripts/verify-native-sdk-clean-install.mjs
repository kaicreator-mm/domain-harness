/** 用唯一 SDK tarball 在全新仓外 npm 目录完成实际安装、类型和业务验收。 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
const registry = process.env.DH_NATIVE_NPM_REGISTRY;
if(registry && !/^https?:\/\//u.test(registry)) throw new Error('NATIVE_REGISTRY_INVALID');
const npmEnv = {...process.env, npm_config_ignore_scripts:'true'};
if (registry) npmEnv.npm_config_registry = registry;

function run(step, command, args, cwd, env = {}) {
  const result = spawnSync(command,args,{
    cwd,encoding:'utf8',timeout:150_000,maxBuffer:16*1024*1024,
    env:{...npmEnv,...env},windowsHide:true,
  });
  if(result.error || result.status !== 0) {
    // 不输出可能含 token 的 npm stderr；保留可诊断的受控 OS 错误码。
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
  run('LOCK',npm,npmArgs(['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund']),consumer);
  run('CLEAN_INSTALL',npm,npmArgs(['ci','--ignore-scripts','--no-audit','--no-fund']),consumer);
  const installed=realpathSync(join(consumer,'node_modules/@kaicreator/domain-harness'));
  assert.notEqual(installed.startsWith(root),true,'must not be a workspace symlink');
  const installedPkg=JSON.parse(readFileSync(join(installed,'package.json'),'utf8'));
  assert.deepEqual(Object.keys(installedPkg.dependencies).sort(),['xstate','yaml']);
  assert.deepEqual(Object.keys(installedPkg.exports),['.']);
  assert.deepEqual(Object.keys(manifest.dependencies),['@kaicreator/domain-harness']);
  assert.ok(existsSync(join(installed,'dist/index.d.ts')));
  assert.ok(existsSync(join(installed,'dist/index.js')));

  cpSync(join(root,'examples/native-domain-app/packages'),join(consumer,'packages'),{recursive:true});
  cpSync(join(root,'examples/native-domain-app/data'),join(consumer,'data'),{recursive:true});
  cpSync(join(root,'examples/native-domain-app/main.mjs'),join(consumer,'main.mjs'));
  const appResult=run('RUN',process.execPath,['main.mjs'],consumer);
  const app=JSON.parse(appResult.trim());
  assert.deepEqual({status:app.status,count:app.count,total:app.total,firstId:app.firstId},
    {status:'PASS',count:4,total:10,firstId:'a'});
  assert.deepEqual(app.retainedBehavior,{
    initWorkflow:true,policySelectedByData:'order-policy-allow',
    strictPolicyStatus:'REJECT',multiNodeNormal:5,rejectedBranchNodes:4,
    inventoryReusesStandardReader:true,singleNode:'COMPLETE',
  });
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
    "import { KernelLifecycle, JsonReader, StandardWorkflowSession } from '@kaicreator/domain-harness';",
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
    "void life; void file; void flow;",
  ].join('\n'));
  writeFileSync(join(consumer,'tsconfig.json'),JSON.stringify({
    compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'NodeNext',
      moduleResolution:'NodeNext',skipLibCheck:false,types:[],
      lib:['ES2022','DOM','ESNext.Disposable']},
    include:['probe.mts'],
  },null,2));
  run('TYPECHECK',process.execPath,[
    join(root,'node_modules/typescript/bin/tsc'),'-p',join(consumer,'tsconfig.json'),
  ],consumer);

  const deny=[
    "try { await import('@kaicreator/domain-harness/runtime');",
    "  process.exitCode=2;",
    "} catch (error) { if (error.code!=='ERR_PACKAGE_PATH_NOT_EXPORTED') process.exitCode=3; }",
  ].join('\n');
  run('PRIVATE_EXPORT',process.execPath,['--input-type=module','--eval',deny],consumer);

  console.log(JSON.stringify({status:'NATIVE_SDK_ONLY_CONSUMER_PASS',
    directDependencies:Object.keys(manifest.dependencies),sha256,
    api:'public-root',runtime:true,typescript:true,deniedPrivateSubpath:true,
    rootReaderBudget:true,deniedReaderBeforeEffects:true,deniedHookBeforeEffects:true}));
} finally {
  if (process.env.DH_NATIVE_KEEP_EVIDENCE !== '1') rmSync(work,{recursive:true,force:true});
  else console.error('NATIVE_CONSUMER_EVIDENCE_DIR='+work);
}
