/**
 * v0.7 Domain Component envelope and exact semantic reference contracts
 * (issue #535, fine-grained DAG T001A).
 *
 * The frozen L2 (v0.7 freeze + R2) defines `Domain Definition = Domain
 * Component Graph` with exactly two Product families, open versioned semantic
 * Kind contracts, and Capability as a stable requires/provides contract
 * identity. This file owns only the smallest additive envelope for those
 * dimensions.
 *
 * Validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578):
 * authority-bearing records must be ordinary/null-prototype objects of own
 * enumerable data properties, and the canonical exact-ref matrix rejects
 * floating tokens (`latest`/`current`/`active`/`default`/`*`/`x`), range
 * operators (`^ ~ < > | *`), x-range/partial versions (`1.x`, `x`, `1.`) and
 * embedded `id@version` selectors — validation only, never resolution.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - content/graph digests (T001B/T001C);
 * - must-understand admission (T001D);
 * - public barrel exposure and legacy isolation fixtures (T001E);
 * - implementation registries, assembly pins, tool runtime, resources (T002+).
 */
import { canonicalizeJson } from './identity.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, carriesXRangeVersionSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from './record-safety.js';
/** The two frozen Product families a Domain Component belongs to. */
export const COMPONENT_FAMILIES = Object.freeze(['semantic', 'tool']);
export class ComponentContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ComponentContractError';
        this.code = code;
    }
}
const ENVELOPE_FIELDS = new Set([
    'family',
    'componentId',
    'kind',
    'requiredSemanticContracts',
    'requiredCapabilities',
    'semanticBody',
    'nonMaterialExtensions',
]);
function fail(code, path, reason) {
    throw new ComponentContractError(code, `${path} ${reason}`);
}
/** Snapshot an authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value, path, invalidCode) {
    const result = safeRecordSnapshot(value, path);
    if (!result.ok) {
        fail(invalidCode, path, describeRecordSafetyIssue(result.issue));
    }
    return result.snapshot;
}
/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(value, path, invalidCode) {
    if (typeof value !== 'string') {
        fail(invalidCode, path, 'must be a string');
    }
    if (!isNonEmptyIdentityString(value)) {
        fail(invalidCode, path, 'must be a non-empty exact identity');
    }
    if (carriesEmbeddedSelector(value)) {
        fail(invalidCode, path, 'must not embed a version selector (`id@version`); use the exact version field');
    }
}
/** Rejects mutable selection tokens and range operators; never normalizes. */
function requireNonFloatingIdentity(value, path) {
    if (carriesFloatingOrRangeSemantics(value)) {
        fail('FLOATING_AUTHORITY_REFERENCE_FORBIDDEN', path, 'must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)');
    }
}
/**
 * Rejects mutable selection tokens, range operators and x-range/partial
 * version forms (`1.x`, `x`, `1.`); never normalizes them to a default.
 */
function requireExactVersion(value, path) {
    if (carriesFloatingOrRangeSemantics(value) ||
        carriesXRangeVersionSemantics(value)) {
        fail('FLOATING_AUTHORITY_REFERENCE_FORBIDDEN', path, 'must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)');
    }
}
function requireExactIdentity(value, path, invalidCode) {
    requireExactIdentityString(value, path, invalidCode);
    requireNonFloatingIdentity(value, path);
}
function requireExactRef(ref, path, idField, invalidCode) {
    const candidate = requireSafeRecord(ref, path, invalidCode);
    const keys = Object.keys(candidate).sort();
    if (keys.length !== 2 || !keys.includes(idField) || !keys.includes('version')) {
        fail(invalidCode, path, `must contain exactly {${idField}, version} (implementation/module identity is not part of a contract reference)`);
    }
    requireExactIdentity(candidate[idField], `${path}.${idField}`, invalidCode);
    requireExactIdentityString(candidate.version, `${path}.version`, invalidCode);
    requireExactVersion(candidate.version, `${path}.version`);
    return candidate[idField];
}
function requireExactRefCollection(values, path, idField, invalidCode) {
    const result = safeArraySnapshot(values, path);
    if (!result.ok) {
        fail(invalidCode, path, result.issue.violation === 'NOT_AN_ARRAY'
            ? 'must be an array of exact references'
            : describeRecordSafetyIssue(result.issue));
    }
    const seen = new Set();
    for (const [index, ref] of result.snapshot.entries()) {
        const id = requireExactRef(ref, `${path}[${index}]`, idField, invalidCode);
        if (seen.has(id)) {
            fail(invalidCode, `${path}[${index}]`, `declares ${id} more than once (exact refs only)`);
        }
        seen.add(id);
    }
}
function requireJsonMaterial(value, path, invalidCode) {
    try {
        canonicalizeJson(value);
    }
    catch {
        fail(invalidCode, path, 'must be portable JSON material');
    }
}
/**
 * Structural fail-closed validation of a Component envelope. Invalid exact
 * identities are always rejected — never silently normalized to a
 * default/current value. Validation runs descriptor-safe on a snapshot of
 * the caller envelope (#578): accessor/symbol-keyed/non-enumerable material
 * and exotic prototypes are typed rejections, and no hidden getter can
 * execute during validation or diagnostics. The caller input is never
 * frozen or mutated.
 */
export function validateComponentEnvelope(envelope) {
    const view = requireSafeRecord(envelope, 'component envelope', 'INVALID_COMPONENT_ENVELOPE');
    const unexpectedField = Object.keys(view).find((key) => !ENVELOPE_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_COMPONENT_ENVELOPE', `component envelope`, `must not carry unknown field "${unexpectedField}" (implementation/assembly/runtime identity belongs to later concerns)`);
    }
    const { family, componentId, kind } = view;
    const { requiredSemanticContracts, requiredCapabilities, semanticBody, nonMaterialExtensions } = view;
    if (typeof family !== 'string' || !COMPONENT_FAMILIES.includes(family)) {
        fail('INVALID_COMPONENT_FAMILY', 'component envelope.family', `must be one of ${COMPONENT_FAMILIES.join(' | ')}`);
    }
    requireExactIdentity(componentId, 'component envelope.componentId', 'INVALID_COMPONENT_ID');
    requireExactRef(kind, 'component envelope.kind', 'kindId', 'INVALID_KIND_REF');
    requireExactRefCollection(requiredSemanticContracts, 'component envelope.requiredSemanticContracts', 'contractId', 'INVALID_SEMANTIC_CONTRACT_REF');
    requireExactRefCollection(requiredCapabilities, 'component envelope.requiredCapabilities', 'capabilityId', 'INVALID_CAPABILITY_REF');
    requireJsonMaterial(semanticBody, 'component envelope.semanticBody', 'INVALID_SEMANTIC_BODY');
    if ('nonMaterialExtensions' in view) {
        requireJsonMaterial(nonMaterialExtensions, 'component envelope.nonMaterialExtensions', 'INVALID_NON_MATERIAL_EXTENSIONS');
    }
}
//# sourceMappingURL=component.js.map