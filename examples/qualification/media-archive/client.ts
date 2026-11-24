import type { Asset, Result } from './archive.js';
import type { Receipt } from './catalog.js';
import { StandardWorkflowSession } from '@kaicreator/domain-harness';
export class RegistrationElement {
  constructor(private readonly endpoint:string,private readonly token:string){}
  async register(tenant:string,asset:Asset):Promise<Result<Receipt>>{
    return this.request('register',tenant,asset);
  }
  async readback(tenant:string,asset:Asset):Promise<Result<Receipt>>{return this.request('readback',tenant,asset);}
  private async request(route:'register'|'readback',tenant:string,asset:Asset):Promise<Result<Receipt>>{
    return new StandardWorkflowSession({maxCalls:1,maxSteps:2,maxDepth:0}).run(root=>root.invokeOutcome(async()=>{
      try{
        const reply=await fetch(this.endpoint+'/'+route,{method:'POST',headers:{authorization:`Bearer ${this.token}`,'content-type':'application/json'},body:JSON.stringify({tenant,hash:asset.original,revision:asset.revision,derivative:asset.derivative}),redirect:'error',signal:AbortSignal.timeout(3000)});
        const result=await reply.json() as Result<Receipt>;
        if(!reply.ok||!['ASK','REJECT','UNKNOWN','COMPLETE'].includes(result.status))throw Error('HOST_REPLY');
        if(result.status==='COMPLETE'&&(result.value.tenant!==tenant||result.value.original!==asset.original||result.value.derivative!==asset.derivative||result.value.revision!==asset.revision||typeof result.value.duplicate!=='boolean'||JSON.stringify(result.value.source)!==JSON.stringify(asset.source)||JSON.stringify(result.value.output)!==JSON.stringify(asset.output)))throw Error('HOST_RECEIPT');
        return result;
      }catch{return {status:'UNKNOWN',reason:{code:'HOST_UNAVAILABLE',message:'HOST_UNAVAILABLE'}};}
    }));
  }
}
