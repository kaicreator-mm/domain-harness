/** v0.10.2 canonical owner of retained v8 structural-snapshot semantics. */
/** Typed error taxonomy for the public v8 qualified-package ABI. */
export class QualifiedPackageError extends Error {
    code;
    /**
     * #1023 S03: when the package-lifecycle failure path ran a reverse-order
     * cleanup and one or more `dispose(context)` hooks FAILED, the typed
     * primary error carries the per-package failures here — the primary
     * code/message is never erased or replaced by a cleanup failure.
     */
    cleanupFailures;
    constructor(code, message) {
        super(message);
        this.name = 'QualifiedPackageError';
        this.code = code;
    }
}
/**
 * Record-safe canonical JSON snapshot (adapted from #956 R3 repaired
 * candidate-validator `data()`): descriptors are inspected BEFORE any value
 * is read, so hostile getters/accessors on an untrusted root are never
 * invoked, own `__proto__`/`constructor`/`prototype` keys are refused, and
 * the result is a plain, prototype-free canonical value.
 */
export function canonicalSnapshot(value, path = '$') {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || Object.is(value, -0)) {
            throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} carries a non-canonical number`);
        }
        return value;
    }
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
        throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} carries a non-JSON ${typeof value}`);
    }
    if (Array.isArray(value)) {
        if (Object.getPrototypeOf(value) !== Array.prototype) {
            throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} is not a plain array`);
        }
        // The lib typings model the array length slot as `number`; we must
        // inspect its actual descriptor shape instead.
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const lengthDescriptor = descriptors.length;
        if (lengthDescriptor === undefined
            || !Object.hasOwn(lengthDescriptor, 'value')
            || !Number.isSafeInteger(lengthDescriptor.value)
            || lengthDescriptor.value < 0
            || lengthDescriptor.enumerable
            || lengthDescriptor.configurable) {
            throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path}.length descriptor is not the intrinsic array length`);
        }
        const length = lengthDescriptor.value;
        if (Reflect.ownKeys(descriptors).length !== length + 1) {
            throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} has non-index own keys`);
        }
        const items = [];
        for (let index = 0; index < length; index += 1) {
            const descriptor = descriptors[String(index)];
            if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
                throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path}[${index}] is not an own enumerable data slot`);
            }
            items.push(canonicalSnapshot(descriptor.value, `${path}[${index}]`));
        }
        return items;
    }
    if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
        throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} must be a plain JSON object`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const result = Object.create(null);
    for (const key of Object.keys(value).sort()) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path}.${key} is a dangerous own key`);
        }
        const descriptor = descriptors[key];
        if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
            throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path}.${key} is not an own enumerable data slot (accessors are refused)`);
        }
        result[key] = canonicalSnapshot(descriptor.value, `${path}.${key}`);
    }
    if (Reflect.ownKeys(descriptors).length !== Object.keys(value).length) {
        throw new QualifiedPackageError('ROOT_RECORD_UNSAFE', `${path} has non-enumerable own keys`);
    }
    return result;
}
