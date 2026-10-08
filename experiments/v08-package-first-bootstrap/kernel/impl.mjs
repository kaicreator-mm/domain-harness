import { SpikeError } from '../bootstrap.mjs';
const fail=(code,msg)=>{throw new SpikeError(code,msg||code)};
const cp=x=>structuredClone(x);
const deepFreeze=x=>{if(x&&typeof x==='object'&&!Object.isFrozen(x)){for(const v of Object.values(x))deepFreeze(v);Object.freeze(x)}return x};
const ref=(p,c)=>p.id+'@'+p.version+'/'+c.id+'#'+c.implementation;
export const implementations={
 'kernel.link.impl@1':seed=>{
  const staged=[];let sealed=false;
  function check(p){
   const m=p.manifest;
   if(!m||!/^[a-z][a-z0-9-]*$/.test(m.id)||!/^\d+\.\d+\.\d+$/.test(m.version)||typeof m.definitionId!=='string'||!Array.isArray(m.dependencies)||!Array.isArray(m.components)||!m.components.length||!m.selections||typeof m.selections!=='object')fail('E_MANIFEST');
   if(staged.some(x=>x.manifest.id===m.id))fail('E_DUPLICATE_PACKAGE');
   const ids=new Set();
   for(const c of m.components){
    if(!c||ids.has(c.id)||!['semantic','tool'].includes(c.kind)||typeof c.implementation!=='string'||!Array.isArray(c.provides)||!Array.isArray(c.requires))fail('E_COMPONENT');
    ids.add(c.id);
    for(const cap of [...c.provides,...c.requires])if(!cap||!/^[a-z][a-z0-9.]*@\d+$/.test(cap.id)||!Array.isArray(cap.operations)||!cap.operations.length||cap.operations.some(op=>!/^[a-zA-Z]+$/.test(op)))fail('E_CONTRACT');
   }
   for(const d of m.dependencies)if(!d||typeof d.id!=='string'||!/^\d+\.\d+\.\d+$/.test(d.version))fail('E_DEPENDENCY');
  }
  function stage(p){if(sealed)fail('E_SEALED');check(p);staged.push(p)}
  return {
   stageKernel(p){if(staged.length||p.manifest.id!=='kernel')fail('E_BOOT');stage(p)},
   async link(sel){const p=await seed.readExact(sel);stage(p);return {id:p.manifest.id,digest:p.digest}},
   async seal(){
    if(sealed)fail('E_SEALED');
    if(staged.length!==3||staged[0].manifest.id!=='kernel'||staged[1].manifest.id!=='sdk')fail('E_LAYERS');
    const packages=new Map(staged.map(p=>[p.manifest.id,p]));const graph=new Map();
    for(const p of staged){graph.set(p.manifest.id,p.manifest.dependencies.map(d=>d.id));for(const d of p.manifest.dependencies){const target=packages.get(d.id);if(!target||target.manifest.version!==d.version)fail('E_DEP_VERSION')}}
    const busy=new Set(),done=new Set();
    function visit(id){if(busy.has(id))fail('E_CYCLE');if(done.has(id))return;busy.add(id);for(const d of graph.get(id)||[])visit(d);busy.delete(id);done.add(id)}
    for(const id of graph.keys())visit(id);
    const bindings=new Map(),selections=new Map();
    for(const p of staged){
     for(const c of p.manifest.components)for(const cap of c.provides){if(bindings.has(cap.id))fail('E_AMBIGUOUS_PROVIDER');bindings.set(cap.id,{pkg:p,component:c,ops:cap.operations,ref:ref(p.manifest,c)})}
     for(const [cap,provider] of Object.entries(p.manifest.selections)){if(selections.has(cap))fail('E_SELECTION_DUPLICATE');selections.set(cap,provider)}
    }
    if(selections.size!==bindings.size)fail('E_BINDING');
    for(const [cap,b] of bindings)if(selections.get(cap)!==b.ref)fail('E_BINDING');
    for(const p of staged)for(const c of p.manifest.components)for(const req of c.requires){const b=bindings.get(req.id);if(!b)fail('E_MISSING_CAPABILITY',req.id);if(req.operations.some(op=>!b.ops.includes(op)))fail('E_OPERATION')}
    // The derived requires/provides graph is also acyclic (package DAG alone is insufficient).
    const capEdges=new Map([...bindings].map(([cap,b])=>[cap,b.component.requires.map(req=>req.id)]));
    const visitingCaps=new Set(),resolvedCaps=new Set();
    function visitCap(cap){
      if(visitingCaps.has(cap))fail('E_CAPABILITY_CYCLE',cap);
      if(resolvedCaps.has(cap))return;
      visitingCaps.add(cap);
      for(const dep of capEdges.get(cap)||[])visitCap(dep);
      visitingCaps.delete(cap);resolvedCaps.add(cap);
    }
    for(const cap of capEdges.keys())visitCap(cap);
    const ordered=[...bindings.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const identity={packages:staged.map(p=>({id:p.manifest.id,version:p.manifest.version,definition:p.manifest.definitionId,digest:p.digest,module:p.manifest.moduleDigest})),bindings:ordered.map(([cap,b])=>({cap,ref:b.ref,operations:[...b.ops].sort()}))};
    const assembly=deepFreeze({...cp(identity),digest:seed.sha256(JSON.stringify(identity))});
    const modules=new Map();for(const p of staged)modules.set(p.manifest.id,await seed.loadModule(p));
    for(const [,b] of ordered)if(typeof modules.get(b.pkg.manifest.id).implementations?.[b.component.implementation]!=='function')fail('E_IMPLEMENTATION');
    const wf=cp(staged[2].manifest.workflow);
    if(!wf||!Array.isArray(wf.nodes)||!wf.nodes.length||!wf.endWhen||wf.nodes.some(n=>!n.when||typeof n.action!=='string'||!Number.isInteger(n.priority)))fail('E_WORKFLOW');
    sealed=true;
    return Object.freeze({assembly,activate({failCommit=false}={}){
     const store={revision:0,facts:{},effects:[],failCommit};const bound=new Map();
     for(const [cap,b] of ordered){
      const scope=Object.freeze({
       ...(b.pkg.manifest.id==='kernel'&&b.component.id!=='loader'?{store}:{}),
       invoke(target,operation,args){
        if(!b.component.requires.some(r=>r.id===target&&r.operations.includes(operation)))fail('E_SCOPE');
        const called=bound.get(target);if(!called||!called.ops.includes(operation))fail('E_OPERATION');
        return called.instance[operation](cp(args));
       }
      });
      const obj=b.component.id==='loader'?null:modules.get(b.pkg.manifest.id).implementations[b.component.implementation](scope);
      if(b.component.id!=='loader'&&b.ops.some(op=>typeof obj?.[op]!=='function'))fail('E_OPERATION');
      bound.set(cap,{instance:obj,ops:b.ops,ref:b.ref});
     }
     const workflow=bound.get('workflow.run@1')?.instance,state=bound.get('state.commit@1')?.instance,effect=bound.get('effect.record@1')?.instance,action=bound.get('business.action@1')?.instance;
     if(!workflow||!state||!effect||!action)fail('E_MISSING_CAPABILITY');
     return Object.freeze({assembly,dispatch(input={}){return workflow.run({workflow:cp(wf),input:cp(input),assemblyDigest:assembly.digest})},snapshot(){return state.read()},receipts(){return effect.list()},probeUnauthorized(){return action.probeUnauthorized()},rebind(){fail('E_SEALED')}});
    }});
   }
  };
 },
 'kernel.state.impl@1':ctx=>({read(){return {revision:ctx.store.revision,facts:cp(ctx.store.facts)}},commit({expectedRevision,facts}){if(ctx.store.failCommit||expectedRevision!==ctx.store.revision||!facts||typeof facts!=='object')fail('E_ADMISSION');ctx.store.facts={...ctx.store.facts,...cp(facts)};ctx.store.revision++;return this.read()}}),
 'kernel.effect.impl@1':ctx=>({record({key,outcome,assemblyDigest}){if(ctx.store.effects.some(r=>r.key===key))fail('E_EFFECT_DUPLICATE');if(!['SUCCESS','UNKNOWN','CANCELLED','FAILED'].includes(outcome))fail('E_EFFECT_OUTCOME');const r={key,outcome,assemblyDigest,seq:ctx.store.effects.length+1};ctx.store.effects.push(r);return cp(r)},list(){return cp(ctx.store.effects)}})
};
