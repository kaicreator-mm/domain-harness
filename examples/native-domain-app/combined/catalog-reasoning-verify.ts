import assert from 'node:assert/strict';
import { join } from 'node:path';
import { InteractionElement, SQLiteDatabaseElement } from '@kaicreator/domain-harness';
import type { WorkflowObservation } from '@kaicreator/domain-harness';
import { runCatalogReasoning } from './catalog-reasoning.js';
import { catalogReservation } from './catalog-reservation.js';
import { demoIsbn as isbn, demoOlder as older, demoRevision as revision, demoModel, openCatalogDemo } from './catalog-demo-environment.js';

const protocol = process.argv[2] ?? 'native';
const scenario = process.argv[3] ?? 'approve';
const topology = process.argv[4] ?? 'replace';
if(topology!=='fixed'&&topology!=='replace'&&topology!=='skip')throw Error('INVALID_TOPOLOGY');
if (!['approve','decline','stale','revoked'].includes(scenario)) throw Error('INVALID_SCENARIO');
if (protocol !== 'native' && protocol !== 'openai-chat' && protocol !== 'anthropic-messages') throw Error('INVALID_PROTOCOL');
const model = demoModel(protocol);
const env = await openCatalogDemo();
const { folder, database: db, owner, client: reservationClient, readback, catalog } = env;
try {
  const input = { isbn, revision, quantity:2, budgetCents:4000 };
  const events: WorkflowObservation[] = [];
  let final:readonly WorkflowObservation[]=[];
  let prompts = 0;
  const interaction = new InteractionElement({ onPrompt: (p,actual) => {
    prompts++;
    setImmediate(() => actual.submit({ intentId:p.intentId, revision:p.revision, decisionKey:p.decisionKey, action:'submit', values:{ quantity:3 } }));
  }});
  let approvals = 0;
  const confirmation = new InteractionElement({ onPrompt: (p,actual) => {
    approvals++;
    assert.deepEqual(owner.inspect('shop-a','book-a'),{stock:5,version:0,effects:0});
    if (scenario === 'stale') db.transaction(tx=>tx.run('UPDATE books SET price=? WHERE tenant=? AND isbn=?',[1300,'shop-a',isbn]));
    if (scenario === 'revoked') env.revoke('book-a');
    setImmediate(() => actual.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{approve:scenario==='decline'?'no':'yes'}}));
  }});
  const outcome = await runCatalogReasoning(catalog,input,{ interaction, topology, ...(model ? { model } : {}), current:()=>true, observe:event=>{ events.push(event); },dispositions:values=>{final=values;},
    reserve: (root,plan,request,options) => catalogReservation(catalog,reservationClient,{tenant:'shop-a',principal:'alice',inspect:r=>owner.inspect('shop-a',r),
      approve:g=>owner.approve(g),readback},confirmation,options)(root,plan,request) });
  if (scenario === "approve" && outcome.status !== "COMPLETE") console.error(JSON.stringify({status:outcome.status,code:outcome.reason.code,approvals,trace:events.map(e=>({kind:e.kind,action:"action" in e?e.action:null})),effects:owner.inspect("shop-a","book-a").effects}));
  assert.equal(approvals,1);
  if (scenario !== 'approve') {
    assert.equal(outcome.status,scenario==='decline'?'REJECT':'UNKNOWN');
    assert.deepEqual(owner.inspect('shop-a','book-a'),{stock:5,version:0,effects:0});
    console.log(JSON.stringify({status:'PASS_CATALOG_RESERVATION_NEGATIVE',scenario,outcome:outcome.status,effects:0}));
  } else {
  if (outcome.status !== 'COMPLETE') {
    console.error(JSON.stringify({status:outcome.status,code:outcome.reason.code,trace:events.map(e=>({kind:e.kind,action:'action' in e?e.action:null}))}));
    throw Error('CATALOG_REASONING_NOT_COMPLETE');
  }
  assert.equal(outcome.value.initial.totalCents,2400);
  assert.equal(outcome.value.final.totalCents,3600);
  assert.equal(outcome.value.final.quantity,3);
  assert.ok(outcome.value.receipt);
  assert.equal(outcome.value.receipt.remaining,2);
  assert.equal(outcome.value.receipt.version,1);
  assert.deepEqual(owner.inspect('shop-a','book-a'),{stock:2,version:1,effects:1});
  const receiptDb = new SQLiteDatabaseElement(join(folder,'inventory.sqlite'),{readOnly:true});
  try {
    const row = receiptDb.select<{reply:string}>('SELECT reply FROM attempts WHERE id=?',[outcome.value.receipt.id],1)[0];
    assert.deepEqual(JSON.parse(row!.reply),{status:'COMPLETE',value:outcome.value.receipt});
  } finally {receiptDb.close();}
  assert.deepEqual(outcome.value.final.predecessor,[older]);
  assert.deepEqual(outcome.value.final.comparable,[older]);
  assert.equal(prompts,1);
  assert.equal(new Set(events.map(e=>e.runId)).size,1);
  assert.equal(catalog.handled,model?3:2);
  const attempts = events.filter(e=>e.kind==='model'&&e.action==='result');
  assert.equal(attempts.length,model?(topology==='fixed'?2:3):0);
  const edits=events.filter(e=>e.kind==='region'&&e.action==='edit');
  assert.equal(edits.length,topology==='fixed'?0:1);
  const skipped=final.filter(e=>e.kind==='node'&&e.occurrence.definitionId==='catalog-plan'&&e.phase==='skip'&&!e.entered);
  assert.equal(skipped.length,topology==='skip'?1:0);
  assert.equal(final.filter(e=>e.kind==='node'&&e.occurrence.definitionId==='catalog-verify'&&e.phase==='disposition'&&e.acceptance==='accepted').length,1);
  db.transaction(tx=>tx.run('UPDATE books SET price=? WHERE tenant=? AND isbn=?',[1300,'shop-a',isbn]));
  assert.equal(catalog.verifyCurrent({...input,quantity:3},outcome.value.final).status,'REJECT');
  console.log(JSON.stringify({status:'PASS_CATALOG_REASONING_SLICE',protocol:protocol??'native',topology,skipped:skipped.length,prompts,oneRoot:true,initial:outcome.value.initial.totalCents,final:outcome.value.final.totalCents,quantity:outcome.value.final.quantity,actualModelAttempts:attempts.length,stalePriceRejected:true,actualHost:true,actualEffects:1,receiptVerified:true,remaining:2}));
  }
} finally { await env.close(); }
