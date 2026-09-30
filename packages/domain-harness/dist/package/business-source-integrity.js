import { canonicalJsonStringify, isContentDigest } from '../contracts/identity.js';
import { DOMAIN_HARNESS_JSON_SCHEMA_V1, DomainHarnessJsonSchemaV1Error, DomainHarnessJsonSchemaV1Validator, canonicalSchemaUtf8ByteLength, } from '../schema/domainharness-json-schema-v1.js';
import { compareCompiledBusinessSourceKeys, } from '../v2/contracts/package-data.js';
export class BusinessSourceIntegrityError extends Error {
    code;
    details;
    constructor(code, message, details = []) {
        super(message);
        this.code = code;
        this.details = details;
        this.name = 'BusinessSourceIntegrityError';
    }
}
const DESCRIPTOR_KEYS = new Set(['source', 'valueSchema', 'validatorBindingDigest']);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function invalid(message, details = []) {
    throw new BusinessSourceIntegrityError('INVALID_BUSINESS_SOURCE_SECTION', message, details);
}
/** Activation-time validation for the I-BIZ-SRC-owned package section. */
export function validateCompiledBusinessSourceSection(value, packageDataBounds) {
    if (!Number.isSafeInteger(packageDataBounds.maxBusinessSources)
        || packageDataBounds.maxBusinessSources < 0
        || !Number.isSafeInteger(packageDataBounds.maxSchemaCanonicalBytes)
        || packageDataBounds.maxSchemaCanonicalBytes < 0) {
        invalid('packageDataBounds Business Source/schema limits must be non-negative safe integers');
    }
    let canonicalText;
    try {
        canonicalText = canonicalJsonStringify(value);
    }
    catch (error) {
        invalid('compiled Business Source section must be canonical JSON', [
            error instanceof Error ? error.message : String(error),
        ]);
    }
    const snapshot = JSON.parse(canonicalText);
    if (!isRecord(snapshot))
        invalid('compiled Business Source section must be an object');
    const sectionKeys = Object.keys(snapshot).sort();
    if (sectionKeys.length !== 2
        || sectionKeys[0] !== 'descriptors'
        || sectionKeys[1] !== 'schemaContractVersion') {
        invalid('compiled Business Source section must contain exactly schemaContractVersion and descriptors');
    }
    if (snapshot.schemaContractVersion !== DOMAIN_HARNESS_JSON_SCHEMA_V1) {
        invalid(`schemaContractVersion must be exactly ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`);
    }
    if (!Array.isArray(snapshot.descriptors))
        invalid('Business Source descriptors must be an array');
    if (snapshot.descriptors.length > packageDataBounds.maxBusinessSources) {
        throw new BusinessSourceIntegrityError('BUSINESS_SOURCE_BOUNDS_EXCEEDED', 'Business Source count exceeds package-recorded bound', [`actual=${snapshot.descriptors.length}`, `max=${packageDataBounds.maxBusinessSources}`]);
    }
    const validator = new DomainHarnessJsonSchemaV1Validator();
    const descriptors = [];
    const sources = new Set();
    for (let index = 0; index < snapshot.descriptors.length; index += 1) {
        const raw = snapshot.descriptors[index];
        if (!isRecord(raw))
            invalid(`descriptors[${index}] must be an object`);
        for (const key of Object.keys(raw)) {
            if (!DESCRIPTOR_KEYS.has(key))
                invalid(`descriptors[${index}] contains unsupported field '${key}'`);
        }
        if (typeof raw.source !== 'string' || raw.source.length === 0) {
            invalid(`descriptors[${index}].source must be a non-empty string`);
        }
        if (sources.has(raw.source))
            invalid(`duplicate Business Source '${raw.source}'`);
        sources.add(raw.source);
        if (raw.validatorBindingDigest !== undefined) {
            if (!isContentDigest(raw.validatorBindingDigest)) {
                invalid(`descriptors[${index}].validatorBindingDigest must be a non-empty digest`);
            }
            throw new BusinessSourceIntegrityError('VALIDATOR_BINDING_UNAVAILABLE', `Business Source '${raw.source}' declares validatorBindingDigest but Mode-B validator bytes are not packaged by I-BIZ-SRC`);
        }
        try {
            const valueSchema = validator.normalizeSchema(raw.valueSchema);
            const schemaBytes = canonicalSchemaUtf8ByteLength(valueSchema);
            if (schemaBytes > packageDataBounds.maxSchemaCanonicalBytes) {
                throw new BusinessSourceIntegrityError('BUSINESS_SOURCE_BOUNDS_EXCEEDED', `Business Source '${raw.source}' schema exceeds package-recorded canonical byte bound`, [`actual=${schemaBytes}`, `max=${packageDataBounds.maxSchemaCanonicalBytes}`]);
            }
            descriptors.push({ source: raw.source, valueSchema });
        }
        catch (error) {
            if (error instanceof BusinessSourceIntegrityError)
                throw error;
            if (error instanceof DomainHarnessJsonSchemaV1Error) {
                throw new BusinessSourceIntegrityError('BUSINESS_SOURCE_SCHEMA_INVALID', `Business Source '${raw.source}' schema is invalid under ${DOMAIN_HARNESS_JSON_SCHEMA_V1}`, [error.message, ...error.details]);
            }
            throw error;
        }
    }
    const sorted = [...descriptors].sort((left, right) => compareCompiledBusinessSourceKeys(left.source, right.source));
    if (descriptors.some((descriptor, index) => descriptor.source !== sorted[index]?.source)) {
        invalid('Business Source descriptors must be sorted by exact source key');
    }
    return { schemaContractVersion: DOMAIN_HARNESS_JSON_SCHEMA_V1, descriptors };
}
//# sourceMappingURL=business-source-integrity.js.map