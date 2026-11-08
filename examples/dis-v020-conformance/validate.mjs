import {readFile,stat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
const base='docs/standards/domain-intelligence/DIS-0.2.0/conformance';
const statuses=new Set(['VERIFIED','PARTIAL','NOT_RUN','OUT_OF_SCOPE']);
const profiles=new Set(['core','optional-profile','governance']);
const validId=/^DIS020-(?:CORE|OPT|GOV)-\d{3}$/;
const sha=/^[a-f0-9]{40}$/;
const pathOk=p=>typeof p==='string'&&!!p&&!p.startsWith('/')&&!p.split('/').includes('..');
const fail=(code)=>{throw Object.assign(new Error(code),{code})};
const fileCache=new Map();
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
    !Array.isArray(matrix.requirements)||matrix.requirements.length<16)fail('MATRIX_SCHEMA');
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
   if(!content.includes('test(')||!content.includes(e.case))fail('MATRIX_CASE_NOT_FOUND');
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
