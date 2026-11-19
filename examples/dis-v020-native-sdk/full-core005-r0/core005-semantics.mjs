/**
 * CORE-005 (DIS 0.2.0) R211 lane C5 engineering layer: executable semantic
 * constraints, collaboration semantics and the static-dependency vs
 * semantic-relation distinction over the REAL AOT selected element set
 * (orders / tally / runx / xdownload original sources via native-fixture).
 *
 * Honest scope: this module is structural/engineering evidence only. It
 * never mints qualification, SAP, Effect, Experience or Release, never
 * registers a semantic Oracle, and never promotes a matrix row. The SAP
 * gate below is deliberately fail-closed: until a genuinely qualified
 * independent semantic Oracle exists (formal original qualification is
 * blocked upstream in kaicreator-mm/domain-intelligence-engineering#155),
 * every SAP obligation evaluates to explicit BLOCKED/UNKNOWN, never a pass.
 *
 * Static Element dependency subgraph (AOT resolution input) must be
 * acyclic; semantic relations may legally form cycles; neither graph is a
 * runtime data-flow authorization.
 */

/** Typed lane error. `code` is stable; `detail` carries the violated
 * invariant id or the exact fail-closed reason. Never contains a pass. */
export class Core005Error extends Error{
 constructor(code,detail){
  super(code);
  this.name='Core005Error';
  this.code=code;
  this.detail=Object.freeze(detail??{});
 }
}

const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&
 Object.getPrototypeOf(x)===Object.prototype;
const nonEmptyString=x=>typeof x==='string'&&x.length>0;
const SEMVER=/^[1-9][0-9]*\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/;
const HEX64=/^[a-f0-9]{64}$/;
const GIT40=/^[a-f0-9]{40}$/;
const fail=(code,detail)=>{throw new Core005Error(code,detail)};

// ---------------------------------------------------------------------------
// 1. Static Element dependency subgraph (must be acyclic — AOT resolution input)
// ---------------------------------------------------------------------------

/** Extract the static Element dependency subgraph from a *qualified* DIS
 * v0.2 artifact (qualifyDisV020Artifact output) and validate acyclicity
 * with an independent topological check (edge from = consumer Element,
 * edge to = declared dependency Element). */
export function extractCore005StaticSubgraph(qualified){
 if(!plain(qualified)||!(qualified.elements instanceof Map))
  fail('CORE005_STATIC_SUBGRAPH_INPUT_INVALID');
 const nodes=[...qualified.elements.keys()].sort();
 const edges=[];
 for(const [id,element] of qualified.elements){
  for(const dep of element.dependsOn)edges.push({from:id,to:dep});
 }
 edges.sort((a,b)=>a.from===b.from?a.to.localeCompare(b.to):a.from.localeCompare(b.from));
 const adjacency=new Map(nodes.map(n=>[n,[]]));
 for(const e of edges)adjacency.get(e.from).push(e.to);
 // Kahn topological order: dependencies must precede their consumers.
 // inDegree counts each element's pending dependencies; `consumers` is the
 // reverse map used to release a consumer once its dependency is placed.
 const inDegree=new Map(nodes.map(n=>[n,0]));
 const consumers=new Map(nodes.map(n=>[n,[]]));
 for(const e of edges){
  inDegree.set(e.from,inDegree.get(e.from)+1);
  consumers.get(e.to).push(e.from);
 }
 const ready=nodes.filter(n=>inDegree.get(n)===0);
 const order=[];
 while(ready.length){
  const node=ready.shift();
  order.push(node);
  for(const consumer of consumers.get(node)){
   inDegree.set(consumer,inDegree.get(consumer)-1);
   if(inDegree.get(consumer)===0)ready.push(consumer);
  }
 }
 let cycle=null;
 if(order.length!==nodes.length){
  // Deterministic DFS to report one concrete cycle path for the refusal.
  const state=new Map(nodes.map(n=>[n,0]));
  const path=[];
  const visit=node=>{
   state.set(node,1);
   path.push(node);
   for(const next of adjacency.get(node)){
    if(state.get(next)===1){
     cycle=path.slice(path.indexOf(next)).concat(next);
     return true;
    }
    if(state.get(next)===0&&visit(next))return true;
   }
   path.pop();
   state.set(node,2);
   return false;
  };
  for(const node of nodes)if(state.get(node)===0&&visit(node))break;
 }
 return Object.freeze({
  nodes:Object.freeze(nodes),edges:Object.freeze(edges),
  staticEdges:edges.length,acyclic:cycle===null,
  order:Object.freeze(order),cycle:cycle?Object.freeze(cycle):null
 });
}

