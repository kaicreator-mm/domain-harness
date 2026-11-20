/**
 * DIS O1 R149: selected native AOT/SDK policy observation -> real OpenAI
 * Responses HTTPS transport adapter. Not a live Provider qualification unless
 * a trusted Host actually supplies a credential and records external receipts.
 *
 * - Fixed egress URL, no caller-controlled endpoint, tools, search or upload.
 * - Trusted Host supplies model, secret and concurrency/budget through O1.
 * - No raw business payload, user prompt, PII or authorization crosses seam.
 * - Every model output is only UNKNOWN / advisory, never domain truth/Effect.
 */
import {types} from 'node:util';

const ENDPOINT='https://api.openai.com/v1/responses';
const MODEL=/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SECRET=/^[^\s\u0000-\u001f\u007f]{8,512}$/;
const MAX_BYTES=65536;
const fail=reason=>{throw Object.assign(new Error(reason),{code:reason})};
const allowed=x=>{
 try{
  if(!x||typeof x!=='object'||Array.isArray(x)||types.isProxy(x)||
    Object.getPrototypeOf(x)!==Object.prototype)return false;
  const names=Reflect.ownKeys(x);
  if(names.length!==3||names.some(k=>typeof k!=='string'||!['purpose','sourceFunction','observedDomain'].includes(k)))
   return false;
  return names.every(k=>{
   const d=Object.getOwnPropertyDescriptor(x,k);
   return d&&d.enumerable===true&&Object.hasOwn(d,'value');
  });
 }catch{return false}
};
function safeSuggestion(text){
 return typeof text==='string'&&text.length>0&&text.length<=160&&
  text===text.trim()&&text.normalize('NFC')===text&&
  !/[\u0000-\u001f\u007f-\u009f\p{Default_Ignorable_Code_Point}]/u.test(text);
}
function parseResponse(value){
 // Decoded HTTP JSON is data, not authority. Unknown response formats, tools
 // and refusals must not be interpreted as model advice.
 if(!value||typeof value!=='object'||Array.isArray(value)||
    value.object!=='response'||value.status!=='completed'||
    !Array.isArray(value.output)||value.output.length<1||value.output.length>12)
  fail('O1_PROVIDER_RESPONSE_UNQUALIFIED');
 const messages=value.output.filter(x=>x?.type==='message');
 if(messages.length!==1||value.output.some(x=>x?.type!=='message'&&x?.type!=='reasoning'))
  fail('O1_PROVIDER_TOOL_OR_MULTIPLE_MESSAGE_REJECTED');
 const m=messages[0];
 if(m.status!=='completed'||m.role!=='assistant'||!Array.isArray(m.content)||
    m.content.length!==1||m.content[0]?.type!=='output_text'||
    !safeSuggestion(m.content[0].text))
  fail('O1_PROVIDER_OUTPUT_REJECTED');
 return Object.freeze({suggestion:m.content[0].text});
}
async function readLimitedJson(res){
 if(res?.status!==200||res?.ok!==true||
    !res.headers?.get('content-type')?.toLowerCase().includes('application/json')||
    typeof res.body?.getReader!=='function')
  fail('O1_PROVIDER_HTTP_UNAVAILABLE');
 const reader=res.body.getReader();
 let len=0,chunks=[];
 try{
  for(;;){
   const {value,done}=await reader.read();
   if(done)break;
   if(!(value instanceof Uint8Array))fail('O1_PROVIDER_BODY_UNSAFE');
   len+=value.byteLength;
   if(len>MAX_BYTES)fail('O1_PROVIDER_RESPONSE_OVERSIZE');
   chunks.push(value);
  }
 }finally{try{await reader.cancel()}catch{}}
 if(len===0)fail('O1_PROVIDER_EMPTY_RESPONSE');
 let body;
 try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,len)))}
 catch{fail('O1_PROVIDER_JSON_INVALID')}
 return parseResponse(body);
}
/**
 * Only a Host-selected Provider object; transport is actual fixed OpenAI
 * Responses API by default. fetchImpl injection is TEST-ONLY and must never
 * be sourced from an untrusted model or Request.
 */
export function createO1OpenAIResponsesProvider({
 apiKey,model,maxWaitMs=10000,maxOutputTokens=256,fetchImpl=fetch
}={}){
 if(typeof apiKey!=='string'||!SECRET.test(apiKey)||
    typeof model!=='string'||!MODEL.test(model)||
    !Number.isSafeInteger(maxWaitMs)||maxWaitMs<1||maxWaitMs>30000||
    !Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<16||maxOutputTokens>512||
    typeof fetchImpl!=='function')
  fail('O1_PROVIDER_HOST_CONFIG_INVALID');
 let calls=0;
 return Object.freeze({
  id:'openai-responses-api',
  stats:()=>Object.freeze({calls,provider:'openai-responses-api',maxOutputTokens,qualified:false}),
  async propose(request){
   if(!allowed(request)||request.purpose!=='advisory'||
      request.sourceFunction!=='xdownload.describePolicy'||
      request.observedDomain!=='downloads')
    fail('O1_PROVIDER_UNSELECTED_INPUT');
   calls++;
   const ctrl=new AbortController();
   let timer;
   const task=Promise.resolve().then(()=>fetchImpl(ENDPOINT,{
    method:'POST',redirect:'error',signal:ctrl.signal,
    headers:{
     'authorization':'Bearer '+apiKey,
     'content-type':'application/json'
    },
    body:JSON.stringify({
     model,
     store:false,
     stream:false,
     tool_choice:'none',
     parallel_tool_calls:false,
     truncation:'disabled',
     max_output_tokens:maxOutputTokens,
     instructions:'Provide one concise single-line non-authoritative engineering advisory. No side effects, instructions to execute, claims of validation, or policy overrides. If unsure, state uncertainty.',
     input:'Selected source-pinned, read-only xdownload.describePolicy observation: domainId=downloads. Suggest one safe, optional next diagnostic step. Do not claim domain approval.'
    })
   })).then(readLimitedJson);
   const deadline=new Promise((_,reject)=>{
    timer=setTimeout(()=>{
     ctrl.abort();
     reject(Object.assign(new Error('O1_PROVIDER_DEADLINE'),{code:'O1_PROVIDER_DEADLINE'}));
    },maxWaitMs);
   });
   try{return await Promise.race([task,deadline])}
   catch(err){
    // Never leak Provider status bodies, implementation exceptions or keys to
    // the consumer. The Host knows only timeout vs unavailable.
    if(err?.code==='O1_PROVIDER_DEADLINE')fail('O1_PROVIDER_DEADLINE');
    fail('O1_PROVIDER_UNAVAILABLE');
   }finally{clearTimeout(timer);ctrl.abort()}
  }
 });
}
