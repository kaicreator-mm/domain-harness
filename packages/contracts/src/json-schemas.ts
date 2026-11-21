/** 当前领域契约：单一结构定义与严格的数据验证。 */
import { CORE_CONTENT_KINDS } from './element-contracts.js';
import {
  DH_APP_SCHEMA_VERSION,
  DH_DOMAIN_SCHEMA_VERSION,
  DH_ELEMENT_SCHEMA_VERSION,
  DH_LOCK_SCHEMA_VERSION,
  DH_PACKAGE_SCHEMA_VERSION,
} from './schema-versions.js';
import { NODE22_ESM_PROFILE } from './refs.js';
import type { JsonValue } from './base.js';

type JsonObject = { readonly [k: string]: JsonValue };

export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema' as const;
export const SCHEMA_BASE_ID = 'https://kaicreator.dev/schemas/domain-harness' as const;


const IDENTIFIER_PATTERN = '^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_])?$';
const SEMVER_PATTERN = '^[0-9]+\\.[0-9]+\\.[0-9]+$';
const CONTENT_DIGEST_PATTERN = '^sha256:[0-9a-f]{64}$';
const RESOURCE_PATH_PATTERN = '^(?![\\s\\S]*\\\\)(?![A-Za-z]:)(?![\\s\\S]*(^|/)\\.{1,2}($|/))[^/]+(?:/[^/]+)*$';


const RESOURCE_REF_DEF: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['packageId', 'path', 'digest'],
  properties: {
    packageId: { type: 'string', minLength: 1 },
    path: { type: 'string', pattern: RESOURCE_PATH_PATTERN },
    digest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
  },
};

const SCHEMA_REF_DEF: JsonObject = {
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

const APPLICABILITY_DEF: JsonObject = {
  type: 'object',
  additionalProperties: false,
  properties: {
    targets: { type: 'array', items: { type: 'string' } },
    when: {},
  },
};

const CONTENT_BLOCK_DEF: JsonObject = {
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
      if: { properties: { required: { const: true } }, required: ['required'] },
      then: {
        properties: {
          contentKind: {
            anyOf: [
              { enum: [...CORE_CONTENT_KINDS] },
              { type: 'string', pattern: '^dh-ext\\.' },
            ],
          },
        },
      },
    },
  ],
};

const FUNCTION_CONTRACT_DEF: JsonObject = {
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

const ELEMENT_DEFINITION_DEF: JsonObject = {
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

const ELEMENT_REF_DEF: JsonObject = {
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

const FUNCTION_REF_DEF: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['element', 'functionId', 'contractVersion'],
  properties: {
    element: { $ref: '#/$defs/elementRef' },
    functionId: { type: 'string', minLength: 1 },
    contractVersion: { type: 'string', minLength: 1 },
  },
};

function defsEnvelope(
  docId: string,
  root: JsonObject,
  defs: Readonly<Record<string, JsonObject>>,
): JsonObject {
  return {
    $schema: JSON_SCHEMA_DIALECT,
    $id: `${SCHEMA_BASE_ID}/${docId}`,
    ...root,
    $defs: { ...defs },
  };
}


export const ELEMENT_DEFINITION_JSON_SCHEMA: JsonObject = defsEnvelope(
  'element.json',
  {
    $ref: '#/$defs/elementDefinition',
  },
  {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    applicability: APPLICABILITY_DEF,
    contentBlock: CONTENT_BLOCK_DEF,
    functionContract: FUNCTION_CONTRACT_DEF,
    elementDefinition: ELEMENT_DEFINITION_DEF,
  },
);

export const DOMAIN_DEFINITION_JSON_SCHEMA: JsonObject = defsEnvelope(
  'domain.json',
  {
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
      constraints: { type: 'array' },
    },
  },
  {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    applicability: APPLICABILITY_DEF,
    contentBlock: CONTENT_BLOCK_DEF,
    functionContract: FUNCTION_CONTRACT_DEF,
    elementDefinition: ELEMENT_DEFINITION_DEF,
  },
);

export const CONTENT_BLOCK_JSON_SCHEMA: JsonObject = defsEnvelope(
  'content-block.json',
  {
    $ref: '#/$defs/contentBlock',
  },
  {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    applicability: APPLICABILITY_DEF,
    contentBlock: CONTENT_BLOCK_DEF,
  },
);

export const FUNCTION_CONTRACT_JSON_SCHEMA: JsonObject = defsEnvelope(
  'function-contract.json',
  {
    $ref: '#/$defs/functionContract',
  },
  {
    resourceRef: RESOURCE_REF_DEF,
    schemaRef: SCHEMA_REF_DEF,
    applicability: APPLICABILITY_DEF,
    functionContract: FUNCTION_CONTRACT_DEF,
  },
);

export const ELEMENT_REF_JSON_SCHEMA: JsonObject = defsEnvelope(
  'element-ref.json',
  {
    type: 'object',
    additionalProperties: false,
    required: ['namespace', 'id', 'version', 'digest'],
    properties: {
      namespace: { type: 'string', pattern: IDENTIFIER_PATTERN },
      id: { type: 'string', pattern: IDENTIFIER_PATTERN },
      version: { type: 'string', pattern: SEMVER_PATTERN },
      digest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
    },
  },
  {},
);

export const FUNCTION_REF_JSON_SCHEMA: JsonObject = defsEnvelope(
  'function-ref.json',
  {
    $ref: '#/$defs/functionRef',
  },
  {
    elementRef: ELEMENT_REF_DEF,
    functionRef: FUNCTION_REF_DEF,
  },
);

export const DOMAIN_PACKAGE_MANIFEST_JSON_SCHEMA: JsonObject = defsEnvelope(
  'package-manifest.json',
  {
    type: 'object',
    additionalProperties: false,
    required: [
      'kind',
      'schemaVersion',
      'id',
      'version',
      'layer',
      'role',
      'init',
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
      order: { type: 'integer', minimum: 0 },
      init: { $ref: '#/$defs/entryRef' },
      exit: { $ref: '#/$defs/entryRef' },
      initResources: { type: 'array', items: { $ref: '#/$defs/resourceRef' } },
      recordInitFrom: { const: true },
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
    },
  },
  {
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
  },
);


const TARGET_SELECTOR_DEF: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['runtime', 'module'],
  properties: {
    runtime: { const: 'node' },
    module: { const: 'esm' },
    nodeMajor: { type: 'integer', minimum: 0 },
  },
};

