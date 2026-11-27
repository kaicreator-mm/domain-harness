import { managedModelCall } from './native-workflow-composition.js';
import type { NativeWorkflowContext } from './native-workflow-composition.js';
import type { ModelProfile, ModelRequest, ModelTurn } from './model-contract.js';
import type { ModelUsage } from './workflow-managed-contract.js';
import type { StandardWorkflowOutcome as Outcome } from './standard-workflow.js';
import { captureProfile, prepare, decode, usage, unavailable, turns, registerModelJson, modelPlan } from './model-wire.js';
import { object, parseJson } from './model-json.js';

const failed = <T>(code: string): Outcome<T> => ({status:'FAILED',reason:{code,message:'Model request did not complete'}});
const safeCode = (error: unknown) => error instanceof Error && /^MODEL_[A-Z_]+$/.test(error.message) ? error.message : 'MODEL_EXECUTION_FAILED';
async function body(response:Response,max:number):Promise<string>{
  const len=response.headers.get('content-length');
  if(len!==null&&(!/^\d+$/.test(len)||Number(len)>max)){await response.body?.cancel();throw Error('MODEL_BYTE_LIMIT');}
  if(!response.body)throw Error('MODEL_INVALID_RESPONSE');
  const reader=response.body.getReader(), decoder=new TextDecoder('utf-8',{fatal:true});
  let text='',size=0;
  try{
    for(;;){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;
      if(size>max)throw Error('MODEL_BYTE_LIMIT');text+=decoder.decode(next.value,{stream:true});}
    return text+decoder.decode();
  }finally{try{await reader.cancel();}finally{reader.releaseLock();}}
}
/** 受控单轮原生模型 Element；不自动执行工具、不持久化、不重试。
 * @dhKind standard-element
 * @dhCapability workflow
 */
export class ModelElement {
  readonly #profile:ModelProfile;
  constructor(profile:ModelProfile){this.#profile=captureProfile(profile);}
  public async generate(root:NativeWorkflowContext,request:ModelRequest):Promise<Outcome<ModelTurn>>{
    const profile=this.#profile;
    let accepted:ReturnType<typeof decode>|undefined, acceptedStamp="", acceptedPrefix="";
    const plan=modelPlan(root);
    try{
      const result=await managedModelCall<ModelTurn,ReturnType<typeof prepare>>(root,profile,request,(stamp,output)=>{
        try {
          const prepared=prepare(profile,request,root.runId,root.scopeId,stamp);
          return prepared.outputLimit===output?{status:'COMPLETE',value:prepared}:failed('MODEL_OUTPUT_LIMIT');
        }catch(error){return failed(safeCode(error));}
      },async(id,attempt,check,signal,stamp,prepared)=>{
        let observed:ModelUsage=unavailable;
        const fail=(code:string,retryable=false)=>({outcome:failed<ModelTurn>(code),usage:observed,retryable});
        const timer=AbortSignal.timeout(profile.limits.timeoutMs);
        const abort=AbortSignal.any([signal,timer]);
        try{
          if(!check()||abort.aborted)return fail('MODEL_CANCELLED');
          let credential:string;
          try{credential=await profile.credential();}catch{return fail('MODEL_CREDENTIAL_FAILED',true);}
          if(abort.aborted||!check())return fail('MODEL_CANCELLED');
          if(typeof credential!=='string'||!credential||Buffer.byteLength(credential)>8192||/[\r\n]/.test(credential))return fail('MODEL_CREDENTIAL_FAILED',true);
          const headers:Record<string,string>={'content-type':'application/json'};
          if(profile.protocol==='openai-chat')headers.authorization='Bearer '+credential;
          else{headers['x-api-key']=credential;headers['anthropic-version']=profile.anthropicVersion!;}
          const response=await fetch(profile.endpoint,{method:'POST',headers,body:prepared.body,signal:abort,redirect:'manual'});
          if(!response.ok){await response.body?.cancel();return fail(response.status>=300&&response.status<400?'MODEL_REDIRECT':
            response.status===429?'MODEL_RATE_LIMIT':response.status===401||response.status===403?'MODEL_AUTH_FAILED':
            response.status>=500?'MODEL_PROVIDER_FAILED':'MODEL_HTTP_FAILED',response.status===429||response.status>=500);}
          const raw=await body(response,profile.limits.responseBytes);
          const data=parseJson(raw,profile.limits.responseBytes);
          observed=usage(profile,object(data).usage);
          if(observed.output!==null&&observed.output>prepared.outputLimit)return fail('MODEL_OUTPUT_OVERRUN');
          if(abort.aborted||!check())return fail('MODEL_CANCELLED');
          accepted=decode(profile,data,prepared,id,attempt,observed);acceptedStamp=stamp;acceptedPrefix=prepared.prefix;
          return {outcome:{status:'COMPLETE',value:accepted.turn},usage:observed,retryable:false};
        }catch(error){return fail(signal.aborted?'MODEL_CANCELLED':timer.aborted?'MODEL_TIMEOUT':safeCode(error),!signal.aborted&&timer.aborted);}
      });
      if(result.status==='COMPLETE'&&accepted){
        turns.set(result.value,Object.freeze({profile,runId:root.runId,scopeId:root.scopeId,wire:accepted.wire,turn:result.value,stamp:acceptedStamp,prefix:acceptedPrefix}));
        registerModelJson(result.value,root.runId,root.scopeId,plan);
      }
      return result;
    }catch{return failed('MODEL_EXECUTION_FAILED');}
  }
}
