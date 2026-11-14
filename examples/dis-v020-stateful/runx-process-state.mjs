/** DIS B12/R58: genuine second OS process, same file-backed KDP SQLite.
 * Runx source owns its PROCESS_LOCAL presence facts, not the SDK/KDP store.
 * No fabricated durable Domain-state recovery or execution lease.
 */
import {makeNativeFixture} from '../dis-v020-native-sdk/native-fixture.mjs';
import {loadDisV020Aot} from '@kaicreator/domain-harness-microkernel/dis-v020';
import {openPhysicalStore} from '../dis-v020-real-aot-bridge/physical-store.mjs';
const reject=()=>{throw Object.assign(new Error('DIS_STATE_PROCESS_INVALID'),{code:'DIS_STATE_PROCESS_INVALID'})};
const valid=x=>typeof x==='string'&&/^[A-Za-z0-9:_-]{1,60}$/.test(x);
async function main(argv){
 const [sqlitePath,mode,agentId,incarnationId]=argv;
 if(!sqlitePath||!['inspect','observe','forged'].includes(mode)||(
   mode==='inspect'?argv.length!==2:argv.length!==4||!valid(agentId)||!valid(incarnationId)
 ))reject();
 const f=await makeNativeFixture();
 const opened=await openPhysicalStore(sqlitePath);
 let app;
 try{
  app=await loadDisV020Aot(f.artifact,{
   expectedDigest:f.artifact.digest,registry:f.registry,store:opened.docs,
   tenantId:'tenant:b12-shared-kdp-physical-file'
  });
  const observation=await app.invoke('runx.createPresenceObserver',()=>'2026-11-10T00:00:00Z',
   {expectedContractVersion:'1.0.0'});
  if(observation.kind!=='OBSERVATION'||observation.authority!=='NONE'||
     observation.handle?.lifetime!=='PROCESS_LOCAL')reject();
  const value=observation.value;
  const before=value.latest();
  if(mode!=='inspect'){
   value.observe({agent_id:agentId,agent_incarnation_id:incarnationId,
    capability:{capability_id:'execute'}},{agent_id:mode==='forged'?'different-agent':agentId});
  }
  const after=value.latest();
  if(after&&('execution_authorized' in after||'leaseId' in after))reject();
  process.stdout.write(JSON.stringify({
   kind:observation.kind,authority:observation.authority,
   handleLifetime:observation.handle.lifetime,
   evidenceAttested:observation.evidence.attested,
   before,after,list:value.list(),source:'kaicreator-mm/runx',
   physicalKdpStore:'SQLITE_FILE_REOPENED_NO_DOMAIN_STATE_AUTO_RESTORE',
   effectDispatched:false
  })+'\n');
 }finally{app?.stop();await opened.physical.close()}
}
main(process.argv.slice(2)).catch(e=>{
 process.stderr.write(JSON.stringify({error:e?.code==='DIS_STATE_PROCESS_INVALID'?
  'DIS_STATE_PROCESS_INVALID':'DIS_STATE_PROCESS_INTERNAL'})+'\n');
 process.exitCode=2;
});
