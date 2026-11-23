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
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
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
    // 不在 CI 中直接转储可能含 registry token 的 npm stderr。
    throw new Error('NATIVE_CONSUMER_'+step+'_FAILED exit='+String(result.status));
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
  const details=JSON.parse(run('PACK',npm,[
    'pack',packageDir,'--json','--ignore-scripts','--pack-destination',packs,
  ],root))[0];
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
  run('LOCK',npm,['install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund'],consumer);
  run('CLEAN_INSTALL',npm,['ci','--ignore-scripts','--no-audit','--no-fund'],consumer);
  const installed=realpathSync(join(consumer,'node_modules/@kaicreator/domain-harness'));
  assert.notEqual(installed.startsWith(root),true,'must not be a workspace symlink');
  const installedPkg=JSON.parse(readFileSync(join(installed,'package.json'),'utf8'));
  assert.deepEqual(Object.keys(installedPkg.dependencies).sort(),['xstate','yaml']);
  assert.deepEqual(Object.keys(installedPkg.exports),['.']);
  assert.deepEqual(Object.keys(manifest.dependencies),['@kaicreator/domain-harness']);
  assert.ok(existsSync(join(installed,'dist/index.d.ts')));
  assert.ok(existsSync(join(installed,'dist/index.js')));

  cpSync(join(root,'examples/native-domain-app/packages'),join(consumer,'packages'),{recursive:true});
  cpSync(join(root,'examples/native-domain-app/main.mjs'),join(consumer,'main.mjs'));
  const appResult=run('RUN',process.execPath,['main.mjs'],consumer);
  const app=JSON.parse(appResult.trim());
  assert.deepEqual({status:app.status,count:app.count,total:app.total,firstId:app.firstId},
    {status:'PASS',count:4,total:10,firstId:'a'});

  writeFileSync(join(consumer,'probe.mts'),[
    "import { KernelLifecycle, JsonReader, StandardWorkflowSession } from '@kaicreator/domain-harness';",
    "const life = new KernelLifecycle([]);",
    "const file = new JsonReader().read('{\"x\":1}');",
    "const flow = new StandardWorkflowSession({maxCalls:1,maxSteps:2,maxDepth:0});",
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
    api:'public-root',runtime:true,typescript:true,deniedPrivateSubpath:true}));
} finally {
  if (process.env.DH_NATIVE_KEEP_EVIDENCE !== '1') rmSync(work,{recursive:true,force:true});
  else console.error('NATIVE_CONSUMER_EVIDENCE_DIR='+work);
}
