/**
 * DIS v0.2.0 native AOT compiler — production-facing additive BUILD subpath.
 * The canonical v0.10 BUILD still owns package closure, ABI and KDP routes.
 * No runtime evaluation, registration, Effect or Host authority here.
 */
import {buildV10App} from './dist/build.js';
import {sha256Canonical} from '@kaicreator/domain-harness-contracts';
import {
 DIS_V020_AOT,DisV020Error,sourceSha256,sourceGitBlob,qualifyDisV020Artifact
} from '@kaicreator/domain-harness-contracts/dis-v020';

const refuse=code=>{throw new DisV020Error(code)};
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
function freeze(value){
 if(value!==null&&typeof value==='object'){
  for(const x of Object.values(value))freeze(x);
  Object.freeze(value);
 }
 return value;
}
export function compileDisV020Aot({built,program,sources,expectedSourceOrigins}={}){
 if(!built||!plain(program)||!Array.isArray(sources)||sources.length>256||!plain(expectedSourceOrigins))refuse('DIS_BUILD_INPUT_INVALID');
 const pins=[];
 for(const entry of sources){
  if(!plain(entry)||typeof entry.sourceText!=='string'||!plain(entry.origin)||
     typeof entry.id!=='string')refuse('DIS_BUILD_SOURCE_INVALID');
  const {id,origin,sourceText}=entry;
  const trusted=expectedSourceOrigins[id];
  if(!plain(trusted)||Object.keys(trusted).length!==4||
    ['repository','commit','path','gitBlob'].some(k=>trusted[k]!==origin[k]))refuse('DIS_SOURCE_ORIGIN_UNTRUSTED');
  if(sourceGitBlob(sourceText)!==origin.gitBlob)refuse('DIS_BUILD_SOURCE_BYTES_DRIFT');
  pins.push({id,origin:globalThis.structuredClone(origin),sha256:sourceSha256(sourceText)});
 }
 if(Object.keys(expectedSourceOrigins).length!==pins.length)refuse('DIS_SOURCE_ORIGIN_UNTRUSTED');
 const data={
  format:DIS_V020_AOT,built:globalThis.structuredClone(built),
  program:globalThis.structuredClone(program),sources:pins
 };
 const artifact={...data,digest:sha256Canonical(data)};
 // Validate *after* canonical BUILD selection and before any runtime touches
 // a Business Init or KDP. This is the single compiler qualification gate.
 qualifyDisV020Artifact(artifact);
 return freeze(artifact);
}
export function buildDisV020Aot({composition,program,sources,expectedSourceOrigins}={}){
 if(!composition)refuse('DIS_BUILD_INPUT_INVALID');
 const built=buildV10App(composition);
 return compileDisV020Aot({built,program,sources,expectedSourceOrigins});
}
