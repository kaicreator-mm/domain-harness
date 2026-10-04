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
const FLOATING_SELECTOR_TOKENS = new Set(['latest', 'current', 'active', 'default', '*']);
/** Range/wildcard operators never occur in an exact identity string. */
const FLOATING_SELECTOR_PATTERN = /[\^~<>|*]/;
function fail(code, path, reason) {
    throw new ToolComponentContractError(code, `${path} ${reason}`);
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function ownKeys(value) {
    return Object.keys(value).filter((key) => Object.prototype.propertyIsEnumerable.call(value, key));
}
/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(value, path, invalidCode) {
    if (typeof value !== 'string') {
        fail(invalidCode, path, 'must be a string');
    }
    if (value.trim().length === 0) {
        fail(invalidCode, path, 'must be a non-empty exact identity');
    }
    if (value.includes('@')) {
        fail(invalidCode, path, 'must not embed a version selector (`id@version`); use the exact version field');
    }
}
/** Rejects mutable selection tokens; never normalizes them to a default. */
function requireNonFloating(value, path) {
    if (FLOATING_SELECTOR_TOKENS.has(value.trim().toLowerCase()) || FLOATING_SELECTOR_PATTERN.test(value)) {
        fail('FLOATING_AUTHORITY_REFERENCE_FORBIDDEN', path, 'must be an exact identity, not a floating/range selector (latest/current/active/default/*/range)');
    }
}
function requireExactIdentity(value, path, invalidCode) {
    requireExactIdentityString(value, path, invalidCode);
    requireNonFloating(value, path);
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
    if (!isPlainObject(ref)) {
        fail('INVALID_TOOL_CAPABILITY_PROVIDES', path, 'must be an exact reference object');
    }
    const keys = ownKeys(ref).sort();
    if (keys.length !== 2 || !keys.includes('capabilityId') || !keys.includes('version')) {
        fail('INVALID_TOOL_CAPABILITY_PROVIDES', path, 'must contain exactly {capabilityId, version} (implementation/module identity is not part of a capability reference)');
    }
    requireExactIdentity(ref.capabilityId, `${path}.capabilityId`, 'INVALID_TOOL_CAPABILITY_PROVIDES');
    requireExactIdentityString(ref.version, `${path}.version`, 'INVALID_TOOL_CAPABILITY_PROVIDES');
    requireNonFloating(ref.version, `${path}.version`);
}
function requireExactEffect(value, path) {
    if (typeof value !== 'string' || !TOOL_OPERATION_EFFECTS.includes(value)) {
        fail('INVALID_TOOL_OPERATION_EFFECT', path, `must be exactly one of ${TOOL_OPERATION_EFFECTS.join(' | ')} (no default, no case normalization)`);
    }
}
function validateOperation(candidate, path) {
    if (!isPlainObject(candidate)) {
        fail('INVALID_TOOL_OPERATION', path, 'must be a plain operation object');
    }
    const unexpectedField = ownKeys(candidate).find((key) => !OPERATION_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_TOOL_OPERATION', path, `must not carry unknown field "${unexpectedField}" (implementation/binding/provider/resource/secret identity belongs to later concerns)`);
    }
    const { operationId, inputSchema, outputSchema, effect } = candidate;
    requireExactIdentity(operationId, `${path}.operationId`, 'INVALID_TOOL_OPERATION_ID');
    requireJsonMaterial(inputSchema, `${path}.inputSchema`, 'INVALID_TOOL_OPERATION_INPUT');
    requireJsonMaterial(outputSchema, `${path}.outputSchema`, 'INVALID_TOOL_OPERATION_OUTPUT');
    requireExactEffect(effect, `${path}.effect`);
    const seenFailures = new Set();
    if ('declaredFailures' in candidate) {
        if (!Array.isArray(candidate.declaredFailures)) {
            fail('INVALID_TOOL_OPERATION_FAILURE', `${path}.declaredFailures`, 'must be an array of exact failure-code identities');
        }
        for (const [index, code] of candidate.declaredFailures.entries()) {
            const failurePath = `${path}.declaredFailures[${index}]`;
            requireExactIdentityString(code, failurePath, 'INVALID_TOOL_OPERATION_FAILURE');
            requireNonFloating(code, failurePath);
            if (seenFailures.has(code)) {
                fail('INVALID_TOOL_OPERATION_FAILURE', failurePath, `declares ${code.trim()} more than once (exact failure identities only)`);
            }
            seenFailures.add(code);
        }
    }
    if ('declaredExposure' in candidate) {
        requireJsonMaterial(candidate.declaredExposure, `${path}.declaredExposure`, 'INVALID_TOOL_OPERATION_EXPOSURE');
    }
}
function validateDeclaration(body) {
    if (!isPlainObject(body)) {
        fail('INVALID_TOOL_COMPONENT_ENVELOPE', 'component envelope.semanticBody', 'must be exactly one Tool operations declaration object');
    }
    const unexpectedField = ownKeys(body).find((key) => !DECLARATION_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_TOOL_OPERATIONS', 'tool operations declaration', `must not carry unknown field "${unexpectedField}" (implementation/binding/provider/resource identity belongs to later concerns)`);
    }
    const { operations, providesCapabilities } = body;
    if (!Array.isArray(operations) || operations.length < 1) {
        fail('INVALID_TOOL_OPERATIONS', 'tool operations declaration.operations', 'must be a non-empty array of operations ([1..*])');
    }
    const seenOperationIds = new Set();
    for (const [index, candidate] of operations.entries()) {
        const operationPath = `tool operations declaration.operations[${index}]`;
        validateOperation(candidate, operationPath);
        const operationId = candidate.operationId;
        if (seenOperationIds.has(operationId)) {
            fail('INVALID_TOOL_OPERATION_ID', `${operationPath}.operationId`, `declares ${operationId} more than once (operation ids are unique within one Tool Component)`);
        }
        seenOperationIds.add(operationId);
    }
    if (!Array.isArray(providesCapabilities)) {
        fail('INVALID_TOOL_CAPABILITY_PROVIDES', 'tool operations declaration.providesCapabilities', 'must be an array of exact capability references (empty array = provides nothing)');
    }
    const seenCapabilityIds = new Set();
    for (const [index, ref] of providesCapabilities.entries()) {
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
 * to `semanticBody` as exactly one `ToolOperationsDeclaration`. Invalid exact
 * identities are always rejected, never silently normalized.
 */
export function validateToolComponent(envelope) {
    validateComponentEnvelope(envelope);
    if (envelope.family !== 'tool') {
        fail('INVALID_TOOL_COMPONENT_FAMILY', 'component envelope.family', "must be 'tool' for the Tool Component operation contract");
    }
    validateDeclaration(envelope.semanticBody);
}
//# sourceMappingURL=tool-component.js.map