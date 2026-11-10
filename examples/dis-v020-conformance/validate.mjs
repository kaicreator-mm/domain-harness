import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base='docs/standards/domain-intelligence/DIS-0.2.0/conformance';
const statuses=new Set(['VERIFIED','PARTIAL','NOT_RUN','OUT_OF_SCOPE']);
const profiles=new Set(['core','optional-profile','governance']);
const validId=/^DIS020-(?:CORE|OPT|GOV)-\d{3}$/;
// #1499 fixes the version applicability universe: no omitted/renamed Core,
// Optional or Governance requirement may make coverage appear complete.
const requiredIds=new Set([
 ...Array.from({length:16},(_,i)=>'DIS020-CORE-'+String(i+1).padStart(3,'0')),
 ...Array.from({length:4},(_,i)=>'DIS020-OPT-'+String(i+1).padStart(3,'0')),
 'DIS020-GOV-001'
]);
// R90 independent reviewer: explicit requirement-specific admission witnesses.
// These bind existing VERIFIED claims to their original selected positive and
// negative test names and historical receipt IDs. Merely borrowing another
// requirement's SUCCESS receipt and passing tests cannot grant VERIFIED.
// Later legitimate coverage is allowed after independently reviewed additions
// to this version-scoped witness roster; this is NOT a permanent 13/16 cap.
// The roster is a mechanical source guard, not semantic/Owner attestation.
const verifiedWitnesses=new Map(Object.entries({
  "DIS020-CORE-001": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native Contracts + canonical BUILD select 4 heterogeneous domains and explicit global semantics"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "actual Runx Element cannot silently import Tally source as its LOCAL stateful implementation"
    }
  },
  "DIS020-CORE-003": {
    "receiptId": "r14-d01-ci-recovered",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "R11 typed Function I/O and provenance preserve original Tally UNKNOWN advisory semantics"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "R11 refuses malformed Function output rather than claiming a typed successful outcome"
    }
  },
  "DIS020-CORE-004": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native public SDK loads actual selected KDP, initializes one Business and executes admitted orders Intent"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native compiler rejects Effect downgrade from KDP_INTENT to arbitrary LOCAL rule"
    }
  },
  "DIS020-CORE-006": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "Runx native stateful observer is not reclassified as a Business or execution lease"
    },
    "negative": {
      "path": "examples/dis-v020-cross-project/consumer.test.mjs",
      "case": "Runx: presence observation cannot be treated as a fresh lease or execution permit"
    }
  },
  "DIS020-CORE-007": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-cross-project/selected-build.test.mjs",
      "case": "R8 canonical BUILD selects byte-locked Tally and xDownload real Business packages"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "installed independent digest catches altered but rehashed and internally valid AOT semantics"
    }
  },
  "DIS020-CORE-008": {
    // R93: Product-accepted C3 structural promotion must remain anchored to
    // the independently reviewed selected Linux/x64/Node evidence, not a
    // generic historical R9.5 target rejection that predates its acceptance.
    "receiptId": "r86-c3-fresh-exact-sha-review-ci",
    "positive": {
      "path": "examples/dis-v020-native-sdk/b05-full-source-anchors.test.mjs",
      "case": "B05-02 R45 selected Linux/x64 native BUILD + complete installer Source + Host close in one real KDP boot"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/b05-full-source-anchors.test.mjs",
      "case": "B05-02 C3 cross-boundary forged selected module roster cannot be rescued by a correct host and full installer source pins"
    }
  },
  "DIS020-CORE-009": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native public SDK loads actual selected KDP, initializes one Business and executes admitted orders Intent"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native SDK Business App Init refusal blocks every Function without exposing a facade"
    }
  },
  "DIS020-CORE-010": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "Tally actual Task evidence Function stays OBSERVATION, never mints Task Claim or authorization"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native SDK stop closes all Function ingress, including stateful LOCAL functions"
    }
  },
  "DIS020-CORE-011": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native SDK DEGRADED explicitly disables absent optional Tally Function without weakening mandatory KDP"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native SDK refuses silent optional Function omission or optional Business App Init"
    }
  },
  "DIS020-CORE-012": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-sdk-integration/test.mjs",
      "case": "trusted K view allows a real bounded temporary-file effect"
    },
    "negative": {
      "path": "examples/dis-v020-sdk-integration/test.mjs",
      "case": "after dispatch error is UNKNOWN, not pre-handler refusal"
    }
  },
  "DIS020-CORE-013": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-real-aot-bridge/two-domain-physical.test.mjs",
      "case": "physical SQLite Journal survives close and a real second Node process without duplicated Effects"
    },
    "negative": {
      "path": "examples/dis-v020-real-aot-bridge/two-domain-physical.test.mjs",
      "case": "untrusted persisted Projection cannot restore physical KDP Journal with wrong installed digest"
    }
  },
  "DIS020-CORE-014": {
    "receiptId": "r10-ci-recovery",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "Chat, Form and CLI share native progressive clarification without triggering xDownload Effect"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "AOT refuses interaction with KDP_INTENT or governed Effect reclassification"
    }
  },
  "DIS020-CORE-015": {
    "receiptId": "r9.5-baseline",
    "positive": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "xDownload original policy is exposed as knowledge without providing direct acquisition authority"
    },
    "negative": {
      "path": "examples/dis-v020-native-sdk/native-consumer.test.mjs",
      "case": "native compiler rejects Effect downgrade from KDP_INTENT to arbitrary LOCAL rule"
    }
  }
}));
const sha=/^[a-f0-9]{40}$/;
const pathOk=p=>typeof p==='string'&&!!p&&!p.startsWith('/')&&!p.split('/').includes('..');
const fail=(code)=>{throw Object.assign(new Error(code),{code})};
const fileCache=new Map();

