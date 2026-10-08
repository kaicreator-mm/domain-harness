/**
 * v0.7 typed Definition relation contract and normalized Definition graph
 * identity (issue #542, fine-grained DAG T001C; repaired by #555).
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
 *   digest domain, composed from exact Component semantic digests and exact
 *   typed relations.
 *
 * Validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578): the
 * graph envelope and every relation are validated on descriptor-safe
 * snapshots, so accessor-backed `components`/`relations` material is rejected
 * before any authority use, and relation evidence used by later validation
 * phases comes from validated snapshots rather than repeated caller reads.
 */
import {
  validateComponentEnvelope,
  type ComponentEnvelope,
  type ComponentId,
} from './component.js';
import {
  componentSemanticDigestMaterial,
  type ComponentSemanticDigestMaterial,
} from './component-digest.js';
import {
  canonicalizeJson,
  computeCanonicalJsonDigest,
  type ContentDigest,
  type Sha256Port,
} from './identity.js';
import type { JsonValue } from './json.js';
import {
  carriesEmbeddedSelector,
  carriesFloatingOrRangeSemantics,
  describeRecordSafetyIssue,
  isNonEmptyIdentityString,
  safeArraySnapshot,
  safeRecordSnapshot,
} from './record-safety.js';

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

function fail(
  code: DefinitionGraphContractErrorCode,
  path: string,
  reason: string,
): never {
  throw new DefinitionGraphContractError(code, `${path} ${reason}`);
}

/** Rejects mutable selection tokens, range operators and `id@version` embedding. */
function requireNonFloatingIdentity(value: string, path: string): void {
  if (carriesFloatingOrRangeSemantics(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range) or an embedded `id@version`',
    );
  }
}

/** Exact graph identity string: non-empty, not an embedded `id@selector` form. */
function requireGraphIdentity(value: unknown, path: string): void {
  if (typeof value !== 'string') {
    fail('INVALID_GRAPH_ID', path, 'must be a string');
  }
  if (!isNonEmptyIdentityString(value)) {
    fail('INVALID_GRAPH_ID', path, 'must be a non-empty exact identity');
  }
  if (carriesEmbeddedSelector(value)) {
    fail('INVALID_GRAPH_ID', path, 'must not embed a version selector (`id@version`)');
  }
  requireNonFloatingIdentity(value, path);
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
  if (!isNonEmptyIdentityString(value)) {
    fail(invalidCode, path, 'must be a non-empty exact identity');
  }
  if (carriesEmbeddedSelector(value)) {
    fail(
      'FLOATING_AUTHORITY_REFERENCE_FORBIDDEN',
      path,
      'must be an exact identity, not an embedded `id@version` selector',
    );
  }
  requireNonFloatingIdentity(value, path);
}

/**
 * Structural validation of one relation entry (identity strings only) on a
 * descriptor-safe snapshot. Returns the validated snapshot so later
 * validation phases never re-read the caller-owned relation object.
 */
function validateRelationStructure(relation: unknown, path: string): Record<string, unknown> {
  const result = safeRecordSnapshot(relation, path);
  if (!result.ok) {
    fail('INVALID_RELATION', path, describeRecordSafetyIssue(result.issue));
  }
  const candidate = result.snapshot;
  const unexpectedField = Object.keys(candidate).find((key) => !RELATION_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_RELATION',
      path,
      `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to later concerns)`,
    );
  }
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
  return candidate;
}

/**
 * Structural fail-closed validation of a Definition graph envelope. Invalid
 * exact identities are always rejected — never silently normalized to a
 * default/current value. Component-envelope failures propagate the original
 * `ComponentContractError` unwrapped (single source of truth for component
 * codes). Validation runs descriptor-safe on snapshots of the caller graph
 * envelope and each relation (#578): accessor/symbol-keyed/non-enumerable
 * material and exotic prototypes are typed rejections before any authority
 * use, and later validation phases (dangling/duplicate/conflict) read
 * validated snapshot evidence rather than re-reading caller objects. The
 * caller input is never frozen or mutated.
 */
