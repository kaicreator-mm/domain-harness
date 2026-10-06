import { carriesEmbeddedSelector, carriesFloatingOrRangeSemantics, carriesXRangeVersionSemantics, describeRecordSafetyIssue, isNonEmptyIdentityString, safeArraySnapshot, safeRecordSnapshot, } from './record-safety.js';
export class ResourceResolutionError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ResourceResolutionError';
        this.code = code;
    }
}
// ---------------------------------------------------------------------------
// Internal snapshot helpers (all synchronous, descriptor-safe, fail-closed)
// ---------------------------------------------------------------------------
function fail(code, message) {
    throw new ResourceResolutionError(code, message);
}
/** Snapshot one authority-bearing record, mapping descriptor issues to a typed failure. */
function requireSafeRecord(value, description, code) {
    const result = safeRecordSnapshot(value, description);
    if (!result.ok) {
        fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
/** Snapshot one authority-bearing array, mapping descriptor issues to a typed failure. */
function requireSafeArray(value, description, code) {
    const result = safeArraySnapshot(value, description);
    if (!result.ok) {
        fail(code, `${description} ${describeRecordSafetyIssue(result.issue)}`);
    }
    return result.snapshot;
}
/** Code-unit comparison only; `localeCompare` is forbidden in this module. */
function lexicalCompare(left, right) {
    return left < right ? -1 : left > right ? 1 : 0;
}
/** Exact identity string: non-empty, not an embedded `id@selector` form. */
function requireExactIdentityString(value, path, code) {
    if (typeof value !== 'string') {
        fail(code, `${path} must be a string`);
    }
    if (!isNonEmptyIdentityString(value)) {
        fail(code, `${path} must be a non-empty exact identity`);
    }
    if (carriesEmbeddedSelector(value)) {
        fail(code, `${path} must not embed a version selector (\`id@version\`); use the exact version field`);
    }
    return value;
}
/** Rejects mutable selection tokens and range operators; never normalizes. */
function requireNonFloatingIdentity(value, path, code) {
    if (carriesFloatingOrRangeSemantics(value)) {
        fail(code, `${path} must be an exact identity, not a floating/range selector (latest/current/active/default/*/x/range)`);
    }
}
/** Rejects floating/range/x-range version forms (`1.x`, `x`, `1.`). */
function requireExactVersion(value, path, code) {
    if (carriesFloatingOrRangeSemantics(value) || carriesXRangeVersionSemantics(value)) {
        fail(code, `${path} must be an exact version, not a floating/range/x-range selector (latest/current/active/default/*/x/range, 1.x, 1.)`);
    }
}
function requireExactIdentity(value, path, code) {
    const identity = requireExactIdentityString(value, path, code);
    requireNonFloatingIdentity(identity, path, code);
    return identity;
}
/** Snapshot one exact `{contractId, version}` reference as a fresh frozen object. */
function snapshotExactContractRef(value, path, code) {
    const candidate = requireSafeRecord(value, path, code);
    const keys = Object.keys(candidate).sort();
    if (keys.length !== 2 || !keys.includes('contractId') || !keys.includes('version')) {
        fail(code, `${path} must contain exactly {contractId, version}`);
    }
    const contractId = requireExactIdentity(candidate.contractId, `${path}.contractId`, code);
    const version = requireExactIdentityString(candidate.version, `${path}.version`, code);
    requireExactVersion(version, `${path}.version`, code);
    return Object.freeze({ contractId, version });
}
// ---------------------------------------------------------------------------
// Sealed-Assembly requirement material snapshot
// ---------------------------------------------------------------------------
const MATERIAL_FIELDS = new Set(['componentId', 'requirements']);
const REQUIREMENT_FIELDS = new Set(['resourceKey', 'contract', 'operationId', 'required']);
/**
 * Synchronously validate and snapshot the `record.resourceRequirements`
 * material of the Assembly being consumed. This is defensive re-validation of
 * the exact material T002B already canonicalized at sealing: descriptor-safe
 * snapshots, exact-identity fields only, the five-field #568 whitelist, and
 * duplicate fail-closed rules. The result is order-normalized (componentId,
 * then resourceKey) so provider call order is deterministic and independent
 * of any caller-owned ordering. Live values/secrets/handles remain
 * structurally unrepresentable.
 */
function snapshotRequirementsMaterial(value) {
    const entries = requireSafeArray(value, 'sealed assembly record.resourceRequirements', 'INVALID_RESOLUTION_INPUT');
    const seenOwners = new Set();
    const materials = entries.map((entry, index) => {
        const at = `sealed assembly record.resourceRequirements[${index}]`;
        const view = requireSafeRecord(entry, at, 'INVALID_RESOLUTION_INPUT');
        const unexpectedField = Object.keys(view).find((key) => !MATERIAL_FIELDS.has(key));
        if (unexpectedField !== undefined) {
            fail('INVALID_RESOLUTION_INPUT', `${at} must contain exactly {componentId, requirements}; unexpected field "${unexpectedField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`);
        }
        const componentId = requireExactIdentity(view.componentId, `${at}.componentId`, 'INVALID_RESOLUTION_INPUT');
        if (seenOwners.has(componentId)) {
            fail('INVALID_RESOLUTION_INPUT', `${at}.componentId declares ${componentId} more than once across the Assembly requirement material (duplicates are never first-wins)`);
        }
        seenOwners.add(componentId);
        const requirementsView = requireSafeArray(view.requirements, `${at}.requirements`, 'INVALID_RESOLUTION_INPUT');
        const seenResourceKeys = new Set();
        const requirements = requirementsView.map((candidate, requirementIndex) => {
            const path = `${at}.requirements[${requirementIndex}]`;
            const requirement = requireSafeRecord(candidate, path, 'INVALID_RESOLUTION_INPUT');
            const unexpectedRequirementField = Object.keys(requirement).find((key) => !REQUIREMENT_FIELDS.has(key));
            if (unexpectedRequirementField !== undefined) {
                fail('INVALID_RESOLUTION_INPUT', `${path} must not carry unknown field "${unexpectedRequirementField}" (live values, secrets, endpoints and handles are structurally unrepresentable)`);
            }
            const resourceKey = requireExactIdentity(requirement.resourceKey, `${path}.resourceKey`, 'INVALID_RESOLUTION_INPUT');
            if (seenResourceKeys.has(resourceKey)) {
                fail('INVALID_RESOLUTION_INPUT', `${path}.resourceKey declares ${resourceKey} more than once for one owner (resource keys are unique across component and operation scopes)`);
            }
            seenResourceKeys.add(resourceKey);
            if (typeof requirement.required !== 'boolean') {
                fail('INVALID_RESOLUTION_INPUT', `${path}.required must be an explicit boolean (no default, no coercion)`);
            }
            const material = { resourceKey, required: requirement.required };
            if ('contract' in requirement && requirement.contract !== undefined) {
                material.contract = snapshotExactContractRef(requirement.contract, `${path}.contract`, 'INVALID_RESOLUTION_INPUT');
            }
            if ('operationId' in requirement && requirement.operationId !== undefined) {
                material.operationId = requireExactIdentity(requirement.operationId, `${path}.operationId`, 'INVALID_RESOLUTION_INPUT');
            }
            return Object.freeze(material);
        });
        // Canonical order: resolution is deterministic and permutation-invariant.
        const sortedRequirements = Object.freeze([...requirements].sort((a, b) => lexicalCompare(a.resourceKey, b.resourceKey)));
        return Object.freeze({ componentId, requirements: sortedRequirements });
    });
    return Object.freeze([...materials].sort((a, b) => lexicalCompare(a.componentId, b.componentId)));
}
const RESOLVED_RESPONSE_FIELDS = new Set(['status', 'handle', 'contract', 'currentnessPin']);
const INCOMPATIBLE_RESPONSE_FIELDS = new Set(['status', 'supportedContracts']);
const ABSENT_RESPONSE_FIELDS = new Set(['status']);
const CURRENTNESS_PIN_FIELDS = new Set(['providerId', 'resourceKey', 'revisionDigest']);
/**
 * Synchronously validate and snapshot one T005C stable non-secret resource
 * currentness pin immediately after its await. Closed three-field whitelist
 * (`providerId`, `resourceKey`, `revisionDigest`) — a secret value,
 * credential, live handle, connection object, function or provider object has
 * NO representable field, and an unknown field (which is where such material
 * would have to ride) fails closed with only the offending KEY name in the
 * message. Identities must be exact (no floating/range/selector semantics, no
 * embedded `id@selector` form) and the pin's `resourceKey` must exactly equal
 * the requirement's key — a pin for a different resource is never evidence.
 */
function snapshotCurrentnessPin(value, path, expectedResourceKey) {
    const view = requireSafeRecord(value, path, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
    const unexpectedField = Object.keys(view).find((key) => !CURRENTNESS_PIN_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_RESOURCE_PROVIDER_RESPONSE', `${path} must contain exactly {providerId, resourceKey, revisionDigest}; unexpected field "${unexpectedField}" (secret values, credentials, live handles, connection objects, functions/module paths and provider objects are structurally unrepresentable in currentness evidence)`);
    }
    const providerId = requireExactIdentity(view.providerId, `${path}.providerId`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
    const resourceKey = requireExactIdentity(view.resourceKey, `${path}.resourceKey`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
    if (resourceKey !== expectedResourceKey) {
        fail('INVALID_RESOURCE_PROVIDER_RESPONSE', `${path}.resourceKey must exactly equal the requirement's resource identity "${expectedResourceKey}"; a pin for a different resource is never currentness evidence`);
    }
    const revisionDigest = requireExactIdentityString(view.revisionDigest, `${path}.revisionDigest`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
    requireExactVersion(revisionDigest, `${path}.revisionDigest`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
    return Object.freeze({ providerId, resourceKey, revisionDigest });
}
/**
 * Synchronously validate and snapshot one provider response immediately after
 * its await. Closed-world whitelists per status; exact refs only; handles are
 * kept as opaque references and never diagnosed. A provider cannot smuggle
 * secret-bearing fields into authority — unknown fields fail closed and only
 * the offending KEY name (never a value) participates in the message.
 */
function snapshotProviderResponse(raw, resourceKey) {
    const at = `resource provider response for "${resourceKey}"`;
    const view = requireSafeRecord(raw, at, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
    const status = view.status;
    if (status !== 'resolved' && status !== 'absent' && status !== 'incompatible') {
        fail('INVALID_RESOURCE_PROVIDER_RESPONSE', `${at} must carry status "resolved" | "absent" | "incompatible" (never a floating/default token)`);
    }
    if (status === 'resolved') {
        const unexpectedField = Object.keys(view).find((key) => !RESOLVED_RESPONSE_FIELDS.has(key));
        if (unexpectedField !== undefined) {
            fail('INVALID_RESOURCE_PROVIDER_RESPONSE', `${at} must contain exactly {status, handle, contract?, currentnessPin?}; unexpected field "${unexpectedField}" (provider responses cannot smuggle secret-bearing material into authority)`);
        }
        if (!('handle' in view)) {
            fail('INVALID_RESOURCE_PROVIDER_RESPONSE', `${at} resolved status must carry a handle`);
        }
        let contract;
        if ('contract' in view && view.contract !== undefined) {
            contract = snapshotExactContractRef(view.contract, `${at}.contract`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
        }
        let currentnessPin;
        if ('currentnessPin' in view && view.currentnessPin !== undefined) {
            currentnessPin = snapshotCurrentnessPin(view.currentnessPin, `${at}.currentnessPin`, resourceKey);
        }
        const response = { status, handle: view.handle };
        if (contract !== undefined) {
            response.contract = contract;
        }
        if (currentnessPin !== undefined) {
            response.currentnessPin = currentnessPin;
        }
        return Object.freeze(response);
    }
    if (status === 'incompatible') {
        const unexpectedField = Object.keys(view).find((key) => !INCOMPATIBLE_RESPONSE_FIELDS.has(key));
        if (unexpectedField !== undefined) {
            fail('INVALID_RESOURCE_PROVIDER_RESPONSE', `${at} must contain exactly {status, supportedContracts?}; unexpected field "${unexpectedField}"`);
        }
        if (!('supportedContracts' in view) || view.supportedContracts === undefined) {
            return Object.freeze({ status });
        }
        const contractsView = requireSafeArray(view.supportedContracts, `${at}.supportedContracts`, 'INVALID_RESOURCE_PROVIDER_RESPONSE');
        const supportedContracts = Object.freeze(contractsView.map((candidate, index) => snapshotExactContractRef(candidate, `${at}.supportedContracts[${index}]`, 'INVALID_RESOURCE_PROVIDER_RESPONSE')));
        return Object.freeze({ status, supportedContracts });
    }
    const unexpectedField = Object.keys(view).find((key) => !ABSENT_RESPONSE_FIELDS.has(key));
    if (unexpectedField !== undefined) {
        fail('INVALID_RESOURCE_PROVIDER_RESPONSE', `${at} must contain exactly {status}; unexpected field "${unexpectedField}"`);
    }
    return Object.freeze({ status });
}
// ---------------------------------------------------------------------------
// resolveToolResources — the T005B resolution boundary
// ---------------------------------------------------------------------------
const RESOLUTION_OPTION_FIELDS = new Set(['assembly', 'componentId', 'operationId', 'provider']);
/**
 * Resolve the exact sealed-Assembly resource requirements for one affected
 * Tool invocation scope, through the single injected `ResourceProvider`.
 *
 * Authority rules (#589 PACK-A T005B):
 *
 * - ONLY requirements contained in the exact sealed Assembly are resolved;
 *   the provider is asked exactly once per applicable requirement, in
 *   canonical (resourceKey) order, and nothing else;
 * - a required resource that is missing (`absent`) or incompatible (provider
 *   `incompatible`, or a `resolved` response whose exact contract does not
 *   exactly equal the Assembly requirement contract) fails closed with a
 *   typed error BEFORE this function returns — i.e. before any affected Tool
 *   invocation/effect authority can be granted by the caller. Failures are
 *   terminal: no retry, no second provider, no downgrade/latest/default;
 * - an optional resource that is missing or incompatible is returned as an
 *   explicit `absent` entry — never an ambient/default fallback value;
 * - resolved handles are opaque runtime values; when the provider supplies a
 *   T005C stable non-secret currentness pin it is validated (closed
 *   whitelist, exact identities, exact resourceKey match) and captured as a
 *   frozen/non-aliased snapshot on the entry — capture only, never authority
 *   (the T005C activation/currentness gate consumes and owns the posture);
 * - torn-snapshot discipline: all Assembly material and options are
 *   snapshotted synchronously before the first provider suspension, and every
 *   provider response is snapshotted synchronously right after its await. The
 *   caller mutating its own objects mid-resolution cannot affect the result;
 * - redaction: no error message ever contains a provider handle, a provider
 *   thrown-message, or any provider-supplied value — only exact identity
 *   strings from the Assembly material.
 */
export async function resolveToolResources(options) {
    // ---- PHASE 1 (synchronous): validate and snapshot all authority material.
    const view = requireSafeRecord(options, 'resource resolution options', 'INVALID_RESOLUTION_INPUT');
    const unexpectedOptionField = Object.keys(view).find((key) => !RESOLUTION_OPTION_FIELDS.has(key));
    if (unexpectedOptionField !== undefined) {
        fail('INVALID_RESOLUTION_INPUT', `resource resolution options must contain exactly {assembly, componentId, operationId?, provider}; unexpected field "${unexpectedOptionField}"`);
    }
    if (!('assembly' in view)) {
        fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.assembly is required');
    }
    if (!('componentId' in view)) {
        fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.componentId is required');
    }
    if (!('provider' in view)) {
        fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.provider is required');
    }
    const componentId = requireExactIdentity(view.componentId, 'resource resolution options.componentId', 'INVALID_RESOLUTION_INPUT');
    let operationId;
    if ('operationId' in view && view.operationId !== undefined) {
        operationId = requireExactIdentity(view.operationId, 'resource resolution options.operationId', 'INVALID_RESOLUTION_INPUT');
    }
    // The provider is a host BEHAVIOR port, not data: it is shape-checked, not
    // descriptor-snapshotted (a host class instance is a legitimate provider).
    const provider = view.provider;
    if (typeof provider !== 'object' ||
        provider === null ||
        typeof provider.resolve !== 'function') {
        fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.provider must be a ResourceProvider ({ resolve(request): Promise<ResourceProviderResponse> })');
    }
    const providerPort = provider;
    // NOTE: the sealed Assembly object itself carries the module-private T002B
    // brand symbol, so it is NOT descriptor-snapshotted here; only its
    // symbol-free serializable record material is consumed and snapshotted.
    if (typeof view.assembly !== 'object' || view.assembly === null || Array.isArray(view.assembly)) {
        fail('INVALID_RESOLUTION_INPUT', 'resource resolution options.assembly must be a sealed Runtime Assembly object');
    }
    const assemblyRecordView = requireSafeRecord(view.assembly.record, 'sealed assembly record', 'INVALID_RESOLUTION_INPUT');
    if (!('resourceRequirements' in assemblyRecordView)) {
        fail('INVALID_RESOLUTION_INPUT', 'sealed assembly record.resourceRequirements is required (resolution consumes the exact sealed Assembly material only)');
    }
    const materials = snapshotRequirementsMaterial(assemblyRecordView.resourceRequirements);
    // Select the affected owner's requirements. An operation-scoped requirement
    // applies only to that exact invocation operation; with no operationId,
    // only component-scope requirements are resolved.
    const ownerMaterial = materials.find((material) => material.componentId === componentId);
    const applicable = ownerMaterial === undefined
        ? []
        : ownerMaterial.requirements.filter((requirement) => requirement.operationId === undefined ||
            (operationId !== undefined && requirement.operationId === operationId));
    // Frozen per-requirement request snapshots — the only objects the provider
    // ever sees from this module.
    const requests = Object.freeze(applicable.map((requirement) => {
        const request = {
            componentId,
            resourceKey: requirement.resourceKey,
            required: requirement.required,
        };
        if (requirement.contract !== undefined) {
            request.contract = requirement.contract;
        }
        if (requirement.operationId !== undefined) {
            request.operationId = requirement.operationId;
        }
        return Object.freeze(request);
    }));
    // ---- PHASE 2 (async): one provider call per requirement, snapshots only.
    const resources = new Map();
    for (const request of requests) {
        let raw;
        try {
            raw = await providerPort.resolve(request);
        }
        catch {
            // Redaction: the provider's own error text (which may embed secrets) is
            // NEVER propagated; only the exact Assembly identity participates.
            fail('RESOURCE_PROVIDER_FAILURE', `the injected ResourceProvider failed while resolving resource "${request.resourceKey}" for component "${componentId}" (required=${request.required}); the failure is terminal — no retry, no fallback provider, no downgrade`);
        }
        const response = snapshotProviderResponse(raw, request.resourceKey);
        if (response.status === 'resolved') {
            const requiredContract = request.contract;
            const satisfiedContract = response.contract;
            const contractMatches = requiredContract === undefined ||
                (satisfiedContract !== undefined &&
                    satisfiedContract.contractId === requiredContract.contractId &&
                    satisfiedContract.version === requiredContract.version);
            if (!contractMatches) {
                if (request.required) {
                    fail('INCOMPATIBLE_RESOURCE', `required resource "${request.resourceKey}" for component "${componentId}" was resolved without the exact contract ${requiredContract.contractId}@${requiredContract.version} pinned in the sealed Assembly; incompatible resources fail closed before the affected invocation/effect`);
                }
                resources.set(request.resourceKey, Object.freeze({ resourceKey: request.resourceKey, status: 'absent' }));
                continue;
            }
            resources.set(request.resourceKey, Object.freeze({
                resourceKey: request.resourceKey,
                status: 'resolved',
                handle: response.handle,
                ...(response.currentnessPin === undefined
                    ? {}
                    : { currentnessPin: response.currentnessPin }),
            }));
            continue;
        }
        if (response.status === 'incompatible') {
            if (request.required) {
                fail('INCOMPATIBLE_RESOURCE', `the injected ResourceProvider reported resource "${request.resourceKey}" for component "${componentId}" as incompatible with the exact sealed-Assembly requirement; incompatible required resources fail closed before the affected invocation/effect`);
            }
            resources.set(request.resourceKey, Object.freeze({ resourceKey: request.resourceKey, status: 'absent' }));
            continue;
        }
        // Explicit absence: terminal for required resources, first-class for optional.
        if (request.required) {
            fail('MISSING_REQUIRED_RESOURCE', `required resource "${request.resourceKey}" for component "${componentId}" is explicitly absent from the injected ResourceProvider; missing required resources fail closed before the affected invocation/effect (no ambient, default, or fallback resource exists)`);
        }
        resources.set(request.resourceKey, Object.freeze({ resourceKey: request.resourceKey, status: 'absent' }));
    }
    const result = { componentId, resources };
    if (operationId !== undefined) {
        result.operationId = operationId;
    }
    return Object.freeze(result);
}
//# sourceMappingURL=resource-resolution.js.map