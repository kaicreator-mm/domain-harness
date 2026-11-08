import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalDigest, digest, selectKnowledge } from '../../packages/dis-v011-runtime/dist/knowledge.js';

const frozenRoot = fileURLToPath(new URL('../dis-0.1.0-player-recognition/', import.meta.url));
export const frozenPins = Object.freeze({
  descriptor:'5734bba9e82e63d9f69b004a0bd16e631638cd512c09020bd951e1e2f676e0f6',
  closure:'2548b63764b72eeef3226dc77c2de305fcf1bc5d61f2a54593d83550dea421d8',
  lock:'2d34f56732b49e33c0638fb2bc1afe5799c777098ebd853272358874729b8a58',
});
const payloads = {
  kernel:['kernel/basic/kernel-mechanism-v1.mjs','e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7'],
  standard:['standard/basic/standard-sdk-v1.mjs','dec042cacee70a8762b693f02b80ce14844b52bdf12969ff2250c7013c67c8bf'],
  router:['standard/basic/workflow-router.mjs','d9f9c33f08951aacebe1648fb44554ecacb70db6292f02367035d99ea1c112b5'],
};
export function readFrozen(root = frozenRoot, expectedPins = frozenPins) {
  return selectKnowledge(root, expectedPins);
}
const appUrl = new URL('./domain/domain-app.yaml', import.meta.url);
const recipeUrl = new URL('./domain/runtime-package.json', import.meta.url);
const providerPath = 'src/provider.mjs';
const knowledgeUrl = new URL('./fixtures/runtime-knowledge.json', import.meta.url);
const serialize = (value) => Buffer.from(JSON.stringify(value) + '\n');

