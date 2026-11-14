/** B11 actual OS CLI process transport for original AOT-selected
 * xDownload Interaction. The CLI is only an input channel, not an Effect
 * or permit. The process never calls xdownload.acquire.
 */
import {makeNativeFixture} from '../dis-v020-native-sdk/native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {PlainCasDocStore} from '../../tests/assembly/helpers-v010.ts';
import {cliInitial,cliFollowUp,consumeDownloadSession} from './channel-adapters.mjs';
const invalid=()=>{throw Object.assign(new Error('DIS_CLI_INVALID'),{code:'DIS_CLI_INVALID'})};
const validId=/^[A-Za-z0-9:_-]{1,80}$/;
function parse(argv){
 if(!Array.isArray(argv)||(argv.length!==6&&argv.length!==7)||
    argv.at(-2)!=='--request-id'||typeof argv.at(-1)!=='string'||
    !validId.test(argv.at(-1)))invalid();
 const rest=argv.slice(0,-2),requestId=argv.at(-1);
 return {
  initial:cliInitial(rest.slice(0,2),requestId),
  followUp:cliFollowUp(rest.slice(2))
 };
}
async function run(argv){
 const values=parse(argv); // validate before KDP load and source selection
 const f=await makeNativeFixture();
 const app=await loadDisV020Aot(f.artifact,{
  expectedDigest:f.artifact.digest,registry:f.registry,
  store:new PlainCasDocStore(),tenantId:'tenant:dis-v020-b11-cli'
 });
 try{
  const {inspected,final}=await consumeDownloadSession(app,values);
  const outcome=final??inspected;
  if(outcome.kind!=='OBSERVATION'||outcome.authority!=='NONE')invalid();
  const payload={
   kind:'OBSERVATION',channel:'cli',requestId:values.initial.requestId,
   status:outcome.value.status,disposition:outcome.disposition,authority:'NONE',
   evidenceAttested:outcome.evidence?.attested===true,
   permittedEffect:outcome.value.permittedEffect===true,
   effectDispatched:outcome.value.effectDispatched===true,
   proposal:outcome.value.proposal??null
  };
  if(payload.permittedEffect||payload.effectDispatched||payload.evidenceAttested)invalid();
  process.stdout.write(JSON.stringify(payload)+'\n');
 }finally{app.stop()}
}
run(process.argv.slice(2)).catch(e=>{
 const code=e?.code==='DIS_ADAPTER_INVALID'||e?.code==='DIS_CLI_INVALID'?'DIS_CLI_INVALID':
  e?.code==='DIS_APP_NOT_READY'?'DIS_APP_NOT_READY':'DIS_CLI_INTERNAL';
 process.stderr.write(JSON.stringify({error:code})+'\n');
 process.exitCode=2;
});