// ---------------------------------------------------------------------------
// 2. Semantic relation graph (cycles are LEGAL metadata here)
// ---------------------------------------------------------------------------

/** Analyze the semantic relation graph of a DIS program. Unlike the static
 * subgraph, cycles in this graph are legal collaboration metadata and are
 * reported, not refused. This function never inspects dependsOn and never
 * grants runtime data-flow authority. */
export function analyzeCore005SemanticRelations(programRelations){
 if(!Array.isArray(programRelations))fail('CORE005_RELATION_INPUT_INVALID');
 const edges=programRelations.map(r=>({from:r.from,to:r.to,kind:r.kind}));
 const nodes=[...new Set(edges.flatMap(e=>[e.from,e.to]))].sort();
 // Cycle detection is topological: parallel relations of different kinds
 // between the same ordered pair (e.g. depends-on and constrains) collapse
 // to one graph edge, so a pair is never counted twice.
 const topology=new Map(nodes.map(n=>[n,new Set()]));
 for(const e of edges)topology.get(e.from).add(e.to);
 const adjacency=new Map([...topology].map(([n,targets])=>
  [n,[...targets].sort()]));
 const state=new Map(nodes.map(n=>[n,0]));
 const path=[];
 const cycles=[];
 const visit=node=>{
  state.set(node,1);
  path.push(node);
  for(const next of adjacency.get(node)){
   if(state.get(next)===1)
    cycles.push(path.slice(path.indexOf(next)).concat(next));
   else if(state.get(next)===0)visit(next);
  }
  path.pop();
  state.set(node,2);
 };
 for(const node of nodes)if(state.get(node)===0)visit(node);
 return Object.freeze({
  relations:programRelations.length,edges:Object.freeze(edges),
  nodes:Object.freeze(nodes),cycles:Object.freeze(cycles.map(c=>Object.freeze(c))),
  cyclic:cycles.length>0
 });
}

// ---------------------------------------------------------------------------
// 3. Executable invariants over the real selected elements
// ---------------------------------------------------------------------------