function createLifecycle({variant, recipe, original, frozenDescriptorRaw, frozenManifestRaw, previous, resources, closure, closureSha256, selectedAssets}) {
  const evidence = recipe.qualification.behaviorCapture;
  const capture = evidence?.capture, observed = capture?.cases?.[variant];
  const policy = recipe.qualification.fixturePolicy;
  if (!capture || evidence.sha256 !== 'cf9ceac3d9b4f683a721538473f2d7f39bdd643c269a488a4056958c8f1f5720' || canonicalDigest(capture) !== evidence.sha256 || capture.inputHead !== 'b9d923e4d43a3a4bcd1d655c52117dcf381e33d3'
      || observed?.closureSha256 !== closureSha256 || observed.providerSha256 !== digest(resources.get('src/provider.mjs'))
      || policy?.scope !== 'PRIVATE_REFERENCE_ONLY' || policy.authority !== 'fixture-reference-governance') throw new Error('BEHAVIOR_EVIDENCE_MISMATCH');
  const wanted = {known:'READY',unknown:'NEEDS_REVIEW',ambiguous:'NEEDS_INPUT',conflict:'NEEDS_INPUT',scope:'OUT_OF_SCOPE',missing:'NEEDS_INPUT',malformed:'FAILED','strategy-coverage':variant==='baseline'?'READY':'PARTIAL','unauthorized-field':'FAILED'};
  if (!Array.isArray(observed.scenarios) || observed.scenarios.length !== Object.keys(wanted).length || new Set(observed.scenarios.map((s)=>s.id)).size !== observed.scenarios.length
      || observed.scenarios.some((s)=>wanted[s.id] !== s.status || !['positive','negative','boundary'].includes(s.category) || !/^[a-f0-9]{64}$/.test(s.receiptSha256) || !/^[a-f0-9]{64}$/.test(s.journalOutputSha256))) throw new Error('BEHAVIOR_SCENARIOS_INVALID');
  const frozen = JSON.parse(frozenDescriptorRaw).dis;
  const priorDescriptor = previous ? JSON.parse(previous.resources.get('package.json')).dis : null;
  const oldAssets = priorDescriptor ? [...priorDescriptor.selectionLock.selectedAssets,priorDescriptor.selectionLock.packageQualification] : frozen.selectionLock.selectedAssets;
  const selectedIds = new Set(frozen.selectionLock.selectedAssets.map((a)=>a.kind+':'+a.id));
  const records = previous ? structuredClone(priorDescriptor.lifecycleRecords) : structuredClone(frozen.lifecycleRecords.filter((r)=>selectedIds.has(r.subject.kind+':'+r.subject.id)));
  const originalRecordCount = records.length;
  const oldLock = priorDescriptor?.selectionLockSha256 ?? frozen.selectionLockSha256;
  const oldClosure = previous?.qualification.closure ?? frozenPins.closure;
  const history = {frozenDescriptor:frozenDescriptorRaw.toString('base64'),frozenManifest:frozenManifestRaw.toString('base64'),
    ...(previous ? {priorDescriptor:previous.resources.get('package.json').toString('base64'),priorManifest:previous.resources.get('domain/resource-closure.json').toString('base64'),
      priorResources:Object.fromEntries([...previous.resources].filter(([path])=>path!=='package.json').map(([path,bytes])=>[path,bytes.toString('base64')]))} : {})};
  const selected = selectedAssets.filter((a)=>['unit','graph','rule','knowledge'].includes(a.kind));
  const packageAsset = {kind:'package',id:recipe.packageId,revision:closure.packageRevision,path:'domain/resource-closure.json',sha256:closureSha256};
  const all = [...selected,packageAsset];
  const append = (body) => { const record={...body,recordDigest:canonicalDigest(body)};records.push(record);return record; };
  const reportRefs=[];
  for (const asset of all) {
    const subject = {kind:asset.kind,id:asset.id,revision:asset.revision,sha256:asset.sha256};
    const old = oldAssets.find((a)=>a.kind===asset.kind && a.id===asset.id);
    const priorPromotion = old && records.find((r)=>r.recordId===old.promotionRecordId && r.recordDigest===old.promotionRecordDigest);
    const unchanged = old && old.revision===asset.revision && old.sha256===asset.sha256;
    const previousState = unchanged ? priorPromotion : null;
    if (unchanged && !previousState) throw new Error('HISTORICAL_PROMOTION_MISSING');
    const unit = asset.kind==='unit' ? JSON.parse(resources.get(asset.path)) : null;
    const profile = unit ? {id:unit.validation.profile,revision:unit.validation.profileRevision} : {id:recipe.qualification.profile,revision:'1.0.0'};
    const validator = unit ? unit.validation.validator : {id:'xdownload-dis-independent-conformance',version:'0.1.0'};
    const baseline={id:priorDescriptor?.packageId ?? original.packageId,path:'domain/resource-closure.json',sha256:oldClosure};
    const scenarios=observed.scenarios.map((s)=>({id:s.id,category:s.category,dataset:'AUTHORING',result:'PASS'}));
    const coverage={positive:scenarios.filter((s)=>s.category==='positive').length,negative:scenarios.filter((s)=>s.category==='negative').length,boundary:scenarios.filter((s)=>s.category==='boundary').length,heldOut:0};
    const report={reportId:asset.kind+':'+asset.id+'@'+asset.revision+':'+closureSha256,
      standard:{version:'0.1.0',revision:'9504c78f4651f6c1ebc48c7858fca2d8b061544b'},demo:{id:recipe.packageId,revision:closure.packageRevision},
      environment:{runtime:capture.runtime,platform:capture.platform},command:'retrospective assessment of native KDP Host capture at '+capture.inputHead+'; independent verifyTrace and Journal readback',result:'PASS',
      tests:observed.scenarios.map((s)=>({id:s.id,result:'PASS',detail:'status='+s.status+' receiptSha256='+s.receiptSha256+' journalOutputSha256='+s.journalOutputSha256})),
      scenarios,findings:[],counterexamples:[],limitations:['Private reference fixture policy; no production promotion or external effect.','All cases are AUTHORING; no held-out evaluation.','Cases validate the shared selected closure; individual Unit isolation is not asserted.','Historical receipt and Journal hashes are capture attestations; the full original receipts are not stored here.','Validation is a retrospective assessment of the capture at '+capture.validatedAt+'; no contemporaneous lifecycle decisions are claimed.'],
      validatedAt:policy.materializedAt,subject,dependencyClosure:{sha256:closureSha256,resources:closure.resources.map(({path,sha256})=>({path,sha256}))},profile,validator,baseline,coverage};
    const reportPath='domain/lifecycle-report-'+reportRefs.length+'.json', reportBytes=serialize(report);
    resources.set(reportPath,reportBytes);reportRefs.push({path:reportPath,sha256:digest(reportBytes),subject});
    const common={subject,subjectPath:asset.path,dependencyClosureDigest:closureSha256,policy:{id:policy.id,revision:policy.revision},recordedAt:policy.materializedAt};
    const sourceRef=old?{path:old.path,sha256:old.sha256}:asset.kind==='knowledge'&&!previous
      ?{path:'fixtures/player-strategies.json',sha256:original.resources['fixtures/player-strategies.json']}
      :{path:'domain/resource-closure.json',sha256:oldClosure};
    let candidate;
    if (unchanged) candidate=records.find((r)=>r.transition==='CANDIDATE' && canonicalDigest(r.subject)===canonicalDigest(subject));
    else candidate=append({...common,recordId:asset.kind+':'+asset.id+'@'+asset.revision+':candidate',transition:'CANDIDATE',
      actor:{id:'runtime-reference-author',role:'candidate-producer'},previousRecordId:null,previousRecordDigest:null,
      subjectJson:resources.get(asset.path).toString('utf8'),evidenceRefs:[sourceRef],candidateProvenance:{sourceClosureSha256:oldClosure,sourceLockSha256:oldLock,sourceRefs:[sourceRef],
        parent:old?{kind:'SUBJECT',subject:{kind:old.kind,id:old.id,revision:old.revision,sha256:old.sha256}}:{kind:'GENESIS',reason:'new private runtime subject'},
        schemaRevision:'0.1.0',target:'node24',profile,method:{id:'deterministic-aot',toolchain:'Node 24'},changeRef:'issue:1486'}});
    if (!candidate) throw new Error('HISTORICAL_CANDIDATE_MISSING');
    const last=previousState ?? candidate;
    const validated=append({...common,recordId:asset.kind+':'+asset.id+'@'+asset.revision+':validated:'+closureSha256,transition:'VALIDATED',
      actor:{id:validator.id,role:'validator'},previousRecordId:last.recordId,previousRecordDigest:last.recordDigest,
      validation:{result:'PASS',reportPath,reportSha256:digest(reportBytes),reportCanonicalSha256:canonicalDigest(report),behaviorCaptureSha256:evidence.sha256,
        candidateRecordId:candidate.recordId,candidateRecordDigest:candidate.recordDigest,profile,validator,validatorBinding:policy.validatorBinding,baseline,coverage}});
    const promoted=append({...common,recordId:asset.kind+':'+asset.id+'@'+asset.revision+':promoted:'+closureSha256,transition:'PROMOTED',
      actor:{id:policy.authority,role:'reference-policy-authority'},previousRecordId:validated.recordId,previousRecordDigest:validated.recordDigest,
      promotion:{decision:'PROMOTE_REFERENCE',scope:policy.scope,authorizationEvidence:policy.authorizationEvidence,validationRecordId:validated.recordId,
        validationRecordDigest:validated.recordDigest,priorPromotedBaseline:priorPromotion?{kind:'PROMOTED',recordId:priorPromotion.recordId,recordDigest:priorPromotion.recordDigest}:{kind:'GENESIS'}}});
    Object.assign(asset,{validationRecordId:validated.recordId,validationRecordDigest:validated.recordDigest,promotionRecordId:promoted.recordId,promotionRecordDigest:promoted.recordDigest});
  }
  return {records,history,reportRefs,packageAsset,originalRecordCount,captureSha256:evidence.sha256};
}

