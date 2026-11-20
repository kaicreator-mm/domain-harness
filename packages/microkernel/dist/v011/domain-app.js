import { PackageSystem, KdpLoadError } from './package-system.js';
import { isPlainJsonValue, validateJsonSubset } from './schema-subset.js';
function failedOutcome(code, message) {
    return { kind: 'FAILED', failure: { code, message } };
}
function unknownOutcome(code, message) {
    return { kind: 'UNKNOWN', unknownReason: { code, message } };
}
function isReasonObject(value) {
    return (typeof value === 'object' &&
        value !== null &&
        typeof value['code'] === 'string' &&
        typeof value['message'] === 'string');
}
/**
 * Normalize a raw implementation return value into the strict
 * FunctionOutcome union. Garbage never propagates: a well-formed outcome
 * kind the contract did not declare is normalized to UNKNOWN (honest
 * doubt), while a malformed implementation result is a runtime
 * enforcement failure reported as FAILED (never re-checked against the
 * declared outcome set — it is the runtime's own refusal, not an
 * implementation outcome).
 */
/**
 * Normalize a raw implementation return value into the strict
 * FunctionOutcome union. This function must NEVER throw: hostile or buggy
 * implementations may return Proxies with throwing traps, so every access
 * is guarded and mapped to a typed FAILED outcome. Kind/payload presence
 * uses plain own-property checks only (no prototype chain, no `in`).
 */
export function normalizeOutcome(raw, declaredOutcomes) {
    try {
        if (typeof raw === 'object' && raw !== null) {
            const outcome = raw;
            const kind = outcome['kind'];
            if (kind === 'SUCCEEDED' && hasOwn(outcome, 'value')) {
                const value = outcome['value'];
                if (!isPlainJsonValue(value)) {
                    return failedOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', 'implementation returned a non-JSON SUCCEEDED value');
                }
                if (!declaredOutcomes.includes('SUCCEEDED')) {
                    return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'SUCCEEDED'`);
                }
                return { kind: 'SUCCEEDED', value };
            }
            if (kind === 'UNKNOWN' && hasOwn(outcome, 'unknownReason') && isReasonObject(outcome['unknownReason'])) {
                if (!declaredOutcomes.includes('UNKNOWN')) {
                    return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'UNKNOWN'`);
                }
                return { kind: 'UNKNOWN', unknownReason: outcome['unknownReason'] };
            }
            if (kind === 'FAILED' && hasOwn(outcome, 'failure') && isReasonObject(outcome['failure'])) {
                if (!declaredOutcomes.includes('FAILED')) {
                    return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `contract did not declare outcome kind 'FAILED'`);
                }
                return { kind: 'FAILED', failure: outcome['failure'] };
            }
            if (typeof kind === 'string' && (kind === 'SUCCEEDED' || kind === 'UNKNOWN' || kind === 'FAILED')) {
                return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `implementation returned outcome kind '${kind}' missing its strict union payload`);
            }
            if (typeof kind === 'string' && !declaredOutcomes.includes(kind)) {
                return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `implementation returned outcome kind '${kind}' that the contract did not declare`);
            }
        }
        return failedOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', 'implementation returned a non-FunctionOutcome value');
    }
    catch (error) {
        // A Proxy/getter on the implementation's return value threw while being
        // inspected — an ordinary typed FAILED outcome, never a rejected invoke.
        return failedOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `implementation returned a value whose inspection threw: ${error.message}`);
    }
}
/** Own-property check that does not walk the prototype chain. */
function hasOwn(value, key) {
    return Object.prototype.hasOwnProperty.call(value, key);
}
/**
 * Schema validation that cannot reject: a throwing Proxy/getter on the
 * instance is a validation failure for the caller, mapped to a typed
 * FAILED outcome by the invoke pipeline.
 */
