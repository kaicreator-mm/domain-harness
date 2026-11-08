import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { Graph, Selection, Unit, UnitRef } from './types.js';

export function digest(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonical(record[key])]));
  }
  return value;
}

export function canonicalDigest(value: unknown): string {
  return digest(JSON.stringify(canonical(value)));
}
const verifiedSelections = new WeakMap<object, string>();
export function assertVerifiedSelection(selection: Selection): void {
  const pin = verifiedSelections.get(selection);
  if (!pin || canonicalDigest(selection) !== pin) throw new Error('SELECTION_NOT_VERIFIED');
}

function requirePin(actual: string | undefined, expected: string, code: string): void {
  if (!/^[a-f0-9]{64}$/.test(expected) || actual !== expected) throw new Error(code);
}

interface PackageIdentity {
  packageId: string;
  revision: string;
  resourceClosurePath: string;
  resourceClosureSha256: string;
  selectionLockSha256: string;
  runtimeReader?: { knowledgeKind: string; processor: string; resourcePath: string };
  selectionLock: {
    packageId: string;
    packageRevision: string;
    selectedAssets: (UnitRef & { kind: string; sha256: string })[];
    target: string;
    businessPolicy?: { intentId: string; operationId: string; capabilityId: string; handlerId: string; scope: string };
    validationEvidence?: { path: string; sha256: string };
    promotionDecision?: {
      kind: string; scope: string; authority: string; authorizationEvidence: string;
      prior: { kind: string; packageId?: string; revision?: string; lockSha256?: string };
      subject: { id: string; revision: string; sha256: string };
      validationEvidence: { path: string; sha256: string };
    };
    selectedCapabilities: { capabilityId: string; owner: string; authorityRef: string; version: string; contractDigest: string; provider: { unitId: string; unitRevision: string; candidateId: string; implementationRef: string; artifactRef: string; artifactDigest: string; target: string; contractDigest: string } }[];
  };
}
interface Manifest {
  packageId: string;
  packageRevision: string;
  graphRef: UnitRef;
  definitionRef: UnitRef;
  units: UnitRef[];
  resources: { path: string; sha256: string }[];
}

