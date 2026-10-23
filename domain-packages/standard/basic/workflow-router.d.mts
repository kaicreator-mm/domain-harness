/** Versioned DomainHarness v0.9 N01 pure Standard Router type declarations.
 *
 * This .d.mts is resolved by TS/NodeNext for the adjacent .mjs module.
 * Types are descriptive only, NOT a signed/approved selected Package root,
 * principal, Host capability, Kernel admission decision, or Effect permit.
 */
export type WorkflowRouterOutcomeKind = 'selected' | 'missing' | 'ambiguous' | 'denied';
export type WorkflowRouterEligibility = 'eligible' | 'denied';

/** BUILD-pinned data identity tuple; Kernel MUST independently verify it. */
export interface WorkflowRouterBinding {
  readonly intentId: string;
  readonly operationId: string;
  readonly capabilityId: string;
  readonly handlerId: string;
}

export interface WorkflowRouterCandidate {
  readonly operationId: string;
  readonly capabilityId: string;
  readonly priority: number;
  readonly eligibility: WorkflowRouterEligibility;
}

export interface WorkflowRouterRequest {
  readonly intentId: string;
  /** Claimed proposal digest, not an issuer proof; K/H verify before effects. */
  readonly basisDigest: string;
  readonly bindings: readonly WorkflowRouterBinding[];
  readonly candidates: readonly WorkflowRouterCandidate[];
}

export type WorkflowRouterResult =
  | Readonly<{
      kind: 'selected';
      operationId: string;
      capabilityId: string;
      handlerId: string;
      /** Not an approval, trust signature or H-issued permit. */
      basisDigest: string;
    }>
  | Readonly<{ kind: 'missing'; intentId: string }>
  | Readonly<{ kind: 'ambiguous'; intentId: string; candidateOperationIds: readonly string[] }>
  | Readonly<{ kind: 'denied'; reasonCode: string }>;

export declare const WORKFLOW_ROUTER_RESULT_KINDS: readonly [
  'selected', 'missing', 'ambiguous', 'denied',
];

export declare class WorkflowRouterError extends Error {
  readonly name: 'WorkflowRouterError';
  readonly code: string;
  constructor(code: string, message: string);
}

/**
 * Pure, import-free Standard-owned candidate selection.
 * Input is validated as bounded plain data (even if TypeScript callers
 * supply a well-typed shape). Does not grant State/Journal/Admission/Effect.
 * Kernel must independently revalidate selected BUILD binding and
 * H-authenticated principal/permit against trusted current authority.
 */
export declare function routeWorkflowIntent(request: unknown): WorkflowRouterResult;
