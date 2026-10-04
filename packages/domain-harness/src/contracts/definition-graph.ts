/**
 * v0.7 typed Definition relation contract and normalized Definition graph
 * identity (issue #542, fine-grained DAG T001C).
 *
 * The frozen L2 defines `Domain Definition = Domain Component Graph` with
 * normalized typed relations included exactly once in the graph digest and
 * versioned, domain-separated digest domains. This file owns only that
 * Definition-plane contract identity:
 *
 * - a typed exact relation envelope between bound Domain Components (exact
 *   `ComponentId` endpoints, open exact relation kind);
 * - fail-closed graph-level validation: dangling, duplicate and conflicting
 *   relation rejection; bound components are validated by delegating to the
 *   existing component contract unchanged; authority-bearing floating
 *   selectors are rejected anywhere in relation references;
 * - a normalized (order-insensitive) graph digest in its own versioned
 *   digest domain, through the existing canonical-JSON + Sha256Port seam.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - per-Component content digests (T001B owns `contracts/component-digest.ts`);
 * - must-understand admission / non-emptiness decisions (T001D);
 * - public barrel exposure (T001E);
 * - Runtime Assembly, pins, capability resolution, tool runtime, and any
 *   runtime resolution of relations. Relations are pure Definition-plane
 *   contract identity; nothing here resolves, executes or looks anything up.
 */
import {
  validateComponentEnvelope,
  type ComponentEnvelope,
  type ComponentId,
} from './component.js';
import {
  canonicalizeJson,
  computeCanonicalJsonDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import type { JsonValue } from './json.js';

/**
 * Versioned Definition graph digest domain tag, owned exclusively by this
 * file. Distinct from any per-Component digest domain (T001B) and from the
 * legacy v0.3 domain-data artifact identity material, which carries no
 * domain tag at all — historical identities never change.
 */
export const DEFINITION_GRAPH_DIGEST_DOMAIN = 'kaicreator.definition-graph.digest.v1';

/** Stable logical identity of one relation within a Definition graph. */
export type RelationId = string;

/**
 * Open, exact, version-free relation-type identity string: any new relation
 * kind is representable, so no closed `depends-on | consumes | ...` union is
 * ever introduced. Floating/range selection semantics stay out of scope.
 */
export type RelationKind = string;

/**
 * Typed exact relation envelope between two bound Domain Components.
 * Endpoints are exact `ComponentId`s of components bound in the same graph
 * envelope — they never embed versions, selectors, implementation/module
 * identity or routing identity.
 */
export interface DefinitionRelation {
  /** Stable logical identity of the relation; unique within the graph. */
  readonly relationId: RelationId;
  /** Open exact relation-type identity; not a floating selector. */
  readonly relationKind: RelationKind;
  /** Exact ComponentId of the source component bound in the same graph. */
  readonly sourceComponentId: ComponentId;
  /** Exact ComponentId of the target component bound in the same graph. */
  readonly targetComponentId: ComponentId;
}

/**
 * Portable Definition graph envelope. `components` are bound Component
 * envelopes validated by the existing component contract (imported, not
 * modified); `relations` are included exactly once — duplicate or conflicting
 * entries invalidate the whole graph, they are never deduplicated.
 * `nonMaterialExtensions` is explicitly non-behavioral material, mirroring
 * the T001A extension boundary, and is excluded from graph identity.
 */
export interface DefinitionGraphEnvelope {
  /** Stable logical Definition graph identity; non-empty; exact. */
  readonly graphId: string;
  /** Bound Component envelopes; each validated by the component contract. */
  readonly components: readonly ComponentEnvelope[];
  /** Typed relations; each included exactly once in the graph identity. */
  readonly relations: readonly DefinitionRelation[];
  /** Explicitly non-behavioral material; excluded from graph identity. */
  readonly nonMaterialExtensions?: JsonValue;
}

export type DefinitionGraphContractErrorCode =
  | 'INVALID_GRAPH_ENVELOPE'
  | 'INVALID_GRAPH_ID'
  | 'INVALID_RELATION'
  | 'INVALID_RELATION_ID'
  | 'INVALID_RELATION_KIND'
  | 'DANGLING_COMPONENT_REF'
  | 'DUPLICATE_RELATION'
  | 'CONFLICTING_RELATION'
  | 'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN'
  | 'INVALID_GRAPH_MATERIAL';

export class DefinitionGraphContractError extends Error {
  readonly code: DefinitionGraphContractErrorCode;

  constructor(code: DefinitionGraphContractErrorCode, message: string) {
    super(message);
    this.name = 'DefinitionGraphContractError';
    this.code = code;
  }
}

const GRAPH_FIELDS = new Set<string>(['graphId', 'components', 'relations', 'nonMaterialExtensions']);

const RELATION_FIELDS = new Set<string>([
  'relationId',
  'relationKind',
  'sourceComponentId',
  'targetComponentId',
]);

const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*']);
/** Range/wildcard operators never occur in an exact identity string. */
const FLOATING_SELECTOR_PATTERN = /[\^~<>|*]/;

function fail(
  code: DefinitionGraphContractErrorCode,
  path: string,
  reason: string,
): never {
  throw new DefinitionGraphContractError(code, `${path} ${reason}`);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ownKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter((key) =>
    Object.prototype.propertyIsEnumerable.call(value, key),
  );
}

/** Rejects mutable selection tokens and `id@version` embedding; never normalizes. */
function requireNonFloating(value: string, path: string): void {
  if (
    value.includes('@') ||
    FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase()) ||
    FLOATING_SELECTOR_PATTERN.test(value)
  ) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/range) or an embedded `id@version`',
    );
  }
}

