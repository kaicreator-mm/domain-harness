/**
 * DIS v0.2.0 cross-repository source-locked consumer qualification demo.
 * This is a narrow AOT projection fixture over EXACT, unchanged source blobs
 * from tally/runx/xDownload. Not a replacement native KDP/SDK installer.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const deny=code=>{const e=new Error(code);e.code=code;throw e};
const PROJECTS=Object.freeze({
 tally:{repository:'kaicreator-mm/tally',commit:'e988321439f65b55936a691c02250b6d62a29409'},
 runx:{repository:'kaicreator-mm/runx',commit:'b9e0c953d9bfd5834315012426fd8e10c21bdd7c'},
 xdownload:{repository:'kaicreator-mm/xDownload',commit:'e904f08c478b15147b1c07fbe53c610d2d81851f'},
});
const PINNED=Object.freeze({
 'tally/business.mjs':{
  repository:'kaicreator-mm/tally',
  originalPath:'packages/tally-engineering-business/src/index.mjs',
  gitBlob:'54015fb63ffb13b4f4e562f660d2172098b5f7f4'},
 'tally/release-readiness.mjs':{
  repository:'kaicreator-mm/tally',
  originalPath:'packages/tally-engineering-business/src/release-readiness.mjs',
  gitBlob:'2d4d6e7462156e4466192a0ed3207ac76fd288e1'},
 'runx/environment-agent-presence.ts':{
  repository:'kaicreator-mm/runx',
  originalPath:'packages/control-plane/src/environment-agent-presence.ts',
  gitBlob:'b2c669537a56638aeead4f55914533b00fe3935e'},
 'xdownload/business-download.mjs':{
  repository:'kaicreator-mm/xDownload',
  originalPath:'packages/download-domain-app/src/business/business-download.mjs',
  gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'},
 'xdownload/capability-acquisition-stub.mjs':{
  repository:'kaicreator-mm/xDownload',
  originalPath:'packages/download-domain-app/src/business/capability-acquisition-stub.mjs',
  gitBlob:'2bfa722f88abade392b33964820ea178c072ef39'},
});
const KINDS=new Set(['rule','knowledge','stateful','external-effect']);
export const gitBlobSha=buffer=>createHash('sha1').update(Buffer.concat([
 Buffer.from('blob '+buffer.length+'\0'),buffer
])).digest('hex');
const clone=value=>structuredClone(value);
function freeze(value){
 if(value!==null&&typeof value==='object'){
  for(const x of Object.values(value))freeze(x);
  Object.freeze(value);
 }
 return value;
}
export async function qualifyProjectConsumers(declaration){
 if(declaration?.schema!=='dis.v0.2.cross-project-demo/1')deny('DIS_CONSUMER_SCHEMA');
 if(!Array.isArray(declaration.consumers)||declaration.consumers.length!==3)deny('DIS_CONSUMERS_INCOMPLETE');
 const manifest=clone(declaration),modules=new Map(),functions=new Map(),elements=new Map(),owners=new Set(),verified=[];
 for(const project of manifest.consumers){
  if(owners.has(project.id))deny('DIS_DUP_CONSUMER');owners.add(project.id);
  const pinnedProject=PROJECTS[project.id];
  if(!pinnedProject||project.repository!==pinnedProject.repository||
     project.sourceCommit!==pinnedProject.commit||!project.domainId)deny('DIS_CONSUMER_IDENTITY');
  for(const entry of project.sources){
   const origin=PINNED[entry.file];
   if(!origin||origin.gitBlob!==entry.gitBlob)deny('DIS_SOURCE_NOT_PINNED');
   if(origin.repository!==project.repository||origin.originalPath!==entry.originalPath)
    deny('DIS_SOURCE_ORIGIN_INVALID');
   if(modules.has(entry.file))deny('DIS_DUP_SOURCE');
   const sourcePath=fileURLToPath(new URL('./snapshots/'+entry.file,import.meta.url));
   const bytes=await readFile(sourcePath);
   if(gitBlobSha(bytes)!==entry.gitBlob)deny('DIS_SOURCE_BYTES_DRIFT');
   modules.set(entry.file,await import(new URL('./snapshots/'+entry.file,import.meta.url).href));
   verified.push(Object.freeze({project:project.id,file:entry.file,gitBlob:entry.gitBlob}));
  }
  for(const el of project.elements){
   if(elements.has(el.id))deny('DIS_DUP_ELEMENT');
   if(!el.description||!Array.isArray(el.functions)||!el.functions.length)deny('DIS_ELEMENT_INVALID');
   elements.set(el.id,{...el,project:project.id});
   for(const fn of el.functions){
    const id=el.id+'.'+fn.id;
    if(functions.has(id))deny('DIS_DUP_FUNCTION');
    if(!KINDS.has(fn.implementation))deny('DIS_IMPLEMENTATION_UNKNOWN');
    if(fn.effects!=='none'&&fn.implementation!=='external-effect')deny('DIS_EFFECT_CLASS_MISMATCH');
    if(fn.implementation==='external-effect'&&fn.effects!=='non-idempotent')deny('DIS_EFFECT_CLASS_MISMATCH');
    if(!project.sources.some(x=>x.file===fn.source))deny('DIS_FUNCTION_FOREIGN_SOURCE');
    const exposed=modules.get(fn.source)?.[fn.exportName];
    if(typeof exposed!=='function')deny('DIS_FUNCTION_EXPORT_MISSING');
    functions.set(id,Object.freeze({...fn,id,owner:project.id}));
   }
  }
 }
 if(owners.size!==3||verified.length!==5||functions.size!==6)deny('DIS_COVERAGE_MISMATCH');
 const colors=new Map();
 const visit=id=>{
  if(!elements.has(id))deny('DIS_DEPENDENCY_MISSING');
  if(colors.get(id)===1)deny('DIS_DEPENDENCY_CYCLE');
  if(colors.get(id)===2)return;
  colors.set(id,1);
  const element=elements.get(id);
  for(const dep of element.dependsOn||[]){
   if(elements.get(dep)?.project!==element.project)deny('DIS_CROSS_PROJECT_DEPENDENCY');
   visit(dep);
  }
  colors.set(id,2);
 };
 for(const id of elements.keys())visit(id);
 const locked=freeze(manifest);
 const idOf=(id)=>{const fn=functions.get(id);if(!fn)deny('DIS_FUNCTION_UNBOUND');return fn};
 return Object.freeze({
  declaration:locked,verified:Object.freeze(verified),functionIds:Object.freeze([...functions.keys()]),
  describe:id=>idOf(id),
  async invoke(id,...args){
   const f=idOf(id);
   if(f.implementation==='external-effect')deny('DIS_EXTERNAL_EFFECT_KDP_REQUIRED');
   const impl=modules.get(f.source)[f.exportName];
   return f.implementation==='stateful'?new impl(...args):await impl(...args);
  },
 });
}