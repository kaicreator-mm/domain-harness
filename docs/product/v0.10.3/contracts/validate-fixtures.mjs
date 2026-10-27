// R1 small schema-only positive/negative fixture runner. Independent of SDK implementation.
// Run after npm ci: node docs/product/v0.10.3/contracts/validate-fixtures.mjs
import {readFileSync} from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
const schema = JSON.parse(readFileSync(new URL('./guided-journey-v1.schema.json', import.meta.url), 'utf8'));
const validate = new Ajv2020({allErrors:true,strict:false}).compile(schema);
const template = {artifactId:'demo',version:'1',digest:'a'.repeat(64)};
const caseRef = {snapshotId:'case1',digest:'b'.repeat(64)};
const base = {contractVersion:'dh.guided-journey/1',journeyId:'journey-1'};
const request = {...base,messageType:'next-step.request',goals:['goal'],caseRef,catalogRef:template,eligibleTemplateRefs:[template]};
const step = {...base,messageType:'step.spec',stepId:'step-1',templateRef:template,caseRef,kind:'ASK',titleKey:'title',fields:[],allowedEvents:['USER_SUBMIT'],evidenceRefs:[]};
const outcome = {...base,messageType:'step.outcome',stepId:'step-1',event:'USER_SUBMIT',evidenceRefs:[]};
const decision = {...base,messageType:'next-step.decision',status:'STEP',reasonCode:'MATCH',evidenceRefs:[],step};
const advisory = {...base,messageType:'llm.advisory',caseRef,suggestedTemplateRef:template,reasonCode:'REVIEW',evidenceRefs:[]};
const clone = x => globalThis.structuredClone(x);
const cases = [
 ['valid request',request,true],['valid spec',step,true],['valid outcome',outcome,true],['valid decision',decision,true],['valid advisory',advisory,true],
 ['oversized goals',{...request,goals:Array(9).fill('goal')},false],
 ['oversized journeyId',{...request,journeyId:'x'.repeat(129)},false],
 ['oversized option field',{...step,fields:Array(13).fill({id:'x',type:'TEXT',labelKey:'l',required:true})},false],
 ['duplicate allowed events',{...step,allowedEvents:['USER_SUBMIT','USER_SUBMIT']},false],
 ['oversized evidence item',{...advisory,evidenceRefs:['x'.repeat(257)]},false],
 ['receipt event missing receiptRef',{...outcome,event:'EFFECT_RECEIPT'},false],
 ['STEP decision missing step',(()=>{const x=clone(decision);delete x.step;return x;})(),false],
 ['unknown message kind',{...request,messageType:'unknown'},false]
];
let failures=0;
for(const [name,payload,expected] of cases){const actual=!!validate(payload);if(actual!==expected){failures++;console.error('FAIL',name,JSON.stringify(validate.errors));}else console.log('PASS',name);}
console.log(`V0103_SCHEMA_FIXTURES=${cases.length} FAILURES=${failures}`);
process.exitCode=failures?1:0;
