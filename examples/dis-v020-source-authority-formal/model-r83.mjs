// R83 bounded source→semantic authority model. No source/data/runtime edits, no SAP approval.
// Actual producer and B22 native receipts are validated before finite-state exploration.
export const ORIGINAL=Object.freeze({
 producerBlob:'8e77f2a2b518c2cf5151b8f2b1e6707287ed33f6',
 gzipSha:'a0afba19dfb1f8fa996bc1bdcd61fd0c9bd4cf0d2bf2509d09ac86993c0e70a2',
 sourceHead:'9104928912cc808ee76658968c3a1febe3afd799',
 nativeHead:'fe2334e63d39a9c006746caad695f7e3c5ade97d',
 nativeTree:'e458b65cb718fd399915d22e0a35ebe8611dc99b',
 nativeTestBlob:'a0eb607aeca433109a703b2e699c2eb719f5ed96',
 readerBlob:'650a0690774698b30992cddeed7791e6093f3b2d',
 sourceR32Checker:'4cb132e06969fe60a28aa7ce376aa8d112309e37',
 selectedCounts:Object.freeze({QUARANTINE_FATAL:233,REVIEW_SOFT:3769,STRUCTURAL_CANDIDATE:906474}),
 tierHashes:Object.freeze({
  QUARANTINE_FATAL:'0e9a875ecf88c40e477067d4f09298b8df4fed33384dd011d662ce4f301ec949',
  REVIEW_SOFT:'2bf208ced4ee4a347f211861ab4461a5d467ee2a285ea23505b13140c085aeb9',
  STRUCTURAL_CANDIDATE:'d92a9b806568966e37f52f40f2c99fabe03bb5f10e964283638d8b2db846323f'
 })
});
const REQUIRE_CONTEXT=new Set([
 'ci/woodpecker/pr/dis-v020-integration','ci/woodpecker/pr/verify-min-node',
 'ci/woodpecker/pr/verify'
]);
const fail=(code)=>{throw new Error(code)};
const isObject=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function validateOriginalEvidence(producer,receipt,manifest,matrix,pins){
 if(!isObject(pins)||pins.producerBlob!==ORIGINAL.producerBlob||
    pins.nativeTestBlob!==ORIGINAL.nativeTestBlob||pins.readerBlob!==ORIGINAL.readerBlob)
    fail('ORIGINAL_GIT_BLOB_PIN_MISMATCH');
 const out=producer?.runOutput,r=out?.results;
 if(producer?.receiptVersion!=='R33-R1'||producer?.qualification!=='NOT_QUALIFIED'||
    producer?.exitCode!==0||out?.status!=='SOURCE_SCOPED_DISPOSITIONS_COMPUTED'||
    out?.source?.gzipSha256!==ORIGINAL.gzipSha||
    out?.source?.r32GateGitBlob!==ORIGINAL.sourceR32Checker||
    r?.rows!==910476||!isObject(r?.counts)||
    Object.keys(r.counts).length!==3||
    Object.entries(ORIGINAL.selectedCounts).some(([k,v])=>r.counts[k]!==v)||
    Object.values(r.counts).reduce((a,v)=>a+v,0)!==r.rows||
    !isObject(r.canonicalRowSha256)||
    Object.keys(r.canonicalRowSha256).length!==3||
    Object.entries(ORIGINAL.tierHashes).some(([k,v])=>r.canonicalRowSha256[k]!==v)||
    r.hardReasons?.WITH_FROM_REQUIRED_IC!==228||
    r.hardReasons?.IC_WITH_FROM_GO_SELF_REFERENCE!==3||
    r.hardReasons?.RELATION_ASPECT_INVALID!==2||
    r.softEvidence?.IPI!==3736||r.softEvidence?.IGI!==19||
    r.softEvidence?.ISS!==12||r.softEvidence?.ISM!==2||
    out?.qualification?.sapQualified!==0||out?.qualification?.independentCritic!=='NOT_RUN'||
    out?.qualification?.disEffects!=='NONE')fail('ORIGINAL_SOURCE_EVIDENCE_INVALID');
 if(receipt?.id!=='r82-b22-r33-source-native-ci'||receipt?.status!=='SUCCESS'||
    receipt?.scope!=='B22_R82_ORIGINAL_DKE_R33_GO_TRIAGE_SELECTED_NATIVE_KNOWLEDGE'||
    receipt?.source?.head!==ORIGINAL.nativeHead||receipt?.source?.tree!==ORIGINAL.nativeTree||
    receipt?.testGitBlob!==ORIGINAL.nativeTestBlob||receipt?.readerGitBlob!==ORIGINAL.readerBlob||
    receipt?.producer?.gitBlob!==ORIGINAL.producerBlob||receipt?.producer?.head!==ORIGINAL.sourceHead)
    fail('B22_NATIVE_RECEIPT_INVALID');
 if(!Array.isArray(receipt.ci)||receipt.ci.length!==3||
    new Set(receipt.ci.map(x=>x.context)).size!==3||
    receipt.ci.some(x=>!REQUIRE_CONTEXT.has(x.context)||x.state!=='SUCCESS'||
       !/^https:\/\/ci\.kaicreator\.com\/repos\/18\/pipeline\/2397\/[123]$/.test(x.url)))
    fail('B22_NATIVE_CI_NOT_SOURCE_QUALIFIED');
 if(manifest?.batchId!=='B22'||manifest?.status!=='VERIFIED'||manifest?.verifiedRounds!==1||
    manifest?.qualificationHead!==ORIGINAL.nativeHead||
    !Array.isArray(manifest.rounds)||manifest.rounds.length!==1||
    manifest.rounds[0]?.testGitBlob!==ORIGINAL.nativeTestBlob||
    manifest.rounds[0]?.sourceHead!==ORIGINAL.nativeHead||
    manifest.rounds[0]?.status!=='VERIFIED'||
    manifest.pendingRounds!==0||manifest.unstartedRounds!==0||
    manifest.noAutomaticCorePromotion!==true||
    !Array.isArray(manifest.qualificationChecks)||manifest.qualificationChecks.length!==3||
    manifest.qualificationChecks.some(x=>!REQUIRE_CONTEXT.has(x.context)||x.state!=='SUCCESS'||
      !receipt.ci.some(y=>y.context===x.context&&y.state===x.state&&y.url===x.url))||
    !Array.isArray(manifest.rounds[0].checks)||manifest.rounds[0].checks.length!==3||
    manifest.rounds[0].checks.some(x=>!receipt.ci.some(y=>y.context===x.context&&
      y.state===x.state&&y.url===x.url)))
    fail('B22_BATCH_INTEGRITY_INVALID');
 const req=matrix?.requirements;
 if(!Array.isArray(req))fail('MATRIX_UNAVAILABLE');
 const counts={};
 for(const x of req){const k=x.profile+':'+x.state;counts[k]=(counts[k]||0)+1}
 for(const [k,v] of Object.entries({'core:VERIFIED':12,'core:PARTIAL':4,
     'optional-profile:NOT_RUN':4,'governance:NOT_RUN':1}))
    if(counts[k]!==v)fail('CORE_SCOPE_DRIFT_'+k);
 return {sourceRows:r.rows,sourceTiers:{...r.counts},nativeSourceHead:ORIGINAL.nativeHead,
   coreVerified:12,corePartial:4,independentSap:0,effects:0};
}
const FIELDS=['sourcePin','rowMembership','independentCritic','ownerAccepted',
  'evidenceValidated','targetMatched','kdpPermit','policyPermit'];