export const CORE005_INVARIANTS=Object.freeze({
 'CORE005-INV-STATIC-ACYCLIC':Object.freeze({
  id:'CORE005-INV-STATIC-ACYCLIC',
  description:'the static Element dependency subgraph used for AOT resolution must be acyclic',
  check({qualified}){
   const sub=extractCore005StaticSubgraph(qualified);
   if(!sub.acyclic)
    fail('CORE005_INVARIANT_VIOLATION',{invariantId:this.id,
     violatedBy:`static dependency cycle ${sub.cycle.join(' -> ')}`});
   return {invariantId:this.id,satisfied:true,
    detail:{elements:sub.nodes.length,staticEdges:sub.staticEdges}};
  }
 }),
 'CORE005-INV-RELATION-MIRROR':Object.freeze({
  id:'CORE005-INV-RELATION-MIRROR',
  description:'every declared depends-on semantic relation must mirror a sealed static dependsOn edge',
  check({program,qualified}){
   let mirrored=0;
   for(const relation of program.relations){
    if(relation.kind!=='depends-on')continue;
    const target=qualified.elements.get(relation.to);
    if(!target||!target.dependsOn.includes(relation.from))
     fail('CORE005_INVARIANT_VIOLATION',{invariantId:this.id,
      violatedBy:`relation ${relation.from} -${relation.kind}-> ${relation.to} has no sealed static edge`});
    mirrored++;
   }
   return {invariantId:this.id,satisfied:true,detail:{mirroredDependsOn:mirrored}};
  }
 }),
 'CORE005-INV-VERIFIER-BINDING':Object.freeze({
  id:'CORE005-INV-VERIFIER-BINDING',
  description:'every contract-backed constrains relation resolves to a real selected local rule/knowledge verifier Function pinned to the relation source, stays authority NONE and is never marked business-verified',
  check({qualified}){
   const rows=[];
   for(const row of qualified.semanticRelations){
    const pin=qualified.pins.get(row.sourceId);
    const consumers=qualified.sourceConsumers.get(row.sourceId)??[];
    if(row.authority!=='NONE'||row.verifiedBusinessSemantics!==false||
       !pin||pin.sha256!==row.sourceSha256||consumers.length===0)
     fail('CORE005_INVARIANT_VIOLATION',{invariantId:this.id,
      violatedBy:`relation ${row.id} is not a source-linked non-authoritative verifier binding`});
    rows.push({id:row.id,verifierFunctionId:row.verifierFunctionId,
     sourceId:row.sourceId,consumedBy:consumers});
   }
   return {invariantId:this.id,satisfied:true,detail:{rows}};
  }
 })
});

/** Evaluate every executable invariant against the real qualified artifact.
 * Throws Core005Error('CORE005_INVARIANT_VIOLATION') naming the violated
 * invariant; otherwise returns the per-invariant satisfied evidence. */
export function evaluateCore005Constraints({program,qualified}){
 const results=[];
 for(const invariant of Object.values(CORE005_INVARIANTS))
  results.push(Object.freeze(invariant.check({program,qualified})));
 return Object.freeze({satisfied:true,results:Object.freeze(results)});
}

// ---------------------------------------------------------------------------
// 4. Collaboration semantics (>=2 selected Elements in one orchestrated call)
// ---------------------------------------------------------------------------

const COLLAB_PLAN=Object.freeze([
 Object.freeze({functionId:'xdownload.describePolicy',step:'policy-observe'}),
 Object.freeze({functionId:'xdownload.interaction.inspect',step:'goal-inspect'}),
 Object.freeze({functionId:'xdownload.interaction.confirm',step:'goal-confirm'})
]);
const COLLAB_FUNCTIONS=new Set(COLLAB_PLAN.map(s=>s.functionId));

function collaborationStepRecord(functionId,envelope){
 return Object.freeze({
  functionId,kind:envelope.kind,authority:envelope.authority,
  // raw outcome status and the typed SDK disposition are both evidence:
  // e.g. READY_FOR_KDP maps to disposition PENDING_AUTHORIZATION.
  status:plain(envelope.value)?(envelope.value.status??null):null,
  disposition:envelope.disposition??null,
  effectDispatched:envelope.value?.effectDispatched===true
 });
}

/** Enforce the runtime collaboration invariants on one step envelope.
 * Violations are named rejections, never downgrades. */
