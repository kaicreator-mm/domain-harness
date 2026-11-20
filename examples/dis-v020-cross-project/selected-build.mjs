/**
 * DIS v0.2.0 R8: actual canonical BUILD + selected KDP/SDK using byte-identical
 * third-party Tally and xDownload Business modules. Runx is intentionally an
 * independent stateful observer Element, NOT a fabricated Business Policy.
 * Does not create GitHub Claim, acquire files, provision machines or authorize
 * any external effect.
 */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {buildV10App} from '../../tooling/build/dist/index.js';
import {basicComposition} from '../../tests/assembly/helpers-v010.ts';
import {qualifyProjectConsumers,gitBlobSha} from './consumer.mjs';

const pin={
 tally:{file:'tally/business.mjs',gitBlob:'54015fb63ffb13b4f4e562f660d2172098b5f7f4'},
 download:{file:'xdownload/business-download.mjs',gitBlob:'a7dba9a896de0b84fc6d54093563adca2ccbcdfc'},
 acquisition:{file:'xdownload/capability-acquisition-stub.mjs',gitBlob:'2bfa722f88abade392b33964820ea178c072ef39'},
};
const sha256=s=>createHash('sha256').update(s,'utf8').digest('hex');
const refuse=code=>{throw Object.assign(new Error(code),{code})};
async function pinnedSource(entry){
 const bytes=await readFile(new URL('./snapshots/'+entry.file,import.meta.url));
 if(gitBlobSha(bytes)!==entry.gitBlob)refuse('DIS_SELECTED_SOURCE_DRIFT');
 return bytes.toString('utf8');
}
export async function buildRealCrossProjectSelection({override={}}={}){
 // Real source-origin/Element/Function/export qualification must run first.
 const qualified=await qualifyProjectConsumers(
  JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8')));
 const [base,tally,download,acquisition]=await Promise.all([
  basicComposition(),pinnedSource(pin.tally),pinnedSource(pin.download),pinnedSource(pin.acquisition)]);
 const tallyPolicy=await qualified.invoke('tally.tasks.describeBusinessPolicy');
 const downloadPolicy=await qualified.invoke('downloads.confirmation.describeDownloadPolicy');
 if(tallyPolicy.packageId!=='business-tally-task-readiness@v2.0.0'||
    downloadPolicy.packageId!=='business-download@0.2.0-t03')refuse('DIS_BUSINESS_SOURCE_IDENTITY');
 const tallyModule={
  packageId:tallyPolicy.packageId,role:'business',abiVersion:'v08-business-abi/1',
  moduleSource:tally,moduleSha256:sha256(tally),endpoint:'business-policy',
  dependencies:[],requires:[],provides:['business:policy/1',
   ...Object.keys(tallyPolicy.intentBindings).map(id=>'intent:'+id)],
 };
 const downloadModule={
  packageId:downloadPolicy.packageId,role:'business',abiVersion:'v08-business-abi/1',
  moduleSource:download,moduleSha256:sha256(download),endpoint:'business-policy',
  dependencies:[],requires:[],provides:['business:policy/1','intent:confirmDownload'],
 };
 const acquisitionModule={
  packageId:'capability-acquisition-stub@0.2.0-t03',
  role:'capability',abiVersion:'v08-capability-abi/1',endpoint:'capability-endpoint',
  moduleSource:acquisition,moduleSha256:sha256(acquisition),
  dependencies:[],requires:[],provides:['capability:acquisition/1'],
  capabilityId:'acquisition',
  handlers:[{operationId:'acquisition.acquire',handler:'acquire'}],
  externalEffect:true,
 };
 const selection={
  ...base,appId:'app:dis-v020-r8-tally-xdownload',buildId:'dis-v020-r8-real-sources',
  modules:[...base.modules,tallyModule,downloadModule,acquisitionModule],
  routes:[...base.routes,{
   intentId:'confirmDownload',operationId:'acquisition.acquire',
   capabilityId:'acquisition',handlerId:'acquire',
  }],
 };
 // A negative test may mutate the *selected input* before canonical BUILD,
 // which then owns integrity/rejection; the unmodified producer is deterministic.
 if(override.modules)override.modules(selection.modules);
 if(override.routes)override.routes(selection.routes);
 const built=buildV10App(selection);
 return {built,qualified,origins:Object.freeze([
  Object.freeze({packageId:tallyModule.packageId,gitBlob:pin.tally.gitBlob}),
  Object.freeze({packageId:downloadModule.packageId,gitBlob:pin.download.gitBlob}),
  Object.freeze({packageId:acquisitionModule.packageId,gitBlob:pin.acquisition.gitBlob}),
 ])};
}