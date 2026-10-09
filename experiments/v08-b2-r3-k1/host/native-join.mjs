// V08 B2 R3 K1 (#983): effectful business Operation -> ORIGINAL v0.7 authority.
//
// Binds the byte-verified physical K1 Business callable through the ORIGINAL
// accepted v0.7 seam chain: T002B sealRuntimeAssembly -> T003C
// bindToolImplementation (implementationHandle === the physical callable, its
// digest === the attested module SHA) -> T004A exposure/admission -> original
// occurrence activation -> T004C Central Admission + Journal via
// invokeWithExistingV07Authority.
//
// invokeWithExistingV07Authority is reused VERBATIM from the reviewed B2 R2
// module experiments/v08-gatea-repair-942/authority/invoke-v07.mjs, which
// imports the ORIGINAL v0.7 source effectful-invocation.ts (one module-private
// mint registry; mixing dist and source correctly fails
// ASSEMBLY_PROVENANCE_UNVERIFIED). Per the Controller Option-A JIT this reuse
// is a non-authoritative Host utility; the K1 Host never mints trust and the
// original v0.7 Runtime remains the ONLY effect/admission/journal authority.
//
// Research limitation (honest, for A1 #984): the native projection below is a
// trusted TEST Host bridge — it projects one Tool with an empty validating
// validateComponent and a permissive test admission policy; governance-policy
// equivalence of that projection is exactly the separate A1 repair concern.
// Unlike the R2 facade, authority-bearing Host ports (dispatch, admissionPorts,
// activator, sha256, effectType) are NOT caller-substitutable here.
import { createHash } from 'node:crypto';
import { computeDefinitionGraphDigest } from '../../../packages/domain-harness/src/contracts/definition-graph.ts';
import { resolveCurrentCapabilityProvider } from '../../../packages/domain-harness/src/contracts/capability-provision.ts';
import { sealRuntimeAssembly } from '../../../packages/domain-harness/src/contracts/runtime-assembly.ts';
import { bindToolImplementation } from '../../../packages/domain-harness/src/contracts/tool-implementation-binding.ts';
import {
  admitToolExposure,admitToolInvocationRequest
} from '../../../packages/domain-harness/src/contracts/invocation-request.ts';
import { invokeWithExistingV07Authority } from '../../v08-gatea-repair-942/authority/invoke-v07.mjs';

const sha256={async digestUtf8(value){return createHash('sha256').update(value,'utf8').digest('hex');}};
const deny=code=>{throw Object.assign(new Error(code),{code});};
const snap=x=>JSON.parse(JSON.stringify(x));
const JOINABLE_OVERRIDE_KEYS=Object.freeze(['request','binding','admissionRequest']);

