/**
 * Versioned DomainHarness v0.9 N01 selected K/S/C ABI type declarations.
 *
 * Resolved by TS/NodeNext for the adjacent .mjs module. Types are descriptive
 * only: a table is NOT an approval, a Host capability or an Effect permit,
 * and an authorization receipt is NOT a State/Journal/Effect decision — the
 * physical H→K principal/permit port and effect dispatch (#1032/#1036) are
 * deliberately not representable here.
 */

/** One sealed package module identity of the selected closure. */
export interface SelectedModuleBinding {
  readonly packageId: string;
  readonly endpointId: string;
  readonly moduleSha256: string;
}

/** One selected Business package and its BUILD-observed declared intents. */
export interface SelectedBusinessBinding extends SelectedModuleBinding {
  readonly intentTypes: readonly string[];
}

/** One sealed operation→handler row of a selected Capability. */
export interface SelectedCapabilityOperation {
  readonly operationId: string;
  readonly handler: string;
}

/** One BUILD-selected Capability package of the closure. */
export interface SelectedCapabilityBinding {
  readonly capabilityId: string;
  readonly packageId: string;
  readonly endpointId: string;
  readonly moduleSha256: string;
  readonly operations: readonly SelectedCapabilityOperation[];
}

/** One v0.9 intent→operation route row (Router binding grammar). */
export interface SelectedRouteRow {
  readonly intentId: string;
  readonly operationId: string;
  readonly capabilityId: string;
  readonly handlerId: string;
}

/**
 * Frozen result of bindSelectedClosure: the shared selected K/S/C contract
 * one or more real Business packages compose with. `basisDigest` carries the
 * published v0.8 sealed closure digest value (no v0.9 digest is invented).
 */
export interface SelectedClosureTable {
  readonly formatVersion: 'dh.v9.selected-abi/1';
  readonly rootPackageId: string;
  readonly basisDigest: string;
  readonly kernel: SelectedModuleBinding;
  readonly standard: SelectedModuleBinding;
  readonly businesses: readonly SelectedBusinessBinding[];
  readonly capabilities: readonly SelectedCapabilityBinding[];
  readonly routes: readonly SelectedRouteRow[];
}

/** BUILD-observed intent declarations of the sealed Business packages. */
export interface SelectedBusinessIntents {
  readonly packageId: string;
  readonly intentTypes: readonly string[];
}

export interface BindSelectedClosureInput {
  /** Plain-data sealed v0.8 qualified root (published BUILD authority). */
  readonly sealedRoot: unknown;
  readonly businessIntents: readonly SelectedBusinessIntents[];
  readonly routes: readonly SelectedRouteRow[];
}

/** Kernel admission revalidation receipt; grants no effect/journal/principal. */
export interface SelectedAdmissionReceipt {
  readonly admittedIntentId: string;
  readonly operationId: string;
  readonly capabilityId: string;
  readonly handlerId: string;
  readonly basisDigest: string;
}

export declare const V09_SELECTED_ABI_FORMAT: 'dh.v9.selected-abi/1';

export declare class SelectedAbiError extends Error {
  readonly name: 'SelectedAbiError';
  readonly code: string;
  constructor(code: string, message: string);
}

/**
 * BUILD binding interface: admit the v0.9 intent→operation route table over
 * one sealed v0.8 qualified closure. Refuses duplicate/unbound/mismatched
 * routes, undeclared intents and closed-role or capability structure drift
 * before any Package activation. Pure; computes no digest of its own.
 */
export declare function bindSelectedClosure(input: unknown): Readonly<SelectedClosureTable>;

/**
 * Standard-side pure derivation of the exact `routeWorkflowIntent` request
 * for one intent: sealed route rows only, caller-proposed candidates.
 */
export declare function routerRequestFor(
  table: unknown,
  intentId: string,
  candidates: unknown,
): Readonly<Record<string, unknown>>;

/**
 * Kernel-owned admission revalidation: only a `selected` Router result that
 * matches one sealed route row exactly (identity tuple AND basis digest)
 * yields a receipt; missing/ambiguous/denied outcomes and results carrying
 * smuggled authority fields admit nothing.
 */
export declare function authorizeSelectedOperation(input: unknown): Readonly<SelectedAdmissionReceipt>;
