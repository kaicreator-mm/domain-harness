/**
 * Exact package-subpath TypeScript consumer. This is compile-only ABI
 * verification; actual execution is tested by native-consumer.test.mjs.
 */
import type {
 DisV020Program,DisV020SourceInput,DisV020Aot,DisV020Origin
} from '@kaicreator/domain-harness-contracts/dis-v020';
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
