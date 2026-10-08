// #960 K1: bounded, side-effect-free Package Kind dispatch. NOT a Runtime or authority mint.
// Trusted Host alone provisions approvedPins and B1 Host; no caller may re-sign selectors.
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyPackage, verifyDefinitionGraph, hashBytes, canonicalJson } from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';
import { admitComponent } from '../../../packages/domain-harness/dist/contracts/component-admission.js';
import { decideKindCompatibility } from '../../../packages/domain-harness/dist/contracts/kind-compatibility.js';

export class B2Error extends Error {
  constructor(code){ super(code); this.code=code; this.name='B2Error'; }
}
const deny=code=>{throw new B2Error(code)};
const snap=value=>JSON.parse(canonicalJson(value));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exact=(id)=>typeof id==='string' && /^[a-z][a-z0-9.-]*$/.test(id) && !id.includes('..');
const pinKeys=['manifestSha256','moduleSha256','packageVersion'];
function checkExactPin(pin){
  if(!pin || Object.keys(pin).sort().join(',')!==[...pinKeys].sort().join(',') ||
    !/^[a-f0-9]{64}$/.test(pin.manifestSha256) || !/^[a-f0-9]{64}$/.test(pin.moduleSha256) ||
    typeof pin.packageVersion!=='string')deny('E_HOST_APPROVAL');
}
export function establishTrustedPackageKindHost({root,approvedPins,b1Host}){
  if(typeof root!=='string' || !root || !b1Host || typeof b1Host.seal!=='function')deny('E_TRUSTED_HOST');
  const pins=snap(approvedPins);
  if(!pins || !Object.keys(pins).length)deny('E_HOST_APPROVAL');
  for(const [id,p] of Object.entries(pins)){
    if(!exact(id))deny('E_PACKAGE_ID');
    checkExactPin(p);
  }
  return Object.freeze({
    async seal({packageId,kindRef,componentId}={}){
      if(!exact(packageId) || !exact(componentId) || !kindRef || typeof kindRef.kindId!=='string' ||
         typeof kindRef.version!=='string')deny('E_SELECTION');
      const approved=pins[packageId];
      if(!approved)deny('E_UNAPPROVED_PACKAGE');
      // B1's reviewed, byte-verified linker/selected Rule must still seal successfully.
      const b1=await b1Host.seal();
      const manifestBytes=await readFile(join(root,packageId,'manifest.json'));
      const moduleBytes=await readFile(join(root,packageId,'modules','impl.mjs'));
      if(sha(manifestBytes)!==approved.manifestSha256 || sha(moduleBytes)!==approved.moduleSha256)
        deny('E_APPROVED_BYTES');
      const physical=JSON.parse(manifestBytes.toString('utf8'));
      if(Object.keys(physical).sort().join(',')!=='bCandidate,bKinds,moduleSha256')
        deny('E_PHYSICAL_SHAPE');
      const m=physical.bCandidate, source=moduleBytes.toString('utf8');
      if(!m || m.packageId!==packageId || m.packageVersion!==approved.packageVersion ||
        physical.moduleSha256!=='sha256:'+approved.moduleSha256)deny('E_PACKAGE_IDENTITY');
      const artifacts={'modules/impl.mjs':source};
      const key=kindRef.kindId+'@'+kindRef.version;
      // Actual #956 B Package identity / graph checks (not a substitute Kernel).
      verifyPackage(m,artifacts,{[key]:[]});
      verifyDefinitionGraph([{manifest:m,artifacts}],{}, {[key]:[]});
      const component=m.components.find(c=>c.componentId===componentId);
      if(!component || m.components.length!==1 || component.kindRef.kindId!==kindRef.kindId ||
         component.kindRef.version!==kindRef.version)deny('E_SELECTED_KIND');
      const declarations=physical.bKinds;
      if(!Array.isArray(declarations) || declarations.length!==1)deny('E_KIND_DECLARATION');
      const declaration=declarations[0];
      if(declaration.kindId!==kindRef.kindId || declaration.version!==kindRef.version ||
         declaration.componentId!==componentId)deny('E_KIND_OWNER');
      const impls=m.implementations;
      if(impls.length!==1 || impls[0].implementationId!==declaration.implementationId ||
         impls[0].componentId!==componentId || impls[0].path!=='modules/impl.mjs' ||
         impls[0].sha256!=='sha256:'+approved.moduleSha256)deny('E_SELECTED_HANDLER_IDENTITY');
      const operation=component.operations;
      if(operation.length!==1 || operation[0].operationId!==declaration.operationId)
        deny('E_SELECTED_OPERATION');
      const mod=await import('data:text/javascript;base64,'+moduleBytes.toString('base64'));
      const validator=mod.kindValidators?.[key];
      const factory=mod.implementations?.[declaration.implementationId];
      if(typeof validator!=='function' || typeof factory!=='function')deny('E_KIND_IMPLEMENTATION');
      decideKindCompatibility(kindRef,[kindRef]);
      admitComponent({family:'semantic',componentId,kind:kindRef,semanticBody:component.semanticBody,
        requiredSemanticContracts:component.requiredSemanticContracts,
        requiredCapabilities:component.requiresCapabilities},[{
          kind:kindRef,understoodSemanticContracts:[],understoodCapabilities:[],validateComponent:validator
        }]);
      const instance=factory(Object.freeze(snap(component.semanticBody)));
      const method=instance?.[declaration.operationId];
      if(typeof method!=='function')deny('E_SELECTED_HANDLER_OPERATION');
      const selectedMethod=method.bind(instance); // exact byte-verified captured callable
      const assembly=Object.freeze({digest:'sha256:'+sha(Buffer.from(canonicalJson({
        tag:'v08-b2-pure-package-kind/1',base:b1.assembly.digest,packageId,
        manifest:m.integrity,moduleSha256:approved.moduleSha256,kindRef,componentId,
        implementationId:declaration.implementationId,operationId:declaration.operationId
      }))),baseAssemblyDigest:b1.assembly.digest,packageDigest:m.integrity,
        kindRef:Object.freeze(snap(kindRef)),componentId,operationId:declaration.operationId});
      return Object.freeze({
        assembly,
        invoke({operationId,input}={}){
          if(operationId!==declaration.operationId)deny('E_OPERATION_SCOPE');
          // Pure-path only; no caller-supplied effectAuthority, no custom Journal.
          if(operation[0].effect!=='none')deny('E_EFFECT_ADMISSION_REQUIRED');
          return selectedMethod(snap(input));
        },
        rebind(){deny('E_SEALED');}
      });
    }
  });
}
