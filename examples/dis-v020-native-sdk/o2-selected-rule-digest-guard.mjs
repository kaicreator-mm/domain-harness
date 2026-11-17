/**
 * DIS O2 R172: original-source selected RuleDigest provenance preflight.
 * This guards a SOURCE-BOUND technical candidate, NOT an installed Rule.
 * The DIS v0.2 SDK does not expose an independently attested installed
 * RuleDigest or tenant identity. No signed O2 Validator result, arbitrary
 * 64-hex claim, fixture, source hash or Host-supplied field can create them.
 * All outcomes deny qualification, Experience, Effect and export.
 */
import {createHash} from 'node:crypto';
import {types} from 'node:util';

const FN='tally.assessTaskEvidence';
const SOURCE='tally-business';
const SOURCE_BLOB='54015fb63ffb13b4f4e562f660d2172098b5f7f4';
const VERSION='1.0.0';
const HEX=/^[a-f0-9]{64}$/;
const SCOPE=/^[a-zA-Z][a-zA-Z0-9._:/-]{0,127}$/;
const SHA256=s=>createHash('sha256').update(s).digest('hex');
const immutable=(status,reason,more={})=>Object.freeze({
  status,reason,authority:'NONE',qualified:false,ruleInstalled:false,
  ruleActivated:false,experienceIssued:false,effectDispatched:false,
  exportAllowed:false,installedRuleAttested:false,...more
});
const deny=(reason,status='BLOCKED')=>immutable(status,reason);
function safeData(value,keys){
  try {
    if(!value||typeof value!=='object'||Array.isArray(value)||
      types.isProxy(value)||Object.getPrototypeOf(value)!==Object.prototype)return null;
    const own=Reflect.ownKeys(value);
    if(own.length!==keys.length||own.some(k=>typeof k!=='string'||!keys.includes(k)))return null;
    const copy=Object.create(null);
    for(const key of keys){
      const d=Object.getOwnPropertyDescriptor(value,key);
      if(!d||!Object.hasOwn(d,'value')||!d.enumerable)return null;
      copy[key]=d.value;
    }
    return copy;
  }catch{return null}
}
function gitBlob(text){
 const bytes=Buffer.from(text,'utf8');
 return createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
}
function selectedSource({program,sources,registry}){
 // Host-owned BUILD fixture; independent production installer provenance NOT assumed.
 if(!program||!Array.isArray(program.elements)||!Array.isArray(sources)||
   !registry||typeof registry!=='object'||types.isProxy(registry))return null;
 const entries=program.elements.filter(e=>e?.id==='tally.tasks');
 if(entries.length!==1||entries[0].kind!=='rule')return null;
 const f=entries[0].functions;
 if(!Array.isArray(f)||!f.some(x=>x?.id===FN&&x.kind==='rule'&&
   x.binding?.type==='local'&&x.binding?.sourceId===SOURCE))return null;
 const matches=sources.filter(x=>x?.id===SOURCE);
 if(matches.length!==1)return null;
 const src=matches[0],reg=Object.getOwnPropertyDescriptor(registry,FN)?.value;
 if(typeof src.sourceText!=='string'||src.origin?.gitBlob!==SOURCE_BLOB||
   gitBlob(src.sourceText)!==SOURCE_BLOB||
   reg?.sourceId!==SOURCE||reg.gitBlob!==SOURCE_BLOB||
   reg.sha256!==SHA256(src.sourceText)||typeof reg.execute!=='function')
  return null;
 return Object.freeze({sourceSha256:SHA256(src.sourceText),sourceGitBlob:SOURCE_BLOB});
}
/**
 * 'claim' is untrusted metadata (for example, an O2 Validator's ruleDigest).
 * expectedScope, expectedAotDigest and source fixture are technical Host pins,
 * NOT trusted installed Rule or tenant attestation. Require exact own-data claim.
 * Time is a bounded caller-provided preflight clock, not a signed Host clock.
 */
