import {
  canonicalizeJson,
  computeCanonicalJsonDigest,
  type Sha256Port,
} from '../contracts/identity.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import type { GovernanceBaselineBody } from '../governance/contracts.js';
import { sameGovernanceBaselineIdentity } from '../governance/identity.js';
import { GovernanceBaselineRegistry } from '../governance/registry.js';
import {
  CANDIDATE_BODY_SCHEMA_VERSION,
  CANDIDATE_ENVELOPE_SCHEMA_VERSION,
  CANDIDATE_KINDS,
  CANDIDATE_VALIDATOR_CONTRACT_VERSION,
  type CandidateBodySchemaArtifact,
  type CandidateBodySchemaNode,
  type CandidateContractAuthorityPort,
  type CandidateControlContract,
  type CandidateEnvelope,
  type CandidateExactReference,
  type CandidateKind,
  type CandidateRejection,
  type CandidateRejectionCode,
  type CandidateToolReference,
  type CandidateValidationAuthority,
  type CandidateValidationGovernanceBaseline,
  type CandidateValidationResult,
  type ReviewedCandidateValidationCompatibility,
  type ValidatedCandidateIdentity,
} from './contracts.js';

const TOP_LEVEL = [
  'applicability',
  'body',
  'bodyContract',
  'candidateId',
  'candidateKind',
  'capabilities',
  'control',
  'events',
  'hardInvariants',
  'io',
  'mutation',
  'references',
  'schemaVersion',
  'tools',
] as const;
const TOP_LEVEL_SET: ReadonlySet<string> = new Set(TOP_LEVEL);

const FORBIDDEN: ReadonlyArray<readonly [CandidateRejectionCode, ReadonlySet<string>]> = [
  ['ARBITRARY_CODE_FORBIDDEN', new Set(['code', 'eval', 'functionBody', 'moduleSource', 'script', 'sourceCode'])],
  ['PROVIDER_SECRET_OR_STATE_FORBIDDEN', new Set(['accessToken', 'apiKey', 'credentials', 'modelState', 'providerSecret', 'providerState', 'refreshToken'])],
  ['RUNTIME_OBJECT_FORBIDDEN', new Set(['actorRef', 'actorReference', 'machineRef', 'runtimeObject', 'xstateActor'])],
  ['PRIVATE_REASONING_FORBIDDEN', new Set(['chainOfThought', 'privateReasoning'])],
];

const MAX_SCHEMA_DEPTH = 16;
const MAX_SCHEMA_PROPERTIES = 128;
const MAX_SCHEMA_ENUM_VALUES = 256;
const MAX_SCHEMA_ARRAY_ITEMS = 1024;
const GOVERNANCE_COMPATIBILITY_KEY = 'candidateValidationCompatibilities';

const reject = (
  code: CandidateRejectionCode,
  path: string,
  message: string,
): CandidateRejection => ({ code, path, message });

const nonEmpty = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}

function jsonObject(value: JsonValue | undefined): JsonObject | undefined {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value;
}

function keysAre(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length
    && actual.every((key, index) => key === wanted[index]);
}

function keysOnly(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedSet = new Set(allowed);
  return Object.keys(value).every((key) => allowedSet.has(key));
}

function scan(value: unknown, path = '$', ancestors = new Set<object>()): CandidateRejection | undefined {
  if (typeof value === 'function') {
    return reject('ARBITRARY_CODE_FORBIDDEN', path, 'executable functions are forbidden Candidate material');
  }
  if (typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    return reject('NON_CANONICAL_CONTENT', path, `unsupported Candidate value type: ${typeof value}`);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? undefined
      : reject('NON_CANONICAL_CONTENT', path, 'Candidate numbers must be finite');
  }
  if (typeof value !== 'object') return undefined;
  if (ancestors.has(value)) {
    return reject('NON_CANONICAL_CONTENT', path, 'circular Candidate material is forbidden');
  }
  if (!Array.isArray(value) && !plain(value)) {
    return reject('RUNTIME_OBJECT_FORBIDDEN', path, 'runtime/class instances are forbidden Candidate material');
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    return reject('RUNTIME_OBJECT_FORBIDDEN', path, 'symbol-keyed runtime state is forbidden Candidate material');
  }

  ancestors.add(value);
  const entries: ReadonlyArray<readonly [string, unknown]> = Array.isArray(value)
    ? value.map((child, index) => [String(index), child] as const)
    : Object.entries(value);
  for (const [key, child] of entries) {
    const childPath = Array.isArray(value) ? `${path}[${key}]` : `${path}.${key}`;
    for (const [code, names] of FORBIDDEN) {
      if (names.has(key)) {
        ancestors.delete(value);
        return reject(code, childPath, `forbidden Candidate authority field: ${key}`);
      }
    }
    const nested = scan(child, childPath, ancestors);
    if (nested !== undefined) {
      ancestors.delete(value);
      return nested;
    }
  }
  ancestors.delete(value);
  return undefined;
}

function parseKind(value: JsonValue | undefined): CandidateKind | undefined {
  if (typeof value !== 'string') return undefined;
  for (const kind of CANDIDATE_KINDS) {
    if (value === kind) return kind;
  }
  return undefined;
}

