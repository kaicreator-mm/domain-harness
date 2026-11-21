/** 当前领域契约：单一结构定义与严格的数据验证。 */
import type { SemVer } from '../../../src/base.js';
import type {
  DomainDefinition,
  ElementDefinition,
} from '../../../src/element-contracts.js';
import type { DomainAppDescriptor } from '../../../src/app-descriptor.js';
import type { DomainAppLock } from '../../../src/app-lock.js';
import type { FunctionRef, ResolvedTarget } from '../../../src/refs.js';
import { contentDigestOf } from '../../../src/digest.js';

const RESOURCE_DIGESTS = {
  rules: contentDigestOf({ fixture: 'orders/rules', revision: 1 }),
  document: contentDigestOf({ fixture: 'orders/eligibility-doc', revision: 1 }),
  faq: contentDigestOf({ fixture: 'orders/faq', revision: 1 }),
  cases: contentDigestOf({ fixture: 'orders/eligibility-cases', revision: 1 }),
} as const;

const FAQ_ELEMENT_VERSION: SemVer = '1.0.0';
const ELIGIBILITY_ELEMENT_VERSION: SemVer = '1.0.0';

export const KNOWLEDGE_ELEMENT_FIXTURE: ElementDefinition = {
  kind: 'Element',
  schemaVersion: 'dh.element/0.11',
  id: 'orders.faq',
  version: FAQ_ELEMENT_VERSION,
  description: 'Versioned order FAQ knowledge with provenance; zero public Functions.',
  roles: ['knowledge'],
  content: [
    {
      id: 'faq-knowledge',
      contentKind: 'knowledge',
      schemaRef: { inline: { type: 'object', required: ['entries'] } },
      required: true,
      ref: {
        packageId: 'orders-business',
        path: 'content/faq.json',
        digest: RESOURCE_DIGESTS.faq,
      },
      provenance: {
        source: 'orders-handbook v3',
        refs: [
          {
            packageId: 'orders-business',
            path: 'content/faq-sources.json',
            digest: RESOURCE_DIGESTS.document,
          },
        ],
      },
    },
  ],
  functions: [],
};

export const ELIGIBILITY_ELEMENT_FIXTURE: ElementDefinition = {
  kind: 'Element',
  schemaVersion: 'dh.element/0.11',
  id: 'orders.eligibility',
  version: ELIGIBILITY_ELEMENT_VERSION,
  description: 'Order eligibility rules with read-only evaluation and explanation.',
  roles: ['rule', 'knowledge'],
  content: [
    {
      id: 'policy-rules',
      contentKind: 'rule',
      schemaRef: {
        inline: {
          type: 'object',
          required: ['minOrderTotal', 'regions'],
          properties: { minOrderTotal: { type: 'number' }, regions: { type: 'array' } },
        },
      },
      required: true,
      value: { minOrderTotal: 50, regions: ['EU', 'US'] },
    },
    {
      id: 'explanation-doc',
      contentKind: 'document',
      schemaRef: { inline: { type: 'string' } },
      required: false,
      ref: {
        packageId: 'orders-business',
        path: 'docs/eligibility.md',
        digest: RESOURCE_DIGESTS.document,
      },
    },
  ],
  functions: [
    {
      id: 'evaluate',
      contractVersion: '1',
      description: 'Evaluate order eligibility against the selected rule content.',
      inputSchemaRef: { inline: { type: 'object', required: ['total', 'region'] } },
      outputSchemaRef: {
        inline: {
          type: 'object',
          required: ['decision'],
          properties: { decision: { enum: ['POS', 'NEG', 'UNKNOWN'] } },
        },
      },
      outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'],
      effects: 'none',
      applicability: { targets: ['ingress:evaluate'] },
    },
    {
      id: 'explain',
      contractVersion: '1',
      description: 'Explain the eligibility decision for an order.',
      inputSchemaRef: { inline: { type: 'object' } },
      outputSchemaRef: { inline: { type: 'string' } },
      outcomes: ['SUCCEEDED', 'UNKNOWN'],
      effects: 'none',
    },
  ],
  dependencies: [
    {
      element: 'orders.faq',
      version: '^1.0.0',
      functions: [],
    },
  ],
  validation: {
    ref: {
      packageId: 'orders-business',
      path: 'validation/eligibility-cases.json',
      digest: RESOURCE_DIGESTS.cases,
    },
  },
};

