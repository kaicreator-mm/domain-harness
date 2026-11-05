import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDemo, runPipeline, resolveSchemaClosure, validateGraph, validateDefinition, validateUnit, assertInsidePackage, DisExecutionError } from '../src/runner.mjs';
import { loadVerifiedDemo, verifyResourceClosure } from '../src/verified-loader.mjs';

const loadedPromise = loadVerifiedDemo();
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function hasCode(code) {
  return (error) => error instanceof DisExecutionError && error.code === code;
}

test('known player follows control path while data arrives through an independent edge', async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: 'https://example.test/watch', signals: ['jwplayer.setup({})'] }, loaded);
  assert.equal(result.outcome.status, 'READY');
  assert.equal(result.outcome.playerId, 'jwplayer');
  assert.equal(result.outcome.strategyId, 'jwplayer.extract.v1');
  assert.equal(result.trace.map((item) => item.nodeId).join(','), 'recognize,decide,resolve-known,validate');
  assert.equal(result.trace.find((item) => item.nodeId === 'decide').output.recognition, undefined);
  assert.equal(result.trace.find((item) => item.nodeId === 'resolve-known').output.evidence, undefined);
});

test('recognizer and resolver consume the package catalogs referenced by their Units', async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: 'https://example.test/watch', signals: ['hls.js'] }, loaded);
  assert.equal(result.outcome.status, 'READY');
  assert.equal(result.outcome.playerId, 'hlsjs');
  assert.equal(result.outcome.strategyId, 'hlsjs.extract.v1');
  assert.equal(loaded.catalogs.signatures.catalogId, 'xdownload.player-signatures');
  assert.equal(loaded.catalogs.strategies.catalogId, 'xdownload.player-strategies');
});

test('ambiguous recognition asks for input instead of guessing', async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: 'https://example.test/watch', signals: ['jwplayer', 'videojs'] }, loaded);
  assert.equal(result.outcome.status, 'NEEDS_INPUT');
  assert.equal(result.outcome.reason, 'multiple-player-candidates');
  assert.equal(result.outcome.playerId, undefined);
});

test('unknown recognition escalates instead of inventing a player', async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: 'https://example.test/watch', signals: ['custom-player'] }, loaded);
  assert.equal(result.outcome.status, 'NEEDS_REVIEW');
  assert.equal(result.outcome.reason, 'no-supported-player-candidate');
});

test('invalid input is rejected before recognition', async () => {
  const loaded = await loadedPromise;
  await assert.rejects(() => runPipeline({ url: 'file:///etc/passwd', signals: [] }, loaded), hasCode('INVALID_INPUT'));
});

test('evidence edge independently carries recognizer evidence to terminal validation', async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: 'https://example.test/watch', signals: ['jwplayer'] }, loaded);
  assert.equal(result.outcome.evidenceCount, 1);
  assert.equal(result.outcome.evidence[0].claim, 'matched marker jwplayer');
  const evidenceEdge = loaded.graph.edges.find((edge) => edge.kind === 'evidence');
  assert.equal(evidenceEdge.from.node, 'recognize');
  assert.equal(evidenceEdge.to.node, 'validate');
});

test('private procedure remains private and is not reclassified as a Tool', async () => {
  const loaded = await loadedPromise;
  const unit = loaded.unitsById.get('xdownload.player.resolve-procedure');
  assert.equal(unit.role, 'procedure');
  assert.equal(unit.implementation.exposure, 'private');
  assert.equal(loaded.definition.components.some((component) => component.unitRef.id === unit.id), false);
  assert.ok(loaded.definition.privateUnits.some((ref) => ref.id === unit.id));
});

test('data edge alone does not schedule a node', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  graph.edges = graph.edges.filter((edge) => !(edge.kind === 'control' && edge.from === 'decide' && edge.to === 'resolve-known'));
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('UNREACHABLE_CONTROL_NODE'));
});

test('nested data pointers are rejected by the 0.1.0 top-level pointer profile', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  const edge = graph.edges.find((item) => item.kind === 'data' && item.to.node === 'decide');
  edge.to.pointer = '/recognition/status';
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('UNKNOWN_TARGET_INPUT_POINTER'));
});

