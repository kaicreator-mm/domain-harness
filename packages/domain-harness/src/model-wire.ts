import type { StandardJsonValue as J } from './standard-files.js';
import type { ModelProfile, ModelRequest, ModelTurn, ModelToolCall } from './model-contract.js';
import type { NativeWorkflowContext } from './native-workflow-composition.js';
import type { ModelUsage } from './workflow-managed-contract.js';
import { array, invalid, object, parseJson, schema, snapshotJson, str } from './model-json.js';
export const unavailable: ModelUsage=Object.freeze({input:null,output:null,total:null,kind:'unavailable'});
export type AcceptedTurn = { readonly profile: ModelProfile; readonly runId:string; readonly scopeId:string; readonly wire:J; readonly turn:ModelTurn; readonly stamp:string; readonly prefix:string };
export const turns=new WeakMap<ModelTurn,AcceptedTurn>();
// 私有计划租约：只有当前计划回调中实际接纳的模型 JSON 能进入此批编辑。
const planning=new WeakMap<NativeWorkflowContext,object>();
const proposals=new WeakMap<object, {readonly runId:string;readonly scopeId:string;readonly plan:object|undefined;consumed:boolean}>();
export function beginModelPlan(root:NativeWorkflowContext):object {
  if(planning.has(root))return invalid('MODEL_PLAN_REENTRY');
  const plan=Object.freeze({});planning.set(root,plan);return plan;
}
export function endModelPlan(root:NativeWorkflowContext,plan:object):void {
  if(planning.get(root)===plan)planning.delete(root);
}
export function modelPlan(root:NativeWorkflowContext):object|undefined {return planning.get(root);}
export function registerModelJson(turn:ModelTurn,runId:string,scopeId:string,plan:object|undefined):void {
  if(typeof turn.json==='object'&&turn.json!==null)proposals.set(turn.json,{runId,scopeId,plan,consumed:false});
}
export function isModelJson(value:unknown):boolean {
  return typeof value==='object'&&value!==null&&proposals.has(value);
}
export function consumeModelJson(value:unknown,runId:string,scopeId:string,plan:object):boolean {
  if(typeof value!=='object'||value===null)return false;
  const proof=proposals.get(value);
  if(!proof||proof.consumed||proof.runId!==runId||proof.scopeId!==scopeId||proof.plan!==plan)return false;
  proof.consumed=true;return true;
}
const isArray=(v:unknown):boolean=>Array.isArray(v);
const text=(v:unknown,max=1024)=>{const s=str(v,max);if(!s.trim())return invalid('MODEL_INVALID_REQUEST');return s;};
export const count=(v:unknown,max=2147483647)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=max?v:invalid('MODEL_INVALID_LIMIT');
export function captureProfile(p:ModelProfile):ModelProfile {
  if(!p||typeof p.credential!=='function'||('boundInputTokens'in p&&p.boundInputTokens!==undefined))return invalid('MODEL_INVALID_PROFILE');
  text(p.id,128);text(p.model,256);
  let u:URL;try{u=new URL(p.endpoint);}catch{return invalid('MODEL_INVALID_ENDPOINT');}
  // 明确给定的环回端点用于本地协议测试或可信本地模型；其它端点只允许 HTTPS。
  if(u.username||u.password||u.hash||u.search||!(u.protocol==='https:'||u.protocol==='http:'&&['127.0.0.1','[::1]','localhost'].includes(u.hostname)))return invalid('MODEL_INVALID_ENDPOINT');
  if(p.protocol==='openai-chat'){
    if(!u.pathname.endsWith('/chat/completions')||!['max_tokens','max_completion_tokens'].includes(p.tokenField??'')||p.anthropicVersion!==undefined)return invalid('MODEL_INVALID_PROFILE');
  }else if(p.protocol==='anthropic-messages'){
    if(!u.pathname.endsWith('/messages')||!p.anthropicVersion||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(p.anthropicVersion)||p.tokenField!==undefined)return invalid('MODEL_INVALID_PROFILE');
  }else return invalid('MODEL_INVALID_PROFILE');
  const f=p.features,l=p.limits;
  if(!f||![f.tools,f.jsonSchema,f.toolsWithJsonSchema].every(v=>typeof v==='boolean')||f.toolsWithJsonSchema&&(!f.tools||!f.jsonSchema))return invalid('MODEL_INVALID_PROFILE');
  for(const n of [count(l.requestBytes,1048576),count(l.responseBytes,1048576),count(l.maxOutputTokens),count(l.timeoutMs)])if(n<1)return invalid('MODEL_INVALID_LIMIT');
  return Object.freeze({...p,endpoint:u.href,features:Object.freeze({...f}),limits:Object.freeze({...l})});
}
interface Prepared {
  readonly body:string; readonly tools:ReadonlyMap<string,(v:J)=>boolean>;
  readonly prefix:string; readonly output:ModelRequest['output']; readonly outputLimit:number; readonly usedIds:ReadonlySet<string>; readonly check?: (v:J)=>boolean;
}
export function prepare(p:ModelProfile,r:ModelRequest,runId:string,scopeId:string,stamp:string):Prepared {
  const max=p.limits.requestBytes;
  if(!isArray(r.tools)||!isArray(r.input)||r.tools.length>256||r.input.length>256)return invalid('MODEL_STRUCTURE_LIMIT');
  const tools=new Map<string,(v:J)=>boolean>(), descriptors:J[]=[];
  let left=max;
  const debit=(v:J)=>{left-=Buffer.byteLength(JSON.stringify(v));if(left<0)invalid('MODEL_BYTE_LIMIT');return v;};
  const add=(list:J[],v:J)=>{list.push(debit(v));};
  const system=str(r.system,max);
  // 每个独立片段先扣累计字节，再放入请求数组，避免先构造巨大组合。
  if(p.protocol==='anthropic-messages')debit(system);
  for(const t of r.tools){
    const name=text(t.name,64);if(!/^[a-zA-Z0-9_-]+$/.test(name)||tools.has(name))return invalid('MODEL_INVALID_TOOL');
    const s=snapshotJson(t.inputSchema,left);tools.set(name,schema(s,false));
    add(descriptors,p.protocol==='openai-chat'?{type:'function',function:{name,description:text(t.description,max),parameters:s}}:
      {name,description:text(t.description,max),input_schema:s});
  }
  if(tools.size&&!p.features.tools)return invalid('MODEL_UNSUPPORTED_FEATURE');
  const output=Object.freeze({...r.output});
  if(!output||!['text','json'].includes(output.kind))return invalid('MODEL_INVALID_REQUEST');
  let check:((v:J)=>boolean)|undefined, format:J|undefined;
  if(output.kind==='json'){
    if(typeof output.strict!=='boolean')return invalid('MODEL_INVALID_REQUEST');
    if(output.strict){
      if(!p.features.jsonSchema||tools.size&&!p.features.toolsWithJsonSchema)return invalid('MODEL_UNSUPPORTED_FEATURE');
      const s=snapshotJson(output.schema,left);check=schema(s,true);
      format=p.protocol==='openai-chat'?{type:'json_schema',json_schema:{name:'result',strict:true,schema:s}}:{format:{type:'json_schema',schema:s}};
    }else if(p.protocol==='openai-chat')format={type:'json_object'};
    if(format)debit(format);
  }
  const messages:J[]=[],used=new Set<string>();let pending:readonly ModelToolCall[]|undefined;
  if(p.protocol==='openai-chat'&&system)add(messages,{role:'system',content:system});
  for(const part of r.input){
    if(part.role==='user'){
      if(pending)return invalid('MODEL_TOOL_CORRELATION');add(messages,{role:'user',content:str(part.text,left)});
    }else if(part.role==='assistant'){
      if(pending)return invalid('MODEL_TOOL_CORRELATION');
      const t=turns.get(part.turn);
      if(!t||t.profile!==p||t.runId!==runId||t.scopeId!==scopeId||t.stamp!==stamp||t.prefix!==JSON.stringify({system,messages}))return invalid('MODEL_FOREIGN_TURN');
      for(const call of t.turn.calls){if(used.has(call.id)||tools.get(call.name)?.(call.input)!==true)return invalid('MODEL_TOOL_CORRELATION');used.add(call.id);}
      add(messages,t.wire);if(t.turn.calls.length)pending=t.turn.calls;
    }else if(part.role==='tool-results'){
      if(!pending||!isArray(part.results)||part.results.length!==pending.length)return invalid('MODEL_TOOL_CORRELATION');
      const results:J[]=[];
      for(let i=0;i<pending.length;i++){
        const result=part.results[i]!, call=pending[i]!;
        if(result.callId!==call.id||typeof result.error!=='boolean')return invalid('MODEL_TOOL_CORRELATION');
        const value=snapshotJson(result.value,left);
        if(p.protocol==='openai-chat')add(messages,{role:'tool',tool_call_id:call.id,content:JSON.stringify({value,error:result.error})});
        else add(results,{type:'tool_result',tool_use_id:call.id,content:JSON.stringify(value),is_error:result.error});
      }
      if(p.protocol==='anthropic-messages')messages.push({role:'user',content:results});
      pending=undefined;
    }else return invalid('MODEL_INVALID_REQUEST');
  }
  if(pending||!r.input.length||(r.action==='continue'&&!r.input.some(x=>x.role==='assistant')))return invalid('MODEL_TOOL_CORRELATION');
  const tokenLimit=count(r.maxOutputTokens);
  if(tokenLimit<1||tokenLimit>p.limits.maxOutputTokens)return invalid('MODEL_OUTPUT_LIMIT');
  const wire:ObjWrite={model:p.model,messages,...(descriptors.length?{tools:descriptors}:{})};
  if(p.protocol==='openai-chat'){wire[p.tokenField!]=tokenLimit;if(format)wire.response_format=format;}
  else {wire.max_tokens=tokenLimit;if(system)wire.system=system;if(format)wire.output_config=format;}
  const body=JSON.stringify(snapshotJson(wire,max));if(Buffer.byteLength(body)>max)return invalid('MODEL_BYTE_LIMIT');
  return {body,prefix:JSON.stringify({system,messages}),tools,output,outputLimit:tokenLimit,usedIds:used,...(check?{check}:{})};
}
type ObjWrite=Record<string,J>;
export function usage(p:ModelProfile,v:J|undefined):ModelUsage {
  if(v===undefined||v===null)return unavailable;
  const u=object(v), n=(key:string)=>u[key]===undefined?null:count(u[key],Number.MAX_SAFE_INTEGER);
  let input=n(p.protocol==='openai-chat'?'prompt_tokens':'input_tokens');
  const output=n(p.protocol==='openai-chat'?'completion_tokens':'output_tokens');
  let total=p.protocol==='openai-chat'?n('total_tokens'):null;
  if(p.protocol==='anthropic-messages'){
    const a=n('cache_creation_input_tokens'),b=n('cache_read_input_tokens');
    // 未确认缺失 cache 字段语义时不把部分输入报告冒充完整总量。
    input=input!==null&&a!==null&&b!==null?count(input+a+b,Number.MAX_SAFE_INTEGER):null;
  }
  if(total!==null&&((input!==null&&total<input)||(output!==null&&total<output)))return invalid('MODEL_USAGE_INVALID');
  if(input!==null&&output!==null){const sum=count(input+output,Number.MAX_SAFE_INTEGER);if(total!==null&&total!==sum)return invalid('MODEL_USAGE_INVALID');total=sum;}
  return Object.freeze({input,output,total,kind:input===null&&output===null&&total===null?'unavailable':'observed'});
}
export function decode(p:ModelProfile,data:J,prepared:Prepared,requestId:string,attempt:number,observed:ModelUsage):{turn:ModelTurn;wire:J} {
  const o=object(data),calls:ModelToolCall[]=[],ids=new Set<string>();let content='',wire:J;
  const add=(id:unknown,name:unknown,input:J)=>{
    const i=text(id,128),n=text(name,64),check=prepared.tools.get(n);
    if(ids.has(i)||prepared.usedIds.has(i)||!check||!check(input)||calls.length>=256)return invalid('MODEL_TOOL_CORRELATION');
    ids.add(i);calls.push(Object.freeze({id:i,name:n,input}));
  };
  if(p.protocol==='openai-chat'){
    const choices=array(o.choices);if(choices.length!==1)return invalid('MODEL_INVALID_RESPONSE');
    const choice=object(choices[0]),m=object(choice.message);
    if(m.refusal!==undefined&&m.refusal!==null&&m.refusal!=='')return invalid('MODEL_REFUSED');
    if(m.role!==undefined&&m.role!=='assistant')return invalid('MODEL_INVALID_RESPONSE');
    if(Object.keys(m).some(k=>!['role','content','tool_calls','refusal','reasoning_content'].includes(k))||(m.reasoning_content!==undefined&&m.reasoning_content!==null&&m.reasoning_content!==''))return invalid('MODEL_UNSUPPORTED_BLOCK');
    content=m.content===null||m.content===undefined?'':str(m.content);
    const raw=m.tool_calls===undefined?[]:array(m.tool_calls);
    for(const t of raw){const c=object(t),f=object(c.function);if(c.type!=='function'||Object.keys(c).some(k=>!['type','id','function'].includes(k))||Object.keys(f).some(k=>!['name','arguments'].includes(k)))return invalid('MODEL_UNSUPPORTED_BLOCK');add(c.id,f.name,parseJson(str(f.arguments),p.limits.responseBytes));}
    if(choice.finish_reason!==(calls.length?'tool_calls':'stop'))return invalid('MODEL_FINISH_REJECTED');
    wire={role:'assistant',content:m.content??null,...(raw.length?{tool_calls:raw}:{})};
  }else{
    const blocks=array(o.content);for(const b of blocks){const c=object(b);if(c.type==='text'){if(Object.keys(c).some(k=>k!=='type'&&k!=='text'))return invalid('MODEL_UNSUPPORTED_BLOCK');content+=str(c.text);}
      else if(c.type==='tool_use'){if(Object.keys(c).some(k=>!['type','id','name','input'].includes(k)))return invalid('MODEL_UNSUPPORTED_BLOCK');add(c.id,c.name,c.input??invalid());}else return invalid('MODEL_UNSUPPORTED_BLOCK');}
    if(o.stop_reason!==(calls.length?'tool_use':'end_turn'))return invalid('MODEL_FINISH_REJECTED');
    wire={role:'assistant',content:blocks};
  }
  const value=prepared.output.kind==='json'&&!calls.length?parseJson(content,p.limits.responseBytes):undefined;
  if(value!==undefined&&prepared.check&&!prepared.check(value))return invalid('MODEL_SCHEMA_MISMATCH');
  const turn:ModelTurn=Object.freeze({requestId,attempt,text:content,calls:Object.freeze(calls),usage:observed,...(value===undefined?{}:{json:value})});
  return {turn,wire:snapshotJson(wire,p.limits.responseBytes)};
}
