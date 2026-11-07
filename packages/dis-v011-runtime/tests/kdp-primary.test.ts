import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openSqliteCasStore } from '@kaicreator/domain-harness/v8/host';

const buildExample = await import(new URL('../../../examples/dis-0.1.0-runtime-consumer/build.mjs', import.meta.url).href);
const { bootKdp } = await import(new URL('../dist/index.js', import.meta.url).href);
const evidence = process.env.DIS_RUNTIME_EVIDENCE_DIR || os.tmpdir();
const intent = {intentType:'recognizePlayer',messageId:'one',instanceKey:'page:boot',
  input:{observation:{url:'https://example.test/video',signals:['jwplayer.setup']}}};

test('Boot verifies one exact Primary and initializes the real Core before loading any app', async () => {
  await mkdir(evidence,{recursive:true});
  const dir = await mkdtemp(path.join(evidence,'dis-boot-'));
  const file = path.join(dir,'kernel.sqlite');
  try {
    const descriptor = await buildExample.deployment('baseline');
    const kernel = await buildExample.loadKernelSource();
    await assert.rejects(bootKdp({...descriptor,primarySha256:'0'.repeat(64)},kernel,file),/KDP_PRIMARY_DIGEST_MISMATCH/);
    await assert.rejects(bootKdp(descriptor,kernel+'\n// drift',file),/UNTRUSTED_SELECTED_KERNEL/);
    await assert.rejects(access(file),{code:'ENOENT'});
    const kdp = await bootKdp(descriptor,kernel,file);
    const audit = await openSqliteCasStore({path:file});
    try {
      assert.equal(kdp.identity.runtimeInstances,1);
      assert.equal(kdp.identity.primarySha256,descriptor.primarySha256);
      await assert.rejects(kdp.send(intent),/KDP_PACKAGE_UNATTACHED/);
      assert.deepEqual(await audit.list('dis-kdp/'),[]);
      const wrongPackage = await buildExample.buildDemo('reselected');
      await assert.rejects(kdp.attach(wrongPackage),/KDP_PACKAGE_LOCK_MISMATCH/);
      const built = await buildExample.buildDemo();
      await assert.rejects(kdp.attach(structuredClone(built)),/BUILD_NOT_QUALIFIED/);
      await kdp.attach(built);
      await assert.rejects(kdp.attach(built),/KDP_ALREADY_ATTACHING_OR_ATTACHED/);
      await assert.rejects(kdp.send({...intent,intentType:'download'}),/KDP_OPERATION_UNAUTHORIZED/);
      await assert.rejects(kdp.send({...intent,caller:{role:'owner'}}),/KDP_OPERATION_UNAUTHORIZED/);
      assert.deepEqual(await audit.list('dis-kdp/'),[]);
      const receipts = await Promise.all([kdp.send(intent),kdp.send({...intent,messageId:'two'})]);
      for (const receipt of receipts) assert.equal(receipt.status,'admitted');
      assert.notEqual(receipts[0].admitted.effects[0].effectId,receipts[1].admitted.effects[0].effectId);
    } finally {
      await audit.close();
      await kdp.close();
    }
    await assert.rejects(kdp.send(intent),/KDP_CLOSED/);
  } finally {
    await rm(dir,{recursive:true,force:true});
  }
});