export async function joinK1EffectfulToV07({host,selector,occurrenceFixture}={}){
  if(!host || typeof host.sealOperation!=='function' || !occurrenceFixture)
    deny('E_JOIN_TRUSTED_HOST');
  const seal=host.sealOperation(selector);
  const physical=seal.nativeSelection();
  const component=physical.component,operation=physical.operation;
  if(component.operations.length!==1 || !component.providesCapabilities?.length ||
     component.packageId!==physical.packageId ||
     physical.implementation.sha256!=='sha256:'+physical.moduleSha256 ||
     physical.implementation.path!=='modules/charge.mjs')
    deny('E_JOIN_IDENTITY');
  if(typeof physical.handler!=='function')deny('E_JOIN_HANDLE');
  const capability=snap(component.providesCapabilities[0]);
  if(!capability.operations.includes(operation.operationId))
    deny('E_JOIN_CAPABILITY_SCOPE');
  // Native projection is drawn from the attested K1 physical manifest only.
  // The consumer is merely the v0.7 workflow calling context (no authority).
  const nativeTool={
    family:'tool',componentId:component.componentId,kind:snap(physical.kindRef),
    requiredSemanticContracts:[],requiredCapabilities:[],
    semanticBody:{
      operations:component.operations.map(op=>({
        operationId:op.operationId,inputSchema:snap(op.inputSchema),
        outputSchema:snap(op.outputSchema),effect:op.effect
      })),
      providesCapabilities:component.providesCapabilities.map(cap=>({
        capabilityId:cap.capabilityId,version:cap.version
      }))
    }
  };
  const consumer={
    family:'semantic',componentId:'consumer.v08-b2-r3-k1',
    kind:snap(physical.kindRef),requiredSemanticContracts:[],
    requiredCapabilities:[{capabilityId:capability.capabilityId,version:capability.version}],
    semanticBody:{note:'native v0.7 control caller; no permission authority'}
  };
  const graph={graphId:'graph.v08-b2-r3-k1-'+physical.packageId,
    components:[consumer,nativeTool],relations:[]};
  const pin={
    implementationId:physical.implementation.implementationId,
    implementationVersion:'1.0.0',
    implementationDigest:'sha256:'+physical.moduleSha256
  };
  const kindImplementation={pin:{kind:snap(physical.kindRef),implementation:pin},
    understoodSemanticContracts:[],understoodCapabilities:[],
    // The K1 Host already ran the exact byte/Kind/admission gates; this native
    // Tool projection is not an invented Kind body validator.
    validateComponent(){}};
  return await (async ()=>{
    const baseAssembly=await sealRuntimeAssembly({
      definitionGraph:graph,kindImplementations:[kindImplementation]
    },sha256);
    const definitionGraphDigest=await computeDefinitionGraphDigest(graph,sha256);
    const selected=await resolveCurrentCapabilityProvider(
      graph,{capabilityId:capability.capabilityId,version:capability.version},
      consumer.componentId,definitionGraphDigest,sha256
    );
    const binding=await bindToolImplementation({
      assembly:baseAssembly,
      selection:snap(selected),currentDefinitionGraph:graph,
      implementations:[{
        implementation:pin,
        supportedOperations:component.operations.map(op=>op.operationId),
        handle:physical.handler
      }],
      exactPin:pin,sha256
    });
    if(binding.implementationHandle!==physical.handler ||
       binding.evidence.implementation.implementationDigest!=='sha256:'+physical.moduleSha256 ||
       binding.evidence.implementation.implementationId!==physical.implementation.implementationId)
      deny('E_NATIVE_PHYSICAL_BINDING_DRIFT');
    const caller={callerId:'caller.v08-b2-r3-k1',callerKind:'workflow'};
    // Trusted TEST-Host admission policy (A1 equivalence gap, honestly PARTIAL).
    const exposure=await admitToolExposure({
      toolComponentId:component.componentId,operationId:operation.operationId,
      caller,assembly:binding.successorAssembly,currentDefinitionGraph:graph,
      policy:{decideAdmission:()=>({admitted:true})}
    },sha256);
    const admitted=await admitToolInvocationRequest({
      toolComponentId:component.componentId,operationId:operation.operationId,
      // Exactly the ORIGINAL v0.7 occurrence's demo effect input: the durable
      // journal must be replayable bit-exactly (re-admission compares intent
      // input material), the same discipline as the reviewed B2 R2 join.
      input:{amount:42},caller,exposure,
      definitionGraphDigest:binding.successorAssembly.record.definitionGraphDigest,
      assemblyDigest:binding.successorAssembly.assemblyDigest
    },{assembly:binding.successorAssembly,currentDefinitionGraph:graph},sha256);
    // Pristine UNACTIVATED original v0.7 occurrence: activator + durable store
    // come from the original source module. No fixture Tool/Assembly enters.
    const fx=occurrenceFixture,p=fx.pin;
    const activationBinding={
      domainId:p.domainId,packageId:p.packageId,
      domainIntelligenceContentDigest:p.domainIntelligenceContentDigest,
      governanceBaseline:p.governanceBaseline
    };
    const actualPin=await fx.activator.activate({
      workflowTarget:p.workflowTarget,workflowInstanceId:p.workflowInstanceId,
      binding:activationBinding,assembly:binding.successorAssembly,
      authorityClass:'PRODUCTION',currentDefinitionGraph:graph
    });
    let dispatchCount=0;
    const baseRequest=Object.freeze({
      request:admitted,binding,currentDefinitionGraph:graph,
      activator:fx.activator,admissionRequest:fx.admissionRequest,
      admissionPorts:fx.admissionPorts,effectType:'effect:charge',
      dispatch:{async dispatch(query){
        if(query.handle!==physical.handler || query.operationId!==operation.operationId)
          deny('E_NATIVE_DISPATCH_HANDLE');
        dispatchCount++;
        // K1 selected callables follow the D1 handler convention
        // ({input, semanticBody, invokeCapability}); the raw T004C effect
        // input material is adapted into that convention without alteration.
        return query.handle({input:query.input});
      }},
      sha256
    });
    return Object.freeze({
      physicalAssembly:seal.assembly,
      nativeAssembly:binding.successorAssembly,
      graph,binding,admitted,actualPin,
      moduleSha256:physical.moduleSha256,
      operationId:operation.operationId,
      journal:fx.journal,
      getDispatchCount(){return dispatchCount;},
      async invoke(falsifier={}){
        const keys=Object.keys(falsifier);
        for(const k of keys)if(!JOINABLE_OVERRIDE_KEYS.includes(k))deny('E_HOST_PORT_IMMUTABLE');
        // Host byte-currentness over the WHOLE sealed Assembly (Kernel and SDK
        // included) before any native effect. Not a second effect authority.
        await seal.requirePhysicalCurrentness();
        return invokeWithExistingV07Authority({...baseRequest,...falsifier});
      },
      rebind(){deny('E_NATIVE_REBIND_FORBIDDEN');}
    });
  })();
}
