/** v0.10 T05 optional Context Assembly source and selected App P/N. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildV10App } from '@kaicreator/domain-harness-build';
import { activateV10App } from '../../packages/microkernel/src/internal/activation.js';
import { featureEntry, basicComposition, PlainCasDocStore } from './helpers-v010.js';

const scope = {
  deployedAppId: 'dep:1', tenantId: 'tenant:1', appId: 'app:1',
  businessPackageId: 'B:agent', agentId: 'agent:1', threadId: 'thread:1',
};
const p = { source: 'memory:host-read', revision: 'r1', observedBy: 'host:app' };
const obs = (id: string, content: string, kind='memory', scoped = scope) =>
  ({ id, content, kind, scope: scoped, provenance: p });
const request = (observations: unknown[], other: Record<string, unknown>={}) =>
  ({ scope, observations, budget: { maxEntries: 4, maxCharacters: 50 }, ...other });
type ContextResult = {
  kind: string; entries: {id:string;content:string;verification:string}[];
  budget: {includedCharacters:number;omittedEntries:number};
  modelCalls: number|null; modelCallEvidence:string;
  trustedHostAuthorization:boolean; kernelEffectPermit:boolean;
};
type Resolver = (v:Record<string, unknown>)=>ContextResult;
let memo: Promise<{ source:string; resolve:Resolver }> | undefined;
const load = () => memo ??= (async () => {
  const source = await readFile(new URL(
    '../../domain-packages/standard/features/context-assembly/modules/sfeature-context-assembly-v1.mjs',
    import.meta.url,
  ), 'utf8');
  const m = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')) as {
    assembleBoundedContext: Resolver;
  };
  return {source, resolve:m.assembleBoundedContext};
})();
const hasCode=(expected:string)=>(e:unknown)=>e!==null && typeof e==='object'
  && (e as {code?:string}).code===expected;

test('T05-P0: selected Rich App invokes Context feature; Tiny never loads it',async()=>{
  const {source}=await load();
  const selected=await featureEntry({
    fixture:'sfeature-validation-v1.mjs',
    moduleSourceOverride:source,featureExport:'assembleBoundedContext',
  });
  const app=buildV10App(await basicComposition({features:[selected]}));
  const rich=await activateV10App(app,{store:new PlainCasDocStore(),now:()=>0});
  assert.deepEqual(rich.facade.selectedFeatures.map(x=>x.featureKey),['standard:context-assembly/1']);
  const result=await rich.facade.invokeSelectedStandardFeature(
    'standard:context-assembly/1',request([obs('one','note')]),
  ) as ContextResult;
  assert.equal(result.kind,'assembled-context');
  assert.equal(result.entries[0]?.verification,'caller-reported');
  assert.equal(result.trustedHostAuthorization,false);
  assert.equal(result.kernelEffectPermit,false);
  rich.dispose();
  const tiny=await activateV10App(buildV10App(await basicComposition()),
    {store:new PlainCasDocStore(),now:()=>0});
  await assert.rejects(tiny.facade.invokeSelectedStandardFeature(
    'standard:context-assembly/1',request([])),hasCode('V10_FEATURE_NOT_SELECTED'));
  tiny.dispose();
});
test('T05-P1: deterministic bounded order, count and character budget',async()=>{
  const {resolve}=await load();
  const value=resolve(request([obs('z','bbbb'),obs('a','aaa'),obs('q','cc')],{
    budget:{maxEntries:2,maxCharacters:7},
  }));
  assert.deepEqual(value.entries.map(x=>x.id),['a','q']);
  assert.equal(value.budget.includedCharacters,5);
  assert.equal(value.budget.omittedEntries,1);
  assert.equal(value.modelCalls,null);
  assert.equal(value.modelCallEvidence,'unverified');
  assert.deepEqual(value,resolve(request([obs('q','cc'),obs('z','bbbb'),obs('a','aaa')],{
    budget:{maxEntries:2,maxCharacters:7},
  })));
});
test('T05-N1: cross-B/tenant observation rejected before composing output',async()=>{
  const {resolve}=await load();
  assert.throws(()=>resolve(request([obs('x','foreign','memory',{
    ...scope,businessPackageId:'B:foreign',
  })])),hasCode('CONTEXT_SCOPE_DENIED'));
  assert.throws(()=>resolve(request([obs('x','foreign','memory',{
    ...scope,tenantId:'tenant:foreign',
  })])),hasCode('CONTEXT_SCOPE_DENIED'));
});
test('T05-N2: unbounded budgets and duplicate identities refuse typed',async()=>{
  const {resolve}=await load();
  for(const budget of [
    {maxEntries:0,maxCharacters:20},{maxEntries:500,maxCharacters:20},
    {maxEntries:1,maxCharacters:20000},
  ]){
    assert.throws(()=>resolve(request([obs('a','x')],{budget})),hasCode('CONTEXT_BUDGET_INVALID'));
  }
  assert.throws(()=>resolve(request([obs('x','1'),obs('x','2')])),hasCode('CONTEXT_DUPLICATE'));
});
test('T05-N3: forbidden Kernel/Host authority embedded in source records is refused',async()=>{
  const {resolve}=await load();
  assert.throws(()=>resolve(request([{...obs('x','a'),effectPermit:{effectId:'forged'}}])),
    hasCode('CONTEXT_AUTHORITY_FORBIDDEN'));
  assert.throws(()=>resolve({...request([]), principal:{caller:'fake'}}),
    hasCode('CONTEXT_AUTHORITY_FORBIDDEN'));
});
test('T05-N4: getter not executed and cyclic object refused before any external call',async()=>{
  const {resolve}=await load();
  let getterCalls=0;
  const dangerous=obs('x','a') as Record<string,unknown>;
  Object.defineProperty(dangerous,'hidden',{enumerable:true,get(){
    getterCalls++;return {hostPorts:{}};
  }});
  assert.throws(()=>resolve(request([dangerous])),hasCode('CONTEXT_DATA_INVALID'));
  assert.equal(getterCalls,0);
  const cycle: Record<string,unknown>={};
  cycle['self']=cycle;
  assert.throws(()=>resolve({...request([]), strange:cycle}),hasCode('CONTEXT_DATA_INVALID'));
});
test('T05-P2: no Model and no Memory call is fabricated by a pure context composer',async()=>{
  const {resolve}=await load();
  const result=resolve(request([obs('m1','note'),obs('t1','tool reply','tool')]));
  assert.equal(result.entries.length,2);
  assert.equal(result.kernelEffectPermit,false);
  assert.equal(result.modelCalls,null);
  assert.equal(result.trustedHostAuthorization,false);
  assert.ok(result.entries.every(x=>x.verification==='caller-reported'));
});