function safeValidateJsonSubset(instance, schema) {
    try {
        return validateJsonSubset(instance, schema);
    }
    catch {
        return false;
    }
}
export function createDomainApp(deps) {
    const { lock, packages } = deps;
    const status = deps.initialStatus;
    const suppressed = new Set(deps.suppressedIngress);
    let disposed = false;
    // Single-flight dispose: concurrent and repeated calls share ONE teardown
    // attempt — success resolves every caller with the same result, failure
    // rejects every caller with the same rejection, and technicalDispose is
    // never rerun.
    let disposeFlight = null;
    const ingressById = new Map(lock.ingress.map((entry) => [entry.id, entry]));
    async function invoke(ingressId, input) {
        if (disposed) {
            return failedOutcome('DH_RUNTIME_INGRESS_NOT_CALLABLE', 'app is disposed');
        }
        if (status !== 'READY' && status !== 'DEGRADED') {
            return failedOutcome('DH_RUNTIME_INGRESS_NOT_CALLABLE', `app status is ${status}; no ingress is callable`);
        }
        const entry = ingressById.get(ingressId);
        if (entry === undefined) {
            return failedOutcome('DH_RUNTIME_INGRESS_UNKNOWN', `ingress '${ingressId}' does not exist`);
        }
        if (status === 'DEGRADED' && suppressed.has(ingressId)) {
            return failedOutcome('DH_RUNTIME_INGRESS_NOT_CALLABLE', `ingress '${ingressId}' is suppressed by the DEGRADED app status`);
        }
        const selected = deps.ingressImpls.get(ingressId);
        if (selected === undefined) {
            return failedOutcome('DH_RUNTIME_INGRESS_UNKNOWN', `ingress '${ingressId}' has no selected implementation`);
        }
        if (selected.effects !== 'none') {
            return failedOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `function '${selected.ref.functionId}' declares effects '${selected.effects}'; 0.11.0 implements none`);
        }
        let schemas;
        try {
            schemas = await packages.functionSchemas(selected);
        }
        catch (error) {
            return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', error.message);
        }
        if (schemas === null) {
            return unknownOutcome('DH_RUNTIME_UNSUPPORTED_PROFILE', `input/output schema resources for function '${selected.ref.functionId}' are unavailable in this install`);
        }
        if (!safeValidateJsonSubset(input, schemas.input)) {
            return failedOutcome('DH_RUNTIME_INPUT_SCHEMA_MISMATCH', `input for ingress '${ingressId}' failed inputSchemaRef`);
        }
        let raw;
        try {
            raw = await selected.impl(input);
        }
        catch (error) {
            return failedOutcome('DH_KDP_PACKAGE_LOAD_FAILED', `implementation for ingress '${ingressId}' threw: ${error.message}`);
        }
        const outcome = normalizeOutcome(raw, selected.outcomes);
        if (outcome.kind === 'SUCCEEDED' && !safeValidateJsonSubset(outcome.value, schemas.output)) {
            return failedOutcome('DH_RUNTIME_OUTPUT_SCHEMA_MISMATCH', `SUCCEEDED value for ingress '${ingressId}' failed outputSchemaRef (reported as FAILED, never passed through)`);
        }
        return outcome;
    }
    async function inspect() {
        return {
            appIdentity: {
                id: lock.appIdentity.id,
                version: lock.appIdentity.version,
                lockDigest: lock.closureDigest,
            },
            target: lock.target,
            packages: lock.selectedPackages.map((pkg) => ({
                packageId: pkg.packageId,
                version: pkg.version,
                layer: pkg.layer,
                role: pkg.role,
            })),
            elements: lock.selectedElements.map((element) => ({
                ref: element.ref,
                ownerPackageId: element.ownerPackageId,
                visibility: element.visibility,
            })),
            functions: lock.selectedFunctions.map((fn) => ({
                ref: fn.ref,
                outcomes: fn.outcomes,
                effects: fn.effects,
            })),
            ingress: lock.ingress.map((entry) => ({ id: entry.id, optional: entry.optional })),
            suppressedIngress: status === 'DEGRADED' ? [...suppressed].sort() : [],
        };
    }
    function dispose() {
        if (disposeFlight === null) {
            disposeFlight = (async () => {
                try {
                    // Strict reverse technical teardown; no concurrent stop/drain semantics (PRD A07).
                    await packages.runTechnicalDispose();
                    return { status: 'DISPOSED' };
                }
                finally {
                    // The app is consumed by a dispose attempt regardless of outcome:
                    // after a failed teardown later invoke is refused, and repeat
                    // dispose keeps returning the latched rejection.
                    disposed = true;
                }
            })();
        }
        return disposeFlight;
    }
    return {
        get status() {
            return status;
        },
        invoke,
        inspect,
        dispose,
    };
}
export { KdpLoadError };
