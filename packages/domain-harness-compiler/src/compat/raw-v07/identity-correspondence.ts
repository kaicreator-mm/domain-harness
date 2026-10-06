/**
 * T008B — immutable legacy->v0.7 identity correspondence evidence (PACK-B
 * #589, thin issue #789).
 *
 * `COMPATIBILITY` boundary module (R2 MICROKERNEL_BOUNDARY), consuming only
 * the accepted T008A mapping result (`RawV07GraphMappingResult`) and the
 * canonical `computeDefinitionGraphDigest`. The produced artifact is an
 * explicit, immutable correspondence from the accepted Raw-v0.7 mapping
 * provenance/historical logical identity to the generated v0.7 Component
 * identities, bound to the exact DefinitionGraphDigest of the graph those
 * Components live in:
 *
 * - the artifact is evidence/provenance only. It is never a new identity
 *   rewrite layer, never a reverse Raw authority: it exposes nothing but the
 *   historical identity material the accepted T008A adapter already recorded,
 *   and it is consumable only as frozen JSON evidence (not a graph/envelope
 *   or admission input);
 * - correspondence fails typed/closed: a provenance identity without a graph
 *   Component (`MISSING`), a graph Component without a provenance record
 *   (`EXTRA` — correspondence is never heuristically reconstructed after
 *   compile/admission), a repeated record (`DUPLICATE`), and incoherent
 *   accepted material (`CORRESPONDENCE_CONTRACT_VIOLATION`) all fail typed;
 * - one historical identity mapping to multiple authority-bearing componentIds
 *   fails (`AMBIGUOUS`). v0.7 accepts no one-to-many correspondence rule; if
 *   planning ever accepts one, that is a new bounded concern, not an option
 *   here;
 * - historical identity is preserved byte/value-exact (deep canonical copies;
 *   hostile own-data `__proto__` keys survive verbatim) and never normalized
 *   or rewritten. Changing the new representation can never falsify the
 *   evidence: the artifact is deep-frozen, holds no aliases into the accepted
 *   mapping, and correspondence rebuilt against an evolved graph fails closed
 *   instead of minting rewritten history;
 * - every authority-bearing value is snapshotted synchronously before the
 *   single canonical-digest await, so a caller mutating its own mapping while
 *   the digest promise is pending can never produce torn evidence.
 *
 * Intentionally excluded (PACK-B boundaries): public compatibility promises
 * (T008C), harness-config/promoted-subworkflow special mapping (T008D), final
 * v0.6 delta (T008E), Runtime/admission/effect authority. This module is
 * internal to the compiler package: it is not re-exported through any barrel.
 */
import {
  computeDefinitionGraphDigest,
  type ComponentId,
  type ContentDigest,
  type Sha256Port,
} from '@kaicreator/domain-harness/v7';
import type { JsonObject, JsonValue } from '../../raw/types.js';
import {
  RAW_V07_SUPPORTED_SCHEMA_VERSION,
  type RawV07ComponentProvenance,
  type RawV07GraphMappingResult,
  type RawV07MappingProvenance,
} from './index.js';

/** Evidence marker carried by every correspondence artifact. */
export const RAW_V07_IDENTITY_CORRESPONDENCE_MARKER =
  'domain-harness.raw-v07-identity-correspondence' as const;

export type RawV07IdentityCorrespondenceErrorCode =
  | 'INVALID_MAPPING_INPUT'
  | 'MISSING_IDENTITY_CORRESPONDENCE'
  | 'EXTRA_IDENTITY_CORRESPONDENCE'
  | 'DUPLICATE_IDENTITY_CORRESPONDENCE'
  | 'AMBIGUOUS_IDENTITY_CORRESPONDENCE'
  | 'CORRESPONDENCE_CONTRACT_VIOLATION';

/**
 * Typed fail-closed error for the identity correspondence builder. `path`
 * identifies the offending accepted-material location; no message ever
 * normalizes, guesses or rewrites the offending identity.
 */
export class RawV07IdentityCorrespondenceError extends Error {
  readonly code: RawV07IdentityCorrespondenceErrorCode;
  readonly path: string;

  constructor(
    code: RawV07IdentityCorrespondenceErrorCode,
    path: string,
    reason: string,
    options?: { cause?: unknown },
  ) {
    super(`raw-v0.7 identity correspondence at ${path}: ${reason}`, options);
    this.name = 'RawV07IdentityCorrespondenceError';
    this.code = code;
    this.path = path;
  }
}