function validateProbeGraph(graph: Graph, units: Record<string, Unit>, parse: <T>(ref: string) => T): void {
  type Schema = { properties?: Record<string, unknown>; required?: string[] };
  const reject = (ok: unknown, code: string) => { if (!ok) throw new Error('INVALID_GRAPH:' + code); };
  reject(graph.schemaVersion === 'dis.graph/0.1.0' && graph.cyclePolicy === 'DAG_ONLY', 'SCHEMA');
  reject(Array.isArray(graph.nodes) && graph.nodes.length > 0 && graph.nodes.length <= 32 && Array.isArray(graph.edges) && graph.edges.length <= 128, 'SIZE');
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  reject(nodes.size === graph.nodes.length && nodes.has(graph.entryNode), 'NODES');
  reject(Array.isArray(graph.terminalNodes) && graph.terminalNodes.length > 0 && new Set(graph.terminalNodes).size === graph.terminalNodes.length && graph.terminalNodes.every((id) => nodes.has(id)), 'TERMINALS');
  for (const node of graph.nodes) reject(units[node.unitRef.id]?.revision === node.unitRef.revision, 'UNIT_REF');
  const schema = (id: string, field: 'input' | 'output') => parse<Schema>(units[nodes.get(id)!.unitRef.id][field].schemaRef);
  reject(units[nodes.get(graph.entryNode)!.unitRef.id].input.schemaRef === graph.inputSchemaRef, 'GRAPH_INPUT');
  for (const id of graph.terminalNodes) reject(units[nodes.get(id)!.unitRef.id].output.schemaRef === graph.outputSchemaRef, 'GRAPH_OUTPUT');
  reject(new Set(graph.edges.map((edge) => canonicalDigest(edge))).size === graph.edges.length, 'DUPLICATE_EDGE');
  const controls = graph.edges.filter((edge) => edge.kind === 'control');
  const adjacency = new Map(graph.nodes.map((node) => [node.nodeId, [] as string[]]));
  for (const edge of graph.edges) {
    reject(['control','data','evidence'].includes(edge.kind), 'EDGE_KIND');
    if (edge.kind === 'control') {
      reject(nodes.has(edge.from) && nodes.has(edge.to), 'CONTROL_ENDPOINT');
      if (edge.when) {
        reject(edge.when.operator === 'equals' && Object.hasOwn(edge.when,'value'), 'CONDITION');
        reject(edge.when.path === '' || /^\/[a-zA-Z][a-zA-Z0-9]*$/.test(edge.when.path) && Object.hasOwn(schema(edge.from,'output').properties ?? {},edge.when.path.slice(1)), 'CONDITION_POINTER');
      }
      adjacency.get(edge.from)!.push(edge.to);
    } else {
      reject(nodes.has(edge.from.node) && nodes.has(edge.to.node), 'BINDING_ENDPOINT');
      reject(edge.from.node !== edge.to.node && edge.to.node !== graph.entryNode, 'BINDING_ANCESTRY');
      const source = schema(edge.from.node,'output');
      reject(edge.from.pointer === '' && edge.kind === 'data' || /^\/[a-zA-Z][a-zA-Z0-9]*$/.test(edge.from.pointer) && Object.hasOwn(source.properties ?? {},edge.from.pointer.slice(1)) && (source.required ?? []).includes(edge.from.pointer.slice(1)), 'SOURCE_POINTER');
      if (edge.kind === 'data') reject(/^\/[a-zA-Z][a-zA-Z0-9]*$/.test(edge.to.pointer) && Object.hasOwn(schema(edge.to.node,'input').properties ?? {},edge.to.pointer.slice(1)), 'TARGET_POINTER');
      else reject((units[nodes.get(edge.to.node)!.unitRef.id].evidence?.consumes ?? []).includes(edge.to.slot), 'EVIDENCE_SLOT');
    }
  }
  for (const node of graph.nodes) {
    const outgoing = controls.filter((edge) => edge.kind === 'control' && edge.from === node.nodeId);
    if (outgoing.length === 1) reject(!outgoing[0].when, 'PARTIAL_CONTROL');
    if (outgoing.length > 1) {
      const path = outgoing[0].when?.path;
      reject(typeof path === 'string' && path !== '' && outgoing.every((edge) => edge.when?.operator === 'equals' && edge.when.path === path), 'AMBIGUOUS_CONTROL');
      const field = (schema(node.nodeId,'output').properties ?? {})[path!.slice(1)] as {enum?: unknown[]};
      reject(Array.isArray(field?.enum) && new Set(outgoing.map((edge) => canonicalDigest(edge.when!.value))).size === outgoing.length && canonicalDigest(field.enum.map(canonicalDigest).sort()) === canonicalDigest(outgoing.map((edge) => canonicalDigest(edge.when!.value)).sort()), 'CONTROL_COVERAGE');
    }
  }
  const paths: string[][] = [], visiting = new Set<string>(), reached = new Set<string>();
  const visit = (node: string, path: string[]) => {
    reject(!visiting.has(node), 'CYCLE');
    visiting.add(node); reached.add(node);
    const next = adjacency.get(node)!;
    if (graph.terminalNodes.includes(node)) {
      reject(next.length === 0, 'TERMINAL_CONTROL'); paths.push([...path,node]); reject(paths.length <= 256, 'PATH_LIMIT');
    } else { reject(next.length > 0, 'DEAD_END'); for (const target of next) visit(target,[...path,node]); }
    visiting.delete(node);
  };
  visit(graph.entryNode,[]); reject(reached.size === nodes.size, 'UNREACHABLE');
  for (const edge of graph.edges) if (edge.kind !== 'control') {
    reject(paths.some((path) => path.includes(edge.to.node) && path.indexOf(edge.from.node) >= 0 && path.indexOf(edge.from.node) < path.indexOf(edge.to.node)), 'BINDING_ANCESTRY');
  }
  for (const path of paths) for (const [index,id] of path.entries()) {
    if (index === 0) continue;
    const previous = new Set(path.slice(0,index));
    const target = schema(id,'input');
    const bindings = graph.edges.filter((edge) => edge.kind === 'data' && edge.to.node === id && previous.has(edge.from.node));
    for (const field of Object.keys(target.properties ?? {})) {
      const count = bindings.filter((edge) => edge.kind === 'data' && edge.to.pointer === '/'+field).length;
      reject(count <= 1 && (!(target.required ?? []).includes(field) || count === 1), 'DATA_PATH_BINDING');
    }
    for (const slot of units[nodes.get(id)!.unitRef.id].evidence?.consumes ?? []) {
      const count = graph.edges.filter((edge) => edge.kind === 'evidence' && edge.to.node === id && edge.to.slot === slot && previous.has(edge.from.node)).length;
      reject(count === 1, 'EVIDENCE_PATH_BINDING');
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- Historical JSON is untrusted and validated against explicit pins, transition checks and the frozen report schema below. */
async function verifyRuntimeLifecycle(identity: any, manifest: any, raw: Map<string, Buffer>, inside: (path: string) => Promise<Buffer>, depth=0): Promise<void> {
  const fail = (condition: unknown, code: string) => { if (!condition) throw new Error('RUNTIME_LIFECYCLE_'+code); };
  const lock=identity.selectionLock, anchor=lock.lifecycle, history=identity.lifecycleHistory, records=identity.lifecycleRecords;
  fail(anchor && history && Array.isArray(records) && canonicalDigest(records)===anchor.recordsSha256,'RECORD_SET');
  const decode=(value: string) => { const b=Buffer.from(value,'base64');fail(b.toString('base64')===value,'HISTORY_ENCODING');return b; };
  const frozenBytes=decode(history.frozenDescriptor), frozenManifest=decode(history.frozenManifest);
  fail(digest(frozenBytes)==='5734bba9e82e63d9f69b004a0bd16e631638cd512c09020bd951e1e2f676e0f6' && digest(frozenBytes)===anchor.frozenDescriptorSha256
    && digest(frozenManifest)==='2548b63764b72eeef3226dc77c2de305fcf1bc5d61f2a54593d83550dea421d8' && digest(frozenManifest)===anchor.frozenManifestSha256,'FROZEN_PROVENANCE');
  const frozen=JSON.parse(frozenBytes.toString('utf8')).dis;
  const frozenSelected=new Set(frozen.selectionLock.selectedAssets.map((a:any)=>a.kind+':'+a.id));
  const frozenRecords=frozen.lifecycleRecords.filter((r:any)=>frozenSelected.has(r.subject.kind+':'+r.subject.id));
  let prefix=frozenRecords, prior:any=null;
  if (history.priorDescriptor) {
    fail(depth===0 && history.priorResources && typeof history.priorResources==='object','PRIOR_DEPTH');
    const priorBytes=decode(history.priorDescriptor), priorManifest=decode(history.priorManifest);
    fail(digest(priorBytes)===anchor.priorDescriptorSha256 && digest(priorManifest)===anchor.priorManifestSha256,'PRIOR_BYTES');
    prior=JSON.parse(priorBytes.toString('utf8')).dis;
    fail(prior.packageId===identity.packageId && prior.revision!==identity.revision && prior.selectionLockSha256===anchor.priorLockSha256
      && canonicalDigest(prior.selectionLock)===prior.selectionLockSha256 && prior.resourceClosureSha256===anchor.priorManifestSha256,'PRIOR_IDENTITY');
    fail(canonicalDigest(prior.lifecycleRecords)===prior.selectionLock.lifecycle.recordsSha256,'PRIOR_RECORDS');
    fail(prior.lifecycleRecords.length>=frozenRecords.length && frozenRecords.every((r:any,i:number)=>canonicalDigest(r)===canonicalDigest(prior.lifecycleRecords[i])),'FROZEN_PREFIX');
    const priorMap = new Map<string, Buffer>(Object.entries(history.priorResources).map(([path,value])=>[path,decode(value as string)]));
    const priorManifestObject=JSON.parse(priorManifest.toString('utf8'));
    for (const entry of priorManifestObject.resources) fail(priorMap.has(entry.path) && digest(priorMap.get(entry.path)!)===entry.sha256,'PRIOR_RESOURCE');
    fail(priorMap.has('domain/resource-closure.json') && digest(priorMap.get('domain/resource-closure.json')!)===prior.resourceClosureSha256,'PRIOR_MANIFEST_RESOURCE');
    const priorInside=async(path:string)=>{const bytes=priorMap.get(path);if(!bytes)throw new Error('RUNTIME_LIFECYCLE_PRIOR_MISSING');return bytes;};
    await verifyRuntimeLifecycle(prior,priorManifestObject,priorMap,priorInside,depth+1);
    prefix=prior.lifecycleRecords;
  }
  fail(records.length>=prefix.length && prefix.every((r:any,i:number)=>canonicalDigest(r)===canonicalDigest(records[i])),'HISTORY_PREFIX');
  const capture=identity.qualification?.behaviorCapture;
  const fixturePolicy=identity.qualification?.fixturePolicy;
  const validatorBinding={id:'xdownload-dis-independent-conformance',version:'0.1.0',sourceHead:'b9d923e4d43a3a4bcd1d655c52117dcf381e33d3',path:'packages/dis-v011-runtime/src/trace.ts',sha256:'d73b54769f1aaa78310beda6ce6f45b871a7da6ccfc99197883ca6c90df71fd6'};
  fail(fixturePolicy && canonicalDigest(fixturePolicy)===canonicalDigest({id:'xdownload-private-reference-lifecycle',revision:'1.0.0',scope:'PRIVATE_REFERENCE_ONLY',authority:'fixture-reference-governance',authorizationEvidence:'https://github.com/kaicreator-mm/domain-harness/pull/1498#issuecomment-6714146893',validatorBinding,materializedAt:fixturePolicy.materializedAt})
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(fixturePolicy.materializedAt) && !Number.isNaN(Date.parse(fixturePolicy.materializedAt)) && Date.parse(fixturePolicy.materializedAt)>=Date.parse('2026-11-08T06:42:27Z'),'FIXTURE_POLICY');
  fail(capture && capture.sha256==='cf9ceac3d9b4f683a721538473f2d7f39bdd643c269a488a4056958c8f1f5720' && canonicalDigest(capture.capture)===capture.sha256 && capture.sha256===anchor.captureSha256
    && capture.capture.inputHead==='b9d923e4d43a3a4bcd1d655c52117dcf381e33d3','CAPTURE_PIN');
  const variant=history.priorDescriptor?'reselected':'baseline', observed=capture.capture.cases[variant];
  const expectedStatus:any={known:'READY',unknown:'NEEDS_REVIEW',ambiguous:'NEEDS_INPUT',conflict:'NEEDS_INPUT',scope:'OUT_OF_SCOPE',missing:'NEEDS_INPUT',malformed:'FAILED','strategy-coverage':variant==='baseline'?'READY':'PARTIAL','unauthorized-field':'FAILED'};
  fail(observed && observed.closureSha256===identity.resourceClosureSha256 && observed.providerSha256===lock.selectedCapabilities[0].provider.artifactDigest
    && observed.kernelSha256==='e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7'
    && observed.primarySha256==='7b1214c568c329d2fd998dcb2485ad3cef05aca4e51683b7b9709e8f15e51f07'
    && observed.exercisedLockSha256===(variant==='baseline'?'3431b9201ff60c625a64146e22e95d161aa580137dd1ba37f423291e0a7b29d8':'55f2f9e15f30613e1e002b6a3c656ff31024802c1031dc881489972b5ce335c3')
    && capture.capture.runtime==='v24.21.0' && capture.capture.platform==='win32' && capture.capture.validatedAt==='2026-11-08T06:42:27Z'
    && Array.isArray(observed.scenarios) && observed.scenarios.length===9 && new Set(observed.scenarios.map((s:any)=>s.id)).size===9
    && observed.scenarios.every((s:any)=>expectedStatus[s.id]===s.status && ['positive','negative','boundary'].includes(s.category) && /^[a-f0-9]{64}$/.test(s.receiptSha256) && /^[a-f0-9]{64}$/.test(s.journalOutputSha256)), 'CAPTURE_CONTENT');
  const schemaBytes=await readFile(new URL('../../../docs/standards/domain-intelligence/DIS-0.1.0/schemas/validation-report.schema.json',import.meta.url));
  fail(digest(schemaBytes)==='c30a7e281791cf00df26ce1c3800c2cffa8821d1bad171c0c6464d7de6e1871f','REPORT_SCHEMA_PIN');
  const {Ajv2020}=await import('ajv/dist/2020.js');const ajv=new Ajv2020({strict:false});
  ajv.addFormat('date-time',(v:string)=>/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString()===v.replace('Z','.000Z'));
  const checkReport=ajv.compile<any>(JSON.parse(schemaBytes.toString('utf8')));
  const hashes=new Map(manifest.resources.map((r:any)=>[r.path,r.sha256]));
  const priorByKey=new Map((prior?.selectionLock.selectedAssets ?? frozen.selectionLock.selectedAssets).map((a:any)=>[a.kind+':'+a.id,a]));
  if (prior) priorByKey.set('package:'+prior.packageId,prior.selectionLock.packageQualification);
  const seen=new Set<string>();
  for (const record of records) {
    const {recordDigest,...body}=record;
    fail(typeof record.recordId==='string' && !seen.has(record.recordId) && canonicalDigest(body)===recordDigest,'RECORD_DIGEST');seen.add(record.recordId);
  }
  const current=records.slice(prefix.length), selected=[...lock.selectedAssets.filter((a:any)=>['unit','graph','rule','knowledge'].includes(a.kind)),lock.packageQualification];
  fail(selected.length===manifest.units.length+4 && new Set(selected.map((a:any)=>a.kind+':'+a.id)).size===selected.length,'SELECTED_INVENTORY');
  const expectedPaths=manifest.resources.map((r:any)=>({path:r.path,sha256:r.sha256}));
  for (const asset of selected) {
    const subject={kind:asset.kind,id:asset.id,revision:asset.revision,sha256:asset.sha256}, key=asset.kind+':'+asset.id;
    fail(asset.kind==='package' ? asset.path==='domain/resource-closure.json' && asset.sha256===identity.resourceClosureSha256 : hashes.get(asset.path)===asset.sha256,'SUBJECT_PIN');
    const own=current.filter((r:any)=>canonicalDigest(r.subject)===canonicalDigest(subject));
    const old:any=priorByKey.get(key), unchanged=old && old.revision===asset.revision && old.sha256===asset.sha256;
    fail(own.length===(unchanged?2:3) && own.map((r:any)=>r.transition).join(',')===(unchanged?'VALIDATED,PROMOTED':'CANDIDATE,VALIDATED,PROMOTED'),'TRANSITIONS');
    const candidate=unchanged ? prefix.find((r:any)=>r.transition==='CANDIDATE' && canonicalDigest(r.subject)===canonicalDigest(subject)) : own[0];
    const validated=own[unchanged?0:1], promoted=own[unchanged?1:2];
    fail(candidate && own.every((r:any)=>r.subjectPath===asset.path && r.dependencyClosureDigest===identity.resourceClosureSha256 && r.policy?.id==='xdownload-private-reference-lifecycle' && r.policy?.revision==='1.0.0'),'RECORD_CONTEXT');
    if (!unchanged) {
      const bytes=asset.kind==='package'?await inside(asset.path):raw.get(asset.path);
      fail(bytes && digest(bytes)===asset.sha256 && candidate.subjectJson===bytes.toString('utf8') && candidate.actor?.id==='runtime-reference-author' && candidate.actor?.role==='candidate-producer'
        && candidate.previousRecordId===null && candidate.previousRecordDigest===null && candidate.candidateProvenance?.sourceClosureSha256===(prior?.resourceClosureSha256 ?? '2548b63764b72eeef3226dc77c2de305fcf1bc5d61f2a54593d83550dea421d8')
        && candidate.candidateProvenance?.sourceLockSha256===(prior?.selectionLockSha256 ?? frozen.selectionLockSha256)
        && candidate.candidateProvenance?.schemaRevision==='0.1.0' && candidate.candidateProvenance?.target==='node24'
        && candidate.candidateProvenance?.method?.id==='deterministic-aot' && candidate.candidateProvenance?.method?.toolchain==='Node 24' && candidate.candidateProvenance?.changeRef==='issue:1486','CANDIDATE');
      const parent=candidate.candidateProvenance.parent;
      fail(old ? parent?.kind==='SUBJECT' && canonicalDigest(parent.subject)===canonicalDigest({kind:old.kind,id:old.id,revision:old.revision,sha256:old.sha256}) : parent?.kind==='GENESIS','PARENT');
    }
    const previous=unchanged ? prefix.find((r:any)=>r.recordId===old.promotionRecordId && r.recordDigest===old.promotionRecordDigest) : candidate;
    fail(previous && validated.previousRecordId===previous.recordId && validated.previousRecordDigest===previous.recordDigest
      && validated.validation?.candidateRecordId===candidate.recordId && validated.validation?.candidateRecordDigest===candidate.recordDigest
      && validated.validation?.behaviorCaptureSha256===capture.sha256 && canonicalDigest(validated.validation?.validatorBinding)===canonicalDigest(validatorBinding),'VALIDATION_CHAIN');
    const reportBytes=await inside(validated.validation.reportPath);fail(digest(reportBytes)===validated.validation.reportSha256,'REPORT_BYTES');
    const report=JSON.parse(reportBytes.toString('utf8'));
    fail(checkReport(report) && canonicalDigest(report)===validated.validation.reportCanonicalSha256 && report.result==='PASS'
      && report.standard.version==='0.1.0' && report.standard.revision==='9504c78f4651f6c1ebc48c7858fca2d8b061544b'
      && report.demo.id===identity.packageId && report.demo.revision===identity.revision && report.environment.runtime===capture.capture.runtime && report.environment.platform===capture.capture.platform
      && report.command==='retrospective assessment of native KDP Host capture at '+capture.capture.inputHead+'; independent verifyTrace and Journal readback'
      && report.findings.length===0 && report.counterexamples.length===0
      && canonicalDigest(report.subject)===canonicalDigest(subject) && report.dependencyClosure.sha256===identity.resourceClosureSha256
      && canonicalDigest(report.dependencyClosure.resources)===canonicalDigest(expectedPaths) && report.validatedAt===fixturePolicy.materializedAt
      && canonicalDigest(report.scenarios)===canonicalDigest(observed.scenarios.map((s:any)=>({id:s.id,category:s.category,dataset:'AUTHORING',result:'PASS'})))
      && canonicalDigest(report.tests)===canonicalDigest(observed.scenarios.map((s:any)=>({id:s.id,result:'PASS',detail:'status='+s.status+' receiptSha256='+s.receiptSha256+' journalOutputSha256='+s.journalOutputSha256})))
      && report.coverage.positive===report.scenarios.filter((s:any)=>s.category==='positive').length && report.coverage.negative===report.scenarios.filter((s:any)=>s.category==='negative').length
      && report.coverage.boundary===report.scenarios.filter((s:any)=>s.category==='boundary').length && report.coverage.positive>0 && report.coverage.negative>0 && report.coverage.boundary>0 && report.coverage.heldOut===0
      && canonicalDigest(report.profile)===canonicalDigest(validated.validation.profile) && canonicalDigest(report.validator)===canonicalDigest(validated.validation.validator)
      && canonicalDigest(report.baseline)===canonicalDigest(validated.validation.baseline) && canonicalDigest(report.coverage)===canonicalDigest(validated.validation.coverage)
      && canonicalDigest(report.baseline)===canonicalDigest({id:prior?.packageId ?? frozen.packageId,path:'domain/resource-closure.json',sha256:prior?.resourceClosureSha256 ?? '2548b63764b72eeef3226dc77c2de305fcf1bc5d61f2a54593d83550dea421d8'}),'REPORT_CONTENT');
    if (asset.kind==='unit') {const unit=JSON.parse(raw.get(asset.path)!.toString('utf8'));fail(report.profile.id===unit.validation.profile && report.profile.revision===unit.validation.profileRevision && canonicalDigest(report.validator)===canonicalDigest(unit.validation.validator),'PROFILE');}
    else fail(report.profile.id==='xdownload-private-read-only-runtime/1' && report.profile.revision==='1.0.0' && report.validator.id==='xdownload-dis-independent-conformance' && report.validator.version==='0.1.0','PROFILE');
    if (!unchanged) {
      const historicManifest=JSON.parse((prior?decode(history.priorManifest):frozenManifest).toString('utf8'));
      const refs=candidate.candidateProvenance.sourceRefs;
      const expectedSource=old?{path:old.path,sha256:old.sha256}:asset.kind==='knowledge'&&!prior
        ?{path:'fixtures/player-strategies.json',sha256:historicManifest.resources.find((entry:any)=>entry.path==='fixtures/player-strategies.json')?.sha256}
        :{path:'domain/resource-closure.json',sha256:prior?.resourceClosureSha256 ?? digest(frozenManifest)};
      fail(Array.isArray(refs) && refs.length===1 && canonicalDigest(candidate.evidenceRefs)===canonicalDigest(refs) && canonicalDigest(candidate.candidateProvenance.profile)===canonicalDigest(report.profile)
        && canonicalDigest(refs[0])===canonicalDigest(expectedSource)
        && refs.every((ref:any)=>ref.path==='domain/resource-closure.json' ? ref.sha256===(prior?.resourceClosureSha256 ?? digest(frozenManifest)) : historicManifest.resources.some((entry:any)=>entry.path===ref.path && entry.sha256===ref.sha256)),'CANDIDATE_SOURCE');
    }
    fail(validated.actor?.role==='validator' && validated.actor?.id===report.validator.id && Date.parse(candidate.recordedAt)<=Date.parse(report.validatedAt) && Date.parse(report.validatedAt)<=Date.parse(validated.recordedAt),'VALIDATOR');
    const priorPromotion=old && prefix.find((r:any)=>r.recordId===old.promotionRecordId && r.recordDigest===old.promotionRecordDigest);
    fail(!old || priorPromotion,'PRIOR_PROMOTION_MISSING');
    fail(!priorPromotion || (unchanged ? Date.parse(priorPromotion.recordedAt)<=Date.parse(validated.recordedAt) : Date.parse(priorPromotion.recordedAt)<=Date.parse(candidate.recordedAt)), 'PRIOR_CAUSALITY');
    const priorBase=priorPromotion?{kind:'PROMOTED',recordId:priorPromotion.recordId,recordDigest:priorPromotion.recordDigest}:{kind:'GENESIS'};
    fail(promoted.previousRecordId===validated.recordId && promoted.previousRecordDigest===validated.recordDigest && promoted.actor?.id==='fixture-reference-governance' && promoted.actor?.role==='reference-policy-authority'
      && promoted.promotion?.decision==='PROMOTE_REFERENCE' && promoted.promotion.scope==='PRIVATE_REFERENCE_ONLY'
      && promoted.promotion.authorizationEvidence==='https://github.com/kaicreator-mm/domain-harness/pull/1498#issuecomment-6714146893'
      && promoted.promotion.validationRecordId===validated.recordId && promoted.promotion.validationRecordDigest===validated.recordDigest
      && canonicalDigest(promoted.promotion.priorPromotedBaseline)===canonicalDigest(priorBase) && Date.parse(promoted.recordedAt)>=Date.parse(validated.recordedAt)
      && asset.validationRecordId===validated.recordId && asset.validationRecordDigest===validated.recordDigest && asset.promotionRecordId===promoted.recordId && asset.promotionRecordDigest===promoted.recordDigest,'PROMOTION');
  }
  fail(current.length===selected.reduce((n:number,a:any)=>{const old:any=priorByKey.get(a.kind+':'+a.id);return n+(old&&old.revision===a.revision&&old.sha256===a.sha256?2:3)},0),'EXTRA_RECORD');
  const recognizer=selected.find((a:any)=>a.kind==='unit' && a.id===lock.selectedCapabilities[0].provider.unitId), cap=lock.selectedCapabilities[0];
  fail(recognizer && ['validationRecordId','validationRecordDigest','promotionRecordId','promotionRecordDigest'].every((key)=>cap[key]===recognizer[key]),'CAPABILITY_RECORDS');
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function selectKnowledge(root: string, expected: { descriptor: string; closure: string; lock: string }): Promise<Selection> {
  root = await realpath(root);
  async function inside(ref: string) {
    if (!/^[a-zA-Z0-9_./-]+$/.test(ref) || ref.split('/').some((part) => ['', '.', '..'].includes(part))) throw new Error('UNSAFE_RESOURCE_PATH');
    const resolved = await realpath(path.join(root, ref));
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('RESOURCE_ESCAPE');
    return readFile(resolved);
  }
  const descriptor = await inside('package.json');
  requirePin(digest(descriptor), expected.descriptor, 'DESCRIPTOR_PIN_MISMATCH');
  const identity = (JSON.parse(descriptor.toString('utf8')) as { dis: PackageIdentity }).dis;
  requirePin(identity.resourceClosureSha256, expected.closure, 'CLOSURE_PIN_MISMATCH');
  requirePin(identity.selectionLockSha256, expected.lock, 'LOCK_PIN_MISMATCH');
  requirePin(canonicalDigest(identity.selectionLock), expected.lock, 'LOCK_BYTES_MISMATCH');
  const manifestRaw = await inside(identity.resourceClosurePath);
  requirePin(digest(manifestRaw), expected.closure, 'CLOSURE_BYTES_MISMATCH');
  const manifest = JSON.parse(manifestRaw.toString('utf8')) as Manifest;
  if (manifest.packageId !== identity.packageId || manifest.packageRevision !== identity.revision
      || identity.selectionLock.packageId !== identity.packageId || identity.selectionLock.packageRevision !== identity.revision) throw new Error('PACKAGE_IDENTITY_MISMATCH');
  const raw = new Map<string, Buffer>();
  for (const resource of manifest.resources) {
    if (raw.has(resource.path)) throw new Error('DUPLICATE_RESOURCE');
    const bytes = await inside(resource.path);
    requirePin(digest(bytes), resource.sha256, 'RESOURCE_DIGEST_MISMATCH:' + resource.path);
    raw.set(resource.path, bytes);
  }
  function parse<T>(ref: string): T {
    const bytes = raw.get(ref);
    if (!bytes) throw new Error('UNDECLARED_RESOURCE:' + ref);
    return JSON.parse(bytes.toString('utf8')) as T;
  }
  const resources = Object.fromEntries(manifest.resources.map((r) => [r.path, r.sha256]));
  const graph = parse<Graph>(manifest.graphRef.path);
  const definition = parse<{ domainId: string; revision: string; workflowRef: { unitRef: { id: string; revision: string }; graphRef: UnitRef } }>(manifest.definitionRef.path);
  if (graph.id !== manifest.graphRef.id || graph.revision !== manifest.graphRef.revision || graph.cyclePolicy !== 'DAG_ONLY'
      || definition.domainId !== manifest.definitionRef.id || definition.revision !== manifest.definitionRef.revision
      || canonicalDigest(definition.workflowRef.graphRef) !== canonicalDigest(manifest.graphRef)) throw new Error('GRAPH_DEFINITION_BINDING');
  const asset = identity.selectionLock.selectedAssets.find((a) => a.kind === 'graph');
  if (!asset || asset.id !== graph.id || asset.revision !== graph.revision || asset.path !== manifest.graphRef.path) throw new Error('GRAPH_LOCK_BINDING');
  requirePin(resources[asset.path], asset.sha256, 'GRAPH_LOCK_DIGEST');
  const units: Record<string, Unit> = {};
  const unitRefs: Selection['unitRefs'] = {};
  for (const ref of manifest.units) {
    const unit = parse<Unit>(ref.path);
    if (unit.id !== ref.id || unit.revision !== ref.revision || Object.hasOwn(units, unit.id)) throw new Error('UNIT_REF_MISMATCH');
    const selected = identity.selectionLock.selectedAssets.find((item) => item.kind === 'unit' && item.id === unit.id);
    if (!selected || selected.revision !== unit.revision || selected.path !== ref.path) throw new Error('UNIT_LOCK_MISMATCH');
    requirePin(resources[ref.path], selected.sha256, 'UNIT_LOCK_DIGEST');
    for (const knowledge of unit.knowledgeRefs ?? []) requirePin(resources[knowledge.path], knowledge.sha256, 'KNOWLEDGE_PIN_MISMATCH');
    if (!resources[unit.implementation.artifactRef] || !resources[unit.input.schemaRef] || !resources[unit.output.schemaRef]) throw new Error('UNIT_RESOURCE_MISSING');
    units[unit.id] = unit;
    unitRefs[unit.id] = { ...ref, sha256: selected.sha256 };
  }
  validateProbeGraph(graph, units, parse);
  const workflow = units[definition.workflowRef.unitRef.id];
  if (!workflow || workflow.role !== 'workflow' || workflow.revision !== definition.workflowRef.unitRef.revision
      || workflow.implementation.ref !== 'graph:' + graph.id + '@' + graph.revision || workflow.implementation.artifactRef !== asset.path) throw new Error('WORKFLOW_BINDING');
  const providers = Object.fromEntries(Object.values(units).map((unit) => [unit.id, unit.implementation.ref]));
  if (identity.selectionLock.target !== 'node24' || identity.selectionLock.selectedCapabilities.length !== 1) throw new Error('CAPABILITY_SELECTION_MISMATCH');
  for (const capability of identity.selectionLock.selectedCapabilities) {
    const provider = capability.provider;
    const unit = units[provider.unitId];
    const candidate = unit?.implementation.candidates?.find((item) => item.candidateId === provider.candidateId);
    const contract = unit?.capabilities?.provides.filter((item) => item.capabilityId === capability.capabilityId && item.owner === capability.owner && item.authorityRef === capability.authorityRef && item.version === capability.version && item.contractDigest === capability.contractDigest) ?? [];
    if (!candidate || provider.unitRevision !== unit.revision || candidate.ref !== provider.implementationRef || candidate.artifactRef !== provider.artifactRef
        || candidate.artifactDigest !== provider.artifactDigest || provider.target !== 'node24' || candidate.target !== provider.target
        || candidate.contractDigest !== provider.contractDigest || provider.contractDigest !== capability.contractDigest || contract.length !== 1) throw new Error('PROVIDER_LOCK_MISMATCH');
    requirePin(resources[candidate.artifactRef], candidate.artifactDigest, 'PROVIDER_ARTIFACT_MISMATCH');
    providers[unit.id] = candidate.ref;
  }
  const signaturesRef = units[graph.nodes.find((node) => node.nodeId === graph.entryNode)!.unitRef.id].knowledgeRefs?.[0];
  if (!signaturesRef) throw new Error('SELECTED_SIGNATURES_MISSING');
  const signatureAssets = identity.selectionLock.selectedAssets.filter((item) => item.kind === 'rule' && item.id === signaturesRef.id);
  if (signatureAssets.length !== 1 || signatureAssets[0].revision !== signaturesRef.revision || signatureAssets[0].path !== signaturesRef.path || signatureAssets[0].sha256 !== signaturesRef.sha256) throw new Error('SIGNATURE_RULE_LOCK_MISMATCH');
  requirePin(resources[signaturesRef.path],signaturesRef.sha256,'SIGNATURE_RULE_DIGEST');
  const resolveUnit = parse<Unit & { evidence: { sources: { sourceId: string; ref: string }[] } }>(unitRefs['xdownload.player.resolve-procedure'].path);
  const runtimeReader = identity.runtimeReader;
  const strategyKnowledge = resolveUnit.knowledgeRefs?.[0];
  let providerArtifact: Selection['providerArtifact'];
  if (runtimeReader) {
    await verifyRuntimeLifecycle(identity,manifest,raw,inside);
    if (!identity.selectionLock.businessPolicy || canonicalDigest(identity.selectionLock.businessPolicy) !== canonicalDigest({intentId:'recognizePlayer',operationId:'dis.consume',capabilityId:'dis-player',handlerId:'consumeObservation',scope:'PRIVATE_LOCAL_READ_ONLY'})) throw new Error('RUNTIME_BUSINESS_POLICY_INVALID');
    const provider = identity.selectionLock.selectedCapabilities[0].provider;
    const strategiesAsset = identity.selectionLock.selectedAssets.find((item) => item.kind === 'knowledge');
    const definitionAsset = identity.selectionLock.selectedAssets.find((item) => item.kind === 'definition');
    if (!definitionAsset || definitionAsset.id !== definition.domainId || definitionAsset.revision !== definition.revision
        || definitionAsset.path !== manifest.definitionRef.path) throw new Error('DEFINITION_LOCK_MISMATCH');
    requirePin(resources[definitionAsset.path],definitionAsset.sha256,'DEFINITION_LOCK_DIGEST');
    const validation = identity.selectionLock.validationEvidence;
    const decision = identity.selectionLock.promotionDecision;
    if (!validation || !decision || decision.kind !== 'PRIVATE_REFERENCE_SELECTION' || decision.scope !== 'PRIVATE_REFERENCE_ONLY'
        || decision.authority !== 'kaicreator-mm/dis-private-runtime-reference'
        || decision.authorizationEvidence !== 'https://github.com/kaicreator-mm/domain-harness/pull/1498#issuecomment-6714146893'
        || decision.subject.id !== identity.packageId || decision.subject.revision !== identity.revision
        || decision.subject.sha256 !== expected.closure || canonicalDigest(decision.validationEvidence) !== canonicalDigest(validation)
        || !['GENESIS','PREVIOUS_PRIVATE_SELECTION'].includes(decision.prior.kind)) throw new Error('RUNTIME_PRIVATE_QUALIFICATION_MISSING');
    if (decision.prior.kind === 'PREVIOUS_PRIVATE_SELECTION'
        && (decision.prior.packageId !== identity.packageId || decision.prior.revision === identity.revision
          || !/^[a-f0-9]{64}$/.test(decision.prior.lockSha256 ?? ''))) throw new Error('RUNTIME_PRIVATE_PRIOR_SELECTION_INVALID');
    const reportBytes = await inside(validation.path);
    requirePin(digest(reportBytes),validation.sha256,'RUNTIME_VALIDATION_REPORT_DIGEST_MISMATCH');
    const report = JSON.parse(reportBytes.toString('utf8')) as { result: string; subject: typeof decision.subject; dependencyClosure: { sha256: string } };
    if (report.result !== 'PASS' || canonicalDigest(report.subject) !== canonicalDigest(decision.subject)
        || report.dependencyClosure.sha256 !== expected.closure) throw new Error('RUNTIME_VALIDATION_REPORT_MISMATCH');
    if (runtimeReader.knowledgeKind !== 'rule-set' || runtimeReader.processor !== 'exact-player-strategy-map/1'
        || !strategyKnowledge || strategyKnowledge.kind !== runtimeReader.knowledgeKind || resolveUnit.knowledgeRefs?.length !== 1
        || strategyKnowledge.path !== runtimeReader.resourcePath || strategiesAsset?.id !== strategyKnowledge.id
        || strategiesAsset.revision !== strategyKnowledge.revision || strategiesAsset.path !== strategyKnowledge.path
        || strategiesAsset.sha256 !== strategyKnowledge.sha256) throw new Error('RUNTIME_KNOWLEDGE_NOT_SELECTED');
    for (const unit of Object.values(units)) {
      if (unit.role !== 'workflow' && unit.implementation.artifactRef !== provider.artifactRef) {
        throw new Error('RUNTIME_PROVIDER_ARTIFACT_UNBOUND');
      }
    }
    providerArtifact = { path: provider.artifactRef, sha256: provider.artifactDigest, target: provider.target };
  }
  const strategiesRef = runtimeReader ? strategyKnowledge?.path : resolveUnit.evidence.sources.find((source) => source.sourceId === 'strategy-map')?.ref;
  if (!signaturesRef || !strategiesRef) throw new Error('SELECTED_KNOWLEDGE_MISSING');
  const signatures = parse<Selection['signatures'] & { catalogId: string; revision: string }>(signaturesRef.path);
  const strategies = parse<Selection['strategies'] & { catalogId: string; revision: string }>(strategiesRef);
  if (signatures.catalogId !== signaturesRef.id || signatures.revision !== signaturesRef.revision
      || strategies.catalogId !== (strategyKnowledge?.id ?? 'xdownload.player-strategies')
      || strategyKnowledge && strategies.revision !== strategyKnowledge.revision
      || !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(strategies.revision)
      || !strategies.strategies || Array.isArray(strategies.strategies) || typeof strategies.strategies !== 'object'
      || Object.values(strategies.strategies).some((value) => typeof value !== 'string' || !value)) throw new Error('KNOWLEDGE_IDENTITY_MISMATCH');
  const selected = { packageId: identity.packageId, revision: identity.revision, closureSha256: expected.closure, lockSha256: expected.lock, graphSha256: asset.sha256, graph, units, unitRefs, providers, resources, signatures, strategies,
    ...(providerArtifact ? { providerArtifact, strategyKnowledge, businessPolicy:identity.selectionLock.businessPolicy } : {}) };
  verifiedSelections.set(selected, canonicalDigest(selected));
  return selected;
}
