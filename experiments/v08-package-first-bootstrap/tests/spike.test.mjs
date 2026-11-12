import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {bootstrap,blobSHA,SpikeError} from '../bootstrap.mjs';
import pins from '../pins.json' with {type:'json'};
const root=fileURLToPath(new URL('../',import.meta.url));
const boot=(which='approval',more={})=>bootstrap({root,sdk:pins.sdk,business:pins[which],...more});
async function sandbox(fn){const d=await mkdtemp(join(tmpdir(),'dh-spike-'));await cp(root,d,{recursive:true});try{return await fn(d)}finally{await rm(d,{recursive:true,force:true})}}
async function editManifest(d,path,edit){const file=join(d,path,'manifest.json');const m=JSON.parse(await readFile(file,'utf8'));edit(m);const b=JSON.stringify(m,null,2)+'\n';await writeFile(file,b);return {path,digest:blobSHA(b)}}
const error=code=>e=>e?.name==='SpikeError'&&e.code===code;
test('A1: real kernel linker loads SDK and business; deterministic assembly pins',async()=>{
 const a=await boot(),b=await boot();assert.equal(a.assembly.digest,b.assembly.digest);
 assert.deepEqual(a.assembly.packages.map(p=>p.id),['kernel','sdk','approval']);
 assert.ok(a.assembly.bindings.some(b=>b.cap==='pkg.link@1'&&b.ref.startsWith('kernel@')));
 assert.ok(a.assembly.bindings.some(b=>b.cap==='business.action@1'&&b.ref.startsWith('approval@')));
});
test('A3: approval has N eligible candidates, deterministic route, scoped rule/tool',async()=>{
 const r=await boot();const out=r.dispatch({score:75});assert.equal(out.status,'COMPLETE');assert.equal(out.facts.approved,true);
 assert.deepEqual(out.decisions[0].candidates,['review','notice']);assert.deepEqual(out.decisions.map(x=>x.selected),['review','audit']);
 assert.equal(r.snapshot().revision,2);assert.equal(r.receipts().length,2);
 assert.ok(r.receipts().every(x=>x.assemblyDigest===r.assembly.digest));
});
test('A3: zero eligible WAIT and one eligible route, no arbitrary fallback',async()=>{
 const zero=await boot('learning');assert.equal(zero.dispatch({progress:-1}).status,'WAIT');assert.equal(zero.snapshot().revision,0);
 const one=await boot('learning');const r=one.dispatch({progress:30});assert.equal(r.status,'WAIT');assert.deepEqual(r.decisions[0].candidates,['lesson']);
});
test('A3: different learning business on unchanged kernel and SDK',async()=>{
 const approval=await boot('approval'),learning=await boot('learning');
 const out=learning.dispatch({progress:90});assert.equal(out.status,'COMPLETE');assert.equal(out.facts.badge,'completed');
 assert.deepEqual(approval.assembly.packages.slice(0,2),learning.assembly.packages.slice(0,2));
});
test('A1: missing kernel file and tampered trusted manifest fail before activation',async()=>sandbox(async d=>{
 await rm(join(d,'kernel','impl.mjs'));await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business:pins.approval}),error('E_IMPLEMENTATION_MISSING'));
}));
test('A2: changed manifest digest refuses pre-activation',async()=>sandbox(async d=>{
 await editManifest(d,'sdk',m=>{m.version='0.0.2'});
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business:pins.approval}),error('E_INTEGRITY'));
}));
test('A2/A6: implementation tampering refuses unless explicitly repinned',async()=>sandbox(async d=>{
 const file=join(d,'business-approval','impl.mjs');await writeFile(file,(await readFile(file,'utf8')).replace('facts.score>=70','facts.score>=90'));
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business:pins.approval}),error('E_INTEGRITY'));
}));
test('A2: duplicate provider and selection conflict fail closed',async()=>sandbox(async d=>{
 const business=await editManifest(d,'business-approval',m=>{m.components[0].provides.push({id:'rule.eval@1',operations:['test']})});
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_AMBIGUOUS_PROVIDER'));
}));
test('A2: incompatible exact dependency version',async()=>sandbox(async d=>{
 const business=await editManifest(d,'business-approval',m=>{m.dependencies[0].version='9.9.9'});
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_DEP_VERSION'));
}));
test('A2: cross-package cycle rejected before activation',async()=>sandbox(async d=>{
 const sdk=await editManifest(d,'sdk',m=>m.dependencies.push({id:'approval',version:'1.0.0'}));
 await assert.rejects(bootstrap({root:d,sdk,business:pins.approval}),error('E_CYCLE'));
}));
test('A2: absent needed capability and invalid provider pin',async()=>{
 await sandbox(async d=>{
  const sdk=await editManifest(d,'sdk',m=>{m.components[0].provides=[];delete m.selections['rule.eval@1']});
  await assert.rejects(bootstrap({root:d,sdk,business:pins.approval}),error('E_MISSING_CAPABILITY'));
 });
 await sandbox(async d=>{
  const business=await editManifest(d,'business-approval',m=>{m.selections['business.action@1']='wrong'});
  await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_BINDING'));
 });
});
test('A2: operation mismatch and malformed component envelope',async()=>{
 await sandbox(async d=>{
  const business=await editManifest(d,'business-approval',m=>{m.components[0].provides[0].operations=['probeUnauthorized']});
  await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_OPERATION'));
 });
 await sandbox(async d=>{
  const business=await editManifest(d,'business-approval',m=>{m.components[0].kind='magic'});
  await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_COMPONENT'));
 });
});
test('A4: unauthorized component invocation and admission failure do not commit',async()=>{
 const r=await boot();assert.throws(()=>r.probeUnauthorized(),error('E_SCOPE'));assert.equal(r.snapshot().revision,0);
 const denied=await boot('approval',{failCommit:true});assert.throws(()=>denied.dispatch({score:75}),error('E_ADMISSION'));
 assert.equal(denied.snapshot().revision,0);assert.deepEqual(denied.receipts(),[]);
});
test('A4: UNKNOWN and CANCELLED stop without commit and are not blindly retried',async()=>{
 for(const [action,status] of [['unknown','UNKNOWN'],['cancel','CANCELLED']])await sandbox(async d=>{
  const business=await editManifest(d,'business-approval',m=>{m.components.find(c=>c.id==='workflow').body.nodes[0].action=action});
  const r=await bootstrap({root:d,sdk:pins.sdk,business});const out=r.dispatch({score:75});
  assert.equal(out.status,status);assert.equal(r.snapshot().revision,0);assert.equal(r.receipts()[0].outcome,status);
  assert.throws(()=>r.dispatch({score:75}),error('E_EFFECT_DUPLICATE'));
 });
});
test('A5: business-only version and declared node change creates new immutable assembly',async()=>sandbox(async d=>{
 const old=await boot();const oldReceipt=old.dispatch({score:75});assert.equal(oldReceipt.facts.approved,true);
 const business=await editManifest(d,'business-approval',m=>{
  m.version='1.1.0';m.definitionId='approval.definition@2';m.components.find(c=>c.id==='workflow').body.nodes[0].when.value=80;
  m.selections['business.action@1']='approval@1.1.0/action#approval.action.impl@1';
  m.selections['business.workflow@1']='approval@1.1.0/workflow#approval.workflow.impl@1';
 });
 const newer=await bootstrap({root:d,sdk:pins.sdk,business});const changed=newer.dispatch({score:75});
 assert.notEqual(old.assembly.digest,newer.assembly.digest);assert.notEqual(changed.facts.approved,true);
 assert.equal(old.receipts()[0].assemblyDigest,old.assembly.digest);
 assert.equal(newer.receipts()[0].assemblyDigest,newer.assembly.digest);
 assert.throws(()=>old.rebind(),error('E_SEALED'));
}));
test('A6: implementation replacement (not metadata-only) changes execution',async()=>sandbox(async d=>{
 const original=await boot();assert.equal(original.dispatch({score:75}).facts.approved,true);
 const file=join(d,'business-approval','impl.mjs');const content=(await readFile(file,'utf8')).replace('facts.score>=70','facts.score>=90');
 await writeFile(file,content);
 const business=await editManifest(d,'business-approval',m=>{m.moduleDigest=blobSHA(content)});
 const changed=await bootstrap({root:d,sdk:pins.sdk,business});assert.equal(changed.dispatch({score:75}).facts.approved,false);
 assert.notEqual(changed.assembly.digest,original.assembly.digest);
}));

