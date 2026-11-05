import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const unitDir = path.join(root, "domain", "units");

export class DisExecutionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DisExecutionError";
    this.code = code;
  }
}

export function validateUnit(unit) {
  const required = ["schemaVersion", "id", "revision", "role", "purpose", "scope", "owner", "authority", "qualification", "evidence", "failure"];
  for (const key of required) if (!(key in unit)) throw new DisExecutionError("INVALID_UNIT", "missing " + key);
  if (unit.schemaVersion !== "dis.unit/0.1.0") throw new DisExecutionError("UNSUPPORTED_UNIT_SCHEMA", unit.schemaVersion);
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(unit.revision)) throw new DisExecutionError("INVALID_REVISION", unit.revision);
  if (!["knowledge", "recognizer", "decision", "procedure", "tool", "workflow", "validator"].includes(unit.role)) throw new DisExecutionError("INVALID_ROLE", unit.role);
  if (!unit.scope?.domain || !Array.isArray(unit.scope.appliesTo) || !Array.isArray(unit.scope.excludes)) throw new DisExecutionError("INVALID_SCOPE", unit.id);
  if (!["FROZEN", "CONTROLLED", "REFERENCE", "EXAMPLE", "DERIVED"].includes(unit.authority)) throw new DisExecutionError("INVALID_AUTHORITY", unit.id);
  if (!Array.isArray(unit.evidence?.sources) || !("absenceReason" in unit.evidence)) throw new DisExecutionError("INVALID_EVIDENCE", unit.id);
  const executable = ["recognizer", "decision", "procedure", "tool", "workflow", "validator"].includes(unit.role);
  if (executable && (!unit.input?.schemaRef || !unit.output?.schemaRef || !unit.implementation?.strategy)) throw new DisExecutionError("MISSING_EXECUTABLE_CONTRACT", unit.id);
  if (unit.role === "procedure" && unit.implementation.exposure !== "private") throw new DisExecutionError("PRIVATE_PROCEDURE_EXPOSURE_REQUIRED", unit.id);
  if (unit.role === "tool" && (unit.implementation.exposure !== "tool" || unit.implementation.strategy !== "tool-operation")) throw new DisExecutionError("INVALID_TOOL_EXPOSURE", unit.id);
  return true;
}

export function validateGraph(graph, unitsById) {
  if (graph.schemaVersion !== "dis.graph/0.1.0") throw new DisExecutionError("UNSUPPORTED_GRAPH_SCHEMA", graph.schemaVersion);
  const nodeIds = graph.nodes.map((node) => node.nodeId);
  if (new Set(nodeIds).size !== nodeIds.length) throw new DisExecutionError("DUPLICATE_NODE_ID", "node IDs must be unique");
  if (!nodeIds.includes(graph.entryNode)) throw new DisExecutionError("MISSING_ENTRY_NODE", graph.entryNode);
  for (const terminal of graph.terminalNodes) if (!nodeIds.includes(terminal)) throw new DisExecutionError("UNKNOWN_TERMINAL_NODE", terminal);
  for (const node of graph.nodes) {
    const unit = unitsById.get(node.unitRef.id);
    if (!unit || unit.revision !== node.unitRef.revision) throw new DisExecutionError("UNRESOLVED_EXACT_UNIT_REF", node.unitRef.id);
  }
  for (const edge of graph.edges) {
    if (!nodeIds.includes(edge.from) || !nodeIds.includes(edge.to)) throw new DisExecutionError("UNKNOWN_EDGE_NODE", edge.from + "->" + edge.to);
    if (edge.when && (!edge.when.path.startsWith("/") && edge.when.path !== "")) throw new DisExecutionError("INVALID_CONDITION_POINTER", edge.when.path);
  }
  const adjacency = new Map(nodeIds.map((id) => [id, []]));
  for (const edge of graph.edges) adjacency.get(edge.from).push(edge.to);
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new DisExecutionError("CONTROL_CYCLE", id);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of adjacency.get(id)) visit(next);
    visiting.delete(id);
    visited.add(id);
  }
  visit(graph.entryNode);
  if (visited.size !== nodeIds.length) throw new DisExecutionError("UNREACHABLE_NODE", nodeIds.filter((id) => !visited.has(id)).join(","));
  for (const nodeId of nodeIds) if (!graph.terminalNodes.includes(nodeId) && adjacency.get(nodeId).length === 0) throw new DisExecutionError("PATH_WITHOUT_TERMINAL", nodeId);
  return true;
}

function pointerGet(value, pointer) {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) throw new DisExecutionError("INVALID_JSON_POINTER", pointer);
  return pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~")).reduce((current, key) => current?.[key], value);
}

function pointerSet(target, pointer, value) {
  if (pointer === "") return value;
  if (!pointer.startsWith("/")) throw new DisExecutionError("INVALID_JSON_POINTER", pointer);
  const parts = pointer.slice(1).split("/").map((part) => part.replaceAll("~1", "/").replaceAll("~0", "~"));
  let current = target;
  for (const part of parts.slice(0, -1)) current = current[part] ??= {};
  current[parts.at(-1)] = value;
  return target;
}

function conditionMatches(output, condition) {
  if (!condition) return true;
  const actual = pointerGet(output, condition.path);
  if (condition.operator === "equals") return actual === condition.value;
  if (condition.operator === "notEquals") return actual !== condition.value;
  if (condition.operator === "exists") return actual !== undefined;
  throw new DisExecutionError("UNSUPPORTED_CONDITION_OPERATOR", condition.operator);
}

function mapOutput(output, map) {
  if (!map?.length) return output;
  let result = {};
  for (const binding of map) result = pointerSet(result, binding.to, pointerGet(output, binding.from));
  return result;
}

