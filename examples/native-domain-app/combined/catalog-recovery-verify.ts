import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { InteractionElement, SQLiteDatabaseElement } from '@kaicreator/domain-harness';
import type { InteractionPrompt } from '@kaicreator/domain-harness';
import { ReservationElement } from '../action/client.js';
import { startLocalInventoryHost } from '../action/local-host.js';
import { demoIsbn, demoOlder, demoRevision, openCatalogDemo } from './catalog-demo-environment.js';
import { catalogReceiptReader, catalogReservation, pendingCatalogReservation, recoverCatalogReservation } from './catalog-reservation.js';
import type { CatalogReservationAuthority } from './catalog-reservation.js';
import { runCatalogReasoning } from './catalog-reasoning.js';
import type { CatalogTopology } from './catalog-reasoning.js';

const env=await openCatalogDemo();
const token=randomBytes(32).toString('hex');
const host=await startLocalInventoryHost(join(env.folder,'inventory.sqlite'));
let drop=true,grants=0,approvals=0,reviseAfterReadback=false;
const requests:{route:string;id:string;resource:string}[]=[];
const proxy=createServer((req,res)=>{void(async()=>{
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
  const body=Buffer.concat(chunks),command=JSON.parse(body.toString()) as {id:string;resource:string};
  const route=req.url??'';
  requests.push({route,id:command.id,resource:command.resource});
  const real=await fetch(host.base+route,{method:'POST',headers:{authorization:req.headers.authorization??'',
    'x-principal':String(req.headers['x-principal']??''),'content-type':'application/json'},body,signal:AbortSignal.timeout(4000)});
  const response=Buffer.from(await real.arrayBuffer());
  // Drop after the genuine Host response (its SQLite transaction already completed).
  if(drop&&command.resource==='book-a'){res.destroy();return;}
  res.writeHead(real.status,{'content-type':'application/json'});res.end(response);
})().catch(()=>{res.statusCode=502;res.end();});});
let client:ReservationElement|undefined;
try{
  env.owner.allow(token,'alice','shop-a','book-a');
  env.owner.allow(token,'alice','shop-a','book-b');
  await new Promise<void>((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
  const address=proxy.address();assert.ok(address&&typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  const shared=client=new ReservationElement(join(env.folder,'recovery-client.sqlite'),base,'alice',token);
  const readOriginal=catalogReceiptReader(base,'alice',token);
  const authority:CatalogReservationAuthority={tenant:'shop-a',principal:'alice',inspect:r=>env.owner.inspect('shop-a',r),
    approve:g=>{grants++;env.owner.approve(g);},readback:async(command,signal)=>{
      const reply=await readOriginal(command,signal);
      if(reviseAfterReadback&&command.resource==='book-b'&&reply.status==='COMPLETE'){
        reviseAfterReadback=false;
        env.database.transaction(tx=>tx.run('UPDATE books SET price=? WHERE tenant=? AND isbn=?',[1001,'shop-a',demoOlder]));
      }
      return reply;
    }};
  const submit=(p:InteractionPrompt,i:InteractionElement,approve:'yes'|'no')=>i.submit({
    intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{approve}});
  const run=(isbn:string,quantity:number,topology:CatalogTopology='fixed',
    confirm?:(p:InteractionPrompt,i:InteractionElement)=>void)=>{
    const interaction=new InteractionElement({onPrompt:(p,i)=>{setImmediate(()=>i.submit({
      intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{quantity}}));}});
    const confirmation=new InteractionElement({onPrompt:(p,i)=>{approvals++;if(confirm)confirm(p,i);else setImmediate(()=>submit(p,i,'yes'));}});
    return runCatalogReasoning(env.catalog,{isbn,revision:demoRevision,quantity:1,budgetCents:6000},{
      interaction,topology,current:()=>true,
      reserve:(root,plan,input,options)=>catalogReservation(env.catalog,shared,authority,confirmation,options)(root,plan,input),
    });
  };
  const actual=(r:string)=>env.owner.inspect('shop-a',r);
  const submits=()=>requests.filter(r=>r.route==='/submit');
  const first=await run(demoIsbn,1);
  assert.equal(first.status,'UNKNOWN');
  assert.deepEqual(actual('book-a'),{stock:4,version:1,effects:1});
  const pending=pendingCatalogReservation(shared,authority,'book-a');assert.ok(pending);
  assert.equal(pending.id,submits()[0]?.id);assert.equal(pending.quantity,1);assert.equal(pending.version,0);
  assert.equal(submits().length,1);assert.equal(grants,1);assert.equal(approvals,1);
  drop=false;
  const baselineRequests=requests.length;
  for(const [quantity,mode] of [[1,'replace'],[2,'skip']] as const){
    const conflict=await run(demoIsbn,quantity,mode);
    assert.equal(conflict.status,'UNKNOWN');
    assert.equal(conflict.reason.code,'CONFLICTING_UNKNOWN');
  }
  assert.equal(requests.length,baselineRequests);assert.equal(grants,1);assert.equal(approvals,1);
  assert.deepEqual(actual('book-a'),{stock:4,version:1,effects:1});
  const wrong=await recoverCatalogReservation(shared,authority,'book-a','different-id');
  assert.equal(wrong.status,'REJECT');assert.equal(requests.length,baselineRequests);
  const denied=await recoverCatalogReservation(shared,{...authority,principal:'other'},'book-a',pending.id);
  assert.equal(denied.status,'REJECT');assert.equal(requests.length,baselineRequests);
  drop=true;
  const unavailable=await recoverCatalogReservation(shared,authority,'book-a',pending.id);
  assert.equal(unavailable.status,'UNKNOWN');assert.equal(submits().length,1);
  assert.equal(pendingCatalogReservation(shared,authority,'book-a')?.id,pending.id);
  // An unrelated resource is permitted while the first is unresolved.
  const independent=await run(demoOlder,2,'skip');assert.equal(independent.status,'COMPLETE');
  assert.deepEqual(actual('book-b'),{stock:6,version:1,effects:1});
  assert.deepEqual(actual('book-a'),{stock:4,version:1,effects:1});
  assert.equal(grants,2);assert.equal(approvals,2);assert.equal(submits().length,2);
  drop=false;
  const beforeRecovery=requests.length;
  const recovered=await recoverCatalogReservation(shared,authority,'book-a',pending.id);
  if(recovered.status!=='COMPLETE')console.error(JSON.stringify({status:recovered.status,code:recovered.reason.code}));
  assert.equal(recovered.status,'COMPLETE');
  assert.equal(recovered.value.id,pending.id);assert.equal(recovered.value.version,1);assert.equal(recovered.value.remaining,4);
  assert.ok(requests.slice(beforeRecovery).length>=1);
  assert.ok(requests.slice(beforeRecovery).every(r=>r.route==='/readback'&&r.id===pending.id));
  assert.equal(pendingCatalogReservation(shared,authority,'book-a'),undefined);
  assert.deepEqual(actual('book-a'),{stock:4,version:1,effects:1});
  assert.equal(grants,2);assert.equal(submits().length,2);
  const ledger=new SQLiteDatabaseElement(join(env.folder,'recovery-client.sqlite'),{readOnly:true});
  const receipts=new SQLiteDatabaseElement(join(env.folder,'inventory.sqlite'),{readOnly:true});
  try{
    const local=ledger.select<{reply:string}>('SELECT reply FROM attempts WHERE id=?',[pending.id],1)[0];
    const remote=receipts.select<{reply:string}>('SELECT reply FROM attempts WHERE id=?',[pending.id],1)[0];
    assert.deepEqual(JSON.parse(local!.reply),recovered);
    assert.deepEqual(JSON.parse(remote!.reply),recovered);
  }finally{ledger.close();receipts.close();}
  // After explicit reconciliation, a new separately confirmed intent is permitted.
  const next=await run(demoIsbn,2,'replace');assert.equal(next.status,'COMPLETE');
  assert.notEqual(next.value.receipt?.id,pending.id);
  assert.deepEqual(actual('book-a'),{stock:2,version:2,effects:2});assert.equal(grants,3);assert.equal(submits().length,3);
  // Concurrent roots: hold the first confirmation, deny the competing intent before any new grant.
  let release!:()=>void,ready!:()=>void;
  const entered=new Promise<void>(resolve=>{ready=resolve;});
  const waiting=run(demoIsbn,1,'fixed',(p,i)=>{release=()=>{submit(p,i,'no');};ready();});
  await entered;
  try{
    const concurrent=await run(demoIsbn,1,'skip');assert.equal(concurrent.status,'UNKNOWN');assert.equal(concurrent.reason.code,'CONFLICTING_UNKNOWN');
    assert.equal(grants,3);assert.equal(submits().length,3);
  }finally{release();}
  const declined=await waiting;assert.equal(declined.status,'REJECT');
  const cancelled=await run(demoIsbn,1,'fixed',(_p,i)=>{setImmediate(()=>i.cancel());});
  assert.notEqual(cancelled.status,'COMPLETE');assert.equal(pendingCatalogReservation(shared,authority,'book-a'),undefined);
  const last=await run(demoIsbn,1,'skip');assert.equal(last.status,'COMPLETE');
  assert.deepEqual(actual('book-a'),{stock:1,version:3,effects:3});assert.equal(grants,4);assert.equal(submits().length,4);
  // A genuine node receipt is insufficient to release a fence if the enclosing root fails delivery.
  reviseAfterReadback=true;
  const failedDelivery=await run(demoOlder,1,'fixed');
  assert.notEqual(failedDelivery.status,'COMPLETE');
  assert.equal(reviseAfterReadback,false);
  assert.deepEqual(actual('book-b'),{stock:5,version:2,effects:2});
  const retained=pendingCatalogReservation(shared,authority,'book-b');assert.ok(retained);
  const postFailureRequests=requests.length;
  const repeat=await run(demoOlder,1,'replace');assert.equal(repeat.status,'UNKNOWN');
  assert.equal(repeat.reason.code,'CONFLICTING_UNKNOWN');assert.equal(requests.length,postFailureRequests);
  assert.equal(grants,5);assert.equal(submits().length,5);
  const finalRecovered=await recoverCatalogReservation(shared,authority,'book-b',retained.id);
  assert.equal(finalRecovered.status,'COMPLETE');assert.equal(finalRecovered.value.id,retained.id);
  assert.equal(finalRecovered.value.remaining,5);assert.equal(finalRecovered.value.version,2);
  assert.equal(pendingCatalogReservation(shared,authority,'book-b'),undefined);
  assert.deepEqual(actual('book-b'),{stock:5,version:2,effects:2});
  assert.equal(grants,5);assert.equal(submits().length,5);
  console.log(JSON.stringify({status:'PASS_CATALOG_ORIGINAL_RECOVERY',sameClient:true,blockedRepeats:2,concurrentConflict:true,wrongIdDenied:true,
    unauthorizedDenied:true,unknownRetained:true,independentResource:true,originalReceiptVerified:true,recoveryNoSubmit:true,
    noExtraGrant:true,afterReconciliationNewIntent:true,declineAndCancelReleased:true,failedRootDeliveryRetained:true,actualSubmits:submits().length,actualGrants:grants}));
}finally{
  client?.close();
  await new Promise<void>(resolve=>{proxy.close(()=>resolve());proxy.closeAllConnections();});
  await host.close();await env.close();
}
