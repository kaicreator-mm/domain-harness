/**
 * G6/H3 single-local-host NEGATIVE-ONLY replay admission preparation.
 *
 * A technical DIS/O4 candidate, even with source and deployed module pins,
 * never becomes a qualified G4 Solution, a Host permit, or an Effect capability.
 * All public results are refusals. No invoke/dispatch callback exists.
 *
 * The durable attempt/revocation fence is O_EXCL + fsync on one trusted local
 * filesystem. A crash leaving a lock refuses future work; never steals a lock.
 * No cross-host/NFS or hostile same-UID/clock guarantees are asserted.
 */
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {
  constants,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,
  readFileSync,realpathSync,rmdirSync,closeSync,writeSync
} from 'node:fs';
import {join} from 'node:path';
import {inspectStoredReplay} from
  './snapshots/formal-tools/packages/runner/js/solution-store.mjs';

const HEX64=/^[a-f0-9]{64}$/;
const HEX40=/^[a-f0-9]{40}$/;
const TOKEN=/^[A-Za-z][A-Za-z0-9._:/-]{0,127}$/;
const DEPLOYMENT_FIELDS=Object.freeze([
  'deployedAppId','tenantId','appId','selectedAotDigest',
  'sdkDigest','hostDigest','target','selectedFunction','selectedOperation'
]);
const PROVENANCE_FIELDS=Object.freeze([
  'source_id','source_sha256','oracle_id','oracle_sha256',
  'model_sha256','tool_id','tool_version','tool_binary_sha256','evidence_sha256'
]);
const ATTEMPT_FIELDS=Object.freeze([
  'candidateSha256','nonce','expiresAtMs','deployment'
]);
const deny=(status,reason)=>Object.freeze({
  status,reason,qualified:false,replayAllowed:false,
  solutionReplay:'BLOCKED_UNQUALIFIED',effectDispatched:false,
  authority:'NONE',hostCalls:0
});
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const gitBlob=bytes=>createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');

