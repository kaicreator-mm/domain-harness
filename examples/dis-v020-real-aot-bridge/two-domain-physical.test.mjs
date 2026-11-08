import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {load} from '../../packages/microkernel/dist/index.js';
import {getPolicy as inventoryPolicy} from './business-inventory-v1.mjs';
import {makeTwoDomainBuilt,makeTwoDomainManifest,INVENTORY_PACKAGE,QUOTE_INPUT,INVENTORY_INPUT} from './two-domain-composition.mjs';
import {compileProjection,createActivation,exportProjectionRecord} from './bridge.mjs';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {openPhysicalStore,protectedKdpSnapshot} from './physical-store.mjs';

const denial=c=>e=>e?.code===c;
async function makeDual(){
 const built=await makeTwoDomainBuilt(),manifest=await makeTwoDomainManifest(built);
 const projection=await compileProjection(manifest,built);
 return {built,manifest,projection};
}
async function runChild(path,recordPath,digest,outPath){
 const child=fileURLToPath(new URL('./physical-restart-child.mjs',import.meta.url));
 return spawnSync(process.execPath,['--import','tsx',child,path,recordPath,digest,outPath],
   {encoding:'utf8'});
}
test('second Business is an actual independently compiled inventory Domain, not another quote alias',async()=>{
 const {built,projection}=await makeDual();
 assert.equal(inventoryPolicy().domainId,'inventory');
 const businesses=built.modules.filter(m=>m.role==='business');
 assert.equal(businesses.length,2);
 assert.ok(businesses.some(m=>m.packageId===INVENTORY_PACKAGE));
 assert.ok(businesses.some(m=>m.packageId==='business-order-approval@v08.1.0.0'));
 assert.equal(projection.routes.get('reserveStock').intentType,'reserveInventory');
 assert.equal(projection.routes.get('approveQuote').intentType,'submitQuoteDecisionDynamic');
});
test('real KDP accepts independent orders and inventory Functions after one Business App Init',async()=>{
 const {built,projection}=await makeDual();
 const app=createActivation({projection,built,load,store:new PlainCasDocStore()});
 try{
  await assert.rejects(app.invoke('reserveStock',INVENTORY_INPUT),denial('APP_NOT_READY'));
  assert.equal((await app.start()).status,'READY');
  const quote=await app.invoke('approveQuote',QUOTE_INPUT);
  const stock=await app.invoke('reserveStock',INVENTORY_INPUT);
  assert.equal(quote.status,'admitted',JSON.stringify(quote).slice(0,500));
  assert.equal(stock.status,'admitted',JSON.stringify(stock).slice(0,500));
 }finally{app.stop()}
});
test('inventory guard is enforced by selected KDP, independently from orders policy',async()=>{
 const {built,projection}=await makeDual();
 const app=createActivation({projection,built,load,store:new PlainCasDocStore()});
 try{
  await app.start();
  const bad={...INVENTORY_INPUT,messageId:'msg:inventory-denied',instanceKey:'denied-inventory',
    input:{...INVENTORY_INPUT.input,approved:false}};
  let result;try{result=await app.invoke('reserveStock',bad)}catch(e){result=e}
  assert.notEqual(result?.status,'admitted','guard refusal must not admit stock reservation');
 }finally{app.stop()}
});
test('unselected inventory Business or wrong public Function is denied at AOT',async()=>{
 const {built,manifest}=await makeDual();
 const missing=structuredClone(manifest);
 missing.elements.find(e=>e.id==='inventory.stock').packageId='other-business';
 await assert.rejects(compileProjection(missing,built),denial('ELEMENT_PACKAGE_NOT_SELECTED'));
 const wrong=structuredClone(manifest);
 wrong.elements.find(e=>e.id==='inventory.stock').functions[0].intentId='not-a-route';
 await assert.rejects(compileProjection(wrong,built),denial('FUNCTION_NOT_EXPORTED'));
});
test('two Domain Functions remain scoped with the same instanceKey in real physical KDP SQLite',async()=>{
 const {built,projection}=await makeDual();
 const dir=await mkdtemp(join(tmpdir(),'dis-v020-physical-domains-'));
 const dbPath=join(dir,'k.sqlite');
 let physical,app;
 try{
  const opened=await openPhysicalStore(dbPath);physical=opened.physical;
  app=createActivation({projection,built,load,store:opened.docs});
  assert.equal((await app.start()).status,'READY');
  const first=await app.invoke('approveQuote',QUOTE_INPUT);
  const second=await app.invoke('reserveStock',INVENTORY_INPUT);
  assert.equal(first.status,'admitted');
  assert.equal(second.status,'admitted');
  const snapshot=await protectedKdpSnapshot(physical);
  assert.ok(snapshot.instanceRows>=2,'two real distinct Business instance rows');
  assert.ok(snapshot.effectJournalRows>=1,'real KDP journal exists for order Effect');
  assert.ok(snapshot.totalKdpRows>=2);
  const sqliteBytes=await readFile(dbPath);
  assert.equal(sqliteBytes.subarray(0,16).toString(),'SQLite format 3\0');
 }finally{app?.stop();await physical?.close();await rm(dir,{recursive:true,force:true})}
});
test('physical SQLite Journal survives close and a real second Node process without duplicated Effects',async()=>{
 const {built,projection}=await makeDual();
 const dir=await mkdtemp(join(tmpdir(),'dis-v020-physical-restart-'));
 const path=join(dir,'k.sqlite'),recordPath=join(dir,'projection.json'),outPath=join(dir,'replay.json');
 const record=exportProjectionRecord(projection);
 let physical,app;
 try{
  const opened=await openPhysicalStore(path);physical=opened.physical;
  app=createActivation({projection,built,load,store:opened.docs});
  await app.start();
  const first=await app.invoke('approveQuote',QUOTE_INPUT);
  const second=await app.invoke('reserveStock',INVENTORY_INPUT);
  assert.equal(first.status,'admitted');assert.equal(second.status,'admitted');
  const original=await protectedKdpSnapshot(physical);
  assert.ok(original.effectJournalRows>=1&&original.instanceRows>=2);
  await writeFile(recordPath,JSON.stringify(record),'utf8');
  app.stop();app=null;
  await physical.close();physical=null;
  const proc=await runChild(path,recordPath,projection.projectionDigest,outPath);
  assert.equal(proc.status,0,proc.stderr);
  const proof=JSON.parse(await readFile(outPath,'utf8'));
  assert.equal(proof.status,'REAL_SQLITE_TWO_DOMAIN_RESTORED');
  assert.equal(proof.sourceDigest,built.subjectDigest);
  assert.equal(proof.projectionDigest,projection.projectionDigest);
  assert.equal(proof.orderReplay,true);
  assert.equal(proof.inventoryReplay,true);
  assert.equal(proof.rows.digest,original.digest,'real physical KDP state/journal must remain byte-equivalent');
  assert.equal(proof.rows.instanceRows,original.instanceRows);
  assert.equal(proof.rows.effectJournalRows,original.effectJournalRows);
 }finally{app?.stop();await physical?.close();await rm(dir,{recursive:true,force:true})}
});
test('untrusted persisted Projection cannot restore physical KDP Journal with wrong installed digest',async()=>{
 const {built,projection}=await makeDual();
 const dir=await mkdtemp(join(tmpdir(),'dis-v020-physical-deny-'));
 const path=join(dir,'k.sqlite'),recordPath=join(dir,'projection.json'),outPath=join(dir,'bad-out.json');
 let physical;
 try{
  const opened=await openPhysicalStore(path);physical=opened.physical;
  const app=createActivation({projection,built,load,store:opened.docs});
  try{await app.start();assert.equal((await app.invoke('approveQuote',QUOTE_INPUT)).status,'admitted')}finally{app.stop()}
  await writeFile(recordPath,JSON.stringify(exportProjectionRecord(projection)),'utf8');
  await physical.close();physical=null;
  const before=await readFile(path);
  const proc=await runChild(path,recordPath,'incorrect-independent-anchor',outPath);
  assert.notEqual(proc.status,0,'invalid anchor must refuse the subprocess restore');
  assert.match(proc.stderr,/AOT_PROJECTION_RECORD_DRIFT/);
  const after=await readFile(path);
  assert.deepEqual(after,before,'invalid restore must not mutate the physical KDP store');
 }finally{await physical?.close();await rm(dir,{recursive:true,force:true})}
});