function parseRef(value: JsonValue | undefined): CandidateExactReference | undefined {
  const object = jsonObject(value);
  if (object === undefined || !keysAre(object, ['kind', 'artifactId', 'contentDigest'])) {
    return undefined;
  }
  const kind = object.kind;
  const artifactId = object.artifactId;
  const contentDigest = object.contentDigest;
  if (!nonEmpty(kind) || !nonEmpty(artifactId) || !nonEmpty(contentDigest)) return undefined;
  return { kind, artifactId, contentDigest };
}

function parseRefs(value: JsonValue | undefined): CandidateExactReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: CandidateExactReference[] = [];
  for (const item of value) {
    const parsed = parseRef(item);
    if (parsed === undefined) return undefined;
    result.push(parsed);
  }
  return result;
}

function parseStrings(value: JsonValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const item of value) {
    if (!nonEmpty(item)) return undefined;
    result.push(item);
  }
  return result;
}

function parseTools(value: JsonValue | undefined): CandidateToolReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: CandidateToolReference[] = [];
  for (const item of value) {
    const object = jsonObject(item);
    if (object === undefined || !keysAre(object, ['kind', 'artifactId', 'contentDigest', 'capability'])) {
      return undefined;
    }
    if (object.kind !== 'tool' || object.capability !== 'query') return undefined;
    const artifactId = object.artifactId;
    const contentDigest = object.contentDigest;
    if (!nonEmpty(artifactId) || !nonEmpty(contentDigest)) return undefined;
    result.push({ kind: 'tool', artifactId, contentDigest, capability: 'query' });
  }
  return result;
}

function parseControl(value: JsonValue | undefined): CandidateControlContract | undefined {
  const object = jsonObject(value);
  if (object === undefined || !keysAre(object, ['startNode', 'nodes', 'edges', 'maxSteps'])) {
    return undefined;
  }
  const startNode = object.startNode;
  const nodes = parseStrings(object.nodes);
  const maxSteps = object.maxSteps;
  const rawEdges = object.edges;
  if (
    !nonEmpty(startNode)
    || nodes === undefined
    || typeof maxSteps !== 'number'
    || !Number.isInteger(maxSteps)
    || maxSteps <= 0
    || !Array.isArray(rawEdges)
  ) {
    return undefined;
  }

  const edges: { from: string; to: string }[] = [];
  for (const item of rawEdges) {
    const edge = jsonObject(item);
    if (edge === undefined || !keysAre(edge, ['from', 'to'])) return undefined;
    const from = edge.from;
    const to = edge.to;
    if (!nonEmpty(from) || !nonEmpty(to)) return undefined;
    edges.push({ from, to });
  }
  return { startNode, nodes, edges, maxSteps };
}

function parseCandidate(value: JsonValue): CandidateEnvelope | CandidateRejection {
  const object = jsonObject(value);
  if (object === undefined) {
    return reject('INVALID_ENVELOPE', '$', 'Candidate envelope must be a JSON object');
  }
  const unknown = Object.keys(object).filter((key) => !TOP_LEVEL_SET.has(key)).sort();
  if (unknown.length > 0) {
    return reject('INVALID_ENVELOPE', '$', `unknown top-level Candidate fields: ${unknown.join(', ')}`);
  }
  if (object.schemaVersion !== CANDIDATE_ENVELOPE_SCHEMA_VERSION) {
    return reject('INVALID_ENVELOPE', '$.schemaVersion', 'unsupported Candidate envelope schemaVersion');
  }
  const candidateKind = parseKind(object.candidateKind);
  if (candidateKind === undefined) {
    return reject('INVALID_ENVELOPE', '$.candidateKind', 'unsupported Candidate kind');
  }
  const candidateId = object.candidateId;
  if (!nonEmpty(candidateId)) {
    return reject('INVALID_ENVELOPE', '$.candidateId', 'candidateId must be non-empty');
  }
  const bodyContract = parseRef(object.bodyContract);
  if (bodyContract === undefined) {
    return reject('INVALID_ENVELOPE', '$.bodyContract', 'bodyContract must be an exact reference');
  }
  if (!Object.prototype.hasOwnProperty.call(object, 'body') || object.body === undefined) {
    return reject('INVALID_ENVELOPE', '$.body', 'Candidate body is required');
  }

  const io = jsonObject(object.io);
  if (io === undefined || !keysAre(io, ['inputs', 'outputs'])) {
    return reject('INVALID_ENVELOPE', '$.io', 'io must contain only inputs/outputs');
  }
  const inputs = parseRefs(io.inputs);
  const outputs = parseRefs(io.outputs);
  const capabilities = parseStrings(object.capabilities);
  const tools = parseTools(object.tools);
  const events = parseStrings(object.events);
  const references = parseRefs(object.references);
  const applicability = parseRefs(object.applicability);
  const hardInvariants = parseRefs(object.hardInvariants);
  if (
    inputs === undefined
    || outputs === undefined
    || capabilities === undefined
    || tools === undefined
    || events === undefined
    || references === undefined
    || applicability === undefined
    || hardInvariants === undefined
  ) {
    return reject('INVALID_ENVELOPE', '$', 'Candidate declarations contain invalid shapes');
  }

  const mutationObject = jsonObject(object.mutation);
  if (mutationObject === undefined || !nonEmpty(mutationObject.kind)) {
    return reject('INVALID_ENVELOPE', '$.mutation', 'mutation contract is invalid');
  }
  let mutation: CandidateEnvelope['mutation'];
  if (mutationObject.kind === 'none' && keysAre(mutationObject, ['kind'])) {
    mutation = { kind: 'none' };
  } else if (mutationObject.kind === 'durable-effect' && keysAre(mutationObject, ['kind', 'effects'])) {
    const effects = parseRefs(mutationObject.effects);
    if (effects === undefined) {
      return reject('INVALID_ENVELOPE', '$.mutation.effects', 'mutation effects must be exact references');
    }
    mutation = { kind: 'durable-effect', effects };
  } else if (mutationObject.kind !== 'none' && mutationObject.kind !== 'durable-effect') {
    return reject('MUTATION_PATH_INVALID', '$.mutation.kind', 'only none or durable-effect mutation is valid');
  } else {
    return reject('INVALID_ENVELOPE', '$.mutation', 'mutation contract contains unexpected fields');
  }

  const control = object.control === undefined ? undefined : parseControl(object.control);
  if (object.control !== undefined && control === undefined) {
    return reject('CONTROL_INVALID', '$.control', 'invalid bounded control contract');
  }
  if (candidateKind === 'workflow' && control === undefined) {
    return reject('CONTROL_INVALID', '$.control', 'WorkflowCandidate requires bounded control');
  }

  const base: CandidateEnvelope = {
    schemaVersion: CANDIDATE_ENVELOPE_SCHEMA_VERSION,
    candidateKind,
    candidateId,
    bodyContract,
    body: object.body,
    io: { inputs, outputs },
    capabilities,
    tools,
    events,
    mutation,
    references,
    applicability,
    hardInvariants,
  };
  return control === undefined ? base : { ...base, control };
}

