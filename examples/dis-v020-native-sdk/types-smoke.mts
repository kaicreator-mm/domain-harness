/**
 * Exact package-subpath TypeScript consumer. This is compile-only ABI
 * verification; actual execution is tested by native-consumer.test.mjs.
 */
import type {
 DisV020Program,DisV020SourceInput,DisV020Aot,DisV020Origin,
 DisV020LocalHandleContract,DisV020KdpReceiptContract,DisV020AppInitContract,
 DisV020PublicFunctionCoverage
} from '@kaicreator/domain-harness-contracts/dis-v020';
import {inspectDisV020PublicFunctionCoverage,bindDisV020LocalHandle} from '@kaicreator/domain-harness-contracts/dis-v020';
import type {V10BuiltApp,V10DocStore} from '@kaicreator/domain-harness-contracts';
import {compileDisV020Aot} from '@kaicreator/domain-harness-build/dis-v020';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';

declare const built:V10BuiltApp;
declare const program:DisV020Program;
declare const sources:readonly DisV020SourceInput[];
declare const expectedSourceOrigins:Readonly<Record<string,DisV020Origin>>;
declare const store:V10DocStore;
const artifact:DisV020Aot=compileDisV020Aot({built,program,sources,expectedSourceOrigins});
async function checkNativeTypes():Promise<void>{
 const app=await loadDisV020Aot(artifact,{
  store,
  registry:{},
  expectedDigest:artifact.digest
 });
 const outcome=await app.invoke('tally.assessTaskEvidence',{});
 if(outcome.kind==='KDP_RECEIPT'){
  const receipt:Record<string,unknown>=outcome.receipt;
  void receipt;
 }else{
  const observation:unknown=outcome.value;
  void observation;
 }
 app.stop();
}
void checkNativeTypes;

/** R78: compile-only external consumer through published package subpaths.
 * These declarations must agree with source-selected Native AOT+SDK contracts.
 */
const result:DisV020PublicFunctionCoverage=inspectDisV020PublicFunctionCoverage(artifact);
const typedCount:number=result.typedIOFunctions;
const sap:false=result.independentSAP;
const readiness:boolean=result.fullCore003Ready;
const semanticRelations=program.relations.filter(x=>x.contract?.authority==='NONE');
void [typedCount,sap,readiness,semanticRelations];
declare const handleContract:DisV020LocalHandleContract;
const facade:unknown=bindDisV020LocalHandle(handleContract,{});
void facade;
declare const kdp:DisV020KdpReceiptContract;
const kdpSchema=kdp.input?.fields?.messageId;
void kdpSchema;
declare const initContract:DisV020AppInitContract;
const initReady:'READY'=initContract.outcomes.READY;
void initReady;
declare const selectedApp:Awaited<ReturnType<typeof loadDisV020Aot>>;
const relations=selectedApp.semanticRelations;
void relations;
/** The special boundary distinguishes a typed Function from a fake
 * independent semantic approval or arbitrary KDP admission outcome.
 */
// @ts-expect-error R78: independentSAP is never declared as true by a schema checker
const fakeSap:true=result.independentSAP;
void fakeSap;
// @ts-expect-error R78: KDP admission is not an Effect completion status
const inventedSuccess:'SUCCEEDED'=kdp.statusMap.admitted;
void inventedSuccess;
