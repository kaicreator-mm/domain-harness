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
 *
 * The pinned technical sources are a canonical immutable roster: the caller
 * must pin exactly the three original O2/O4 files at their original Git blob
 * IDs, never an arbitrary caller-chosen list (no roster attestation by
 * composition). Pins are captured in a single read — the values the roster
 * validation sees are exactly the values pinned for use, so accessor,
 * Proxy or array-subclass configurations cannot split validation from use.
 * The durable root adopts O2's requireTrustedRoot scrutiny (Linux-only):
 * absolute path, owner-only root and direct parent owned by this UID, every
 * more distant ancestor owned by this UID or root and not writable by
 * another UID (root-owned sticky entries like /tmp are supported), plus a
 * parent directory fsync so the root's directory entry is durable.
 */
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {
  constants,existsSync,fsyncSync,lstatSync,mkdirSync,openSync,
  readFileSync,realpathSync,rmdirSync,closeSync,writeSync
} from 'node:fs';
import {dirname,isAbsolute,join,resolve} from 'node:path';
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
/**
 * Canonical immutable Source Pin roster (P2-01): exactly the three original
 * O2/O4 technical source files at their original Git blob IDs. A trusted H3
 * Host configuration must pin exactly this roster — never more, never fewer,
 * never re-blobbed, never substituted by caller-chosen files — so identity
 * composition cannot infer roster attestation from an arbitrary list. Each
 * entry is a bare file name; the caller-supplied absolute locations must
 * resolve to these names and their bytes must re-hash to these blobs at use.
 */
export const PINNED_SOURCE_ROSTER=Object.freeze([
  Object.freeze({file:'o2-durable-nonce-ledger.mjs',
    gitBlob:'aa7ad81d7cb8eaa3438f98e9441b7a2e18f9e755'}),
  Object.freeze({file:'o4-three-key-server-preflight.mjs',
    gitBlob:'75116253598324fda47d22e0f7440c0e097cef50'}),
  Object.freeze({file:'o4-candidate-consumer.mjs',
    gitBlob:'bb417d6fe74fd774c5f750220e5f12759560e698'})
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
const baseName=x=>{
  const s=String(x),i=Math.max(s.lastIndexOf('/'),s.lastIndexOf('\\'));
  return i<0?s:s.slice(i+1);
};
// P2-01 (R2): single-read pin capture. Every pin property is read exactly
// once, through record()'s own enumerable data-descriptor extraction, and
// the captured values are both what the roster validation sees and what
// gets pinned for use. Getters, Proxies and array subclasses therefore
// cannot serve one value to validation and another to the trusted pin set
// (no validate-then-reread phase). Any hostile shape — proxy entry, accessor
// descriptor, wrong arity, substitute/extra/missing/duplicate/re-blobbed
// entry, or a throwing property read — yields null and the constructor
// raises the documented configuration error.
function extractRosterPins(list){
  try{
    if(!Array.isArray(list)||list.length!==PINNED_SOURCE_ROSTER.length)return null;
    const out=new Array(list.length).fill(null);
    const seen=new Set();
    for(let i=0;i<list.length;i++){
      const p=record(list[i],['path','gitBlob']);
      if(!p||typeof p.path!=='string'||!p.path||
         typeof p.gitBlob!=='string'||!HEX40.test(p.gitBlob))return null;
      const file=baseName(p.path);
      const match=PINNED_SOURCE_ROSTER.findIndex(entry=>
        entry.file===file&&entry.gitBlob===p.gitBlob);
      if(match<0||seen.has(match))return null;
      seen.add(match);
      out[i]=Object.freeze({path:p.path,gitBlob:p.gitBlob});
    }
    return seen.size===list.length?Object.freeze(out):null;
  }catch{return null}
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
/**
 * P2-02: the H3 durable root adopts O2's requireTrustedRoot scrutiny.
 * Absolute path only; the root and its direct parent must be owner-only and
 * owned by this UID; every more distant ancestor must be owned by this UID
 * or by root and must not be writable by another UID (root-owned sticky
 * entries like /tmp are supported, mirroring O2); each level is a real,
 * non-symlink directory whose realpath equals the configured segment; and
 * the parent directory is fsynced so the root's entry is durable before any
 * marker is accepted. This is a path preflight for one trusted local host,
 * not a defense against hostile same-UID renames or multi-host storage.
 */
function durableRoot(root){
  // P2-02 (R2): mirror O2's explicit platform gate — the UID/ancestor/parent
  // fsync scrutiny is defined for one trusted local Linux filesystem; other
  // platforms fail closed instead of passing on weaker semantics.
  if(process.platform!=='linux')return false;
  if(typeof root!=='string'||!isAbsolute(root))return false;
  try{
    const start=resolve(root),parent=dirname(start);
    if(start===parent)return false;
    const uid=typeof process.getuid==='function'?process.getuid():null;
    let path=start,depth=0;
    while(true){
      const s=lstatSync(path);
      if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(path)!==path)
        return false;
      if(depth<2){
        if((s.mode&0o077)!==0||(uid!==null&&s.uid!==uid))return false;
      }else{
        const trustedOwner=uid===null?s.uid===0:s.uid===uid||s.uid===0;
        const writable=(s.mode&0o022)!==0;
        const rootOwnedSticky=s.uid===0&&(s.mode&0o1000)!==0;
        if(!trustedOwner||(writable&&!rootOwnedSticky))return false;
      }
      if(dirname(path)===path)break;
      path=dirname(path);depth++;
    }
    let dirFd;
    try{
      dirFd=openSync(parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
      fsyncSync(dirFd);
    }finally{
      if(dirFd!==undefined){try{closeSync(dirFd)}catch{/* already failing */}}
    }
    return true;
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
  // Pins are captured once, from the same reads the roster validation makes:
  // caller-supplied identity has no authority at use and no second chance to
  // differ between validation and use.
  const pins=extractRosterPins(pinnedFiles);
  if(!durableRoot(ledgerDir)||typeof storeDir!=='string'||!storeDir||
     typeof provenancePath!=='string'||!provenancePath||
     !deploymentValid(deployment)||!provenanceValid(expected)||
     !pins||
     typeof clock!=='function')
    throw Error('H3_TRUSTED_SINGLE_HOST_CONFIGURATION_REQUIRED');
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
