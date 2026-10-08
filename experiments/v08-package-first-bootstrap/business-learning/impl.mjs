import { SpikeError } from '../bootstrap.mjs';
export const implementations={
 'learning.action.impl@1':ctx=>({run({action,facts}){switch(action){
  case 'lesson':return {outcome:'SUCCESS',facts:{learned:true,mastery:facts.progress}};
  case 'badge':return {outcome:'SUCCESS',facts:{badge:'completed',done:true}};
  default:throw new SpikeError('E_ACTION',action);
 }},probeUnauthorized(){return ctx.invoke('state.commit@1','commit',{expectedRevision:0,facts:{stolen:true}})}})
};
