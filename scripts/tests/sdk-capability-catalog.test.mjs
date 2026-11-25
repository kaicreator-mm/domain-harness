import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inventory,verifyInventory,verifyScenarioRefs,compareDeclarations,verifyLocalLinks} from '../sdk-capability-catalog.mjs';

const rows=inventory();
const changed=(name,fn)=>rows.map(r=>r.name===name?fn(r):r);
test('actual public inventory includes semantic kinds and members',()=>verifyInventory(rows));
test('missing Reader/type and phantom export are rejected',()=>{
 for(const name of ['JsonReader','YamlReader','WorkflowLimits'])assert.throws(()=>verifyInventory(rows.filter(r=>r.name!==name)),/SDK_ROOT_EXPECTATION/u);
 assert.throws(()=>verifyInventory([...rows,{...rows[0],name:'Phantom'}]),/SDK_ROOT_EXPECTATION/u);
 assert.throws(()=>verifyInventory([...rows,rows[0]]),/SDK_DUPLICATE_EXPORT/u);
});
test('wrong class category and acquisition are rejected',()=>{
 assert.throws(()=>verifyInventory(changed('SQLiteDatabaseError',r=>({...r,kind:'standard-element'}))),/SDK_CLASS_KIND/u);
 assert.throws(()=>verifyInventory(changed('WorkflowElement',r=>({...r,access:'public'}))),/SDK_ACQUISITION/u);
 assert.throws(()=>verifyInventory(changed('JsonReader',r=>({...r,family:'database'}))),/SDK_WRONG_FAMILY/u);
});
test('missing symbol, fake method, wrong static and leaked internal members rejected',()=>{
 const mutations=[
  ['KernelLifecycle',r=>({...r,members:r.members.filter(m=>m.name!=='[Symbol.asyncDispose]')})],
  ['KernelLifecycle',r=>({...r,members:r.members.map(m=>m.name==='[Symbol.asyncDispose]'?{...m,name:'__@asyncDispose@123'}:m)})],
  ['SQLiteDatabaseError',r=>({...r,members:[...r.members,{name:'stack',scope:'instance'}]})],
  ['SQLiteDatabaseError',r=>({...r,members:[...r.members,{name:'captureStackTrace',scope:'static'}]})],
  ['KernelLifecycle',r=>({...r,members:[...r.members,{name:'close',scope:'instance'}]})],
  ['VectorQueryElement',r=>({...r,members:r.members.map(m=>({...m,scope:'static'}))})],
  ['InteractionElement',r=>({...r,members:[...r.members,{name:'internal',scope:'instance'}]})],
 ];
 for(const [name,fn] of mutations)assert.throws(()=>verifyInventory(changed(name,fn)),/SDK_CLASS_MEMBERS/u);
});
test('support members and declaration signature mismatch rejected',()=>{
 assert.throws(()=>verifyInventory(changed('SQLiteTransaction',r=>({...r,members:r.members.filter(m=>m.name!=='get')}))),/SDK_SUPPORT_MEMBERS/u);
 assert.throws(()=>compareDeclarations(rows,changed('CliElement',r=>({...r,signatures:['(): unknown']}))),/SDK_DECLARATION_SHAPE_MISMATCH/u);
 assert.throws(()=>compareDeclarations(rows,changed('WorkflowLimits',r=>({...r,definition:'interface WorkflowLimits {}'}))),/SDK_DECLARATION_SHAPE_MISMATCH/u);
});
test('curated references must identify actual supported members',()=>{
 verifyScenarioRefs(rows,[['control','`KernelLifecycle#[Symbol.asyncDispose]` `SQLiteTransaction#run`']]);
 assert.throws(()=>verifyScenarioRefs(rows,[['negative','API: readXml']]),/SDK_SCENARIO_ROOT/u);
 for(const ref of ['KernelLifecycle#close','VectorQueryElement.search','SQLiteDatabaseElement#cas','WorkflowElement.constructor','NativeWorkflowContext.constructor','Unknown#run']){
  assert.throws(()=>verifyScenarioRefs(rows,[['negative','`'+ref+'`']]),/SDK_SCENARIO/u);
 }
});
test('missing packaged reference, bad anchor and escape rejected',()=>{
 const dir=mkdtempSync(join(tmpdir(),'dh-skill-link-'));
 try{
  mkdirSync(join(dir,'references'));
  writeFileSync(join(dir,'references/guide.md'),'# Valid heading\n');
  const entry=join(dir,'SKILL.md');
  writeFileSync(entry,'[guide](references/guide.md#valid-heading)\n');verifyLocalLinks(dir);
  for(const ref of ['references/missing.md','references/guide.md#absent','../escape.md']){
   writeFileSync(entry,'[bad]('+ref+')\n');assert.throws(()=>verifyLocalLinks(dir),/SDK_LOCAL/u);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
