import { canonicalJsonStringify, computeCanonicalJsonDigest, isContentDigest, } from '../contracts/identity.js';
import { DomainHarnessJsonSchemaV1Error, DomainHarnessJsonSchemaV1Validator, canonicalSchemaUtf8ByteLength, portableUtf8ByteLength, } from '../schema/domainharness-json-schema-v1.js';
import { compareCompiledDomainDataKeys, } from '../v2/contracts/package-data.js';
export class DomainDataIntegrityError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(message);
        this.name = 'DomainDataIntegrityError';
        this.code = code;
        this.details = [...details];
    }
}
const BOUND_KEYS = [
    'maxDomainDataEntries',
    'maxDomainDataEntryCanonicalBytes',
    'maxTotalDomainDataCanonicalBytes',
    'maxBusinessSources',
    'maxSchemaCanonicalBytes',
];
const DESCRIPTOR_KEYS = new Set(['key', 'contentDigest', 'valueSchema']);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalid(message, details = []) {
    throw new DomainDataIntegrityError('INVALID_DOMAIN_DATA_SECTION', message, details);
}
function readBounds(value) {
    if (!isRecord(value))
        invalid('packageDataBounds must be an object');
    const actualKeys = Object.keys(value).sort();
    const expectedKeys = [...BOUND_KEYS].sort();
    if (actualKeys.length !== expectedKeys.length
        || actualKeys.some((key, index) => key !== expectedKeys[index])) {
        invalid('packageDataBounds must contain exactly the frozen bound fields', actualKeys);
    }
    const result = {};
    for (const key of BOUND_KEYS) {
        const bound = value[key];
        if (typeof bound !== 'number' || !Number.isSafeInteger(bound) || bound < 0) {
            invalid(`packageDataBounds.${key} must be a non-negative safe integer`);
        }
        result[key] = bound;
    }
    return result;
}
function readDescriptor(value, index) {
    if (!isRecord(value))
        invalid(`descriptors[${index}] must be an object`);
    for (const key of Object.keys(value)) {
        if (!DESCRIPTOR_KEYS.has(key)) {
            invalid(`descriptors[${index}] contains unsupported field '${key}'`);
        }
    }
    if (typeof value.key !== 'string' || value.key.length === 0) {
        invalid(`descriptors[${index}].key must be a non-empty string`);
    }
    if (!isContentDigest(value.contentDigest)) {
        invalid(`descriptors[${index}].contentDigest must be a non-empty digest`);
    }
    let valueSchema;
    if (value.valueSchema !== undefined) {
        if (!isRecord(value.valueSchema)) {
            invalid(`descriptors[${index}].valueSchema must be a JSON object`);
        }
        valueSchema = value.valueSchema;
    }
    return {
        key: value.key,
        contentDigest: value.contentDigest,
        ...(valueSchema === undefined ? {} : { valueSchema }),
    };
}
function readValues(value) {
    if (!isRecord(value))
        invalid('values must be an object record');
    const result = Object.create(null);
    for (const key of Object.keys(value)) {
        if (key.length === 0)
            invalid('values may not contain an empty key');
        canonicalJsonStringify(value[key]);
        result[key] = value[key];
    }
    return result;
}
/**
 * Portable successor Domain Data integrity + schema admission validation.
 * Validation operates on a detached canonical snapshot so caller mutation
 * cannot create a time-of-check/time-of-use split while async digests run.
 */