const RESOLVED_TARGET_DEF: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['runtime', 'module', 'profile'],
  properties: {
    runtime: { const: 'node' },
    module: { const: 'esm' },
    nodeMajor: { type: 'integer', minimum: 0 },
    profile: { const: NODE22_ESM_PROFILE },
  },
};

const PACKAGE_REF_DEF: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['package', 'version'],
  properties: {
    package: { type: 'string', minLength: 1 },
    version: { type: 'string', pattern: SEMVER_PATTERN },
  },
};

const INGRESS_ENTRY_DEF: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'function'],
  properties: {
    id: { type: 'string', minLength: 1 },
    function: { $ref: '#/$defs/functionRef' },
    optional: { type: 'boolean' },
  },
};

export const DOMAIN_APP_DESCRIPTOR_JSON_SCHEMA: JsonObject = defsEnvelope(
  'app-descriptor.json',
  {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'schemaVersion', 'id', 'version', 'target', 'roots', 'extensions', 'ingress'],
    properties: {
      kind: { const: 'DomainApp' },
      schemaVersion: { const: DH_APP_SCHEMA_VERSION },
      id: { type: 'string', pattern: IDENTIFIER_PATTERN },
      version: { type: 'string', pattern: SEMVER_PATTERN },
      target: TARGET_SELECTOR_DEF,
      roots: {
        type: 'object',
        additionalProperties: false,
        required: ['kernelPrimary', 'cores'],
        properties: {
          kernelPrimary: { $ref: '#/$defs/packageRef' },
          cores: { type: 'array', items: { $ref: '#/$defs/packageRef' } },
        },
      },
      extensions: { type: 'array', items: { $ref: '#/$defs/packageRef' } },
      ingress: { type: 'array', items: { $ref: '#/$defs/ingressEntry' } },
      config: { type: 'object', additionalProperties: {} },
    },
  },
  {
    elementRef: ELEMENT_REF_DEF,
    functionRef: FUNCTION_REF_DEF,
    packageRef: PACKAGE_REF_DEF,
    targetSelector: TARGET_SELECTOR_DEF,
    ingressEntry: INGRESS_ENTRY_DEF,
  },
);

const ENTRY_REF_DEF: JsonObject = {
  type: 'object',
  additionalProperties: false,
  required: ['module', 'exportName'],
  properties: {
    module: { $ref: '#/$defs/resourceRef' },
    exportName: { type: 'string', minLength: 1 },
  },
};

export const DOMAIN_APP_LOCK_JSON_SCHEMA: JsonObject = defsEnvelope(
  'app-lock.json',
  {
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
      'coreOrder',
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
          required: ['packageId', 'version', 'layer', 'role', 'artifact', 'init', 'initResources', 'dependsOn'],
          properties: {
            packageId: { type: 'string', minLength: 1 },
            version: { type: 'string', pattern: SEMVER_PATTERN },
            layer: { enum: ['kernel', 'sdk', 'business'] },
            role: { enum: ['primary', 'extension'] },
            artifact: { $ref: '#/$defs/resourceRef' },
            order: { type: 'integer', minimum: 0 },
            init: { $ref: '#/$defs/entryRef' },
            exit: { $ref: '#/$defs/entryRef' },
            initResources: { type: 'array', items: { $ref: '#/$defs/resourceRef' } },
            recordInitFrom: { const: true },
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
      coreOrder: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } },
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
      closureDigest: { type: 'string', pattern: CONTENT_DIGEST_PATTERN },
    },
  },
  {
    resourceRef: RESOURCE_REF_DEF,
    elementRef: ELEMENT_REF_DEF,
    functionRef: FUNCTION_REF_DEF,
    entryRef: ENTRY_REF_DEF,
    resolvedTarget: RESOLVED_TARGET_DEF,
  },
);

export const JSON_SCHEMAS: Readonly<Record<string, JsonObject>> = Object.freeze({
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
