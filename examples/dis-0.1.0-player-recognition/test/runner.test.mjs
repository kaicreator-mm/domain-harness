import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDemo, runPipeline, resolveSchemaClosure, validateGraph, validateDefinition, validateUnit, validatePreconditions, validateCapabilityContracts, resolveProviderSelection, validateLifecycleRecords, recognizePlayerNormalized, handlers, assertInsidePackage, conditionMatches, DisExecutionError } from '../src/runner.mjs';
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
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('INVALID_DATA_POINTER'));
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

test('symlinks cannot escape the Package root', async (t) => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dis-path-safety-'));
  const root = path.join(temporary, 'package');
  const outside = path.join(temporary, 'outside.txt');
  const link = path.join(root, 'escape.txt');
  try {
    await fs.mkdir(root);
    await fs.writeFile(outside, 'outside');
    try {
      await fs.symlink(outside, link);
    } catch (error) {
      if (['EPERM', 'ENOTSUP', 'EACCES'].includes(error?.code)) {
        t.skip('the current platform does not permit creating symlinks for this test');
        return;
      }
      throw error;
    }
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



test('optional input data binding may be absent on paths where its source does not execute', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  const targetUnit = loaded.unitsById.get('xdownload.player.outcome-validator');
  const schemas = new Map(loaded.schemas);
  const targetSchema = structuredClone(schemas.get(targetUnit.input.schemaRef));
  targetSchema.properties.optionalStatus = { type: 'string' };
  schemas.set(targetUnit.input.schemaRef, targetSchema);
  graph.edges.push({
    kind: 'data',
    from: { node: 'resolve-known', pointer: '/status' },
    to: { node: 'validate', pointer: '/optionalStatus' },
  });
  assert.equal(validateGraph(graph, loaded.unitsById, schemas), true);

  const known = await runPipeline(
    { url: 'https://example.test/watch', signals: ['jwplayer.setup({})'] },
    { ...loaded, graph, schemas },
  );
  const knownValidatorInput = known.trace.find((entry) => entry.nodeId === 'validate').input;
  assert.equal(knownValidatorInput.optionalStatus, 'READY');

  const unknown = await runPipeline(
    { url: 'https://example.test/watch', signals: ['custom-player'] },
    { ...loaded, graph, schemas },
  );
  const unknownValidatorInput = unknown.trace.find((entry) => entry.nodeId === 'validate').input;
  assert.equal(Object.hasOwn(unknownValidatorInput, 'optionalStatus'), false);

  const duplicate = structuredClone(graph);
  duplicate.edges.push({
    kind: 'data',
    from: { node: 'decide', pointer: '/route' },
    to: { node: 'validate', pointer: '/optionalStatus' },
  });
  assert.throws(
    () => validateGraph(duplicate, loaded.unitsById, schemas),
    hasCode('OPTIONAL_INPUT_DUPLICATE_BINDING_ON_PATH'),
  );
});

test('control conditions use the same structural JSON value semantics as Python', () => {
  const cases = [
    [{ optionalFlag: true }, { path: '/optionalFlag', operator: 'equals', value: true }, true],
    [{ optionalFlag: 1 }, { path: '/optionalFlag', operator: 'equals', value: true }, false],
    [{ optionalFlag: 1 }, { path: '/optionalFlag', operator: 'notEquals', value: true }, true],
    [{ optionalFlag: true }, { path: '/optionalFlag', operator: 'notEquals', value: 1 }, true],
    [{ optionalFlag: true }, { path: '/optionalFlag', operator: 'notEquals', value: true }, false],
    [{ optionalFlag: 1 }, { path: '/optionalFlag', operator: 'equals', value: 1.0 }, true],
    [{}, { path: '/optionalFlag', operator: 'equals', value: null }, false],
    [{}, { path: '/optionalFlag', operator: 'notEquals', value: null }, true],
    [{ optionalFlag: null }, { path: '/optionalFlag', operator: 'exists' }, true],
    [{}, { path: '/optionalFlag', operator: 'exists' }, false],
    [{ optionalFlag: { a: 1, b: [true, null] } }, { path: '/optionalFlag', operator: 'equals', value: { b: [true, null], a: 1 } }, true],
    [{ optionalFlag: [1, 'x'] }, { path: '/optionalFlag', operator: 'equals', value: [1, 'x'] }, true],
    [{ optionalFlag: [1, 'x'] }, { path: '/optionalFlag', operator: 'equals', value: ['x', 1] }, false],
    [{ optionalFlag: 9007199254740992 }, { path: '/optionalFlag', operator: 'equals', value: 9007199254740993 }, true],
    [{ actual: { value: 1 } }, { path: '', operator: 'equals', value: { actual: { value: 1 } } }, true],
  ];
  for (const [output, condition, expected] of cases) {
    assert.equal(conditionMatches(output, condition), expected, JSON.stringify(condition));
  }
});

test('unsupported control condition operators fail during Graph validation', async () => {
  const loaded = await loadedPromise;
  const graph = structuredClone(loaded.graph);
  const edge = graph.edges.find((item) => item.kind === 'control' && item.from === 'decide' && item.when);
  edge.when.operator = 'contains';
  assert.throws(() => validateGraph(graph, loaded.unitsById, loaded.schemas), hasCode('UNSUPPORTED_CONDITION_OPERATOR'));
});


test('selected Knowledge/Rule reference is digest-pinned and consumed by the Recognizer', async () => {
  const loaded = await loadedPromise;
  const knowledge = loaded.knowledge['xdownload.player-signature-rules'];
  assert.equal(knowledge.catalogId, 'xdownload.player-signatures');
  assert.equal(knowledge.revision, '1.0.0');
  const result = await runPipeline({ url: 'https://example.test/watch', signals: ['jwplayer'] }, loaded);
  assert.equal(result.outcome.status, 'READY');
});

test('bounded preconditions are evaluated before a Unit implementation executes', async () => {
  const loaded = await loadedPromise;
  const recognizer = loaded.unitsById.get('xdownload.player.recognizer');
  assert.equal(validatePreconditions(recognizer, { url: 'https://example.test/watch', signals: [] }), true);
  assert.throws(() => validatePreconditions(recognizer, { signals: [] }), hasCode('PRECONDITION_FAILED'));
  assert.throws(() => validatePreconditions(recognizer, { url: 'https://example.test/watch' }), hasCode('PRECONDITION_FAILED'));
});

test('Capability requirements resolve one exact provider contract', async () => {
  const loaded = await loadedPromise;
  assert.equal(validateCapabilityContracts(loaded.unitsById), true);
  const missing = new Map(loaded.unitsById);
  const recognizer = structuredClone(missing.get('xdownload.player.recognizer'));
  recognizer.capabilities.provides = [];
  missing.set(recognizer.id, recognizer);
  assert.throws(() => validateCapabilityContracts(missing), hasCode('MISSING_CAPABILITY_PROVIDER'));

  const ambiguous = new Map(loaded.unitsById);
  const duplicate = structuredClone(ambiguous.get('xdownload.player.recognizer'));
  duplicate.id = 'xdownload.player.recognizer.duplicate';
  ambiguous.set(duplicate.id, duplicate);
  assert.throws(() => validateCapabilityContracts(ambiguous), hasCode('AMBIGUOUS_CAPABILITY_PROVIDER'));

  const incompatible = new Map(loaded.unitsById);
  const decision = structuredClone(incompatible.get('xdownload.player.route-decision'));
  decision.capabilities.requires[0].compatibility.accepted[0].contractDigest = '0'.repeat(64);
  incompatible.set(decision.id, decision);
  assert.throws(() => validateCapabilityContracts(incompatible), hasCode('INCOMPATIBLE_CAPABILITY_PROVIDER'));
});

test('Package lock deterministically selects one exact implementation candidate independent of array order', async () => {
  const loaded = await loadedPromise;
  const unit = loaded.unitsById.get('xdownload.player.recognizer');
  const selected = resolveProviderSelection(unit, loaded.packageIdentity.selectionLock, 'node24', loaded.resources);
  assert.equal(selected.candidate.candidateId, 'signature-exact-v1');

  const reordered = structuredClone(unit);
  reordered.implementation.candidates.reverse();
  const again = resolveProviderSelection(reordered, loaded.packageIdentity.selectionLock, 'node24', loaded.resources);
  assert.equal(again.candidate.candidateId, 'signature-exact-v1');
});

test('provider selection fails closed for missing, ambiguous and incompatible candidates', async () => {
  const loaded = await loadedPromise;
  const unit = loaded.unitsById.get('xdownload.player.recognizer');
  const noLock = structuredClone(loaded.packageIdentity.selectionLock);
  noLock.selectedCapabilities = [];
  assert.throws(() => resolveProviderSelection(unit, noLock, 'node24', loaded.resources), hasCode('MISSING_PACKAGE_PROVIDER_SELECTION'));

  const duplicate = structuredClone(unit);
  duplicate.implementation.candidates[1].candidateId = duplicate.implementation.candidates[0].candidateId;
  assert.throws(() => resolveProviderSelection(duplicate, loaded.packageIdentity.selectionLock, 'node24', loaded.resources), hasCode('AMBIGUOUS_IMPLEMENTATION_PROVIDER'));

  assert.throws(() => resolveProviderSelection(unit, loaded.packageIdentity.selectionLock, 'node22', loaded.resources), hasCode('INCOMPATIBLE_PROVIDER_TARGET'));
  const badDigest = structuredClone(unit);
  badDigest.implementation.candidates[0].artifactDigest = '0'.repeat(64);
  assert.throws(() => resolveProviderSelection(badDigest, loaded.packageIdentity.selectionLock, 'node24', loaded.resources), hasCode('PACKAGE_PROVIDER_PIN_MISMATCH'));
});

test('alternative normalized provider is an explicit implementation, not ambient discovery', async () => {
  const loaded = await loadedPromise;
  const handler = handlers['registry:xdownload.player.recognizer-normalized@1.0.0'];
  const result = handler({ url: 'https://example.test/watch', signals: ['JWPLAYER'] }, {
    knowledge: loaded.knowledge,
    catalogs: loaded.catalogs,
    evidence: {},
  });
  assert.equal(result.status, 'recognized');
  assert.equal(result.candidates[0], 'jwplayer');
  assert.equal(recognizePlayerNormalized({ url: 'https://example.test/watch', signals: ['JWPLAYER'] }, { knowledge: loaded.knowledge }).status, 'recognized');
});

test('Unit failure profile has one canonical handling map and rejects malformed policy values', async () => {
  const loaded = await loadedPromise;
  const unit = structuredClone(loaded.unitsById.get('xdownload.player.recognizer'));
  assert.equal(validateUnit(unit), true);
  unit.failure.supported = ['UNKNOWN'];
  assert.throws(() => validateUnit(unit), hasCode('INVALID_FAILURE_PROFILE'));

  const malformed = structuredClone(loaded.unitsById.get('xdownload.player.recognizer'));
  malformed.failure.handling.UNKNOWN = {};
  assert.throws(() => validateUnit(malformed), hasCode('INVALID_FAILURE_HANDLING_POLICY'));

  const mutable = structuredClone(loaded.unitsById.get('xdownload.player.recognizer'));
  mutable.qualification.stage = 'PROMOTED';
  assert.throws(() => validateUnit(mutable), hasCode('MUTABLE_QUALIFICATION_STAGE_FORBIDDEN'));
});

test('append-only lifecycle chain binds exact Unit digest and dependency closure', async () => {
  const loaded = await loadedPromise;
  const unitPaths = new Map(loaded.closureManifest.units.map((item) => [item.id, item.path]));
  assert.equal(validateLifecycleRecords(loaded.packageIdentity, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256), true);

  const missingValidation = structuredClone(loaded.packageIdentity);
  missingValidation.lifecycleRecords = missingValidation.lifecycleRecords.filter((record) => record.transition !== 'VALIDATED');
  assert.throws(() => validateLifecycleRecords(missingValidation, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256), hasCode('INCOMPLETE_LIFECYCLE_CHAIN'));

  const unauthorized = structuredClone(loaded.packageIdentity);
  unauthorized.lifecycleRecords.find((record) => record.transition === 'PROMOTED').actor.authorityRef = '';
  assert.throws(() => validateLifecycleRecords(unauthorized, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256), hasCode('UNAUTHORIZED_PROMOTION_RECORD'));

  const stale = structuredClone(loaded.packageIdentity);
  stale.lifecycleRecords[0].dependencyClosureDigest = '0'.repeat(64);
  assert.throws(() => validateLifecycleRecords(stale, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256), hasCode('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH'));

  const unpromoted = structuredClone(loaded.packageIdentity);
  unpromoted.selectionLock.selectedAssets.find((asset) => asset.kind === 'unit').promotionRecordId = 'missing-promotion';
  assert.throws(() => validateLifecycleRecords(unpromoted, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256), hasCode('PACKAGE_PROMOTION_PIN_MISMATCH'));
});
