import { canonicalJsonStringify, computeCanonicalJsonDigest, type Sha256Port } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import {
  CANDIDATE_ENVELOPE_SCHEMA_VERSION,
  CANDIDATE_KINDS,
  CANDIDATE_VALIDATOR_CONTRACT_VERSION,
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

const TOP_LEVEL = ['applicability','body','candidateId','candidateKind','capabilities','control','events','hardInvariants','io','mutation','references','schemaVersion','tools'] as const;
const FORBIDDEN: ReadonlyArray<readonly [CandidateRejectionCode, ReadonlySet<string>]> = [
  ['ARBITRARY_CODE_FORBIDDEN', new Set(['code','eval','functionBody','moduleSource','script','sourceCode'])],
  ['PROVIDER_SECRET_OR_STATE_FORBIDDEN', new Set(['accessToken','apiKey','credentials','modelState','providerSecret','providerState','refreshToken'])],
  ['RUNTIME_OBJECT_FORBIDDEN', new Set(['actorRef','actorReference','machineRef','runtimeObject','xstateActor'])],
  ['PRIVATE_REASONING_FORBIDDEN', new Set(['chainOfThought','privateReasoning'])],
];

const reject = (code: CandidateRejectionCode, path: string, message: string): CandidateRejection => ({ code, path, message });
const nonEmpty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
function plain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value) as object | null;
  return proto === Object.prototype || proto === null;
}
function keysAre(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function scan(value: unknown, path = '$', ancestors = new Set<object>()): CandidateRejection | undefined {
  if (typeof value === 'function') return reject('ARBITRARY_CODE_FORBIDDEN', path, 'executable functions are forbidden Candidate material');
  if (typeof value === 'undefined' || typeof value === 'symbol' || typeof value === 'bigint') {
    return reject('NON_CANONICAL_CONTENT', path, `unsupported Candidate value type: ${typeof value}`);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? undefined : reject('NON_CANONICAL_CONTENT', path, 'Candidate numbers must be finite');
  if (typeof value !== 'object') return undefined;
  if (ancestors.has(value)) return reject('NON_CANONICAL_CONTENT', path, 'circular Candidate material is forbidden');
  if (!Array.isArray(value) && !plain(value)) return reject('RUNTIME_OBJECT_FORBIDDEN', path, 'runtime/class instances are forbidden Candidate material');
  if (Object.getOwnPropertySymbols(value).length > 0) return reject('RUNTIME_OBJECT_FORBIDDEN', path, 'symbol-keyed runtime state is forbidden Candidate material');

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

function ref(value: unknown): CandidateExactReference | undefined {
  if (!plain(value) || !keysAre(value, ['kind','artifactId','contentDigest'])) return undefined;
  if (!nonEmpty(value.kind) || !nonEmpty(value.artifactId) || !nonEmpty(value.contentDigest)) return undefined;
  return { kind: value.kind, artifactId: value.artifactId, contentDigest: value.contentDigest };
}
function refs(value: unknown): CandidateExactReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: CandidateExactReference[] = [];
  for (const item of value) {
    const parsed = ref(item);
    if (parsed === undefined) return undefined;
    result.push(parsed);
  }
  return result;
}
function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every(nonEmpty) ? value : undefined;
}
function tools(value: unknown): CandidateToolReference[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: CandidateToolReference[] = [];
  for (const item of value) {
    if (!plain(item) || !keysAre(item, ['kind','artifactId','contentDigest','capability'])) return undefined;
    if (item.kind !== 'tool' || item.capability !== 'query' || !nonEmpty(item.artifactId) || !nonEmpty(item.contentDigest)) return undefined;
    result.push({ kind: 'tool', artifactId: item.artifactId, contentDigest: item.contentDigest, capability: 'query' });
  }
  return result;
}
function control(value: unknown): CandidateControlContract | undefined {
  if (!plain(value) || !keysAre(value, ['startNode','nodes','edges','maxSteps'])) return undefined;
  const nodes = strings(value.nodes);
  if (!nonEmpty(value.startNode) || nodes === undefined || !Number.isInteger(value.maxSteps) || (value.maxSteps as number) <= 0 || !Array.isArray(value.edges)) return undefined;
  const edges: { from: string; to: string }[] = [];
  for (const item of value.edges) {
    if (!plain(item) || !keysAre(item, ['from','to']) || !nonEmpty(item.from) || !nonEmpty(item.to)) return undefined;
    edges.push({ from: item.from, to: item.to });
  }
  return { startNode: value.startNode, nodes, edges, maxSteps: value.maxSteps as number };
}

function parse(value: unknown): CandidateEnvelope | CandidateRejection {
  if (!plain(value)) return reject('INVALID_ENVELOPE', '$', 'Candidate envelope must be a plain object');
  const unknown = Object.keys(value).filter((key) => !(TOP_LEVEL as readonly string[]).includes(key)).sort();
  if (unknown.length > 0) return reject('INVALID_ENVELOPE', '$', `unknown top-level Candidate fields: ${unknown.join(', ')}`);
  if (value.schemaVersion !== CANDIDATE_ENVELOPE_SCHEMA_VERSION) return reject('INVALID_ENVELOPE', '$.schemaVersion', 'unsupported Candidate envelope schemaVersion');
  if (!CANDIDATE_KINDS.includes(value.candidateKind as CandidateKind)) return reject('INVALID_ENVELOPE', '$.candidateKind', 'unsupported Candidate kind');
  if (!nonEmpty(value.candidateId)) return reject('INVALID_ENVELOPE', '$.candidateId', 'candidateId must be non-empty');
  if (!plain(value.io) || !keysAre(value.io, ['inputs','outputs'])) return reject('INVALID_ENVELOPE', '$.io', 'io must contain only inputs/outputs');

  const inputs = refs(value.io.inputs); const outputs = refs(value.io.outputs);
  const capabilities = strings(value.capabilities); const declaredTools = tools(value.tools); const events = strings(value.events);
  const references = refs(value.references); const applicability = refs(value.applicability); const hardInvariants = refs(value.hardInvariants);
  if ([inputs,outputs,capabilities,declaredTools,events,references,applicability,hardInvariants].some((item) => item === undefined)) {
    return reject('INVALID_ENVELOPE', '$', 'Candidate declarations contain invalid shapes');
  }

  if (!plain(value.mutation) || !nonEmpty(value.mutation.kind)) return reject('INVALID_ENVELOPE', '$.mutation', 'mutation contract is invalid');
  let mutation: CandidateEnvelope['mutation'];
  if (value.mutation.kind === 'none' && keysAre(value.mutation, ['kind'])) mutation = { kind: 'none' };
  else if (value.mutation.kind === 'durable-effect' && keysAre(value.mutation, ['kind','effects'])) {
    const effects = refs(value.mutation.effects);
    if (effects === undefined) return reject('INVALID_ENVELOPE', '$.mutation.effects', 'mutation effects must be exact references');
    mutation = { kind: 'durable-effect', effects };
  } else if (value.mutation.kind !== 'none' && value.mutation.kind !== 'durable-effect') {
    return reject('MUTATION_PATH_INVALID', '$.mutation.kind', 'only none or durable-effect mutation is valid');
  } else return reject('INVALID_ENVELOPE', '$.mutation', 'mutation contract contains unexpected fields');

  const bounded = value.control === undefined ? undefined : control(value.control);
  if (value.control !== undefined && bounded === undefined) return reject('CONTROL_INVALID', '$.control', 'invalid bounded control contract');
  if (value.candidateKind === 'workflow' && bounded === undefined) return reject('CONTROL_INVALID', '$.control', 'WorkflowCandidate requires bounded control');

  let body: JsonValue;
  try { body = JSON.parse(canonicalJsonStringify(value.body)) as JsonValue; }
  catch (error) { return reject('NON_CANONICAL_CONTENT', '$.body', error instanceof Error ? error.message : 'body is not canonical JSON'); }

  const envelope: CandidateEnvelope = {
    schemaVersion: CANDIDATE_ENVELOPE_SCHEMA_VERSION,
    candidateKind: value.candidateKind as CandidateKind,
    candidateId: value.candidateId,
    body,
    io: { inputs: inputs as CandidateExactReference[], outputs: outputs as CandidateExactReference[] },
    capabilities: capabilities as string[], tools: declaredTools as CandidateToolReference[], events: events as string[], mutation,
    references: references as CandidateExactReference[], applicability: applicability as CandidateExactReference[], hardInvariants: hardInvariants as CandidateExactReference[],
  };
  return bounded === undefined ? envelope : { ...envelope, control: bounded };
}

const refKey = (value: CandidateExactReference): string => `${value.kind}\u0000${value.artifactId}\u0000${value.contentDigest}`;
const toolKey = (value: CandidateToolReference): string => `${refKey(value)}\u0000${value.capability}`;
const sortedRefs = (value: readonly CandidateExactReference[]): CandidateExactReference[] => [...value].sort((a,b) => refKey(a).localeCompare(refKey(b)));
const sortedTools = (value: readonly CandidateToolReference[]): CandidateToolReference[] => [...value].sort((a,b) => toolKey(a).localeCompare(toolKey(b)));
function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>(); const dup = new Set<string>();
  for (const value of values) { if (seen.has(value)) dup.add(value); seen.add(value); }
  return [...dup].sort();
}
function refsAllowed(declared: readonly CandidateExactReference[], allowed: readonly CandidateExactReference[], code: CandidateRejectionCode, path: string): CandidateRejection[] {
  const allowedSet = new Set(allowed.map(refKey)); const result: CandidateRejection[] = [];
  for (const key of duplicates(declared.map(refKey))) result.push(reject(code, path, `duplicate exact reference ${key}`));
  for (const item of sortedRefs(declared)) if (!allowedSet.has(refKey(item))) result.push(reject(code, path, `exact reference is not allowed/resolvable: ${refKey(item)}`));
  return result;
}
function stringsAllowed(declared: readonly string[], allowed: readonly string[], code: CandidateRejectionCode, path: string): CandidateRejection[] {
  const allowedSet = new Set(allowed); const result: CandidateRejection[] = [];
  for (const value of duplicates(declared)) result.push(reject(code, path, `duplicate declaration ${value}`));
  for (const value of [...declared].sort()) if (!allowedSet.has(value)) result.push(reject(code, path, `declaration is not allowlisted: ${value}`));
  return result;
}
function toolsAllowed(declared: readonly CandidateToolReference[], allowed: readonly CandidateToolReference[]): CandidateRejection[] {
  const allowedSet = new Set(allowed.map(toolKey)); const result: CandidateRejection[] = [];
  for (const key of duplicates(declared.map(toolKey))) result.push(reject('TOOL_NOT_ALLOWED', '$.tools', `duplicate tool declaration ${key}`));
  for (const item of sortedTools(declared)) if (!allowedSet.has(toolKey(item))) result.push(reject('TOOL_NOT_ALLOWED', '$.tools', `tool is not allowlisted: ${toolKey(item)}`));
  return result;
}
function validateControl(value: CandidateControlContract, authority: CandidateValidationAuthority): CandidateRejection[] {
  const result: CandidateRejection[] = []; const nodes = new Set(value.nodes);
  if (nodes.size !== value.nodes.length) result.push(reject('CONTROL_INVALID', '$.control.nodes', 'control nodes must be unique'));
  if (!nodes.has(value.startNode)) result.push(reject('CONTROL_INVALID', '$.control.startNode', 'startNode must be declared'));
  if (value.nodes.length > authority.maxControlNodes || value.edges.length > authority.maxControlEdges || value.maxSteps > authority.maxControlSteps || value.nodes.length > value.maxSteps) {
    result.push(reject('CONTROL_LIMIT_EXCEEDED', '$.control', 'control graph exceeds validation bounds'));
  }
  const adjacency = new Map<string,string[]>(); for (const node of value.nodes) adjacency.set(node, []);
  for (const edge of value.edges) {
    if (!nodes.has(edge.from) || !nodes.has(edge.to)) result.push(reject('CONTROL_INVALID', '$.control.edges', `unknown node in ${edge.from}->${edge.to}`));
    else adjacency.get(edge.from)?.push(edge.to);
  }
  if (result.some((item) => item.code === 'CONTROL_INVALID')) return result;
  const visiting = new Set<string>(); const visited = new Set<string>(); let cycle = false;
  const visit = (node: string): void => {
    if (cycle || visited.has(node)) return;
    if (visiting.has(node)) { cycle = true; return; }
    visiting.add(node); for (const next of [...(adjacency.get(node) ?? [])].sort()) visit(next); visiting.delete(node); visited.add(node);
  };
  visit(value.startNode);
  if (cycle) result.push(reject('CONTROL_CYCLE_FORBIDDEN', '$.control.edges', 'v0.3 executable Candidate cycles are forbidden'));
  else if (visited.size !== nodes.size) result.push(reject('CONTROL_INVALID', '$.control.nodes', 'control graph contains unreachable nodes'));
  return result;
}

