/**
 * DomainHarness v0.11.0 T02 (#1576) — real Draft 2020-12 machine-schema
 * validation through ajv (L2 §8.1 build dependency ruling; §13.4 relaxation
 * direction only ever REMOVES this dependency, never adds another third
 * party).
 *
 * Scope: per-document structural validation of the authoring inputs
 * (Descriptor / Domain / Package manifest / Element definition) using the
 * frozen T01 JSON Schemas, plus compilation of inline/ref content schemas for
 * real content validation. Cross-document semantics (closure, ownership, DAG,
 * selection, Lock) are deliberately NOT expressible here and live in the BUILD
 * pipeline — one schema authority only (L2 §2.2 boundary, T01 validate.ts).
 */
import { Ajv2020 } from 'ajv/dist/2020.js';
import { DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA, DOMAIN_DEFINITION_JSON_SCHEMA, DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA, ELEMENT_DEFINITION_JSON_SCHEMA, } from '@kaicreator/domain-harness-contracts/v011';
import { canonicalJson } from '@kaicreator/domain-harness-contracts/v011';
import { refusal, V011BuildRefusal } from './refusal.js';
let ajvInstance;
function getAjv() {
    // strict:false: the frozen T01 documents are the authority for which
    // keywords exist; ajv must not invent its own strictness failures.
    ajvInstance ??= new Ajv2020({ strict: false, allErrors: false, validateSchema: false });
    return ajvInstance;
}
/** Compile one JSON Schema (draft 2020-12); illegal schemas raise SCHEMA_INVALID. */
export function compileContentSchema(schema, refPath) {
    if (typeof schema !== 'boolean' && (typeof schema !== 'object' || schema === null)) {
        throw refusal('DH_BUILD_SCHEMA_INVALID', 'schemaRef does not resolve to a JSON Schema', refPath);
    }
    try {
        return getAjv().compile(schema);
    }
    catch (error) {
        throw refusal('DH_BUILD_SCHEMA_INVALID', `schemaRef is not a compilable draft 2020-12 JSON Schema: ${error.message}`, refPath);
    }
}
const documentValidators = new Map();
/** Validate one authoring document against a frozen T01 machine schema. */
export function validateDocument(schemaName, value) {
    const cached = documentValidators.get(schemaName);
    const validate = cached ??
        (() => {
            const schema = schemaName === 'descriptor'
                ? DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA
                : schemaName === 'domain'
                    ? DOMAIN_DEFINITION_JSON_SCHEMA
                    : schemaName === 'manifest'
                        ? DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA
                        : ELEMENT_DEFINITION_JSON_SCHEMA;
            let compiled;
            try {
                compiled = getAjv().compile(schema);
            }
            catch (error) {
                throw new V011BuildRefusal('DH_BUILD_SCHEMA_INVALID', `frozen T01 ${schemaName} schema failed to compile: ${error.message}`);
            }
            documentValidators.set(schemaName, compiled);
            return compiled;
        })();
    if (!validate(value)) {
        throw refusal('DH_BUILD_SCHEMA_INVALID', `${schemaName} document violates the frozen v011 machine schema`);
    }
}
// ---- inline/ref content schema cache (normalized by canonical JSON bytes) ----
const contentSchemaCache = new Map();
/** Compile (with per-BUILD-process cache) an inline content schema object. */
export function compileInlineSchema(schema, refPath) {
    const key = canonicalJson(schema);
    const cached = contentSchemaCache.get(key);
    if (cached)
        return cached;
    const compiled = compileContentSchema(schema, refPath);
    contentSchemaCache.set(key, compiled);
    return compiled;
}
