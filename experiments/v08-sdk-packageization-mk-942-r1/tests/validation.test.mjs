import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {sealB,UCError} from '../../v08-unified-component-ab/unified.mjs';
import {assemblyInputs} from '../../v08-unified-component-ab/fixtures.mjs';

// Fetch the exact unmodified #938 worktree on the real CI host.
// No new package loader, journal or source duplication is introduced here.
const root=process.env.REFERENCE_938_ROOT;
if(!root)throw new Error('REFERENCE_938_ROOT is required');
const ref=await import(pathToFileURL(join(root,'bootstrap.mjs')).href);
const pins=JSON.parse(await readFile(join(root,'pins.json'),'utf8'));
const refusal=code=>e=>e?.code===code;
const boot=(options={})=>ref.bootstrap({root,sdk:pins.sdk,business:pins.approval,...options});
async function sandbox(run) {
  const dir=await mkdtemp(join(tmpdir(),'sdk-mk942-'));
  await cp(root,dir,{recursive:true});
  try {return await run(dir);} finally {await rm(dir,{recursive:true,force:true});}
}
async function editManifest(dir,p,change){
  const file=join(dir,p,'manifest.json');
  const manifest=JSON.parse(await readFile(file,'utf8'));
  change(manifest);
  const data=JSON.stringify(manifest,null,2)+'\n';
  await writeFile(file,data);
  return {path:p,digest:ref.blobSHA(data)};
}