/** Exact graph identity string: non-empty, not an embedded `id@selector` form. */
function requireGraphIdentity(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    fail('INVALID_GRAPH_ID', path, 'must be a string');
  }
  if (value.trim().length === 0) {
    fail('INVALID_GRAPH_ID', path, 'must be a non-empty exact identity');
  }
  if (value.includes('@')) {
    fail('INVALID_GRAPH_ID', path, 'must not embed a version selector (`id@version`)');
  }
  requireNonFloating(value, path);
}

/**
 * Exact relation reference identity: non-string/empty values fail with the
 * field-specific invalid code; floating tokens, range operators and
 * `id@version` embedding fail with the floating-selector code.
 */
function requireRelationIdentity(
  value: unknown,
  path: string,
  invalidCode: DefinitionGraphContractErrorCode,
): void {
  if (typeof value !== 'string') {
    fail(invalidCode, path, 'must be a string');
  }
  if (value.trim().length === 0) {
    fail(invalidCode, path, 'must be a non-empty exact identity');
  }
  requireNonFloating(value, path);
}

/** Structural validation of one relation entry (identity strings only). */
function validateRelationStructure(relation: unknown, path: string): void {
  if (!isPlainObject(relation)) {
    fail('INVALID_RELATION', path, 'must be a plain object relation envelope');
  }
  const unexpectedField = ownKeys(relation).find((key) => !RELATION_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_RELATION',
      path,
      `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to later concerns)`,
    );
  }
  const candidate = relation;
  requireRelationIdentity(candidate.relationId, `${path}.relationId`, 'INVALID_RELATION_ID');
  requireRelationIdentity(candidate.relationKind, `${path}.relationKind`, 'INVALID_RELATION_KIND');
  requireRelationIdentity(
    candidate.sourceComponentId,
    `${path}.sourceComponentId`,
    'INVALID_RELATION',
  );
  requireRelationIdentity(
    candidate.targetComponentId,
    `${path}.targetComponentId`,
    'INVALID_RELATION',
  );
}

/**
 * Structural fail-closed validation of a Definition graph envelope. Invalid
 * exact identities are always rejected — never silently normalized to a
 * default/current value. Component-envelope failures propagate the original
 * `ComponentContractError` unwrapped (single source of truth for component
 * codes).
 */
