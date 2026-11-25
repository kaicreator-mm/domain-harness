import assert from 'node:assert/strict';
import {ClarificationElement,InteractionElement,resolveEvidence,selectNextDecision,runInteractiveRecognitionHandling} from '@kaicreator/domain-harness';
type Key='destination';
const evidence=resolveEvidence<Key,string>([{key:'destination',accepts:['user']}],[],{scope:'sample',revisions:new Map()},{equal:(_k,a,b)=>a===b},4);
const decision=selectNextDecision([{key:'choose',applicable:'yes',required:'yes',satisfied:'no',priority:1,dependsOn:[]}],{maxItems:4,maxDependencies:4});
const prepared=ClarificationElement.prepare(evidence,decision,{decisionKey:'choose',title:'Choose destination',actions:['submit']},[{field:{id:'answer',label:'Destination',kind:'string',required:true},evidenceKey:'destination',applicable:'yes',confirmation:'user'}]);
assert.equal(prepared.status,'prompt');
const e=new InteractionElement({onPrompt:(p,actual)=>{assert.equal(actual,e);assert.equal(actual.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{answer:'sample'}}).accepted,true);}});
const result=await runInteractiveRecognitionHandling<number,string,string,Key>(e,{maxCalls:4,maxSteps:5,maxDepth:0},0,(_n,event)=>{
 if(event.kind==='initial')return {status:'COMPLETE',value:{kind:'clarify',state:1,clarification:prepared.clarification}};
 const mapped=event.clarification;
 if(mapped?.status!=='values'||mapped.values[0]?.key!=='destination'||typeof mapped.values[0]?.value!=='string')return {status:'REJECT',reason:{code:'INVALID',message:'Invalid'}};
 return {status:'COMPLETE',value:{kind:'ready',intent:mapped.values[0].value}};
},intent=>({status:'COMPLETE',value:intent}));
assert.deepEqual(result,{status:'COMPLETE',value:'sample'});
