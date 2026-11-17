/** O1 R149 real fixed HTTPS Provider shape; all HTTP fixtures local/no actual API key. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeNativeFixture} from './native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeO1BoundedHarness} from './o1-bounded-harness.mjs';
import {createO1OpenAIResponsesProvider} from './o1-openai-responses-provider.mjs';

const KEY='test-only-credential-123456';
const MODEL='gpt-6-astra'; // verified API schema model format; no live entitlement claim.
const selected={purpose:'advisory',sourceFunction:'xdownload.describePolicy',observedDomain:'downloads'};
const payload=(text='Inspect source provenance only.')=>({
 object:'response',status:'completed',
 output:[{type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text}]}]
});
const http=(value,status=200,contentType='application/json')=>
 new Response(typeof value==='string'?value:JSON.stringify(value),
  {status,headers:{'content-type':contentType}});
const provider=(fetchImpl,extra={})=>createO1OpenAIResponsesProvider({
 apiKey:KEY,model:MODEL,maxWaitMs:1000,maxOutputTokens:128,fetchImpl,...extra
});
const limit=x=>{
 assert.equal(x.disposition,'UNKNOWN');assert.equal(x.authority,'NONE');
 assert.equal(x.qualified,false);assert.equal(x.effectDispatched,false);
};
const base=makeNativeFixture();
test('O1 selected real xDownload AOT SDK + fixed actual Responses API HTTP schema remains UNKNOWN advisory',async()=>{
 const fixture=await base;
 const app=await loadDisV020Aot(fixture.artifact,{
  expectedDigest:fixture.artifact.digest,registry:fixture.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:o1-openai-r149-selected'
 });
 try{
  const calls=[];
  const impl=async(url,opts)=>{
   calls.push({url,opts});
   return http(payload('Inspect source provenance only.'));
  };
  const p=provider(impl);
  const harness=makeO1BoundedHarness({
   app,provider:p,selectedProviderId:'openai-responses-api',
   maxCalls:1,maxWaitMs:1500,enabled:true
  });
  const direct=await harness.run('policy');
  assert.equal(direct.disposition,'OBSERVED');assert.equal(calls.length,0);
  const proposal=await harness.run('advisory');limit(proposal);
  assert.equal(proposal.reason,'MODEL_PROPOSAL_NOT_DOMAIN_TRUTH');
  assert.equal(proposal.suggestion,'Inspect source provenance only.');
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://api.openai.com/v1/responses');
  assert.equal(calls[0].opts.method,'POST');
  assert.equal(calls[0].opts.redirect,'error');
  assert.equal(calls[0].opts.headers.authorization,'Bearer '+KEY);
  const body=JSON.parse(calls[0].opts.body);
  assert.equal(body.model,MODEL);
  assert.equal(body.store,false);assert.equal(body.stream,false);
  assert.equal(body.tool_choice,'none');
  assert.equal(body.parallel_tool_calls,false);
  assert.equal(body.truncation,'disabled');
  assert.equal(body.max_output_tokens,128);
  assert.equal(body.input.includes('xdownload.describePolicy'),true);
  assert.equal(body.input.includes('domainId=downloads'),true);
  assert.equal(calls[0].opts.body.includes(KEY),false);
  assert.equal((await harness.run('advisory')).reason,'BUDGET_EXHAUSTED');
  assert.equal(calls.length,1);assert.equal(p.stats().calls,1);
  assert.equal((await makeO1BoundedHarness({app,provider:p,selectedProviderId:'openai-responses-api',enabled:false}).run('advisory')).reason,'PROVIDER_DISABLED');
 }finally{app.stop()}
});
test('O1 fixed Host Provider rejects missing credentials, wrong IDs and malicious request before egress',async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls++;return http(payload())};
 for(const bad of [
  {apiKey:''},{apiKey:'abcd'},{model:'bad model'},
  {maxOutputTokens:1},{maxOutputTokens:1000},{maxWaitMs:0}
 ]){
  const args={apiKey:KEY,model:MODEL,fetchImpl,...bad};
  assert.throws(()=>createO1OpenAIResponsesProvider(args),/O1_PROVIDER_HOST_CONFIG_INVALID/);
 }
 const p=provider(fetchImpl);
 const invalid=[
  {...selected,sourceFunction:'xdownload.effect.write'},
  {...selected,observedDomain:'other'},
  {...selected,purpose:'effect'},
  {...selected,extra:'request'},
  new Proxy(selected,{get(){throw Error('UNTRUSTED_TRAP')},getPrototypeOf(){throw Error('UNTRUSTED_TRAP')}}),
  (()=>{const o={...selected};Object.defineProperty(o,'purpose',{enumerable:true,get(){throw Error('UNTRUSTED_GETTER')}});return o})()
 ];
 for(const item of invalid)await assert.rejects(p.propose(item),/O1_PROVIDER_UNSELECTED_INPUT/);
 assert.equal(calls,0);
});
test('O1 HTTP 401/429/500, tool outputs, incomplete, refusals and giant body fail closed',async()=>{
 const unavailable=[
  async()=>http({error:'unauthorized'},401),
  async()=>http({error:'rate-limited'},429),
  async()=>http('unavailable',500,'text/plain'),
  async()=>http({...payload(),status:'incomplete'}),
  async()=>http({...payload(),output:[{type:'function_call',name:'evil'}]}),
  async()=>http({...payload(),output:[...payload().output,...payload().output]}),
  async()=>http({...payload(),output:[{type:'message',status:'completed',role:'assistant',content:[{type:'refusal',refusal:'cannot'}]}]}),
  async()=>http(payload('Line one\nLine two')),
  async()=>http(payload(' '.repeat(161))),
  async()=>http('x'.repeat(65537))
 ];
 for(const impl of unavailable){
  const p=provider(impl);
  await assert.rejects(p.propose(selected),/O1_PROVIDER_/);
  assert.equal(p.stats().calls,1);
 }
});
test('O1 deadline abort signals stalled fetch; network errors never leak credentials',async()=>{
 let aborted=false;
 const hanging=async(_,options)=>new Promise((_,reject)=>{
  options.signal.addEventListener('abort',()=>{
   aborted=true;reject(Error('network abort'));
  },{once:true});
 });
 const p=provider(hanging,{maxWaitMs:20});
 await assert.rejects(p.propose(selected),e=>e?.code==='O1_PROVIDER_DEADLINE');
 assert.equal(aborted,true);
 const down=provider(async()=>{throw Error('remote-private-text')});
 await assert.rejects(down.propose(selected),/O1_PROVIDER_UNAVAILABLE/);
 // Public Harness masks all transport/internal errors as non-authoritative UNKNOWN.
 const selectedObservation=()=>({
  kind:'OBSERVATION',disposition:'OBSERVED',authority:'NONE',contractVersion:'1.0.0',
  value:{domainId:'downloads'},evidence:{attested:false,source:{
   sourceId:'xdownload-business',gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc',
   sha256:'a'.repeat(64)}}
 });
 const app={functions:['xdownload.describePolicy'],contractVersions:{'xdownload.describePolicy':'1.0.0'},
  invoke:async()=>selectedObservation()};
 const harness=makeO1BoundedHarness({app,provider:down,selectedProviderId:'openai-responses-api',
  maxCalls:1,maxWaitMs:100});
 const x=await harness.run('advisory');limit(x);
 assert.equal(x.reason,'PROVIDER_ERROR');
 assert.equal(JSON.stringify(x).includes('remote-private-text'),false);
 assert.equal(JSON.stringify(x).includes(KEY),false);
});