// R90 reviewer: test evidence must name a declared executable Node test.
// Source strings/comments, a shorter substring, skip/todo are not proof.
const declaredTestCache=new Map();
export function declaredTestCases(source){
 const found=new Set();
 if(typeof source!=='string')return found;
 const isIdentifier=c=>c!==undefined&&/[A-Za-z0-9_$]/.test(c);
 const isSpace=c=>c!==undefined&&/\s/.test(c);
 const space=p=>{while(isSpace(source[p]))p++;return p;};
 const isQuote=c=>c==="'"||c==='"'||c===String.fromCharCode(96);
 function quoted(p){
  const quote=source[p];let out='';
  for(let j=p+1;j<source.length;){
   const c=source[j++];
   if(c==='\\'){
    // Existing source-roster test names are plain literal text; do not
    // silently reinterpret escape syntax as a different named test.
    return {end:j+1,invalid:true};
   }
   // A bare quote character in a JS regex must not swallow subsequent
   // test declarations across a line: normal JS string literals cannot
   // cross a physical newline (unlike template literals).
   if(c==='\n'&&quote!==String.fromCharCode(96))return {end:j,invalid:true};
   if(c===quote)return {end:j,value:out,invalid:false};
   out+=c;
  }
  return null;
 }
 for(let i=0;i<source.length;){
  if(source[i]==='/'&&source[i+1]==='/'){
   i+=2;while(i<source.length&&source[i]!=='\n')i++;continue;
  }
  if(source[i]==='/'&&source[i+1]==='*'){
   i+=2;const end=source.indexOf('*/',i);
   i=end<0?source.length:end+2;continue;
  }
  if(isQuote(source[i])){
   const lit=quoted(i);i=lit?lit.end:source.length;continue;
  }
  // Regex source is NOT an executable test() call: /test('forged',)/ is
  // a valid regex and previously fabricated a named test in this scanner.
  // Slash-as-regex positions are conservative; a real CI run remains the
  // ultimate execution check, not textual discovery alone.
  if(source[i]==='/'){
   const before=source.slice(0,i).trimEnd();
   const prev=before.at(-1);
   if((prev&&'=([{,:;!?&|'.includes(prev))||/\\b(?:return|throw|yield|case)\\s*$/.test(before)){
    let inClass=false,escaped=false,j=i+1;
    for(;j<source.length;j++){
     const c=source[j];
     if(c==='\\n')break;
     if(escaped){escaped=false;continue;}
     if(c==='\\\\'){escaped=true;continue;}
     if(c==='['){inClass=true;continue;}
     if(c===']'){inClass=false;continue;}
     if(c==='/'&&!inClass){i=j+1;break;}
    }
    if(i===j+1)continue;
   }
  }
  if(source.startsWith('test',i)&&!isIdentifier(source[i-1])&&
     source[i-1]!=='.'&&!isIdentifier(source[i+4])){
   let j=space(i+4);
   // Skip test.skip, test.todo and test.only rather than claiming the
   // CI actually ran a non-default test mode.
   if(source[j]==='('){
    j=space(j+1);
    if(isQuote(source[j])){
     const lit=quoted(j);
     if(lit&&!lit.invalid&&source[space(lit.end)]===',')
      found.add(lit.value);
    }
   }
  }
  i++;
 }
 return found;
}