/** One exact historical-identity -> generated-Component correspondence. */
export interface RawV07IdentityCorrespondenceEntry {
  /** Generated v0.7 Component identity the historical record corresponds to. */
  readonly componentId: ComponentId;
  /** Which Raw family the Component was mapped from (accepted provenance). */
  readonly sourceKind: RawV07ComponentProvenance['sourceKind'];
  /**
   * Exact historical logical identity, byte/value-exact as recorded by the
   * accepted T008A provenance (deep-copied, deep-frozen, never normalized).
   */
  readonly historicalIdentity: JsonObject;
}

/** Immutable legacy->v0.7 identity correspondence evidence artifact. */
export interface RawV07IdentityCorrespondence {
  readonly evidenceKind: typeof RAW_V07_IDENTITY_CORRESPONDENCE_MARKER;
  /** The correspondence artifact's own frozen evidence schema version. */
  readonly schemaVersion: '1';
  /** Raw authoring schema version of the accepted T008A mapping provenance. */
  readonly sourceSchemaVersion: typeof RAW_V07_SUPPORTED_SCHEMA_VERSION;
  readonly domainId: string;
  /** Graph identity the correspondence binds (== provenance domainId). */
  readonly graphId: string;
  /** Verbatim accepted provenance source root (never defaulted). */
  readonly sourceRoot: string;
  /** Exact canonical DefinitionGraphDigest of the bound accepted graph. */
  readonly definitionGraphDigest: ContentDigest;
  /** Correspondences, canonically ordered by componentId. */
  readonly entries: readonly RawV07IdentityCorrespondenceEntry[];
}

/** The accepted T008A source-kind -> graph Component family contract. */
const SOURCE_KIND_FAMILIES: Record<RawV07ComponentProvenance['sourceKind'], 'tool' | 'semantic'> =
  Object.freeze({
    tool: 'tool',
    workflow: 'semantic',
    skill: 'semantic',
    projection: 'semantic',
  });

const PROVENANCE_SOURCE_KINDS: ReadonlySet<string> = new Set(['workflow', 'skill', 'tool', 'projection']);

function fail(
  code: RawV07IdentityCorrespondenceErrorCode,
  path: string,
  reason: string,
  options?: { cause?: unknown },
): never {
  throw new RawV07IdentityCorrespondenceError(code, path, reason, options);
}

/** Code-unit comparison only; `localeCompare` is environment-sensitive. */
function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requirePlainRecord(value: unknown, path: string, reason: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('INVALID_MAPPING_INPUT', path, reason);
  }
  return value as Record<string, unknown>;
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail('INVALID_MAPPING_INPUT', path, 'must be a non-empty string');
  }
  return value;
}

// ---------------------------------------------------------------------------
// Canonical copy of historical identity material: descriptor-safe deep copy
// with recursively sorted object keys and preserved array order. Rejects
// (never silently drops) non-JSON material, accessors, symbol keys,
// non-enumerable properties, exotic prototypes and circular references — the
// exact copy semantics of the accepted T008A provenance surface, so hostile
// own-data `__proto__` keys survive byte/value-exact.
// ---------------------------------------------------------------------------

