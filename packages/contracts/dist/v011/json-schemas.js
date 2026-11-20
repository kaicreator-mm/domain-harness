/**
 * DomainHarness v0.11.0 T01 (#1575) — canonical machine JSON Schemas for
 * the versioned v011 documents (L201 family: Domain/Element/ContentBlock/
 * FunctionContract + ElementRef/FunctionRef + DomainPackageManifest).
 *
 * Design contract (controller pre-review #1575/7024843276):
 * - Draft 2020-12 dialect; every exported document is SELF-CONTAINED
 *   (shared shapes live under that document's own `$defs`), versioned
 *   through `$id` (…/v011/<doc>.json) and the `dh.<doc>/0.11`
 *   schemaVersion constants — a consumer can compile one document alone.
 * - The schemas express exactly the frozen schema-layer rules and stay
 *   silent on cross-document BUILD semantics (owner/export closure, DAG,
 *   cycles, selection) which belong to T02 — no BUILD semantics are
 *   forged here. One known schema-layer blind spot is preserved:
 *   cross-ITEM identity uniqueness (e.g. duplicate element ids inside one
 *   Domain) is not expressible in JSON Schema and stays owned by the
 *   handwritten validators + BUILD.
 * - Unknown REQUIRED contentKind refusal mirrors the frozen predicate for
 *   the required track only (`if required:true → contentKind must be a
 *   core kind or dh-ext.-prefixed`); unknown OPTIONAL passes by design
 *   (PRD E10) and is recorded in the Lock by BUILD.
 * - Plain JSON data only, zero dependencies; contracts stays inert.
 */