function enforceCollaborationInvariants(functionId,envelope,checkpoint){
 if(envelope.kind!=='OBSERVATION'||envelope.authority!=='NONE'||
    Object.hasOwn(envelope,'executionPermit'))
  fail('CORE005_INVARIANT_VIOLATION',{invariantId:'CORE005-INV-COLLAB-NO-EFFECT',
   violatedBy:`step ${functionId} returned ${envelope.kind}/${envelope.authority}`});
 const value=envelope.value;
 if(!plain(value)||value.effectDispatched===true||value.permittedEffect===true)
  fail('CORE005_INVARIANT_VIOLATION',{invariantId:'CORE005-INV-COLLAB-NO-EFFECT',
   violatedBy:`step ${functionId} claimed an executed or permitted Effect`});
 if(functionId==='xdownload.describePolicy'&&!checkpoint.policyObserved&&
    envelope.disposition==='OBSERVED'&&value.domainId==='downloads')
  checkpoint.policyObserved=true;
 if(functionId==='xdownload.interaction.inspect'&&
    envelope.value.status==='AWAITING_CONFIRMATION')
  checkpoint.inspectProposal=value.proposal;
 if(functionId==='xdownload.interaction.confirm'){
  if(!checkpoint.policyObserved||!checkpoint.inspectProposal)
   fail('CORE005_INVARIANT_VIOLATION',{invariantId:'CORE005-INV-COLLAB-PRECONDITION',
    violatedBy:`confirm step lacks ${!checkpoint.policyObserved?
     'an observed xdownload policy':'a confirmed goal proposal'} in the same collaboration`});
  if(envelope.value.status!=='READY_FOR_KDP')
   fail('CORE005_INVARIANT_VIOLATION',{invariantId:'CORE005-INV-COLLAB-PRECONDITION',
    violatedBy:`confirm step ended ${envelope.value.status} instead of READY_FOR_KDP`});
 }
}

/** One orchestrated collaboration call across >=3 real selected Functions of
 * >=2 real selected Elements (xdownload.policy Knowledge, xdownload.interaction
 * Interaction). The plan must be a subsequence of the canonical order;
 * `plan` is provided only to demonstrate fail-closed behavior for hostile
 * sequences. The driver dispatches no KDP intent and grants no Effect. */
export async function runCore005Collaboration(app,request){
 if(!plain(request)||!nonEmptyString(request.requestId)||
    !nonEmptyString(request.url)||!Number.isSafeInteger(request.declaredBytes)||
    request.declaredBytes<=0||(request.plan!==undefined&&!Array.isArray(request.plan)))
  fail('CORE005_COLLAB_REQUEST_INVALID');
 const plan=request.plan??COLLAB_PLAN.map(s=>s.functionId);
 const canonical=COLLAB_PLAN.map(s=>s.functionId);
 let cursor=-1;
 const planned=[];
 for(const functionId of plan){
  const index=canonical.indexOf(functionId);
  if(index<0)fail('CORE005_COLLAB_PLAN_INVALID',{functionId});
  if(planned.includes(functionId))fail('CORE005_COLLAB_PLAN_INVALID',{functionId});
  if(index<=cursor)fail('CORE005_COLLAB_PLAN_INVALID',
   {functionId,reason:'plan is not a subsequence of the canonical collaboration order'});
  cursor=index;
  planned.push(functionId);
 }
 const checkpoint={policyObserved:false,inspectProposal:null};
 const steps=[];
 const options={expectedContractVersion:'1.0.0'};
 for(const functionId of planned){
  let envelope;
  if(functionId==='xdownload.describePolicy')
   envelope=await app.invoke(functionId,{},options);
  else if(functionId==='xdownload.interaction.inspect')
   envelope=await app.invoke(functionId,{
    channel:'chat',requestId:request.requestId,
    url:request.url,declaredBytes:request.declaredBytes},options);
  else
   envelope=await app.invoke(functionId,{
    draft:{status:'AWAITING_CONFIRMATION',authority:'NONE',effectDispatched:false,
     proposal:checkpoint.inspectProposal},
    answers:{},confirmed:true},options);
  enforceCollaborationInvariants(functionId,envelope,checkpoint);
  steps.push(collaborationStepRecord(functionId,envelope));
 }
 if(!planned.includes('xdownload.interaction.confirm'))
  fail('CORE005_COLLAB_PLAN_INVALID',{reason:'collaboration receipt requires the confirm step'});
 return Object.freeze({
  schema:'dis.v0.2.core005-collaboration/1',requestId:request.requestId,
  steps:Object.freeze(steps),
  collaboratingElements:Object.freeze(['xdownload.policy','xdownload.interaction']),
  invariantsChecked:Object.freeze(['CORE005-INV-COLLAB-PRECONDITION','CORE005-INV-COLLAB-NO-EFFECT']),
  authority:'NONE',effectDispatched:false,kdpIntentDispatched:false,
  qualification:Object.freeze({engineeringOnly:true,independentSap:false,
   semanticOracle:false,effectExecutionProven:false})
 });
}

