/** Caller/SDK side of full-host-admission-r0 (Harness #1527 Phase B).
 *
 * Drives the admission Host as a SEPARATE process and verifies the signed
 * Host receipt against the registry-pinned Host identity. This module never
 * reads, receives or derives any issuer or Host private key: custody stays
 * with the operator provisioning and the Host process respectively.
 */
import {spawn} from 'node:child_process';
import {createPublicKey,verify as verifySignature} from 'node:crypto';
import {createInterface} from 'node:readline';
import {serializeAdmissionHostReceiptPayload,HOST_RECEIPT_PAYLOAD,
  digestObservationOutput,ADMISSION_HOST_RECEIPT_SCHEMA}
  from './admission-host.mjs';

export {digestObservationOutput};

/** Spawn the admission Host service. Resolves once it reports ready. */
export async function spawnAdmissionHost({node=process.execPath,servicePath,
  registryPath,ledgerDir,hostId,hostKeyFile,env=process.env}){
  if(!servicePath||!registryPath||!ledgerDir||!hostId||!hostKeyFile)
    throw Error('ADMISSION_CONSUMER_SPAWN_INPUT_INVALID');
  const child=spawn(node,[servicePath,'--registry',registryPath,
    '--ledger',ledgerDir,'--host-id',hostId],
    {env:{...env,ADMISSION_HOST_KEY_FILE:hostKeyFile},stdio:['pipe','pipe','pipe']});
  let stderr='';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data',chunk=>{stderr+=chunk});
  // Writing to a dead child's stdin surfaces as an async stream error; the
  // exit handler below is the single authority for waiter rejection.
  child.stdin.on('error',()=>{});
  const pending=[];
  let dead=false;
  const onExit=code=>{
    dead=true;
    const message=Error('ADMISSION_HOST_EXITED code='+code+
      ' stderr='+stderr.slice(0,400));
    for(const waiter of pending.splice(0))waiter.reject(message);
  };
  child.on('exit',onExit);
  const ready=new Promise((resolve,reject)=>{
    child.on('error',reject);
    // No-op once `ready` has settled; only meaningful before the first line.
    child.on('exit',code=>reject(Error(
      'ADMISSION_HOST_EXITED_BEFORE_READY code='+code+' stderr='+stderr.slice(0,400))));
  });
  const lines=createInterface({input:child.stdout});
  const opened=new Promise(resolve=>lines.once('line',line=>{
    // First line is the ready diagnostic.
    let first;
    try{first=JSON.parse(line)}catch{first=null}
    resolve(first);
  }));
  lines.on('line',line=>{
    if(!line.trim())return;
    let message;
    try{message=JSON.parse(line)}catch{return}
    const waiter=pending.shift();
    if(waiter)waiter.resolve(message);
  });
  const firstLine=await Promise.race([opened,ready]);
  if(!firstLine||firstLine.ok!==true)
    throw Error('ADMISSION_HOST_NOT_READY '+JSON.stringify(firstLine).slice(0,300));
  return Object.freeze({
    hostId:firstLine.hostId,rolledBack:firstLine.rolledBack,
    stderrText:()=>stderr,
    admit(request){
      if(dead)return Promise.reject(Error('ADMISSION_HOST_DEAD'));
      const payload={op:'admit',request};
      return new Promise((resolve,reject)=>{
        pending.push({resolve,reject});
        child.stdin.write(JSON.stringify(payload)+'\n');
      }).then(message=>{
        if(!message||message.ok!==true)
          throw Error('ADMISSION_HOST_PROTOCOL '+JSON.stringify(message).slice(0,300));
        return message.result;
      });
    },
    async shutdown(){
      if(dead)return;
      await new Promise((resolve,reject)=>{
        pending.push({resolve,reject});
        child.stdin.write(JSON.stringify({op:'shutdown'})+'\n');
      });
      if(!dead)await new Promise(resolve=>child.once('exit',resolve));
    },
    kill(){child.kill()}
  });
}

/** Verify a signed Host receipt against the pinned registry Host identity. */
export function verifyAdmissionHostReceipt(receipt,{registry,hostId,expected}){
  if(!receipt||typeof receipt!=='object')
    return {valid:false,reason:'CONSUMER_RECEIPT_UNSAFE'};
  const payload={};
  for(const key of HOST_RECEIPT_PAYLOAD){
    if(!Object.hasOwn(receipt,key))return {valid:false,reason:'CONSUMER_RECEIPT_FIELD_MISSING_'+key};
    payload[key]=receipt[key];
  }
  if(payload.schema!==ADMISSION_HOST_RECEIPT_SCHEMA||
    payload.hostId!==hostId||payload.status!=='OBSERVED_SCOPED_CANDIDATE')
    return {valid:false,reason:'CONSUMER_RECEIPT_HEADER_INVALID'};
  if(payload.claimAttested!==false||payload.externalBusinessEffect!==false||
    payload.authority!=='OWNER_ATTESTED_HOST_ADMISSION_SINGLE_OWNER_ECOSYSTEM')
    return {valid:false,reason:'CONSUMER_RECEIPT_HONESTY_FLAGS_INVALID'};
  const host=registry.hosts?.[hostId];
  if(!host||typeof host.spkiDerBase64Url!=='string')
    return {valid:false,reason:'CONSUMER_HOST_NOT_PINNED'};
  let signatureValid=false;
  try{
    const pinnedKey=createPublicKey({key:Buffer.from(host.spkiDerBase64Url,'base64url'),
      format:'der',type:'spki'});
    signatureValid=verifySignature(null,
      serializeAdmissionHostReceiptPayload(payload),pinnedKey,
      Buffer.from(receipt.signatureBase64Url,'base64url'));
  }catch{return {valid:false,reason:'CONSUMER_SIGNATURE_INVALID'}}
  if(!signatureValid)return {valid:false,reason:'CONSUMER_SIGNATURE_INVALID'};
  const deployment=registry.deployments?.[expected.deploymentId];
  if(!deployment||deployment.hostId!==hostId)
    return {valid:false,reason:'CONSUMER_DEPLOYMENT_NOT_PINNED'};
  if(payload.functionId!==deployment.functionId||
    payload.tenantId!==deployment.tenantId||payload.scope!==deployment.scope||
    payload.issuerId!==deployment.issuerId)
    return {valid:false,reason:'CONSUMER_RECEIPT_PARTY_MISMATCH'};
  for(const field of ['aotDigest','sdkDigest','ruleDigest','installedBytesDigest','sourceGitBlob'])
    if(payload[field]!==deployment.bindings[field])
      return {valid:false,reason:'CONSUMER_RECEIPT_BINDING_MISMATCH_'+field.toUpperCase()};
  if(expected.invocationNonce!==undefined&&
    payload.invocationNonce!==expected.invocationNonce)
    return {valid:false,reason:'CONSUMER_INVOCATION_NONCE_MISMATCH'};
  if(expected.subject!==undefined&&payload.subject!==expected.subject)
    return {valid:false,reason:'CONSUMER_SUBJECT_MISMATCH'};
  if(expected.observedOutputDigest!==undefined&&
    payload.observedOutputDigest!==expected.observedOutputDigest)
    return {valid:false,reason:'CONSUMER_OUTPUT_DIGEST_MISMATCH'};
  return {valid:true,payload};
}
