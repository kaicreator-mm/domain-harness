import type { JsonObject, JsonValue } from '../contracts/json.js';
export interface DomainPredicateEvent {
    readonly type: string;
    readonly payload?: JsonObject;
}
export type DomainPredicateOperand = {
    readonly source: 'context';
    readonly path: readonly string[];
} | {
    readonly source: 'event';
    readonly path: readonly string[];
} | {
    readonly source: 'literal';
    readonly value: JsonValue;
};
export type DomainPredicate = {
    readonly op: 'constant';
    readonly value: boolean;
} | {
    readonly op: 'exists';
    readonly operand: DomainPredicateOperand;
} | {
    readonly op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte';
    readonly left: DomainPredicateOperand;
    readonly right: DomainPredicateOperand;
} | {
    readonly op: 'not';
    readonly predicate: DomainPredicate;
} | {
    readonly op: 'all' | 'any';
    readonly predicates: readonly DomainPredicate[];
};
export interface DomainWorkflowGuard {
    readonly guardId: string;
    readonly predicate: DomainPredicate;
}
/**
 * Hard Invariants are supplied by the pinned Governance Baseline. This type
 * only defines their predicate shape; governance pin lookup/binding is owned
 * by the governance/admission tasks, not by the Workflow contract.
 */
export interface DomainHardInvariantPredicate {
    readonly invariantId: string;
    readonly predicate: DomainPredicate;
}
export interface DomainPredicateEvaluationInput {
    readonly context: JsonObject;
    readonly event: DomainPredicateEvent;
}
export declare class PredicateContractViolation extends Error {
    readonly code: "PREDICATE_CONTRACT_VIOLATION";
    constructor(message: string);
}
/**
 * Configuration/pre-admission boundary for compiled predicate data.
 * This function may inspect the supplied value while preparing it; callers
 * must not invoke it from an authoritative Guard/Hard-Invariant predicate.
 */
export declare function prepareDomainPredicate(predicate: DomainPredicate): DomainPredicate;
/**
 * Configuration/pre-admission boundary for Workflow Guard definitions.
 */
export declare function prepareDomainWorkflowGuard(guard: DomainWorkflowGuard): DomainWorkflowGuard;
/**
 * Configuration/pre-admission boundary for Governance Hard Invariants.
 */
export declare function prepareDomainHardInvariantPredicate(invariant: DomainHardInvariantPredicate): DomainHardInvariantPredicate;
/**
 * Pre-admission boundary for Workflow context. The returned object is detached
 * from the caller, recursively frozen, and registered as trusted predicate
 * data. Runtime Guard evaluation only accepts this prepared identity.
 */
export declare function prepareDomainPredicateContext(context: JsonObject): JsonObject;
/**
 * Pre-admission boundary for structured Domain Events.
 */
export declare function prepareDomainPredicateEvent(event: DomainPredicateEvent): DomainPredicateEvent;
/**
 * Creates an admission input only from already prepared context/event values.
 * WeakSet membership checks are trap-free and therefore safe to run on an
 * untrusted candidate reference before any property access occurs.
 */
export declare function createPreparedDomainPredicateEvaluationInput(context: JsonObject, event: DomainPredicateEvent): DomainPredicateEvaluationInput;
/**
 * Convenience preparation boundary for callers that already hold trusted
 * compiled/runtime-owned data. It is intentionally separate from evaluation.
 */
export declare function prepareDomainPredicateEvaluationInput(input: DomainPredicateEvaluationInput): DomainPredicateEvaluationInput;
export declare function evaluateDomainPredicate(predicate: DomainPredicate, input: DomainPredicateEvaluationInput): boolean;
export declare function evaluateDomainWorkflowGuard(guard: DomainWorkflowGuard, input: DomainPredicateEvaluationInput): boolean;
export declare function evaluateDomainHardInvariantPredicate(invariant: DomainHardInvariantPredicate, input: DomainPredicateEvaluationInput): boolean;
//# sourceMappingURL=predicate.d.ts.map