import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,copyFileSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createH3HostAtomicReplayPrep,PINNED_SOURCE_ROSTER} from './h3-host-atomic-replay-prep.mjs';
import {
  persistSolutionCandidate,revokeStoredCandidate
} from './snapshots/formal-tools/packages/runner/js/solution-store.mjs';

const SHA='a'.repeat(64), MODEL='b'.repeat(64), SDK='c'.repeat(64),HOST='d'.repeat(64);
const NOW=1730000000000;
const base=new URL('./',import.meta.url);
const g4=new URL('./snapshots/formal-tools/benchmarks/llm-methods/g4/',base);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const POSIX_ONLY=process.platform==='win32'?'POSIX-only owner/ancestor filesystem scrutiny':false;
const deployment=Object.freeze({
 deployedAppId:'deploy:dis-g6-h3',tenantId:'tenant:dis-g6',appId:'app:xdownload',
 selectedAotDigest:SHA,sdkDigest:SDK,hostDigest:HOST,
 target:'linux-x64-node24',
 selectedFunction:'xdownload.interaction.inspect',selectedOperation:'NONE'
});
// Synthetic but well-formed provenance for construction-only configurations.
// It is expressly NON-AUTHORIZING test data, like the synthetic deployment.
const provenance=Object.freeze({
 source_id:'src:xdownload-interaction',source_sha256:'1'.repeat(64),
 oracle_id:'oracle:tech-eval',oracle_sha256:'2'.repeat(64),
 model_sha256:MODEL,tool_id:'tool:z3',
 tool_version:'5.1.0',tool_binary_sha256:'4'.repeat(64),
 evidence_sha256:'5'.repeat(64)
});
const rosterPins=()=>PINNED_SOURCE_ROSTER.map(entry=>({
 path:fileURLToPath(new URL(entry.file,base)),gitBlob:entry.gitBlob
}));
const provenanceKeys=[
 'source_id','source_sha256','oracle_id','oracle_sha256',
 'model_sha256','tool_id','tool_version','tool_binary_sha256','evidence_sha256'
];

async function fixture(visit){
 const root=mkdtempSync(join(tmpdir(),'g6-h3-atomic-'));
 const ledgerDir=join(root,'ledger'),storeDir=join(root,'store');
 mkdirSync(ledgerDir,{mode:0o700});
 mkdirSync(storeDir,{mode:0o700});
 const problem=readFileSync(new URL('PROBLEM.json',g4),'utf8');
 const method=readFileSync(new URL('METHOD.json',g4),'utf8');
 const provBytes=readFileSync(new URL('PROVENANCE.json',g4),'utf8');
 const prov=JSON.parse(provBytes);
 const current=Object.fromEntries(provenanceKeys.map(k=>[k,prov[k]]));
 const provenancePath=join(root,'G4_PROVENANCE.json');
 writeFileSync(provenancePath,provBytes);
 const store=await persistSolutionCandidate({
  store_dir:storeDir,problem_json:problem,method_json:method,
  provenance_json:provBytes
 });
 assert.equal(store.status,'CANDIDATE_PERSISTED',JSON.stringify(store));
 const pinnedFiles=rosterPins();
 const config={ledgerDir,storeDir,provenancePath,
  expectedDeployment:deployment,expectedProvenance:current,
  pinnedFiles,clock:()=>NOW};
 const req={
  candidateSha256:store.candidate_sha256,nonce:'replay:fixed-nonce',
  expiresAtMs:NOW+2500,deployment
 };
 try{
  await visit({root,ledgerDir,storeDir,config,req,store,prov,provenancePath,
    guard:()=>createH3HostAtomicReplayPrep(config)});
 }finally{rmSync(root,{recursive:true,force:true})}
}
// Construction-only fixture: no G4 store, no attempt execution. Exercises the
// trusted Host configuration boundary (canonical roster + durable root).
async function configFixture(visit){
 const root=mkdtempSync(join(tmpdir(),'g6-h3-config-'));
 const ledgerDir=join(root,'ledger');
 mkdirSync(ledgerDir,{mode:0o700});
 const config={ledgerDir,storeDir:join(root,'store'),
  provenancePath:join(root,'prov.json'),
  expectedDeployment:deployment,expectedProvenance:provenance,
  pinnedFiles:rosterPins(),clock:()=>NOW};
 try{
  await visit({root,ledgerDir,config,
    guard:()=>createH3HostAtomicReplayPrep(config)});
 }finally{rmSync(root,{recursive:true,force:true})}
}
function denied(x){
 assert.equal(x.replayAllowed,false);
 assert.equal(x.qualified,false);
 assert.equal(x.effectDispatched,false);
 assert.equal(x.hostCalls,0);
 assert.equal(x.authority,'NONE');
 assert.equal(x.solutionReplay,'BLOCKED_UNQUALIFIED');
}
test('H3 canonical roster equals actual O2/O4 source bytes; no deployed identity is attested',()=>{
 assert.equal(PINNED_SOURCE_ROSTER.length,3);
 assert.ok(Object.isFrozen(PINNED_SOURCE_ROSTER)&&
  PINNED_SOURCE_ROSTER.every(e=>Object.isFrozen(e)));
 for(const entry of PINNED_SOURCE_ROSTER){
  const bytes=readFileSync(new URL(entry.file,base));
  assert.equal(gitBlob(bytes),entry.gitBlob,entry.file);
 }
 assert.equal(deployment.selectedOperation,'NONE');
});

