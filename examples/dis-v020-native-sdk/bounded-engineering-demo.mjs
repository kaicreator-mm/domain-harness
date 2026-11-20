/**
 * Runnable DIS 0.2.0 bounded engineering demo on the approved linux/x64/node
 * target. This deliberately reuses the original selected native source
 * fixtures; it is NOT a qualified DKE Producer ECP, professional Oracle,
 * physical Effect, production trust anchor or a Release certificate.
 *
 * npm run build
 * node --import tsx examples/dis-v020-native-sdk/bounded-engineering-demo.mjs
 */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {inspectDisV020PublicFunctionCoverage} from '@kaicreator/domain-harness-contracts/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {makeNativeFixture} from './native-fixture.mjs';

export async function runBoundedDisV020EngineeringDemo(){
 const nodeMajor=Number(process.versions.node.split('.')[0]);
 if(process.platform!=='linux'||process.arch!=='x64'||!Number.isInteger(nodeMajor)||
    nodeMajor<24)
  throw new Error('DIS_DEMO_TARGET_NOT_QUALIFIED');
 const fixture=await makeNativeFixture();
 const coverage=inspectDisV020PublicFunctionCoverage(fixture.artifact);
 if(coverage.typedIOFunctions!==9||coverage.fullCore003Ready!==true||
    coverage.independentSAP!==false||coverage.effectExecutionProven!==false)
  throw new Error('DIS_DEMO_SELECTED_FUNCTION_SCOPE_INVALID');
 // The fixture's expected digest is a local TEST trust anchor, not a
 // separately provisioned production authority or external ECP credential.
 const app=await loadDisV020Aot(fixture.artifact,{
  expectedDigest:fixture.artifact.digest,
  registry:fixture.registry,
  store:new PlainCasDocStore(),
  tenantId:'tenant:dis-v020-bounded-engineering-demo'
 });
 try{
  if(app.state!=='READY')throw new Error('DIS_DEMO_APP_NOT_READY');
  const task=await app.invoke('tally.assessTaskEvidence',{});
  const policy=await app.invoke('xdownload.describePolicy',{});
  const kdp=await app.invoke('orders.approve',{
   messageId:'msg:dis-v020-bounded-demo',
   instanceKey:'instance:dis-v020-bounded-demo',
   input:{amount:30,requestId:'DIS-BOUNDED-DEMO'}
  });
  if(task.kind!=='OBSERVATION'||task.authority!=='NONE'||
     task.value?.state!=='UNQUALIFIED_INPUT'||task.value.admitted!==false||
     policy.kind!=='OBSERVATION'||policy.authority!=='NONE'||
     policy.value?.domainId!=='downloads'||
     kdp.kind!=='KDP_RECEIPT'||kdp.authority!=='KDP'||
     kdp.receipt?.status!=='admitted')
   throw new Error('DIS_DEMO_UNEXPECTED_SELECTED_FUNCTION_OUTCOME');
  return Object.freeze({
   schema:'dis.v0.2.bounded-engineering-demo/1',
   selectedTarget:'linux/x64/node',
   aotDigest:fixture.artifact.digest,
   sourcePins:fixture.artifact.sources.length,
   typedFunctionProfiles:coverage.typedIOFunctions,
   appInit:'READY',
   tally:Object.freeze({kind:task.kind,authority:task.authority,
    state:task.value.state,taskClaimAttested:false}),
   xdownload:Object.freeze({kind:policy.kind,authority:policy.authority,
    policyDomain:policy.value.domainId,acquisitionExecuted:false}),
   orders:Object.freeze({kind:kdp.kind,authority:kdp.authority,
    receiptStatus:kdp.receipt.status,effectExecutionProven:false}),
   qualification:Object.freeze({
    engineeringOnly:true,independentSAP:false,qualifiedEcpProducer:false,
    trustedProductionAnchor:false,externalHostEffectExecuted:false,
    formalConformance:false,releaseEligible:false
   })
  });
 }finally{
  app.stop();
 }
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 runBoundedDisV020EngineeringDemo()
  .then(result=>{process.stdout.write(JSON.stringify(result,null,2)+'\n')})
  .catch(error=>{process.stderr.write(String(error?.message??error)+'\n');process.exitCode=1});
}
