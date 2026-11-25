import { mkdtemp, rm, copyFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { StandardWorkflowSession } from '@kaicreator/domain-harness';
import type { NativeWorkflowContext, WorkflowLimits, StandardWorkflowOutcome } from '@kaicreator/domain-harness';
import { FixityElement, ImageElement, VideoElement, type Policy, type MediaInfo } from './media.js';
export type Result<T> = StandardWorkflowOutcome<T>;
export type Asset = { original:string; derivative:string; source:MediaInfo; output:MediaInfo; revision:string; originalPath:string; derivativePath:string };
const mediaCall=async<T>(fn:()=>Promise<T>,stage:string):Promise<Result<T>>=>{try{return {status:'COMPLETE',value:await fn()};}catch(error){const code=error instanceof Error&&/^(FILE_LIMIT|IMAGE_FORMAT|VIDEO_[A-Z_]+|CLI_[A-Z0-9_-]+)$/.test(error.message)?error.message:stage;return stop(code==='FILE_LIMIT'||code==='IMAGE_FORMAT'||code==='VIDEO_CONTAINER'?'REJECT':'UNKNOWN',code,code.startsWith('CLI_')?stage:undefined);}};
const ok=<T>(value:T):Result<T>=>({status:'COMPLETE',value});
const stop=(status:'REJECT'|'ASK'|'UNKNOWN'|'FAILED',code:string,stage?:string):Result<never>=>({status,reason:{code,message:stage?`${stage}: ${code}`:code}});
export class ArchiveElement {
  private readonly fixity=new FixityElement();
  private readonly image=new ImageElement();
  constructor(private readonly video:VideoElement,private readonly policy:Policy,private readonly staging:string){}
  private async item(root:NativeWorkflowContext,input:string,dir:string,index:number):Promise<Result<Asset>>{
    const source=resolve(input);const ext=extname(source).toLowerCase();
    if(!['.png','.jpg','.jpeg','.mp4'].includes(ext))return stop('REJECT','UNSUPPORTED_MEDIA');
    const element=ext==='.mp4'?this.video:this.image;
    const originalPath=join(dir,`original-${index}${ext}`);
    const target=join(dir,`derived-${index}${ext==='.mp4'?'.mp4':'.png'}`);
    const hash=await root.invokeOutcome(()=>mediaCall(()=>this.fixity.digest(source,this.policy.maxBytes),'SOURCE_READ'));if(hash.status!=='COMPLETE')return hash;
    return root.child(0,async child=>{
      const copied=await child.invoke(()=>copyFile(source,originalPath));if(copied.status!=='COMPLETE')return copied;
      const snapshot=await child.invoke(()=>this.fixity.digest(originalPath,this.policy.maxBytes));if(snapshot.status!=='COMPLETE')return snapshot;
      if(snapshot.value!==hash.value)return stop('UNKNOWN','SOURCE_CHANGED');
      const info=await child.invokeOutcome(()=>mediaCall(()=>element.inspect(originalPath),'SOURCE_METADATA'));if(info.status!=='COMPLETE')return info;
      if(Math.max(info.value.seconds,info.value.containerSeconds??0)>this.policy.maxSeconds)return stop('REJECT','DURATION_LIMIT');
      const converted=await child.invokeOutcome(async()=>{
        if(ext==='.mp4'){const verified=await mediaCall(()=>element.verify(originalPath),'SOURCE_DECODE');if(verified.status!=='COMPLETE')return verified;}
        return mediaCall(()=>element.derive(originalPath,target,this.policy),'MEDIA_CONVERSION');
      });if(converted.status!=='COMPLETE')return converted;
      const output=await child.invokeOutcome(()=>mediaCall(()=>element.inspect(target),'DERIVATIVE_METADATA'));if(output.status!=='COMPLETE')return output;
      const maxW=ext==='.mp4'?this.policy.videoWidth:this.policy.imageEdge;const maxH=ext==='.mp4'?this.policy.videoHeight:this.policy.imageEdge;
      if(output.value.width>maxW||output.value.height>maxH||Math.abs(output.value.width*info.value.height-output.value.height*info.value.width)>2*Math.max(info.value.width,info.value.height)||Math.abs(output.value.seconds-info.value.seconds)>Math.max(0.001,info.value.frameSeconds??0,output.value.frameSeconds??0)+0.001)return stop('FAILED','DERIVATIVE_INVALID');
      const decoded=await child.invokeOutcome(()=>mediaCall(()=>element.verify(target),'DERIVATIVE_DECODE'));if(decoded.status!=='COMPLETE')return decoded;
      const original=await child.invoke(()=>this.fixity.digest(source,this.policy.maxBytes));if(original.status!=='COMPLETE')return original;
      if(original.value!==hash.value)return stop('UNKNOWN','SOURCE_CHANGED');
      const derivative=await child.invoke(()=>this.fixity.digest(target,this.policy.maxBytes));if(derivative.status!=='COMPLETE')return derivative;
      return ok({original:hash.value,derivative:derivative.value,source:info.value,output:output.value,revision:this.policy.revision,originalPath,derivativePath:target});
    });
  }
  async plan(inputs:readonly string[],limits:WorkflowLimits):Promise<Result<{assets:Asset[];dispose:()=>Promise<void>}>>{
    return new StandardWorkflowSession(limits).run(root=>this.planIn(root,inputs));
  }
  async planIn(root:NativeWorkflowContext,inputs:readonly string[]):Promise<Result<{assets:Asset[];dispose:()=>Promise<void>}>>{
    if(inputs.length!==2)return stop('ASK','BATCH_REQUIRES_TWO');
    const dir=await mkdtemp(join(this.staging,'archive-'));
    let retained=false;
    try{
      const results=await Promise.all(inputs.map((input,i)=>root.child(1,child=>this.item(child,input,dir,i))));
      const assets:Asset[]=[];for(const result of results){if(result.status!=='COMPLETE')return result;assets.push(result.value);}
      if(new Set(assets.map(a=>a.original)).size!==assets.length)return stop('REJECT','DUPLICATE_CONTENT');
      const result=await root.invoke(()=>assets);if(result.status!=='COMPLETE')return result;
    retained=true;return ok({assets:result.value,dispose:()=>rm(dir,{recursive:true,force:true})});
    }finally{if(!retained)await rm(dir,{recursive:true,force:true});}
  }
}
