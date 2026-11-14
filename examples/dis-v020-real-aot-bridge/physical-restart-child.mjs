/**
 * Fresh real second Node process: re-build two Business Domains and restore
 * installed DIS projection and actual KDP Journal from the parent SQLite file.
 */
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {load} from '../../packages/microkernel/dist/index.js';
import {makeTwoDomainBuilt,QUOTE_INPUT,INVENTORY_INPUT} from './two-domain-composition.mjs';
import {restoreProjectionRecord,createActivation} from './bridge.mjs';
import {openPhysicalStore,protectedKdpSnapshot} from './physical-store.mjs';

const [path,recordPath,expectedProjectionDigest,outPath]=process.argv.slice(2);
if(!path||!recordPath||!expectedProjectionDigest||!outPath)throw Error('missing trusted installed parameters');
const record=JSON.parse(await readFile(recordPath,'utf8'));
const built=await makeTwoDomainBuilt();
const projection=await restoreProjectionRecord(record,built,{expectedProjectionDigest});
const {physical,docs}=await openPhysicalStore(path);
let app;
try{
 const before=await protectedKdpSnapshot(physical);
 assert.ok(before.instanceRows>=2,'both Business Domains must have real persisted KDP states');
 assert.ok(before.effectJournalRows>=1,'orders Domain must have a real KDP effect journal');
 app=createActivation({projection,built,load,store:docs});
 assert.equal((await app.start()).status,'READY');
 const quote=await app.invoke('approveQuote',QUOTE_INPUT);
 const stock=await app.invoke('reserveStock',INVENTORY_INPUT);
 assert.equal(quote.idempotentReplay,true,'original orders KDP receipt must replay');
 assert.equal(stock.idempotentReplay,true,'original inventory KDP receipt must replay');
 const after=await protectedKdpSnapshot(physical);
 assert.equal(after.digest,before.digest,'KDP Journal and state rows may not be rewritten by replay');
 await writeFile(outPath,JSON.stringify({
   status:'REAL_SQLITE_TWO_DOMAIN_RESTORED',sourceDigest:built.subjectDigest,
   projectionDigest:projection.projectionDigest,rows:after,
   orderReplay:quote.idempotentReplay,inventoryReplay:stock.idempotentReplay,
 }),{encoding:'utf8',flag:'wx'});
}finally{app?.stop();await physical.close()}