import { CORE_CONTENT_KINDS } from './element-contracts.js';
import { DH_APP_SCHEMA_VERSION, DH_DOMAIN_SCHEMA_VERSION, DH_ELEMENT_SCHEMA_VERSION, DH_LOCK_SCHEMA_VERSION, DH_PACKAGE_SCHEMA_VERSION, } from './schema-versions.js';
import { NODE24_ESM_PROFILE } from './refs.js';
export const V011_JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';
export const V011_SCHEMA_BASE_ID = 'https://kaicreator.dev/schemas/domain-harness/v011';
// ---- Shared pattern vocabulary (mirrors validate.ts) ----
const IDENTIFIER_PATTERN = '^[A-Za-z0-9][A-Za-z0-9._-]*$';
const SEMVER_PATTERN = '^[0-9]+\\.[0-9]+\\.[0-9]+$';
const CONTENT_DIGEST_PATTERN = '^sha256:[0-9a-f]{64}$';
/** Package-root relative POSIX path: no leading '/', no drive letter (':' outside charset), no backslash, no '.'/'..' segments. */
const RESOURCE_PATH_PATTERN = '^(?!.*(^|/)\\.{1,2}($|/))[A-Za-z0-9][A-Za-z0-9._\\-/]*$';
// ---- Shared $defs bodies (composed into every self-contained document) ----
const RESOURCE_REF_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['packageId', 'path', 'digest'],
    properties: {
        packageId: { type: 'string', minLength: 1 },
        path: { type: 'string', pattern: RESOURCE_PATH_PATTERN },
        digest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
    },
};
const SCHEMA_REF_DEF = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            required: ['inline'],
            properties: { inline: {} },
        },
        { $ref: '#/$defs/resourceRef' },
    ],
};
const APPLICABILITY_DEF = {
    type: 'object',
    additionalProperties: false,
    properties: {
        targets: { type: 'array', items: { type: 'string' } },
        when: {},
    },
};
const CONTENT_BLOCK_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'contentKind', 'schemaRef', 'required'],
    properties: {
        id: { type: 'string', pattern: IDENTIFIER_PATTERN },
        contentKind: { type: 'string', minLength: 1 },
        schemaRef: { $ref: '#/$defs/schemaRef' },
        required: { type: 'boolean' },
        value: {},
        ref: { $ref: '#/$defs/resourceRef' },
        applicability: APPLICABILITY_DEF,
        provenance: {
            type: 'object',
            additionalProperties: false,
            properties: {
                source: { type: 'string', minLength: 1 },
                refs: { type: 'array', items: { $ref: '#/$defs/resourceRef' } },
            },
        },
    },
    allOf: [
        {
            // value/ref XOR: exactly one of the two keys may be present.
            // (`properties` restated inside each `not` so strict 2020-12
            // compilers like ajv strictRequired accept the subschema.)
            oneOf: [
                {
                    properties: { value: {} },
                    required: ['value'],
                    not: { properties: { ref: {} }, required: ['ref'] },
                },
                {
                    properties: { ref: {} },
                    required: ['ref'],
                    not: { properties: { value: {} }, required: ['value'] },
                },
            ],
        },
        {
            // Unknown REQUIRED contentKind refusal (frozen predicate, required track).
            if: { properties: { required: { const: true } }, required: ['required'] },
            then: {
                properties: {
                    contentKind: {
                        anyOf: [
                            { enum: [...CORE_CONTENT_KINDS] },
                            { type: 'string', pattern: '^dh-ext.' },
                        ],
                    },
                },
            },
        },
    ],
};
const FUNCTION_CONTRACT_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'contractVersion', 'inputSchemaRef', 'outputSchemaRef', 'outcomes', 'effects'],
    properties: {
        id: { type: 'string', pattern: IDENTIFIER_PATTERN },
        contractVersion: { type: 'string', minLength: 1 },
        description: { type: 'string', minLength: 1 },
        inputSchemaRef: { $ref: '#/$defs/schemaRef' },
        outputSchemaRef: { $ref: '#/$defs/schemaRef' },
        outcomes: {
            type: 'array',
            minItems: 1,
            items: { enum: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] },
            contains: { const: 'SUCCEEDED' },
        },
        effects: { enum: ['none', 'external', 'state'] },
        applicability: APPLICABILITY_DEF,
    },
};
const ELEMENT_DEFINITION_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'schemaVersion', 'id', 'version', 'description', 'content', 'functions'],
    properties: {
        kind: { const: 'Element' },
        schemaVersion: { const: DH_ELEMENT_SCHEMA_VERSION },
        id: { type: 'string', pattern: IDENTIFIER_PATTERN },
        version: { type: 'string', pattern: SEMVER_PATTERN },
        description: { type: 'string', minLength: 1 },
        roles: { type: 'array', items: { type: 'string' } },
        content: { type: 'array', items: { $ref: '#/$defs/contentBlock' } },
        functions: { type: 'array', items: { $ref: '#/$defs/functionContract' } },
        dependencies: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['element', 'version'],
                properties: {
                    element: { type: 'string', pattern: IDENTIFIER_PATTERN },
                    version: { type: 'string', minLength: 1 },
                    functions: { type: 'array', items: { type: 'string' } },
                },
            },
        },
        validation: {
            type: 'object',
            additionalProperties: false,
            required: ['ref'],
            properties: { ref: { $ref: '#/$defs/resourceRef' } },
        },
    },
};
const ELEMENT_REF_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['namespace', 'id', 'version', 'digest'],
    properties: {
        namespace: { type: 'string', pattern: IDENTIFIER_PATTERN },
        id: { type: 'string', pattern: IDENTIFIER_PATTERN },
        version: { type: 'string', pattern: SEMVER_PATTERN },
        digest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
    },
};
const FUNCTION_REF_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['element', 'functionId', 'contractVersion'],
    properties: {
        element: { $ref: '#/$defs/elementRef' },
        functionId: { type: 'string', minLength: 1 },
        contractVersion: { type: 'string', minLength: 1 },
    },
};
function defsEnvelope(docId, root, defs) {
    return {
        $schema: V011_JSON_SCHEMA_DIALECT,
        $id: `${V011_SCHEMA_BASE_ID}/${docId}`,
        ...root,
        $defs: { ...defs },
    };
}
// ---- Root documents ----
export const ELEMENT_DEFINITION_JSON_SCHEMA = defsEnvelope('element.json', {
    // Pure 2020-12 $ref envelope: the referenced $def owns
    // type/additionalProperties/properties (sibling keywords at the root
    // would evaluate against an empty root property set).
    $ref: '#/$defs/elementDefinition',
}, {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    applicability: APPLICABILITY_DEF,
    contentBlock: CONTENT_BLOCK_DEF,
    functionContract: FUNCTION_CONTRACT_DEF,
    elementDefinition: ELEMENT_DEFINITION_DEF,
});
export const DOMAIN_DEFINITION_JSON_SCHEMA = defsEnvelope('domain.json', {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'schemaVersion', 'id', 'version', 'elements'],
    properties: {
        kind: { const: 'Domain' },
        schemaVersion: { const: DH_DOMAIN_SCHEMA_VERSION },
        id: { type: 'string', pattern: IDENTIFIER_PATTERN },
        version: { type: 'string', pattern: SEMVER_PATTERN },
        description: { type: 'string', minLength: 1 },
        elements: {
            type: 'array',
            minItems: 1,
            items: { $ref: '#/$defs/elementDefinition' },
        },
        semanticRelations: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['relation', 'from', 'to'],
                properties: {
                    relation: { type: 'string', minLength: 1 },
                    from: { type: 'string', minLength: 1 },
                    to: { type: 'string', minLength: 1 },
                    version: { type: 'string', minLength: 1 },
                },
            },
        },
        // Frozen L2 §2.2 field shape `readonly JsonValue[]` (array of
        // declarative constraints); see Builder RELEASE P2 disposition.
        constraints: { type: 'array' },
    },
}, {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    applicability: APPLICABILITY_DEF,
    contentBlock: CONTENT_BLOCK_DEF,
    functionContract: FUNCTION_CONTRACT_DEF,
    elementDefinition: ELEMENT_DEFINITION_DEF,
});
export const CONTENT_BLOCK_JSON_SCHEMA = defsEnvelope('content-block.json', {
    // Pure 2020-12 $ref envelope (same rationale as element.json).
    $ref: '#/$defs/contentBlock',
}, {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    applicability: APPLICABILITY_DEF,
    contentBlock: CONTENT_BLOCK_DEF,
});
export const FUNCTION_CONTRACT_JSON_SCHEMA = defsEnvelope('function-contract.json', {
    // Pure 2020-12 $ref envelope (same rationale as element.json).
    $ref: '#/$defs/functionContract',
}, {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    applicability: APPLICABILITY_DEF,
    functionContract: FUNCTION_CONTRACT_DEF,
});
export const ELEMENT_REF_JSON_SCHEMA = defsEnvelope('element-ref.json', {
    type: 'object',
    additionalProperties: false,
    required: ['namespace', 'id', 'version', 'digest'],
    properties: {
        namespace: { type: 'string', pattern: IDENTIFIER_PATTERN },
        id: { type: 'string', pattern: IDENTIFIER_PATTERN },
        version: { type: 'string', pattern: SEMVER_PATTERN },
        digest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
    },
}, {});
export const FUNCTION_REF_JSON_SCHEMA = defsEnvelope('function-ref.json', {
    type: 'object',
    additionalProperties: false,
    $ref: '#/$defs/functionRef',
}, {
    elementRef: ELEMENT_REF_DEF,
    functionRef: FUNCTION_REF_DEF,
});
export const DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA = defsEnvelope('package-manifest.json', {
    type: 'object',
    additionalProperties: false,
    required: [
        'kind',
        'schemaVersion',
        'id',
        'version',
        'layer',
        'role',
        'elements',
        'dependsOn',
        'imports',
        'exports',
        'contributesTo',
        'targetVariants',
    ],
    properties: {
        kind: { const: 'DomainPackage' },
        schemaVersion: { const: DH_PACKAGE_SCHEMA_VERSION },
        id: { type: 'string', pattern: IDENTIFIER_PATTERN },
        version: { type: 'string', pattern: SEMVER_PATTERN },
        layer: { enum: ['kernel', 'sdk', 'business'] },
        role: { enum: ['primary', 'extension'] },
        description: { type: 'string', minLength: 1 },
        elements: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'version', 'definitionRef', 'visibility'],
                properties: {
                    id: { type: 'string', pattern: IDENTIFIER_PATTERN },
                    version: { type: 'string', pattern: SEMVER_PATTERN },
                    definitionRef: { $ref: '#/$defs/resourceRef' },
                    visibility: { enum: ['public', 'private'] },
                },
            },
        },
        dependsOn: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['package', 'version', 'interface'],
                properties: {
                    package: { type: 'string', minLength: 1 },
                    version: { type: 'string', minLength: 1 },
                    interface: { type: 'string', minLength: 1 },
                },
            },
        },
        imports: { type: 'array', items: { $ref: '#/$defs/functionRef' } },
        exports: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                anyOf: [
                    { properties: { elementId: { type: 'string' } }, required: ['elementId'] },
                    { properties: { functionId: { type: 'string' } }, required: ['functionId'] },
                    { properties: { interfaceId: { type: 'string' } }, required: ['interfaceId'] },
                ],
                properties: {
                    elementId: { type: 'string', minLength: 1 },
                    functionId: { type: 'string', minLength: 1 },
                    interfaceId: { type: 'string', minLength: 1 },
                },
            },
        },
        provides: {
            type: 'object',
            additionalProperties: false,
            properties: {
                interfaces: { type: 'array', items: { type: 'object' } },
                hooks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['id', 'interfaceSchemaRef', 'cardinality'],
                        properties: {
                            id: { type: 'string', minLength: 1 },
                            interfaceSchemaRef: { $ref: '#/$defs/schemaRef' },
                            cardinality: { enum: ['single', 'multi'] },
                        },
                    },
                },
            },
        },
        contributesTo: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['ownerPackageId', 'hookId', 'entry'],
                properties: {
                    ownerPackageId: { type: 'string', minLength: 1 },
                    hookId: { type: 'string', minLength: 1 },
                    entry: { $ref: '#/$defs/entryRef' },
                },
            },
        },
        targetVariants: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['target', 'implementations'],
                properties: {
                    target: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['runtime', 'module'],
                        properties: {
                            runtime: { const: 'node' },
                            module: { const: 'esm' },
                            nodeMajor: { type: 'integer', minimum: 0 },
                        },
                    },
                    implementations: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['elementId', 'functionId', 'contractVersion', 'entry'],
                            properties: {
                                elementId: { type: 'string', minLength: 1 },
                                functionId: { type: 'string', minLength: 1 },
                                contractVersion: { type: 'string', minLength: 1 },
                                entry: { $ref: '#/$defs/entryRef' },
                                resources: { type: 'array', items: { $ref: '#/$defs/resourceRef' } },
                            },
                        },
                    },
                },
            },
        },
        technicalInit: { $ref: '#/$defs/entryRef' },
        technicalDispose: { $ref: '#/$defs/entryRef' },
    },
}, {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    entryRef: {
        type: 'object',
        additionalProperties: false,
        required: ['module', 'exportName'],
        properties: {
            module: { $ref: '#/$defs/resourceRef' },
            exportName: { type: 'string', minLength: 1 },
        },
    },
    elementRef: ELEMENT_REF_DEF,
    functionRef: FUNCTION_REF_DEF,
});
// ---- D02 completion: Domain App Descriptor and exact App Lock ----
// (controller pre-review #1575/7025451554: PRD D02 names these two in the
// versioned machine-schema set; closureDigest recompute, owner/DAG
// resolution and resource byte checks stay BUILD/Boot (T02/T03) — the
// schemas freeze only the per-document structural rules.)
const TARGET_SELECTOR_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['runtime', 'module'],
    properties: {
        runtime: { const: 'node' },
        module: { const: 'esm' },
        nodeMajor: { type: 'integer', minimum: 0 },
    },
};
const RESOLVED_TARGET_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['runtime', 'module', 'profile'],
    properties: {
        runtime: { const: 'node' },
        module: { const: 'esm' },
        nodeMajor: { type: 'integer', minimum: 0 },
        profile: { const: NODE24_ESM_PROFILE },
    },
};
const PACKAGE_REF_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['package', 'version'],
    properties: {
        package: { type: 'string', minLength: 1 },
        version: { type: 'string', pattern: SEMVER_PATTERN },
    },
};
const INGRESS_ENTRY_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'function'],
    properties: {
        id: { type: 'string', minLength: 1 },
        function: { $ref: '#/$defs/functionRef' },
        optional: { type: 'boolean' },
    },
};
export const DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA = defsEnvelope('app-descriptor.json', {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'schemaVersion', 'id', 'version', 'target', 'roots', 'extensions', 'businessAppInit', 'ingress'],
    properties: {
        kind: { const: 'DomainApp' },
        schemaVersion: { const: DH_APP_SCHEMA_VERSION },
        id: { type: 'string', pattern: IDENTIFIER_PATTERN },
        version: { type: 'string', pattern: SEMVER_PATTERN },
        target: TARGET_SELECTOR_DEF,
        roots: {
            type: 'object',
            additionalProperties: false,
            required: ['kernelPrimary', 'sdkPrimary', 'businessPrimary'],
            properties: {
                kernelPrimary: { $ref: '#/$defs/packageRef' },
                sdkPrimary: { $ref: '#/$defs/packageRef' },
                businessPrimary: { $ref: '#/$defs/packageRef' },
            },
        },
        extensions: { type: 'array', items: { $ref: '#/$defs/packageRef' } },
        businessAppInit: { $ref: '#/$defs/functionRef' },
        ingress: { type: 'array', items: { $ref: '#/$defs/ingressEntry' } },
        config: { type: 'object', additionalProperties: {} },
    },
}, {
    elementRef: ELEMENT_REF_DEF,
    functionRef: FUNCTION_REF_DEF,
    packageRef: PACKAGE_REF_DEF,
    targetSelector: TARGET_SELECTOR_DEF,
    ingressEntry: INGRESS_ENTRY_DEF,
});
const ENTRY_REF_DEF = {
    type: 'object',
    additionalProperties: false,
    required: ['module', 'exportName'],
    properties: {
        module: { $ref: '#/$defs/resourceRef' },
        exportName: { type: 'string', minLength: 1 },
    },
};
export const DOMAIN_APP_LOCK_JSON_SCHEMA = defsEnvelope('app-lock.json', {
    type: 'object',
    additionalProperties: false,
    required: [
        'kind',
        'schemaVersion',
        'appIdentity',
        'target',
        'bootstrapKdpPin',
        'selectedPackages',
        'selectedElements',
        'selectedFunctions',
        'hookBindings',
        'technicalInitOrder',
        'technicalDisposeOrder',
        'businessAppInit',
        'ingress',
        'resourceDigests',
        'excludedUnknownContent',
        'closureDigest',
    ],
    properties: {
        kind: { const: 'DomainAppLock' },
        schemaVersion: { const: DH_LOCK_SCHEMA_VERSION },
        appIdentity: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'version', 'descriptorDigest'],
            properties: {
                id: { type: 'string', minLength: 1 },
                version: { type: 'string', pattern: SEMVER_PATTERN },
                descriptorDigest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
            },
        },
        target: { $ref: '#/$defs/resolvedTarget' },
        bootstrapKdpPin: {
            type: 'object',
            additionalProperties: false,
            required: ['kdpPackageId', 'kdpPrimaryEntry', 'kdpPrimaryDigest'],
            properties: {
                kdpPackageId: { type: 'string', minLength: 1 },
                kdpPrimaryEntry: { const: 'bootstrap' },
                kdpPrimaryDigest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
            },
        },
        selectedPackages: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['packageId', 'version', 'layer', 'role', 'artifact', 'dependsOn'],
                properties: {
                    packageId: { type: 'string', minLength: 1 },
                    version: { type: 'string', pattern: SEMVER_PATTERN },
                    layer: { enum: ['kernel', 'sdk', 'business'] },
                    role: { enum: ['primary', 'extension'] },
                    artifact: { $ref: '#/$defs/resourceRef' },
                    dependsOn: { type: 'array', items: { type: 'string', minLength: 1 } },
                },
            },
        },
        selectedElements: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['ref', 'ownerPackageId', 'visibility', 'contentDigests', 'contractDigests'],
                properties: {
                    ref: { $ref: '#/$defs/elementRef' },
                    ownerPackageId: { type: 'string', minLength: 1 },
                    visibility: { enum: ['public', 'private'] },
                    contentDigests: { type: 'array', items: { type: 'string', pattern: CONTENT_DIGEST_PATTERN } },
                    contractDigests: { type: 'array', items: { type: 'string', pattern: CONTENT_DIGEST_PATTERN } },
                },
            },
        },
        selectedFunctions: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['ref', 'outcomes', 'effects', 'implementation', 'resources'],
                properties: {
                    ref: { $ref: '#/$defs/functionRef' },
                    outcomes: {
                        type: 'array',
                        minItems: 1,
                        items: { enum: ['SUCCEEDED', 'UNKNOWN', 'FAILED'] },
                        contains: { const: 'SUCCEEDED' },
                    },
                    effects: { enum: ['none', 'external', 'state'] },
                    implementation: { $ref: '#/$defs/entryRef' },
                    resources: { type: 'array', items: { $ref: '#/$defs/resourceRef' } },
                },
            },
        },
        hookBindings: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['ownerPackageId', 'hookId', 'cardinality', 'providers'],
                properties: {
                    ownerPackageId: { type: 'string', minLength: 1 },
                    hookId: { type: 'string', minLength: 1 },
                    cardinality: { enum: ['single', 'multi'] },
                    providers: { type: 'array', items: { $ref: '#/$defs/entryRef' } },
                },
            },
        },
        technicalInitOrder: { type: 'array', items: { type: 'string', minLength: 1 } },
        technicalDisposeOrder: { type: 'array', items: { type: 'string', minLength: 1 } },
        businessAppInit: { $ref: '#/$defs/functionRef' },
        ingress: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'function', 'optional'],
                properties: {
                    id: { type: 'string', minLength: 1 },
                    function: { $ref: '#/$defs/functionRef' },
                    optional: { type: 'boolean' },
                },
            },
        },
        resourceDigests: {
            type: 'object',
            propertyNames: { type: 'string', minLength: 1 },
            additionalProperties: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
        },
        excludedUnknownContent: { type: 'array', items: { type: 'string', minLength: 1 } },
        // Wire-form check only: recomputing the predecessor image is Boot/T02
        // authority (L2 §5.3) and is deliberately NOT schema semantics.
        closureDigest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
    },
}, {
    resourceRef: RESOURCE_REF_DEF,
    elementRef: ELEMENT_REF_DEF,
    functionRef: FUNCTION_REF_DEF,
    entryRef: ENTRY_REF_DEF,
    resolvedTarget: RESOLVED_TARGET_DEF,
});
/**
 * Machine-readable registry of every v011 JSON Schema document, keyed by
 * the `$id` file stem. Frozen order; consumers may compile each document
 * standalone with a draft 2020-12 validator.
 */
export const V011_JSON_SCHEMAS = Object.freeze({
    'domain': DOMAIN_DEFINITION_JSON_SCHEMA,
    'element': ELEMENT_DEFINITION_JSON_SCHEMA,
    'content-block': CONTENT_BLOCK_JSON_SCHEMA,
    'function-contract': FUNCTION_CONTRACT_JSON_SCHEMA,
    'element-ref': ELEMENT_REF_JSON_SCHEMA,
    'function-ref': FUNCTION_REF_JSON_SCHEMA,
    'package-manifest': DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA,
    'app-descriptor': DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA,
    'app-lock': DOMAIN_APP_LOCK_JSON_SCHEMA,
});
