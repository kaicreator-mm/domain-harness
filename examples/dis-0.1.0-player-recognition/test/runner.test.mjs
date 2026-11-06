import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadDemo, runPipeline, bindAvailableData, resolveSchemaClosure, validateGraph, validateDefinition, validateUnit, validatePreconditions, referenceFailureAction, validateReferenceFeedback, validateCapabilityContracts, resolveProviderSelection, validateSelectedGraph, replayLifecycle, validateLifecycleRecords, recognizePlayerNormalized, handlers, assertInsidePackage, conditionMatches, DisExecutionError } from '../src/runner.mjs';
import { loadVerifiedDemo, verifyResourceClosure } from '../src/verified-loader.mjs';

const loadedPromise = loadVerifiedDemo();
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function hasCode(code) {
  return (error) => error instanceof DisExecutionError && error.code === code;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function hashRecord(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
function refreshRecord(record) {
  const payload = { ...record };
  delete payload.recordDigest;
  record.recordDigest = hashRecord(payload);
}
function refreshLock(identity) {
  identity.selectionLockSha256 = hashRecord(identity.selectionLock);
}
function refreshChain(identity, subjectId) {
  const history = identity.lifecycleRecords.filter((item) => item.subject.id === subjectId);
  const candidate = history.find((item) => item.transition === 'CANDIDATE');
  const validated = history.find((item) => item.transition === 'VALIDATED');
  const promoted = history.find((item) => item.transition === 'PROMOTED');
  refreshRecord(candidate);
  validated.previousRecordDigest = candidate.recordDigest;
  refreshRecord(validated);
  promoted.previousRecordDigest = validated.recordDigest;
  promoted.promotion.validationRecordDigest = validated.recordDigest;
  refreshRecord(promoted);
  for (const item of [...identity.selectionLock.selectedAssets.filter((asset) => asset.id === subjectId), ...identity.selectionLock.selectedCapabilities.filter((cap) => cap.provider.unitId === subjectId)]) {
    item.validationRecordDigest = validated.recordDigest;
    item.promotionRecordDigest = promoted.recordDigest;
  }
  refreshLock(identity);
}

function makeSuccessorHistory(records, successorDigest, successorBytes) {
  const successor = structuredClone(records), priorPromotion = records.at(-1);
  for (let i = 0; i < successor.length; i += 1) {
    const record = successor[i];
    record.recordId += '.successor';
    record.subject.revision = '2.0.0';
    record.subject.sha256 = successorDigest;
    record.subjectPath = 'synthetic/successor-unit.json';
    record.subjectJson = successorBytes;
    if (i) {
      record.previousRecordId = successor[i - 1].recordId;
      record.previousRecordDigest = successor[i - 1].recordDigest;
    }
    if (record.transition === 'VALIDATED') {
      record.validation.subjectDigest = record.subject.sha256;
      record.validation.report.subject = structuredClone(record.subject);
      record.validation.reportSha256 = hashRecord(record.validation.report);
    }
    if (record.transition === 'PROMOTED') {
      record.promotion.validationRecordId = successor[i - 1].recordId;
      record.promotion.validationRecordDigest = successor[i - 1].recordDigest;
      record.promotion.priorPromotedBaseline = { kind: 'PROMOTED', recordId: priorPromotion.recordId, recordDigest: priorPromotion.recordDigest };
    }
    refreshRecord(record);
  }
  return successor;
}

async function copyWithRecognizerPolicy(temporary, changes, options = {}) {
  const root = path.join(temporary, 'package');
  await fs.cp(packageRoot, root, { recursive: true });
  const read = async (relative) => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
  const write = async (relative, value) => fs.writeFile(path.join(root, relative), JSON.stringify(value, null, 2) + '\n');
  const unit = await read('domain/units/recognizer.json');
  for (const [status, action] of Object.entries(changes)) unit.failure.handling[status].action = action;
  await write('domain/units/recognizer.json', unit);
  if (options.validatorPreconditions) {
    const validator = await read('domain/units/validator.json');
    validator.preconditions = { inputSchemaRef: validator.input.schemaRef, all: [{ path: '/resolution', operator: 'equals', value: { status: 'IMPOSSIBLE' } }] };
    await write('domain/units/validator.json', validator);
  }
  if (options.unitPolicy) {
    const targetPath = 'domain/units/' + options.unitPolicy.file + '.json';
    const target = await read(targetPath);
    target.failure.handling[options.unitPolicy.status].action = options.unitPolicy.action;
    await write(targetPath, target);
  }
  const manifest = await read('domain/resource-closure.json');
  if (options.packageRevision) manifest.packageRevision = options.packageRevision;
  for (const entry of manifest.resources) entry.sha256 = createHash('sha256').update(await fs.readFile(path.join(root, entry.path))).digest('hex');
  await write('domain/resource-closure.json', manifest);
  const closureDigest = createHash('sha256').update(await fs.readFile(path.join(root, 'domain/resource-closure.json'))).digest('hex');
  const resources = new Map(manifest.resources.map((entry) => [entry.path, entry.sha256]));
  const descriptor = await read('package.json'), identity = descriptor.dis;
  if (options.packageRevision) {
    identity.revision = options.packageRevision;
    identity.selectionLock.packageRevision = options.packageRevision;
  }
  if (options.candidateId) {
    const candidate = unit.implementation.candidates.find((item) => item.candidateId === options.candidateId);
    Object.assign(identity.selectionLock.selectedCapabilities[0].provider, { candidateId: candidate.candidateId, implementationRef: candidate.ref, artifactRef: candidate.artifactRef, artifactDigest: candidate.artifactDigest });
  }
  identity.resourceClosureSha256 = closureDigest;
  const priorBySubject = new Map();
  for (const record of identity.lifecycleRecords) {
    const asset = identity.selectionLock.selectedAssets.find((item) => item.kind === record.subject.kind && item.id === record.subject.id);
    record.subject.sha256 = resources.get(asset.path);
    record.subjectJson = await fs.readFile(path.join(root, asset.path), 'utf8');
    record.dependencyClosureDigest = closureDigest;
    const previous = priorBySubject.get(asset.id);
    record.previousRecordId = previous?.recordId || null;
    record.previousRecordDigest = previous?.recordDigest || null;
    if (record.transition === 'VALIDATED') {
      record.validation.subjectDigest = record.subject.sha256;
      record.validation.dependencyClosureDigest = closureDigest;
      record.validation.report.subject = structuredClone(record.subject);
      record.validation.report.dependencyClosure.sha256 = closureDigest;
      record.validation.reportSha256 = hashRecord(record.validation.report);
    }
    if (record.transition === 'PROMOTED') {
      record.promotion.validationRecordId = previous.recordId;
      record.promotion.validationRecordDigest = previous.recordDigest;
    }
    refreshRecord(record);
    priorBySubject.set(asset.id, record);
  }
  for (const asset of identity.selectionLock.selectedAssets) {
    asset.sha256 = resources.get(asset.path);
    const history = identity.lifecycleRecords.filter((record) => record.subject.id === asset.id);
    const validation = history.find((record) => record.transition === 'VALIDATED');
    const promotion = history.find((record) => record.transition === 'PROMOTED');
    Object.assign(asset, { validationRecordId: validation.recordId, validationRecordDigest: validation.recordDigest, promotionRecordId: promotion.recordId, promotionRecordDigest: promotion.recordDigest });
  }
  const selected = identity.selectionLock.selectedAssets.find((asset) => asset.id === unit.id);
  const capability = identity.selectionLock.selectedCapabilities[0];
  for (const key of ['validationRecordId', 'validationRecordDigest', 'promotionRecordId', 'promotionRecordDigest']) capability[key] = selected[key];
  refreshLock(identity);
  await write('package.json', descriptor);
  const isolated = await import(pathToFileURL(path.join(root, 'src/runner.mjs')).href);
  const loaded = await isolated.loadDemo({ expectedSelectionLockSha256: identity.selectionLockSha256 });
  return { isolated, loaded };
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
  await assert.rejects(() => runPipeline({ url: 'not a URL', signals: [] }, loaded), hasCode('INVALID_INPUT'));
  await assert.rejects(() => runPipeline({ url: 'file:///etc/passwd', signals: [] }, loaded), hasCode('FAILURE_POLICY_REJECT'));
});

test('conflicting observations are evidenced and clarified; exclusions fail closed', async () => {
  const loaded = await loadedPromise;
  const result = await runPipeline({ url: 'https://example.test/watch', signals: ['jwplayer'], claims: [{ sourceId: 'browser', playerId: 'videojs' }] }, loaded);
  assert.equal(result.trace[0].output.status, 'conflict');
  assert.equal(result.trace[0].output.conflicts[0].claims.length, 2);
  assert.ok(result.trace[0].output.evidence.some((entry) => entry.sourceId === 'browser'));
  assert.equal(result.outcome.status, 'NEEDS_INPUT');
  for (const input of [{ url: 'ftp://example.test/page', signals: [] }, { url: 'https://example.test', signals: [], encryptedPlayer: true }, { url: 'https://example.test', signals: [], unsupportedPlayerFamily: true }]) {
    await assert.rejects(() => runPipeline(input, loaded), (error) => error.code === 'FAILURE_POLICY_REJECT' && error.trace?.length === 1 && error.trace[0].output.status === 'out_of_scope' && error.trace[0].output.evidence.length > 0);
  }
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
    loaded,
  );
  const knownValidatorInput = bindAvailableData(graph, new Map(known.trace.map((entry) => [entry.nodeId, entry.output])), 'validate', {});
  assert.equal(knownValidatorInput.optionalStatus, 'READY');

  const unknown = await runPipeline(
    { url: 'https://example.test/watch', signals: ['custom-player'] },
    loaded,
  );
  const unknownValidatorInput = bindAvailableData(graph, new Map(unknown.trace.map((entry) => [entry.nodeId, entry.output])), 'validate', {});
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
  const knowledge = loaded.knowledge['xdownload.player-signatures'];
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
  const unicode = new Map([...loaded.unitsById].map(([id, unit]) => [id, structuredClone(unit)]));
  const provided = unicode.get('xdownload.player.recognizer').capabilities.provides[0];
  provided.owner = '示例';
  const fields = ['capabilityId', 'owner', 'authorityRef', 'version', 'inputSchemaRef', 'inputSchemaDigest', 'outputSchemaRef', 'outputSchemaDigest'];
  provided.contractDigest = hashRecord(Object.fromEntries(fields.map((field) => [field, provided[field]])));
  for (const unit of unicode.values()) for (const requirement of unit.capabilities?.requires || []) {
    requirement.owner = provided.owner;
    requirement.contractDigest = provided.contractDigest;
    for (const accepted of requirement.compatibility.accepted) accepted.contractDigest = provided.contractDigest;
  }
  assert.equal(validateCapabilityContracts(unicode), true);
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

test('selected Graph must match the loaded manifest identity, path and bytes', async () => {
  const loaded = await loadedPromise;
  assert.equal(validateSelectedGraph(loaded.packageIdentity.selectionLock, loaded.closureManifest.graphRef, loaded.graph, loaded.resources), true);
  for (const [field, value] of [['id', 'other'], ['revision', '9.0.0'], ['path', 'domain/other.json'], ['sha256', '0'.repeat(64)]]) {
    const lock = structuredClone(loaded.packageIdentity.selectionLock);
    lock.selectedAssets.find((asset) => asset.kind === 'graph')[field] = value;
    assert.throws(() => validateSelectedGraph(lock, loaded.closureManifest.graphRef, loaded.graph, loaded.resources), hasCode('SELECTED_GRAPH_IDENTITY_MISMATCH'));
  }
});

test('each Package-selected provider drives execution and trace', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dis-provider-selection-'));
  try {
    for (const candidateId of ['signature-exact-v1', 'signature-normalized-v1']) {
      const root = path.join(temporary, candidateId);
      await fs.cp(packageRoot, root, { recursive: true });
      const descriptorPath = path.join(root, 'package.json');
      const descriptor = JSON.parse(await fs.readFile(descriptorPath, 'utf8'));
      const unit = JSON.parse(await fs.readFile(path.join(root, 'domain/units/recognizer.json'), 'utf8'));
      const candidate = unit.implementation.candidates.find((item) => item.candidateId === candidateId);
      Object.assign(descriptor.dis.selectionLock.selectedCapabilities[0].provider, {
        candidateId, implementationRef: candidate.ref, artifactRef: candidate.artifactRef, artifactDigest: candidate.artifactDigest,
      });
      refreshLock(descriptor.dis);
      await fs.writeFile(descriptorPath, JSON.stringify(descriptor));
      const isolated = await import(pathToFileURL(path.join(root, 'src/runner.mjs')).href);
      const loaded = await isolated.loadDemo({ expectedSelectionLockSha256: descriptor.dis.selectionLockSha256 });
      const result = await isolated.runPipeline({ url: 'https://example.test/watch', signals: ['JWPLAYER'] }, loaded);
      assert.equal(result.trace[0].implementationCandidateId, candidateId);
      assert.equal(result.trace[0].implementationRef, candidate.ref);
      assert.equal(result.trace[0].output.status, candidateId === 'signature-exact-v1' ? 'unknown' : 'recognized');
    }
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
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
    unit: loaded.unitsById.get('xdownload.player.recognizer'),
  });
  assert.equal(result.status, 'recognized');
  assert.equal(result.candidates[0], 'jwplayer');
  assert.equal(recognizePlayerNormalized({ url: 'https://example.test/watch', signals: ['JWPLAYER'] }, { knowledge: loaded.knowledge, unit: loaded.unitsById.get('xdownload.player.recognizer') }).status, 'recognized');
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

test('reference failure dispatch consumes the declared policy and rejects unsupported actions', async () => {
  const unit = structuredClone((await loadedPromise).unitsById.get('xdownload.player.recognizer'));
  assert.equal(referenceFailureAction(unit, 'AMBIGUOUS'), 'CLARIFY');
  assert.equal(referenceFailureAction(unit, 'UNKNOWN'), 'PRESERVE_UNKNOWN');
  unit.failure.handling.AMBIGUOUS.action = 'REJECT';
  assert.equal(referenceFailureAction(unit, 'AMBIGUOUS'), 'REJECT');
  unit.failure.handling.AMBIGUOUS.action = 'WAIT';
  assert.throws(() => referenceFailureAction(unit, 'AMBIGUOUS'), hasCode('UNSUPPORTED_FAILURE_POLICY'));
  assert.equal(referenceFailureAction(unit, 'CONFLICT'), 'CLARIFY');
  assert.throws(() => referenceFailureAction(unit, 'PARTIAL'), hasCode('UNDECLARED_FAILURE_STATUS'));
});

test('Package-pinned failure policy changes execution and precondition handling', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dis-failure-policy-'));
  try {
    const reject = await copyWithRecognizerPolicy(path.join(temporary, 'reject'), { AMBIGUOUS: 'REJECT' });
    await assert.rejects(() => reject.isolated.runPipeline({ url: 'https://example.test', signals: ['jwplayer', 'videojs'] }, reject.loaded), (error) => error.code === 'FAILURE_POLICY_REJECT');
    const unsupported = await copyWithRecognizerPolicy(path.join(temporary, 'unsupported'), { INVALID_INPUT: 'WAIT' });
    await assert.rejects(() => unsupported.isolated.runPipeline({ url: 'https://example.test' }, unsupported.loaded), (error) => error.code === 'UNSUPPORTED_FAILURE_POLICY');
    const later = await copyWithRecognizerPolicy(path.join(temporary, 'later'), {}, { validatorPreconditions: true });
    const laterInput = { url: 'https://example.test', signals: ['jwplayer'] };
    await assert.rejects(() => later.isolated.runPipeline(laterInput, later.loaded), (error) => {
      if (process.env.DIS_EMIT_LATER_PROBE === '1') console.log('DIS_LATER_PROBE=' + JSON.stringify({ input: laterInput, errorCode: error.code, failurePolicy: error.failurePolicy, trace: error.trace }));
      return error.code === 'PRECONDITION_FAILED' && error.trace?.at(-1)?.nodeId === 'validate' && error.trace.at(-1).evidence.recognitionEvidence.length > 0;
    });
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('decision and workflow rejection and FAIL carry exact policy attribution', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dis-policy-attribution-'));
  const captured = [];
  const capture = (input, predicate) => (error) => {
    if (process.env.DIS_EMIT_POLICY_PROBES === '1') captured.push({ input, errorCode: error.code, failurePolicy: error.failurePolicy, trace: error.trace });
    return predicate(error);
  };
  try {
    const decision = await copyWithRecognizerPolicy(path.join(temporary, 'decision'), {}, { unitPolicy: { file: 'decision', status: 'UNKNOWN', action: 'REJECT' } });
    const decisionInput = { url: 'https://example.test', signals: ['unknown'] };
    await assert.rejects(() => decision.isolated.runPipeline(decisionInput, decision.loaded), capture(decisionInput, (error) => error.code === 'FAILURE_POLICY_REJECT' && error.failurePolicy?.unitId === 'xdownload.player.route-decision' && error.failurePolicy.status === 'UNKNOWN' && error.trace.at(-1).nodeId === 'decide'));
    const workflow = await copyWithRecognizerPolicy(path.join(temporary, 'workflow'), {}, { unitPolicy: { file: 'workflow', status: 'NEEDS_REVIEW', action: 'FAIL' } });
    const workflowInput = { url: 'https://example.test', signals: ['unknown'] };
    await assert.rejects(() => workflow.isolated.runPipeline(workflowInput, workflow.loaded), capture(workflowInput, (error) => error.code === 'FAILURE_POLICY_FAIL' && error.failurePolicy?.unitId === 'xdownload.player-recognition.workflow' && error.failurePolicy.status === 'NEEDS_REVIEW' && error.trace.at(-1).nodeId === 'validate'));
    const fail = await copyWithRecognizerPolicy(path.join(temporary, 'fail'), { INVALID_INPUT: 'FAIL' });
    for (const input of [{ url: 'https://example.test' }, { url: 'not a URL', signals: [] }]) {
      await assert.rejects(() => fail.isolated.runPipeline(input, fail.loaded), capture(input, (error) => ['PRECONDITION_FAILED', 'INVALID_INPUT'].includes(error.code) && error.failurePolicy?.action === 'FAIL' && error.failurePolicy.status === 'INVALID_INPUT'));
    }
    if (process.env.DIS_EMIT_POLICY_PROBES === '1') console.log('DIS_POLICY_PROBES=' + JSON.stringify(captured));
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
});

test('feedback retains provenance and cannot change an already-pinned execution', async () => {
  const loaded = await loadedPromise;
  const beforeLock = hashRecord(loaded.packageIdentity.selectionLock);
  const beforeUnits = JSON.stringify([...loaded.unitsById]);
  const input = { url: 'https://example.test', signals: ['jwplayer'] };
  const before = await runPipeline(input, loaded);
  const feedback = { traceId: 'synthetic-trace-1', packageLockSha256: beforeLock, provenance: 'MODEL_INFERRED', claimedProvenance: 'MODEL_INFERRED', finding: 'possible alternative marker', disposition: 'PROPOSAL_ONLY' };
  assert.deepEqual(validateReferenceFeedback(feedback, beforeLock), feedback);
  assert.throws(() => validateReferenceFeedback({ ...feedback, claimedProvenance: 'SYSTEM_OBSERVED' }, beforeLock), hasCode('INVALID_RUNTIME_FEEDBACK'));
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dis-future-package-'));
  try {
    const future = await copyWithRecognizerPolicy(temporary, {}, { packageRevision: '2.0.0', candidateId: 'signature-normalized-v1' });
    assert.notEqual(hashRecord(future.loaded.packageIdentity.selectionLock), beforeLock);
    const futureResult = await future.isolated.runPipeline({ url: 'https://example.test', signals: ['JWPLAYER'] }, future.loaded);
    assert.equal(futureResult.trace[0].implementationCandidateId, 'signature-normalized-v1');
    assert.equal(hashRecord(loaded.packageIdentity.selectionLock), beforeLock);
    assert.equal(JSON.stringify([...loaded.unitsById]), beforeUnits);
    const after = await runPipeline(input, loaded);
    assert.deepEqual(after.outcome, before.outcome);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
});

test('append-only lifecycle chain binds exact Unit digest and dependency closure', async () => {
  const loaded = await loadedPromise;
  const unitPaths = new Map(loaded.closureManifest.units.map((item) => [item.id, item.path]));
  assert.equal(validateLifecycleRecords(loaded.packageIdentity, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, loaded.packageIdentity.selectionLockSha256), true);

  const missingValidation = structuredClone(loaded.packageIdentity);
  missingValidation.lifecycleRecords = missingValidation.lifecycleRecords.filter((record) => record.transition !== 'VALIDATED');
  assert.throws(() => validateLifecycleRecords(missingValidation, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, loaded.packageIdentity.selectionLockSha256), hasCode('INCOMPLETE_LIFECYCLE_CHAIN'));

  const unauthorized = structuredClone(loaded.packageIdentity);
  unauthorized.lifecycleRecords.find((record) => record.transition === 'PROMOTED').actor.authorityRef = '';
  assert.throws(() => validateLifecycleRecords(unauthorized, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, loaded.packageIdentity.selectionLockSha256), hasCode('LIFECYCLE_RECORD_DIGEST_MISMATCH'));

  const stale = structuredClone(loaded.packageIdentity);
  stale.lifecycleRecords[0].dependencyClosureDigest = '0'.repeat(64);
  assert.throws(() => validateLifecycleRecords(stale, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, loaded.packageIdentity.selectionLockSha256), hasCode('LIFECYCLE_RECORD_DIGEST_MISMATCH'));

  const unpromoted = structuredClone(loaded.packageIdentity);
  unpromoted.selectionLock.selectedAssets.find((asset) => asset.kind === 'unit').promotionRecordId = 'missing-promotion';
  refreshLock(unpromoted);
  assert.throws(() => validateLifecycleRecords(unpromoted, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, unpromoted.selectionLockSha256), hasCode('PACKAGE_PROMOTION_PIN_MISMATCH'));
});

test('serialized lifecycle histories replay dispositions, revalidation and exact rollback selection', async () => {
  const loaded = await loadedPromise;
  const records = loaded.packageIdentity.lifecycleRecords.filter((record) => record.subject.id === 'xdownload.player.recognizer');
  const [candidate, validation, promotion] = structuredClone(records);
  const successorDocument = JSON.parse(candidate.subjectJson);
  successorDocument.revision = '2.0.0';
  const successorBytes = JSON.stringify(successorDocument);
  const successorDigest = createHash('sha256').update(successorBytes).digest('hex');
  const resources = new Map(loaded.resources);
  resources.set('synthetic/successor-unit.json', successorDigest);
  const successor = makeSuccessorHistory(records, successorDigest, successorBytes);
  const digest = loaded.packageIdentity.resourceClosureSha256;
  const key = JSON.stringify([candidate.subject.kind, candidate.subject.id, candidate.subject.revision, candidate.subject.sha256]);
  for (const transition of ['REJECTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED']) {
    const end = { recordId: 'test.' + transition, transition, subject: candidate.subject, subjectPath: candidate.subjectPath, subjectJson: candidate.subjectJson, dependencyClosureDigest: digest, previousRecordId: promotion.recordId, previousRecordDigest: promotion.recordDigest, actor: promotion.actor, policy: promotion.promotion.policy, evidenceRefs: candidate.evidenceRefs, recordedAt: promotion.recordedAt, decision: transition };
    const prefix = transition === 'SUPERSEDED' ? [...records, ...successor] : records;
    if (transition === 'SUPERSEDED') end.successor = { subject: successor[2].subject, promotionRecordId: successor[2].recordId, promotionRecordDigest: successor[2].recordDigest };
    refreshRecord(end);
    assert.equal(replayLifecycle([...prefix, end], resources, digest).get(key).state, transition);
    const identity = structuredClone(loaded.packageIdentity);
    if (transition === 'SUPERSEDED') identity.lifecycleRecords.push(...successor);
    identity.lifecycleRecords.push(end);
    const paths = new Map(loaded.closureManifest.units.map((item) => [item.id, item.path]));
    assert.throws(() => validateLifecycleRecords(identity, loaded.unitsById, paths, resources, digest, identity.selectionLockSha256), hasCode('INCOMPLETE_LIFECYCLE_CHAIN'));
    const invalidRevival = { ...structuredClone(validation), recordId: 'revive.' + transition, previousRecordId: end.recordId, previousRecordDigest: end.recordDigest };
    refreshRecord(invalidRevival);
    assert.throws(() => replayLifecycle([...prefix, end, invalidRevival], resources, digest), hasCode('INCOMPLETE_LIFECYCLE_CHAIN'));
  }
  const again = { ...structuredClone(validation), recordId: 'test.revalidation', previousRecordId: promotion.recordId, previousRecordDigest: promotion.recordDigest };
  refreshRecord(again);
  assert.equal(replayLifecycle([...records, again], loaded.resources, digest).get(key).state, 'VALIDATED');
  const repromote = { ...structuredClone(promotion), recordId: 'test.repromotion', previousRecordId: again.recordId, previousRecordDigest: again.recordDigest };
  Object.assign(repromote.promotion, { validationRecordId: again.recordId, validationRecordDigest: again.recordDigest, priorPromotedBaseline: { kind: 'PROMOTED', recordId: promotion.recordId, recordDigest: promotion.recordDigest } });
  refreshRecord(repromote);
  assert.equal(replayLifecycle([...records, again, repromote], loaded.resources, digest).get(key).promoted.recordId, repromote.recordId);
  const twoRevisions = replayLifecycle([...records, ...successor], resources, digest);
  assert.equal(twoRevisions.get(key).state, 'PROMOTED');
  assert.equal(twoRevisions.get(JSON.stringify(['unit', candidate.subject.id, '2.0.0', successorDigest])).state, 'PROMOTED');
  const rollbackValidation = { ...structuredClone(validation), recordId: 'test.rollback.validation', previousRecordId: promotion.recordId, previousRecordDigest: promotion.recordDigest };
  refreshRecord(rollbackValidation);
  const rollbackPromotion = { ...structuredClone(promotion), recordId: 'test.rollback.promotion', previousRecordId: rollbackValidation.recordId, previousRecordDigest: rollbackValidation.recordDigest };
  Object.assign(rollbackPromotion.promotion, { validationRecordId: rollbackValidation.recordId, validationRecordDigest: rollbackValidation.recordDigest, priorPromotedBaseline: { kind: 'PROMOTED', recordId: successor[2].recordId, recordDigest: successor[2].recordDigest } });
  refreshRecord(rollbackPromotion);
  assert.equal(replayLifecycle([...records, ...successor, rollbackValidation, rollbackPromotion], resources, digest).get(key).promoted.recordId, rollbackPromotion.recordId);
  const wrongRollback = structuredClone(rollbackPromotion);
  wrongRollback.promotion.priorPromotedBaseline = { kind: 'PROMOTED', recordId: promotion.recordId, recordDigest: promotion.recordDigest };
  refreshRecord(wrongRollback);
  assert.throws(() => replayLifecycle([...records, ...successor, rollbackValidation, wrongRollback], resources, digest), hasCode('UNAUTHORIZED_PROMOTION_RECORD'));
  const falseGenesis = structuredClone(successor);
  falseGenesis[2].promotion.priorPromotedBaseline = { kind: 'GENESIS', reason: 'incorrect' };
  refreshRecord(falseGenesis[2]);
  assert.throws(() => replayLifecycle([...records, ...falseGenesis], resources, digest), hasCode('UNAUTHORIZED_PROMOTION_RECORD'));
  const other = loaded.packageIdentity.lifecycleRecords.filter((record) => record.subject.id === 'xdownload.player.route-decision');
  assert.equal(replayLifecycle([...records, endForTest(promotion, candidate, digest), ...other], loaded.resources, digest).get(JSON.stringify(['unit', other[0].subject.id, other[0].subject.revision, other[0].subject.sha256])).state, 'PROMOTED');
  const badBaseline = structuredClone(other.slice(0, 2));
  badBaseline[1].validation.baseline = { id: 'missing', path: 'missing/never.json', sha256: '0'.repeat(64) };
  badBaseline[1].validation.report.baseline = structuredClone(badBaseline[1].validation.baseline);
  badBaseline[1].validation.reportSha256 = hashRecord(badBaseline[1].validation.report);
  refreshRecord(badBaseline[1]);
  assert.throws(() => replayLifecycle(badBaseline, loaded.resources, digest), hasCode('INVALID_LIFECYCLE_VALIDATION'));
  const earlySuccessor = structuredClone(successor);
  for (let index = 0; index < earlySuccessor.length; index += 1) {
    earlySuccessor[index].recordedAt = '2020-01-01T00:00:00Z';
    if (index) earlySuccessor[index].previousRecordDigest = earlySuccessor[index - 1].recordDigest;
    if (index === 2) earlySuccessor[index].promotion.validationRecordDigest = earlySuccessor[1].recordDigest;
    if (index === 1) {
      earlySuccessor[index].validation.report.validatedAt = earlySuccessor[index].recordedAt;
      earlySuccessor[index].validation.reportSha256 = hashRecord(earlySuccessor[index].validation.report);
    }
    refreshRecord(earlySuccessor[index]);
  }
  assert.throws(() => replayLifecycle([...records, ...earlySuccessor], resources, digest), hasCode('UNAUTHORIZED_PROMOTION_RECORD'));
  const futureReport = structuredClone(records.slice(0, 2));
  futureReport[1].validation.report.validatedAt = '2036-01-01T00:00:00Z';
  futureReport[1].validation.reportSha256 = hashRecord(futureReport[1].validation.report);
  refreshRecord(futureReport[1]);
  assert.throws(() => replayLifecycle(futureReport, resources, digest), hasCode('INVALID_VALIDATION_REPORT'));
  const malformedNumber = structuredClone(records[1]);
  malformedNumber.validation.coverage.positive = 4.5;
  assert.throws(() => replayLifecycle([records[0], malformedNumber], resources, digest), hasCode('UNSUPPORTED_CANONICAL_NUMBER'));
});

test('independent lifecycle negative vectors remain rejected after record hashes are recomputed', async () => {
  const loaded = await loadedPromise;
  const original = loaded.packageIdentity.lifecycleRecords.filter((record) => record.subject.id === 'xdownload.player.recognizer');
  const vectors = [
    ['validation without candidate', (h) => h.shift()],
    ['promotion without validation', (h) => h.splice(1, 1)],
    ['candidate wrong subject', (h) => { h[0].subject.sha256 = '0'.repeat(64); }],
    ['stale closure', (h) => { h[1].dependencyClosureDigest = '0'.repeat(64); }],
    ['self promotion', (h) => { h[2].actor.id = h[0].actor.id; }],
    ['missing candidate actor', (h) => { h[0].actor = {}; }],
    ['missing validation policy', (h) => { h[1].policy = {}; }],
    ['unknown transition', (h) => { h[1].transition = 'SELECTED'; }],
    ['duplicate id', (h) => { h[1].recordId = h[0].recordId; }],
    ['stale report digest', (h) => { h[1].validation.reportSha256 = '0'.repeat(64); }],
    ['unknown report schema', (h) => { h[1].validation.reportSchema = 'unknown'; }],
    ['missing authorization', (h) => { delete h[2].promotion.authorizationEvidence; }],
    ['incorrect authorization digest', (h) => { h[2].promotion.authorizationEvidenceSha256 = '0'.repeat(64); }],
    ['missing promotion baseline', (h) => { delete h[2].promotion.priorPromotedBaseline; }],
    ['missing candidate evidence', (h) => { h[0].evidenceRefs = []; }],
    ['invalid validation evidence', (h) => { h[1].validation.evidenceRefs[0].sha256 = '0'.repeat(64); }],
    ['missing authority', (h) => { h[2].actor.authorityRef = ''; }],
    ['invalid timestamp', (h) => { h[1].recordedAt = 'not-a-timestamp'; }],
    ['invalid subject revision', (h) => { h[0].subject.revision = 'not-semver'; }],
    ['subject absent from closure', (h) => { h[0].subjectPath = 'synthetic/not-present.json'; }],
    ['subject identity does not match resource bytes', (h) => { h[0].subject.id = 'synthetic.impostor'; }],
    ['subject bytes do not match digest', (h) => { h[0].subjectJson += ' '; }],
    ['validator authority missing', (h) => { delete h[1].actor.authorityRef; }],
    ['subject validation profile mismatch', (h) => { h[1].validation.profile.id = 'unrelated-profile'; h[1].validation.report.profile.id = 'unrelated-profile'; h[1].validation.reportSha256 = hashRecord(h[1].validation.report); }],
    ['promotion exceeds grant scope', (h) => { h[2].promotion.scope = 'PRODUCTION_GLOBAL'; }],
    ['promotion rationale missing', (h) => { delete h[2].promotion.rationale; }],
    ['promotion limitations missing', (h) => { delete h[2].promotion.limitations; }],
    ['coverage disagrees with scenarios', (h) => { h[1].validation.coverage.positive += 1; h[1].validation.report.coverage.positive += 1; h[1].validation.reportSha256 = hashRecord(h[1].validation.report); }],
    ['scenario case omitted', (h) => { h[1].validation.report.tests.pop(); h[1].validation.reportSha256 = hashRecord(h[1].validation.report); }],
    ['failed scenario cannot be reported as PASS', (h) => { h[1].validation.report.tests[0].result = 'FAIL'; h[1].validation.report.scenarios[0].result = 'FAIL'; h[1].validation.reportSha256 = hashRecord(h[1].validation.report); }],
  ];
  for (const [label, mutate] of vectors) {
    const history = structuredClone(original);
    mutate(history);
    for (let i = 0; i < history.length; i += 1) {
      const record = history[i], previous = history[i - 1];
      if (previous) {
        record.previousRecordId = previous.recordId;
        record.previousRecordDigest = previous.recordDigest;
      }
      if (record.transition === 'PROMOTED' && previous?.transition === 'VALIDATED') {
        record.promotion.validationRecordId = previous.recordId;
        record.promotion.validationRecordDigest = previous.recordDigest;
      }
      refreshRecord(record);
    }
    assert.throws(() => replayLifecycle(history, loaded.resources, loaded.packageIdentity.resourceClosureSha256), undefined, label);
  }
});

test('knowledge and package candidates require exact closed subject resources', async () => {
  const loaded = await loadedPromise;
  const candidate = loaded.packageIdentity.lifecycleRecords.find((record) => record.transition === 'CANDIDATE');
  for (const kind of ['knowledge', 'package']) {
    const content = JSON.stringify({ id: 'synthetic.' + kind, revision: '1.0.0' });
    const digest = createHash('sha256').update(content).digest('hex');
    const resources = new Map(loaded.resources);
    const path = 'synthetic/' + kind + '.json';
    resources.set(path, digest);
    const record = { ...structuredClone(candidate), recordId: 'synthetic.' + kind, subject: { kind, id: 'synthetic.' + kind, revision: '1.0.0', sha256: digest }, subjectPath: path, subjectJson: content };
    refreshRecord(record);
    assert.equal(replayLifecycle([record], resources, loaded.packageIdentity.resourceClosureSha256).values().next().value.state, 'CANDIDATE');
    resources.delete(path);
    assert.throws(() => replayLifecycle([record], resources, loaded.packageIdentity.resourceClosureSha256), hasCode('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH'));
  }
});

test('non-JSON knowledge and package bytes support complete governed lifecycles', async () => {
  const loaded = await loadedPromise;
  const original = loaded.packageIdentity.lifecycleRecords.filter((record) => record.subject.id === 'xdownload.player.recognizer');
  for (const [kind, bytes] of [['knowledge', Buffer.from('# Reference knowledge\nText remains files-first.\n')], ['package', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff])]]) {
    const digest = createHash('sha256').update(bytes).digest('hex'), path = 'synthetic/' + kind + '.asset';
    const resources = new Map(loaded.resources);
    resources.set(path, digest);
    const binding = JSON.stringify([kind, 'synthetic.' + kind, '1.0.0', digest, path, loaded.packageIdentity.resourceClosureSha256]);
    const bindings = new Set([binding]);
    const records = structuredClone(original);
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      record.recordId = 'binary.' + kind + '.' + record.transition;
      record.subject = { kind, id: 'synthetic.' + kind, revision: '1.0.0', sha256: digest };
      record.subjectPath = path;
      delete record.subjectJson;
      record.subjectBase64 = bytes.toString('base64');
      if (index) { record.previousRecordId = records[index - 1].recordId; record.previousRecordDigest = records[index - 1].recordDigest; }
      if (record.transition === 'VALIDATED') {
        record.validation.subjectDigest = digest;
        record.validation.report.subject = structuredClone(record.subject);
        record.validation.reportSha256 = hashRecord(record.validation.report);
      }
      if (record.transition === 'PROMOTED') {
        record.promotion.validationRecordId = records[index - 1].recordId;
        record.promotion.validationRecordDigest = records[index - 1].recordDigest;
      }
      refreshRecord(record);
    }
    assert.equal(replayLifecycle(records, resources, loaded.packageIdentity.resourceClosureSha256, new Map(), bindings).values().next().value.state, 'PROMOTED');
    assert.throws(() => replayLifecycle(records, resources, loaded.packageIdentity.resourceClosureSha256), hasCode('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH'));
    const identity = structuredClone(loaded.packageIdentity);
    identity.lifecycleRecords.push(...records);
    identity.selectionLock.subjectBindings = [{ kind, id: 'synthetic.' + kind, revision: '1.0.0', sha256: digest, path, closureDigest: loaded.packageIdentity.resourceClosureSha256 }];
    refreshLock(identity);
    const paths = new Map(loaded.closureManifest.units.map((entry) => [entry.id, entry.path]));
    assert.equal(validateLifecycleRecords(identity, loaded.unitsById, paths, resources, loaded.packageIdentity.resourceClosureSha256, identity.selectionLockSha256), true);
    const tampered = structuredClone(records[0]);
    tampered.subjectBase64 = Buffer.from('wrong').toString('base64');
    refreshRecord(tampered);
    assert.throws(() => replayLifecycle([tampered], resources, loaded.packageIdentity.resourceClosureSha256, new Map(), bindings), hasCode('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH'));
    const forged = structuredClone(records[0]);
    forged.subject.id = 'forged.other.identity';
    forged.subject.revision = '99.0.0';
    refreshRecord(forged);
    assert.throws(() => replayLifecycle([forged], resources, loaded.packageIdentity.resourceClosureSha256, new Map(), bindings), hasCode('LIFECYCLE_SUBJECT_OR_CLOSURE_MISMATCH'));
  }
});

test('validation findings and counterexamples remain proposals without granting promotion', async () => {
  const loaded = await loadedPromise;
  const history = structuredClone(loaded.packageIdentity.lifecycleRecords.filter((record) => record.subject.id === 'xdownload.player.recognizer').slice(0, 2));
  const report = history[1].validation.report;
  report.findings = [{ id: 'synthetic-finding', severity: 'P2', description: 'simulator observation', resolution: 'review before production' }];
  report.counterexamples = ['synthetic counterexample'];
  history[1].validation.reportSha256 = hashRecord(report);
  refreshRecord(history[1]);
  const replay = replayLifecycle(history, loaded.resources, loaded.packageIdentity.resourceClosureSha256);
  const key = JSON.stringify([history[0].subject.kind, history[0].subject.id, history[0].subject.revision, history[0].subject.sha256]);
  assert.equal(replay.get(key).state, 'VALIDATED');
  assert.equal(replay.get(key).promoted, null);
  assert.equal(replay.get(key).validated.validation.report.counterexamples[0], 'synthetic counterexample');
  assert.equal(replay.get(key).validated.validation.report.findings[0].id, 'synthetic-finding');
});

test('observation stays an evidenced occurrence until a candidate is explicitly produced', async () => {
  const loaded = await loadedPromise;
  const [candidate] = structuredClone(loaded.packageIdentity.lifecycleRecords.filter((record) => record.subject.id === 'xdownload.player.recognizer'));
  const observation = { recordId: 'synthetic.observation', transition: 'OBSERVED', subject: candidate.subject, subjectPath: candidate.subjectPath, subjectJson: candidate.subjectJson, dependencyClosureDigest: candidate.dependencyClosureDigest, previousRecordId: null, previousRecordDigest: null, actor: { id: 'xdownload-demo-observer', role: 'observation-source', authorityRef: candidate.actor.authorityRef }, policy: { id: 'xdownload-demo/observation-policy', revision: '1.0.0' }, evidenceRefs: candidate.evidenceRefs, recordedAt: candidate.recordedAt, provenance: 'MODEL_INFERRED' };
  refreshRecord(observation);
  const observed = replayLifecycle([observation], loaded.resources, candidate.dependencyClosureDigest);
  const key = JSON.stringify([candidate.subject.kind, candidate.subject.id, candidate.subject.revision, candidate.subject.sha256]);
  assert.equal(observed.get(key).state, 'OBSERVED');
  candidate.previousRecordId = observation.recordId;
  candidate.previousRecordDigest = observation.recordDigest;
  refreshRecord(candidate);
  assert.equal(replayLifecycle([observation, candidate], loaded.resources, candidate.dependencyClosureDigest).get(key).state, 'CANDIDATE');
  const bad = structuredClone(observation);
  bad.provenance = 'PROMOTED_FACT';
  refreshRecord(bad);
  assert.throws(() => replayLifecycle([bad], loaded.resources, candidate.dependencyClosureDigest), hasCode('INVALID_LIFECYCLE_ACTOR_OR_POLICY'));
});

test('historical closure remains auditable while a changed closure requires fresh validation', async () => {
  const loaded = await loadedPromise;
  const identity = structuredClone(loaded.packageIdentity);
  const paths = new Map(loaded.closureManifest.units.map((entry) => [entry.id, entry.path]));
  const historicalManifest = structuredClone(loaded.closureManifest);
  const oldFixtureDigest = createHash('sha256').update('historical-signature-fixture').digest('hex');
  historicalManifest.resources.find((entry) => entry.path === 'fixtures/player-signatures.json').sha256 = oldFixtureDigest;
  const manifestJson = JSON.stringify(historicalManifest);
  const oldDigest = createHash('sha256').update(manifestJson).digest('hex');
  identity.selectionLock.historicalClosures = [{ sha256: oldDigest, manifestJson, resourceBase64: { 'fixtures/player-signatures.json': Buffer.from('historical-signature-fixture').toString('base64') } }];
  const history = identity.lifecycleRecords.filter((record) => record.subject.id === 'xdownload.player.recognizer');
  for (const record of history) {
    record.dependencyClosureDigest = oldDigest;
    if (record.transition === 'CANDIDATE') record.evidenceRefs.find((item) => item.path === 'fixtures/player-signatures.json').sha256 = oldFixtureDigest;
    if (record.transition === 'VALIDATED') {
      record.validation.dependencyClosureDigest = oldDigest;
      record.validation.baseline.sha256 = oldFixtureDigest;
      record.validation.evidenceRefs.find((item) => item.path === 'fixtures/player-signatures.json').sha256 = oldFixtureDigest;
      record.validation.report.dependencyClosure.sha256 = oldDigest;
      record.validation.report.dependencyClosure.resources = structuredClone(record.validation.evidenceRefs);
      record.validation.report.baseline = structuredClone(record.validation.baseline);
      record.validation.reportSha256 = hashRecord(record.validation.report);
    }
  }
  refreshChain(identity, 'xdownload.player.recognizer');
  assert.throws(() => validateLifecycleRecords(identity, loaded.unitsById, paths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, identity.selectionLockSha256), hasCode('INVALID_LIFECYCLE_VALIDATION'));
  const oldPromotion = history.find((record) => record.transition === 'PROMOTED');
  const nextValidation = structuredClone(history.find((record) => record.transition === 'VALIDATED'));
  nextValidation.recordId = 'synthetic.current.validation';
  nextValidation.previousRecordId = oldPromotion.recordId;
  nextValidation.previousRecordDigest = oldPromotion.recordDigest;
  nextValidation.dependencyClosureDigest = loaded.packageIdentity.resourceClosureSha256;
  nextValidation.validation.dependencyClosureDigest = loaded.packageIdentity.resourceClosureSha256;
  nextValidation.validation.baseline.sha256 = loaded.resources.get('fixtures/player-signatures.json');
  nextValidation.validation.evidenceRefs.find((item) => item.path === 'fixtures/player-signatures.json').sha256 = loaded.resources.get('fixtures/player-signatures.json');
  nextValidation.validation.report.dependencyClosure.sha256 = loaded.packageIdentity.resourceClosureSha256;
  nextValidation.validation.report.dependencyClosure.resources = structuredClone(nextValidation.validation.evidenceRefs);
  nextValidation.validation.report.baseline = structuredClone(nextValidation.validation.baseline);
  nextValidation.validation.reportSha256 = hashRecord(nextValidation.validation.report);
  refreshRecord(nextValidation);
  const nextPromotion = structuredClone(oldPromotion);
  nextPromotion.recordId = 'synthetic.current.promotion';
  nextPromotion.previousRecordId = nextValidation.recordId;
  nextPromotion.previousRecordDigest = nextValidation.recordDigest;
  nextPromotion.dependencyClosureDigest = loaded.packageIdentity.resourceClosureSha256;
  Object.assign(nextPromotion.promotion, { validationRecordId: nextValidation.recordId, validationRecordDigest: nextValidation.recordDigest, priorPromotedBaseline: { kind: 'PROMOTED', recordId: oldPromotion.recordId, recordDigest: oldPromotion.recordDigest } });
  refreshRecord(nextPromotion);
  identity.lifecycleRecords.push(nextValidation, nextPromotion);
  for (const entry of [identity.selectionLock.selectedAssets.find((item) => item.id === 'xdownload.player.recognizer'), identity.selectionLock.selectedCapabilities[0]]) {
    Object.assign(entry, { validationRecordId: nextValidation.recordId, validationRecordDigest: nextValidation.recordDigest, promotionRecordId: nextPromotion.recordId, promotionRecordDigest: nextPromotion.recordDigest });
  }
  refreshLock(identity);
  assert.equal(validateLifecycleRecords(identity, loaded.unitsById, paths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, identity.selectionLockSha256), true);
  const missingHistoricalBytes = structuredClone(identity);
  delete missingHistoricalBytes.selectionLock.historicalClosures[0].resourceBase64['fixtures/player-signatures.json'];
  refreshLock(missingHistoricalBytes);
  assert.throws(() => validateLifecycleRecords(missingHistoricalBytes, loaded.unitsById, paths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, missingHistoricalBytes.selectionLockSha256), hasCode('INVALID_HISTORICAL_CLOSURE'));
  const wrongClosure = structuredClone(identity);
  const wrongPromotion = wrongClosure.lifecycleRecords.find((item) => item.recordId === nextPromotion.recordId);
  wrongPromotion.dependencyClosureDigest = oldDigest;
  refreshRecord(wrongPromotion);
  for (const entry of [wrongClosure.selectionLock.selectedAssets.find((item) => item.id === 'xdownload.player.recognizer'), wrongClosure.selectionLock.selectedCapabilities[0]]) entry.promotionRecordDigest = wrongPromotion.recordDigest;
  refreshLock(wrongClosure);
  assert.throws(() => validateLifecycleRecords(wrongClosure, loaded.unitsById, paths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, wrongClosure.selectionLockSha256), hasCode('UNAUTHORIZED_PROMOTION_RECORD'));
  identity.selectionLock.historicalClosures[0].manifestJson += ' ';
  refreshLock(identity);
  assert.throws(() => validateLifecycleRecords(identity, loaded.unitsById, paths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, identity.selectionLockSha256), hasCode('INVALID_HISTORICAL_CLOSURE'));
  assert.equal(loaded.packageIdentity.selectionLock.historicalClosures, undefined);
});

function endForTest(promotion, candidate, digest) {
  const end = { recordId: 'test.withdrawn', transition: 'WITHDRAWN', subject: candidate.subject, subjectPath: candidate.subjectPath, subjectJson: candidate.subjectJson, dependencyClosureDigest: digest, previousRecordId: promotion.recordId, previousRecordDigest: promotion.recordDigest, actor: promotion.actor, policy: promotion.promotion.policy, evidenceRefs: candidate.evidenceRefs, recordedAt: promotion.recordedAt, decision: 'WITHDRAWN' };
  refreshRecord(end);
  return end;
}

test('Package locks bind all executed assets, profile and independent promotion authority', async () => {
  const loaded = await loadedPromise;
  const unitPaths = new Map(loaded.closureManifest.units.map((item) => [item.id, item.path]));
  const verify = (identity, expected = identity.selectionLockSha256) => validateLifecycleRecords(identity, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, expected);
  const missing = structuredClone(loaded.packageIdentity);
  missing.selectionLock.selectedAssets = missing.selectionLock.selectedAssets.filter((asset) => asset.id !== 'xdownload.player.route-decision');
  refreshLock(missing);
  assert.throws(() => verify(missing), hasCode('PACKAGE_SELECTION_CARDINALITY_INVALID'));
  const profile = structuredClone(loaded.packageIdentity);
  profile.selectionLock.consumerProfile.revision = '9.9.9';
  refreshLock(profile);
  assert.throws(() => verify(profile), hasCode('PACKAGE_CONSUMER_PROFILE_OR_TARGET_MISMATCH'));
  const unauthorized = structuredClone(loaded.packageIdentity);
  const promotion = unauthorized.lifecycleRecords.find((record) => record.transition === 'PROMOTED');
  promotion.actor.id = unauthorized.lifecycleRecords.find((record) => record.transition === 'CANDIDATE').actor.id;
  refreshRecord(promotion);
  assert.throws(() => verify(unauthorized), hasCode('UNAUTHORIZED_PROMOTION_RECORD'));
  const altered = structuredClone(loaded.packageIdentity);
  altered.selectionLock.consumerProfile.revision = '9.9.9';
  assert.throws(() => verify(altered), hasCode('PACKAGE_SELECTION_DIGEST_MISMATCH'));
  refreshLock(altered);
  assert.throws(() => verify(altered, loaded.packageIdentity.selectionLockSha256), hasCode('PACKAGE_SELECTION_DIGEST_MISMATCH'));
  await assert.rejects(() => loadDemo(), hasCode('EXTERNAL_SELECTION_PIN_MISMATCH'));
  await assert.rejects(() => loadDemo({ expectedSelectionLockSha256: '0'.repeat(64) }), hasCode('EXTERNAL_SELECTION_PIN_MISMATCH'));
});

test('fixture-only evidence cannot support a rehashed validation and promotion chain', async () => {
  const loaded = await loadedPromise;
  const identity = structuredClone(loaded.packageIdentity);
  const unitPaths = new Map(loaded.closureManifest.units.map((item) => [item.id, item.path]));
  const validated = identity.lifecycleRecords.find((record) => record.transition === 'VALIDATED');
  const promoted = identity.lifecycleRecords.find((record) => record.transition === 'PROMOTED');
  validated.validation.evidenceRefs = validated.validation.evidenceRefs.filter((item) => item.path === 'fixtures/player-signatures.json');
  validated.validation.report.dependencyClosure.resources = structuredClone(validated.validation.evidenceRefs);
  validated.validation.reportSha256 = hashRecord(validated.validation.report);
  refreshRecord(validated);
  promoted.previousRecordDigest = validated.recordDigest;
  promoted.promotion.validationRecordDigest = validated.recordDigest;
  refreshRecord(promoted);
  const selected = identity.selectionLock.selectedAssets.find((asset) => asset.kind === 'unit' && asset.id === validated.subject.id);
  const capability = identity.selectionLock.selectedCapabilities[0];
  for (const item of [selected, capability]) {
    item.validationRecordDigest = validated.recordDigest;
    item.promotionRecordDigest = promoted.recordDigest;
  }
  refreshLock(identity);
  assert.throws(() => validateLifecycleRecords(identity, loaded.unitsById, unitPaths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, identity.selectionLockSha256), hasCode('VALIDATION_EVIDENCE_INCOMPLETE'));
});

test('recomputed lifecycle records still require coverage and every Candidate authority', async () => {
  const loaded = await loadedPromise;
  const paths = new Map(loaded.closureManifest.units.map((item) => [item.id, item.path]));
  const verify = (identity) => validateLifecycleRecords(identity, loaded.unitsById, paths, loaded.resources, loaded.packageIdentity.resourceClosureSha256, identity.selectionLockSha256);
  const noCoverage = structuredClone(loaded.packageIdentity);
  const validated = noCoverage.lifecycleRecords.find((record) => record.subject.id === 'xdownload.player.recognizer' && record.transition === 'VALIDATED');
  Object.assign(validated.validation.coverage, { positive: 0, negative: 0, boundary: 0 });
  validated.validation.report.coverage = structuredClone(validated.validation.coverage);
  validated.validation.reportSha256 = hashRecord(validated.validation.report);
  refreshChain(noCoverage, 'xdownload.player.recognizer');
  assert.throws(() => verify(noCoverage), hasCode('INVALID_VALIDATION_REPORT'));
  const noCandidate = structuredClone(loaded.packageIdentity);
  const candidate = noCandidate.lifecycleRecords.find((record) => record.subject.id === 'xdownload.player.route-decision' && record.transition === 'CANDIDATE');
  candidate.actor = {};
  candidate.policy = {};
  candidate.evidenceRefs = [];
  refreshChain(noCandidate, 'xdownload.player.route-decision');
  assert.throws(() => verify(noCandidate), hasCode('INVALID_LIFECYCLE_ACTOR_OR_POLICY'));
});

test('post-load implementation changes cannot bypass the pinned provider', async () => {
  const loaded = await loadedPromise;
  const changedUnits = new Map([...loaded.unitsById].map(([id, unit]) => [id, structuredClone(unit)]));
  changedUnits.get('xdownload.player.recognizer').implementation.ref = 'registry:xdownload.player.recognizer-normalized@1.0.0';
  assert.equal((await runPipeline({ url: 'https://example.test/watch', signals: ['JWPLAYER'] }, { ...loaded, unitsById: changedUnits })).outcome.status, 'NEEDS_REVIEW');
  assert.equal(Object.isFrozen(handlers), true);
  assert.throws(() => { handlers['registry:xdownload.player.recognizer@1.0.0'] = handlers['registry:xdownload.player.recognizer-normalized@1.0.0']; }, TypeError);
  const unit = structuredClone(loaded.unitsById.get('xdownload.player.recognizer'));
  unit.failure.handling = {};
  assert.throws(() => validateUnit(unit), hasCode('INVALID_FAILURE_PROFILE'));
});

test('verified execution uses a private snapshot of graph, schemas, rules and catalogs', async () => {
  const loaded = await loadedPromise;
  const input = { url: 'https://example.test/watch', signals: ['jwplayer'] };
  const graph = structuredClone(loaded.graph);
  graph.entryNode = 'validate';
  const schemas = structuredClone(loaded.schemas);
  schemas.clear();
  const knowledge = structuredClone(loaded.knowledge);
  knowledge['xdownload.player-signatures'].patterns = [];
  const catalogs = structuredClone(loaded.catalogs);
  catalogs.strategies.strategies.jwplayer = 'unselected-strategy';
  const selectedProviders = structuredClone(loaded.selectedProviders);
  const packageIdentity = structuredClone(loaded.packageIdentity);
  packageIdentity.packageId = 'unselected-package';
  for (const change of [{ graph }, { schemas }, { knowledge }, { catalogs }, { packageIdentity }]) {
    const result = await runPipeline(input, { ...loaded, ...change });
    assert.equal(result.outcome.status, 'READY');
    assert.equal(result.outcome.strategyId, 'jwplayer.extract.v1');
    assert.equal(result.packageIdentity.packageId, loaded.packageIdentity.packageId);
  }
  await assert.rejects(() => runPipeline(input, { ...loaded, selectedProviders }), hasCode('SELECTED_RESOURCE_CHANGED'));
  const signatures = loaded.knowledge['xdownload.player-signatures'];
  const original = structuredClone(signatures);
  const patterns = signatures.patterns;
  Object.defineProperty(signatures, 'toJSON', { value: () => original, configurable: true });
  signatures.patterns = structuredClone(patterns);
  signatures.patterns[0].markers = ['JWPLAYER'];
  try {
    assert.equal((await runPipeline(input, loaded)).outcome.status, 'READY');
    assert.equal((await runPipeline({ url: input.url, signals: ['JWPLAYER'] }, loaded)).outcome.status, 'NEEDS_REVIEW');
  } finally {
    signatures.patterns = patterns;
    delete signatures.toJSON;
  }
  assert.equal((await runPipeline(input, loaded)).outcome.status, 'READY');
});
