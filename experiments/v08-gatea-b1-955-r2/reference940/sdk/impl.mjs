import { SpikeError } from '../bootstrap.mjs';
export const implementations={
 'sdk.rule.impl@1':()=>({test({when,facts}){const x=facts[when.field];switch(when.op){case 'always':return true;case 'eq':return x===when.value;case 'gte':return typeof x==='number'&&x>=when.value;case 'lt':return typeof x==='number'&&x<when.value;case 'present':return Object.hasOwn(facts,when.field);default:throw new SpikeError('E_RULE')}}}),
 'sdk.workflow.impl@1':ctx=>({run({input,assemblyDigest}){
  const workflow=ctx.invoke('business.workflow@1','resolve',{});
  let facts={...input};const decisions=[],visited=new Set();
  const eligible=n=>ctx.invoke('rule.eval@1','test',{when:n.when,facts});
  for(let step=0;step<8;step++){
   if(eligible({when:workflow.endWhen}))return {status:'COMPLETE',facts,decisions};
   const options=workflow.nodes.filter(n=>!visited.has(n.id)&&eligible(n)).sort((a,b)=>a.priority-b.priority||a.id.localeCompare(b.id));
   if(!options.length)return {status:'WAIT',reason:'NO_ELIGIBLE_NODE',facts,decisions};
   const node=options[0];decisions.push({candidates:options.map(x=>x.id),selected:node.id,policy:'priority-then-id'});
   const result=ctx.invoke('business.action@1','run',{action:node.action,facts});
   if(result.outcome!=='SUCCESS'){
    ctx.invoke('effect.record@1','record',{key:workflow.id+'/'+step+'/'+node.id,outcome:result.outcome,assemblyDigest});
    return {status:result.outcome,reason:'NOT_KNOWN_SUCCESS',facts,decisions};
   }
   const prior=ctx.invoke('state.commit@1','read',{});
   const committed=ctx.invoke('state.commit@1','commit',{expectedRevision:prior.revision,facts:result.facts});
   ctx.invoke('effect.record@1','record',{key:workflow.id+'/'+step+'/'+node.id,outcome:'SUCCESS',assemblyDigest});
   facts={...facts,...committed.facts};visited.add(node.id);
  }
  return {status:'STOP',reason:'MAX_STEPS',facts,decisions};
 }})
};
