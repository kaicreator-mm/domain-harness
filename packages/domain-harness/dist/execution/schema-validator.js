import { Ajv2020 } from 'ajv/dist/2020.js';
import { ExecutorError } from './executor-error.js';
export class SchemaValidator {
    ajv = new Ajv2020({ strict: true, allErrors: true });
    cache = new WeakMap();
    validate(schema, value, code, label) {
        assertPortableJson(value, code, label);
        if (!schema)
            return value;
        let validate = this.cache.get(schema);
        if (!validate) {
            validate = this.ajv.compile(schema);
            this.cache.set(schema, validate);
        }
        if (!validate(value)) {
            throw new ExecutorError(code, `${label} does not satisfy JSON Schema: ${formatAjvErrors(validate.errors)}`);
        }
        return value;
    }
}
export function assertPortableJson(value, code, label) {
    if (isJsonValue(value))
        return;
    throw new ExecutorError(code, `${label} must be a portable JSON value`);
}
function isJsonValue(value) {
    if (value === null)
        return true;
    if (typeof value === 'string' || typeof value === 'boolean')
        return true;
    if (typeof value === 'number')
        return Number.isFinite(value);
    if (Array.isArray(value))
        return value.every(isJsonValue);
    if (typeof value !== 'object')
        return false;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null)
        return false;
    return Object.values(value).every(isJsonValue);
}
function formatAjvErrors(errors) {
    if (!errors?.length)
        return 'validation failed';
    return errors
        .map((error) => `${error.instancePath || '/'} ${error.message ?? error.keyword}`)
        .join('; ');
}
//# sourceMappingURL=schema-validator.js.map