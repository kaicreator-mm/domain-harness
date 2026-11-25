import assert from 'node:assert/strict';
import {StandardWorkflowSession,routeWorkflowOutcome} from '@kaicreator/domain-harness';
const result=await new StandardWorkflowSession({maxCalls:2,maxSteps:3,maxDepth:0}).run(async root=>{
  const first=await root.invoke(()=>3*4);
  if(first.status!=='COMPLETE')return first;
  assert.equal(first.value,12);
  return root.invokeOutcome(()=>({status:'UNKNOWN',reason:{code:'WAITING_SAMPLE',message:'Pending'}}));
});
const display=await routeWorkflowOutcome(result,{COMPLETE:r=>r.status,REJECT:r=>r.status,ASK:r=>r.status,WAIT:r=>r.status,UNKNOWN:r=>r.status,FAILED:r=>r.status});
assert.equal(display,'UNKNOWN');
let entered=false;
const short=await new StandardWorkflowSession({maxCalls:1,maxSteps:3,maxDepth:0}).run(async root=>{
  await root.invoke(()=>12);return root.invokeOutcome(()=>{entered=true;return {status:'COMPLETE',value:1}});
});
assert.equal(short.status,'FAILED');assert.equal(entered,false);
