import test from 'node:test';
import assert from 'node:assert/strict';
import {sealB} from '../../v08-unified-component-ab/unified.mjs';
import {assemblyInputs} from '../../v08-unified-component-ab/fixtures.mjs';

const forgedInputs=()=>assemblyInputs([
 {id:'sdk',version:'1.0.0',digest:'sha256:not-verified-from-bytes'},
 {id:'approval',version:'1.0.0',digest:'sha256:untrusted-claim'}
],'approval');

// IMPORTANT: Green here = established violation witness, NOT conformance PASS.
test('EXPECTED_GAP_REPRODUCED P1-F1: sealed identity retains mutable live handler behavior',()=>{
 const source=forgedInputs(),engine=sealB(source),pinned=engine.assembly.digest;
 const before=engine.invoke('workflow.run@1.0.0','run',{value:90,candidates:['review']});
 assert.equal(before.status,'COMPLETE');
 source.implementations.find(x=>x.componentId==='rule').handlers.test=()=>({eligible:false});
 const after=engine.invoke('workflow.run@1.0.0','run',{value:90,candidates:['review']});
 assert.equal(after.status,'WAIT');
 assert.equal(engine.assembly.digest,pinned);
});
test('EXPECTED_GAP_REPRODUCED P1-F2: caller-forged package identity accepted without bytes/exports',()=>{
 const source=forgedInputs();
 const engine=sealB(source);
 assert.equal(engine.invoke('workflow.run@1.0.0','run',{value:90,candidates:['a']}).status,'COMPLETE');
 assert.equal(engine.assembly.packages[0].digest,'sha256:untrusted-claim');
 assert.ok(source.components.find(x=>x.componentId==='rule').relations.some(x=>x.targetComponentId==='schema'));
 assert.ok(source.packages.every(x=>!Object.hasOwn(x,'exports')&&!Object.hasOwn(x,'imports')));
});
test('EXPECTED_GAP_REPRODUCED P1-F3: unknown must-understand semantic contract accepted',()=>{
 const source=forgedInputs(),c=source.components.find(x=>x.componentId==='rule');
 c.requiredSemanticContracts=[{contractId:'unknown.security-critical',version:'99.0.0'}];
 const engine=sealB(source);
 assert.ok(engine.assembly.definitionDigest);
 assert.equal(engine.invoke('workflow.run@1.0.0','run',{value:90,candidates:['a']}).status,'COMPLETE');
});
test('EXPECTED_GAP_REPRODUCED P1-F3b: unknown pure Kind admitted without understood implementation',()=>{
 const source=forgedInputs();
 const c=source.components.find(x=>x.componentId==='schema');
 c.kindRef={kindId:'unknown.behavioral',version:'1.0.0'};
 source.implementations.find(x=>x.componentId==='schema').kindRef={...c.kindRef};
 const engine=sealB(source);
 assert.equal(engine.inspect('schema').kindRef.kindId,'unknown.behavioral');
});
test('EXPECTED_GAP_REPRODUCED KPK/MK effectAuthority port is caller-injectable in toy candidate',()=>{
 const source=forgedInputs();
 let n=0;
 const engine=sealB({...source,effectAuthority:{invoke:({perform})=>{n++;return perform();}}});
 assert.deepEqual(engine.invoke('business.notify@1.0.0','send',{message:'x'}),{accepted:true});
 assert.equal(n,1);
 // Does NOT assert production v0.7 has this bug.
});
