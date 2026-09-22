import { createHash } from 'node:crypto';
export class NonCanonicalValueError extends Error {
    constructor(path, reason) {
        super(`value at ${path} is not canonical JSON: ${reason}`);
        this.name = 'NonCanonicalValueError';
    }
}
function normalize(value, path) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new NonCanonicalValueError(path, 'number must be finite');
        return Object.is(value, -0) ? 0 : value;
    }
    if (Array.isArray(value))
        return value.map((item, index) => normalize(item, `${path}[${index}]`));
    if (typeof value === 'object') {
        const source = value;
        const output = {};
        for (const key of Object.keys(source).sort()) {
            const item = source[key];
            if (item === undefined)
                throw new NonCanonicalValueError(`${path}.${key}`, 'undefined is not allowed');
            output[key] = normalize(item, `${path}.${key}`);
        }
        return output;
    }
    throw new NonCanonicalValueError(path, `unsupported type ${typeof value}`);
}
export function canonicalJson(value) {
    return JSON.stringify(normalize(value, '$'));
}
export function sha256Canonical(value) {
    return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
export function sha256Text(value) {
    return createHash('sha256').update(value).digest('hex');
}