export async function inspectO2SelectedRuleDigestSource({
  app,artifact,program,sources,registry,expectedScope,expectedAotDigest,
  claim,nowEpochMs
}={}){
 const c=safeData(claim,['scope','aotDigest','ruleDigest','issuedAtMs','expiresAtMs']);
 if(!c)return deny('O2_RULE_CLAIM_UNSAFE');
 if(typeof expectedScope!=='string'||!SCOPE.test(expectedScope)||
    typeof expectedAotDigest!=='string'||!HEX.test(expectedAotDigest)||
    !Number.isSafeInteger(nowEpochMs)||nowEpochMs<0)
  return deny('O2_RULE_HOST_PINS_MISSING');
 if(typeof c.scope!=='string'||!SCOPE.test(c.scope)||
    typeof c.aotDigest!=='string'||!HEX.test(c.aotDigest)||
    typeof c.ruleDigest!=='string'||!HEX.test(c.ruleDigest)||
    !Number.isSafeInteger(c.issuedAtMs)||!Number.isSafeInteger(c.expiresAtMs)||
    c.issuedAtMs<0||c.expiresAtMs<=c.issuedAtMs)
  return deny('O2_RULE_CLAIM_SCHEMA_INVALID');
 if(c.scope!==expectedScope)return deny('O2_RULE_TENANT_SCOPE_DRIFT','STALE');
 if(c.aotDigest!==expectedAotDigest)return deny('O2_RULE_AOT_CLAIM_DRIFT','STALE');
 if(nowEpochMs<c.issuedAtMs||nowEpochMs>=c.expiresAtMs||
    c.expiresAtMs-c.issuedAtMs>86400000)
  return deny('O2_RULE_CLAIM_EXPIRED_OR_FUTURE','STALE');
 // A selected SDK instance is a technical observation, not a Host tenant
 // identity. Check the actual selected AOT digest and Function ABI before invoke.
 if(!app||app.state!=='READY'||app.aotDigest!==expectedAotDigest||
    !artifact||artifact.digest!==expectedAotDigest||
    !Array.isArray(app.functions)||!app.functions.includes(FN)||
    app.contractVersions?.[FN]!==VERSION||typeof app.invoke!=='function')
  return deny('O2_RULE_SELECTED_AOT_OR_FUNCTION_DRIFT','STALE');
 let origin;
 try{origin=selectedSource({program,sources,registry})}catch{}
 if(!origin)return deny('O2_RULE_ORIGINAL_SOURCE_PIN_INVALID','STALE');
 // A deterministic *candidate* derived from an authentic original Git blob,
 // selected AOT, selected Function and trusted technical scope. This is NOT
 // equivalent to a signed, independently installed Rule digest.
 const candidateRuleDigest=SHA256([
  'dis.o2.selected-rule-source-candidate/1',expectedAotDigest,
  expectedScope,FN,origin.sourceSha256,origin.sourceGitBlob
 ].join('\0'));
 if(c.ruleDigest!==candidateRuleDigest)
  return deny('O2_RULE_DIGEST_NOT_DERIVED_FROM_SELECTED_SOURCE','STALE');
 let observation;
 try{observation=await app.invoke(FN,{})}catch{
  return deny('O2_RULE_SELECTED_NATIVE_OBSERVATION_FAILED','UNKNOWN');
 }
 if(!observation||observation.kind!=='OBSERVATION'||
    observation.authority!=='NONE')
  return deny('O2_RULE_SELECTED_NATIVE_OBSERVATION_UNQUALIFIED','UNKNOWN');
 // No installed Rule authority/source exists in the current public AOT/SDK
 // contract. Even real-source/source-bound claims MUST NOT become O2 positive.
 return immutable('BLOCKED','BLOCKED_MISSING_INSTALLED_RULE_ATTESTATION',{
   sourceBoundCandidateVerified:true,selectedFunction:FN,
   selectedAotDigest:expectedAotDigest,
   originalSourceGitBlob:origin.sourceGitBlob,
   sourceBoundCandidateDigest:candidateRuleDigest,
   selectedObservation:'OBSERVATION_ONLY',
   tenantIdentityAttested:false
 });
}
/** Expose a reproducible candidate for test construction, never as a permit. */
export function deriveO2SelectedRuleCandidate({aotDigest,scope,sourceText}={}){
 if(typeof aotDigest!=='string'||!HEX.test(aotDigest)||
    typeof scope!=='string'||!SCOPE.test(scope)||
    typeof sourceText!=='string'||gitBlob(sourceText)!==SOURCE_BLOB)
  throw Error('O2_RULE_CANDIDATE_SOURCE_INVALID');
 return SHA256(['dis.o2.selected-rule-source-candidate/1',aotDigest,
  scope,FN,SHA256(sourceText),SOURCE_BLOB].join('\0'));
}
