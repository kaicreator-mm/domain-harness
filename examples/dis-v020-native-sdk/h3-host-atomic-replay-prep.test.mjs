import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,copyFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createH3HostAtomicReplayPrep} from './h3-host-atomic-replay-prep.mjs';
import {
  persistSolutionCandidate,revokeStoredCandidate
} from './snapshots/formal-tools/packages/runner/js/solution-store.mjs';

const SHA='a'.repeat(64), MODEL='b'.repeat(64), SDK='c'.repeat(64),HOST='d'.repeat(64);
const NOW=1730000000000;
const base=new URL('./',import.meta.url);
const g4=new URL('./snapshots/formal-tools/benchmarks/llm-methods/g4/',base);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const originals=[
 ['o2-durable-nonce-ledger.mjs','aa7ad81d7cb8eaa3438f98e9441b7a2e18f9e755'],
 ['o4-three-key-server-preflight.mjs','75116253598324fda47d22e0f7440c0e097cef50'],
 ['o4-candidate-consumer.mjs','bb417d6fe74fd774c5f750220e5f12759560e698']
];
const deployment=Object.freeze({
 deployedAppId:'deploy:dis-g6-h3',tenantId:'tenant:dis-g6',appId:'app:xdownload',
 selectedAotDigest:SHA,sdkDigest:SDK,hostDigest:HOST,
 target:'linux-x64-node24',
 selectedFunction:'xdownload.interaction.inspect',selectedOperation:'NONE'
});
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
 const pinnedFiles=originals.map(([name,blob])=>({
  path:fileURLToPath(new URL(name,base)),gitBlob:blob
 }));
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
function denied(x){
 assert.equal(x.replayAllowed,false);
 assert.equal(x.qualified,false);
 assert.equal(x.effectDispatched,false);
 assert.equal(x.hostCalls,0);
 assert.equal(x.authority,'NONE');
 assert.equal(x.solutionReplay,'BLOCKED_UNQUALIFIED');
}
test('H3 original O2/O4/G4 Host source pins are unchanged; no deployed identity is attested',()=>{
 for(const [name,pin] of originals){
  const bytes=readFileSync(new URL(name,base));
  assert.equal(gitBlob(bytes),pin,name);
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
test('H3 rejects altered pinned source and crash-leftover lock without cleanup',async()=>{
 await fixture(async s=>{
  const path=join(s.root,'o4-copy.mjs');
  copyFileSync(s.config.pinnedFiles[1].path,path);
  const copyConfig={...s.config,pinnedFiles:[
   s.config.pinnedFiles[0],{path,gitBlob:s.config.pinnedFiles[1].gitBlob},
   s.config.pinnedFiles[2]
  ]};
  writeFileSync(path,'tampered');
  const stale=await createH3HostAtomicReplayPrep(copyConfig).inspectAttempt(s.req);
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
