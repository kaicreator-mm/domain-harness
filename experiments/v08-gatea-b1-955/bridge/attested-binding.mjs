
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {bootstrap,blobSHA,TRUSTED_KERNEL_BLOB} from '../reference940/bootstrap.mjs';
import {canonicalJson,packageDigest,verifyDefinitionGraph,digest,SpecError} from '../reference956/candidate-validator.mjs';
import {admitComponent} from '../../../packages/domain-harness/dist/contracts/component-admission.js';
import {decideKindCompatibility} from '../../../packages/domain-harness/dist/contracts/kind-compatibility.js';

export class B1Error extends Error {
  constructor(code,detail=code){super(detail);this.name='B1Error';this.code=code}
}
const fail=(c,d)=>{throw new B1Error(c,d)};
const snapshot=x=>JSON.parse(canonicalJson(x)); // descriptor-first BEFORE graph iterator/getter
export function admitGraphVector(entries){
  const copy=snapshot(entries);
  if(!Array.isArray(copy))fail('E_GRAPH_VECTOR');
  return copy;
}
async function trustedPhysical(root,sel,approved){
  if(!sel||!approved||sel.path!==approved.path||sel.digest!==approved.digest
    ||!['kernel','sdk','support','business-approval'].includes(sel.path))
    fail('E_HOST_PIN');
  const manifestBytes=await readFile(join(root,sel.path,'manifest.json'));
  if(blobSHA(manifestBytes)!==approved.digest)fail('E_HOST_PIN');
  const m=JSON.parse(manifestBytes.toString('utf8'));
  if(m.id!==(sel.path==='business-approval'?'approval':sel.path))fail('E_PACKAGE_IDENTITY');
  const source=await readFile(join(root,sel.path,'impl.mjs'));
  if(blobSHA(source)!==m.moduleDigest)fail('E_MODULE_BYTES');
  return {m,bytes:source.toString('utf8'),digest:approved.digest};
}
const kernelProjection=()=>{
  const m={formatVersion:'dhpkg/0.8-candidate-1',packageId:'kernel',packageVersion:'0.0.1',targetAbi:'dh.node22/1',
    hostRequirements:[],dependencies:[],imports:[],exports:[],components:[],implementations:[],integrity:''};
  m.integrity=packageDigest(m,{});return {manifest:m,artifacts:{}};
};
function makeAdmission(sdkPhysical,module){
  const declarations=snapshot(sdkPhysical.m.bKinds||[]);
  const map=Object.create(null);
  const kindSet=[];
  for(const kind of declarations){
    if(!['std.rule','std.schema'].includes(kind.kindId)||kind.version!=='1.0.0'
      ||typeof kind.implementationId!=='object'&&typeof kind.implementationId!=='string')
      fail('E_UNTRUSTED_KIND');
    const exact=kind.kindId+'@'+kind.version;
    if(Object.hasOwn(map,exact))fail('E_DUPLICATE_KIND');
    if(kind.kindId==='std.rule'){
      if(kind.implementationId!=='sdk.rule.impl@1'||typeof module.implementations?.[kind.implementationId]!=='function')fail('E_KIND_IMPLEMENTATION');
      if(kind.semantics.length!==1||kind.semantics[0]!=='sc.rule.threshold@1.0.0')fail('E_KIND_SEMANTICS');
    }else if(kind.implementationId!==null||kind.semantics.length)fail('E_KIND_IMPLEMENTATION');
    map[exact]=kind.semantics;
    const understoodSemanticContracts=kind.semantics.map(x=>{const [contractId,version]=x.split('@');return {contractId,version}});
    kindSet.push({
      kind:{kindId:kind.kindId,version:kind.version},
      understoodSemanticContracts,understoodCapabilities:[],
      validateComponent(env){
        const body=env.semanticBody;
        if(kind.kindId==='std.rule' && (!body||Object.keys(body).sort().join(',')!=='operator,threshold'
          ||body.operator!=='gte'||typeof body.threshold!=='number'||!Number.isFinite(body.threshold)))
          fail('E_KIND_SEMANTIC_BODY');
        if(kind.kindId==='std.schema'&&(!body||body.type!=='object'||Object.keys(body).join(',')!=='type'))
          fail('E_KIND_SEMANTIC_BODY');
      }
    });
  }
  if(kindSet.length!==2)fail('E_REQUIRED_KINDS');
  return {map,kindSet};
}
export async function sealAttestedB1({root,hostPins,four=false}){
  // Host-supplied pin set is authority; a caller cannot authorize a new digest
  // merely by changing an untrusted selector. No user JS implementation input.
  const pins=snapshot(hostPins);
  const allowed=four?['kernel','sdk','support','business-approval']:['kernel','sdk','business-approval'];
  if(pins.kernel?.digest!==TRUSTED_KERNEL_BLOB)fail('E_KERNEL_ROOT');
  const physical=new Map();
  for(const id of allowed){
    const p=await trustedPhysical(root,pins[id],pins[id]);
    physical.set(id,p);
  }
  if(allowed.some(id=>!pins[id]))fail('E_HOST_PIN');
  const legacy=await bootstrap({root,sdk:pins.sdk,business:pins['business-approval'],
    dependencyPins:four?{support:pins.support}:{}});
  // Actual #940 linker/link-seal must agree with our byte-attested physical closure.
  for(const [id,p] of physical){
    const m=legacy.assembly.packages.find(x=>x.id===p.m.id);
    if(!m||m.digest!==p.digest||m.module!==p.m.moduleDigest)fail('E_LINKER_DRIFT');
    const recheck=await readFile(join(root,id,'impl.mjs'));
    if(blobSHA(recheck)!==p.m.moduleDigest)fail('E_MODULE_TOCTOU');
    const mf=await readFile(join(root,id,'manifest.json'));
    if(blobSHA(mf)!==p.digest)fail('E_MANIFEST_TOCTOU');
  }
  // The SDK executable is imported from its verified immutable bytes, NEVER
  // from a mutable filesystem path after sealing. Requires trusted approved JS realm.
  const sdkBytes=physical.get('sdk').bytes;
  if(sdkBytes.includes("from '../bootstrap.mjs'"))fail('E_NON_SELF_CONTAINED_MODULE');
  const module=await import('data:text/javascript;base64,'+Buffer.from(sdkBytes,'utf8').toString('base64'));
  const {map,kindSet}=makeAdmission(physical.get('sdk'),module);
  const entries=[kernelProjection()];
  for(const id of allowed.filter(x=>x!=='kernel')){
    const p=physical.get(id),m=snapshot(p.m.bCandidate);
    if(m.packageId!==p.m.id||m.packageVersion!==p.m.version)fail('E_B_PACKAGE_OWNER');
    const artifacts=m.implementations.length?{'modules/impl.mjs':p.bytes}:{};
    // Every selected B handler MUST name the exact same module bytes in the #940
    // attested physical package, and must not arrive as a caller JS function.
    for(const impl of m.implementations){
      if(impl.path!=='modules/impl.mjs'||impl.implementationId!=='sdk.rule.impl@1'||id!=='sdk')fail('E_B_HANDLER_OWNER');
    }
    entries.push({manifest:m,artifacts});
  }
  const checked=admitGraphVector(entries);
  for(const p of checked){
    for(const comp of p.manifest.components){
      decideKindCompatibility(comp.kindRef,kindSet.map(x=>x.kind)); // real accepted v0.7 seam
      const envelope={
        family:'semantic',componentId:comp.componentId,kind:comp.kindRef,semanticBody:comp.semanticBody,
        requiredSemanticContracts:comp.requiredSemanticContracts,requiredCapabilities:[],
        ...('nonMaterialExtensions' in comp?{nonMaterialExtensions:comp.nonMaterialExtensions}:{})
      };
      admitComponent(envelope,kindSet); // actual accepted v0.7 fail-closed semantic gate
    }
  }
  const graph=verifyDefinitionGraph(checked,{},map);
  const sdkComp=checked.find(x=>x.manifest.packageId==='sdk').manifest.components.find(x=>x.componentId==='sdk-rule');
  if(!sdkComp||sdkComp.operations.length!==1||sdkComp.operations[0].operationId!=='test'||sdkComp.operations[0].effect!=='none')
    fail('E_RULE_CONTRACT');
  if(!graph.bindings.some(x=>x.consumer==='approval/approval-schema'&&x.provider==='sdk/sdk-rule'&&x.capability==='rule.score@1.0.0'))
    fail('E_EXPECTED_GRAPH_BINDING');
  const instance=module.implementations['sdk.rule.impl@1']();
  if(typeof instance?.test!=='function')fail('E_RULE_IMPLEMENTATION');
  const selectedTest=instance.test.bind(instance); // PRIVATE, never caller-owned mutable handlers
  const threshold=sdkComp.semanticBody.threshold;
  const assembly=Object.freeze({
    digest:'sha256:'+digest({domain:'v08-gatea-b1-955/1',linker:legacy.assembly.digest,graph:graph.digest,
      sdkModule:physical.get('sdk').m.moduleDigest,kind:'std.rule@1.0.0',handler:'sdk.rule.impl@1',threshold}),
    graphDigest:graph.digest,legacyLinkerDigest:legacy.assembly.digest,
    moduleBlob:physical.get('sdk').m.moduleDigest
  });
  return Object.freeze({
    assembly,invokeRule(input){
      const parsed=snapshot(input);
      if(typeof parsed.score!=='number'||!Number.isFinite(parsed.score))fail('E_RULE_INPUT');
      return selectedTest({when:{field:'score',op:'gte',value:threshold},facts:{score:parsed.score}});
    },
    invokeSchema(){fail('E_OPERATION_NOT_DECLARED');},
    rebind(){fail('E_SEALED');}
  });
}