test('required input without a data binding is rejected', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  graph.edges = graph.edges.filter((edge) => !(edge.kind === 'data' && edge.to.node === 'decide'));
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('MISSING_REQUIRED_DATA_BINDING'));
});

test('required evidence slot without an evidence edge is rejected', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  graph.edges = graph.edges.filter((edge) => edge.kind !== 'evidence');
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('MISSING_EVIDENCE_BINDING'));
});

test('missing schema resource fails package closure validation', async () => {
  await assert.rejects(() => resolveSchemaClosure(packageRoot, ['domain/schemas/does-not-exist.schema.json']), hasCode('MISSING_SCHEMA_RESOURCE'));
});

test('path traversal fails package closure validation', async () => {
  await assert.rejects(() => resolveSchemaClosure(packageRoot, ['../outside.schema.json']), hasCode('UNSAFE_SCHEMA_REF'));
});

test('schema closure resolves nested local references and records content digests', async () => {
  const loaded = await loadedPromise;
  assert.ok(loaded.resources.size >= 8);
  for (const digest of loaded.resources.values()) assert.match(digest, /^[a-f0-9]{64}$/);
});

test('resource closure manifest pins every resolved schema digest', async () => {
  const loaded = await loadedPromise;
  assert.equal(loaded.closureManifest.resources.length, loaded.resources.size);
  const tampered = structuredClone(loaded.closureManifest);
  tampered.resources[0].sha256 = '0'.repeat(64);
  assert.throws(() => verifyResourceClosure({ resources: loaded.resources }, tampered), hasCode('RESOURCE_DIGEST_MISMATCH'));
});


test('recognizer preserves value provenance and uncertainty independently', async () => {
  const loaded = await loadedPromise;
  const known = await runPipeline({ url: 'https://example.test/watch', signals: ['jwplayer'] }, loaded);
  const recognized = known.trace.find((entry) => entry.unitId === 'xdownload.player.recognizer').output;
  assert.deepEqual(recognized.values.playerId, {
    value: 'jwplayer', source: 'DERIVED', status: 'INFERRED', evidence: ['page-observation'],
  });
  const unknown = await runPipeline({ url: 'https://example.test/watch', signals: ['unknown-player'] }, loaded);
  const unknownValue = unknown.trace.find((entry) => entry.unitId === 'xdownload.player.recognizer').output.values.playerId;
  assert.equal(unknownValue.source, 'SYSTEM_OBSERVED');
  assert.equal(unknownValue.status, 'UNKNOWN');
});

test('required input has exactly one source on every control-flow path', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  graph.edges.push({ kind: 'data', from: { node: 'decide', pointer: '' }, to: { node: 'resolve-known', pointer: '/recognition' } });
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('REQUIRED_INPUT_BINDING_NOT_EXACTLY_ONE_ON_EVERY_PATH'));
});

test('control cycles are rejected under DAG_ONLY', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  graph.edges.push({ kind: 'control', from: 'validate', to: 'recognize' });
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('CONTROL_CYCLE'));
});

test('evidence source must be a required output property', async () => {
  const loaded = await loadedPromise;
  const schemas = new Map(loaded.schemas);
  const altered = structuredClone(schemas.get('domain/schemas/recognition-result.schema.json'));
  altered.required = altered.required.filter((field) => field !== 'evidence');
  schemas.set('domain/schemas/recognition-result.schema.json', altered);
  assert.throws(() => validateGraph(loaded.graph, loaded.unitsById, schemas), hasCode('EVIDENCE_SOURCE_NOT_REQUIRED'));
});

test('symlinks cannot escape the Package root', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dis-path-safety-'));
  const root = path.join(temporary, 'package');
  const outside = path.join(temporary, 'outside.txt');
  const link = path.join(root, 'escape.txt');
  try {
    await fs.mkdir(root);
    await fs.writeFile(outside, 'outside');
    await fs.symlink(outside, link);
    await assert.rejects(() => assertInsidePackage(root, link), hasCode('RESOURCE_PATH_ESCAPE'));
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});


