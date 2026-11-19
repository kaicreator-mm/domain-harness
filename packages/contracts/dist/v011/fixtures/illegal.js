/**
 * DomainHarness v0.11.0 T01 (#1575) — illegal negative fixtures, each bound
 * to exactly one frozen DH_BUILD_* catalog code (L2 §9.3: every AC needs a
 * falsifiable negative; codes are asserted exactly, never by message
 * matching). Each fixture is a minimal mutation of a legal fixture so the
 * review diff shows precisely which rule fires.
 *
 * Mutations happen on a JSON-level clone (`unknown`): the negative values
 * are intentionally OUTSIDE the legal type surface, so keeping them typed
 * would be self-defeating.
 */
import { ELIGIBILITY_ELEMENT_FIXTURE, KNOWLEDGE_ELEMENT_FIXTURE, ORDERS_DOMAIN_FIXTURE, } from './legal.js';
const ALL_ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;
function cloneLegal(value) {
    return structuredClone(value);
}
function asRecord(value) {
    return value;
}
function asArray(value) {
    return value;
}
function knowledgeDraft() {
    return cloneLegal(KNOWLEDGE_ELEMENT_FIXTURE);
}
function knowledgeFirstBlock(draft) {
    return asRecord(asArray(draft['content'])[0]);
}
function knowledgeFirstRef(draft) {
    return asRecord(knowledgeFirstBlock(draft)['ref']);
}
function eligibilityDraft() {
    return cloneLegal(ELIGIBILITY_ELEMENT_FIXTURE);
}
function eligibilityFirstFunction(draft) {
    return asRecord(asArray(draft['functions'])[0]);
}
export const ILLEGAL_FIXTURES = [
    {
        name: 'unknown-required-content-kind',
        expectedCode: 'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED',
        target: 'element',
        // PRD E03's own extension example ('prompt') is unknown without the
        // dh-ext prefix; the block's required:true makes it a refusal (PRD E10).
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
        // Roles stay descriptive (PRD AR-01): a permission-style field outside
        // the closed-world key set is refused, never interpreted.
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
];
