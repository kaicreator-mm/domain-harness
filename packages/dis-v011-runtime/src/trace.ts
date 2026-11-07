import assert from 'node:assert/strict';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { canonicalDigest } from './knowledge.js';
import type { ObjectData, Selection } from './types.js';

interface Frame {
  nodeId: string;
  unitId: string;
  unitRevision: string;
  unitSha256: string;
  provider: string;
  input: ObjectData;
  evidence: ObjectData;
  output: ObjectData;
}
export interface DisResult {
  status: string;
  outcome: ObjectData | null;
  trace: Frame[];
  selectedDigest: string;
  selection: ObjectData;
}
export function readDisResult(receipt: ObjectData): DisResult {
  const admitted = receipt.admitted as { effects: { disposition: string; output: DisResult; effectType: string }[] };
  assert.equal(receipt.status, 'admitted', 'original Kernel receipt must be admitted');
  assert.equal(admitted.effects.length, 1);
  assert.equal(admitted.effects[0].effectType, 'effect:dis-read');
  assert.equal(admitted.effects[0].disposition, 'executed');
  return admitted.effects[0].output;
}

/** Offline conformance. Reconstructs executed wiring from selected data, not the evaluator. */
export function verifyTrace(actual: DisResult, observation: ObjectData, selection: Selection, schemas: ReadonlyMap<string, ObjectData>) {
  const graph = selection.graph;
  assert.equal(actual.selectedDigest, canonicalDigest(selection));
  assert.deepEqual(actual.selection, {
    packageId: selection.packageId, revision: selection.revision, closureSha256: selection.closureSha256,
    lockSha256: selection.lockSha256, graphId: graph.id, graphRevision: graph.revision, graphSha256: selection.graphSha256,
  });
  const ajv = new Ajv2020({ strict: false });
  ajv.addFormat('uri', /^[A-Za-z][A-Za-z0-9+.-]*:[!-~]+$/);
  for (const [name, schema] of schemas) ajv.addSchema(schema, name);
  const pointer = (value: ObjectData, expression: string) =>
    expression === '' ? value : value[expression.substring(1)];
  const verified = new Map<string, ObjectData>();
  let expectedNode = graph.entryNode;
  const normalized = typeof observation.url === 'string' ? { ...observation, url: observation.url.trim() } : observation;
  for (const frame of actual.trace) {
    assert.equal(frame.nodeId, expectedNode, 'trace control edge');
    assert.ok(!verified.has(frame.nodeId), 'trace cannot repeat a node');
    const node = graph.nodes.find((item) => item.nodeId === expectedNode);
    assert.ok(node);
    const unit = selection.units[node.unitRef.id];
    assert.deepEqual({ id: frame.unitId, revision: frame.unitRevision, sha256: frame.unitSha256 },
      { id: unit.id, revision: node.unitRef.revision, sha256: selection.unitRefs[unit.id].sha256 });
    assert.equal(frame.provider, selection.providers[unit.id]);
    const input: ObjectData = frame.nodeId === graph.entryNode ? { ...normalized } : {};
    const evidence: ObjectData = {};
    for (const edge of graph.edges) {
      if (edge.kind === 'control' || edge.to.node !== frame.nodeId || !verified.has(edge.from.node)) continue;
      const source = verified.get(edge.from.node)!;
      if (edge.kind === 'data') {
        const name = edge.to.pointer.slice(1);
        assert.ok(!Object.hasOwn(input, name), 'duplicate data producer');
        input[name] = pointer(source, edge.from.pointer);
      } else {
        assert.ok(!Object.hasOwn(evidence, edge.to.slot), 'duplicate evidence producer');
        evidence[edge.to.slot] = pointer(source, edge.from.pointer);
      }
    }
    assert.deepEqual(frame.input, input, 'trace data inputs');
    assert.deepEqual(frame.evidence, evidence, 'trace evidence slots');
    assert.ok(ajv.validate(unit.input.schemaRef, input), ajv.errorsText());
    assert.ok(ajv.validate(unit.output.schemaRef, frame.output), ajv.errorsText());
    if (unit.role === 'decision') assert.equal(frame.output.route, (input.recognition as ObjectData).status === 'recognized' ? 'KNOWN' : 'REVIEW');
    if (unit.role === 'procedure' && frame.nodeId === 'resolve-known') {
      const player = ((input.recognition as ObjectData).candidates as string[])[0];
      const strategy = selection.strategies.strategies[player];
      if (strategy) assert.deepEqual(frame.output, { status: 'READY', playerId: player, strategyId: strategy });
      else assert.equal(frame.output.status, 'NEEDS_REVIEW');
    }
    if (unit.role === 'validator') {
      const items = evidence.recognitionEvidence as unknown[];
      assert.deepEqual(frame.output, { ...(input.resolution as ObjectData), evidence: items, evidenceCount: items.length });
    }
    verified.set(frame.nodeId, frame.output);
    if (graph.terminalNodes.includes(frame.nodeId) || frame.output.status === 'out_of_scope') {
      expectedNode = '';
      continue;
    }
    const candidates = graph.edges.filter((edge) => edge.kind === 'control' && edge.from === frame.nodeId && (!edge.when ||
      edge.when.operator === 'equals' && pointer(frame.output, edge.when.path) === edge.when.value));
    assert.equal(candidates.length, 1);
    assert.ok(candidates[0].kind === 'control');
    expectedNode = candidates[0].to;
  }
  if (actual.trace.length === 0) {
    assert.ok(['FAILED','NEEDS_INPUT'].includes(actual.status));
    assert.equal(actual.outcome, null);
  } else {
    const terminal = actual.trace.at(-1)!;
    assert.equal(expectedNode, '', 'trace ended before an admitted terminal or scope rejection');
    if (terminal.output.status === 'out_of_scope') {
      assert.equal(actual.status, 'OUT_OF_SCOPE');
      assert.equal(actual.outcome, null);
    } else {
      assert.ok(graph.terminalNodes.includes(terminal.nodeId));
      assert.deepEqual(actual.outcome, terminal.output);
      const recognized = actual.trace[0].output.status === 'recognized';
      assert.equal(actual.status, recognized && terminal.output.status === 'NEEDS_REVIEW' ? 'PARTIAL' : terminal.output.status);
    }
  }
}
