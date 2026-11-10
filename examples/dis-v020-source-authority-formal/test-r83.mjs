// R83 selected native evidence / abstract promotion predicate adversarial tests.
// Pure harness, runnable in hosted V8 from exact Git blobs or through run-r83.mjs under Node.
const clone=x=>JSON.parse(JSON.stringify(x));
const invariant=(v,code)=>{if(!v)throw Error(code)};
const expectsReject=(args,model,name)=>{
 try{model.validateOriginalEvidence(...args);throw Error('DID_NOT_REJECT_'+name)}
 catch(e){if(String(e.message||e).startsWith('DID_NOT_REJECT_'))throw e;return {case:name,rejected:true,reason:String(e.message||e)}}
};
// Compare the finite model to the literal original B22 LOCAL Reader, not merely
// a model function that returns constant false. The source-exact Node CLI imports
// the real Reader/its actual Git hash; hosted V8 uses original source readback
// and a bounded stand-in hash for this isolated pure-logic execution.
export function testActualReaderConformance(reader,model,evidence){
 if(!reader||typeof reader.query!=='function')throw Error('REAL_B22_READER_REQUIRED');
 let allowed=0,blocked=0;
 for(const tier of Object.keys(model.ORIGINAL.selectedCounts)){
  const direct=reader.query({disposition:tier});
  const expected=model.actualB22Observation(model.stateOf(0,tier));
  if(direct.status!==expected.status||direct.independentCritic!==expected.independentCritic||
    direct.sapQualified!==expected.sapQualified||direct.effectDispatched!==expected.effectDispatched||
    direct.sourceState!=='SOURCE_SCOPED_ONLY_UNREVIEWED'||
    direct.selectedDisposition!==tier||
    direct.selectedRows!==evidence.sourceTiers[tier]||
    direct.originalAnnotationRows!==evidence.sourceRows||
    direct.tierCanonicalSha256!==model.ORIGINAL.tierHashes[tier]||
    direct.sourceGzipSha256!==model.ORIGINAL.gzipSha||
    direct.receiptGitBlob!==model.ORIGINAL.producerBlob)
   throw Error('REAL_READER_ABSTRACT_CONTRACT_MISMATCH_'+tier);
  allowed++;
  // Each of the 255 nonzero flag combinations is an invalid attempt to
  // smuggle authorizer/permit data into an aggregate-only Knowledge Function.
  // The only legal input per tier is {disposition}; no row proof is available.
  for(let mask=1;mask<256;mask++){
   const state=model.stateOf(mask,tier),input={disposition:tier};
   for(const [key,value] of Object.entries(state))
    if(key!=='tier'&&value)input[key]=true;
   let denied=false;
   try{reader.query(input)}
   catch(error){denied=error?.code==='DKE_R33_SELECTION_INVALID'}
   if(!denied)throw Error('REAL_READER_FORGED_AUTHORITY_ADMITTED_'+tier+'_'+mask);
   blocked++;
  }
 }
 for(const tier of Object.keys(model.ORIGINAL.selectedCounts)){
  let denied=false;try{reader.query({disposition:tier,ownerAccepted:false})}
  catch(error){denied=error?.code==='DKE_R33_SELECTION_INVALID'}
  if(!denied)throw Error('REAL_READER_FALSE_AUTHORITY_FIELD_ADMITTED');
  blocked++;
 }
 if(allowed!==3||blocked!==768)throw Error('REAL_READER_EXPLORATION_INCOMPLETE');
 return {status:'REAL_GIT_READER_CONFORMANCE_PASS',actualSourceCalls:allowed+blocked,
  allowedExactTierQueries:allowed,rejectedUnauthorizedInputs:blocked,
  source:'ACTUAL_B22_LOCAL_READER_EXACT_GIT_BLOB_NOT_ABSTRACT_STUB'};
}

export function runR83Tests(producer,receipt,manifest,matrix,pins,model,reader){
 const entry=[producer,receipt,manifest,matrix,pins];
 const checked=model.validateOriginalEvidence(...entry);
 const proof=model.modelCheck(checked);
 const sourceReader=testActualReaderConformance(reader,model,checked);
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
 return {status:'SOURCE_EXACT_BOUNDARY_MODEL_PASS',original:checked,formal:proof,realReader:sourceReader,
    negativeCaseCount:negative.length,negatives:negative,
    qualification:'NO_NEW_SAP_OR_DKE_R8_EV',requiresOriginalWoodpecker:true};
}