const refKey = (value: CandidateExactReference): string =>
  `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;

const toolKey = (value: CandidateToolReference): string =>
  `${refKey(value)}\u0000${value.capability}`;

const sortedRefs = (value: readonly CandidateExactReference[]): CandidateExactReference[] =>
  [...value].sort((a, b) => refKey(a).localeCompare(refKey(b)));

const sortedTools = (value: readonly CandidateToolReference[]): CandidateToolReference[] =>
  [...value].sort((a, b) => toolKey(a).localeCompare(toolKey(b)));

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicate = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicate.add(value);
    seen.add(value);
  }
  return [...duplicate].sort();
}

function refsAllowed(
  declared: readonly CandidateExactReference[],
  allowed: readonly CandidateExactReference[],
  code: CandidateRejectionCode,
  path: string,
): CandidateRejection[] {
  const allowedSet = new Set(allowed.map(refKey));
  const result: CandidateRejection[] = [];
  for (const key of duplicates(declared.map(refKey))) {
    result.push(reject(code, path, `duplicate exact reference ${key}`));
  }
  for (const item of sortedRefs(declared)) {
    if (!allowedSet.has(refKey(item))) {
      result.push(reject(code, path, `exact reference is not allowed/resolvable: ${refKey(item)}`));
    }
  }
  return result;
}

function stringsAllowed(
  declared: readonly string[],
  allowed: readonly string[],
  code: CandidateRejectionCode,
  path: string,
): CandidateRejection[] {
  const allowedSet = new Set(allowed);
  const result: CandidateRejection[] = [];
  for (const value of duplicates(declared)) {
    result.push(reject(code, path, `duplicate declaration ${value}`));
  }
  for (const value of [...declared].sort()) {
    if (!allowedSet.has(value)) {
      result.push(reject(code, path, `declaration is not allowlisted: ${value}`));
    }
  }
  return result;
}

function toolsAllowed(
  declared: readonly CandidateToolReference[],
  allowed: readonly CandidateToolReference[],
): CandidateRejection[] {
  const allowedSet = new Set(allowed.map(toolKey));
  const result: CandidateRejection[] = [];
  for (const key of duplicates(declared.map(toolKey))) {
    result.push(reject('TOOL_NOT_ALLOWED', '$.tools', `duplicate tool declaration ${key}`));
  }
  for (const item of sortedTools(declared)) {
    if (!allowedSet.has(toolKey(item))) {
      result.push(reject('TOOL_NOT_ALLOWED', '$.tools', `tool is not allowlisted: ${toolKey(item)}`));
    }
  }
  return result;
}

function validateControl(
  value: CandidateControlContract,
  authority: CandidateValidationAuthority,
): CandidateRejection[] {
  const result: CandidateRejection[] = [];
  const nodes = new Set(value.nodes);
  if (nodes.size !== value.nodes.length) {
    result.push(reject('CONTROL_INVALID', '$.control.nodes', 'control nodes must be unique'));
  }
  if (!nodes.has(value.startNode)) {
    result.push(reject('CONTROL_INVALID', '$.control.startNode', 'startNode must be declared'));
  }
  if (
    value.nodes.length > authority.maxControlNodes
    || value.edges.length > authority.maxControlEdges
    || value.maxSteps > authority.maxControlSteps
    || value.nodes.length > value.maxSteps
  ) {
    result.push(reject('CONTROL_LIMIT_EXCEEDED', '$.control', 'control graph exceeds validation bounds'));
  }

  const adjacency = new Map<string, string[]>();
  for (const node of value.nodes) adjacency.set(node, []);
  for (const edge of value.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) {
      result.push(reject('CONTROL_INVALID', '$.control.edges', `unknown node in ${edge.from}->${edge.to}`));
    } else {
      adjacency.get(edge.from)?.push(edge.to);
    }
  }
  if (result.some((item) => item.code === 'CONTROL_INVALID')) return result;

  const visiting = new Set<string>();
  const visited = new Set<string>();
  let cycle = false;
  const visit = (node: string): void => {
    if (cycle || visited.has(node)) return;
    if (visiting.has(node)) {
      cycle = true;
      return;
    }
    visiting.add(node);
    for (const next of [...(adjacency.get(node) ?? [])].sort()) visit(next);
    visiting.delete(node);
    visited.add(node);
  };
  visit(value.startNode);
  if (cycle) {
    result.push(reject('CONTROL_CYCLE_FORBIDDEN', '$.control.edges', 'v0.3 executable Candidate cycles are forbidden'));
  } else if (visited.size !== nodes.size) {
    result.push(reject('CONTROL_INVALID', '$.control.nodes', 'control graph contains unreachable nodes'));
  }
  return result;
}

function candidateDigestMaterial(candidate: CandidateEnvelope): unknown {
  const control = candidate.control === undefined
    ? null
    : {
        startNode: candidate.control.startNode,
        nodes: [...candidate.control.nodes].sort(),
        edges: [...candidate.control.edges]
          .map((edge) => ({ from: edge.from, to: edge.to }))
          .sort((a, b) => `${a.from}\u0000${a.to}`.localeCompare(`${b.from}\u0000${b.to}`)),
        maxSteps: candidate.control.maxSteps,
      };
  const mutation = candidate.mutation.kind === 'none'
    ? { kind: 'none' }
    : { kind: 'durable-effect', effects: sortedRefs(candidate.mutation.effects) };
  return {
    schemaVersion: candidate.schemaVersion,
    candidateKind: candidate.candidateKind,
    bodyContract: candidate.bodyContract,
    body: candidate.body,
    io: { inputs: sortedRefs(candidate.io.inputs), outputs: sortedRefs(candidate.io.outputs) },
    capabilities: [...candidate.capabilities].sort(),
    tools: sortedTools(candidate.tools),
    events: [...candidate.events].sort(),
    mutation,
    references: sortedRefs(candidate.references),
    applicability: sortedRefs(candidate.applicability),
    hardInvariants: sortedRefs(candidate.hardInvariants),
    control,
  };
}

function bodySchemaDigestMaterial(schema: CandidateBodySchemaArtifact): unknown {
  return {
    schemaVersion: schema.schemaVersion,
    candidateKind: schema.candidateKind,
    schema: schema.schema,
  };
}

function baselineValid(value: CandidateValidationGovernanceBaseline): boolean {
  return nonEmpty(value.domainId)
    && nonEmpty(value.governanceId)
    && nonEmpty(value.schemaVersion)
    && nonEmpty(value.contentDigest)
    && (value.version === undefined || nonEmpty(value.version));
}

function exactRefValid(value: CandidateExactReference): boolean {
  return nonEmpty(value.kind) && nonEmpty(value.artifactId) && nonEmpty(value.contentDigest);
}

function authorityFailures(value: CandidateValidationAuthority): CandidateRejection[] {
  const result: CandidateRejection[] = [];
  if (!baselineValid(value.governanceBaseline)) {
    result.push(reject('VALIDATION_AUTHORITY_INVALID', '$authority.governanceBaseline', 'exact Governance Baseline identity is required'));
  }
  for (const kind of CANDIDATE_KINDS) {
    const bodyContract = value.bodyContracts[kind];
    if (bodyContract !== undefined && !exactRefValid(bodyContract)) {
      result.push(reject('VALIDATION_AUTHORITY_INVALID', `$authority.bodyContracts.${kind}`, 'body contract identity must be exact'));
    }
  }
  if (
    !Number.isInteger(value.maxControlNodes)
    || value.maxControlNodes <= 0
    || !Number.isInteger(value.maxControlEdges)
    || value.maxControlEdges < 0
    || !Number.isInteger(value.maxControlSteps)
    || value.maxControlSteps <= 0
  ) {
    result.push(reject('VALIDATION_AUTHORITY_INVALID', '$authority', 'control bounds must be finite non-negative integers'));
  }
  return result;
}

function sortFailures(value: CandidateRejection[]): CandidateRejection[] {
  return value.sort((a, b) =>
    `${a.code}\u0000${a.path}\u0000${a.message}`.localeCompare(`${b.code}\u0000${b.path}\u0000${b.message}`));
}

type SchemaParseResult =
  | { readonly ok: true; readonly node: CandidateBodySchemaNode }
  | { readonly ok: false; readonly failures: readonly CandidateRejection[] };

function schemaAuthorityFailure(path: string, message: string): CandidateRejection {
  return reject('VALIDATION_AUTHORITY_INVALID', path, message);
}

function parseBodySchemaNode(value: unknown, path: string, depth = 0): SchemaParseResult {
  if (depth > MAX_SCHEMA_DEPTH) {
    return { ok: false, failures: [schemaAuthorityFailure(path, 'body schema exceeds maximum nesting depth')] };
  }
  if (!plain(value) || !nonEmpty(value.type)) {
    return { ok: false, failures: [schemaAuthorityFailure(path, 'body schema node must be a typed plain object')] };
  }

  if (value.type === 'string') {
    if (!keysOnly(value, ['type', 'minLength', 'enum'])) {
      return { ok: false, failures: [schemaAuthorityFailure(path, 'string schema has unknown fields')] };
    }
    const rawMinLength = value.minLength;
    let minLength: number | undefined;
    if (rawMinLength !== undefined) {
      if (typeof rawMinLength !== 'number' || !Number.isInteger(rawMinLength) || rawMinLength < 0) {
        return { ok: false, failures: [schemaAuthorityFailure(`${path}.minLength`, 'minLength must be a non-negative integer')] };
      }
      minLength = rawMinLength;
    }

    const rawEnum = value.enum;
    let enumValues: string[] | undefined;
    if (rawEnum !== undefined) {
      if (!Array.isArray(rawEnum)) {
        return { ok: false, failures: [schemaAuthorityFailure(`${path}.enum`, 'string enum must be an array')] };
      }
      enumValues = [];
      for (const item of rawEnum) {
        if (typeof item !== 'string') {
          return { ok: false, failures: [schemaAuthorityFailure(`${path}.enum`, 'string enum must contain only strings')] };
        }
        enumValues.push(item);
      }
      if (enumValues.length > MAX_SCHEMA_ENUM_VALUES || new Set(enumValues).size !== enumValues.length) {
        return { ok: false, failures: [schemaAuthorityFailure(`${path}.enum`, 'string enum must be bounded and unique')] };
      }
    }

    return {
      ok: true,
      node: {
        type: 'string',
        ...(minLength === undefined ? {} : { minLength }),
        ...(enumValues === undefined ? {} : { enum: enumValues }),
      },
    };
  }

  if (value.type === 'number') {
    if (!keysOnly(value, ['type', 'integer', 'minimum', 'maximum'])) {
      return { ok: false, failures: [schemaAuthorityFailure(path, 'number schema has unknown fields')] };
    }
    const rawInteger = value.integer;
    if (rawInteger !== undefined && typeof rawInteger !== 'boolean') {
      return { ok: false, failures: [schemaAuthorityFailure(`${path}.integer`, 'integer must be boolean')] };
    }
    const rawMinimum = value.minimum;
    if (rawMinimum !== undefined && (typeof rawMinimum !== 'number' || !Number.isFinite(rawMinimum))) {
      return { ok: false, failures: [schemaAuthorityFailure(`${path}.minimum`, 'minimum must be finite')] };
    }
    const rawMaximum = value.maximum;
    if (rawMaximum !== undefined && (typeof rawMaximum !== 'number' || !Number.isFinite(rawMaximum))) {
      return { ok: false, failures: [schemaAuthorityFailure(`${path}.maximum`, 'maximum must be finite')] };
    }
    if (
      typeof rawMinimum === 'number'
      && typeof rawMaximum === 'number'
      && rawMinimum > rawMaximum
    ) {
      return { ok: false, failures: [schemaAuthorityFailure(path, 'minimum cannot exceed maximum')] };
    }
    return {
      ok: true,
      node: {
        type: 'number',
        ...(rawInteger === undefined ? {} : { integer: rawInteger }),
        ...(rawMinimum === undefined ? {} : { minimum: rawMinimum }),
        ...(rawMaximum === undefined ? {} : { maximum: rawMaximum }),
      },
    };
  }

  if (value.type === 'boolean' || value.type === 'null') {
    if (!keysAre(value, ['type'])) {
      return { ok: false, failures: [schemaAuthorityFailure(path, `${value.type} schema has unknown fields`)] };
    }
    return { ok: true, node: { type: value.type } };
  }

  if (value.type === 'array') {
    if (!keysAre(value, ['type', 'items', 'maxItems'])) {
      return { ok: false, failures: [schemaAuthorityFailure(path, 'array schema requires only type/items/maxItems')] };
    }
    const maxItems = value.maxItems;
    if (
      typeof maxItems !== 'number'
      || !Number.isInteger(maxItems)
      || maxItems < 0
      || maxItems > MAX_SCHEMA_ARRAY_ITEMS
    ) {
      return { ok: false, failures: [schemaAuthorityFailure(`${path}.maxItems`, 'maxItems must be a bounded non-negative integer')] };
    }
    const child = parseBodySchemaNode(value.items, `${path}.items`, depth + 1);
    if (!child.ok) return child;
    return { ok: true, node: { type: 'array', items: child.node, maxItems } };
  }

  if (value.type === 'object') {
    if (!keysAre(value, ['type', 'properties', 'required', 'additionalProperties'])) {
      return { ok: false, failures: [schemaAuthorityFailure(path, 'object schema requires only type/properties/required/additionalProperties')] };
    }
    if (value.additionalProperties !== false || !plain(value.properties)) {
      return { ok: false, failures: [schemaAuthorityFailure(path, 'object schema must deny additional properties and declare properties')] };
    }
    const required = Array.isArray(value.required)
      ? value.required.filter((item): item is string => typeof item === 'string' && item.length > 0)
      : undefined;
    if (required === undefined || required.length !== value.required.length) {
      return { ok: false, failures: [schemaAuthorityFailure(`${path}.required`, 'required properties must be non-empty strings')] };
    }
    if (new Set(required).size !== required.length) {
      return { ok: false, failures: [schemaAuthorityFailure(`${path}.required`, 'required properties must be unique')] };
    }

    const propertyEntries = Object.entries(value.properties);
    if (propertyEntries.length > MAX_SCHEMA_PROPERTIES) {
      return { ok: false, failures: [schemaAuthorityFailure(`${path}.properties`, 'object schema has too many properties')] };
    }
    const propertyNames = new Set(propertyEntries.map(([name]) => name));
    if (required.some((name) => !propertyNames.has(name))) {
      return { ok: false, failures: [schemaAuthorityFailure(`${path}.required`, 'required property must exist in properties')] };
    }

    const properties: Record<string, CandidateBodySchemaNode> = {};
    const failures: CandidateRejection[] = [];
    for (const [name, childValue] of propertyEntries.sort(([a], [b]) => a.localeCompare(b))) {
      if (!nonEmpty(name)) {
        failures.push(schemaAuthorityFailure(`${path}.properties`, 'property names must be non-empty'));
        continue;
      }
      const child = parseBodySchemaNode(childValue, `${path}.properties.${name}`, depth + 1);
      if (!child.ok) failures.push(...child.failures);
      else properties[name] = child.node;
    }
    if (failures.length > 0) return { ok: false, failures };
    return {
      ok: true,
      node: { type: 'object', properties, required, additionalProperties: false },
    };
  }

  return {
    ok: false,
    failures: [schemaAuthorityFailure(`${path}.type`, `unsupported body schema node type: ${String(value.type)}`)],
  };
}

function bodySchemaFailure(path: string, message: string): CandidateRejection {
  return reject('BODY_SCHEMA_INVALID', path, message);
}

function validateBodyAgainstSchema(
  value: JsonValue,
  schema: CandidateBodySchemaNode,
  path = '$.body',
): CandidateRejection[] {
  if (schema.type === 'string') {
    if (typeof value !== 'string') return [bodySchemaFailure(path, 'expected string')];
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      return [bodySchemaFailure(path, `string length must be at least ${schema.minLength}`)];
    }
    if (schema.enum !== undefined && !schema.enum.includes(value)) {
      return [bodySchemaFailure(path, 'string value is not in the exact allowed enum')];
    }
    return [];
  }

  if (schema.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [bodySchemaFailure(path, 'expected finite number')];
    }
    if (schema.integer === true && !Number.isInteger(value)) {
      return [bodySchemaFailure(path, 'expected integer')];
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      return [bodySchemaFailure(path, `number must be >= ${schema.minimum}`)];
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      return [bodySchemaFailure(path, `number must be <= ${schema.maximum}`)];
    }
    return [];
  }

  if (schema.type === 'boolean') {
    return typeof value === 'boolean' ? [] : [bodySchemaFailure(path, 'expected boolean')];
  }
  if (schema.type === 'null') {
    return value === null ? [] : [bodySchemaFailure(path, 'expected null')];
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [bodySchemaFailure(path, 'expected array')];
    const failures: CandidateRejection[] = [];
    if (value.length > schema.maxItems) {
      failures.push(bodySchemaFailure(path, `array exceeds maxItems ${schema.maxItems}`));
    }
    value.forEach((item, index) => {
      failures.push(...validateBodyAgainstSchema(item, schema.items, `${path}[${index}]`));
    });
    return failures;
  }

  const object = jsonObject(value);
  if (object === undefined) return [bodySchemaFailure(path, 'expected object')];
  const failures: CandidateRejection[] = [];
  for (const required of schema.required) {
    if (!Object.prototype.hasOwnProperty.call(object, required)) {
      failures.push(bodySchemaFailure(`${path}.${required}`, 'required property is missing'));
    }
  }
  for (const key of Object.keys(object).sort()) {
    const propertySchema = schema.properties[key];
    if (propertySchema === undefined) {
      failures.push(bodySchemaFailure(`${path}.${key}`, 'additional property is not allowed by exact body schema'));
      continue;
    }
    const child = object[key];
    if (child === undefined) {
      failures.push(bodySchemaFailure(`${path}.${key}`, 'object property is unexpectedly unavailable'));
      continue;
    }
    failures.push(...validateBodyAgainstSchema(child, propertySchema, `${path}.${key}`));
  }
  return failures;
}

async function validateBodySchema(
  candidate: CandidateEnvelope,
  authority: CandidateValidationAuthority,
  contractAuthority: CandidateContractAuthorityPort,
  sha256: Sha256Port,
): Promise<CandidateRejection[]> {
  const expected = authority.bodyContracts[candidate.candidateKind];
  if (expected === undefined) {
    return [reject('BODY_VALIDATOR_REQUIRED', '$.bodyContract', `exact body-schema contract required for ${candidate.candidateKind}`)];
  }
  if (refKey(expected) !== refKey(candidate.bodyContract)) {
    return [reject('BODY_CONTRACT_NOT_ALLOWED', '$.bodyContract', 'Candidate body contract is not the exact authority-allowed contract')];
  }

  let schemaArtifact: CandidateBodySchemaArtifact | undefined;
  try {
    schemaArtifact = await contractAuthority.resolveExactBodySchema(candidate.bodyContract);
  } catch (error) {
    return [schemaAuthorityFailure(
      '$authority.bodySchema',
      error instanceof Error
        ? `exact body-schema resolution failed closed: ${error.message}`
        : 'exact body-schema resolution failed closed',
    )];
  }
  if (schemaArtifact === undefined) {
    return [reject('BODY_VALIDATOR_REQUIRED', '$.bodyContract', 'exact body-schema artifact is not resolvable from authority')];
  }
  if (
    schemaArtifact.schemaVersion !== CANDIDATE_BODY_SCHEMA_VERSION
    || schemaArtifact.candidateKind !== candidate.candidateKind
    || refKey(schemaArtifact.identity) !== refKey(candidate.bodyContract)
  ) {
    return [schemaAuthorityFailure('$authority.bodySchema', 'resolved body-schema artifact identity/kind/version mismatch')];
  }

  let computedSchemaDigest: string;
  try {
    computedSchemaDigest = await computeCanonicalJsonDigest(bodySchemaDigestMaterial(schemaArtifact), sha256);
  } catch (error) {
    return [schemaAuthorityFailure(
      '$authority.bodySchema',
      error instanceof Error
        ? `body-schema digest validation failed closed: ${error.message}`
        : 'body-schema digest validation failed closed',
    )];
  }
  if (computedSchemaDigest !== candidate.bodyContract.contentDigest) {
    return [schemaAuthorityFailure('$authority.bodySchema', 'resolved body-schema bytes do not match the exact content digest')];
  }

  const parsedSchema = parseBodySchemaNode(schemaArtifact.schema, '$authority.bodySchema.schema');
  if (!parsedSchema.ok) return sortFailures([...parsedSchema.failures]);
  return sortFailures(validateBodyAgainstSchema(candidate.body, parsedSchema.node));
}

/** Deterministic Candidate -> Validated boundary. Never promotes, activates or executes. */
export async function validateCandidate(
  value: unknown,
  authority: CandidateValidationAuthority,
  contractAuthority: CandidateContractAuthorityPort,
  sha256: Sha256Port,
): Promise<CandidateValidationResult> {
  const authorityErrors = authorityFailures(authority);
  if (authorityErrors.length > 0) {
    return { ok: false, rejections: sortFailures(authorityErrors), grantsExecutionPermission: false };
  }

  const forbidden = scan(value);
  if (forbidden !== undefined) {
    return { ok: false, rejections: [forbidden], grantsExecutionPermission: false };
  }

  let canonical: JsonValue;
  try {
    canonical = canonicalizeJson(value);
  } catch (error) {
    return {
      ok: false,
      rejections: [reject(
        'NON_CANONICAL_CONTENT',
        '$',
        error instanceof Error ? error.message : 'Candidate is not canonical JSON',
      )],
      grantsExecutionPermission: false,
    };
  }

  const parsed = parseCandidate(canonical);
  if ('code' in parsed) {
    return { ok: false, rejections: [parsed], grantsExecutionPermission: false };
  }
  const candidate = parsed;
  const failures: CandidateRejection[] = [];

  failures.push(...await validateBodySchema(candidate, authority, contractAuthority, sha256));
  failures.push(...refsAllowed(candidate.io.inputs, authority.allowedInputs, 'INPUT_CONTRACT_NOT_ALLOWED', '$.io.inputs'));
  failures.push(...refsAllowed(candidate.io.outputs, authority.allowedOutputs, 'OUTPUT_CONTRACT_NOT_ALLOWED', '$.io.outputs'));
  failures.push(...stringsAllowed(candidate.capabilities, authority.allowedCapabilities, 'CAPABILITY_NOT_ALLOWED', '$.capabilities'));
  failures.push(...toolsAllowed(candidate.tools, authority.allowedTools));
  failures.push(...stringsAllowed(candidate.events, authority.allowedEvents, 'EVENT_NOT_ALLOWED', '$.events'));
  if (candidate.mutation.kind === 'durable-effect') {
    failures.push(...refsAllowed(candidate.mutation.effects, authority.allowedMutationEffects, 'MUTATION_PATH_INVALID', '$.mutation.effects'));
  }
  failures.push(...refsAllowed(candidate.references, authority.availableReferences, 'EXACT_REFERENCE_UNRESOLVED', '$.references'));
  failures.push(...refsAllowed(candidate.applicability, authority.allowedApplicability, 'APPLICABILITY_NOT_ALLOWED', '$.applicability'));
  failures.push(...refsAllowed(candidate.hardInvariants, authority.hardInvariants, 'HARD_INVARIANT_INCOMPATIBLE', '$.hardInvariants'));
  if (candidate.control !== undefined) failures.push(...validateControl(candidate.control, authority));

  const specialized = authority.specializedValidators?.[candidate.candidateKind];
  if (candidate.candidateKind === 'workflow' && specialized === undefined) {
    failures.push(reject('SPECIALIZED_VALIDATOR_REQUIRED', '$.candidateKind', 'WorkflowCandidate requires the stricter #204/Frozen-L2 validator'));
  } else if (specialized !== undefined && specialized.candidateKind !== candidate.candidateKind) {
    failures.push(reject('VALIDATION_AUTHORITY_INVALID', '$authority.specializedValidators', 'specialized validator kind mismatch'));
  } else if (specialized !== undefined) {
    try {
      for (const issue of specialized.validate(candidate)) {
        failures.push(reject('SPECIALIZED_REJECTED', issue.path, `${issue.code}: ${issue.message}`));
      }
    } catch (error) {
      failures.push(reject(
        'SPECIALIZED_REJECTED',
        '$.candidateKind',
        error instanceof Error
          ? `specialized validator failed closed: ${error.message}`
          : 'specialized validator failed closed',
      ));
    }
  }

  if (failures.length > 0) {
    return { ok: false, rejections: sortFailures(failures), grantsExecutionPermission: false };
  }

  let candidateContentDigest: string;
  try {
    candidateContentDigest = await computeCanonicalJsonDigest(candidateDigestMaterial(candidate), sha256);
  } catch (error) {
    return {
      ok: false,
      rejections: [reject(
        'CONTENT_DIGEST_INVALID',
        '$',
        error instanceof Error ? error.message : 'Candidate digest generation failed',
      )],
      grantsExecutionPermission: false,
    };
  }
  if (!nonEmpty(candidateContentDigest)) {
    return {
      ok: false,
      rejections: [reject('CONTENT_DIGEST_INVALID', '$', 'Candidate digest must be non-empty')],
      grantsExecutionPermission: false,
    };
  }

  const identity: ValidatedCandidateIdentity = {
    candidateKind: candidate.candidateKind,
    candidateId: candidate.candidateId,
    candidateContentDigest,
    validatorContractVersion: CANDIDATE_VALIDATOR_CONTRACT_VERSION,
    governanceBaseline: { ...authority.governanceBaseline },
  };
  return { ok: true, identity, grantsExecutionPermission: false };
}

function parseGovernanceBaseline(
  value: JsonValue | undefined,
): CandidateValidationGovernanceBaseline | undefined {
  const object = jsonObject(value);
  if (object === undefined || !keysOnly(object, ['domainId', 'governanceId', 'schemaVersion', 'version', 'contentDigest'])) {
    return undefined;
  }
  const domainId = object.domainId;
  const governanceId = object.governanceId;
  const schemaVersion = object.schemaVersion;
  const contentDigest = object.contentDigest;
  const version = object.version;
  if (
    !nonEmpty(domainId)
    || !nonEmpty(governanceId)
    || !nonEmpty(schemaVersion)
    || !nonEmpty(contentDigest)
    || (version !== undefined && !nonEmpty(version))
  ) {
    return undefined;
  }
  return version === undefined
    ? { domainId, governanceId, schemaVersion, contentDigest }
    : { domainId, governanceId, schemaVersion, version, contentDigest };
}

function parseCompatibility(
  value: JsonValue,
): ReviewedCandidateValidationCompatibility | undefined {
  const object = jsonObject(value);
  if (
    object === undefined
    || !keysAre(object, ['kind', 'validatorContractVersion', 'candidateKind', 'from', 'reviewDigest'])
    || object.kind !== 'reviewed-exact-governance-compatibility'
    || object.validatorContractVersion !== CANDIDATE_VALIDATOR_CONTRACT_VERSION
  ) {
    return undefined;
  }
  const candidateKind = parseKind(object.candidateKind);
  const from = parseGovernanceBaseline(object.from);
  const reviewDigest = object.reviewDigest;
  if (candidateKind === undefined || from === undefined || !nonEmpty(reviewDigest)) {
    return undefined;
  }
  return {
    kind: 'reviewed-exact-governance-compatibility',
    validatorContractVersion: CANDIDATE_VALIDATOR_CONTRACT_VERSION,
    candidateKind,
    from,
    reviewDigest,
  };
}

function parseCompatibilityRecords(
  semantics: JsonObject,
): readonly ReviewedCandidateValidationCompatibility[] | undefined {
  const raw = semantics[GOVERNANCE_COMPATIBILITY_KEY];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return undefined;
  const result: ReviewedCandidateValidationCompatibility[] = [];
  for (const item of raw) {
    const parsed = parseCompatibility(item);
    if (parsed === undefined) return undefined;
    result.push(parsed);
  }
  return result;
}

/**
 * Reuse of validation evidence only; never promotion/activation/execution authority.
 * Cross-baseline reuse is accepted only when the reviewed compatibility record
 * is physically contained in the exact retained T-003 Governance Baseline body
 * resolved and digest-verified by GovernanceBaselineRegistry.
 */
export async function canReuseValidationForGovernanceBaseline(
  identity: ValidatedCandidateIdentity,
  target: CandidateValidationGovernanceBaseline,
  governanceRegistry: GovernanceBaselineRegistry,
): Promise<boolean> {
  if (!baselineValid(target)) return false;
  if (sameGovernanceBaselineIdentity(identity.governanceBaseline, target)) return true;

  let body: GovernanceBaselineBody;
  try {
    body = await governanceRegistry.resolveExact(target);
  } catch {
    return false;
  }
  if (!sameGovernanceBaselineIdentity(body.identity, target)) return false;

  const compatibilities = parseCompatibilityRecords(body.semantics);
  if (compatibilities === undefined) return false;
  return compatibilities.some((compatibility) =>
    compatibility.validatorContractVersion === identity.validatorContractVersion
    && compatibility.candidateKind === identity.candidateKind
    && sameGovernanceBaselineIdentity(compatibility.from, identity.governanceBaseline));
}
