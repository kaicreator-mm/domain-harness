/**
 * #960 V08-B2-R2: physical B module -> original v0.7 T002B -> T003C ->
 * T004A -> T004C -> ONE Central Admission / original journal.
 *
 * This is experimental trusted Host glue, NOT an SDK API, second Runtime,
 * authority-granting callback, new effect journal, or ambient JS sandbox.
 * The T003C candidate handle and implementation digest are derived from the
 * actual B1-attested physical bytes, not nativeFixture().binding.
 */
import { createHash } from 'node:crypto';
import { computeDefinitionGraphDigest } from '../../../packages/domain-harness/src/contracts/definition-graph.ts';
import { resolveCurrentCapabilityProvider } from '../../../packages/domain-harness/src/contracts/capability-provision.ts';
import { sealRuntimeAssembly } from '../../../packages/domain-harness/src/contracts/runtime-assembly.ts';
import { bindToolImplementation } from '../../../packages/domain-harness/src/contracts/tool-implementation-binding.ts';
import {
  admitToolExposure,admitToolInvocationRequest
} from '../../../packages/domain-harness/src/contracts/invocation-request.ts';
import { invokeWithExistingV07Authority } from './invoke-v07.mjs';

const sha256={async digestUtf8(value){return createHash('sha256').update(value,'utf8').digest('hex');}};
const deny=code=>{throw Object.assign(new Error(code),{code});};
const snap=x=>JSON.parse(JSON.stringify(x));

export async function joinPhysicalBToNativeV07({trustedBHost,selector,occurrenceFixture}={}){
  if(!trustedBHost || typeof trustedBHost.seal!=='function' || !occurrenceFixture)
    deny('E_JOIN_TRUSTED_HOST');
  // Physical Package Kind identity is authenticated by #956, the B1 Seal,
  // actual module bytes and original v0.7 Component/Kind admission.
  const physicalSeal=await trustedBHost.seal(selector);
  const physical=physicalSeal.nativeSelection();
  const component=physical.component,operation=physical.operation;
  if(operation.effect==='none')deny('E_EFFECTLESS_NATIVE_SELECTION');
  if(component.operations.length!==1 || !component.providesCapabilities?.length ||
     component.packageId!==physical.packageId ||
     physical.implementation.componentId!==component.componentId ||
     physical.implementation.sha256!=='sha256:'+physical.moduleSha256)
    deny('E_JOIN_IDENTITY');
  if(typeof physical.handler!=='function')deny('E_JOIN_HANDLE');
  const capability=snap(component.providesCapabilities[0]);
  if(!capability.operations.includes(operation.operationId))
    deny('E_JOIN_CAPABILITY_SCOPE');
  // Native projection draws every material Tool operation/capability and
  // Kind/implementation pin from this attested B physical manifest/module.
  // The consumer is merely the v0.7 workflow calling context.
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
    family:'semantic',componentId:'consumer.v08-b2',
    kind:snap(physical.kindRef),requiredSemanticContracts:[],
    requiredCapabilities:[{capabilityId:capability.capabilityId,version:capability.version}],
    semanticBody:{note:'native v0.7 control caller; no permission authority'}
  };
  const graph={graphId:'graph.v08-b2-physical-'+physical.packageId,
    components:[consumer,nativeTool],relations:[]};
  const pin={
    implementationId:physical.implementation.implementationId,
    implementationVersion:'1.0.0',
    implementationDigest:'sha256:'+physical.moduleSha256
  };
  const kindImplementation={pin:{kind:snap(physical.kindRef),implementation:pin},
    understoodSemanticContracts:[],understoodCapabilities:[],
    // B1/physical validator already ran against the exact bytes; this native
    // shape is a Tool projection, never an invented Kind body validator.
    validateComponent(){}};
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
  const caller={callerId:'caller.session-1',callerKind:'workflow'};
  const exposure=await admitToolExposure({
    toolComponentId:component.componentId,operationId:operation.operationId,
    caller,assembly:binding.successorAssembly,currentDefinitionGraph:graph,
    policy:{decideAdmission:()=>({admitted:true})}
  },sha256);
  const admitted=await admitToolInvocationRequest({
    toolComponentId:component.componentId,operationId:operation.operationId,
    input:{amount:42},caller,exposure,
    definitionGraphDigest:binding.successorAssembly.record.definitionGraphDigest,
    assemblyDigest:binding.successorAssembly.assemblyDigest
  },{assembly:binding.successorAssembly,currentDefinitionGraph:graph},sha256);

  // Consume the ORIGINAL accepted T002C/T002D activator and durable store
  // from a pristine *unactivated* v0.7 occurrence fixture. No fixture binding,
  // fixture Tool implementation or fixture Assembly enters this native join.
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
      return query.handle(query.input);
    }},
    sha256
  });
  return Object.freeze({
    physicalAssembly:physicalSeal.assembly,
    nativeAssembly:binding.successorAssembly,
    graph,binding,admitted,actualPin,
    moduleSha256:physical.moduleSha256,
    operationId:operation.operationId,
    journal:fx.journal,
    getDispatchCount(){return dispatchCount;},
    async invoke(overrides={}){
      // This is a Host byte-currentness gate, not a second effect authority.
      await physicalSeal.requirePhysicalCurrentness();
      return invokeWithExistingV07Authority({...baseRequest,...overrides});
    },
    rebind(){deny('E_NATIVE_REBIND_FORBIDDEN');}
  });
}
