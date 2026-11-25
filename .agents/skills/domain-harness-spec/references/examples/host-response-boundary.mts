import assert from 'node:assert/strict';
import {InteractionElement,runInteractiveRecognitionHandling} from '@kaicreator/domain-harness';
import type {InteractionPrompt,InteractionResponse} from '@kaicreator/domain-harness';

// Narrow host adapter for parsed JSON text input, not a universal wire decoder or arbitrary JS sandbox.
// Complete wire replies are submitted unchanged; naked input has no authority to select identity.
function textReply(prompt:InteractionPrompt,input:unknown):InteractionResponse|undefined{
  if(typeof input!=='object'||input===null||Array.isArray(input))return undefined;
  const object=input as Record<string,unknown>;
  if(Object.keys(object).some(key=>key!=='action'&&key!=='text')||object.action!=='text'||typeof object.text!=='string')return undefined;
  return {intentId:prompt.intentId,revision:prompt.revision,decisionKey:prompt.decisionKey,action:'text',text:object.text};
}
const e=new InteractionElement({onPrompt:(prompt,actual)=>{
  assert.equal(textReply(prompt,{action:'text',text:'paint',intentId:'another'}),undefined);
  assert.equal(textReply(prompt,{action:'text',text:'paint',revision:999}),undefined);
  assert.equal(textReply(prompt,{action:'text',text:'paint',decisionKey:'another'}),undefined);
  const response=textReply(prompt,{action:'text',text:'paint'});
  assert.ok(response);
  assert.equal(actual.submit({...response,revision:prompt.revision-1}).accepted,false);
  assert.equal(actual.submit(response).accepted,true);
}});
const result=await runInteractiveRecognitionHandling<number,string,string>(e,{maxCalls:4,maxSteps:5,maxDepth:0},0,(_n,event)=>{
  if(event.kind==='initial')return {status:'COMPLETE',value:{kind:'clarify',state:1,prompt:{decisionKey:'activity',title:'Activity',fields:[],actions:['text']}}};
  if(event.response.action!=='text')return {status:'REJECT',reason:{code:'INVALID',message:'Invalid'}};
  return {status:'COMPLETE',value:{kind:'ready',intent:event.response.text}};
},intent=>({status:'COMPLETE',value:intent}));
assert.deepEqual(result,{status:'COMPLETE',value:'paint'});
