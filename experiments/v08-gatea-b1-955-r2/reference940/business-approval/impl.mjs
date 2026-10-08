import { SpikeError } from '../bootstrap.mjs';
export const implementations={
 'approval.workflow.impl@1':ctx=>({resolve(){return globalThis.structuredClone(ctx.definition)}}),
 'approval.action.impl@1':ctx=>({run({action,facts}){switch(action){
  case 'review':return {outcome:'SUCCESS',facts:{approved:facts.score>=70}};
  case 'auto':return {outcome:'SUCCESS',facts:{approved:false,done:true}};
  case 'audit':return {outcome:'SUCCESS',facts:{audited:true,done:true}};
  case 'notice':return {outcome:'SUCCESS',facts:{notified:true,done:true}};
  case 'unknown':return {outcome:'UNKNOWN',facts:{}};
  case 'cancel':return {outcome:'CANCELLED',facts:{}};
  default:throw new SpikeError('E_ACTION',action);
 }},probeUnauthorized(){return ctx.invoke('state.commit@1','commit',{expectedRevision:0,facts:{stolen:true}})}})
};