test('A1: kernel manifest is immutable trusted anchor',async()=>sandbox(async d=>{
 await editManifest(d,'kernel',m=>{m.version='0.0.2'});
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business:pins.approval}),error('E_INTEGRITY'));
}));
test('A5: exposed assembly graph cannot be mutated or rebound',async()=>{
 const r=await boot();const first=r.assembly.bindings[0].ref;
 assert.throws(()=>{r.assembly.bindings[0].ref='malicious'},TypeError);
 assert.equal(r.assembly.bindings[0].ref,first);
 assert.throws(()=>r.rebind(),error('E_SEALED'));
});

test('A2: derived Component Capability cycle fails before activation',async()=>sandbox(async d=>{
 const business=await editManifest(d,'business-approval',m=>{
  m.components[0].requires.push({id:'workflow.run@1',operations:['run']});
 });
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_CAPABILITY_CYCLE'));
}));

test('P1-F1: four-package declared dependency closure and real support capability consumption',async()=>sandbox(async d=>{
 const actionFile=join(d,'business-approval','impl.mjs');
 let source=await readFile(actionFile,'utf8');
 source=source.replace("case 'review':return", "case 'review':ctx.invoke('support.flag@1','read',{});return");
 assert.ok(source.includes("case 'review':ctx.invoke('support.flag@1','read',{});return"));
 await writeFile(actionFile,source);
 const business=await editManifest(d,'business-approval',m=>{
  m.moduleDigest=blobSHA(source);
  m.dependencies.push({id:'support',version:'1.0.0'});
  m.components[0].requires.push({id:'support.flag@1',operations:['read']});
 });
 const r=await bootstrap({root:d,sdk:pins.sdk,business,dependencyPins:{support:pins.support}});
 assert.deepEqual(r.assembly.packages.map(p=>p.id),['kernel','sdk','support','approval']);
 assert.ok(r.assembly.bindings.some(b=>b.cap==='support.flag@1'&&b.ref.startsWith('support@')));
 assert.equal(r.dispatch({score:75}).status,'COMPLETE');
 const repeat=await bootstrap({root:d,sdk:pins.sdk,business,dependencyPins:{support:pins.support}});
 assert.equal(repeat.assembly.digest,r.assembly.digest);
}));
test('P1-F1: missing, duplicate, unreferenced and cyclic fourth Package fail closed',async()=>sandbox(async d=>{
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business:pins.approval,dependencyPins:{support:pins.support}}),error('E_ORPHAN_PACKAGE'));
 const business=await editManifest(d,'business-approval',m=>m.dependencies.push({id:'support',version:'1.0.0'}));
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_DEP_PIN'));
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business,dependencyPins:{support:pins.sdk}}),error('E_DUPLICATE_PACKAGE'));
 const support=await editManifest(d,'support',m=>m.dependencies.push({id:'approval',version:'1.0.0'}));
 await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business,dependencyPins:{support}}),error('E_CYCLE'));
}));
test('P1-F2: workflow is admitted Semantic Component and typed binding; no top-level manifest shortcut',async()=>{
 const runtime=await boot();
 assert.ok(runtime.assembly.bindings.some(b=>b.cap==='business.workflow@1'&&b.ref.startsWith('approval@')));
 await sandbox(async d=>{
  const business=await editManifest(d,'business-approval',m=>{
   const c=m.components.find(x=>x.id==='workflow');c.kind='tool';
  });
  await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_WORKFLOW_GRAPH'));
 });
 await sandbox(async d=>{
  const business=await editManifest(d,'business-approval',m=>{delete m.components.find(x=>x.id==='workflow').body});
  await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_WORKFLOW_GRAPH'));
 });
 await sandbox(async d=>{
  const business=await editManifest(d,'business-approval',m=>{m.workflow={id:'bypass',nodes:[]}});
  await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_WORKFLOW_GRAPH'));
 });
 await sandbox(async d=>{
  const business=await editManifest(d,'business-approval',m=>{
   m.components=m.components.filter(c=>c.id!=='workflow');
   delete m.selections['business.workflow@1'];
  });
  await assert.rejects(bootstrap({root:d,sdk:pins.sdk,business}),error('E_BUSINESS_WORKFLOW'));
 });
});
test('P2-L1 diagnostic: SUCCESS state commit then receipt failure is explicitly divergent (toy only)',async()=>{
 const r=await boot('approval',{failReceipt:true});
 assert.throws(()=>r.dispatch({score:75}),error('E_EFFECT_RECORD'));
 assert.equal(r.snapshot().revision,1, 'state changed before receipt could be recorded');
 assert.deepEqual(r.receipts(),[], 'receipt absent despite state mutation');
 const duplicate=await boot();duplicate.dispatch({score:75});
 assert.equal(duplicate.snapshot().revision,2);
 assert.throws(()=>duplicate.dispatch({score:75}),error('E_EFFECT_DUPLICATE'));
 assert.equal(duplicate.snapshot().revision,3);
 assert.equal(duplicate.receipts().length,2);
});

test('P1-F2: replacing Workflow Semantic Component executable changes routing (not metadata-only)',async()=>sandbox(async d=>{
 const old=await boot();assert.equal(old.dispatch({score:75}).facts.approved,true);
 const file=join(d,'business-approval','impl.mjs');
 const original=await readFile(file,'utf8');
 const edited=original.replace('return structuredClone(ctx.definition)',
  'const flow=structuredClone(ctx.definition);flow.nodes[0].when.value=80;return flow');
 assert.notEqual(edited,original);
 await writeFile(file,edited);
 const business=await editManifest(d,'business-approval',m=>{m.moduleDigest=blobSHA(edited)});
 const r=await bootstrap({root:d,sdk:pins.sdk,business});
 assert.notEqual(r.assembly.digest,old.assembly.digest);
 assert.notEqual(r.dispatch({score:75}).facts.approved,true);
}));
