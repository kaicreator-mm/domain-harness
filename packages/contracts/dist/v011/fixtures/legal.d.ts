import type { DomainDefinition, ElementDefinition } from '../element-contracts.js';
/**
 * AC01 positive form one: a 0-Function structured knowledge Element.
 * `functions: []` is a first-class legal form (PRD AR-02/AC01), not a
 * degenerate one; the knowledge block carries provenance.
 */
export declare const KNOWLEDGE_ELEMENT_FIXTURE: ElementDefinition;
/**
 * AC01 positive form two: a 2-Function Element with two typed content
 * blocks of different kinds (rule + document), an inline rule value, a
 * document ref, a dependency with function pin, and validation cases.
 */
export declare const ELIGIBILITY_ELEMENT_FIXTURE: ElementDefinition;
/**
 * Domain fixture with a cycle-legal semantic graph: eligibility → faq →
 * eligibility is allowed (PRD E07/AC02); build-time dependency DAG rules
 * are a separate graph owned by BUILD (T02).
 */
export declare const ORDERS_DOMAIN_FIXTURE: DomainDefinition;
/**
 * Extensibility positive, KNOWN-EXTENSION track: `dh-ext.acme.prompt`
 * satisfies the frozen predicate's `dh-ext.` prefix arm, so it is a KNOWN
 * extension kind (isUnknownContentKind === false), legal here regardless
 * of the required flag. It is NOT the unknown-optional case.
 */
export declare const EXTENSION_OPTIONAL_ELEMENT_FIXTURE: ElementDefinition;
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
export declare const UNKNOWN_OPTIONAL_ELEMENT_FIXTURE: ElementDefinition;
/**
 * Lock-exclusion INPUT fixture for T02 (schema/TS layer only — T01 does
 * not implement Lock generation): when BUILD selects
 * UNKNOWN_OPTIONAL_ELEMENT_FIXTURE while leaving its unknown optional
 * block unselected, the produced DomainAppLock.excludedUnknownContent must
 * contain exactly one deterministic record for it. This fixture pins the
 * canonical record form `<elementId>/<contentBlockId>` so T02 and the AC02
 * evidence can consume and assert it directly.
 */
export declare const UNKNOWN_OPTIONAL_EXCLUSION_FIXTURE: {
    readonly elementId: "orders.legacy-prompt-notes";
    readonly contentBlockId: "prompt-note";
    readonly contentKind: "prompt";
    readonly excludedUnknownContent: readonly ["orders.legacy-prompt-notes/prompt-note"];
};