export function validateDefinitionGraphEnvelope(envelope: DefinitionGraphEnvelope): void {
  const graphResult = safeRecordSnapshot(envelope, 'definition graph envelope');
  if (!graphResult.ok) {
    fail('INVALID_GRAPH_ENVELOPE', 'definition graph envelope', describeRecordSafetyIssue(graphResult.issue));
  }
  const view = graphResult.snapshot;
  const unexpectedField = Object.keys(view).find((key) => !GRAPH_FIELDS.has(key));
  if (unexpectedField !== undefined) {
    fail(
      'INVALID_GRAPH_ENVELOPE',
      'definition graph envelope',
      `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to later concerns)`,
    );
  }

  const { graphId, components, relations, nonMaterialExtensions } = view;

  requireGraphIdentity(graphId, 'definition graph envelope.graphId');

  const componentsResult = safeArraySnapshot(components, 'definition graph envelope.components');
  if (!componentsResult.ok) {
    fail(
      'INVALID_GRAPH_MATERIAL',
      'definition graph envelope.components',
      componentsResult.issue.violation === 'NOT_AN_ARRAY'
        ? 'must be an array of bound Component envelopes'
        : describeRecordSafetyIssue(componentsResult.issue),
    );
  }
  const relationsResult = safeArraySnapshot(relations, 'definition graph envelope.relations');
  if (!relationsResult.ok) {
    fail(
      'INVALID_GRAPH_MATERIAL',
      'definition graph envelope.relations',
      relationsResult.issue.violation === 'NOT_AN_ARRAY'
        ? 'must be an array of Definition relations'
        : describeRecordSafetyIssue(relationsResult.issue),
    );
  }
  const componentList = componentsResult.snapshot;
  const relationList = relationsResult.snapshot;

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

  const relationSnapshots: Record<string, unknown>[] = [];
  for (const [index, relation] of relationList.entries()) {
    relationSnapshots.push(
      validateRelationStructure(relation, `definition graph envelope.relations[${index}]`),
    );
  }

  for (const [index, snapshot] of relationSnapshots.entries()) {
    const sourceComponentId = snapshot.sourceComponentId as string;
    const targetComponentId = snapshot.targetComponentId as string;
    if (!boundIds.has(sourceComponentId)) {
      fail(
        'DANGLING_COMPONENT_REF',
        `definition graph envelope.relations[${index}].sourceComponentId`,
        `references "${sourceComponentId}", which is not a bound component of this graph`,
      );
    }
    if (!boundIds.has(targetComponentId)) {
      fail(
        'DANGLING_COMPONENT_REF',
        `definition graph envelope.relations[${index}].targetComponentId`,
        `references "${targetComponentId}", which is not a bound component of this graph`,
      );
    }
  }

  const contentByRelationId = new Map<string, string>();
  const relationIdByTriple = new Map<string, string>();
  for (const [index, snapshot] of relationSnapshots.entries()) {
    const relationId = snapshot.relationId as string;
    const contentKey = JSON.stringify([
      snapshot.relationKind as string,
      snapshot.sourceComponentId as string,
      snapshot.targetComponentId as string,
    ]);
    const seenContent = contentByRelationId.get(relationId);
    if (seenContent !== undefined) {
      if (seenContent === contentKey) {
        fail(
          'DUPLICATE_RELATION',
          `definition graph envelope.relations[${index}]`,
          `declares relationId "${relationId}" more than once (relations are included exactly once; the validator never deduplicates)`,
        );
      }
      fail(
        'CONFLICTING_RELATION',
        `definition graph envelope.relations[${index}]`,
        `reuses relationId "${relationId}" for differing kind/endpoints`,
      );
    }
    contentByRelationId.set(relationId, contentKey);

    const existingRelationId = relationIdByTriple.get(contentKey);
    if (existingRelationId !== undefined) {
      fail(
        'CONFLICTING_RELATION',
        `definition graph envelope.relations[${index}]`,
        `declares the same (source, target, relationKind) triple under relationIds "${existingRelationId}" and "${relationId}"`,
      );
    }
    relationIdByTriple.set(contentKey, relationId);
  }

  if ('nonMaterialExtensions' in view) {
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
 * Normalized (order-insensitive) Definition graph digest through the existing
 * canonical-JSON + Sha256Port seam.
 *
 * Component semantic material is represented exactly once as
 * `{ componentId, componentSemanticDigest }`. The content digest is delegated
 * to T001B's canonical Component digest path, so non-material extensions stay
 * excluded and required semantic/capability reference collections retain the
 * same normalized set semantics at both Component and Definition identity
 * layers. Typed relations are included exactly once at graph level.
 *
 * Torn-snapshot safety (#555 FULL_REVIEW_SUPPLEMENT): `Sha256Port` is async
 * and the caller owns the envelope, so after validation every
 * authority-bearing value that enters graph material is snapshotted
 * synchronously, before the first caller-visible async suspension —
 * `graphId` (an immutable string), each relation copied field-by-field into
 * a fresh record, and each Component's canonical digest material built via
 * the exported pure T001B normalizer. `envelope.graphId`,
 * `envelope.components` and `envelope.relations` are never re-read after
 * that point, so a caller mutating its own graph while a digest promise is
 * pending can never produce a torn hybrid snapshot. Validation additionally
 * guarantees the envelope carries no accessor-backed fields (#578), so the
 * synchronous snapshot cannot observe validation-to-use drift either.
 */
export async function computeDefinitionGraphDigest(
  envelope: DefinitionGraphEnvelope,
  sha256: Sha256Port,
): Promise<ContentDigest> {
  validateDefinitionGraphEnvelope(envelope);

  // Synchronous admitted-graph snapshot — see the doc comment above.
  const graphId: string = envelope.graphId;
  const relationSnapshot: DefinitionRelation[] = envelope.relations
    .map((relation) => ({
      relationId: relation.relationId,
      relationKind: relation.relationKind,
      sourceComponentId: relation.sourceComponentId,
      targetComponentId: relation.targetComponentId,
    }))
    .sort((a, b) => compareIds(a.relationId, b.relationId));
  const componentMaterials: Array<{
    componentId: ComponentId;
    material: ComponentSemanticDigestMaterial;
  }> = [...envelope.components]
    .sort((a, b) => compareIds(a.componentId, b.componentId))
    .map((component) => ({
      componentId: component.componentId,
      material: componentSemanticDigestMaterial(component),
    }));

  const components: Array<{ componentId: ComponentId; componentSemanticDigest: ContentDigest }> =
    await Promise.all(
      componentMaterials.map(async ({ componentId, material }) => ({
        componentId,
        componentSemanticDigest: await computeCanonicalJsonDigest(material, sha256),
      })),
    );

  const material = {
    domain: DEFINITION_GRAPH_DIGEST_DOMAIN,
    graphId,
    components,
    relations: relationSnapshot,
  };
  return computeCanonicalJsonDigest(material, sha256);
}
