/**
 * DomainHarness v0.11.0 T03 (#1577) — minimal JSON Schema (draft 2020-12
 * subset) instance validator for runtime ingress enforcement (L2 §7.2.4).
 *
 * The runtime SDK stays minimal (CV-05): no third-party validator, no
 * compilation/AST machinery. Per JSON Schema semantics, keywords outside
 * this subset are ignored (unknown keywords are spec-conformant no-ops);
 * `$ref` resolution is not implemented in 0.11.0 — schemas for runtime
 * validation must be self-contained. Boolean schemas are supported.
 */
export function validateJsonSubset(instance, schema) {
    if (typeof schema === 'boolean')
        return schema;
    if (typeof schema !== 'object' || schema === null || Array.isArray(schema))
        return true;
    const s = schema;
    if ('const' in s && !deepJsonEqual(instance, s['const']))
        return false;
    if ('enum' in s) {
        const values = s['enum'];
        if (!Array.isArray(values) || !values.some((option) => deepJsonEqual(instance, option))) {
            return false;
        }
    }
    if ('type' in s && !matchesType(instance, s['type']))
        return false;
    if (typeof instance === 'number') {
        if (typeof s['minimum'] === 'number' && instance < s['minimum'])
            return false;
        if (typeof s['maximum'] === 'number' && instance > s['maximum'])
            return false;
        if (s['exclusiveMinimum'] === true && typeof s['minimum'] === 'number' && instance <= s['minimum']) {
            return false;
        }
        if (typeof s['exclusiveMinimum'] === 'number' && instance <= s['exclusiveMinimum'])
            return false;
        if (typeof s['exclusiveMaximum'] === 'number' && instance >= s['exclusiveMaximum'])
            return false;
        if (typeof s['multipleOf'] === 'number' && s['multipleOf'] > 0 && !Number.isInteger(instance / s['multipleOf'])) {
            return false;
        }
    }
    if (typeof instance === 'string') {
        if (typeof s['minLength'] === 'number' && instance.length < s['minLength'])
            return false;
        if (typeof s['maxLength'] === 'number' && instance.length > s['maxLength'])
            return false;
        if (typeof s['pattern'] === 'string') {
            try {
                if (!new RegExp(s['pattern'], 'u').test(instance))
                    return false;
            }
            catch {
                // An unparsable pattern is an author-time defect; it does not match.
                return false;
            }
        }
    }
    if (Array.isArray(instance)) {
        if (typeof s['minItems'] === 'number' && instance.length < s['minItems'])
            return false;
        if (typeof s['maxItems'] === 'number' && instance.length > s['maxItems'])
            return false;
        const items = s['items'];
        if (items !== undefined && !instance.every((item) => validateJsonSubset(item, items)))
            return false;
        const prefixItems = s['prefixItems'];
        if (Array.isArray(prefixItems)) {
            for (let index = 0; index < prefixItems.length && index < instance.length; index += 1) {
                if (!validateJsonSubset(instance[index], prefixItems[index]))
                    return false;
            }
            if (s['items'] === false && instance.length > prefixItems.length)
                return false;
        }
        if (s['uniqueItems'] === true) {
            const seen = new Set();
            for (const item of instance) {
                const key = stableStringify(item);
                if (seen.has(key))
                    return false;
                seen.add(key);
            }
        }
    }
    if (typeof instance === 'object' && instance !== null && !Array.isArray(instance)) {
        const objectInstance = instance;
        const required = s['required'];
        if (Array.isArray(required)) {
            for (const key of required) {
                if (typeof key === 'string' && !(key in objectInstance))
                    return false;
            }
        }
        const properties = s['properties'];
        if (isPlainObject(properties)) {
            for (const [key, subschema] of Object.entries(properties)) {
                if (key in objectInstance && !validateJsonSubset(objectInstance[key], subschema))
                    return false;
            }
        }
        const additional = s['additionalProperties'];
        if (additional === false && isPlainObject(properties)) {
            for (const key of Object.keys(objectInstance)) {
                if (!(key in properties))
                    return false;
            }
        }
        else if (isPlainObject(additional)) {
            for (const key of Object.keys(objectInstance)) {
                const declared = isPlainObject(properties) && key in properties;
                if (!declared && !validateJsonSubset(objectInstance[key], additional))
                    return false;
            }
        }
        const minProperties = s['minProperties'];
        const maxProperties = s['maxProperties'];
        if (typeof minProperties === 'number' && Object.keys(objectInstance).length < minProperties)
            return false;
        if (typeof maxProperties === 'number' && Object.keys(objectInstance).length > maxProperties)
            return false;
    }
    if (Array.isArray(s['allOf']) && !s['allOf'].every((sub) => validateJsonSubset(instance, sub)))
        return false;
    if (Array.isArray(s['anyOf']) && !s['anyOf'].some((sub) => validateJsonSubset(instance, sub)))
        return false;
    if (Array.isArray(s['oneOf'])) {
        const matches = s['oneOf'].filter((sub) => validateJsonSubset(instance, sub)).length;
        if (matches !== 1)
            return false;
    }
    if ('not' in s && validateJsonSubset(instance, s['not']))
        return false;
    return true;
}
function matchesType(instance, type) {
    const types = Array.isArray(type) ? type : [type];
    return types.some((single) => {
        switch (single) {
            case 'null':
                return instance === null;
            case 'boolean':
                return typeof instance === 'boolean';
            case 'number':
                return typeof instance === 'number';
            case 'integer':
                return typeof instance === 'number' && Number.isInteger(instance);
            case 'string':
                return typeof instance === 'string';
            case 'array':
                return Array.isArray(instance);
            case 'object':
                return typeof instance === 'object' && instance !== null && !Array.isArray(instance);
            default:
                return true;
        }
    });
}
function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** Order-insensitive JSON equality (objects compare by key set recursively). */
export function deepJsonEqual(a, b) {
    if (Object.is(a, b))
        return true;
    if (typeof a !== typeof b)
        return false;
    if (Array.isArray(a) || Array.isArray(b)) {
        return (Array.isArray(a) &&
            Array.isArray(b) &&
            a.length === b.length &&
            a.every((item, index) => deepJsonEqual(item, b[index])));
    }
    if (isPlainObject(a) && isPlainObject(b)) {
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        return (keysA.length === keysB.length &&
            keysA.every((key) => key in b && deepJsonEqual(a[key], b[key])));
    }
    return false;
}
function stableStringify(value) {
    if (value === null || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
        return JSON.stringify(value) ?? 'undefined';
    }
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    if (isPlainObject(value)) {
        const body = Object.keys(value)
            .sort()
            .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
            .join(',');
        return `{${body}}`;
    }
    // uniqueItems only ever sees JSON array items; anything else is a bug.
    throw new Error('stableStringify received a non-JSON value');
}
