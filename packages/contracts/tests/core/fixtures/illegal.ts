/** 当前领域契约：单一结构定义与严格的数据验证。 */
import {
  DOMAIN_APP_DESCRIPTOR_FIXTURE,
  DOMAIN_APP_LOCK_FIXTURE,
  ELIGIBILITY_ELEMENT_FIXTURE,
  KNOWLEDGE_ELEMENT_FIXTURE,
  ORDERS_DOMAIN_FIXTURE,
} from './legal.js';

export interface IllegalFixture {
  readonly name: string;
  readonly expectedCode: string;
  readonly target: 'element' | 'domain' | 'descriptor' | 'lock';
  readonly value: unknown;
}

const ALL_ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;

type JsonRecord = Record<string, unknown>;

function cloneLegal(value: unknown): JsonRecord {
  return structuredClone(value) as JsonRecord;
}

function asRecord(value: unknown): JsonRecord {
  return value as JsonRecord;
}

function asArray(value: unknown): unknown[] {
  return value as unknown[];
}

function knowledgeDraft(): JsonRecord {
  return cloneLegal(KNOWLEDGE_ELEMENT_FIXTURE);
}

function knowledgeFirstBlock(draft: JsonRecord): JsonRecord {
  return asRecord(asArray(draft['content'])[0]);
}

function knowledgeFirstRef(draft: JsonRecord): JsonRecord {
  return asRecord(knowledgeFirstBlock(draft)['ref']);
}

function eligibilityDraft(): JsonRecord {
  return cloneLegal(ELIGIBILITY_ELEMENT_FIXTURE);
}

function eligibilityFirstFunction(draft: JsonRecord): JsonRecord {
  return asRecord(asArray(draft['functions'])[0]);
}

