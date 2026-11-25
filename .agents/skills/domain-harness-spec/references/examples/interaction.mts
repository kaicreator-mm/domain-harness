import assert from 'node:assert/strict';
import {InteractionElement,runInteractiveRecognitionHandling} from '@kaicreator/domain-harness';
const interaction=new InteractionElement({onPrompt:p=>{
 assert.equal(interaction.submit({intentId:p.intentId,revision:p.revision,decisionKey:p.decisionKey,action:'submit',values:{name:'Ada'}}).accepted,true);
}});
const result=await runInteractiveRecognitionHandling<number,string,string>(interaction,{maxCalls:4,maxSteps:5,maxDepth:0},0,(_state,event)=>{
 if(event.kind==='initial')return {status:'COMPLETE',value:{kind:'clarify',state:1,prompt:{decisionKey:'name',title:'Name',fields:[{kind:'string',id:'name',label:'Name',required:true}],actions:['submit']}}};
 return event.response.action==='submit'&&typeof event.response.values.name==='string'?{status:'COMPLETE',value:{kind:'ready',intent:event.response.values.name}}:{status:'REJECT',reason:{code:'INVALID',message:'Invalid'}};
},intent=>({status:'COMPLETE',value:intent}));
assert.deepEqual(result,{status:'COMPLETE',value:'Ada'});
