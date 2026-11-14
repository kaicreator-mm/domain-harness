/**
 * DIS 0.2 O2 optional Host-owned Linux local-filesystem nonce ledger.
 * This is only a crash-restart replay primitive for a trusted, single-host
 * local filesystem. It is NOT tenant attestation, business validation,
 * distributed consensus, Experience qualification, or an Effect authority.
 *
 * Host MUST pre-provision both an absolute owner-only 0700 root and its
 * owner-only 0700 direct parent on a durable local filesystem. All more
 * distant ancestors must be Host- or root-owned and not writable by another
 * UID (root-owned sticky directories like /tmp are explicitly supported).
 * This module NEVER mkdir(s) the ledger root. It fsyncs the parent before accepting any
 * nonce to make the root directory entry durable. More distant ancestors are
 * installed durably by trusted Host provisioning. No untrusted same-UID actor
 * may mutate the path hierarchy. This is a path preflight, not a directory-FD
 * capability or a defense against same-UID hostile concurrent renames. Markers are file+directory fsynced.
 * Shared/NFS/container-ephemeral volumes and hostile same-UID directory
 * renaming are NOT proven safe; other platforms fail closed.
 */
import {createHash} from 'node:crypto';
import {constants,closeSync,fsyncSync,lstatSync,openSync,realpathSync,writeSync} from 'node:fs';
import {isAbsolute,resolve,join,dirname} from 'node:path';

const TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const HEX64=/^[a-f0-9]{64}$/;
const PREFIX='dis.o2.nonce/v1\0';

export function createO2DurableNonceLedger({directory,scope,expectedAotDigest}={}){
 if(process.platform!=='linux'||typeof directory!=='string'||!isAbsolute(directory)||
  typeof scope!=='string'||!TOKEN.test(scope)||typeof expectedAotDigest!=='string'||!HEX64.test(expectedAotDigest))
  throw Error('O2_NONCE_LEDGER_HOST_CONFIGURATION');
 const root=resolve(directory),parent=dirname(root);
 // Every ancestor must resist replacement by an untrusted UID, not only
 // root and its direct parent. Root-owned sticky /tmp is permitted because
 // sticky rename/unlink semantics protect an entry owned by this Host.
 // Host still owns the same-UID threat boundary; no multi-host attestations.
 function requireTrustedRoot(){
  if(root===parent)throw Error('O2_NONCE_LEDGER_UNTRUSTED_DIRECTORY');
  const uid=typeof process.getuid==='function'?process.getuid():null;
  let path=root,depth=0;
  while(true){
   const s=lstatSync(path);
   if(!s.isDirectory()||s.isSymbolicLink()||realpathSync(path)!==path)
    throw Error('O2_NONCE_LEDGER_UNTRUSTED_DIRECTORY');
   if(depth<2){
    if((s.mode&0o077)!==0||(uid!==null&&s.uid!==uid))
     throw Error('O2_NONCE_LEDGER_UNTRUSTED_DIRECTORY');
   }else{
    const trustedOwner=uid===null?s.uid===0:s.uid===uid||s.uid===0;
    const writable=(s.mode&0o022)!==0;
    const rootOwnedSticky=s.uid===0&&(s.mode&0o1000)!==0;
    if(!trustedOwner||(writable&&!rootOwnedSticky))
     throw Error('O2_NONCE_LEDGER_UNTRUSTED_DIRECTORY');
   }
   if(dirname(path)===path)break;
   path=dirname(path);depth++;
  }
 }
 // Never create an uncommitted root implicitly. A power loss must not be
 // able to erase this directory entry and allow a previously issued nonce.
 let parentFd;
 try{
  requireTrustedRoot();
  parentFd=openSync(parent,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
  fsyncSync(parentFd);
 }catch{throw Error('O2_NONCE_LEDGER_UNTRUSTED_DIRECTORY')}
 finally{if(parentFd!==undefined){try{closeSync(parentFd)}catch{}}}
 function mark(phase,runId){
  if(typeof runId!=='string'||!TOKEN.test(runId))return false;
  let fd,dirfd;
  try{
   requireTrustedRoot();
   const filename=createHash('sha256').update(PREFIX).update(scope).update('\0').update(expectedAotDigest)
    .update('\0').update(phase).update('\0').update(runId).digest('hex')+'.nonce';
   fd=openSync(join(root,filename),constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
   writeSync(fd,'dis.o2.nonce/v1\n');
   fsyncSync(fd);closeSync(fd);fd=undefined;
   dirfd=openSync(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
   fsyncSync(dirfd);closeSync(dirfd);dirfd=undefined;
   return true;
  }catch{return false}
  finally{
   if(fd!==undefined){try{closeSync(fd)}catch{}}
   if(dirfd!==undefined){try{closeSync(dirfd)}catch{}}
  }
 }
 return Object.freeze({scope,expectedAotDigest,reserve:runId=>mark('issuer',runId),consume:runId=>mark('verifier',runId)});
}
