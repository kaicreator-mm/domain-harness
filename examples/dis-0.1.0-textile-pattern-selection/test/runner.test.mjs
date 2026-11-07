import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { loadPackage, runPipeline, packageRoot, sha256, lockDigest } from '../src/runner.mjs';
const pin = process.env.DIS_TEXTILE_EXPECTED_CLOSURE, selectionPin = process.env.DIS_TEXTILE_EXPECTED_SELECTION;
const pins = {expectedClosureSha256:pin,expectedSelectionSha256:selectionPin};
const loaded = await loadPackage(pins);
const scenarios = JSON.parse(await fs.readFile(path.join(packageRoot,'fixtures/scenarios.json')));
for (const scenario of scenarios) test(scenario.id, () => {
  const result = runPipeline(scenario.input,loaded);
  assert.equal(result.outcome.status,scenario.expected.status);
  assert.equal(result.outcome.technique,scenario.expected.technique);
  assert.deepEqual(result.trace.map((entry) => entry.nodeId),['recognize','decide','validate'].slice(0,result.trace.length));
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
  await assert.rejects(loadPackage({...pins,expectedClosureSha256:'0'.repeat(64)}),/CLOSURE_PIN_MISMATCH/);
  await assert.rejects(loadPackage({expectedClosureSha256:pin}),/SELECTION_PIN_MISMATCH/);
  await assert.rejects(loadPackage({...pins,expectedSelectionSha256:'0'.repeat(64)}),/SELECTION_PIN_MISMATCH/);
});
test('invalid structured brief rejects instead of choosing a process', () => {
  for(const input of [null,{}, {domain:'textile-pattern',evidence:[42]}, {domain:'textile-pattern',evidence:[],placement:'laser'}, {domain:'textile-pattern',evidence:[],claims:[{source:'x',placement:'structure',extra:true}]}]) assert.throws(()=>runPipeline(input,loaded),(error)=>error.message==='INVALID_INPUT' && error.trace.length===1 && error.trace[0].nodeId==='recognize' && error.trace[0].failure.code==='INVALID_INPUT');
});
async function fixture(action) {
  const dir=await fs.mkdtemp(path.join(process.env.DIS_TEXTILE_TEMP_DIR,'textile-profile-'));
  await fs.cp(packageRoot,dir,{recursive:true});
  try {await action(dir);} finally {await fs.rm(dir,{recursive:true,force:true});}
}
async function reseal(dir) {
  const read=async(name)=>JSON.parse(await fs.readFile(path.join(dir,name)));
  const write=async(name,value)=>fs.writeFile(path.join(dir,name),JSON.stringify(value,null,2)+'\n');
  const knowledgeHash=sha256(await fs.readFile(path.join(dir,'fixtures/textile-knowledge.json')));
  for(const role of ['knowledge','recognizer','decision','validator','workflow']) {
    const unit=await read('domain/units/'+role+'.json');unit.revision='2.0.0';unit.knowledgeRefs[0].revision='2.0.0';unit.knowledgeRefs[0].sha256=knowledgeHash;if(role==='workflow')unit.implementation.ref='graph:textile.pattern-selection@2.0.0';await write('domain/units/'+role+'.json',unit);
  }
  const graph=await read('domain/textile-pattern-selection.graph.json');graph.revision='2.0.0';for(const node of graph.nodes)node.unitRef.revision='2.0.0';await write('domain/textile-pattern-selection.graph.json',graph);
  const definition=await read('domain/definition.json');definition.revision='2.0.0';definition.workflowRef.graphRef.revision='2.0.0';definition.workflowRef.unitRef.revision='2.0.0';for(const component of definition.components)component.unitRef.revision='2.0.0';await write('domain/definition.json',definition);
  const manifest=await read('domain/resource-closure.json');
  manifest.packageRevision='2.0.0';manifest.definitionRef.revision='2.0.0';manifest.graphRef.revision='2.0.0';for(const unit of manifest.units)unit.revision='2.0.0';
  for(const entry of manifest.resources) entry.sha256=sha256(await fs.readFile(path.join(dir,entry.path)));
  await write('domain/resource-closure.json',manifest);
  const digest=sha256(await fs.readFile(path.join(dir,'domain/resource-closure.json')));
  const desc=await read('package.json');desc.dis.revision='2.0.0';desc.dis.resourceClosureSha256=digest;const lock=desc.dis.selectionLock;lock.packageRevision='2.0.0';lock.closureSha256=digest;for(const asset of lock.assets){asset.revision='2.0.0';asset.sha256=manifest.resources.find((entry)=>entry.path===asset.path).sha256;}desc.dis.selectionLockSha256=lockDigest(lock);await write('package.json',desc);
  return {expectedClosureSha256:digest,expectedSelectionSha256:desc.dis.selectionLockSha256};
}
test('selected Knowledge mutation changes actual execution under new exact pin', async()=>fixture(async(dir)=>{
  const file=path.join(dir,'fixtures/textile-knowledge.json'), knowledge=JSON.parse(await fs.readFile(file));
  knowledge.revision='2.0.0';knowledge.rules.find((rule)=>rule.id==='jacquard').enabled=false;
  await fs.writeFile(file,JSON.stringify(knowledge,null,2)+'\n');
  await assert.rejects(loadPackage({root:dir,...pins}),/RESOURCE_DIGEST_MISMATCH/);
  const newPins=await reseal(dir), selected=await loadPackage({root:dir,...newPins});
  const changed=runPipeline(scenarios[0].input,selected);
  assert.equal(changed.outcome.status,'UNKNOWN');assert.equal(changed.outcome.technique,null);
  assert.equal(runPipeline(scenarios[0].input,loaded).outcome.technique,'jacquard');
  if(process.env.TEXTILE_EMIT_CHANGED==='1') console.log('TEXTILE_CHANGED='+JSON.stringify({input:scenarios[0].input,result:changed,knowledge,manifest:JSON.parse(await fs.readFile(path.join(dir,'domain/resource-closure.json')))}));
}));
test('path traversal fails even with externally admitted malicious envelope',async()=>fixture(async(dir)=>{
  const file=path.join(dir,'domain/resource-closure.json'), manifest=JSON.parse(await fs.readFile(file));
  manifest.resources[0].path='../outside.json';await fs.writeFile(file,JSON.stringify(manifest));
  const desc=JSON.parse(await fs.readFile(path.join(dir,'package.json')));desc.dis.resourceClosureSha256=sha256(await fs.readFile(file));desc.dis.selectionLock.closureSha256=desc.dis.resourceClosureSha256;desc.dis.selectionLockSha256=lockDigest(desc.dis.selectionLock);await fs.writeFile(path.join(dir,'package.json'),JSON.stringify(desc));
  await assert.rejects(loadPackage({root:dir,expectedClosureSha256:desc.dis.resourceClosureSha256,expectedSelectionSha256:desc.dis.selectionLockSha256}),/UNSAFE_PATH/);
}));
test('reference policy denies production even when newly pinned',async()=>fixture(async(dir)=>{
  const file=path.join(dir,'package.json'), desc=JSON.parse(await fs.readFile(file));desc.dis.selectionLock.referencePolicy.production=true;desc.dis.selectionLockSha256=lockDigest(desc.dis.selectionLock);await fs.writeFile(file,JSON.stringify(desc));
  await assert.rejects(loadPackage({root:dir,expectedClosureSha256:pin,expectedSelectionSha256:desc.dis.selectionLockSha256}),/UNAUTHORIZED_REFERENCE_SELECTION/);
}));
test('resource modification is rejected',async()=>fixture(async(dir)=>{
  await fs.appendFile(path.join(dir,'domain/units/decision.json'),' ');
  await assert.rejects(loadPackage({root:dir,...pins}),/RESOURCE_DIGEST_MISMATCH/);
}));
