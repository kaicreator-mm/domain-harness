import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {qualifyProjectConsumers,gitBlobSha} from './consumer.mjs';
const declaration=JSON.parse(await readFile(new URL('./manifest.json',import.meta.url),'utf8'));
const denial=code=>e=>e?.code===code;
const changed=fn=>{const v=structuredClone(declaration);fn(v);return v};
const qualified=qualifyProjectConsumers(declaration);

test('AOT inputs: five exact Git blob snapshots match original project source bytes',async()=>{
 const a=await qualified;
 assert.equal(a.verified.length,5);
 for(const {file,gitBlob} of a.verified){
  const bytes=await readFile(new URL('./snapshots/'+file,import.meta.url));
  assert.equal(gitBlobSha(bytes),gitBlob);
 }
});
test('three real project domains export six DIS Function bindings',async()=>{
 const a=await qualified;
 assert.deepEqual(a.declaration.consumers.map(x=>x.id),['tally','runx','xdownload']);
 assert.equal(a.functionIds.length,6);
 assert.equal(new Set(a.functionIds).size,6);
});
test('declared domain Function cannot invent a new authoritative source pin',async()=>{
 const v=changed(x=>x.consumers[0].sources[0].gitBlob='a'.repeat(40));
 await assert.rejects(qualifyProjectConsumers(v),denial('DIS_SOURCE_NOT_PINNED'));
});
test('unknown path cannot be dynamically installed as source of a Function',async()=>{
 const v=changed(x=>x.consumers[0].sources[0].file='../outside.mjs');
 await assert.rejects(qualifyProjectConsumers(v),denial('DIS_SOURCE_NOT_PINNED'));
});
test('forged Function export is rejected before the runtime calls it',async()=>{
 const v=changed(x=>x.consumers[0].elements[0].functions[0].exportName='unselectedFunction');
 await assert.rejects(qualifyProjectConsumers(v),denial('DIS_FUNCTION_EXPORT_MISSING'));
});
test('cross-project Function implementation binding is rejected',async()=>{
 const v=changed(x=>x.consumers[2].elements[0].functions[0].source='tally/business.mjs');
 await assert.rejects(qualifyProjectConsumers(v),denial('DIS_FUNCTION_FOREIGN_SOURCE'));
});
test('one Element dependency cycle fails closed',async()=>{
 const v=changed(x=>x.consumers[0].elements[0].dependsOn=['tally.release']);
 await assert.rejects(qualifyProjectConsumers(v),denial('DIS_DEPENDENCY_CYCLE'));
});
test('dependencies may not quietly import another project Business Element',async()=>{
 const v=changed(x=>x.consumers[1].elements[0].dependsOn=['tally.tasks']);
 await assert.rejects(qualifyProjectConsumers(v),denial('DIS_CROSS_PROJECT_DEPENDENCY'));
});
test('an external Effect cannot be relabeled as a pure Function',async()=>{
 const v=changed(x=>x.consumers[2].elements[1].functions[0].implementation='rule');
 await assert.rejects(qualifyProjectConsumers(v),denial('DIS_EFFECT_CLASS_MISMATCH'));
});
test('compiled Function selection and manifest are immutable',async()=>{
 const a=await qualified;
 assert.ok(Object.isFrozen(a.declaration));
 assert.ok(Object.isFrozen(a.declaration.consumers[0].elements[0].functions[0]));
 assert.equal(a.describe('downloads.acquisition.acquire').effects,'non-idempotent');
 assert.throws(()=>{a.declaration.consumers[0].domainId='forged'},TypeError);
});
test('Tally: actual Business package exposes native engineering Domain policy without minting K authority',async()=>{
 const a=await qualified;
 const p=await a.invoke('tally.tasks.describeBusinessPolicy');
 assert.equal(p.domainId,'tally-engineering');
 assert.equal(p.packageId,'business-tally-task-readiness@v2.0.0');
 assert.ok(p.intentBindings.inspectTaskReadiness);
 assert.ok(p.effectBindings['effect:tally-readiness-observation']);
});
test('Tally: malformed task input remains unqualified, not an admitted Task Claim',async()=>{
 const a=await qualified;
 const r=await a.invoke('tally.tasks.assessTaskEvidence',{});
 assert.equal(r.state,'UNQUALIFIED_INPUT');assert.equal(r.admitted,false);
});
test('Tally: valid-shaped task evidence is only observed, never native Claim admission',async()=>{
 const a=await qualified;
 const r=await a.invoke('tally.tasks.assessTaskEvidence',{
  issueRef:'https://github.com/kaicreator-mm/tally/issues/331',issueNumber:331,
  sourceSha:'a'.repeat(40),claimRef:'claim:demo-not-authority',dependenciesComplete:true,
 });
 assert.equal(r.state,'OBSERVED_INPUT_ONLY');
 assert.equal(r.admitted,false);assert.equal(r.taskPass,false);
});
test('Tally: a mismatched issue identity cannot qualify merely because it carries valid-looking SHA',async()=>{
 const a=await qualified;
 const r=await a.invoke('tally.tasks.assessTaskEvidence',{
  issueRef:'https://github.com/kaicreator-mm/tally/issues/331',issueNumber:332,
  sourceSha:'a'.repeat(40),claimRef:'claim:demo',dependenciesComplete:true,
 });
 assert.equal(r.reason,'MISSING_SOURCE_IDENTITY');
 assert.equal(r.admitted,false);
});
test('Tally: RELEASE complete-looking evidence never bypasses independent RQ authority',async()=>{
 const a=await qualified;
 const {RELEASE_READINESS_REQUIRED_GATES}=await import('./snapshots/tally/release-readiness.mjs');
 const subject='b'.repeat(40),observedAsOf='2026-11-08T08:00:00Z';
 const gates=Object.fromEntries(RELEASE_READINESS_REQUIRED_GATES.map(name=>[name,{
  status:'PASS',subjectSha:subject,observedAsOf:'2026-11-08T07:00:00Z',
  evidenceRef:'https://github.com/kaicreator-mm/tally/issues/331',
 }]));
 const r=await a.invoke('tally.release.projectReleaseReadiness',{
  repository:'kaicreator-mm/tally',sourceSha:subject,observedAsOf,gates,
 });
 assert.equal(r.gateCounts.reportedPass,RELEASE_READINESS_REQUIRED_GATES.length);
 assert.equal(r.status,'BLOCKED');assert.equal(r.authorization,'NONE');
 assert.equal(r.canMerge,false);assert.equal(r.canPublish,false);
});
test('Tally: stale source SHA becomes STALE, not a PASS',async()=>{
 const a=await qualified;
 const r=await a.invoke('tally.release.projectReleaseReadiness',{
  repository:'kaicreator-mm/tally',sourceSha:'b'.repeat(40),observedAsOf:'2026-11-08T08:00:00Z',
  gates:{woodpeckerCI:{status:'PASS',subjectSha:'a'.repeat(40),
   observedAsOf:'2026-11-08T07:00:00Z',evidenceRef:'https://github.com/kaicreator-mm/tally/issues/331'}},
 });
 assert.equal(r.gates.find(x=>x.name==='woodpeckerCI').status,'STALE');
 assert.equal(r.canMerge,false);
});
test('Runx: actual EnvironmentAgentPresence ignores mismatched agent token',async()=>{
 const a=await qualified;
 const presence=await a.invoke('runx.agent.presence.createPresenceObserver',()=> '2026-11-08T07:00:00Z');
 presence.observe({agent_id:'agent-1',agent_incarnation_id:'inc-1',capability:{capability_id:'compute'}},
   {agent_id:'agent-other'});
 assert.equal(presence.latest(),null);
});
test('Runx: real instance tracks updated incarnation and resolves deterministic latest observation',async()=>{
 const a=await qualified;
 const presence=await a.invoke('runx.agent.presence.createPresenceObserver',()=> '2026-11-08T07:00:00Z');
 presence.observe({agent_id:'agent-a',agent_incarnation_id:'inc-1',capability:{capability_id:'compute'}},{agent_id:'agent-a'});
 presence.observe({agent_id:'agent-b',agent_incarnation_id:'inc-9',capability:{capability_id:'storage'}},{agent_id:'agent-b'});
 presence.observe({agent_id:'agent-a',agent_incarnation_id:'inc-2',capability:{capability_id:'compute'}},{agent_id:'agent-a'});
 assert.equal(presence.list().length,2);
 assert.equal(presence.list().find(x=>x.agent_id==='agent-a').agent_incarnation_id,'inc-2');
 assert.equal(presence.latest().agent_id,'agent-b');
});
test('Runx: presence observation cannot be treated as a fresh lease or execution permit',async()=>{
 const a=await qualified;
 const observer=await a.invoke('runx.agent.presence.createPresenceObserver',()=> '2020-01-01T00:00:00Z');
 observer.observe({agent_id:'agent-1',agent_incarnation_id:'inc-1',capability:{capability_id:'compute'}},{agent_id:'agent-1'});
 const latest=observer.latest();
 assert.equal(latest.last_seen_at,'2020-01-01T00:00:00Z');
 assert.equal(Object.hasOwn(latest,'lease_current'),false);
 assert.equal(Object.hasOwn(latest,'execution_authorized'),false);
});
test('xDownload: actual selected Business policy declares guarded K-to-C Effect',async()=>{
 const a=await qualified;
 const p=await a.invoke('downloads.confirmation.describeDownloadPolicy');
 assert.equal(p.domainId,'downloads');
 assert.equal(p.packageId,'business-download@0.2.0-t03');
 assert.ok(p.intentBindings.confirmDownload);
 assert.equal(p.workflowDefinition.guards[0].predicate.op,'lte');
 assert.equal(p.workflowDefinition.guards[0].predicate.right.value,1048576);
 const effect=p.effectBindings['effect:acquire'];
 assert.equal(effect.resource.key,'acquisition');
 assert.equal(effect.resource.operation,'acquisition.acquire');
 assert.equal(effect.external.await,'terminal');
 assert.equal(effect.semantics,'non-idempotent');
});
test('xDownload: actual Capability requires a K-issued permit and exact acquisition route',async()=>{
 const mod=await import('./snapshots/xdownload/capability-acquisition-stub.mjs');
 assert.equal(mod.OPERATIONS[0].effectClass,'non-idempotent');
 assert.equal(mod.OPERATIONS[0].externalEffect,true);
 assert.equal(mod.OPERATIONS[0].intentType,'confirmDownload');
 assert.equal(mod.OPERATIONS[0].resource.operation,'acquisition.acquire');
 assert.throws(()=>mod.acquire({requestId:'dry-run'},{}),/requires the trusted Host acquisition bridge/);
});
test('xDownload: raw cross-project Function caller cannot dispatch acquisition Effect directly',async()=>{
 const a=await qualified;
 await assert.rejects(a.invoke('downloads.acquisition.acquire',{requestId:'fake'},{}),
  denial('DIS_EXTERNAL_EFFECT_KDP_REQUIRED'));
});
test('DIS source-pinned consumer does not manufacture Package, KDP or Provider activation',async()=>{
 const a=await qualified;
 assert.equal(a.declaration.schema,'dis.v0.2.cross-project-demo/1');
 assert.equal(Object.hasOwn(a,'mintPermit'),false);
 assert.equal(Object.hasOwn(a,'loadNativeKdp'),false);
 assert.equal(Object.hasOwn(a,'claimRelease'),false);
});