function copyCanonical(value: unknown, path: string, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail('INVALID_MAPPING_INPUT', path, 'non-finite numbers are not portable JSON evidence');
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== 'object') {
    fail('INVALID_MAPPING_INPUT', path, `unsupported value type ${typeof value} is not portable JSON evidence`);
  }

  const record: object = value;
  if (Object.getOwnPropertySymbols(record).length > 0) {
    fail('INVALID_MAPPING_INPUT', path, 'symbol-keyed properties are not portable JSON evidence');
  }
  if (ancestors.has(record)) {
    fail('INVALID_MAPPING_INPUT', path, 'circular references are not portable JSON evidence');
  }

  if (Array.isArray(record)) {
    const source = record as unknown as Record<string, unknown>;
    const ownNames = Object.getOwnPropertyNames(source);
    const extra = ownNames.filter((key) => key !== 'length' && !/^(0|[1-9]\d*)$/.test(key));
    if (extra.length > 0) {
      fail('INVALID_MAPPING_INPUT', path, 'arrays carrying extra named properties are not portable JSON evidence');
    }
    ancestors.add(record);
    const output: JsonValue[] = [];
    for (let index = 0; index < record.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(source, String(index));
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        fail(
          'INVALID_MAPPING_INPUT',
          `${path}[${index}]`,
          'sparse or accessor array entries are not portable JSON evidence',
        );
      }
      output.push(copyCanonical(descriptor.value, `${path}[${index}]`, ancestors));
    }
    ancestors.delete(record);
    return output;
  }

  const prototype: unknown = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    fail('INVALID_MAPPING_INPUT', path, 'values with exotic prototypes are not portable JSON evidence');
  }
  const ownNames = Object.getOwnPropertyNames(record);
  const nonEnumerable = ownNames.filter((key) => !Object.prototype.propertyIsEnumerable.call(record, key));
  if (nonEnumerable.length > 0) {
    fail('INVALID_MAPPING_INPUT', path, 'non-enumerable properties are not portable JSON evidence');
  }

  ancestors.add(record);
  const output: Record<string, JsonValue> = {};
  for (const key of ownNames.sort()) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key)!;
    if (!('value' in descriptor)) {
      fail('INVALID_MAPPING_INPUT', `${path}.${key}`, 'accessor properties are not portable JSON evidence');
    }
    if (descriptor.value === undefined) {
      fail('INVALID_MAPPING_INPUT', `${path}.${key}`, 'undefined is not portable JSON evidence');
    }
    // Prototype-safe definition (accepted T008A repair semantics): plain
    // assignment on the key `__proto__` reaches the inherited
    // Object.prototype setter instead of creating an own property.
    // defineProperty always creates the exact own enumerable data property
    // and never invokes any setter, so historical identity survives
    // byte/value-exact on a plain prototype.
    Object.defineProperty(output, key, {
      value: copyCanonical(descriptor.value, `${path}.${key}`, ancestors),
      enumerable: true,
      writable: true,
      configurable: true,
    });
  }
  ancestors.delete(record);
  return output;
}