export function validateDefinitionGraphEnvelope(envelope: DefinitionGraphEnvelope): void {
  if (!isPlainObject(envelope)) {
    fail('INVALID_GRAPH_ENVELOPE', 'definition graph envelope', 'must be a plain object');
  }
  const unexpectedField = ownKeys(envelope).find((key) => !GRAPH_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_GRAPH_ENVELOPE',
      'definition graph envelope',
      `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to later concerns)`,
    );
  }

  const { graphId, components, relations, nonMaterialExtensions } = envelope as Record<string, unknown>;

  requireGraphIdentity(graphId, 'definition graph envelope.graphId');

  if (!Array.isArray(components)) {
    fail(
      'INVALID_GRAPH_MATERIAL',
      'definition graph envelope.components',
      'must be an array of bound Component envelopes',
    );
  }
  if (!Array.isArray(relations)) {
    fail(
      'INVALID_GRAPH_MATERIAL',
      'definition graph envelope.relations',
      'must be an array of Definition relations',
    );
  }
  const componentList = components as unknown[];
  const relationList = relations as unknown[];

  // Bound components: delegated unchanged to the existing component contract.
  // A ComponentContractError propagates unwrapped. Binding is also kept
  // unambiguous: the same componentId may not be bound twice, otherwise the
  // order-insensitive normalized graph identity would not be well-defined.
  const boundIds = new Set<string>();
  for (const [index, component] of componentList.entries()) {
    validateComponentEnvelope(component as ComponentEnvelope);
    const componentId = (component as ComponentEnvelope).componentId;
    if (boundIds.has(componentId)) {
      fail(
        'INVALID_GRAPH_MATERIAL',
        `definition graph envelope.components[${index}]`,
        `binds componentId "${componentId}" more than once (a graph identity must stay order-insensitive and unambiguous)`,
      );
    }
    boundIds.add(componentId);
  }

  // Per-relation structural validation first: exact identity strings only.
  for (const [index, relation] of relationList.entries()) {
    validateRelationStructure(relation, `definition graph envelope.relations[${index}]`);
  }

  // Exact-endpoint rule: endpoints reference components bound in this same
  // graph envelope. Missing bindings fail closed — no placeholder components
  // are auto-created.
  for (const [index, relation] of relationList.entries()) {
    const candidate = relation as DefinitionRelation;
    if (!boundIds.has(candidate.sourceComponentId)) {
      fail(
        'DANGLING_COMPONENT_REF',
        `definition graph envelope.relations[${index}].sourceComponentId`,
        `references "${candidate.sourceComponentId}", which is not a bound component of this graph`,
      );
    }
    if (!boundIds.has(candidate.targetComponentId)) {
      fail(
        'DANGLING_COMPONENT_REF',
        `definition graph envelope.relations[${index}].targetComponentId`,
        `references "${candidate.targetComponentId}", which is not a bound component of this graph`,
      );
    }
  }

  // Exactly-once rule, enforced by rejection (never deduplication):
  // - a fully identical repetition of a relation is a DUPLICATE_RELATION;
  // - one relationId reused for differing kind/endpoints is a
  //   CONFLICTING_RELATION (the same logical identity cannot declare two
  //   different relations);
  // - the same (source, target, relationKind) triple under different
  //   relationIds is a CONFLICTING_RELATION.
  const contentByRelationId = new Map<string, string>();
  const relationIdByTriple = new Map<string, string>();
  for (const [index, relation] of relationList.entries()) {
    const candidate = relation as DefinitionRelation;
    const contentKey = JSON.stringify([
      candidate.relationKind,
      candidate.sourceComponentId,
      candidate.targetComponentId,
    ]);
    const seenContent = contentByRelationId.get(candidate.relationId);
    if (seenContent !== undefined) {
      if (seenContent === contentKey) {
        fail(
          'DUPLICATE_RELATION',
          `definition graph envelope.relations[${index}]`,
          `declares relationId "${candidate.relationId}" more than once (relations are included exactly once; the validator never deduplicates)`,
        );
      }
      fail(
        'CONFLICTING_RELATION',
        `definition graph envelope.relations[${index}]`,
        `reuses relationId "${candidate.relationId}" for differing kind/endpoints`,
      );
    }
    contentByRelationId.set(candidate.relationId, contentKey);

    const existingRelationId = relationIdByTriple.get(contentKey);
    if (existingRelationId !== undefined) {
      fail(
        'CONFLICTING_RELATION',
        `definition graph envelope.relations[${index}]`,
        `declares the same (source, target, relationKind) triple under relationIds "${existingRelationId}" and "${candidate.relationId}"`,
      );
    }
    relationIdByTriple.set(contentKey, candidate.relationId);
  }

  if ('nonMaterialExtensions' in envelope) {
    try {
      canonicalizeJson(nonMaterialExtensions);
    } catch {
      fail(
        'INVALID_GRAPH_MATERIAL',
        'definition graph envelope.nonMaterialExtensions',
        'must be portable JSON material',
      );
    }
  }
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Normalized (order-insensitive) Definition graph digest through the
 * existing canonical-JSON + Sha256Port seam. The normalized material is
 *
 *     { domain: DEFINITION_GRAPH_DIGEST_DOMAIN, graphId,
 *       components sorted by componentId,
 *       relations sorted by relationId }
 *
 * so relations and bound components enter the graph identity exactly once,
 * in a versioned digest domain owned by this file. The digest of an invalid
 * graph is never produced: validation runs first and fails closed.
 * Graph-level `nonMaterialExtensions` are excluded from the material.
 */
export async function computeDefinitionGraphDigest(
  envelope: DefinitionGraphEnvelope,
  sha256: Sha256Port,
): Promise<ContentDigest> {
  validateDefinitionGraphEnvelope(envelope);
  const material = {
    domain: DEFINITION_GRAPH_DIGEST_DOMAIN,
    graphId: envelope.graphId,
    components: [...envelope.components].sort((a, b) => compareIds(a.componentId, b.componentId)),
    relations: [...envelope.relations].sort((a, b) => compareIds(a.relationId, b.relationId)),
  };
  return computeCanonicalJsonDigest(material, sha256);
}