export function stateOf(mask,tier){
 const s={tier};
 for(let i=0;i<FIELDS.length;i++)s[FIELDS[i]]=Boolean(mask & (1<<i));
 return s;
}
// A FUTURE individual-row SAP gate, not available in the present aggregate B22 reader.
// Target/Effect permissions are intentionally NOT source-semantic acceptance criteria.
export function futureRowSap(s){
 return s.tier==='STRUCTURAL_CANDIDATE'&&s.sourcePin&&s.rowMembership&&
    s.independentCritic&&s.ownerAccepted&&s.evidenceValidated;
}
// Source-scoped B22 returns an aggregate observation: NO row witness, NO owner verdict.
// Even if a hypothetical full set of authorizations appears in the input, this reader
// cannot issue a row-level SAP, override its typed UNKNOWN or cause a physical Effect.
export function actualB22Observation(s){
 return {status:'UNKNOWN',sapQualified:false,independentCritic:false,
    effectDispatched:false,authority:'NONE',sourceState:s.tier};
}
export function modelCheck(evidence){
 const counts=evidence.sourceTiers;
 const violations=[];
 const byTier={};
 let explored=0,hypotheticalFuturePositive=0;
 for(const tier of Object.keys(ORIGINAL.selectedCounts)){
  let eligibleFuture=0;
  for(let mask=0;mask<(1<<FIELDS.length);mask++){
   const s=stateOf(mask,tier),out=actualB22Observation(s),gate=futureRowSap(s);
   explored++;
   if(out.status!=='UNKNOWN'||out.sapQualified||out.independentCritic||
      out.effectDispatched||out.authority!=='NONE')
     violations.push({kind:'B22_AGGREGATE_AUTHORITY',tier,mask});
   if(gate && (!s.sourcePin||!s.rowMembership||!s.independentCritic||
        !s.ownerAccepted||!s.evidenceValidated||tier!=='STRUCTURAL_CANDIDATE'))
     violations.push({kind:'FUTURE_SAP_GATE_UNSOUND',tier,mask});
   // B22's selected Function effect:none: KDP/policy permits alone are never enough.
   if(out.effectDispatched&&(s.kdpPermit&&s.policyPermit))
     violations.push({kind:'EFFECT_ESCALATION',tier,mask});
   if(gate)eligibleFuture++;
  }
  byTier[tier]={actualRows:counts[tier],actualApprovedRows:0,
    possibleFuturePolicyStates:eligibleFuture};
  hypotheticalFuturePositive+=eligibleFuture;
 }
 // Independently generated negative counterexample searches against broken
 // alternative rules. This guards against a vacuous 'all outputs false' model.
 const missing=[];
 for(const omit of ['sourcePin','rowMembership','independentCritic','ownerAccepted','evidenceValidated']){
  let witness=null;
  for(let mask=0;mask<256;mask++){
   const s=stateOf(mask,'STRUCTURAL_CANDIDATE');
   const unsafe=(!s[omit]&&['sourcePin','rowMembership','independentCritic',
     'ownerAccepted','evidenceValidated'].every(k=>k===omit||s[k]));
   if(unsafe&&!futureRowSap(s)){witness={tier:s.tier,mask,missing:omit};break}
  }
  if(!witness)violations.push({kind:'MISSING_MUTANT_WITNESS',omit});
  else missing.push(witness);
 }
 const unsoundEffectWitness=stateOf(0b11000000,'STRUCTURAL_CANDIDATE');
 if(!unsoundEffectWitness.kdpPermit||!unsoundEffectWitness.policyPermit||
    actualB22Observation(unsoundEffectWitness).effectDispatched)
  violations.push({kind:'EFFECT_MUTANT_WITNESS_INVALID'});
 if(explored!==3*256||hypotheticalFuturePositive<1)
   violations.push({kind:'VACUOUS_OR_INCOMPLETE_ENUMERATION'});
 return {status:violations.length?'MODEL_FAIL':'BOUNDED_MODEL_PASS',
   stateSpace:{sourceDispositionCount:3,booleanFields:FIELDS.length,explored},
   fromOriginalNativeSource:byTier,
   actualQualifiedRows:0,actualEffects:0,actualAllOutcomes:'UNKNOWN',
   hypotheticalFuturePositiveStates:hypotheticalFuturePositive,
   unsafeSapMutationCounterexamples:missing,
   unsafeEffectMutationCounterexample:{
      kdpPermit:unsoundEffectWitness.kdpPermit,policyPermit:unsoundEffectWitness.policyPermit,
      naiveRuleWouldDispatch:true,actualB22Dispatches:false},
   violations,scope:'FINITE_ABSTRACT_SOURCE_AUTHORITY_MODEL_NOT_INDEPENDENT_SEMANTIC_CRITIC_OR_NATIVE_CI'};
}