export const ORDERS_DOMAIN_FIXTURE: DomainDefinition = {
  kind: 'Domain',
  schemaVersion: 'dh.domain/0.11',
  id: 'orders',
  version: '1.0.0',
  description: 'Orders domain: eligibility rules plus FAQ knowledge.',
  elements: [KNOWLEDGE_ELEMENT_FIXTURE, ELIGIBILITY_ELEMENT_FIXTURE],
  semanticRelations: [
    { relation: 'depends-knowledge', from: 'orders.eligibility', to: 'orders.faq', version: '1.0.0' },
    { relation: 'documents', from: 'orders.faq', to: 'orders.eligibility', version: '1.0.0' },
  ],
  constraints: [
    { type: 'Invariant', statement: 'eligibility decisions must cite the selected rule content' },
  ],
};

export const EXTENSION_OPTIONAL_ELEMENT_FIXTURE: ElementDefinition = {
  kind: 'Element',
  schemaVersion: 'dh.element/0.11',
  id: 'orders.prompt-notes',
  version: '1.0.0',
  description: 'Carries a known dh-ext prompt block recognized through its namespace prefix.',
  content: [
    {
      id: 'prompt-note',
      contentKind: 'dh-ext.acme.prompt',
      schemaRef: { inline: { type: 'string' } },
      required: false,
      value: 'Summarize the eligibility decision for support staff.',
    },
  ],
  functions: [],
};

export const UNKNOWN_OPTIONAL_ELEMENT_FIXTURE = {
  kind: 'Element',
  schemaVersion: 'dh.element/0.11',
  id: 'orders.legacy-prompt-notes',
  version: '1.0.0',
  description: 'Carries an optional bare prompt block unknown to this BUILD profile.',
  content: [
    {
      id: 'prompt-note',
      contentKind: 'prompt',
      schemaRef: { inline: { type: 'string' } },
      required: false,
      value: 'Summarize the eligibility decision for first-line support.',
    },
  ],
  functions: [],
} as unknown as ElementDefinition;

export const UNKNOWN_OPTIONAL_EXCLUSION_FIXTURE = {
  elementId: 'orders.legacy-prompt-notes',
  contentBlockId: 'prompt-note',
  contentKind: 'prompt',
  excludedUnknownContent: ['orders.legacy-prompt-notes/prompt-note'],
} as const;


const APP_TARGET_SELECTOR = {
  runtime: 'node',
  module: 'esm',
  nodeMajor: 22,
} as const;

const APP_TARGET: ResolvedTarget = {
  ...APP_TARGET_SELECTOR,
  profile: 'node22-esm/1',
};

const EVALUATE_FUNCTION_REF: FunctionRef = {
  element: {
    namespace: 'orders',
    id: 'orders.eligibility',
    version: ELIGIBILITY_ELEMENT_VERSION,
    digest: contentDigestOf({ fixture: 'orders/eligibility-definition', revision: 1 }),
  },
  functionId: 'evaluate',
  contractVersion: '1',
};

const ORDERS_BUSINESS_ARTIFACT = {
  packageId: 'orders-business',
  path: 'dist/orders-business.mjs',
  digest: contentDigestOf({ fixture: 'orders-business/artifact', revision: 1 }),
};

export const DOMAIN_APP_DESCRIPTOR_FIXTURE: DomainAppDescriptor = {
  kind: 'DomainApp',
  schemaVersion: 'dh.app/0.11',
  id: 'orders.basic',
  version: '1.0.0',
  target: APP_TARGET_SELECTOR,
  roots: {
    kernelPrimary: { package: 'kdp-basic', version: '1.0.0' },
    cores: [
      { package: 'sdk-core', version: '1.0.0' },
      { package: 'orders-business', version: '1.0.0' },
    ],
  },
  extensions: [],
  ingress: [
    { id: 'evaluate', function: EVALUATE_FUNCTION_REF, optional: false },
  ],
  config: {
    regionDefault: 'EU',
  },
};

