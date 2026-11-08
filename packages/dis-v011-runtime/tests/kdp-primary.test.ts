import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';
import { digest } from '../src/knowledge.ts';

const buildExample = await import(new URL('../../../examples/dis-0.1.0-runtime-consumer/build.mjs', import.meta.url).href);
const appExample = await import(new URL('../../../examples/dis-0.1.0-runtime-consumer/app.mjs', import.meta.url).href);
const { bootKdp } = await import(new URL('../dist/boot.js', import.meta.url).href);
const { registerBuild } = await import(new URL('../dist/provider-bindings.js', import.meta.url).href);
const evidence = process.env.DIS_RUNTIME_EVIDENCE_DIR || os.tmpdir();
const intent = {intentType:'recognizePlayer',messageId:'one',instanceKey:'page:boot',
  input:{observation:{url:'https://example.test/video',signals:['jwplayer.setup']}}};

test('Core boots with SDK BUILD, Business and provider imports denied until attachment', async () => {
  await mkdir(evidence,{recursive:true});
  const dir=await mkdtemp(path.join(evidence,'dis-boot-isolated-'));
  try {
    const descriptor=await appExample.deployment('baseline');
    const entry=new URL('../dist/boot.js',import.meta.url).href;
    const appEntry=new URL('../../../examples/dis-0.1.0-runtime-consumer/app.mjs',import.meta.url).href;
    const kernel=fileURLToPath(new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs',import.meta.url));
    const script=`import {registerHooks} from 'node:module';import {readFile} from 'node:fs/promises';
registerHooks({resolve(s,c,n){if(/domain-harness-build|domain-harness-contracts|provider-bindings|provider\\.mjs|build\\.mjs|ajv/.test(s))throw Error('PREMATURE_SDK:'+s+' FROM '+c.parentURL);return n(s,c)}});
await import(process.argv[5]);const {bootKdp}=await import(process.argv[1]);const d=JSON.parse(process.argv[2]);const k=await readFile(process.argv[3],'utf8');
const host=async()=>({get:async()=>null,put:async()=>{throw Error('unexpected write')},remove:async()=>{throw Error('unexpected remove')},list:async()=>[],close:async()=>{}});
const core=await bootKdp(d,k,process.argv[4],{primarySha256:d.primarySha256,lockSha256:d.expected.lock},host);
if(core.identity.runtimeInstances!==1)throw Error('WRONG_KERNEL_COUNT');await core.close();`;
    const child=spawnSync(process.execPath,['--input-type=module','-e',script,entry,JSON.stringify(descriptor),kernel,path.join(dir,'isolated.sqlite'),appEntry],{encoding:'utf8'});
    assert.equal(child.status,0,child.stderr);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test('Boot verifies one exact Primary and initializes the real Core before loading any app', async () => {
  await mkdir(evidence,{recursive:true});
  const dir = await mkdtemp(path.join(evidence,'dis-boot-'));
  const file = path.join(dir,'kernel.sqlite');
  try {
    const descriptor = await appExample.deployment('baseline');
    const trusted = {primarySha256:descriptor.primarySha256,lockSha256:descriptor.expected.lock};
    const kernel = await appExample.loadKernelSource();
    await assert.rejects(bootKdp({...descriptor,primarySha256:'0'.repeat(64)},kernel,file,trusted,openSqliteCasStore),/BOOT_DESCRIPTOR_INVALID/);
    await assert.rejects(bootKdp(descriptor,kernel+'\n// drift',file,trusted,openSqliteCasStore),/UNTRUSTED_SELECTED_KERNEL/);
    await assert.rejects(bootKdp(descriptor,kernel,file,{...trusted,lockSha256:'0'.repeat(64)},openSqliteCasStore),/BOOT_DESCRIPTOR_INVALID/);
    await assert.rejects(access(file),{code:'ENOENT'});
    const kdp = await bootKdp(descriptor,kernel,file,trusted,openSqliteCasStore);
    const audit = await openSqliteCasStore({path:file});
    try {
      assert.equal(kdp.identity.runtimeInstances,1);
      assert.equal(kdp.identity.primarySha256,descriptor.primarySha256);
      await assert.rejects(kdp.send(intent),/KDP_PACKAGE_UNATTACHED/);
      assert.deepEqual(await audit.list('dis-kdp/'),[]);
      const other = await appExample.deployment('reselected');
      const wrongPackage = await buildExample.buildDemo('reselected', other.expected);
      await assert.rejects(kdp.attach(wrongPackage),/KDP_PACKAGE_LOCK_MISMATCH/);
      const built = await buildExample.buildDemo('baseline', descriptor.expected);
      await assert.rejects(kdp.attach(structuredClone(built)),/BUILD_NOT_QUALIFIED/);
      const alteredApp=structuredClone(built.app);
      const alteredBusiness=alteredApp.modules.find((module: {role:string})=>module.role==='business');
      alteredBusiness.moduleSource=alteredBusiness.moduleSource.replace('PRIVATE_LOCAL_READ_ONLY','GLOBAL_WRITE');
      alteredBusiness.moduleSha256=digest(alteredBusiness.moduleSource);
      const badPolicy=registerBuild({...built,app:alteredApp});
      await assert.rejects(kdp.attach(badPolicy),/BUILD_APP_READ_POLICY_INVALID/);
      await kdp.attach(built);
      await assert.rejects(kdp.attach(built),/KDP_ALREADY_ATTACHING_OR_ATTACHED/);
      await assert.rejects(kdp.send({...intent,intentType:'download'}),/BUILD_ROUTE_UNAUTHORIZED/);
      await assert.rejects(kdp.send({...intent,caller:{role:'owner'}}),/KDP_OPERATION_UNAUTHORIZED/);
      assert.deepEqual(await audit.list('dis-kdp/'),[]);
      const receipts = await Promise.all([kdp.send(intent),kdp.send({...intent,messageId:'two'})]);
      for (const receipt of receipts) assert.equal(receipt.status,'admitted');
      assert.notEqual(receipts[0].admitted.effects[0].effectId,receipts[1].admitted.effects[0].effectId);
      const pins=await audit.list('dis-kdp/tenant:dis-reference/'+descriptor.expected.lock+'/v08-kernel:governance-pin:');
      assert.equal(pins.length,1);assert.equal((await audit.get(pins[0]))?.value.authorityClass,'PRODUCTION');
    } finally {
      await audit.close();
      await kdp.close();
    }
    await assert.rejects(kdp.send(intent),/KDP_CLOSED/);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});
