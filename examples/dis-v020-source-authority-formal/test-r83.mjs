// R83 selected native evidence / abstract promotion predicate adversarial tests.
// Pure harness, runnable in hosted V8 from exact Git blobs or through run-r83.mjs under Node.
const clone=x=>JSON.parse(JSON.stringify(x));
const invariant=(v,code)=>{if(!v)throw Error(code)};
const expectsReject=(args,model,name)=>{
 try{model.validateOriginalEvidence(...args);throw Error('DID_NOT_REJECT_'+name)}
 catch(e){if(String(e.message||e).startsWith('DID_NOT_REJECT_'))throw e;return {case:name,rejected:true,reason:String(e.message||e)}}
};
export function runR83Tests(producer,receipt,manifest,matrix,pins,model){
 const entry=[producer,receipt,manifest,matrix,pins];
 const checked=model.validateOriginalEvidence(...entry);
 const proof=model.modelCheck(checked);
 invariant(proof.status==='BOUNDED_MODEL_PASS'&&proof.stateSpace.explored===768,'MODEL_FAILED');
 invariant(proof.violations.length===0&&proof.actualQualifiedRows===0&&
   proof.actualEffects===0&&proof.hypotheticalFuturePositiveStates>0,'VACUOUS_FORMAL_CLAIM');
 invariant(proof.unsafeSapMutationCounterexamples.length===5&&
   proof.unsafeEffectMutationCounterexample.naiveRuleWouldDispatch,'MISSING_NEGATIVE_COUNTEREXAMPLE');
 const mutations=[
  ['original-count',v=>v[0].runOutput.results.counts.STRUCTURAL_CANDIDATE++],
  ['original-partition-digest',v=>v[0].runOutput.results.canonicalRowSha256.REVIEW_SOFT='0'.repeat(64)],
  ['original-ic-hard-finding',v=>v[0].runOutput.results.hardReasons.IC_WITH_FROM_GO_SELF_REFERENCE=0],
  ['original-fake-sap',v=>v[0].runOutput.qualification.sapQualified=1],
  ['original-source-gzip',v=>v[0].runOutput.source.gzipSha256='0'.repeat(64)],
  ['native-source-head',v=>v[1].source.head='0'.repeat(40)],
  ['native-test-blob',v=>v[1].testGitBlob='0'.repeat(40)],
  ['native-ci-failure',v=>v[1].ci[0].state='FAILURE'],
  ['native-ci-link',v=>v[1].ci[1].url='https://ci.kaicreator.com/repos/18/pipeline/2398/2'],
  ['batch-candidate',v=>v[2].rounds[0].status='NOT_RUN'],
  ['core-matrix-drift',v=>v[3].requirements.find(x=>x.id==='DIS020-CORE-003').state='PARTIAL'],
  ['producer-blob-pin',v=>v[4].producerBlob='0'.repeat(40)]
 ];
 const negative=[];
 for(const [name,mutate] of mutations){
  const args=clone(entry);mutate(args);
  negative.push(expectsReject(args,model,name));
 }
 invariant(negative.length===mutations.length,'INCOMPLETE_NEGATIVE_SCOPE');
 return {status:'SOURCE_EXACT_BOUNDARY_MODEL_PASS',original:checked,formal:proof,
    negativeCaseCount:negative.length,negatives:negative,
    qualification:'NO_NEW_SAP_OR_DKE_R8_EV',requiresOriginalWoodpecker:true};
}
