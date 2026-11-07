import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

export const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const snapshots = new WeakMap();
const clone = (value) => structuredClone(value);
const canonical = (v) => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical(v[k])])) : v;
export const lockDigest = (lock) => sha256(Buffer.from(JSON.stringify(canonical(lock))));
function assert(ok, code) { if (!ok) throw new Error(code); }
function local(ref) {
  assert(typeof ref === 'string' && /^[A-Za-z0-9._/-]+$/.test(ref) && !ref.startsWith('/') && !ref.split('/').some((p) => !p || p === '.' || p === '..'), 'UNSAFE_PATH');
  return ref;
}
async function readInside(root, ref) {
  const real = await fs.realpath(path.join(root, local(ref)));
  assert(real.startsWith(root + path.sep), 'PACKAGE_ESCAPE');
  return fs.readFile(real);
}
export async function loadPackage({ root = packageRoot, expectedClosureSha256, expectedSelectionSha256 } = {}) {
  root = await fs.realpath(root);
  const descriptor = JSON.parse(await readInside(root, 'package.json'));
  const bytes = await readInside(root, descriptor.dis.resourceClosurePath);
  const digest = sha256(bytes);
  assert(/^[a-f0-9]{64}$/.test(expectedClosureSha256 || '') && digest === expectedClosureSha256 && descriptor.dis.resourceClosureSha256 === digest, 'CLOSURE_PIN_MISMATCH');
  const selection = descriptor.dis.selectionLock;
  assert(/^[a-f0-9]{64}$/.test(expectedSelectionSha256 || '') && selection && lockDigest(selection) === expectedSelectionSha256 && descriptor.dis.selectionLockSha256 === expectedSelectionSha256, 'SELECTION_PIN_MISMATCH');
  assert(descriptor.dis.authority === 'REFERENCE' && descriptor.dis.standardVersion === '0.1.0' && selection.packageId === descriptor.dis.packageId && selection.packageRevision === descriptor.dis.revision && selection.closureSha256 === digest && selection.target === 'node24' && selection.consumerProfile === 'textile-synthetic-sampling/1.0.0' && JSON.stringify(selection.referencePolicy) === JSON.stringify({id:'textile-reference-only',revision:'1.0.0',scope:'SYNTHETIC_REFERENCE_ONLY',production:false,activation:false,allowUnpromoted:true}), 'UNAUTHORIZED_REFERENCE_SELECTION');
  const manifest = JSON.parse(bytes), raw = new Map();
  assert(manifest.packageId === descriptor.dis.packageId && manifest.packageRevision === descriptor.dis.revision, 'PACKAGE_IDENTITY_MISMATCH');
  assert(manifest.resources.length === new Set(manifest.resources.map((x) => x.path)).size, 'DUPLICATE_RESOURCE');
  for (const entry of manifest.resources) {
    const data = await readInside(root, entry.path);
    assert(sha256(data) === entry.sha256, 'RESOURCE_DIGEST_MISMATCH:' + entry.path);
    raw.set(entry.path, data);
  }
  const selectedAssets = [...manifest.units.map((ref) => ({kind:'unit',id:ref.id,revision:ref.revision,path:ref.path,sha256:sha256(raw.get(ref.path))})), {kind:'graph',id:manifest.graphRef.id,revision:manifest.graphRef.revision,path:manifest.graphRef.path,sha256:sha256(raw.get(manifest.graphRef.path))}, {kind:'knowledge',id:'textile.process-knowledge',revision:JSON.parse(raw.get('fixtures/textile-knowledge.json')).revision,path:'fixtures/textile-knowledge.json',sha256:sha256(raw.get('fixtures/textile-knowledge.json'))}];
  assert(JSON.stringify(selection.assets) === JSON.stringify(selectedAssets), 'SELECTION_ASSET_MISMATCH');
  const json = (ref) => { assert(raw.has(ref), 'UNDECLARED_RESOURCE'); return JSON.parse(raw.get(ref)); };
  const units = new Map(manifest.units.map((ref) => {
    const unit = json(ref.path);
    assert(unit.id === ref.id && unit.revision === ref.revision && unit.authority === 'REFERENCE', 'UNIT_IDENTITY_MISMATCH');
    return [unit.id, unit];
  }));
  assert(units.size === 5, 'UNIT_INVENTORY');
  const graph = json(manifest.graphRef.path), definition = json(manifest.definitionRef.path);
  assert(graph.id === manifest.graphRef.id && graph.revision === manifest.graphRef.revision && graph.cyclePolicy === 'DAG_ONLY', 'GRAPH_IDENTITY_MISMATCH');
  assert(definition.domainId === manifest.definitionRef.id && definition.revision === manifest.definitionRef.revision && definition.workflowRef.graphRef.id === graph.id && definition.workflowRef.graphRef.revision === graph.revision && definition.workflowRef.graphRef.path === manifest.graphRef.path, 'DEFINITION_BINDING_MISMATCH');
  const workflow = units.get('textile.workflow');
  assert(workflow.implementation.ref === 'graph:' + graph.id + '@' + graph.revision && workflow.implementation.artifactRef === manifest.graphRef.path, 'WORKFLOW_BINDING_MISMATCH');
  assert(definition.components.length === 4 && definition.privateUnits.length === 0 && new Set(definition.components.map((component) => component.unitRef.id)).size === 4, 'DEFINITION_INVENTORY');
  for (const component of definition.components) assert(component.family === 'semantic' && component.componentId === component.unitRef.id && units.get(component.unitRef.id)?.revision === component.unitRef.revision && component.unitRef.id !== 'textile.knowledge', 'DEFINITION_UNIT_MISMATCH');
  for (const role of ['recognizer', 'decision', 'validator']) {
    const unit = units.get('textile.' + role);
    assert(unit.implementation.ref === 'registry:textile.' + role + '@1.0.0' && unit.implementation.artifactRef === 'src/runner.mjs' && unit.implementation.strategy === 'function', 'UNTRUSTED_IMPLEMENTATION');
    for (const ref of unit.knowledgeRefs) assert(sha256(raw.get(ref.path)) === ref.sha256, 'KNOWLEDGE_PIN_MISMATCH');
  }
  const knowledgeUnit = units.get('textile.knowledge');
  const contentRef = knowledgeUnit.knowledgeRefs[0];
  const knowledge = json(contentRef.path);
  assert(knowledge.id === contentRef.id && knowledge.revision === contentRef.revision && sha256(raw.get(contentRef.path)) === contentRef.sha256, 'KNOWLEDGE_IDENTITY_MISMATCH');
  for (const unit of units.values()) {
    assert(unit.scope.domain === 'textile-pattern' && JSON.stringify(unit.knowledgeRefs) === JSON.stringify([contentRef]), 'UNIT_KNOWLEDGE_SCOPE_MISMATCH');
  }
  const sourceIds = new Set(knowledge.sources.map((source) => source.id));
  assert(sourceIds.size === 4 && knowledge.rules.length > 0 && knowledge.rules.every((rule) => ['jacquard','block-printing','embroidery'].includes(rule.id) && typeof rule.enabled === 'boolean' && rule.sources.length && rule.sources.every((id) => sourceIds.has(id))), 'INVALID_KNOWLEDGE');
  assert(new Set(knowledge.rules.map((rule) => rule.id)).size === knowledge.rules.length && knowledge.rules.every((rule) => ['structure','surface'].includes(rule.placement) && (rule.placement === 'structure' ? rule.surfaceMethod === null : ['print','stitch'].includes(rule.surfaceMethod))), 'INVALID_KNOWLEDGE_RULE');
  const expectedNodes = ['recognize', 'decide', 'validate'];
  assert(JSON.stringify(graph.nodes.map((node) => node.nodeId)) === JSON.stringify(expectedNodes) && graph.entryNode === 'recognize' && JSON.stringify(graph.terminalNodes) === '["validate"]', 'UNSUPPORTED_GRAPH');
  for (const node of graph.nodes) assert(node.unitRef.id === 'textile.' + ({recognize:'recognizer',decide:'decision',validate:'validator'})[node.nodeId] && units.get(node.unitRef.id)?.revision === node.unitRef.revision, 'GRAPH_UNIT_MISMATCH');
  const fields = ['status','candidates','technique','unknowns','brief'];
  const expectedEdges = [{kind:'control',from:'recognize',to:'decide'}, {kind:'control',from:'decide',to:'validate'}, ...['recognize','decide'].flatMap((from, i) => fields.map((field) => ({kind:'data',from:{node:from,pointer:'/'+field},to:{node:i ? 'validate':'decide',pointer:'/'+field}}))), {kind:'evidence',from:{node:'recognize',pointer:'/evidence'},to:{node:'decide',slot:'sourceEvidence'}}, {kind:'evidence',from:{node:'decide',pointer:'/evidence'},to:{node:'validate',slot:'sourceEvidence'}}];
  assert(JSON.stringify(graph.edges) === JSON.stringify(expectedEdges) && ['decision','validator'].every((role) => JSON.stringify(units.get('textile.'+role).evidence.consumes) === '["sourceEvidence"]'), 'UNSUPPORTED_GRAPH_EDGES');
  const handle = Object.freeze({ identity: clone(descriptor.dis), manifest: clone(manifest) });
  snapshots.set(handle, { descriptor, manifest, graph, units, knowledge, digests: Object.fromEntries(manifest.resources.map((entry) => [entry.path, entry.sha256])) });
  return handle;
}
function validateBrief(input) {
  assert(input && typeof input === 'object' && !Array.isArray(input) && typeof input.domain === 'string' && Array.isArray(input.evidence) && input.evidence.every((s) => typeof s === 'string' && s.length), 'INVALID_INPUT');
  assert(Object.keys(input).every((key) => ['domain','placement','surfaceMethod','evidence','claims','requestedProcess','machineControl','sampleCheck'].includes(key)), 'INVALID_INPUT');
  assert(input.sampleCheck === undefined || ['PASS','FAIL','UNKNOWN'].includes(input.sampleCheck), 'INVALID_INPUT');
  assert(input.placement === undefined || ['structure','surface','unknown'].includes(input.placement), 'INVALID_INPUT');
  assert(input.surfaceMethod === undefined || ['print','stitch','either','unknown'].includes(input.surfaceMethod), 'INVALID_INPUT');
  assert(input.requestedProcess === undefined || typeof input.requestedProcess === 'string', 'INVALID_INPUT');
  assert(input.machineControl === undefined || typeof input.machineControl === 'boolean', 'INVALID_INPUT');
  assert(input.claims === undefined || Array.isArray(input.claims) && input.claims.every((c) => c && Object.keys(c).length === 2 && typeof c.source === 'string' && c.source && ['structure','surface'].includes(c.placement)), 'INVALID_INPUT');
}
function recognize(brief, knowledge) {
  validateBrief(brief);
  const base = { status:'UNKNOWN', candidates:[], technique:null, evidence:[], unknowns:clone(knowledge.unresolved), brief:clone(brief) };
  if (brief.domain !== 'textile-pattern' || brief.machineControl) return { ...base, status:'OUT_OF_SCOPE' };
  if (!brief.evidence.length || !brief.placement) return { ...base, status:'NEEDS_INPUT' };
  const placements = new Set([brief.placement, ...(brief.claims || []).map((claim) => claim.placement)].filter((x) => x !== 'unknown'));
  if (placements.size > 1 || brief.placement === 'structure' && ['print','stitch'].includes(brief.surfaceMethod)) return { ...base, status:'CONFLICT' };
  if (brief.requestedProcess && !knowledge.rules.some((rule) => rule.enabled && rule.id === brief.requestedProcess)) return base;
  if (brief.placement === 'unknown') return base;
  const matches = knowledge.rules.filter((rule) => rule.enabled && rule.placement === brief.placement && (rule.placement === 'structure' || brief.surfaceMethod === 'either' || rule.surfaceMethod === brief.surfaceMethod));
  if (brief.requestedProcess && matches.length && !matches.some((rule) => rule.id === brief.requestedProcess)) return { ...base, status:'CONFLICT' };
  const selected = matches.filter((rule) => !brief.requestedProcess || rule.id === brief.requestedProcess);
  const candidates = [...new Set(selected.map((rule) => rule.id))];
  const evidence = [...new Set(selected.flatMap((rule) => rule.sources))];
  return { ...base, candidates, evidence, status: candidates.length > 1 ? 'AMBIGUOUS' : candidates.length === 1 ? 'KNOWN' : brief.placement === 'surface' && !brief.surfaceMethod ? 'NEEDS_INPUT' : 'UNKNOWN' };
}
function decide(input, knowledge, evidence) {
  const prior = { ...clone(input), evidence:clone(evidence.sourceEvidence || []) };
  if (prior.status !== 'KNOWN') return prior;
  const selected = knowledge.rules.find((rule) => rule.id === prior.candidates[0] && rule.enabled);
  if (!selected || !selected.sources.length) return { ...prior, status:'FAILED', candidates:[], evidence:[], technique:null };
  return { ...prior, status:'READY', technique:selected.id, evidence:clone(selected.sources) };
}
function validate(input, knowledge, evidence) {
  const prior = { ...clone(input), evidence:clone(evidence.sourceEvidence || []) };
  if (prior.status === 'READY' && prior.brief.sampleCheck === 'FAIL') return { ...prior, status:'FAILED', technique:null };
  const sourceIds = new Set(knowledge.sources.map((s) => s.id));
  if (prior.status === 'READY' && (!prior.technique || !prior.evidence.length || prior.evidence.some((id) => !sourceIds.has(id)))) return { ...prior, status:'FAILED', technique:null };
  return prior;
}
export function runPipeline(input, handle) {
  const snap = snapshots.get(handle); assert(snap, 'UNVERIFIED_PACKAGE');
  const { graph, units, knowledge, digests, manifest, descriptor } = snap;
  const outputs = new Map(), trace = [];
  const handlers = { 'registry:textile.recognizer@1.0.0':(i) => recognize(i,knowledge), 'registry:textile.decision@1.0.0':(i,e) => decide(i,knowledge,e), 'registry:textile.validator@1.0.0':(i,e) => validate(i,knowledge,e) };
  let nodeId = graph.entryNode;
  for (let step = 0; step < graph.nodes.length; step++) {
    const node = graph.nodes.find((n) => n.nodeId === nodeId), unit = units.get(node.unitRef.id);
    const payload = nodeId === graph.entryNode ? clone(input) : {};
    for (const edge of graph.edges.filter((e) => e.kind === 'data' && e.to.node === nodeId)) payload[edge.to.pointer.slice(1)] = clone(outputs.get(edge.from.node)[edge.from.pointer.slice(1)]);
    const evidence = {};
    for (const edge of graph.edges.filter((e) => e.kind === 'evidence' && e.to.node === nodeId)) evidence[edge.to.slot] = clone(outputs.get(edge.from.node)[edge.from.pointer.slice(1)]);
    let output;
    try { output = handlers[unit.implementation.ref](payload,evidence); } catch (error) {
      trace.push({nodeId,unitId:unit.id,unitRevision:unit.revision,unitSha256:digests[manifest.units.find((ref) => ref.id === unit.id).path],graphSha256:digests[manifest.graphRef.path],knowledgeSha256:digests['fixtures/textile-knowledge.json'],implementationRef:unit.implementation.ref,input:clone(payload),evidence:clone(evidence),failure:{code:error.message}});
      error.trace = clone(trace); throw error;
    }
    const actions = {UNKNOWN:'PRESERVE_UNKNOWN',AMBIGUOUS:'CLARIFY',CONFLICT:'CLARIFY',NEEDS_INPUT:'WAIT',FAILED:'FAIL',OUT_OF_SCOPE:'REJECT'};
    if (actions[output.status]) assert(unit.failure.handling[output.status]?.action === actions[output.status], 'UNSUPPORTED_FAILURE_POLICY');
    outputs.set(nodeId,output);
    trace.push({ nodeId, unitId:unit.id, unitRevision:unit.revision, unitSha256:digests[manifest.units.find((ref) => ref.id === unit.id).path], graphSha256:digests[manifest.graphRef.path], knowledgeSha256:digests['fixtures/textile-knowledge.json'], implementationRef:unit.implementation.ref, input:clone(payload), evidence:clone(evidence), output:clone(output) });
    if (actions[output.status]) return { packageIdentity:clone(descriptor.dis), trace, outcome:output, termination:{action:actions[output.status],status:output.status,nodeId,unitId:unit.id} };
    if (graph.terminalNodes.includes(nodeId)) return { packageIdentity:clone(descriptor.dis), trace, outcome:output };
    const next = graph.edges.filter((edge) => edge.kind === 'control' && edge.from === nodeId); assert(next.length === 1, 'CONTROL_FLOW'); nodeId = next[0].to;
  }
  throw new Error('STEP_LIMIT');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const descriptor = JSON.parse(await fs.readFile(path.join(packageRoot,'package.json')));
  const loaded = await loadPackage({expectedClosureSha256:process.env.DIS_TEXTILE_EXPECTED_CLOSURE, expectedSelectionSha256:process.env.DIS_TEXTILE_EXPECTED_SELECTION});
  const scenarios = JSON.parse(await fs.readFile(path.join(packageRoot,'fixtures/scenarios.json')));
  const results = scenarios.map((scenario) => ({id:scenario.id,input:scenario.input,...runPipeline(scenario.input,loaded)}));
  if (process.argv.includes('--write-traces')) await fs.writeFile(path.join(packageRoot,'validation/final-traces.json'),JSON.stringify(results,null,2)+'\n');
  console.log(JSON.stringify(results,null,2));
}
