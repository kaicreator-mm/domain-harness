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
import { validateComponentEnvelope, } from './component.js';
import { componentSemanticDigestMaterial, } from './component-digest.js';
import { canonicalizeJson, computeCanonicalJsonDigest, } from './identity.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from './record-safety.js';
/**
 * Versioned Definition graph digest domain tag, owned exclusively by this
 * file. Distinct from any per-Component digest domain (T001B) and from the
 * legacy v0.3 domain-data artifact identity material, which carries no
 * domain tag at all — historical identities never change.
 */
export const DEFINITION_GRAPH_DIGEST_DOMAIN = 'kaicreator.definition-graph.digest.v1';
export class DefinitionGraphContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'DefinitionGraphContractError';
        this.code = code;
    }
}
const GRAPH_FIELDS = new Set(['graphId', 'components', 'relations', 'nonMaterialExtensions']);
const RELATION_FIELDS = new Set([
    'relationId',
    'relationKind',
    'sourceComponentId',
    'targetComponentId',
]);
function fail(code, path, reason) {
    throw new DefinitionGraphContractError(code, `${path} ${reason}`);
}
/** Rejects mutable selection tokens, range operators and `id@version` embedding. */
function requireNonFloatingIdentity(value, path) {
    if (carriesFloatingOrRangeSemantics(value)) {
        fail('FLOATING_AUTHORITY_REFERENCE_FORBIDDEN', path, 'must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range) or an embedded `id@version`');
    }
}
/** Exact graph identity string: non-empty, not an embedded `id@selector` form. */
function requireGraphIdentity(value, path) {
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
function requireRelationIdentity(value, path, invalidCode) {
    if (typeof value !== 'string') {
        fail(invalidCode, path, 'must be a string');
    }
    if (!isNonEmptyIdentityString(value)) {
        fail(invalidCode, path, 'must be a non-empty exact identity');
    }
    if (carriesEmbeddedSelector(value)) {
        fail('FLOATING_AUTHORITY_REFERENCE_FORBIDDEN', path, 'must be an exact identity, not an embedded `id@version` selector');
    }
    requireNonFloatingIdentity(value, path);
}
/**
 * Structural validation of one relation entry (identity strings only) on a
 * descriptor-safe snapshot. Returns the validated snapshot so later
 * validation phases never re-read the caller-owned relation object.
 */
function validateRelationStructure(relation, path) {
    const result = safeRecordSnapshot(relation, path);
    if (!result.ok) {
        fail('INVALID_RELATION', path, describeRecordSafetyIssue(result.issue));
    }
    const candidate = result.snapshot;
    const unexpectedField = Object.keys(candidate).find((key) => !RELATION_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_RELATION', path, `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to later concerns)`);
    }
    requireRelationIdentity(candidate.relationId, `${path}.relationId`, 'INVALID_RELATION_ID');
    requireRelationIdentity(candidate.relationKind, `${path}.relationKind`, 'INVALID_RELATION_KIND');
    requireRelationIdentity(candidate.sourceComponentId, `${path}.sourceComponentId`, 'INVALID_RELATION');
    requireRelationIdentity(candidate.targetComponentId, `${path}.targetComponentId`, 'INVALID_RELATION');
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
export function validateDefinitionGraphEnvelope(envelope) {
    const graphResult = safeRecordSnapshot(envelope, 'definition graph envelope');
    if (!graphResult.ok) {
        fail('INVALID_GRAPH_ENVELOPE', 'definition graph envelope', describeRecordSafetyIssue(graphResult.issue));
    }
    const view = graphResult.snapshot;
    const unexpectedField = Object.keys(view).find((key) => !GRAPH_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_GRAPH_ENVELOPE', 'definition graph envelope', `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to later concerns)`);
    }
    const { graphId, components, relations, nonMaterialExtensions } = view;
    requireGraphIdentity(graphId, 'definition graph envelope.graphId');
    const componentsResult = safeArraySnapshot(components, 'definition graph envelope.components');
    if (!componentsResult.ok) {
        fail('INVALID_GRAPH_MATERIAL', 'definition graph envelope.components', componentsResult.issue.violation === 'NOT_AN_ARRAY'
            ? 'must be an array of bound Component envelopes'
            : describeRecordSafetyIssue(componentsResult.issue));
    }
    const relationsResult = safeArraySnapshot(relations, 'definition graph envelope.relations');
    if (!relationsResult.ok) {
        fail('INVALID_GRAPH_MATERIAL', 'definition graph envelope.relations', relationsResult.issue.violation === 'NOT_AN_ARRAY'
            ? 'must be an array of Definition relations'
            : describeRecordSafetyIssue(relationsResult.issue));
    }
    const componentList = componentsResult.snapshot;
    const relationList = relationsResult.snapshot;
    const boundIds = new Set();
    for (const [index, component] of componentList.entries()) {
        validateComponentEnvelope(component);
        const componentId = component.componentId;
        if (boundIds.has(componentId)) {
            fail('INVALID_GRAPH_MATERIAL', `definition graph envelope.components[${index}]`, `binds componentId "${componentId}" more than once (a graph identity must stay order-insensitive and unambiguous)`);
        }
        boundIds.add(componentId);
    }
    const relationSnapshots = [];
    for (const [index, relation] of relationList.entries()) {
        relationSnapshots.push(validateRelationStructure(relation, `definition graph envelope.relations[${index}]`));
    }
    for (const [index, snapshot] of relationSnapshots.entries()) {
        const sourceComponentId = snapshot.sourceComponentId;
        const targetComponentId = snapshot.targetComponentId;
        if (!boundIds.has(sourceComponentId)) {
            fail('DANGLING_COMPONENT_REF', `definition graph envelope.relations[${index}].sourceComponentId`, `references "${sourceComponentId}", which is not a bound component of this graph`);
        }
        if (!boundIds.has(targetComponentId)) {
            fail('DANGLING_COMPONENT_REF', `definition graph envelope.relations[${index}].targetComponentId`, `references "${targetComponentId}", which is not a bound component of this graph`);
        }
    }
    const contentByRelationId = new Map();
    const relationIdByTriple = new Map();
    for (const [index, snapshot] of relationSnapshots.entries()) {
        const relationId = snapshot.relationId;
        const contentKey = JSON.stringify([
            snapshot.relationKind,
            snapshot.sourceComponentId,
            snapshot.targetComponentId,
        ]);
        const seenContent = contentByRelationId.get(relationId);
        if (seenContent !== undefined) {
            if (seenContent === contentKey) {
                fail('DUPLICATE_RELATION', `definition graph envelope.relations[${index}]`, `declares relationId "${relationId}" more than once (relations are included exactly once; the validator never deduplicates)`);
            }
            fail('CONFLICTING_RELATION', `definition graph envelope.relations[${index}]`, `reuses relationId "${relationId}" for differing kind/endpoints`);
        }
        contentByRelationId.set(relationId, contentKey);
        const existingRelationId = relationIdByTriple.get(contentKey);
        if (existingRelationId !== undefined) {
            fail('CONFLICTING_RELATION', `definition graph envelope.relations[${index}]`, `declares the same (source, target, relationKind) triple under relationIds "${existingRelationId}" and "${relationId}"`);
        }
        relationIdByTriple.set(contentKey, relationId);
    }
    if ('nonMaterialExtensions' in view) {
        try {
            canonicalizeJson(nonMaterialExtensions);
        }
        catch {
            fail('INVALID_GRAPH_MATERIAL', 'definition graph envelope.nonMaterialExtensions', 'must be portable JSON material');
        }
    }
}
function compareIds(a, b) {
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
export async function computeDefinitionGraphDigest(envelope, sha256) {
    validateDefinitionGraphEnvelope(envelope);
    // Synchronous admitted-graph snapshot — see the doc comment above.
    const graphId = envelope.graphId;
    const relationSnapshot = envelope.relations
        .map((relation) => ({
        relationId: relation.relationId,
        relationKind: relation.relationKind,
        sourceComponentId: relation.sourceComponentId,
        targetComponentId: relation.targetComponentId,
    }))
        .sort((a, b) => compareIds(a.relationId, b.relationId));
    const componentMaterials = [...envelope.components]
        .sort((a, b) => compareIds(a.componentId, b.componentId))
        .map((component) => ({
        componentId: component.componentId,
        material: componentSemanticDigestMaterial(component),
    }));
    const components = await Promise.all(componentMaterials.map(async ({ componentId, material }) => ({
        componentId,
        componentSemanticDigest: await computeCanonicalJsonDigest(material, sha256),
    })));
    const material = {
        domain: DEFINITION_GRAPH_DIGEST_DOMAIN,
        graphId,
        components,
        relations: relationSnapshot,
    };
    return computeCanonicalJsonDigest(material, sha256);
}
//# sourceMappingURL=definition-graph.js.map