/** Deterministic deep-equality key over copied historical identity material. */
function canonicalIdentityKey(value: JsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(canonicalIdentityKey).join(',')}]`;
  const keys = Object.keys(value).sort(compareIds);
  const record: JsonObject = value;
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalIdentityKey(record[key] as JsonValue)}`).join(',')}}`;
}

/** Deep-freeze the finished artifact: evidence can never be edited in place. */
function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    for (const element of value) deepFreeze(element);
    Object.freeze(value);
    return value;
  }
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  Object.freeze(value);
  return value;
}

// ---------------------------------------------------------------------------
// Accepted-material shape checks (synchronous, before the digest await)
// ---------------------------------------------------------------------------

interface AcceptedGraphShape {
  readonly graphId: string;
  /** componentId -> Component family, from the accepted graph envelope. */
  readonly families: Map<string, 'tool' | 'semantic'>;
}

function requireGraphShape(graph: unknown): AcceptedGraphShape {
  if (graph === null || typeof graph !== 'object') {
    fail('INVALID_MAPPING_INPUT', 'input.graph', 'must be the accepted T008A DefinitionGraphEnvelope');
  }
  const record = graph as { graphId?: unknown; components?: unknown; relations?: unknown };
  requireNonEmptyString(record.graphId, 'input.graph.graphId');
  if (!Array.isArray(record.components)) {
    fail('INVALID_MAPPING_INPUT', 'input.graph.components', 'must be an array of Component envelopes');
  }
  if (!Array.isArray(record.relations)) {
    fail('INVALID_MAPPING_INPUT', 'input.graph.relations', 'must be an array of typed relations');
  }
  const families = new Map<string, 'tool' | 'semantic'>();
  for (const [index, component] of record.components.entries()) {
    const path = `input.graph.components[${index}]`;
    const envelope = requirePlainRecord(
      component,
      path,
      'must be a Component envelope carrying componentId and family',
    );
    const componentId = requireNonEmptyString(envelope.componentId, `${path}.componentId`);
    if (envelope.family !== 'tool' && envelope.family !== 'semantic') {
      fail(
        'CORRESPONDENCE_CONTRACT_VIOLATION',
        `${path}.family`,
        `must be 'tool' or 'semantic'; the accepted T008A graph never carries another family`,
      );
    }
    families.set(componentId, envelope.family);
  }
  return { graphId: record.graphId as string, families };
}

interface AcceptedProvenance {
  readonly provenance: RawV07MappingProvenance;
  /** Scalar provenance/graph identity, snapshotted synchronously. */
  readonly domainId: string;
  readonly sourceRoot: string;
  readonly graph: AcceptedGraphShape;
}

function requireMappingProvenance(mapping: RawV07GraphMappingResult): AcceptedProvenance {
  const candidate = requirePlainRecord(
    mapping,
    'input',
    'must be an accepted T008A RawV07GraphMappingResult',
  );
  const graph = requireGraphShape(candidate.graph);
  const provenanceRecord = requirePlainRecord(
    candidate.provenance,
    'input.provenance',
    'must be the accepted T008A RawV07MappingProvenance',
  );
  for (const key of Object.keys(provenanceRecord)) {
    if (key !== 'schemaVersion' && key !== 'domainId' && key !== 'sourceRoot' && key !== 'components') {
      fail('INVALID_MAPPING_INPUT', `input.provenance.${key}`, 'unexpected field; the accepted provenance record is closed');
    }
  }
  if (provenanceRecord.schemaVersion !== RAW_V07_SUPPORTED_SCHEMA_VERSION) {
    fail(
      'INVALID_MAPPING_INPUT',
      'input.provenance.schemaVersion',
      `is '${String(provenanceRecord.schemaVersion)}'; correspondence accepts exactly the accepted Raw-v0.7 mapping provenance ('${RAW_V07_SUPPORTED_SCHEMA_VERSION}')`,
    );
  }
  const domainId = requireNonEmptyString(provenanceRecord.domainId, 'input.provenance.domainId');
  if (typeof provenanceRecord.sourceRoot !== 'string') {
    fail('INVALID_MAPPING_INPUT', 'input.provenance.sourceRoot', 'must be a string; the source root is never defaulted');
  }
  if (!Array.isArray(provenanceRecord.components)) {
    fail('INVALID_MAPPING_INPUT', 'input.provenance.components', 'must be an array of provenance records');
  }
  if (domainId !== graph.graphId) {
    fail(
      'CORRESPONDENCE_CONTRACT_VIOLATION',
      'input.provenance.domainId',
      `'${domainId}' does not match the accepted graph graphId '${graph.graphId}'; correspondence binds exactly one coherent accepted mapping`,
    );
  }
  // Scalar identity is snapshotted here, never re-read from the caller-owned
  // record after the digest await below (no torn evidence).
  return { provenance: candidate.provenance as RawV07MappingProvenance, domainId, sourceRoot: provenanceRecord.sourceRoot, graph };
}

function requireProvenanceEntry(record: unknown, path: string): RawV07ComponentProvenance {
  const entry = requirePlainRecord(record, path, 'must be a RawV07ComponentProvenance record');
  for (const key of Object.keys(entry)) {
    if (key !== 'componentId' && key !== 'sourceKind' && key !== 'historicalIdentity') {
      fail('INVALID_MAPPING_INPUT', `${path}.${key}`, 'unexpected field; the accepted provenance record is closed');
    }
  }
  requireNonEmptyString(entry.componentId, `${path}.componentId`);
  if (typeof entry.sourceKind !== 'string' || !PROVENANCE_SOURCE_KINDS.has(entry.sourceKind)) {
    fail(
      'INVALID_MAPPING_INPUT',
      `${path}.sourceKind`,
      `must be exactly one of ${[...PROVENANCE_SOURCE_KINDS].sort().join(' | ')}`,
    );
  }
  if (entry.historicalIdentity === null || typeof entry.historicalIdentity !== 'object' || Array.isArray(entry.historicalIdentity)) {
    fail(
      'INVALID_MAPPING_INPUT',
      `${path}.historicalIdentity`,
      'must be an object; historical identity is never guessed, defaulted or dropped',
    );
  }
  return {
    componentId: entry.componentId as string,
    sourceKind: entry.sourceKind as RawV07ComponentProvenance['sourceKind'],
    historicalIdentity: entry.historicalIdentity as JsonObject,
  };
}

/**
 * Snapshot the exact correspondence set from the accepted provenance against
 * the accepted graph. Every correspondence property (1:1 against the graph,
 * unique componentIds, unambiguous historical identities, family coherence)
 * is enforced here, synchronously, before any await.
 */
function snapshotCorrespondence(
  provenance: RawV07MappingProvenance,
  graph: AcceptedGraphShape,
): RawV07IdentityCorrespondenceEntry[] {
  const entries: RawV07IdentityCorrespondenceEntry[] = [];
  const componentIds = new Set<string>();
  const componentIdByIdentity = new Map<string, string>();

  for (const [index, record] of provenance.components.entries()) {
    const path = `input.provenance.components[${index}]`;
    const entry = requireProvenanceEntry(record, path);
    const componentId = entry.componentId;

    if (componentIds.has(componentId)) {
      fail(
        'DUPLICATE_IDENTITY_CORRESPONDENCE',
        `${path}.componentId`,
        `historical record '${componentId}' is recorded more than once; correspondence is included exactly once`,
      );
    }
    componentIds.add(componentId);

    const family = graph.families.get(componentId);
    if (family === undefined) {
      fail(
        'MISSING_IDENTITY_CORRESPONDENCE',
        `${path}.componentId`,
        `provenance declares '${componentId}', which the accepted graph does not carry; correspondence is never silently dropped`,
      );
    }
    if (SOURCE_KIND_FAMILIES[entry.sourceKind] !== family) {
      fail(
        'CORRESPONDENCE_CONTRACT_VIOLATION',
        `${path}.sourceKind`,
        `'${entry.sourceKind}' contradicts the accepted graph family '${family}' for '${componentId}'`,
      );
    }

    const historicalIdentity = copyCanonical(
      entry.historicalIdentity,
      `${path}.historicalIdentity`,
      new Set<object>(),
    ) as JsonObject;
    const identityKey = canonicalIdentityKey(historicalIdentity);
    const existingComponentId = componentIdByIdentity.get(identityKey);
    if (existingComponentId !== undefined) {
      fail(
        'AMBIGUOUS_IDENTITY_CORRESPONDENCE',
        `${path}.historicalIdentity`,
        `identical historical identity maps to both '${existingComponentId}' and '${componentId}'; v0.7 accepts no one-to-many correspondence rule, so this fails closed instead of guessing`,
      );
    }
    componentIdByIdentity.set(identityKey, componentId);

    entries.push({ componentId, sourceKind: entry.sourceKind, historicalIdentity });
  }

  for (const [graphComponentId] of graph.families) {
    if (!componentIds.has(graphComponentId)) {
      fail(
        'EXTRA_IDENTITY_CORRESPONDENCE',
        `input.graph.components`,
        `graph Component '${graphComponentId}' carries no provenance record; correspondence is never heuristically reconstructed after compile/admission`,
      );
    }
  }

  return entries.sort((a, b) => compareIds(a.componentId, b.componentId));
}

// ---------------------------------------------------------------------------
// Public evidence API
// ---------------------------------------------------------------------------

/**
 * Build the immutable legacy->v0.7 identity correspondence evidence for one
 * accepted T008A mapping result. Pure and synchronous up to the single
 * canonical-digest await: no I/O, no environment access, no mutation of the
 * accepted mapping, no aliasing of caller-owned material. The returned
 * artifact is deep-frozen evidence/provenance only — it is never a rewrite
 * layer and never a reverse Raw authority.
 */
export async function buildRawV07IdentityCorrespondence(
  mapping: RawV07GraphMappingResult,
  sha256: Sha256Port,
): Promise<RawV07IdentityCorrespondence> {
  const accepted = requireMappingProvenance(mapping);
  const entries = snapshotCorrespondence(accepted.provenance, accepted.graph);

  // Exact canonical graph digest through the standard seam — never a local
  // re-digest. All correspondence decisions above were made against the
  // synchronous snapshot, so the digest below is bound to exactly the same
  // invocation-time material as the entries.
  let definitionGraphDigest: ContentDigest;
  try {
    definitionGraphDigest = await computeDefinitionGraphDigest(mapping.graph, sha256);
  } catch (error) {
    fail(
      'CORRESPONDENCE_CONTRACT_VIOLATION',
      'input.graph',
      `failed the canonical DefinitionGraphDigest gate: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  return deepFreeze({
    evidenceKind: RAW_V07_IDENTITY_CORRESPONDENCE_MARKER,
    schemaVersion: '1',
    sourceSchemaVersion: RAW_V07_SUPPORTED_SCHEMA_VERSION,
    domainId: accepted.domainId,
    graphId: accepted.graph.graphId,
    sourceRoot: accepted.sourceRoot,
    definitionGraphDigest,
    entries,
  });
}