/** Deterministic derivative AOT assembly. It never reads the runtime qualification index. */
export async function generatePackage(variant, overrides = {}) {
  const original = await readFrozen();
  const [recipeRaw, appRaw, rawProvider, knowledgeInput, originalClosure] = await Promise.all([
    readFile(recipeUrl), readFile(appUrl), readFile(new URL(providerPath,import.meta.url)), readFile(knowledgeUrl),
    readFile(path.join(frozenRoot,'domain/resource-closure.json')),
  ]);
  const recipe = JSON.parse(recipeRaw);
  if (!Object.hasOwn(recipe.revisions,variant) || recipe.target !== 'node24' || recipe.provider.path !== providerPath
      || recipe.format !== 'dis-runtime-package-recipe/1') throw new Error('RUNTIME_RECIPE_INVALID');
  const revision = recipe.revisions[variant];
  const provider = overrides.provider ?? rawProvider;
  const knowledge = overrides.knowledge ?? JSON.parse(knowledgeInput)[variant];
  const graph = structuredClone(original.graph);
  graph.revision = revision;
  for (const node of graph.nodes) node.unitRef.revision = revision;
  const closure = JSON.parse(originalClosure);
  closure.packageId = recipe.packageId;
  closure.packageRevision = revision;
  closure.graphRef.revision = revision;
  closure.definitionRef.id = recipe.packageId;
  closure.definitionRef.revision = revision;
  for (const unit of closure.units) unit.revision = revision;
  const resources = new Map(await Promise.all(closure.resources.filter((item) => item.kind !== 'conformance'
    && !['src/runner.mjs','fixtures/player-strategies.json'].includes(item.path)).map(async (item) => {
    const bytes = await readFile(path.join(frozenRoot,item.path));
    if (digest(bytes) !== original.resources[item.path]) throw new Error('FROZEN_PROVENANCE_DIGEST_MISMATCH');
    return [item.path,bytes];
  })));
  resources.set(closure.graphRef.path,serialize(graph));
  const definition = JSON.parse(resources.get(closure.definitionRef.path));
  definition.domainId = recipe.packageId;
  definition.revision = revision;
  for (const component of definition.components) component.unitRef.revision = revision;
  for (const ref of definition.privateUnits) ref.revision = revision;
  definition.workflowRef.unitRef.revision = revision;
  definition.workflowRef.graphRef = closure.graphRef;
  resources.set(closure.definitionRef.path,serialize(definition));
  resources.set(providerPath,provider);
  const conformancePath = 'test/consumer.test.mjs';
  resources.set(conformancePath,await readFile(new URL(conformancePath,import.meta.url)));
  const resourcePath = recipe.reader.resourcePath;
  resources.set(resourcePath,serialize(knowledge));
  const knowledgeRef = { id:knowledge.catalogId, revision:knowledge.revision, kind:recipe.reader.knowledgeKind,
    path:resourcePath, sha256:digest(resources.get(resourcePath)) };
  const selectedCapabilities = [];
  for (const item of closure.units) {
    const unit = JSON.parse(resources.get(item.path));
    unit.revision = revision;
    unit.qualification = { ...unit.qualification, profile:recipe.qualification.profile };
    unit.validation.casesRef = conformancePath;
    if (unit.role === 'workflow') {
      unit.implementation.ref = 'graph:' + graph.id + '@' + graph.revision;
    } else {
      unit.implementation.ref = unit.implementation.ref.replace('registry:xdownload.player.','registry:xdownload.runtime.player.')
        .replace('@1.0.0','@' + recipe.provider.implementationRevision);
      unit.implementation.artifactRef = providerPath;
    }
    if (unit.role === 'recognizer') {
      const capability = unit.capabilities.provides[0];
      const candidate = { ...unit.implementation.candidates[0], candidateId:recipe.provider.candidate,
        ref:unit.implementation.ref, artifactRef:providerPath, artifactDigest:digest(provider), target:overrides.target ?? recipe.target };
      unit.implementation.candidates = [candidate];
      unit.implementation.selectionPolicy.consumerProfileId = recipe.qualification.profile;
      selectedCapabilities.push({ ...capability, provider:{ unitId:unit.id, unitRevision:revision,
        candidateId:candidate.candidateId, implementationRef:candidate.ref, artifactRef:candidate.artifactRef,
        artifactDigest:candidate.artifactDigest, target:candidate.target, contractDigest:candidate.contractDigest } });
    }
    if (unit.id === 'xdownload.player.resolve-procedure') {
      unit.knowledgeRefs = [{ ...knowledgeRef, ...(overrides.staleKnowledge ? {sha256:'0'.repeat(64)} : {}) }];
      unit.evidence.sources[0].ref = resourcePath;
    }
    resources.set(item.path,serialize(unit));
  }
  closure.resources = closure.resources.filter((item) => resources.has(item.path));
  closure.resources.push({path:providerPath,kind:'implementation',owners:[recipe.packageId],required:true},
    {path:conformancePath,kind:'conformance',owners:[recipe.packageId],required:true},
    {path:resourcePath,kind:'fixture',owners:['xdownload.player.resolve-procedure'],required:true});
  for (const item of closure.resources) {
    item.owners = item.owners.map((owner) => owner === original.packageId ? recipe.packageId : owner);
    item.sha256 = digest(resources.get(item.path));
  }
  const closurePath = 'domain/resource-closure.json';
  resources.set(closurePath,serialize(closure));
  const closureSha256 = digest(resources.get(closurePath));
  const previous = variant === 'reselected' ? await generatePackage('baseline') : null;
  const frozenDescriptorRaw = await readFile(path.join(frozenRoot,'package.json'));
  const recognizerRef = closure.units.find((unit) => unit.id === graph.nodes.find((node) => node.nodeId === graph.entryNode).unitRef.id);
  const signaturesRef = JSON.parse(resources.get(recognizerRef.path)).knowledgeRefs[0];
  const selectedAssets = [{kind:'graph',...closure.graphRef,sha256:digest(resources.get(closure.graphRef.path))},
    {kind:'definition',...closure.definitionRef,sha256:digest(resources.get(closure.definitionRef.path))},
    ...closure.units.map((item) => ({kind:'unit',...item,sha256:digest(resources.get(item.path))})),
    {kind:'rule',id:signaturesRef.id,revision:signaturesRef.revision,path:signaturesRef.path,sha256:signaturesRef.sha256},
    {kind:'knowledge',id:knowledgeRef.id,revision:knowledgeRef.revision,path:resourcePath,sha256:knowledgeRef.sha256}];
  const lifecycle=createLifecycle({variant,recipe,original,frozenDescriptorRaw,frozenManifestRaw:originalClosure,previous,resources,closure,closureSha256,selectedAssets});
  const recognizerAsset=selectedAssets.find((asset)=>asset.kind==='unit' && asset.id===recognizerRef.id);
  Object.assign(selectedCapabilities[0],{validationRecordId:recognizerAsset.validationRecordId,validationRecordDigest:recognizerAsset.validationRecordDigest,
    promotionRecordId:recognizerAsset.promotionRecordId,promotionRecordDigest:recognizerAsset.promotionRecordDigest});
  const packageReport=lifecycle.reportRefs.at(-1);
  const validationEvidence={path:packageReport.path,sha256:packageReport.sha256};
  const prior=previous?{kind:'PREVIOUS_PRIVATE_SELECTION',packageId:recipe.packageId,revision:recipe.revisions.baseline,lockSha256:previous.qualification.lock}:{kind:'GENESIS'};
  const promotionDecision={kind:'PRIVATE_REFERENCE_SELECTION',scope:recipe.qualification.scope,authority:recipe.qualification.authority,
    authorizationEvidence:recipe.qualification.authorizationEvidence,prior,subject:packageReport.subject,validationEvidence};
  const selectionLock={packageId:recipe.packageId,packageRevision:revision,target:recipe.target,
    businessPolicy:{intentId:'recognizePlayer',operationId:'dis.consume',capabilityId:'dis-player',handlerId:'consumeObservation',scope:'PRIVATE_LOCAL_READ_ONLY'},
    selectedAssets,selectedCapabilities,validationEvidence,promotionDecision,packageQualification:lifecycle.packageAsset,
    lifecycle:{recordsSha256:canonicalDigest(lifecycle.records),captureSha256:lifecycle.captureSha256,
      frozenDescriptorSha256:digest(frozenDescriptorRaw),frozenManifestSha256:digest(originalClosure),
      ...(previous?{priorDescriptorSha256:digest(previous.resources.get('package.json')),priorManifestSha256:previous.qualification.closure,priorLockSha256:previous.qualification.lock}:{})}};
  await assertFrozenSchemas({resources,closure});
  const pins = {closure:closureSha256,lock:canonicalDigest(selectionLock)};
  const descriptor = {dis:{packageId:recipe.packageId,revision,standardVersion:recipe.standardVersion,
    resourceClosurePath:closurePath,resourceClosureSha256:pins.closure,selectionLockSha256:pins.lock,
    selectionLock,runtimeReader:recipe.reader,qualification:recipe.qualification,recipeSha256:digest(recipeRaw),lifecycleRecords:lifecycle.records,lifecycleHistory:lifecycle.history,
    frozenProvenance:{packageId:original.packageId,revision:original.revision,...frozenPins}}};
  const descriptorBytes = serialize(descriptor);
  resources.set('package.json',descriptorBytes);
  const primary = await readFile(new URL('../../packages/dis-v011-runtime/dist/kdp-primary.js',import.meta.url));
  const qualification = {packageId:recipe.packageId, revision, target:recipe.target, descriptor:digest(descriptorBytes),
    ...pins, provider:digest(provider), knowledge:knowledgeRef.sha256, graph:selectionLock.selectedAssets[0].sha256,
    validationEvidence:validationEvidence.sha256,promotionDecision:canonicalDigest(promotionDecision)};
  return { resources, closure, qualification, provider, original, appSha256:digest(appRaw), primarySha256:digest(primary) };
}