function record(value,keys){
  try{
    if(!value||typeof value!=='object'||Array.isArray(value)||
       types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)return null;
    const own=Reflect.ownKeys(value);
    if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
    const out=Object.create(null);
    for(const key of keys){
      const d=Object.getOwnPropertyDescriptor(value,key);
      if(!d||d.enumerable!==true||!Object.hasOwn(d,'value'))return null;
      out[key]=d.value;
    }
    return out;
  }catch{return null}
}
function same(a,b,keys){return keys.every(k=>a[k]===b[k])}
function deploymentValid(x){
  return x&&x.deployedAppId&&TOKEN.test(x.deployedAppId)&&
    x.tenantId&&TOKEN.test(x.tenantId)&&
    x.appId&&TOKEN.test(x.appId)&&
    x.selectedAotDigest&&HEX64.test(x.selectedAotDigest)&&
    x.sdkDigest&&HEX64.test(x.sdkDigest)&&
    x.hostDigest&&HEX64.test(x.hostDigest)&&
    x.target==='linux-x64-node24'&&
    x.selectedFunction==='xdownload.interaction.inspect'&&
    x.selectedOperation==='NONE';
}
function provenanceValid(x){
  return x&&TOKEN.test(x.source_id)&&HEX64.test(x.source_sha256)&&
    TOKEN.test(x.oracle_id)&&HEX64.test(x.oracle_sha256)&&
    HEX64.test(x.model_sha256)&&TOKEN.test(x.tool_id)&&
    typeof x.tool_version==='string'&&x.tool_version.length>0&&
    x.tool_version.length<=80&&HEX64.test(x.tool_binary_sha256)&&
    HEX64.test(x.evidence_sha256);
}
function durableCreate(root,name,content){
  let fd,dirFd;
  try{
    fd=openSync(join(root,name),
      constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
    const bytes=Buffer.from(content);
    let position=0;
    while(position<bytes.length){
      const written=writeSync(fd,bytes,position,bytes.length-position);
      if(written<=0)throw Error('H3_WRITE_INCOMPLETE');
      position+=written;
    }
    fsyncSync(fd);closeSync(fd);fd=undefined;
    dirFd=openSync(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    fsyncSync(dirFd);closeSync(dirFd);dirFd=undefined;
    return true;
  }catch{return false}
  finally{
    if(fd!==undefined){try{closeSync(fd)}catch{}}
    if(dirFd!==undefined){try{closeSync(dirFd)}catch{}}
  }
}
function durableRoot(root){
  if(typeof root!=='string'||root.length<1)return false;
  try{
    const s=lstatSync(root);
    return s.isDirectory()&&!s.isSymbolicLink()&&
      realpathSync(root)===root&&
      (s.mode&0o077)===0;
  }catch{return false}
}

/**
 * Trusted Host configuration is NOT a Product-approved deployed identity.
 * The selected SDK/Host digests are technical pins; full binary attestation,
 * independent signatures and formal root adoption remain absent.
 */
export function createH3HostAtomicReplayPrep({
  ledgerDir,storeDir,provenancePath,expectedDeployment,
  expectedProvenance,pinnedFiles,clock=Date.now
}={}){
  const deployment=record(expectedDeployment,DEPLOYMENT_FIELDS);
  const expected=record(expectedProvenance,PROVENANCE_FIELDS);
  if(!durableRoot(ledgerDir)||typeof storeDir!=='string'||!storeDir||
     typeof provenancePath!=='string'||!provenancePath||
     !deploymentValid(deployment)||!provenanceValid(expected)||
     !Array.isArray(pinnedFiles)||pinnedFiles.length<3||
     pinnedFiles.some(x=>!x||typeof x.path!=='string'||!x.path||
       typeof x.gitBlob!=='string'||!HEX40.test(x.gitBlob))||
     typeof clock!=='function')
    throw Error('H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED');

  // Copy technical pins once: caller-supplied identity has no authority at use.
  const pins=pinnedFiles.map(p=>Object.freeze({path:p.path,gitBlob:p.gitBlob}));
  Object.freeze(pins);
  function pinnedSourceCurrent(){
    try{
      return pins.every(p=>{
        const s=lstatSync(p.path);
        return s.isFile()&&!s.isSymbolicLink()&&
          gitBlob(readFileSync(p.path))===p.gitBlob;
      });
    }catch{return false}
  }
  function candidateKey(candidateSha256,nonce){
    return sha256(Buffer.from('dis.h3.attempt/v1\0'+
      deployment.tenantId+'\0'+deployment.deployedAppId+'\0'+
      candidateSha256+'\0'+nonce));
  }
  function revoke({candidateSha256,nonce}={}){
    if(!HEX64.test(candidateSha256)||typeof nonce!=='string'||!TOKEN.test(nonce))
      return deny('BLOCKED','H3_REVOCATION_INPUT_INVALID');
    const name=candidateKey(candidateSha256,nonce)+'.revoked';
    if(existsSync(join(ledgerDir,name)))return deny('REVOKED','H3_ALREADY_REVOKED');
    if(!durableRoot(ledgerDir)||!durableCreate(ledgerDir,name,'dis.h3.revoked/v1\n'))
      return deny('UNKNOWN','H3_REVOCATION_DURABILITY_FAILED');
    return deny('REVOKED','H3_DURABLE_REVOCATION_RECORDED');
  }
  async function inspectAttempt(input){
    const attempt=record(input,ATTEMPT_FIELDS);
    if(!attempt)return deny('BLOCKED','H3_ATTEMPT_RECORD_UNSAFE');
    const presented=record(attempt.deployment,DEPLOYMENT_FIELDS);
    if(!presented||!same(presented,deployment,DEPLOYMENT_FIELDS))
      return deny('STALE','H3_DEPLOYMENT_IDENTITY_DRIFT');
    if(!HEX64.test(attempt.candidateSha256)||
       typeof attempt.nonce!=='string'||!TOKEN.test(attempt.nonce))
      return deny('BLOCKED','H3_CANDIDATE_OR_NONCE_INVALID');
    let now;
    try{now=clock()}catch{return deny('UNKNOWN','H3_TRUSTED_CLOCK_UNAVAILABLE')}
    if(!Number.isSafeInteger(now)||!Number.isSafeInteger(attempt.expiresAtMs)||
       attempt.expiresAtMs<=now||attempt.expiresAtMs>now+60000)
      return deny('EXPIRED','H3_EXPIRED_OR_UNBOUNDED');
    if(!durableRoot(ledgerDir))
      return deny('UNKNOWN','H3_HOST_DURABLE_ROOT_UNAVAILABLE');
    if(!pinnedSourceCurrent())
      return deny('STALE','H3_O2_O4_HOST_SOURCE_BLOB_DRIFT');
    const key=candidateKey(attempt.candidateSha256,attempt.nonce);
    const lock=join(ledgerDir,key+'.lock');
    const revoked=join(ledgerDir,key+'.revoked');
    const spent=join(ledgerDir,key+'.attempt');
    if(existsSync(revoked))return deny('REVOKED','H3_DURABLE_REVOCATION');
    try{mkdirSync(lock,{mode:0o700})}
    catch{return deny('BLOCKED','H3_CONCURRENT_OR_CRASH_LOCK')}
    try{
      if(existsSync(revoked))return deny('REVOKED','H3_DURABLE_REVOCATION');
      if(existsSync(spent))return deny('BLOCKED','H3_REPLAY_ALREADY_CONSUMED');
      // Current provenance is read from the Host-configured file, NEVER request.
      let json,actual;
      try{
        json=readFileSync(provenancePath,'utf8');
        const p=JSON.parse(json);
        actual=record(Object.fromEntries(PROVENANCE_FIELDS.map(k=>[k,p[k]])),PROVENANCE_FIELDS);
      }catch{return deny('UNKNOWN','H3_G4_PROVENANCE_UNREADABLE')}
      if(!actual||!provenanceValid(actual)||!same(actual,expected,PROVENANCE_FIELDS))
        return deny('STALE','H3_SOURCE_ORACLE_TOOL_EVIDENCE_DRIFT');
      if(!pinnedSourceCurrent())
        return deny('STALE','H3_SELECTED_HOST_SOURCE_CHANGED');
      // Commit durable one-time NEGATIVE attempt before the async G4 lookup.
      if(!durableCreate(ledgerDir,key+'.attempt','dis.h3.attempt/v1\n'))
        return deny('UNKNOWN','H3_ATOMIC_ATTEMPT_WRITE_FAILED');
      let store;
      try{
        store=await inspectStoredReplay({
          store_dir:storeDir,candidate_sha256:attempt.candidateSha256,
          current_provenance_json:json
        });
      }catch{return deny('UNKNOWN','H3_G4_STORE_UNAVAILABLE')}
      // Recheck after possible async I/O, while keeping the same local lock.
      if(existsSync(revoked))return deny('REVOKED','H3_CONCURRENT_REVOCATION_WON');
      try{if(clock()>=attempt.expiresAtMs)return deny('EXPIRED','H3_EXPIRED_DURING_INSPECTION')}
      catch{return deny('UNKNOWN','H3_TRUSTED_CLOCK_UNAVAILABLE')}
      if(!pinnedSourceCurrent())return deny('STALE','H3_SOURCE_CHANGED_DURING_INSPECTION');
      try{
        const after=JSON.parse(readFileSync(provenancePath,'utf8'));
        if(!same(after,expected,PROVENANCE_FIELDS))
          return deny('STALE','H3_PROVENANCE_CHANGED_DURING_INSPECTION');
      }catch{return deny('UNKNOWN','H3_G4_PROVENANCE_UNREADABLE')}
      if(store.status==='INVALIDATED')return deny('REVOKED','H3_G4_DURABLE_TOMBSTONE');
      if(store.status==='STALE')return deny('STALE','H3_G4_CANDIDATE_DRIFT');
      if(store.status!=='REPLAY_BLOCKED_UNQUALIFIED'||
         store.fingerprint!==attempt.candidateSha256)
        return deny('BLOCKED','H3_G4_NOT_CURRENT_OR_UNQUALIFIED');
      // There is intentionally NO success/permit/lease/dispatch branch.
      return deny('BLOCKED','H3_QUALIFICATION_AND_HOST_ROOTS_NOT_ADMITTED');
    }finally{
      try{rmdirSync(lock)}catch{/* orphan lock stays deny-only */ }
    }
  }
  return Object.freeze({
    inspectAttempt,revoke,
    scope:'SINGLE_TRUSTED_LOCAL_HOST_NEGATIVE_ONLY',
    qualification:'NOT_ADMITTED',effectAuthorized:false
  });
}
