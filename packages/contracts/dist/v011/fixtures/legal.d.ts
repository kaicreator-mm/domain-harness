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
 * Extensibility positive (PRD E10): an unknown-to-BUILD kind that is
 * explicitly OPTIONAL is legal at the schema layer and later recorded in
 * the Lock's excludedUnknownContent — it must NOT be refused here.
 */
export declare const EXTENSION_OPTIONAL_ELEMENT_FIXTURE: ElementDefinition;
