export class IdentityContractError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'IdentityContractError';
        this.code = code;
    }
}
function failCanonical(path, reason) {
    throw new IdentityContractError('INVALID_CANONICAL_JSON', `cannot canonicalize ${path}: ${reason}`);
}
function assertNoSymbolKeys(value, path) {
    if (Object.getOwnPropertySymbols(value).length > 0) {
        failCanonical(path, 'symbol-keyed properties are not JSON');
    }
}
function requireDataProperty(value, key, path) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        failCanonical(path, 'JSON properties must be enumerable data properties');
    }
    return descriptor.value;
}
function canonicalize(value, path, ancestors) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            failCanonical(path, 'number must be finite');
        return value;
    }
    if (Array.isArray(value)) {
        if (ancestors.has(value))
            failCanonical(path, 'circular reference');
        assertNoSymbolKeys(value, path);
        ancestors.add(value);
        const result = [];
        for (let index = 0; index < value.length; index += 1) {
            const key = String(index);
            if (!Object.prototype.hasOwnProperty.call(value, key)) {
                failCanonical(`${path}[${index}]`, 'sparse array entries are not canonical JSON');
            }
            result.push(canonicalize(requireDataProperty(value, key, `${path}[${index}]`), `${path}[${index}]`, ancestors));
        }
        const unexpectedKeys = Object.getOwnPropertyNames(value).filter((key) => {
            if (key === 'length')
                return false;
            if (!/^(0|[1-9]\d*)$/.test(key))
                return true;
            const index = Number(key);
            return !Number.isSafeInteger(index) || index < 0 || index >= value.length;
        });
        if (unexpectedKeys.length > 0) {
            failCanonical(path, 'arrays may not carry extra object properties');
        }
        ancestors.delete(value);
        return result;
    }
    if (typeof value === 'object' && value !== null) {
        if (ancestors.has(value))
            failCanonical(path, 'circular reference');
        assertNoSymbolKeys(value, path);
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            failCanonical(path, 'semantic objects must be plain JSON objects');
        }
        const ownNames = Object.getOwnPropertyNames(value);
        const nonEnumerable = ownNames.filter((key) => !Object.prototype.propertyIsEnumerable.call(value, key));
        if (nonEnumerable.length > 0) {
            failCanonical(path, 'non-enumerable properties are not canonical JSON');
        }
        ancestors.add(value);
        // Null-prototype avoids special setters such as Object.prototype.__proto__.
        const result = Object.create(null);
        for (const key of ownNames.sort()) {
            result[key] = canonicalize(requireDataProperty(value, key, `${path}.${key}`), `${path}.${key}`, ancestors);
        }
        ancestors.delete(value);
        return result;
    }
    failCanonical(path, `unsupported value type ${typeof value}`);
}
/**
 * Convert JSON-compatible semantic material into a deterministic structure.
 * Object keys are sorted recursively; array order is preserved.
 */
export function canonicalizeJson(value) {
    return canonicalize(value, '$', new Set());
}
/** Deterministic UTF-8 material used as input to content-addressed digests. */
export function canonicalJsonStringify(value) {
    const encoded = JSON.stringify(canonicalizeJson(value));
    if (encoded === undefined)
        failCanonical('$', 'value did not produce JSON text');
    return encoded;
}
/** Compute a canonical SHA-256 content digest through the portable host seam. */
export async function computeCanonicalJsonDigest(value, sha256) {
    const digest = await sha256.digestUtf8(canonicalJsonStringify(value));
    if (typeof digest !== 'string' || digest.length === 0) {
        throw new IdentityContractError('INVALID_CONTENT_DIGEST', 'Sha256Port returned an empty or invalid content digest');
    }
    return digest;
}
export function isContentDigest(value) {
    return typeof value === 'string' && value.length > 0;
}
//# sourceMappingURL=identity.js.map