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
 * Extensibility positive (PRD E10): an unknown-to-BUILD kind that is
 * explicitly OPTIONAL is legal at the schema layer and later recorded in
 * the Lock's excludedUnknownContent — it must NOT be refused here.
 */
export const EXTENSION_OPTIONAL_ELEMENT_FIXTURE: ElementDefinition = {
  kind: 'Element',
  schemaVersion: 'dh.element/0.11',
  id: 'orders.prompt-notes',
  version: '1.0.0',
  description: 'Carries an optional dh-ext prompt block that BUILD may explicitly exclude.',
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
