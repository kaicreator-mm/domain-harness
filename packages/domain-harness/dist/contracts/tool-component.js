/**
 * v0.7 Tool Component operation contract (issue #544, fine-grained DAG
 * T003A).
 *
 * The definition-plane envelope material for a Tool as an executable
 * functional module. A Tool Component is the existing `ComponentEnvelope`
 * with `family: 'tool'` whose `semanticBody` is exactly one
 * `ToolOperationsDeclaration` — a Tool carries operations; no second envelope
 * family and no Tool-specific envelope type exist here.
 *
 * Validation consumes the shared descriptor-safe record primitive and
 * unified exact-reference authority of `record-safety.ts` (#557 + #578):
 * the Tool operations declaration and every operation are validated on
 * descriptor-safe snapshots, so accessor-backed `operations` /
 * `providesCapabilities` material is rejected before any authority use.
 *
 * Boundaries owned by successor tasks — intentionally absent here:
 * - tool invocation runtime, authoritative-occurrence anchoring (T004);
 * - Domain Tool provider selection/catalogs (T003B);
 * - implementation binding/registries/pins (T003C/T002);
 * - runtime resource resolution and resource-requirement declarations (T005A);
 * - content digests (T001B), graph relations (T001C), admission (T001D);
 * - exposure authority: `declaredExposure` is declarative-only material and
 *   grants no authorization anywhere in this module (T004A/T004D).
 */