function material(candidate: CandidateEnvelope): unknown {
  const bounded = candidate.control === undefined ? null : {
    startNode: candidate.control.startNode,
    nodes: [...candidate.control.nodes].sort(),
    edges: [...candidate.control.edges].map((edge) => ({ from: edge.from, to: edge.to })).sort((a,b) => `${a.from}\u0000${a.to}`.localeCompare(`${b.from}\u0000${b.to}`)),
    maxSteps: candidate.control.maxSteps,
  };
  const mutation = candidate.mutation.kind === 'none' ? { kind: 'none' as const } : { kind: 'durable-effect' as const, effects: sortedRefs(candidate.mutation.effects) };
  return {
    schemaVersion: candidate.schemaVersion, candidateKind: candidate.candidateKind, body: candidate.body,
    io: { inputs: sortedRefs(candidate.io.inputs), outputs: sortedRefs(candidate.io.outputs) },
    capabilities: [...candidate.capabilities].sort(), tools: sortedTools(candidate.tools), events: [...candidate.events].sort(), mutation,
    references: sortedRefs(candidate.references), applicability: sortedRefs(candidate.applicability), hardInvariants: sortedRefs(candidate.hardInvariants), control: bounded,
  };
}
function baselineValid(value: CandidateValidationGovernanceBaseline): boolean {
  return nonEmpty(value.domainId) && nonEmpty(value.governanceId) && nonEmpty(value.schemaVersion) && nonEmpty(value.contentDigest);
}
function authorityFailures(value: CandidateValidationAuthority): CandidateRejection[] {
  const result: CandidateRejection[] = [];
  if (!baselineValid(value.governanceBaseline)) result.push(reject('VALIDATION_AUTHORITY_INVALID', '$authority.governanceBaseline', 'exact Governance Baseline identity is required'));
  if (!Number.isInteger(value.maxControlNodes) || value.maxControlNodes <= 0 || !Number.isInteger(value.maxControlEdges) || value.maxControlEdges < 0 || !Number.isInteger(value.maxControlSteps) || value.maxControlSteps <= 0) {
    result.push(reject('VALIDATION_AUTHORITY_INVALID', '$authority', 'control bounds must be finite non-negative integers'));
  }
  return result;
}
function sortFailures(value: CandidateRejection[]): CandidateRejection[] {
  return value.sort((a,b) => `${a.code}\u0000${a.path}\u0000${a.message}`.localeCompare(`${b.code}\u0000${b.path}\u0000${b.message}`));
}

