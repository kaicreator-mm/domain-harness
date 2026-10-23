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
  buildV10App, sha256Hex, V10_TARGET_PROFILE, activateV10App,
} from '@kaicreator/domain-harness-compiler/v10build';
import { definitionV2 } from '../../v010-clean-consumer/apps/rich/app-definition.mjs';
import { invokeAgentImprovementFeature } from '../../../extensions/agent-improvement/host/ct02-data-only-invoker.mjs';

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

// Real selected-module activation + CT-02 invocation: uses source-qualified
// installed tarball bytes in the BUILD. The backing store intentionally rejects
// any K write/effect on this *read/evaluation only* smoke path.
const readonlyStore = {
  reads:0, writes:0,
  async get(_key) { this.reads++; return null; },
  async put() { this.writes++; throw Error('T05_READ_ONLY_UNEXPECTED_K_WRITE'); },
  async remove() { this.writes++; throw Error('T05_READ_ONLY_UNEXPECTED_K_DELETE'); },
};
const allSelected = appFor(15);
const activation = await activateV10App(allSelected,{store:readonlyStore});
const SHA='a'.repeat(40), NEXT='b'.repeat(40);
const evidenceCase=(caseId,subjectSha,status)=>({
  caseId,subjectSha,status,sourceRef:'verifier:evidence1',
  verifierRef:'v1',coverage:'COMPLETE',
});
const oracleChecks=['POSITIVE','NEGATIVE','INDEPENDENT'].map(kind=>({
  kind,status:'PASS',sourceRef:'github:oracle:'+kind,
}));
const requests = [
  {subjectSha:SHA,events:[],expectedVerifierRefs:[]},
  {baselineSha:SHA,candidateSha:NEXT,verifierRevision:'r1',
   holdoutVisibility:'ISOLATED',oracleChecks,
   baseline:[evidenceCase('t1',SHA,'FAIL'),evidenceCase('t2',SHA,'PASS')],
   candidate:[evidenceCase('t1',NEXT,'PASS'),evidenceCase('t2',NEXT,'PASS')]},
  {current:{projectId:'project:p',taskClass:'class:repair',subjectSha:SHA,
    ruleRevision:'ads@sha123'},candidates:[]},
  {proposalId:'experiment:one',subjectSha:SHA,baselineRef:'candidate:base',
   candidateRef:'candidate:next',hypothesisRef:'github:hypothesis',
   environment:'SHADOW',risk:'LOW',isolationEvidenceRef:'host:isolated-plan',
   maxProbeCalls:3,maxWallMs:30000,maxCostMicro:1000000,
   verifierRefs:['github:verifier'],effectPolicy:'DENY_EXTERNAL_EFFECTS'},
];
const invoked=[];
try {
  for(let i=0;i<PRODUCERS.length;i++){
    const featureKey=available[i].provides[0];
    const result=await invokeAgentImprovementFeature(
      activation.facade,featureKey,requests[i],{},
    );
    assert.equal(typeof result,'object',featureKey+' advisory output');
    assert.notEqual(result,null,featureKey+' advisory output');
    // No execution, permit or Gate PASS is inferred from an advisory result.
    assert.equal(result.taskGateVerdict,'NOT_DETERMINED',featureKey+' no gate authority');
    invoked.push(featureKey);
  }
  // Unselected Features do not dynamically load; test the zero-Feature App.
  const emptyActivation=await activateV10App(appFor(0),{store:readonlyStore});
  try{
    await assert.rejects(
      () => emptyActivation.facade.invokeSelectedStandardFeature(
        available[0].provides[0],requests[0],{},
      ),
      {code:'V10_FEATURE_NOT_SELECTED'},
    );
  }finally{emptyActivation.dispose();}
}finally{
  activation.dispose();
}
assert.equal(readonlyStore.writes,0,'advisory CT-02 may not write K or effects');
assert.deepEqual(invoked,available.map(x=>x.provides[0]));
console.log(JSON.stringify({
  ok:true,stage:'T05_SELECTED_BUILD_AND_ACTIVATION_SMOKE',
  selectedSubsets:reports.length,featurePackages:available.length,
  selectedInvocations:invoked,skippedOptionalProbe:'PASS',
  effectWriteCount:readonlyStore.writes,
  receipt:reports,
  isolatedCleanInstall:'NOT_ASSERTED_BY_THIS_SCRIPT',
  sqliteEffectRegression:'NOT_RUN',versionRelease:'NOT_RUN',
}));
