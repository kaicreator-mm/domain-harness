/**
 * DIS 0.2 O2 optional Host-owned Linux local-filesystem nonce ledger.
 * This is only a crash-restart replay primitive for a trusted, single-host
 * local filesystem. It is NOT tenant attestation, business validation,
 * distributed consensus, Experience qualification, or an Effect authority.
 *
 * Host owns an absolute 0700 directory on a local filesystem with durable
 * fsync semantics and no other same-UID actors modifying the directory.
 * Shared/NFS/container-ephemeral volumes and hostile same-UID directory
 * renaming are NOT proven safe; other platforms fail closed.
 */
import {createHash} from 'node:crypto';
import {constants,closeSync,fsyncSync,lstatSync,mkdirSync,openSync,realpathSync,writeSync} from 'node:fs';
import {isAbsolute,resolve,join} from 'node:path';

const TOKEN=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const HEX64=/^[a-f0-9]{64}$/;
const PREFIX='dis.o2.nonce/v1\0';

export function createO2DurableNonceLedger({directory,scope,expectedAotDigest}={}){
 if(process.platform!=='linux'||typeof directory!=='string'||!isAbsolute(directory)||
  !TOKEN.test(scope)||typeof scope!=='string'||typeof expectedAotDigest!=='string'||!HEX64.test(expectedAotDigest))
  throw Error('O2_NONCE_LEDGER_HOST_CONFIGURATION');
 const root=resolve(directory);
 function requireTrustedRoot(){
  const s=lstatSync(root);
  if(!s.isDirectory()||s.isSymbolicLink()||(s.mode&0o077)!==0||
     (typeof process.getuid==='function'&&s.uid!==process.getuid())||realpathSync(root)!==root)
   throw Error('O2_NONCE_LEDGER_UNTRUSTED_DIRECTORY');
 }
 try{
  mkdirSync(root,{recursive:true,mode:0o700});
  requireTrustedRoot();
 }catch{throw Error('O2_NONCE_LEDGER_UNTRUSTED_DIRECTORY')}
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