/** Deterministic Candidate -> Validated boundary. Never promotes, activates or executes. */
export async function validateCandidate(value: unknown, authority: CandidateValidationAuthority, sha256: Sha256Port): Promise<CandidateValidationResult> {
  const authorityErrors = authorityFailures(authority);
  if (authorityErrors.length > 0) return { ok: false, rejections: sortFailures(authorityErrors), grantsExecutionPermission: false };
  const forbidden = scan(value); if (forbidden !== undefined) return { ok: false, rejections: [forbidden], grantsExecutionPermission: false };
  try { canonicalJsonStringify(value); }
  catch (error) { return { ok: false, rejections: [reject('NON_CANONICAL_CONTENT', '$', error instanceof Error ? error.message : 'Candidate is not canonical JSON')], grantsExecutionPermission: false }; }

  const parsed = parse(value);
  if ('code' in parsed) return { ok: false, rejections: [parsed], grantsExecutionPermission: false };
  const candidate = parsed; const failures: CandidateRejection[] = [];
  failures.push(...refsAllowed(candidate.io.inputs, authority.allowedInputs, 'INPUT_CONTRACT_NOT_ALLOWED', '$.io.inputs'));
  failures.push(...refsAllowed(candidate.io.outputs, authority.allowedOutputs, 'OUTPUT_CONTRACT_NOT_ALLOWED', '$.io.outputs'));
  failures.push(...stringsAllowed(candidate.capabilities, authority.allowedCapabilities, 'CAPABILITY_NOT_ALLOWED', '$.capabilities'));
  failures.push(...toolsAllowed(candidate.tools, authority.allowedTools));
  failures.push(...stringsAllowed(candidate.events, authority.allowedEvents, 'EVENT_NOT_ALLOWED', '$.events'));
  if (candidate.mutation.kind === 'durable-effect') failures.push(...refsAllowed(candidate.mutation.effects, authority.allowedMutationEffects, 'MUTATION_PATH_INVALID', '$.mutation.effects'));
  failures.push(...refsAllowed(candidate.references, authority.availableReferences, 'EXACT_REFERENCE_UNRESOLVED', '$.references'));
  failures.push(...refsAllowed(candidate.applicability, authority.allowedApplicability, 'APPLICABILITY_NOT_ALLOWED', '$.applicability'));
  failures.push(...refsAllowed(candidate.hardInvariants, authority.hardInvariants, 'HARD_INVARIANT_INCOMPATIBLE', '$.hardInvariants'));
  if (candidate.control !== undefined) failures.push(...validateControl(candidate.control, authority));

  const specialized = authority.specializedValidators?.[candidate.candidateKind];
  if (candidate.candidateKind === 'workflow' && specialized === undefined) failures.push(reject('SPECIALIZED_VALIDATOR_REQUIRED', '$.candidateKind', 'WorkflowCandidate requires the stricter #204/Frozen-L2 validator'));
  else if (specialized !== undefined && specialized.candidateKind !== candidate.candidateKind) failures.push(reject('VALIDATION_AUTHORITY_INVALID', '$authority.specializedValidators', 'specialized validator kind mismatch'));
  else if (specialized !== undefined) {
    try { for (const issue of specialized.validate(candidate)) failures.push(reject('SPECIALIZED_REJECTED', issue.path, `${issue.code}: ${issue.message}`)); }
    catch (error) { failures.push(reject('SPECIALIZED_REJECTED', '$.candidateKind', error instanceof Error ? `specialized validator failed closed: ${error.message}` : 'specialized validator failed closed')); }
  }
  if (failures.length > 0) return { ok: false, rejections: sortFailures(failures), grantsExecutionPermission: false };

  let candidateContentDigest: string;
  try { candidateContentDigest = await computeCanonicalJsonDigest(material(candidate), sha256); }
  catch (error) { return { ok: false, rejections: [reject('CONTENT_DIGEST_INVALID', '$', error instanceof Error ? error.message : 'Candidate digest generation failed')], grantsExecutionPermission: false }; }
  if (!nonEmpty(candidateContentDigest)) return { ok: false, rejections: [reject('CONTENT_DIGEST_INVALID', '$', 'Candidate digest must be non-empty')], grantsExecutionPermission: false };

  const identity: ValidatedCandidateIdentity = {
    candidateKind: candidate.candidateKind,
    candidateId: candidate.candidateId,
    candidateContentDigest,
    validatorContractVersion: CANDIDATE_VALIDATOR_CONTRACT_VERSION,
    governanceBaseline: { ...authority.governanceBaseline },
  };
  return { ok: true, identity, grantsExecutionPermission: false };
}

function sameBaseline(a: CandidateValidationGovernanceBaseline, b: CandidateValidationGovernanceBaseline): boolean {
  return a.domainId === b.domainId && a.governanceId === b.governanceId && a.schemaVersion === b.schemaVersion && a.contentDigest === b.contentDigest;
}
/** Reuse of validation evidence only; never promotion/activation/execution authority. */
export function canReuseValidationForGovernanceBaseline(identity: ValidatedCandidateIdentity, target: CandidateValidationGovernanceBaseline, compatibility?: ReviewedCandidateValidationCompatibility): boolean {
  if (!baselineValid(target)) return false;
  if (sameBaseline(identity.governanceBaseline, target)) return true;
  return compatibility !== undefined && nonEmpty(compatibility.reviewDigest)
    && compatibility.kind === 'reviewed-exact-governance-compatibility'
    && compatibility.validatorContractVersion === identity.validatorContractVersion
    && compatibility.candidateKind === identity.candidateKind
    && sameBaseline(compatibility.from, identity.governanceBaseline)
    && sameBaseline(compatibility.to, target);
}
