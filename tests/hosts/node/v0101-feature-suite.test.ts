import test from 'node:test';
import assert from 'node:assert/strict';
// [v0.10.2 T03b] The CT-02 invoker moved into @kaicreator/domain-harness-host-node
// (moved from extensions/agent-improvement/host). Root tests compile as CJS
// under tsx; the package-specifier import is awaited lazily so the real ESM
// export map is exercised.
type HostNodeModule = typeof import('@kaicreator/domain-harness-host-node');
const hostNode: Promise<HostNodeModule> = import('@kaicreator/domain-harness-host-node');

const KEYS = [
  'standard:agent-diagnostics/1',
  'standard:candidate-evaluation/1',
  'standard:experience-reuse/1',
  'standard:bounded-experiment/1',
];
const asyncErr = async (fn, reason) => {
  const { FeatureInputNotPlainDataError } = await hostNode;
  await assert.rejects(fn, (error) => error instanceof FeatureInputNotPlainDataError
    && error.code === 'FEATURE_INPUT_NOT_PLAIN_DATA'
    && (!reason || error.reason === reason));
};
for (const key of KEYS) {
  test(key + ': valid request and dependencies are copied without changing identity', async () => {
    const { invokeAgentImprovementFeature } = await hostNode;
    let called = 0;
    const facade = { invokeSelectedStandardFeature(k, request, deps) {
      called++;
      assert.equal(k, key);
      assert.deepEqual({...request}, { subjectSha:'a'.repeat(40), events:[] });
      assert.deepEqual({...deps}, { revision:'r1' });
      assert(Object.isFrozen(request) && Object.isFrozen(deps));
      assert.equal(Object.getPrototypeOf(request), null);
      return {ok: true};
    } };
    const request = {subjectSha:'a'.repeat(40),events:[]};
    const deps = {revision:'r1'};
    assert.deepEqual(await invokeAgentImprovementFeature(facade, key, request, deps), {ok:true});
    assert.equal(called, 1);
    assert.notEqual(request, deps);
  });
  test(key + ': request callable/effect authority refused before Feature invocation', async () => {
    const { invokeAgentImprovementFeature } = await hostNode;
    let calls = 0, effects = 0;
    const facade = {invokeSelectedStandardFeature(){calls++;return 'unexpected';}};
    await asyncErr(() => invokeAgentImprovementFeature(facade,key,
      {events:[], effectPermit:()=>{effects++;}}, {}), 'OBJECT_KEY_NOT_DATA');
    assert.equal(calls,0);assert.equal(effects,0);
  });
  test(key + ': dependencies callable refused before Feature invocation', async () => {
    const { invokeAgentImprovementFeature } = await hostNode;
    let calls = 0, effects = 0;
    const facade = {invokeSelectedStandardFeature(){calls++;return 'unexpected';}};
    await asyncErr(() => invokeAgentImprovementFeature(facade,key,
      {events:[]},{ model:()=>{effects++;} }), 'NON_DATA_VALUE');
    assert.equal(calls,0);assert.equal(effects,0);
  });
  test(key + ': accessor refusal never evaluates getter', async () => {
    const { invokeAgentImprovementFeature } = await hostNode;
    let calls=0, got=0;
    const facade={invokeSelectedStandardFeature(){calls++;}};
    const request={events:[]};
    Object.defineProperty(request,'accessor',{enumerable:true,get(){got++;throw Error('sensitive getter');}});
    await asyncErr(()=>invokeAgentImprovementFeature(facade,key,request,{}),'OBJECT_ACCESSOR_OR_HIDDEN');
    assert.equal(got,0);assert.equal(calls,0);
    const deps={};Object.defineProperty(deps,'revision',{enumerable:true,get(){got++;}});
    await asyncErr(()=>invokeAgentImprovementFeature(facade,key,{events:[]},deps),'OBJECT_ACCESSOR_OR_HIDDEN');
    assert.equal(got,0);assert.equal(calls,0);
  });
}
test('T02 remains on its existing trusted callable path, never routed through the four-key adapter',async()=>{
  const { invokeAgentImprovementFeature } = await hostNode;
  let called=0;
  const facade={invokeSelectedStandardFeature(_key,_data,deps){called++;return deps.tool({});}};
  const deps={tool:()=>({ok:true})};
  await asyncErr(()=>invokeAgentImprovementFeature(facade,'standard:semantic-decision/1',{},deps),'FEATURE_NOT_IN_ALLOWLIST');
  assert.deepEqual(await facade.invokeSelectedStandardFeature('standard:semantic-decision/1',{},deps),{ok:true});
  assert.equal(called,1);
});
test('rejects inherited prototypes, symbols, sparse arrays, cycles, non-finite, gigantic inputs', async()=>{
  const { invokeAgentImprovementFeature } = await hostNode;
  let calls=0;const facade={invokeSelectedStandardFeature(){calls++;}};
  const candidates=[
    Object.assign(new Date(),{ foo:'x' }),
    {[Symbol('private')]:123},
    {list: new Array(1)},
    {n:Number.NaN},
    {content:'x'.repeat(9000)},
  ];
  const cy={};cy.self=cy;candidates.push(cy);
  for(const bad of candidates) await asyncErr(()=>invokeAgentImprovementFeature(facade,KEYS[0],bad,{}));
  assert.equal(calls,0);
});
test('forbidden tokens cannot be smuggled under nested fields',async()=>{
  const { invokeAgentImprovementFeature } = await hostNode;
  let calls=0;const facade={invokeSelectedStandardFeature(){calls++;}};
  await asyncErr(()=>invokeAgentImprovementFeature(facade,KEYS[0],{meta:{credentials:'abc'}},{}),'OBJECT_KEY_NOT_DATA');
  assert.equal(calls,0);
});
