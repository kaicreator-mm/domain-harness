import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDemo, runPipeline, resolveSchemaClosure, validateGraph, DisExecutionError } from '../src/runner.mjs';
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
