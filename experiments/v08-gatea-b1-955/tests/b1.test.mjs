
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createFixture} from './fixtures.mjs';
import {establishTrustedB1Host,admitGraphVector} from '../bridge/attested-binding.mjs';
const seal=(f,extra={})=>establishTrustedB1Host({root:f.root,approvedPins:f.pins}).seal(extra);
const mustReject=async (options,code)=> {
  const f=await createFixture(options);
  await assert.rejects(()=>seal(f,{four:!!options.four}),e=>e?.code===code,'expected typed refusal '+code);
};
test('B1 verified 3-package real #940 linker + actual selected B Rule and pure Schema',async()=>{
  const f=await createFixture();const s=await seal(f);
  assert.match(s.assembly.digest,/^sha256:[0-9a-f]{64}$/);
  assert.match(s.assembly.graphDigest,/^sha256:[0-9a-f]{64}$/);
  assert.equal(s.invokeRule({score:70}),true);
  assert.equal(s.invokeRule({score:69}),false);
  assert.throws(()=>s.invokeSchema(),{code:'E_OPERATION_NOT_DECLARED'});
  assert.throws(()=>s.rebind(),{code:'E_SEALED'});
});
test('B1 verified 4-package closure/linker, ordered dependency, closed-world Rule',async()=>{
  const f=await createFixture({four:true});const s=await seal(f,{four:true});
  assert.equal(s.invokeRule({score:95}),true);
  assert.equal(s.invokeRule({score:0}),false);
});
test('F2 wrong verified Module bytes are refused before B Rule module import',async()=>{
  const f=await createFixture();const p=join(f.root,'sdk','impl.mjs');
  await writeFile(p,(await readFile(p,'utf8'))+'\n// hostile substitute\n');
  await assert.rejects(()=>seal(f),e=>e?.code==='E_MODULE_BYTES');
});
test('F2 caller cannot forge selected Package digest after Host trust establishment',async()=>{
  const f=await createFixture();
  const host=establishTrustedB1Host({root:f.root,approvedPins:f.pins});
  f.pins.sdk.digest='0'.repeat(40); // mutate caller object, NOT original Host snapshot
  await assert.rejects(()=>host.seal({sdk:{path:'sdk',digest:'0'.repeat(40)}}),
    e=>e?.code==='E_UNTRUSTED_SELECTION');
  const s=await host.seal();assert.equal(s.invokeRule({score:80}),true);
});
test('F2 physical Manifest byte substitution detected, not merely candidate digest',async()=>{
  const f=await createFixture();const p=join(f.root,'business-approval','manifest.json');
  await writeFile(p,(await readFile(p,'utf8')).replace('"approval-schema"','"approval-forged"'));
  await assert.rejects(()=>seal(f),e=>e?.code==='E_HOST_PIN');
});
test('F2 cross-Package undeclared import typed fail closed',async()=>mustReject({invalidImport:true},'E_UNDECLARED_IMPORT'));
test('F2 wrong exact dependency version typed fail closed',async()=>mustReject({wrongDependencyVersion:true},'E_DEPENDENCY_PIN'));
test('F2 duplicate provider N rejects without explicit approved selection',async()=>mustReject({duplicateProvider:true},'E_AMBIGUOUS_PROVIDER'));
test('F2 missing selected provider fails before invocation',async()=>mustReject({missingProvider:true},'E_RELATION_TARGET'));
test('F3 uninstalled behavior Kind fails v0.7 compatibility',async()=>mustReject({unknownKind:true},'KIND_NOT_SUPPORTED'));
test('F3 no range fallback for incompatible materially required Kind version',async()=>mustReject({wrongKindVersion:true},'KIND_VERSION_NOT_SUPPORTED'));
test('F3 unknown materially required semantic contract rejects before seal',async()=>mustReject({unknownSemantic:true},'UNKNOWN_SEMANTIC_CONTRACT'));
test('F3 installed executable Kind requires approved physical KindImplementation',async()=>mustReject({wrongKindImplementation:true},'E_KIND_IMPLEMENTATION'));
test('F3 installed Kind rejects wrong semanticBody shape',async()=>mustReject({invalidBody:true},'E_KIND_SEMANTIC_BODY'));
test('F3 runtime typed rule input denial',async()=>{
  const f=await createFixture();const s=await seal(f);
  assert.throws(()=>s.invokeRule({score:'70'}),{code:'E_RULE_INPUT'});
  assert.throws(()=>s.invokeRule({score:Number.NaN}),{code:'E_NONCANONICAL_JSON'});
});
test('F1 post-seal caller pin and module file reassignment cannot replace captured executable',async()=>{
  const f=await createFixture();const host=establishTrustedB1Host({root:f.root,approvedPins:f.pins});const s=await host.seal();const d=s.assembly.digest;
  f.pins.sdk.digest='0'.repeat(40);
  const p=join(f.root,'sdk','impl.mjs');
  await writeFile(p,'globalThis.__unexpected=1; export const implementations={};');
  assert.equal(s.invokeRule({score:75}),true);
  assert.equal(s.invokeRule({score:0}),false);
  assert.equal(s.assembly.digest,d);
  assert.equal(Object.isFrozen(s.assembly),true);
  await assert.rejects(()=>host.seal(),e=>e?.code==='E_MODULE_BYTES');
});
test('F1 repeated sealed Rule invocation preserves selected original semantics',async()=>{
  const f=await createFixture();const s=await seal(f);
  for(let i=0;i<5;i++){assert.equal(s.invokeRule({score:70}),true);assert.equal(s.invokeRule({score:69}),false)}
});
test('P2-R4-01 top-level graph entry vector getters never invoked',()=>{
  const e=[];let called=0;
  Object.defineProperty(e,'0',{enumerable:true,configurable:true,get(){called++;return {manifest:{}}}});
  assert.throws(()=>admitGraphVector(e),{code:'E_RECORD_SAFETY'});
  assert.equal(called,0);
});
test('P2-R4-01 forged graph-entry non-index/hidden key refused before iteration',()=>{
  const e=[{manifest:{},artifacts:{}}];Object.defineProperty(e,'extra',{value:true,enumerable:false});
  assert.throws(()=>admitGraphVector(e),{code:'E_RECORD_SAFETY'});
});
test('B1 out-of-scope authority: no effect port/secret/host capability exposed',async()=>{
  const f=await createFixture();const s=await seal(f);
  assert.equal(Object.hasOwn(s,'effectAuthority'),false);
  assert.equal(Object.hasOwn(s,'dispatch'),false);
  assert.equal(Object.hasOwn(s,'invokeEffect'),false);
});
