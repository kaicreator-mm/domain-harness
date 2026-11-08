import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCheckedInMatrix,validateVersionMatrix} from './validate.mjs';
const base=new URL('../../docs/standards/domain-intelligence/DIS-0.2.0/conformance/',import.meta.url);
const matrix=JSON.parse(await readFile(new URL('matrix.json',base),'utf8'));
const baseline=JSON.parse(await readFile(new URL('receipts/r9.5-baseline.json',base),'utf8'));
const clone=x=>structuredClone(x);
const rejects=code=>e=>e?.code===code;
test('version matrix accounts for all 16 core requirements without inventing an unrun gap',async()=>{
 const result=await validateCheckedInMatrix();
 assert.equal(result.requirements,21);
 const core=['VERIFIED','PARTIAL','NOT_RUN','OUT_OF_SCOPE']
   .reduce((n,s)=>n+(result.tallies['core:'+s]??0),0);
 assert.equal(core,16);
 assert.ok((result.tallies['core:PARTIAL']??0)+(result.tallies['core:NOT_RUN']??0)>0);
 assert.ok((result.tallies['optional-profile:NOT_RUN']??0)>0);
});
test('machine validator rejects a VERIFIED requirement without positive or negative proof',async()=>{
 const v=clone(matrix);v.requirements[0].negative=[];
 await assert.rejects(validateVersionMatrix(v,{'r9.5-baseline':baseline}),rejects('MATRIX_UNSUPPORTED_VERIFIED'));
});
test('machine validator rejects a claimed old PASS with a missing or failed receipt',async()=>{
 const receipts={'r9.5-baseline':{...baseline,status:'FAIL'}};
 await assert.rejects(validateVersionMatrix(clone(matrix),receipts),rejects('MATRIX_RECEIPT_INVALID'));
});
test('machine validator rejects invented test names or silently changed required scope',async()=>{
 const v=clone(matrix);v.requirements[0].positive[0].case='fictional non-existent native proof';
 await assert.rejects(validateVersionMatrix(v,{'r9.5-baseline':baseline}),rejects('MATRIX_CASE_NOT_FOUND'));
});
test('version conformance is incomplete until all applicable MUST requirements are verified',async()=>{
 const r=await validateCheckedInMatrix();
 const complete=!(r.tallies['core:PARTIAL']||r.tallies['core:NOT_RUN']);
 assert.equal(complete,false);
});

test('blocked R11 integration receipt cannot qualify a VERIFIED requirement',async()=>{
 const blocked=JSON.parse(await readFile(new URL('receipts/r11-integration-blocked.json',base),'utf8'));
 const v=clone(matrix);
 v.requirements[0].receiptIds=['r11-integration-blocked'];
 await assert.rejects(validateVersionMatrix(v,{'r11-integration-blocked':blocked}),rejects('MATRIX_RECEIPT_INVALID'));
});

// R21: content-scoped receipt keeps a real engine CI error visible without
// allowing either native integration or generic verification to be skipped.
test('R21 semantic receipt permits engine-only ERROR but fails closed on native and general content checks',async()=>{
 const id='r21-native-dke-semantic-ci';
 const receipts=Object.fromEntries(await Promise.all(matrix.receipts.map(async rid=>[
  rid,JSON.parse(await readFile(new URL('receipts/'+rid+'.json',base),'utf8'))
 ])));
 assert.equal(receipts[id].qualification,'DIS_SEMANTIC_ONLY');
 assert.equal(receipts[id].ci.find(x=>x.context==='ci/woodpecker/pr/verify-min-node').state,'ERROR');
 const valid=await validateVersionMatrix(clone(matrix),receipts);
 assert.equal(valid.requirements,21);
 for(const context of ['ci/woodpecker/pr/dis-v020-integration','ci/woodpecker/pr/verify']){
  const forged=clone(receipts);
  forged[id].ci.find(x=>x.context===context).state='FAILURE';
  await assert.rejects(validateVersionMatrix(clone(matrix),forged),rejects('MATRIX_RECEIPT_INVALID'));
 }
});