export function recognizePlayer(input) {
  if (!input || typeof input.url !== "string" || !/^https?:\/\//.test(input.url) || !Array.isArray(input.signals) || input.signals.some((item) => typeof item !== "string")) {
    throw new DisExecutionError("INVALID_INPUT", "PageObservation requires an http(s) url and string signals[]");
  }
  const haystack = (input.url + "\n" + input.signals.join("\n")).toLowerCase();
  const patterns = [
    { id: "jwplayer", markers: ["jwplayer"] },
    { id: "videojs", markers: ["videojs", "video.js"] },
    { id: "hlsjs", markers: ["hls.js", "hlsjs"] }
  ];
  const matches = patterns.flatMap((pattern) => {
    const marker = pattern.markers.find((candidate) => haystack.includes(candidate));
    return marker ? [{ playerId: pattern.id, marker }] : [];
  });
  const status = matches.length === 1 ? "recognized" : matches.length > 1 ? "ambiguous" : "unknown";
  const evidence = matches.length
    ? matches.map((match) => ({ sourceId: "page-observation", kind: "observation", ref: input.url, claim: "matched marker " + match.marker }))
    : [{ sourceId: "page-observation", kind: "observation", ref: input.url, claim: "no supported player marker found" }];
  return { status, candidates: matches.map((match) => match.playerId), evidence, sourceUrl: input.url };
}

export function routeRecognition(input) {
  const recognition = input?.recognition;
  if (!recognition || !["recognized", "ambiguous", "unknown"].includes(recognition.status)) throw new DisExecutionError("INVALID_INPUT", "route decision requires a recognition result");
  // Initial draft requires pass-through because one Edge carries both routing and data.
  return { route: recognition.status === "recognized" ? "KNOWN" : "REVIEW", recognition };
}

export function resolvePlayer(input) {
  const recognition = input?.recognition;
  if (recognition?.status !== "recognized" || recognition.candidates?.length !== 1) throw new DisExecutionError("INVALID_INPUT", "resolve procedure requires exactly one recognized candidate");
  const playerId = recognition.candidates[0];
  return { status: "READY", playerId, strategyId: playerId + ".extract.v1", evidence: recognition.evidence };
}

export function boundedFallback(input) {
  const recognition = input?.recognition;
  if (!recognition || !["ambiguous", "unknown"].includes(recognition.status)) throw new DisExecutionError("INVALID_INPUT", "fallback requires ambiguous or unknown recognition");
  return {
    status: recognition.status === "ambiguous" ? "NEEDS_INPUT" : "NEEDS_REVIEW",
    reason: recognition.status === "ambiguous" ? "multiple-player-candidates" : "no-supported-player-candidate",
    question: recognition.status === "ambiguous" ? "Which player is present on this page?" : null,
    evidence: recognition.evidence
  };
}

export function validateOutcome(input) {
  const resolution = input?.status ? input : input?.resolution;
  if (!resolution || !["READY", "NEEDS_INPUT", "NEEDS_REVIEW"].includes(resolution.status)) throw new DisExecutionError("INVALID_OUTCOME", "unsupported terminal outcome");
  if (!Array.isArray(resolution.evidence) || resolution.evidence.length === 0) throw new DisExecutionError("MISSING_EVIDENCE", "terminal outcome must retain evidence");
  if (resolution.status === "READY" && (!resolution.playerId || !resolution.strategyId)) throw new DisExecutionError("INCOMPLETE_READY_OUTCOME", "READY requires playerId and strategyId");
  return { ...resolution, evidenceCount: resolution.evidence.length };
}

export const handlers = {
  "xdownload.player.recognizer": recognizePlayer,
  "xdownload.player.route-decision": routeRecognition,
  "xdownload.player.resolve-procedure": resolvePlayer,
  "xdownload.player.bounded-fallback": boundedFallback,
  "xdownload.player.outcome-validator": validateOutcome
};

export async function loadDemo() {
  const unitFiles = await fs.readdir(unitDir);
  const units = await Promise.all(unitFiles.filter((name) => name.endsWith(".json")).map(async (name) => {
    const unit = JSON.parse(await fs.readFile(path.join(unitDir, name), "utf8"));
    validateUnit(unit);
    return unit;
  }));
  const graph = JSON.parse(await fs.readFile(path.join(root, "domain", "player-recognition.graph.json"), "utf8"));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  validateGraph(graph, unitsById);
  return { graph, unitsById };
}

export async function runPipeline(input, loaded) {
  const { graph, unitsById } = loaded;
  let nodeId = graph.entryNode;
  let nodeInput = input;
  const trace = [];
  for (let step = 0; step <= graph.nodes.length; step += 1) {
    const node = graph.nodes.find((item) => item.nodeId === nodeId);
    const unit = unitsById.get(node.unitRef.id);
    const handler = handlers[unit.id];
    if (!handler) throw new DisExecutionError("NO_IMPLEMENTATION", unit.id);
    const output = handler(nodeInput);
    trace.push({ nodeId, unitId: unit.id, output });
    if (graph.terminalNodes.includes(nodeId)) return { outcome: output, trace };
    const candidates = graph.edges.filter((edge) => edge.from === nodeId && conditionMatches(output, edge.when));
    if (candidates.length !== 1) throw new DisExecutionError("AMBIGUOUS_CONTROL_FLOW", nodeId + " selected " + candidates.length + " edges");
    const edge = candidates[0];
    nodeInput = mapOutput(output, edge.map);
    nodeId = edge.to;
  }
  throw new DisExecutionError("STEP_LIMIT_EXCEEDED", graph.id);
}
