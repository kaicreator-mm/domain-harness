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