test('H3 real persisted G4 unqualified candidate never produces replay or Effect',async()=>{
 await fixture(async s=>{
  const gate=s.guard();
  assert.equal(gate.qualification,'NOT_ADMITTED');
  assert.equal(gate.effectAuthorized,false);
  const result=await gate.inspectAttempt(s.req);
  denied(result);
  assert.equal(result.status,'BLOCKED');
  assert.equal(result.reason,'H3_QUALIFICATION_AND_HOST_ROOTS_NOT_ADMITTED');
  assert.equal(gate.scope,'SINGLE_TRUSTED_LOCAL_HOST_NEGATIVE_ONLY');
 });
});
test('H3 same-nonce concurrent requests, durable restart and double-consumption all refuse',async()=>{
 await fixture(async s=>{
  const gate=s.guard();
  const [a,b]=await Promise.all([
   gate.inspectAttempt(s.req),gate.inspectAttempt(s.req)
  ]);
  denied(a);denied(b);
  assert.ok([a.reason,b.reason].includes('H3_CONCURRENT_OR_CRASH_LOCK')||
    [a.reason,b.reason].includes('H3_REPLAY_ALREADY_CONSUMED'));
  const rebooted=s.guard();
  const replay=await rebooted.inspectAttempt(s.req);
  denied(replay);
  assert.equal(replay.reason,'H3_REPLAY_ALREADY_CONSUMED');
 });
});
test('H3 revocation before, during and after an attempt never opens a permit',async()=>{
 await fixture(async s=>{
  const gate=s.guard();
  const before=gate.revoke({candidateSha256:s.req.candidateSha256,nonce:'replay:before'});
  denied(before);
  assert.equal(before.status,'REVOKED');
  const result=await gate.inspectAttempt({...s.req,nonce:'replay:before'});
  denied(result);
  assert.equal(result.reason,'H3_DURABLE_REVOCATION');
  const pending=gate.inspectAttempt({...s.req,nonce:'replay:during'});
  const revoke=gate.revoke({candidateSha256:s.req.candidateSha256,nonce:'replay:during'});
  denied(revoke);
  denied(await pending);
  const after=await s.guard().inspectAttempt({...s.req,nonce:'replay:during'});
  denied(after);
  assert.equal(after.status,'REVOKED');
  const success=await gate.inspectAttempt({...s.req,nonce:'replay:after'});
  denied(success);
  const revoked=gate.revoke({candidateSha256:s.req.candidateSha256,nonce:'replay:after'});
  denied(revoked);
  const blocked=await s.guard().inspectAttempt({...s.req,nonce:'replay:after'});
  denied(blocked);
  assert.equal(blocked.status,'REVOKED');
 });
});
test('H3 expiry, old candidate SHA and deployment/AOT/SDK/Host mismatches refuse',async()=>{
 await fixture(async s=>{
  const gate=s.guard();
  const cases=[
   [{...s.req,expiresAtMs:NOW-1},'EXPIRED'],
   [{...s.req,expiresAtMs:NOW+61000},'EXPIRED'],
   [{...s.req,nonce:'replay:wrong',candidateSha256:'f'.repeat(64)},'BLOCKED'],
   [{...s.req,deployment:{...deployment,selectedAotDigest:'f'.repeat(64)}},'STALE'],
   [{...s.req,deployment:{...deployment,sdkDigest:'f'.repeat(64)}},'STALE'],
   [{...s.req,deployment:{...deployment,hostDigest:'f'.repeat(64)}},'STALE'],
   [{...s.req,deployment:{...deployment,tenantId:'tenant:other'}},'STALE'],
   [{...s.req,deployment:{...deployment,deployedAppId:'deploy:old'}},'STALE']
  ];
  for(const [request,status] of cases){
   const result=await gate.inspectAttempt(request);
   denied(result);assert.equal(result.status,status,result.reason);
  }
 });
});
test('H3 G4 Source/Oracle/Tool/Evidence drift and actual Store revocation refuse',async()=>{
 await fixture(async s=>{
  const keys=['source_sha256','oracle_sha256','tool_version',
    'tool_binary_sha256','evidence_sha256','model_sha256'];
  for(const key of keys){
   const drift={...s.prov,[key]:key==='tool_version'?'9.9.9':'f'.repeat(64)};
   writeFileSync(s.provenancePath,JSON.stringify(drift));
   const result=await s.guard().inspectAttempt({...s.req,nonce:'replay:drift:'+key});
   denied(result);
   assert.equal(result.status,'STALE',key+': '+result.reason);
   assert.equal(result.reason,'H3_SOURCE_ORACLE_TOOL_EVIDENCE_DRIFT');
  }
  writeFileSync(s.provenancePath,JSON.stringify(s.prov));
  const revoked=await revokeStoredCandidate({
   store_dir:s.storeDir,candidate_sha256:s.req.candidateSha256,
   reason:'ORACLE_REVOKED'
  });
  assert.equal(revoked.status,'INVALIDATED');
  const result=await s.guard().inspectAttempt({...s.req,nonce:'replay:g4-tombstone'});
  denied(result);
  assert.equal(result.status,'REVOKED');
  assert.equal(result.reason,'H3_G4_DURABLE_TOMBSTONE');
 });
});
test('H3 accepts the canonical roster and refuses substitutes, extras, missing, duplicate or re-blobbed pins',{skip:POSIX_ONLY},()=>
 configFixture(s=>{
  assert.doesNotThrow(()=>s.guard());
  const pins=s.config.pinnedFiles;
  const withSubstitute=[
   pins[0],pins[1],
   {path:join(s.root,'stand-in.mjs'),gitBlob:pins[2].gitBlob}];
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,pinnedFiles:withSubstitute}),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,
    pinnedFiles:[...pins,{path:pins[0].path,gitBlob:pins[0].gitBlob}]}),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,pinnedFiles:pins.slice(0,2)}),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,
    pinnedFiles:[pins[0],pins[0],pins[2]]}),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,
    pinnedFiles:[pins[0],{...pins[1],gitBlob:'f'.repeat(40)},pins[2]]}),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,
    pinnedFiles:[pins[0],{...pins[1],path:join(s.root,'renamed-preflight.mjs')},pins[2]]}),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
 }));
