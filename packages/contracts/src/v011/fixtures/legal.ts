/**
 * DomainHarness v0.11.0 T01 (#1575) — legal authoring fixtures (L2 §10 T01:
 * "packages/contracts/src/v011 的 authoring fixtures，仅 schema/TS 层").
 *
 * These fixtures are compile-time positive evidence: each is typed as its
 * public contract type, so if the frozen type surface ever rejects a legal
 * authoring form, the package fails to compile. They double as the AC01
 * shape set — one 0-Function knowledge Element and one 2-Function Element
 * with ≥2 content kinds — plus a Domain with a cycle-legal semantic graph.
 */
import type { SemVer } from '../base.js';
import type {
  DomainDefinition,
  ElementDefinition,
} from '../element-contracts.js';
import type { DomainAppDescriptor } from '../app-descriptor.js';
import type { DomainAppLock } from '../app-lock.js';
import type { FunctionRef, ResolvedTarget } from '../refs.js';
import { contentDigestOf } from '../digest.js';

/** Deterministic valid-form digests for fixture resources (not real file bytes). */
const RESOURCE_DIGESTS = {
  rules: contentDigestOf({ fixture: 'orders/rules', revision: 1 }),
  document: contentDigestOf({ fixture: 'orders/eligibility-doc', revision: 1 }),
  faq: contentDigestOf({ fixture: 'orders/faq', revision: 1 }),
  cases: contentDigestOf({ fixture: 'orders/eligibility-cases', revision: 1 }),
} as const;

const FAQ_ELEMENT_VERSION: SemVer = '1.0.0';
const ELIGIBILITY_ELEMENT_VERSION: SemVer = '1.0.0';

/**
 * AC01 positive form one: a 0-Function structured knowledge Element.
 * `functions: []` is a first-class legal form (PRD AR-02/AC01), not a
 * degenerate one; the knowledge block carries provenance.
 */
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

/**
 * AC01 positive form two: a 2-Function Element with two typed content
 * blocks of different kinds (rule + document), an inline rule value, a
 * document ref, a dependency with function pin, and validation cases.
 */
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

/**
 * Domain fixture with a cycle-legal semantic graph: eligibility → faq →
 * eligibility is allowed (PRD E07/AC02); build-time dependency DAG rules
 * are a separate graph owned by BUILD (T02).
 */
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

/**
 * Extensibility positive, KNOWN-EXTENSION track: `dh-ext.acme.prompt`
 * satisfies the frozen predicate's `dh-ext.` prefix arm, so it is a KNOWN
 * extension kind (isUnknownContentKind === false), legal here regardless
 * of the required flag. It is NOT the unknown-optional case.
 */
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

/**
 * Extensibility positive, TRUE UNKNOWN-OPTIONAL track (PRD E10 / L2 §2.3 /
 * controller supplement #1575/7024893190): bare `prompt` is NOT in
 * CORE_CONTENT_KINDS and carries no dh-ext prefix, so
 * isUnknownContentKind('prompt') === true. Because the block is explicitly
 * OPTIONAL, the schema layer must accept it; when BUILD selects this
 * element with the block unselected, it records the explicit exclusion in
 * the Lock's `excludedUnknownContent` (see the paired exclusion fixture).
 *
 * The value is deliberately outside the frozen `ContentKind` TS union
 * (`CoreContentKind | dh-ext.${string}` cannot spell a bare unknown kind),
 * so it erases through `unknown` — the same escape any author of an
 * unknown-optional block needs against the frozen L2 §2.2 type; the JSON
 * Schema and the validators are the machine authority for this track.
 */
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

/**
 * Lock-exclusion INPUT fixture for T02 (schema/TS layer only — T01 does
 * not implement Lock generation): when BUILD selects
 * UNKNOWN_OPTIONAL_ELEMENT_FIXTURE while leaving its unknown optional
 * block unselected, the produced DomainAppLock.excludedUnknownContent must
 * contain exactly one deterministic record for it. This fixture pins the
 * canonical record form `<elementId>/<contentBlockId>` so T02 and the AC02
 * evidence can consume and assert it directly.
 */
export const UNKNOWN_OPTIONAL_EXCLUSION_FIXTURE = {
  elementId: 'orders.legacy-prompt-notes',
  contentBlockId: 'prompt-note',
  contentKind: 'prompt',
  excludedUnknownContent: ['orders.legacy-prompt-notes/prompt-note'],
} as const;

// ---- D02 completion fixtures: legal Descriptor + exact Lock ----
// (controller pre-review #1575/7025451554). These are schema/TS-layer
// authoring fixtures: the Lock's closureDigest here is a valid-form wire
// value only — recomputing the predecessor image is BUILD/Boot authority
// (L2 §5.3), deliberately not simulated in T01.

// Descriptor carries the authoring TargetSelector (no profile); the exact
// profile appears only in the sealed Lock's ResolvedTarget (L2 §5.1/§5.2).
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

/** Legal selection-intent descriptor (NOT a Lock), coherent with ORDERS_DOMAIN_FIXTURE. */
export const DOMAIN_APP_DESCRIPTOR_FIXTURE: DomainAppDescriptor = {
  kind: 'DomainApp',
  schemaVersion: 'dh.app/0.11',
  id: 'orders.basic',
  version: '1.0.0',
  target: APP_TARGET_SELECTOR,
  roots: {
    kernelPrimary: { package: 'kdp-basic', version: '1.0.0' },
    sdkPrimary: { package: 'sdk-core', version: '1.0.0' },
    businessPrimary: { package: 'orders-business', version: '1.0.0' },
  },
  extensions: [],
  businessAppInit: {
    element: {
      namespace: 'orders',
      id: 'orders.app-main',
      version: '1.0.0',
      digest: contentDigestOf({ fixture: 'orders/app-main-definition', revision: 1 }),
    },
    functionId: 'init',
    contractVersion: '1',
  },
  ingress: [
    { id: 'evaluate', function: EVALUATE_FUNCTION_REF, optional: false },
  ],
  config: {
    regionDefault: 'EU',
  },
};

/** Legal exact-Lock fixture covering every DomainAppLock conceptual key. */
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
    kdpPackageId: '@kaicreator/domain-harness-microkernel',
    kdpPrimaryEntry: 'bootstrap',
    kdpPrimaryDigest: contentDigestOf({ fixture: 'kdp/bootstrap-entry', revision: 1 }),
  },
  selectedPackages: [
    {
      packageId: 'kdp-basic',
      version: '1.0.0',
      layer: 'kernel',
      role: 'primary',
      artifact: {
        packageId: 'kdp-basic',
        path: 'dist/kdp-basic.mjs',
        digest: contentDigestOf({ fixture: 'kdp-basic/artifact', revision: 1 }),
      },
      dependsOn: [],
    },
    {
      packageId: 'sdk-core',
      version: '1.0.0',
      layer: 'sdk',
      role: 'primary',
      artifact: {
        packageId: 'sdk-core',
        path: 'dist/sdk-core.mjs',
        digest: contentDigestOf({ fixture: 'sdk-core/artifact', revision: 1 }),
      },
      dependsOn: ['kdp-basic'],
    },
    {
      packageId: 'orders-business',
      version: '1.0.0',
      layer: 'business',
      role: 'primary',
      artifact: ORDERS_BUSINESS_ARTIFACT,
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
  technicalInitOrder: ['kdp-basic', 'sdk-core', 'orders-business'],
  technicalDisposeOrder: ['orders-business', 'sdk-core', 'kdp-basic'],
  businessAppInit: DOMAIN_APP_DESCRIPTOR_FIXTURE.businessAppInit,
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
