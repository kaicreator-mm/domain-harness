/**
 * T05 focused REAL v10 BUILD 16-subset smoke; execute only after four
 * independently packed Feature producers are installed in Node24 Builder.
 *
 * Run (in a staging workspace with compiler + 4 Feature npm tarballs):
 *   node selected-subsets-build.mjs
 *
 * This uses *installed* producer exports and pinned installed module bytes,
 * not repo-relative Feature source. It does not claim full clean-installed
 * Domain App activation, SQLite/Effect, or T06 release regression.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildV10App, sha256Hex, V10_TARGET_PROFILE,
} from '@kaicreator/domain-harness-compiler/v10build';
import { definitionV2 } from '../../v010-clean-consumer/apps/rich/app-definition.mjs';

const PRODUCERS = Object.freeze([
  ['@kaicreator/domain-feature-agent-diagnostics', 'agentDiagnosticsFeature'],
  ['@kaicreator/domain-feature-candidate-evaluation', 'candidateEvaluationFeature'],
  ['@kaicreator/domain-feature-experience-reuse', 'experienceReuseFeature'],
  ['@kaicreator/domain-feature-bounded-experiment', 'boundedExperimentFeature'],
]);
const PAYLOAD = Object.freeze({
  kernel:'@kaicreator/domain-harness-compiler/v10payload/kernel-mechanism',
  sdk:'@kaicreator/domain-harness-compiler/v10payload/standard-sdk',
  router:'@kaicreator/domain-harness-compiler/v10payload/workflow-router',
  'sfeature-semantic-decision':'@kaicreator/domain-harness-compiler/v10payload/sfeature-semantic-decision',
  'sfeature-workflow-control':'@kaicreator/domain-harness-compiler/v10payload/sfeature-workflow-control',
  'sfeature-context-assembly':'@kaicreator/domain-harness-compiler/v10payload/sfeature-context-assembly',
  'sfeature-decision-evidence':'@kaicreator/domain-harness-compiler/v10payload/sfeature-decision-evidence',
});
function payload(key) {
  return readFileSync(fileURLToPath(import.meta.resolve(PAYLOAD[key])), 'utf8');
}
const K=payload('kernel'), sdk=payload('sdk'), router=payload('router');
const S=[
  sdk,'const __dhv0101Router = (() => {',
  router.replace(/^export /gm, ''),
  'return {routeWorkflowIntent};})();',
  'export const routeWorkflowIntent=__dhv0101Router.routeWorkflowIntent;',
].join('\n');
const otherPayload={};
for(const name of ['sfeature-semantic-decision','sfeature-workflow-control',
  'sfeature-context-assembly','sfeature-decision-evidence']) {
  otherPayload[name]=payload(name);
}
function moduleInput(entry, bytes) {
  const mod = {
    packageId: entry.packageId,role:entry.role,abiVersion:entry.abiVersion,
    moduleSource:bytes,moduleSha256:sha256Hex(bytes),endpoint:entry.endpoint,
    dependencies:[...(entry.dependencies??[])],provides:[...entry.provides],
    requires:[...(entry.requires??[])],
  };
  for (const key of ['providerId','hookExport','featureExport','capabilityId',
    'externalImports','externalEffect']) if(entry[key]!==undefined)mod[key]=entry[key];
  if(entry.handlers!==undefined)mod.handlers=entry.handlers.map(handler=>({...handler}));
  return mod;
}
const base = definitionV2.modules.map(entry=>{
  const bytes = entry.role==='kernel-primary' ? K
    : entry.role==='standard-primary' ? S
      : entry.payload!==undefined ? otherPayload[entry.payload]
        : readFileSync(new URL('../../v010-clean-consumer/apps/rich/modules/'+entry.file,
          import.meta.url), 'utf8');
  assert.equal(typeof bytes,'string',entry.packageId+' real module bytes');
  return moduleInput(entry,bytes);
});
const available=[];
for(const [name,manifestExport] of PRODUCERS){
  const descriptor=(await import(name+'/manifest'))[manifestExport];
  assert.equal(descriptor.role,'standard-feature');
  assert.deepEqual(descriptor.requires,[]);
  assert.deepEqual(descriptor.dependencies,[]);
  const bytes=readFileSync(fileURLToPath(import.meta.resolve(name)),'utf8');
  const mod=moduleInput(descriptor,bytes);
  available.push(mod);
}
assert.equal(new Set(available.map(x=>x.provides[0])).size,4);
function appFor(mask,mods=available){
  return buildV10App({
    appId:'app:v0101-agent-improvement-smoke',
    audience:definitionV2.audience,
    targetProfile:V10_TARGET_PROFILE,
    modules:[...base, ...mods.filter((_,i)=>(mask&(1<<i))!==0)],
    routes:definitionV2.routes.map(route=>({...route})),
    hardBudget:{...definitionV2.hardBudget},
    buildId:'v0101-t05-mask-'+mask,
  });
}
const reports=[];
for(let mask=0;mask<16;mask++){
  const app=appFor(mask);
  const expected=available.filter((_,i)=>(mask&(1<<i))!==0).map(x=>x.packageId).sort();
  const observed=app.modules.filter(x=>x.role==='standard-feature')
    .map(x=>x.packageId).filter(x=>expected.includes(x)).sort();
  assert.deepEqual(observed,expected,'mask '+mask+' must include only selected new Features');
  for(const mod of available){
    assert.equal(app.loadOrder.includes(mod.packageId),
      expected.includes(mod.packageId), 'mask '+mask+' import closure');
  }
  reports.push({mask,selected:expected,subjectDigest:app.subjectDigest});
}
// The optional placeholder must be skipped without reserving a real selected
// Feature provider. Requires accepted B00 #1296, not a T05 compiler fix.
const present=available[0];
const absent={...present,packageId:'sfeature-optional-absent@v0101.0.0',
  optional:true};
delete absent.moduleSource;
delete absent.moduleSha256;
const withSkip=buildV10App({
  appId:'app:v0101-agent-improvement-smoke',
  audience:definitionV2.audience,targetProfile:V10_TARGET_PROFILE,
  modules:[...base,present,absent],
  routes:definitionV2.routes.map(route=>({...route})),
  hardBudget:{...definitionV2.hardBudget},
  buildId:'v0101-t05-skipped-placeholder',
});
assert(withSkip.skippedOptional.includes(absent.packageId));
assert(withSkip.modules.some(x=>x.packageId===present.packageId));
console.log(JSON.stringify({ok:true,stage:'T05_FOCUSED_BUILD_ONLY',
  selectedSubsets:reports.length,featurePackages:available.length,
  skippedOptionalProbe:'PASS',
  receipt:reports,cleanInstalledActivation:'NOT_RUN',sqliteEffect:'NOT_RUN'}));