async function sourceText(path){
 if(!pathOk(path))fail('MATRIX_INVALID_PATH');
 if(!fileCache.has(path)){
  try{fileCache.set(path,await readFile(join(root,path),'utf8'))}
  catch{fail('MATRIX_SOURCE_MISSING')}
 }
 return fileCache.get(path);
}
export async function validateVersionMatrix(matrix,receipts){
 if(matrix?.schema!=='dis.v0.2.conformance-matrix/1'||matrix.version!=='0.2.0'||
    !Array.isArray(matrix.requirements))fail('MATRIX_SCHEMA');
 // Check the complete canonical roster before touching filesystem/receipts.
 // Format and uniqueness alone cannot prevent silent narrowing of the denominator.
 if(matrix.requirements.length!==requiredIds.size)fail('MATRIX_REQUIREMENT_ROSTER_INVALID');
 const seen=new Set();
 for(const r of matrix.requirements){
  if(typeof r?.id!=='string'||!validId.test(r.id)||seen.has(r.id))fail('MATRIX_DUP_OR_INVALID_ID');
  seen.add(r.id);
 }
 if([...requiredIds].some(id=>!seen.has(id)))fail('MATRIX_REQUIREMENT_ROSTER_INVALID');
 const ids=new Set();const tallies={};
 for(const r of matrix.requirements){
  if(!validId.test(r.id)||ids.has(r.id))fail('MATRIX_DUP_OR_INVALID_ID');
  ids.add(r.id);
  if(!profiles.has(r.profile)||!statuses.has(r.state)||typeof r.title!=='string'||
    !r.title||typeof r.note!=='string'||!r.note||!r.spec?.section||
    !Array.isArray(r.positive)||!Array.isArray(r.negative)||!Array.isArray(r.receiptIds)||
    !Array.isArray(r.implementation))fail('MATRIX_REQUIREMENT_INVALID');
  if(r.id.split('-')[1]!==({core:'CORE','optional-profile':'OPT',governance:'GOV'}[r.profile]))fail('MATRIX_PROFILE_DRIFT');
  await sourceText(r.spec.path);
  for(const p of r.implementation)await sourceText(p);
  for(const e of [...r.positive,...r.negative]){
   if(!e?.path||!e.case)fail('MATRIX_CASE_INVALID');
   const content=await sourceText(e.path);
   if(!declaredTestCache.has(e.path))
    declaredTestCache.set(e.path,declaredTestCases(content));
   if(!declaredTestCache.get(e.path).has(e.case))fail('MATRIX_CASE_NOT_FOUND');
  }
  if(r.state==='VERIFIED'&&(!r.positive.length||!r.negative.length||!r.receiptIds.length))fail('MATRIX_UNSUPPORTED_VERIFIED');
  if(r.state==='VERIFIED'){
   const w=verifiedWitnesses.get(r.id);
   const anchored=(rows,anchor)=>rows.some(x=>x.path===anchor.path&&x.case===anchor.case);
   if(!w||!r.receiptIds.includes(w.receiptId)||
      !anchored(r.positive,w.positive)||!anchored(r.negative,w.negative))
    fail('MATRIX_VERIFIED_WITNESS_MISMATCH');
  }
  if(r.state==='NOT_RUN'&&(r.positive.length||r.negative.length||r.receiptIds.length))fail('MATRIX_UNRUN_HAS_EVIDENCE');
  if(r.state==='OUT_OF_SCOPE'&&!/^https:\/\/github\.com\/kaicreator-mm\/domain-harness\/issues\/\d+$/.test(r.decisionUrl??''))fail('MATRIX_SCOPE_DECISION_MISSING');
  for(const rid of r.receiptIds){
   const rec=receipts[rid];
   if(!rec||rec.status!=='SUCCESS'||rec.disVersion!=='0.2.0'||
     !sha.test(rec.source?.head)||!sha.test(rec.source?.tree)||
     rec.ci?.length!==3||rec.ci.some(x=>!x.url?.startsWith('https://ci.kaicreator.com/')))
    fail('MATRIX_RECEIPT_INVALID');
   if(rec.qualification==='DIS_SEMANTIC_ONLY'){
    // Owner decision: the Node-version compatibility lane is observed but
    // does not determine Domain Function/Element semantic qualification.
    // Integration AND general verification must both succeed at the same SHA.
    const contexts=new Map(rec.ci.map(x=>[x.context,x.state]));
    if(contexts.size!==3||
      contexts.get('ci/woodpecker/pr/dis-v020-integration')!=='SUCCESS'||
      contexts.get('ci/woodpecker/pr/verify')!=='SUCCESS'||
      !['SUCCESS','ERROR','FAILURE','PENDING'].includes(contexts.get('ci/woodpecker/pr/verify-min-node')))
      fail('MATRIX_RECEIPT_INVALID');
   }else if(rec.qualification!==undefined||rec.ci.some(x=>x.state!=='SUCCESS')){
    // Preserve all previous strict 3/3 required-status receipt semantics.
    fail('MATRIX_RECEIPT_INVALID');
   }
  }
  const key=r.profile+':'+r.state;tallies[key]=(tallies[key]??0)+1;
 }
 return Object.freeze({requirements:matrix.requirements.length,tallies});
}
export async function validateCheckedInMatrix(){
 const matrix=JSON.parse(await sourceText(base+'/matrix.json'));
 const receipts={};
 for(const id of matrix.receipts){
  if(!/^[a-z0-9][a-z0-9.-]+$/.test(id))fail('MATRIX_RECEIPT_ID_INVALID');
  const r=JSON.parse(await sourceText(base+'/receipts/'+id+'.json'));
  if(r.id!==id)fail('MATRIX_RECEIPT_MISMATCH');
  receipts[id]=r;
 }
 return validateVersionMatrix(matrix,receipts);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const out=await validateCheckedInMatrix();
 process.stdout.write(JSON.stringify(out)+'\n');
}