import { canonicalizeJson } from './identity.js';
import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, carriesXRangeVersionSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from './record-safety.js';
import { validateComponentEnvelope, } from './component.js';
/** The frozen lowercase effect literals; effect is required, never defaulted. */
const TOOL_OPERATION_EFFECTS = Object.freeze([
    'none',
    'idempotent',
    'non-idempotent',
]);
export class ToolComponentContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ToolComponentContractError';
        this.code = code;
    }
}
const DECLARATION_FIELDS = new Set(['operations', 'providesCapabilities']);
const OPERATION_FIELDS = new Set([
    'operationId',
    'inputSchema',
    'outputSchema',
    'effect',
    'declaredFailures',
    'declaredExposure',
]);
function fail(code, path, reason) {
    throw new ToolComponentContractError(code, `${path} ${reason}`);
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
/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`); never normalizes. */
function requireExactVersion(value, path) {
    if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
        fail('FLOATING_AUTHORITY_REFERENCE_FORBIDDEN', path, 'must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)');
    }
}
function requireExactIdentity(value, path, invalidCode) {
    requireExactIdentityString(value, path, invalidCode);
    requireNonFloatingIdentity(value, path);
}
function requireJsonMaterial(value, path, invalidCode) {
    try {
        canonicalizeJson(value);
    }
    catch {
        fail(invalidCode, path, 'must be portable JSON material');
    }
}
function requireExactCapabilityRef(ref, path) {
    const candidate = requireSafeRecord(ref, path, 'INVALID_TOOL_CAPABILITY_PROVIDES');
    const keys = Object.keys(candidate).sort();
    if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
        fail('INVALID_TOOL_CAPABILITY_PROVIDES', path, 'must contain exactly {capabilityId, version} (implementation/module identity is not part of a capability reference)');
    }
    requireExactIdentity(candidate.capabilityId, `${path}.capabilityId`, 'INVALID_TOOL_CAPABILITY_PROVIDES');
    requireExactIdentityString(candidate.version, `${path}.version`, 'INVALID_TOOL_CAPABILITY_PROVIDES');
    requireExactVersion(candidate.version, `${path}.version`);
}
function requireExactEffect(value, path) {
    if (typeof value !== 'string' || !TOOL_OPERATION_EFFECTS.includes(value)) {
        fail('INVALID_TOOL_OPERATION_EFFECT', path, `must be exactly one of ${TOOL_OPERATION_EFFECTS.join(' | ')} (no default, no case normalization)`);
    }
}
function validateOperation(candidate, path) {
    const operation = requireSafeRecord(candidate, path, 'INVALID_TOOL_OPERATION');
    const unexpectedField = Object.keys(operation).find((key) => !OPERATION_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_TOOL_OPERATION', path, `must not carry unknown field "${unexpectedField}" (implementation/binding/provider/resource/secret identity belongs to later concerns)`);
    }
    const { operationId, inputSchema, outputSchema, effect } = operation;
    requireExactIdentity(operationId, `${path}.operationId`, 'INVALID_TOOL_OPERATION_ID');
    requireJsonMaterial(inputSchema, `${path}.inputSchema`, 'INVALID_TOOL_OPERATION_INPUT');
    requireJsonMaterial(outputSchema, `${path}.outputSchema`, 'INVALID_TOOL_OPERATION_OUTPUT');
    requireExactEffect(effect, `${path}.effect`);
    const seenFailures = new Set();
    if ('declaredFailures' in operation) {
        const failures = operation.declaredFailures;
        const failuresResult = safeArraySnapshot(failures, `${path}.declaredFailures`);
        if (!failuresResult.ok) {
            fail('INVALID_TOOL_OPERATION_FAILURE', `${path}.declaredFailures`, failuresResult.issue.violation === 'NOT_AN_ARRAY'
                ? 'must be an array of exact failure-code identities'
                : describeRecordSafetyIssue(failuresResult.issue));
        }
        for (const [index, code] of failuresResult.snapshot.entries()) {
            const failurePath = `${path}.declaredFailures[${index}]`;
            requireExactIdentityString(code, failurePath, 'INVALID_TOOL_OPERATION_FAILURE');
            requireNonFloatingIdentity(code, failurePath);
            if (seenFailures.has(code)) {
                fail('INVALID_TOOL_OPERATION_FAILURE', failurePath, `declares ${code.trim()} more than once (exact failure identities only)`);
            }
            seenFailures.add(code);
        }
    }
    if ('declaredExposure' in operation) {
        requireJsonMaterial(operation.declaredExposure, `${path}.declaredExposure`, 'INVALID_TOOL_OPERATION_EXPOSURE');
    }
}
function validateDeclaration(body) {
    const declaration = requireSafeRecord(body, 'component envelope.semanticBody', 'INVALID_TOOL_COMPONENT_ENVELOPE');
    const unexpectedField = Object.keys(declaration).find((key) => !DECLARATION_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_TOOL_OPERATIONS', 'tool operations declaration', `must not carry unknown field "${unexpectedField}" (implementation/binding/provider/resource identity belongs to later concerns)`);
    }
    const { operations, providesCapabilities } = declaration;
    const operationsResult = safeArraySnapshot(operations, 'tool operations declaration.operations');
    if (!operationsResult.ok || operationsResult.snapshot.length < 1) {
        fail('INVALID_TOOL_OPERATIONS', 'tool operations declaration.operations', operationsResult.ok
            ? 'must be a non-empty array of operations ([1..*])'
            : operationsResult.issue.violation === 'NOT_AN_ARRAY'
                ? 'must be a non-empty array of operations ([1..*])'
                : describeRecordSafetyIssue(operationsResult.issue));
    }
    const seenOperationIds = new Set();
    for (const [index, candidate] of operationsResult.snapshot.entries()) {
        const operationPath = `tool operations declaration.operations[${index}]`;
        validateOperation(candidate, operationPath);
        const operationId = candidate.operationId;
        if (seenOperationIds.has(operationId)) {
            fail('INVALID_TOOL_OPERATION_ID', `${operationPath}.operationId`, `declares ${operationId} more than once (operation ids are unique within one Tool Component)`);
        }
        seenOperationIds.add(operationId);
    }
    const providesResult = safeArraySnapshot(providesCapabilities, 'tool operations declaration.providesCapabilities');
    if (!providesResult.ok) {
        fail('INVALID_TOOL_CAPABILITY_PROVIDES', 'tool operations declaration.providesCapabilities', providesResult.issue.violation === 'NOT_AN_ARRAY'
            ? 'must be an array of exact capability references (empty array = provides nothing)'
            : describeRecordSafetyIssue(providesResult.issue));
    }
    const seenCapabilityIds = new Set();
    for (const [index, ref] of providesResult.snapshot.entries()) {
        const refPath = `tool operations declaration.providesCapabilities[${index}]`;
        requireExactCapabilityRef(ref, refPath);
        const capabilityId = ref.capabilityId;
        if (seenCapabilityIds.has(capabilityId)) {
            fail('INVALID_TOOL_CAPABILITY_PROVIDES', refPath, `declares ${capabilityId} more than once (exact refs only)`);
        }
        seenCapabilityIds.add(capabilityId);
    }
}
/**
 * Structural fail-closed validation of one Tool Component. Runs the existing
 * `validateComponentEnvelope` first — its failures surface unchanged as
 * `ComponentContractError` — then applies Tool-specific structural validation
 * to a descriptor-safe snapshot of `semanticBody` as exactly one
 * `ToolOperationsDeclaration` (#578). Invalid exact identities are always
 * rejected, never silently normalized.
 */
export function validateToolComponent(envelope) {
    validateComponentEnvelope(envelope);
    const view = requireSafeRecord(envelope, 'component envelope', 'INVALID_TOOL_COMPONENT_ENVELOPE');
    if (view.family !== 'tool') {
        fail('INVALID_TOOL_COMPONENT_FAMILY', 'component envelope.family', "must be 'tool' for the Tool Component operation contract");
    }
    validateDeclaration(view.semanticBody);
}
//# sourceMappingURL=tool-component.js.map