test('KPK-02: remove exact SDK Package => bootstrap refuses before any dispatch/effect',async()=>{
  await sandbox(async d=>{
    await rm(join(d,'sdk','manifest.json'));
    await assert.rejects(ref.bootstrap({root:d,sdk:pins.sdk,business:pins.approval}),refusal('E_PACKAGE_MISSING'));
  });
});
test('KPK-02: remove required Rule provider => missing capability, not a kernel fallback',async()=>{
  await sandbox(async d=>{
    const sdk=await editManifest(d,'sdk',m=>{
      m.components=m.components.filter(c=>c.id!=='rule');
      delete m.selections['rule.eval@1'];
    });
    await assert.rejects(ref.bootstrap({root:d,sdk,business:pins.approval}),refusal('E_MISSING_CAPABILITY'));
  });
});
test('KPK-03: replace actual SDK Rule module and exact pin; sealed old runtime does not drift',async()=>{
  await sandbox(async d=>{
    const old=await boot();
    const oldResult=old.dispatch({score:50});
    assert.equal(oldResult.decisions[0].selected,'review');
    const f=join(d,'sdk','impl.mjs');
    const prev=await readFile(f,'utf8');
    assert.ok(prev.includes('x>=when.value'));
    const next=prev.replace('x>=when.value','x>when.value');
    await writeFile(f,next);
    const sdk=await editManifest(d,'sdk',m=>m.moduleDigest=ref.blobSHA(next));
    const newer=await ref.bootstrap({root:d,sdk,business:pins.approval});
    const changed=newer.dispatch({score:50});
    assert.equal(changed.decisions[0].selected,'notice');
    assert.notEqual(newer.assembly.digest,old.assembly.digest);
    assert.equal(old.assembly.packages.find(x=>x.id==='sdk').digest,pins.sdk.digest);
    assert.equal(oldResult.decisions[0].selected,'review');
    assert.notEqual(newer.assembly.packages.find(x=>x.id==='sdk').digest,pins.sdk.digest);
  });
});
test('KPK-04: diamond dependencies on same package linker preserve exact deterministic closure',async()=>{
  await sandbox(async d=>{
    const business=await editManifest(d,'business-approval',m=>{
      m.dependencies.push({id:'support',version:'1.0.0'});
    });
    const opts={root:d,sdk:pins.sdk,business,dependencyPins:{support:pins.support}};
    const a=await ref.bootstrap(opts),b=await ref.bootstrap(opts);
    assert.deepEqual(a.assembly.packages.map(x=>x.id),['kernel','sdk','support','approval']);
    assert.equal(a.assembly.digest,b.assembly.digest);
    assert.equal(a.assembly.packages.filter(p=>p.id==='sdk').length,1);
  });
});
test('KPK-05: independent Support Package changes to novel Semantic Kind and its provider is executed',async()=>{
  await sandbox(async d=>{
    const support=await editManifest(d,'support',m=>{
      m.components[0].kind='semantic';
      m.components[0].kindRef='custom.feature-gate@1';
    });
    const actionFile=join(d,'business-approval','impl.mjs');
    const old=await readFile(actionFile,'utf8');
    const marker="case 'review':return";
    assert.ok(old.includes(marker));
    const updated=old.replace(marker,"case 'review':ctx.invoke('support.flag@1','read',{});return");
    await writeFile(actionFile,updated);
    const business=await editManifest(d,'business-approval',m=>{
      m.moduleDigest=ref.blobSHA(updated);
      m.dependencies.push({id:'support',version:'1.0.0'});
      m.components.find(c=>c.id==='action').requires.push({id:'support.flag@1',operations:['read']});
    });
    const r=await ref.bootstrap({root:d,sdk:pins.sdk,business,dependencyPins:{support}});
    assert.ok(r.assembly.bindings.some(x=>x.cap==='support.flag@1'&&x.ref.startsWith('support@')));
    assert.equal(r.dispatch({score:75}).status,'COMPLETE');
    assert.notEqual(r.assembly.digest,(await boot()).assembly.digest);
  });
});
test('KPK-05: undeclared new Kind provider or wrong capability version fails closed',async()=>{
  const r=await boot(),data=assemblyInputs(r.assembly.packages,'approval');
  data.components.push({
    schemaVersion:'ucb/1',componentId:'extra',packageId:'addon',
    kindRef:{kindId:'custom.new-kind',version:'1.0.0'},semanticBody:{meaning:'metric'},
    requiredSemanticContracts:[],requiresCapabilities:[],providesCapabilities:[{
      capabilityId:'custom.metric',version:'1.0.0',operations:['calculate']
    }],relations:[],operations:[{
      operationId:'calculate',inputSchema:{required:{n:'number'}},
      outputSchema:{required:{square:'number'}},failures:[],effect:'none'
    }]
  });
  data.packages=[...data.packages,{id:'addon',version:'1.0.0',digest:'test-pin-111'}];
  data.entryCapabilities.push('custom.metric@1.0.0');
  assert.throws(()=>sealB(data),refusal('E_MISSING_IMPLEMENTATION'));
  data.implementations.push({componentId:'extra',kindRef:{kindId:'custom.new-kind',version:'1.0.0'},
    implementationId:'addon.impl',implementationVersion:'1.0.0',
    implementationDigest:'addon-test-implementation',handlers:{calculate:(_,{n})=>({square:n*n})}});
  const runtime=sealB(data);
  assert.deepEqual(runtime.invoke('custom.metric@1.0.0','calculate',{n:3}),{square:9});
  assert.throws(()=>runtime.invoke('custom.metric@2.0.0','calculate',{n:3}),refusal('E_MISSING_PROVIDER'));
  // B graph test, NOT evidence that addon code was actually loaded from the package.
});
test('FALSIFIER: B accepts forged Package digest without checking module/manifest integrity',async()=>{
  const r=await boot(),inputs=assemblyInputs(r.assembly.packages,'approval');
  const altered={...inputs,packages:inputs.packages.map(p=>({...p,digest:'forged-package-id'}))};
  const baseline=sealB(inputs),forged=sealB(altered);
  assert.notEqual(baseline.assembly.digest,forged.assembly.digest);
  assert.equal(forged.invoke('workflow.run@1.0.0','run',{value:75,candidates:['yes']}).status,'COMPLETE');
  // Passing this test establishes a real design GAP, not a production PASS.
});
test('FALSIFIER: B trusts caller implementationDigest even if handler behavior changes',async()=>{
  const r=await boot(),inputs=assemblyInputs(r.assembly.packages,'approval');
  const original=sealB(inputs);
  const alternate=inputs.implementations.map(b=>b.componentId==='decision'
    ? {...b,handlers:{choose:()=>({status:'WAIT',selected:'',candidates:[]})}}:b);
  const changed=sealB({...inputs,implementations:alternate});
  const input={value:75,candidates:['yes']};
  assert.equal(original.invoke('workflow.run@1.0.0','run',input).status,'COMPLETE');
  assert.equal(changed.invoke('workflow.run@1.0.0','run',input).status,'WAIT');
  assert.equal(original.assembly.digest,changed.assembly.digest);
  // Indicates package->module->implementation pin verification is NOT supplied by sealB.
});
test('FALSIFIER: B effectAuthority port is injected without production occurrence/admission proof',async()=>{
  const r=await boot(),inputs=assemblyInputs(r.assembly.packages,'approval');
  let effects=0;
  const runtime=sealB({...inputs,effectAuthority:{invoke:({perform})=>{
    effects++;return perform();
  }}});
  assert.deepEqual(runtime.invoke('business.notify@1.0.0','send',{message:'hi'}),{accepted:true});
  assert.equal(effects,1);
  // This is a toy authority-port boundary witness, NOT a v0.7 bypass claim.
});
test('FALSIFIER: reference kernel explicitly branches on business.workflow and business.action',async()=>{
  const src=await readFile(join(root,'kernel','impl.mjs'),'utf8');
  assert.ok(src.includes("bindings.get('business.workflow@1')"));
  assert.ok(src.includes("bindings.get('business.action@1')"));
  assert.ok(src.includes("wfProvider.component"));
  // These are concrete Standard/Business semantic assumptions inside the toy Kernel.
});