test('external provenance URIs remain descriptive and are not package resources', async () => {
  const loaded = await loadedPromise;
  const unit = structuredClone(loaded.unitsById.get('xdownload.player.recognizer'));
  unit.evidence.sources.push({
    sourceId: 'external-standard-reference',
    kind: 'reference',
    ref: 'https://example.test/domain-standard',
    claim: 'External provenance is descriptive and is not fetched into the Package.',
  });
  assert.equal(validateUnit(unit), true);
});

test('unsupported provenance URI schemes fail closed', async () => {
  const loaded = await loadedPromise;
  const unit = structuredClone(loaded.unitsById.get('xdownload.player.recognizer'));
  unit.evidence.sources[0].ref = 'file:///etc/passwd';
  assert.throws(() => validateUnit(unit), hasCode('UNSAFE_PROVENANCE_REF'));
});

test('Definition must declare every Graph Node Unit exactly once', async () => {
  const loaded = await loadedPromise;
  const definition = structuredClone(loaded.definition);
  definition.components = definition.components.filter(
    (component) => component.unitRef.id !== 'xdownload.player.recognizer',
  );
  assert.throws(
    () => validateDefinition(definition, loaded.unitsById, loaded.graph, 'domain/player-recognition.graph.json'),
    hasCode('UNDECLARED_GRAPH_UNIT'),
  );
});

test('Definition Workflow reference must pin the exact Graph identity and path', async () => {
  const loaded = await loadedPromise;
  const definition = structuredClone(loaded.definition);
  definition.workflowRef.graphRef.revision = '2.0.0';
  assert.throws(
    () => validateDefinition(definition, loaded.unitsById, loaded.graph, 'domain/player-recognition.graph.json'),
    hasCode('WORKFLOW_GRAPH_REF_MISMATCH'),
  );
});

test('private data-only Units need not declare an implementation exposure', async () => {
  const loaded = await loadedPromise;
  const definition = structuredClone(loaded.definition);
  const units = new Map(loaded.unitsById);
  const knowledge = {
    schemaVersion: 'dis.unit/0.1.0',
    id: 'xdownload.private.reference-knowledge',
    revision: '1.0.0',
    role: 'knowledge',
    purpose: 'Private reference knowledge used only inside this Definition.',
    scope: { domain: 'web-media', appliesTo: ['player-recognition'], excludes: [] },
    owner: 'xdownload-demo',
    authority: 'REFERENCE',
    qualification: { stage: 'CANDIDATE' },
    evidence: { sources: [], absenceReason: 'No separate source is required for this demo fixture.' },
    failure: { supported: ['UNKNOWN'], handling: { UNKNOWN: 'preserve-unknown' } },
  };
  units.set(knowledge.id, knowledge);
  definition.privateUnits.push({ id: knowledge.id, revision: knowledge.revision });
  assert.equal(validateDefinition(definition, units, loaded.graph, 'domain/player-recognition.graph.json'), true);
});

 
test('exists control conditions may inspect declared optional output properties', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  const decisionUnit = loaded.unitsById.get('xdownload.player.route-decision');
  const schemas = new Map(loaded.schemas);
  const outputSchema = structuredClone(schemas.get(decisionUnit.output.schemaRef));
  outputSchema.properties.optionalSignal = { type: 'boolean' };
  schemas.set(decisionUnit.output.schemaRef, outputSchema);
  const edge = graph.edges.find((item) => item.kind === 'control' && item.from === 'decide' && item.when);
  edge.when = { path: '/optionalSignal', operator: 'exists' };
  assert.equal(validateGraph(graph, loaded.unitsById, schemas), true);
});

test('unsupported control condition operators fail during Graph validation', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  const edge = graph.edges.find((item) => item.kind === 'control' && item.from === 'decide' && item.when);
  edge.when.operator = 'contains';
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('UNSUPPORTED_CONDITION_OPERATOR'));
});
