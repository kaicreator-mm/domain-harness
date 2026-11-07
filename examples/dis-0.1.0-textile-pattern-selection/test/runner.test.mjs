import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadPackage, runPipeline, packageRoot, sha256 } from '../src/runner.mjs';
const descriptor = JSON.parse(await fs.readFile(path.join(packageRoot,'package.json')));
const pin = descriptor.dis.resourceClosureSha256;
const loaded = await loadPackage({expectedClosureSha256:pin});
const scenarios = JSON.parse(await fs.readFile(path.join(packageRoot,'fixtures/scenarios.json')));
for (const scenario of scenarios) test(scenario.id, () => {
  const result = runPipeline(scenario.input,loaded);
  assert.equal(result.outcome.status,scenario.expected.status);
  assert.equal(result.outcome.technique,scenario.expected.technique);
  assert.deepEqual(result.trace.map((entry) => entry.nodeId),['recognize','decide','validate']);
  assert.ok(result.outcome.unknowns.includes('commercial feasibility'));
});
test('execution has no ambient filesystem or network effects', () => {
  const input={domain:'textile-pattern',placement:'surface',surfaceMethod:'print',evidence:['synthetic']};
  assert.equal(runPipeline(input,loaded).outcome.technique,'block-printing');
  assert.throws(() => runPipeline({...input,tool:'machine'},loaded),/INVALID_INPUT/);
  assert.throws(() => runPipeline(input,{}),/UNVERIFIED_PACKAGE/);
});
test('caller mutations cannot replace verified private intelligence', () => {
  const before=runPipeline(scenarios[0].input,loaded);
  loaded.identity.packageId='forged';loaded.manifest.resources.length=0;
  assert.deepEqual(runPipeline(scenarios[0].input,loaded),before);
});
test('exact pin is mandatory and wrong pin fails closed', async () => {
  await assert.rejects(loadPackage(),/CLOSURE_PIN_MISMATCH/);
  await assert.rejects(loadPackage({expectedClosureSha256:'0'.repeat(64)}),/CLOSURE_PIN_MISMATCH/);
});
test('invalid structured brief rejects instead of choosing a process', () => {
  for(const input of [null,{}, {domain:'textile-pattern',evidence:[42]}, {domain:'textile-pattern',evidence:[],placement:'laser'}, {domain:'textile-pattern',evidence:[],claims:[{source:'x',placement:'structure',extra:true}]}]) assert.throws(()=>runPipeline(input,loaded),/INVALID_INPUT/);
});
async function fixture(action) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'textile-profile-'));
  await fs.cp(packageRoot,dir,{recursive:true});
  try {await action(dir);} finally {await fs.rm(dir,{recursive:true,force:true});}
}
async function reseal(dir) {
  const read=async(name)=>JSON.parse(await fs.readFile(path.join(dir,name)));
  const write=async(name,value)=>fs.writeFile(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
  const knowledgeHash=sha256(await fs.readFile(path.join(dir,'fixtures/textile-knowledge.json')));
  for(const role of ['knowledge','recognizer','decision','validator','workflow']) {
    const unit=await read('domain/units/'+role+'.json');unit.knowledgeRefs[0].sha256=knowledgeHash;await write('domain/units/'+role+'.json',unit);
  }
  const manifest=await read('domain/resource-closure.json');
  for(const entry of manifest.resources) entry.sha256=sha256(await fs.readFile(path.join(dir,entry.path)));
  await write('domain/resource-closure.json',manifest);
  const digest=sha256(await fs.readFile(path.join(dir,'domain/resource-closure.json')));
  const desc=await read('package.json');desc.dis.resourceClosureSha256=digest;await write('package.json',desc);
  return digest;
}
test('selected Knowledge mutation changes actual execution under new exact pin', async()=>fixture(async(dir)=>{
  const file=path.join(dir,'fixtures/textile-knowledge.json'), knowledge=JSON.parse(await fs.readFile(file));
  knowledge.rules.find((rule)=>rule.id==='jacquard').enabled=false;
  await fs.writeFile(file,JSON.stringify(knowledge,null,2)+'\n');
  await assert.rejects(loadPackage({root:dir,expectedClosureSha256:pin}),/RESOURCE_DIGEST_MISMATCH/);
  const newPin=await reseal(dir), selected=await loadPackage({root:dir,expectedClosureSha256:newPin});
  const changed=runPipeline(scenarios[0].input,selected);
  assert.equal(changed.outcome.status,'UNKNOWN');assert.equal(changed.outcome.technique,null);
  assert.equal(runPipeline(scenarios[0].input,loaded).outcome.technique,'jacquard');
  if(process.env.TEXTILE_EMIT_CHANGED==='1') console.log('TEXTILE_CHANGED='+JSON.stringify({input:scenarios[0].input,result:changed,knowledge,manifest:JSON.parse(await fs.readFile(path.join(dir,'domain/resource-closure.json')))}));
}));
test('path traversal and untrusted implementation fail even with resealed manifest',async()=>fixture(async(dir)=>{
  const file=path.join(dir,'domain/resource-closure.json'), manifest=JSON.parse(await fs.readFile(file));
  manifest.resources[0].path='../outside.json';await fs.writeFile(file,JSON.stringify(manifest));
  const desc=JSON.parse(await fs.readFile(path.join(dir,'package.json')));desc.dis.resourceClosureSha256=sha256(await fs.readFile(file));await fs.writeFile(path.join(dir,'package.json'),JSON.stringify(desc));
  await assert.rejects(loadPackage({root:dir,expectedClosureSha256:desc.dis.resourceClosureSha256}),/UNSAFE_PATH/);
}));
test('resource modification is rejected',async()=>fixture(async(dir)=>{
  await fs.appendFile(path.join(dir,'domain/units/decision.json'),' ');
  await assert.rejects(loadPackage({root:dir,expectedClosureSha256:pin}),/RESOURCE_DIGEST_MISMATCH/);
}));