export const DOMAIN_APP_LOCK_FIXTURE: DomainAppLock = {
  kind: 'DomainAppLock',
  schemaVersion: 'dh.lock/0.11',
  appIdentity: {
    id: 'orders.basic',
    version: '1.0.0',
    descriptorDigest: contentDigestOf({ fixture: 'orders/basic-descriptor', revision: 1 }),
  },
  target: APP_TARGET,
  bootstrapKdpPin: {
    kdpPackageId: 'kdp-basic',
    kdpPrimaryEntry: 'bootstrap',
    kdpPrimaryDigest: contentDigestOf({ fixture: 'kdp/bootstrap-entry', revision: 1 }),
  },
  selectedPackages: [
    {
      packageId: 'kdp-basic',
      version: '1.0.0',
      layer: 'kernel',
      role: 'primary',
      order: 0,
      artifact: {
        packageId: 'kdp-basic',
        path: 'dist/kdp-basic.mjs',
        digest: contentDigestOf({ fixture: 'kdp-basic/artifact', revision: 1 }),
      },
      init: { module: { packageId: 'kdp-basic', path: 'dist/kdp-basic.mjs', digest: contentDigestOf({ fixture: 'kdp-basic/artifact', revision: 1 }) }, exportName: 'init' },
      initResources: [],
      dependsOn: [],
    },
    {
      packageId: 'sdk-core',
      version: '1.0.0',
      layer: 'sdk',
      role: 'primary',
      order: 1,
      artifact: {
        packageId: 'sdk-core',
        path: 'dist/sdk-core.mjs',
        digest: contentDigestOf({ fixture: 'sdk-core/artifact', revision: 1 }),
      },
      init: { module: { packageId: 'sdk-core', path: 'dist/sdk-core.mjs', digest: contentDigestOf({ fixture: 'sdk-core/artifact', revision: 1 }) }, exportName: 'init' },
      initResources: [],
      dependsOn: ['kdp-basic'],
    },
    {
      packageId: 'orders-business',
      version: '1.0.0',
      layer: 'business',
      role: 'primary',
      order: 2,
      artifact: ORDERS_BUSINESS_ARTIFACT,
      init: { module: ORDERS_BUSINESS_ARTIFACT, exportName: 'init' },
      initResources: [],
      dependsOn: ['sdk-core'],
    },
  ],
  selectedElements: [
    {
      ref: EVALUATE_FUNCTION_REF.element,
      ownerPackageId: 'orders-business',
      visibility: 'public',
      contentDigests: [contentDigestOf({ fixture: 'orders/rules', revision: 1 })],
      contractDigests: [
        contentDigestOf({ fixture: 'orders/eligibility-contract-evaluate', revision: 1 }),
      ],
    },
    {
      ref: {
        namespace: 'orders',
        id: 'orders.legacy-prompt-notes',
        version: '1.0.0',
        digest: contentDigestOf({ fixture: 'orders/legacy-prompt-notes-definition', revision: 1 }),
      },
      ownerPackageId: 'orders-business',
      visibility: 'private',
      contentDigests: [contentDigestOf({ fixture: 'orders/legacy-prompt', revision: 1 })],
      contractDigests: [],
    },
  ],
  selectedFunctions: [
    {
      ref: EVALUATE_FUNCTION_REF,
      outcomes: ['SUCCEEDED', 'UNKNOWN', 'FAILED'],
      effects: 'none',
      implementation: {
        module: ORDERS_BUSINESS_ARTIFACT,
        exportName: 'evaluate',
      },
      resources: [
        {
          packageId: 'orders-business',
          path: 'content/rules.json',
          digest: contentDigestOf({ fixture: 'orders/rules', revision: 1 }),
        },
      ],
    },
  ],
  hookBindings: [],
  coreOrder: ['kdp-basic', 'sdk-core', 'orders-business'],
  ingress: [
    { id: 'evaluate', function: EVALUATE_FUNCTION_REF, optional: false },
  ],
  resourceDigests: {
    'orders-business/content/rules.json': contentDigestOf({ fixture: 'orders/rules', revision: 1 }),
    'orders-business/content/faq.json': contentDigestOf({ fixture: 'orders/faq', revision: 1 }),
  },
  excludedUnknownContent: [...UNKNOWN_OPTIONAL_EXCLUSION_FIXTURE.excludedUnknownContent],
  closureDigest: contentDigestOf({ fixture: 'orders/basic-lock-closure', revision: 1 }),
};