export const ILLEGAL_FIXTURES: readonly IllegalFixture[] = [
  {
    name: 'unknown-required-content-kind',
    expectedCode: 'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      knowledgeFirstBlock(draft)['contentKind'] = 'prompt';
      return draft;
    })(),
  },
  {
    name: 'content-xor-both-present',
    expectedCode: 'DH_BUILD_CONTENT_XOR',
    target: 'element',
    value: (() => {
      const draft = eligibilityDraft();
      asRecord(asArray(draft['content'])[0])['ref'] = {
        packageId: 'orders-business',
        path: 'content/rules.json',
        digest: ALL_ZERO_DIGEST,
      };
      return draft;
    })(),
  },
  {
    name: 'content-xor-neither-present',
    expectedCode: 'DH_BUILD_CONTENT_XOR',
    target: 'element',
    value: (() => {
      const draft = eligibilityDraft();
      delete asRecord(asArray(draft['content'])[0])['value'];
      return draft;
    })(),
  },
  {
    name: 'outcomes-missing-succeeded',
    expectedCode: 'DH_BUILD_OUTCOMES_INVALID',
    target: 'element',
    value: (() => {
      const draft = eligibilityDraft();
      eligibilityFirstFunction(draft)['outcomes'] = ['UNKNOWN', 'FAILED'];
      return draft;
    })(),
  },
  {
    name: 'outcomes-unknown-literal',
    expectedCode: 'DH_BUILD_OUTCOMES_INVALID',
    target: 'element',
    value: (() => {
      const draft = eligibilityDraft();
      eligibilityFirstFunction(draft)['outcomes'] = ['SUCCEEDED', 'PARTIAL'];
      return draft;
    })(),
  },
  {
    name: 'element-id-empty',
    expectedCode: 'DH_BUILD_ELEMENT_ID_INVALID',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      draft['id'] = '';
      return draft;
    })(),
  },
  {
    name: 'element-id-illegal-characters',
    expectedCode: 'DH_BUILD_ELEMENT_ID_INVALID',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      draft['id'] = 'orders faq!';
      return draft;
    })(),
  },
  {
    name: 'element-id-duplicate-in-domain',
    expectedCode: 'DH_BUILD_ELEMENT_ID_INVALID',
    target: 'domain',
    value: (() => {
      const draft = cloneLegal(ORDERS_DOMAIN_FIXTURE);
      const elements = asArray(draft['elements']);
      asRecord(elements[1])['id'] = asRecord(elements[0])['id'];
      return draft;
    })(),
  },
  {
    name: 'permission-semantics-field-smuggled-onto-roles-element',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      draft['permissions'] = ['admin'];
      return draft;
    })(),
  },
  {
    name: 'ref-path-traversal',
    expectedCode: 'DH_BUILD_RESOURCE_MISSING',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      knowledgeFirstRef(draft)['path'] = '../secrets/faq.json';
      return draft;
    })(),
  },
  {
    name: 'ref-path-absolute',
    expectedCode: 'DH_BUILD_RESOURCE_MISSING',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      knowledgeFirstRef(draft)['path'] = '/etc/faq.json';
      return draft;
    })(),
  },
  {
    name: 'digest-format-invalid',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      knowledgeFirstRef(draft)['digest'] = 'deadbeef';
      return draft;
    })(),
  },
  {
    name: 'discriminant-kind-wrong',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      draft['kind'] = 'Rule';
      return draft;
    })(),
  },
  {
    name: 'schema-version-stale',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'element',
    value: (() => {
      const draft = knowledgeDraft();
      draft['schemaVersion'] = 'dh.element/0.10';
      return draft;
    })(),
  },
  {
    name: 'domain-elements-empty',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'domain',
    value: (() => {
      const draft = cloneLegal(ORDERS_DOMAIN_FIXTURE);
      draft['elements'] = [];
      return draft;
    })(),
  },
  {
    name: 'descriptor-discriminant-wrong',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'descriptor',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_DESCRIPTOR_FIXTURE);
      draft['kind'] = 'DomainApp2';
      return draft;
    })(),
  },
  {
    name: 'descriptor-schema-version-stale',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'descriptor',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_DESCRIPTOR_FIXTURE);
      draft['schemaVersion'] = 'dh.app/0.10';
      return draft;
    })(),
  },
  {
    name: 'descriptor-roots-missing',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'descriptor',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_DESCRIPTOR_FIXTURE);
      delete draft['roots'];
      return draft;
    })(),
  },
  {
    name: 'descriptor-ingress-missing',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'descriptor',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_DESCRIPTOR_FIXTURE);
      delete draft['ingress'];
      return draft;
    })(),
  },
  {
    name: 'descriptor-target-wrong-runtime',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'descriptor',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_DESCRIPTOR_FIXTURE);
      asRecord(draft['target'])['runtime'] = 'browser';
      return draft;
    })(),
  },
  {
    name: 'lock-discriminant-wrong',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'lock',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_LOCK_FIXTURE);
      draft['kind'] = 'LockV2';
      return draft;
    })(),
  },
  {
    name: 'lock-schema-version-stale',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'lock',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_LOCK_FIXTURE);
      draft['schemaVersion'] = 'dh.lock/0.10';
      return draft;
    })(),
  },
  {
    name: 'lock-closure-digest-format-invalid',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'lock',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_LOCK_FIXTURE);
      draft['closureDigest'] = 'deadbeef';
      return draft;
    })(),
  },
  {
    name: 'lock-kdp-entry-wrong',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'lock',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_LOCK_FIXTURE);
      asRecord(draft['bootstrapKdpPin'])['kdpPrimaryEntry'] = 'init';
      return draft;
    })(),
  },
  {
    name: 'lock-target-profile-wrong',
    expectedCode: 'DH_BUILD_SCHEMA_INVALID',
    target: 'lock',
    value: (() => {
      const draft = cloneLegal(DOMAIN_APP_LOCK_FIXTURE);
      asRecord(draft['target'])['profile'] = 'node20-esm/1';
      return draft;
    })(),
  },
];