async function assertFrozenSchemas(generated) {
  const { resources, closure } = generated;
  const root = new URL('../../docs/standards/domain-intelligence/DIS-0.1.0/schemas/',import.meta.url);
  const ajv = new Ajv2020({strict:false});
  ajv.addFormat('date-time',(value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)
    && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value.replace('Z','.000Z'));
  const validators = Object.fromEntries(await Promise.all(['intelligence-unit','composition-graph','domain-definition','resource-closure','validation-report']
    .map(async (name) => [name,ajv.compile(JSON.parse(await readFile(new URL(name + '.schema.json',root))))])));
  for (const [name,resource] of [['resource-closure','domain/resource-closure.json'],['domain-definition',closure.definitionRef.path],
    ['composition-graph',closure.graphRef.path],...closure.units.map((unit) => ['intelligence-unit',unit.path]),
    ...[...resources.keys()].filter((name)=>name.startsWith('domain/lifecycle-report-')).map((name)=>['validation-report',name])]) {
    const validate = validators[name];
    if (!validate(JSON.parse(resources.get(resource)))) throw new Error('RUNTIME_SCHEMA_INVALID:' + resource + ':' + ajv.errorsText(validate.errors));
  }
}

export async function loadGenerated(generated, expected) {
  if (canonicalDigest(generated.qualification) !== canonicalDigest(expected)) throw new Error('RUNTIME_QUALIFICATION_MISMATCH');
  await assertFrozenSchemas(generated);
  const evidence = process.env.DIS_RUNTIME_EVIDENCE_DIR || os.tmpdir();
  await mkdir(evidence,{recursive:true});
  const root = await mkdtemp(path.join(evidence,'dis-runtime-aot-'));
  try {
    for (const [relative,bytes] of generated.resources) {
      const file = path.join(root,relative);
      await mkdir(path.dirname(file),{recursive:true});
      await writeFile(file,bytes);
    }
    return await selectKnowledge(root,expected);
  } finally {
    await rm(root,{recursive:true,force:true});
  }
}

export async function buildDemo(variant, expected) {
  const { buildConsumer } = await import('../../packages/dis-v011-runtime/dist/index.js');
  const generated = await generatePackage(variant);
  const selection = await loadGenerated(generated,expected);
  const payload = Object.fromEntries(await Promise.all(Object.entries(payloads).map(async ([key,[relative,pin]]) => {
    const bytes = await readFile(new URL('../../domain-packages/' + relative, import.meta.url));
    if (digest(bytes) !== pin) throw new Error('TRUSTED_MODULE_BYTES_CHANGED:' + key);
    return [key, bytes.toString('utf8')];
  })));
  return buildConsumer(selection,{...payload,provider:generated.provider.toString('utf8')});
}