test('H3 rejects altered pinned source bytes at a canonical name and crash-leftover locks without cleanup',async()=>{
 await fixture(async s=>{
  const tamperedDir=join(s.root,'tampered');
  mkdirSync(tamperedDir,{mode:0o700});
  const tamperedPath=join(tamperedDir,'o4-three-key-server-preflight.mjs');
  copyFileSync(s.config.pinnedFiles[1].path,tamperedPath);
  writeFileSync(tamperedPath,'tampered');
  const driftConfig={...s.config,pinnedFiles:[
   s.config.pinnedFiles[0],{path:tamperedPath,gitBlob:s.config.pinnedFiles[1].gitBlob},
   s.config.pinnedFiles[2]
  ]};
  const stale=await createH3HostAtomicReplayPrep(driftConfig).inspectAttempt(s.req);
  denied(stale);
  assert.equal(stale.reason,'H3_O2_O4_HOST_SOURCE_BLOB_DRIFT');
  const key=sha(Buffer.from('dis.h3.attempt/v1\0'+deployment.tenantId+
    '\0'+deployment.deployedAppId+'\0'+s.req.candidateSha256+'\0'+s.req.nonce));
  const lock=join(s.ledgerDir,key+'.lock');
  mkdirSync(lock,{mode:0o700});
  const refusal=await s.guard().inspectAttempt(s.req);
  denied(refusal);
  assert.equal(refusal.reason,'H3_CONCURRENT_OR_CRASH_LOCK');
  rmSync(lock,{recursive:true});
 });
});
test('H3 refuses symlinked or world-writable nonce storage',async()=>{
 await fixture(async s=>{
  const weak=join(s.root,'weak');
  mkdirSync(weak,{mode:0o777});
  // Current umask can mask chmod-on-create; explicitly enforce 0777.
  const {chmodSync,symlinkSync}=await import('node:fs');
  chmodSync(weak,0o777);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,ledgerDir:weak}),
    /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  const link=join(s.root,'linked');
  symlinkSync(s.ledgerDir,link);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,ledgerDir:link}),
    /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
 });
});
test('H3 durable root adopts O2 ancestor scrutiny: nonsticky writable distant ancestor refuses, private chain restores',{skip:POSIX_ONLY},async()=>{
 await configFixture(async s=>{
  const unsafe=join(s.root,'untrusted-grandparent');
  const direct=join(unsafe,'private-parent'),ledger=join(direct,'ledger');
  mkdirSync(unsafe,{mode:0o700});
  mkdirSync(direct,{mode:0o700});
  mkdirSync(ledger,{mode:0o700});
  const away={...s.config,ledgerDir:ledger};
  assert.doesNotThrow(()=>createH3HostAtomicReplayPrep(away));
  chmodSync(unsafe,0o777);
  assert.throws(()=>createH3HostAtomicReplayPrep(away),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  chmodSync(unsafe,0o700);
  assert.doesNotThrow(()=>createH3HostAtomicReplayPrep(away));
 });
});
test('H3 durable root refuses world-writable direct parent, non-absolute path and filesystem root',{skip:POSIX_ONLY},()=>
 configFixture(s=>{
  chmodSync(s.root,0o777);
  assert.throws(()=>s.guard(),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  chmodSync(s.root,0o700);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,ledgerDir:'relative/ledger'}),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
  assert.throws(()=>createH3HostAtomicReplayPrep({...s.config,ledgerDir:'/'}),
   /H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED/);
 }));
