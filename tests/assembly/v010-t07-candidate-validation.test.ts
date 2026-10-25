/** T07 pure candidate report P/N: NOT a physical Shadow L4 proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildV10App } from '../../tooling/build/dist/index.js';
import { activateV10App } from '../../packages/microkernel/src/internal/activation.js';
import { basicComposition, featureEntry, PlainCasDocStore } from './helpers-v010.js';

const digestA = 'a'.repeat(64), digestB = 'b'.repeat(64);
const pin = (sha256: string, approvalState='candidate') => ({
  kind: 'Rule', id: 'rule:quote', revision: sha256===digestA?'r2':'r1',
  sha256, provenance: 'pinned:approved-source', approvalState,
});
const baseline=pin(digestB,'approved'),candidate=pin(digestA);
const request=(cases: unknown[]=[], extra: Record<string,unknown>={})=>({
  candidate, approvedFallback:baseline,
  budget: {maxCases:8,maxComparisons:8}, cases, ...extra,
});
const oneCase=(candidateOutput:unknown,baselineOutput:unknown,id='case:1')=>({
  id,candidateOutput,baselineOutput,candidatePinSha256:digestA,baselinePinSha256:digestB,
});
const hasCode=(code:string)=>(err:unknown)=>!!err&&typeof err==='object'&&(err as {code?:string}).code===code;
type Report={kind:string;status:string;differingCaseIds:string[];matchingCaseIds:string[];evidenceAuthority:string;productionWritesVerifiedZero:boolean;canSelfApprove:boolean;canPromote:boolean;kernelEffectPermit:boolean};
let loader: Promise<{source:string,validate:(req:unknown)=>Report}>|undefined;
const load=()=>loader??=(async()=>{const source=await readFile(new URL(
  '../../domain-packages/standard/features/candidate-validation/modules/sfeature-candidate-validation-v1.mjs',
  import.meta.url),'utf8');
  const module=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  return {source,validate:module.validateCandidateReport as (req:unknown)=>Report};})();
test('T07-P0: Rich selects the pure optional candidate feature; Tiny never evaluates it', async()=>{
  const {source}=await load();
  const selected=await featureEntry({
    fixture:'sfeature-validation-v1.mjs',moduleSourceOverride:source,
    featureExport:'validateCandidateReport',
  });
  const rich=await activateV10App(buildV10App(await basicComposition({features:[selected]})),
    {store:new PlainCasDocStore(),now:()=>0});
  const result=await rich.facade.invokeSelectedStandardFeature(
    'standard:candidate-validation/1',request([oneCase({value:1},{value:1})])) as Report;
  assert.equal(result.status,'reported-match');
  assert.equal(result.canPromote,false);
  rich.dispose();
  const tiny=await activateV10App(buildV10App(await basicComposition()),
    {store:new PlainCasDocStore(),now:()=>0});
  await assert.rejects(tiny.facade.invokeSelectedStandardFeature(
    'standard:candidate-validation/1',request()),hasCode('V10_FEATURE_NOT_SELECTED'));
  tiny.dispose();
});
test('T07-P1: pinned approved fallback compares typed counterexamples canonically without promoting',async()=>{
  const {validate}=await load();
  const x=validate(request([
    oneCase({a:1,b:[1,2]},{b:[1,2],a:1},'same'),
    oneCase({a:2},{a:1},'difference'),
  ]));
  assert.equal(x.kind,'candidate-evidence-report');
  assert.deepEqual(x.matchingCaseIds,['same']);
  assert.deepEqual(x.differingCaseIds,['difference']);
  assert.equal(x.status,'reported-difference');
  assert.equal(x.productionWritesVerifiedZero,false);
  assert.equal(x.evidenceAuthority,'caller-reported-not-host-verified');
  assert.equal(x.canSelfApprove,false);
  assert.equal(x.canPromote,false);
  assert.equal(x.kernelEffectPermit,false);
});
test('T07-N1: revoked candidate and unapproved fallback cannot become active',async()=>{
  const {validate}=await load();
  assert.throws(()=>validate(request([],{candidate:pin(digestA,'revoked')})),hasCode('CANDIDATE_REVOKED'));
  assert.throws(()=>validate(request([],{approvedFallback:pin(digestB,'candidate')})),hasCode('CANDIDATE_FALLBACK_NOT_APPROVED'));
  assert.throws(()=>validate(request([],{approvedFallback:pin(digestB,'revoked')})),hasCode('CANDIDATE_FALLBACK_NOT_APPROVED'));
});
test('T07-N2: mismatched case SHA and unpinned/invalid digest refuse',async()=>{
  const {validate}=await load();
  assert.throws(()=>validate(request([{...oneCase(1,1),candidatePinSha256:digestB}])),hasCode('CANDIDATE_CASE_PIN_MISMATCH'));
  assert.throws(()=>validate(request([],{candidate:{...candidate,sha256:'latest'}})),hasCode('CANDIDATE_PIN_INVALID'));
  assert.throws(()=>validate(request([],{candidate:{...candidate,revision:'latest'}})),hasCode('CANDIDATE_PIN_INVALID'));
  assert.throws(()=>validate(request([],{approvedFallback:{...baseline,provenance:'latest'}})),hasCode('CANDIDATE_PIN_INVALID'));
  assert.throws(()=>validate(request([],{approvedFallback:{...baseline,revision:''}})),hasCode('CANDIDATE_ID_INVALID'));
});
test('T07-N3: over-budget, duplicate and missing outputs are typed',async()=>{
  const {validate}=await load();
  assert.throws(()=>validate(request([oneCase(1,1)],{budget:{maxCases:0,maxComparisons:1}})),hasCode('CANDIDATE_BUDGET_INVALID'));
  assert.throws(()=>validate(request([oneCase(1,1,'case:a'),oneCase(2,2,'case:b')],{budget:{maxCases:2,maxComparisons:1}})),hasCode('CANDIDATE_BUDGET_EXHAUSTED'));
  assert.throws(()=>validate(request([oneCase(1,1,'case:dup'),oneCase(2,2,'case:dup')])),hasCode('CANDIDATE_CASE_DUPLICATE'));
  assert.throws(()=>validate(request([{...oneCase(1,1),candidateOutput:undefined}])),hasCode('CANDIDATE_DATA_INVALID'));
});
test('T07-N4: no Kernel Effect/activation/Host authority in any candidate report',async()=>{
  const {validate}=await load();
  assert.throws(()=>validate(request([oneCase({effectPermit:'forged'},null)])),hasCode('CANDIDATE_AUTHORITY_FORBIDDEN'));
  assert.throws(()=>validate({...request([]),promote:true}),hasCode('CANDIDATE_AUTHORITY_FORBIDDEN'));
});
test('T07-N5: property getters never execute; cyclic/binary inputs refused',async()=>{
  const {validate}=await load();
  let calls=0;
  const malicious=oneCase({}, {});
  Object.defineProperty(malicious.candidateOutput,'evil',{enumerable:true,get(){calls++;return true;}});
  assert.throws(()=>validate(request([malicious])),hasCode('CANDIDATE_DATA_INVALID'));
  assert.equal(calls,0);
  const loop:Record<string,unknown>={};loop.self=loop;
  assert.throws(()=>validate(request([oneCase(loop,{})])),hasCode('CANDIDATE_DATA_INVALID'));
});