// ---------------------------------------------------------------------------
// 5. SAP obligation gate — fail-closed while no qualified Oracle exists
// ---------------------------------------------------------------------------

/** Truthful registry: no qualified independent semantic Oracle exists for
 * this lane. Formal original qualification (F-A/F-B) is blocked upstream in
 * kaicreator-mm/domain-intelligence-engineering#155. This lane does NOT and
 * MUST NOT mint one. Keep the registry a frozen empty constant so any code
 * path that would "complete the Oracle" is a visible, reviewable change. */
export const CORE005_SAP_ORACLE_REGISTRY=Object.freeze([]);

export function declareCore005SapObligation({obligationId,subjectElementId,
 verifierFunctionId,sourceId,owner,requiredCapability}){
 if(!nonEmptyString(obligationId)||!nonEmptyString(subjectElementId)||!
    nonEmptyString(verifierFunctionId)||!nonEmptyString(sourceId)||!
    nonEmptyString(requiredCapability))
  fail('CORE005_SAP_OBLIGATION_INVALID');
 // owner is declarable as null/empty: a missing owner is a *gate-level*
 // typed UNKNOWN refusal, not a record-shape rejection, so the honest
 // reason survives into the result instead of being masked as malformed.
 if(owner!==undefined&&owner!==null&&!nonEmptyString(owner))
  fail('CORE005_SAP_OBLIGATION_INVALID');
 return Object.freeze({
  schema:'dis.v0.2.core005-sap-obligation/1',obligationId,subjectElementId,
  verifierFunctionId,sourceId,
  owner:owner??null,requiredCapability,satisfied:false
 });
}

/** Evaluate a declared SAP obligation. Fail-closed by construction:
 * - unselected subject or unbound verifier -> typed UNKNOWN;
 * - missing or unrecognized owner -> typed UNKNOWN (never inferred);
 * - no qualified Oracle in the registry -> explicit BLOCKED with reason.
 * The obligation record itself is never mutated and never marked satisfied. */
export function evaluateCore005SapGate(obligation,qualified){
 if(!plain(obligation)||obligation.schema!=='dis.v0.2.core005-sap-obligation/1')
  fail('CORE005_SAP_OBLIGATION_INVALID');
 const unknown=detail=>({disposition:'UNKNOWN',qualified:false,satisfied:false,
  authority:'NONE',code:'CORE005_SAP_GATE_UNKNOWN',...detail});
 if(!plain(qualified)||!(qualified.elements instanceof Map)||
    !qualified.elements.has(obligation.subjectElementId))
  return Object.freeze(unknown({reason:'CORE005_SAP_SUBJECT_UNSELECTED',
   subjectElementId:obligation.subjectElementId}));
 const verifier=qualified.functions.get(obligation.verifierFunctionId);
 if(!verifier||verifier.definition.binding.type!=='local')
  return Object.freeze(unknown({reason:'CORE005_SAP_VERIFIER_UNBOUND',
   verifierFunctionId:obligation.verifierFunctionId}));
 const pin=qualified.pins.get(obligation.sourceId);
 const resolvedOwner=pin?.origin?.repository??null;
 if(!nonEmptyString(obligation.owner)||obligation.owner!==resolvedOwner)
  return Object.freeze(unknown({reason:'CORE005_SAP_OWNER_UNRESOLVED',
   declaredOwner:obligation.owner,resolvedOwner}));
 const oracle=CORE005_SAP_ORACLE_REGISTRY.find(entry=>
  plain(entry)&&entry.oracleId===obligation.requiredCapability&&
  entry.qualified===true);
 if(!oracle)
  return Object.freeze({
   disposition:'BLOCKED',qualified:false,satisfied:false,authority:'NONE',
   code:'CORE005_MISSING_QUALIFIED_ORACLE',obligationId:obligation.obligationId,
   requiredCapability:obligation.requiredCapability,
   reason:'no qualified independent semantic Oracle is registered for this obligation',
   blockedBy:'kaicreator-mm/domain-intelligence-engineering#155 (F-A/F-B formal original qualification)',
   upgradePath:'register a genuinely qualified Oracle, then re-evaluate; this gate cannot be satisfied by declaration'
  });
 return Object.freeze({
  disposition:'BLOCKED',qualified:false,satisfied:false,authority:'NONE',
  code:'CORE005_SAP_GATE_IMPLEMENTATION_ABSENT',obligationId:obligation.obligationId,
  reason:'registry lookup succeeded only by hostile registry mutation; this lane implements no qualifying evaluation'
 });
}

