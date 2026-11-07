import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { buildConsumer, canonicalDigest, digest, selectKnowledge } from '../../packages/dis-v011-runtime/dist/index.js';

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
export async function loadKernelSource() {
  const [relative,pin] = payloads.kernel;
  const raw = await readFile(new URL('../../domain-packages/' + relative, import.meta.url));
  if (digest(raw) !== pin) throw new Error('TRUSTED_MODULE_BYTES_CHANGED:kernel');
  return raw.toString('utf8');
}
const appUrl = new URL('./domain/domain-app.yaml', import.meta.url);
const recipeUrl = new URL('./domain/runtime-package.json', import.meta.url);
const lockUrl = new URL('./domain/runtime-lock.json', import.meta.url);
const providerPath = 'src/provider.mjs';
const knowledgeUrl = new URL('./fixtures/runtime-knowledge.json', import.meta.url);
const serialize = (value) => Buffer.from(JSON.stringify(value) + '\n');
export async function deployment(variant) {
  const [appRaw, qualifiedRaw] = await Promise.all([readFile(appUrl),readFile(lockUrl)]);
  const app = JSON.parse(appRaw);
  const qualified = JSON.parse(qualifiedRaw);
  const expected = qualified.variants[variant];
  if (app.format !== 'dis-reference-boot/1' || app.target !== 'node24' || app.kernel !== 'v08-kernel-mechanism@1.0.0'
      || app.package !== 'xdownload.web-media-runtime' || app.runtimePackage !== 'runtime-package.json'
      || app.runtimeLock !== 'runtime-lock.json' || qualified.appSha256 !== digest(appRaw)
      || qualified.format !== 'dis-runtime-qualification-index/1' || qualified.scope !== 'PRIVATE_REFERENCE_ONLY'
      || !Object.hasOwn(qualified.variants,variant)) throw new Error('DEPLOYMENT_NOT_QUALIFIED');
  return { primary: app.primary, primarySha256: qualified.primarySha256, lockSha256: expected.lock, expected };
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
  await assertFrozenSchemas({ resources, closure });
  const report = {
    reportId:recipe.packageId + '.aot.' + revision,
    standard:{version:'0.1.0',revision:'9504c78f4651f6c1ebc48c7858fca2d8b061544b'},
    demo:{id:recipe.packageId,revision},
    environment:{runtime:'Node 24 / AJV 2020-12',platform:'deterministic AOT schema gate'},
    command:'generatePackage(' + variant + ')',
    result:'PASS',
    tests:[{id:'frozen-artifact-schemas',result:'PASS'}],
    scenarios:[{id:'frozen-artifact-schemas',category:'positive',dataset:'AUTHORING',result:'PASS'}],
    findings:[],counterexamples:[],
    limitations:['Private reference AOT shape qualification. Real Host behavior and adversarial coverage have separate test receipts.'],
    validatedAt:recipe.qualification.recordedAt,
    subject:{kind:'package',id:recipe.packageId,revision,sha256:closureSha256},
    dependencyClosure:{sha256:closureSha256,resources:closure.resources.map(({path,sha256}) => ({path,sha256}))},
    profile:{id:recipe.qualification.profile,revision:'1.0.0'},
    validator:{id:'frozen-dis-schema-aot',version:'1.0.0'},
    baseline:{id:original.packageId,path:'domain/resource-closure.json',sha256:frozenPins.closure},
    coverage:{positive:1,negative:0,boundary:0,heldOut:0},
  };
  const reportPath = 'domain/private-aot-validation.json';
  resources.set(reportPath,serialize(report));
  const validationEvidence = { path:reportPath, sha256:digest(resources.get(reportPath)) };
  const prior = variant === 'baseline' ? {kind:'GENESIS'} : {
    kind:'PREVIOUS_PRIVATE_SELECTION',packageId:recipe.packageId,revision:recipe.revisions.baseline,
    lockSha256:(await generatePackage('baseline')).qualification.lock,
  };
  const promotionDecision = { kind:'PRIVATE_REFERENCE_SELECTION', scope:recipe.qualification.scope,
    authority:recipe.qualification.authority, authorizationEvidence:recipe.qualification.authorizationEvidence,
    prior, subject:report.subject, validationEvidence };
  const selectionLock = {packageId:recipe.packageId,packageRevision:revision,target:recipe.target,
    selectedAssets:[{kind:'graph',...closure.graphRef,sha256:digest(resources.get(closure.graphRef.path))},
      {kind:'definition',...closure.definitionRef,sha256:digest(resources.get(closure.definitionRef.path))},
      ...closure.units.map((item) => ({kind:'unit',...item,sha256:digest(resources.get(item.path))})),
      {kind:'knowledge',id:knowledgeRef.id,revision:knowledgeRef.revision,path:resourcePath,sha256:knowledgeRef.sha256}],
    selectedCapabilities,validationEvidence,promotionDecision};
  const pins = {closure:closureSha256,lock:canonicalDigest(selectionLock)};
  const descriptor = {dis:{packageId:recipe.packageId,revision,standardVersion:recipe.standardVersion,
    resourceClosurePath:closurePath,resourceClosureSha256:pins.closure,selectionLockSha256:pins.lock,
    selectionLock,runtimeReader:recipe.reader,qualification:recipe.qualification,recipeSha256:digest(recipeRaw),
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
    ...(resources.has('domain/private-aot-validation.json') ? [['validation-report','domain/private-aot-validation.json']] : [])]) {
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

export async function buildDemo(variant = 'baseline') {
  const { expected } = await deployment(variant);
  const generated = await generatePackage(variant);
  const selection = await loadGenerated(generated,expected);
  const payload = Object.fromEntries(await Promise.all(Object.entries(payloads).map(async ([key,[relative,pin]]) => {
    const bytes = await readFile(new URL('../../domain-packages/' + relative, import.meta.url));
    if (digest(bytes) !== pin) throw new Error('TRUSTED_MODULE_BYTES_CHANGED:' + key);
    return [key, bytes.toString('utf8')];
  })));
  return buildConsumer(selection,{...payload,provider:generated.provider.toString('utf8')});
}