export async function validateCompiledDomainDataSection(value, sha256) {
    let canonicalText;
    try {
        canonicalText = canonicalJsonStringify(value);
    }
    catch (error) {
        invalid('compiled Domain Data section must be canonical JSON', [
            error instanceof Error ? error.message : String(error),
        ]);
    }
    const snapshot = JSON.parse(canonicalText);
    if (!isRecord(snapshot))
        invalid('compiled Domain Data section must be an object');
    const actualSectionKeys = Object.keys(snapshot).sort();
    const expectedSectionKeys = ['descriptors', 'packageDataBounds', 'values'];
    if (actualSectionKeys.length !== expectedSectionKeys.length
        || actualSectionKeys.some((key, index) => key !== expectedSectionKeys[index])) {
        invalid('compiled Domain Data section must contain exactly descriptors, values and packageDataBounds');
    }
    if (!Array.isArray(snapshot.descriptors))
        invalid('descriptors must be an array');
    const descriptors = snapshot.descriptors.map(readDescriptor);
    const values = readValues(snapshot.values);
    const packageDataBounds = readBounds(snapshot.packageDataBounds);
    const schemaValidator = new DomainHarnessJsonSchemaV1Validator();
    const descriptorKeys = descriptors.map((descriptor) => descriptor.key);
    const sortedDescriptorKeys = [...descriptorKeys].sort(compareCompiledDomainDataKeys);
    if (descriptorKeys.some((key, index) => key !== sortedDescriptorKeys[index])) {
        invalid('Domain Data descriptors must be sorted by exact key');
    }
    if (new Set(descriptorKeys).size !== descriptorKeys.length) {
        invalid('Domain Data descriptor keys must be unique');
    }
    const valueKeys = Object.keys(values).sort(compareCompiledDomainDataKeys);
    if (descriptorKeys.length !== valueKeys.length
        || descriptorKeys.some((key, index) => key !== valueKeys[index])) {
        invalid('Domain Data descriptors and bundled values must form an exact bijection', [
            `descriptors=${descriptorKeys.join(',')}`,
            `values=${valueKeys.join(',')}`,
        ]);
    }
    if (descriptors.length > packageDataBounds.maxDomainDataEntries) {
        throw new DomainDataIntegrityError('DOMAIN_DATA_BOUNDS_EXCEEDED', 'Domain Data entry count exceeds package-recorded bound', [`actual=${descriptors.length}`, `max=${packageDataBounds.maxDomainDataEntries}`]);
    }
    let totalBytes = 0;
    const normalizedDescriptors = [];
    for (const descriptor of descriptors) {
        const bundled = values[descriptor.key];
        const canonical = canonicalJsonStringify(bundled);
        const bytes = portableUtf8ByteLength(canonical);
        if (bytes > packageDataBounds.maxDomainDataEntryCanonicalBytes) {
            throw new DomainDataIntegrityError('DOMAIN_DATA_BOUNDS_EXCEEDED', `Domain Data '${descriptor.key}' exceeds per-entry canonical byte bound`, [`actual=${bytes}`, `max=${packageDataBounds.maxDomainDataEntryCanonicalBytes}`]);
        }
        totalBytes += bytes;
        let valueSchema = descriptor.valueSchema;
        if (valueSchema !== undefined) {
            try {
                valueSchema = schemaValidator.normalizeSchema(valueSchema);
                const schemaBytes = canonicalSchemaUtf8ByteLength(valueSchema);
                if (schemaBytes > packageDataBounds.maxSchemaCanonicalBytes) {
                    throw new DomainDataIntegrityError('DOMAIN_DATA_BOUNDS_EXCEEDED', `Domain Data '${descriptor.key}' valueSchema exceeds canonical schema byte bound`, [`actual=${schemaBytes}`, `max=${packageDataBounds.maxSchemaCanonicalBytes}`]);
                }
                schemaValidator.validate(valueSchema, bundled, `Domain Data '${descriptor.key}'`);
            }
            catch (error) {
                if (error instanceof DomainDataIntegrityError)
                    throw error;
                if (error instanceof DomainHarnessJsonSchemaV1Error) {
                    throw new DomainDataIntegrityError('DOMAIN_DATA_SCHEMA_VIOLATION', `Domain Data '${descriptor.key}' failed ${error.code}`, [error.message, ...error.details]);
                }
                throw error;
            }
        }
        const digest = await computeCanonicalJsonDigest(bundled, sha256);
        if (digest !== descriptor.contentDigest) {
            throw new DomainDataIntegrityError('DOMAIN_DATA_DIGEST_MISMATCH', `Domain Data '${descriptor.key}' content digest does not match descriptor`, [`expected=${descriptor.contentDigest}`, `actual=${digest}`]);
        }
        normalizedDescriptors.push({
            key: descriptor.key,
            contentDigest: descriptor.contentDigest,
            ...(valueSchema === undefined ? {} : { valueSchema }),
        });
    }
    if (totalBytes > packageDataBounds.maxTotalDomainDataCanonicalBytes) {
        throw new DomainDataIntegrityError('DOMAIN_DATA_BOUNDS_EXCEEDED', 'aggregate Domain Data canonical bytes exceed package-recorded bound', [`actual=${totalBytes}`, `max=${packageDataBounds.maxTotalDomainDataCanonicalBytes}`]);
    }
    return { descriptors: normalizedDescriptors, values, packageDataBounds };
}
//# sourceMappingURL=domain-data-integrity.js.map