/** Evaluate a SAP claim against an obligation. A claim that self-declares
 * "proven" must carry a versioned credential bound to a *registered*
 * qualified Oracle; anything else is an explicit typed rejection, never a
 * downgrade and never a pass. An honest claim of "not proven" is a typed
 * UNKNOWN, not an error. */
export function evaluateCore005SapClaim(claim,obligation){
 if(!plain(claim)||!['proven','oracleId','obligationId','credential']
    .every(key=>Object.hasOwn(claim,key))||
    Object.keys(claim).length!==4)
  fail('CORE005_SAP_CLAIM_REJECTED',{reason:'claim shape is not an own four-field record'});
 if(claim.obligationId!==obligation.obligationId)
  fail('CORE005_SAP_CLAIM_REJECTED',{reason:'claim is bound to a different obligation',
   claimObligationId:claim.obligationId});
 if(claim.proven!==true)
  return Object.freeze({accepted:false,disposition:'UNKNOWN',
   code:'CORE005_SAP_CLAIM_NOT_PROVEN',satisfied:false,authority:'NONE'});
 if(!plain(claim.credential))
  fail('CORE005_SAP_CLAIM_REJECTED',
   {reason:'self-declared proven claim carries no versioned credential'});
 const credential=claim.credential;
 if(Object.keys(credential).sort().join(',')!=='credentialVersion,oracleId,origin,sha256'||!
    SEMVER.test(credential.credentialVersion??'')||!
    nonEmptyString(credential.oracleId)||!HEX64.test(credential.sha256??'')||!
    plain(credential.origin))
  fail('CORE005_SAP_CLAIM_REJECTED',{reason:'credential is not a versioned, digest-shaped record'});
 const origin=credential.origin;
 if(Object.keys(origin).sort().join(',')!=='commit,gitBlob,path,repository'||!
    nonEmptyString(origin.repository)||!GIT40.test(origin.commit??'')||!
    nonEmptyString(origin.path)||!GIT40.test(origin.gitBlob??''))
  fail('CORE005_SAP_CLAIM_REJECTED',{reason:'credential origin is not a pinned source origin'});
 const oracle=CORE005_SAP_ORACLE_REGISTRY.find(entry=>
  plain(entry)&&entry.oracleId===credential.oracleId&&entry.qualified===true);
 if(!oracle)
  fail('CORE005_SAP_CLAIM_REJECTED',{reason:'credential names an Oracle that is not registered as qualified',
   oracleId:credential.oracleId});
 // Unreachable while CORE005_SAP_ORACLE_REGISTRY is frozen-empty: no local
 // qualifying evaluation exists, so even a registered entry cannot be
 // honored by this engineering layer.
 fail('CORE005_SAP_CLAIM_REJECTED',{reason:'no qualifying evaluation is implemented in this engineering layer'});
}
