// v0.6 T006 (issue #550, frozen L2 C4 / A4): stable public Decision
// Resolution Receipt.
//
// A receipt is a bounded typed projection derived ONLY from contract-level
// facts the resolver/admission/seam already produce (AdmissionResolverEvidence,
// AdmittedAdmission / AdmissionDenial, the T005 unavailable terminal, the
// thrown resolver failure class). It is exposed through the EXISTING Runtime
// Observation stream (one additive `DECISION_RECEIPT` record kind carrying the
// receipt in the record envelope) and as an additive field on the existing
// `resolveAndAdmitTurn` return.
//
// Authority invariants (frozen L2 A4 / §7):
// - no private model chain-of-thought and no raw model payloads;
// - no business-truth claims beyond the actual admitted/denied outcome;
// - no mutation/replay authority (a receipt is inert data, never executable
//   as control/effect);
// - no inferred effect completion (effect facts stay with the existing
//   AdmittedEffectOutcome journal facts);
// - receipt/recording failure can never strengthen or rewrite business truth.
//
// Portable: no Node built-ins, no engine internals. Composition happens in
// create-domain-runtime-v3.ts (projection) and the public barrels (exports
// only).
import type { CompiledArtifactIdentity, DomainIntelligencePackageIdentity } from '../contracts/domain-data.js';
import type { AdmissionDenialReason, CentralAdmissionOutcome } from '../admission/contracts.js';
import {
  DecisionResolverError,
  type DecisionResolverCacheTelemetry,
  type DecisionResolverSource,
} from '../decision-resolver/contracts.js';
import { DomainRuntimeV3Error } from '../runtime/runtime-v3-errors.js';
import type { WorkflowAddress } from '../v2/contracts/workflow.js';
import { RuntimeObservationError, type RuntimeObservationRecord } from './contracts.js';

/**
 * Terminal category of one semantic-decision turn (L2 §7 stable categories,
 * L3 spelling mapped onto the existing seam outcomes; the T005 unavailable
 * terminal stays its own category and is never collapsed into a denial or a
 * resolver failure).
 */
export type DecisionResolutionReceiptDisposition =
  | 'admitted'
  | 'denied'
  | 'semantic-unavailable'
  | 'resolver-failed';

/**
 * Bounded resolver failure class (L3 mapping of the existing resolver/runtime
 * error codes onto the public receipt vocabulary; an unmapped error keeps the
 * honest `unknown` class and is never fabricated into success).
 */
export type DecisionReceiptResolverFailureClass =
  | 'rule-failed'
  | 'schema-violation'
  | 'promoted-unconfigured'
  | 'promoted-revoked-deny'
  | 'revocation-record-missing'
  | 'harness-unconfigured'
  | 'harness-failed'
  | 'decision-binding-incompatible'
  | 'unknown';

/**
 * Bounded failure category. Present exactly when the turn did NOT end
 * admitted-through-publication: an admission denial carries its existing
 * denial reason (plus the optional denial detail identities), the T005
 * semantic-unavailable terminal carries its own category, and a thrown
 * resolver failure carries its bounded class.
 */
export type DecisionReceiptFailureCategory =
  | {
      readonly kind: 'admission-denied';
      readonly reason: AdmissionDenialReason;
      readonly invariantId?: string;
      readonly guardId?: string;
      readonly transitionKey?: string;
    }
  | { readonly kind: 'semantic-unavailable' }
  | { readonly kind: 'resolver-failure'; readonly failureClass: DecisionReceiptResolverFailureClass };

/** Exact artifact identity of the selected promoted artifact, where applicable. */
export interface DecisionReceiptArtifactIdentity {
  readonly kind: string;
  readonly artifactId: string;
  readonly contentDigest: string;
}

/**
 * The stable public Decision Resolution Receipt for one semantic-decision
 * turn. Every field is derived from an existing contract-level fact; the
 * shape is closed (the validator rejects unknown fields) and carries only
 * JSON data — no methods, no payloads, no executable surface.
 */
export interface DecisionResolutionReceipt {
  /** Stable compiled decision identity (A4 correlation identity). */
  readonly decisionId: string;
  /** Exact compiled declaration content identity (A4 correlation identity). */
  readonly declarationDigest: string;
  /** Durable control-turn identity — the same identity Central Admission and the effect journal use for this turn. */
  readonly durableControlTurnId: string;
  /** Terminal category of the decision-resolution lifecycle for this turn. */
  readonly disposition: DecisionResolutionReceiptDisposition;
  /** Admitted source category (present exactly when a resolution result reached admission). */
  readonly source?: DecisionResolverSource;
  /** Existing resolver evidence (present exactly when a resolution result reached admission). */
  readonly freshModelCallCount?: number;
  readonly llmAvoided?: boolean;
  /** Existing cache/reuse disposition (present exactly when a resolution result reached admission). */
  readonly cacheRead?: DecisionResolverCacheTelemetry['read'];
  readonly cacheWrite?: NonNullable<DecisionResolverCacheTelemetry['write']>;
  /** Selected promoted artifact identity, where applicable. */
  readonly selectedArtifact?: DecisionReceiptArtifactIdentity;
  /** Pinned governance binding digest of the admitted/denied outcome. */
  readonly governanceBindingDigest?: string;
  /** Correlation to the invoking execution. */
  readonly workflowTarget?: string;
  readonly workflowInstanceId?: string;
  /** Bounded failure category, where applicable. */
  readonly failure?: DecisionReceiptFailureCategory;
}

/** Exact receipt envelope field name on a `DECISION_RECEIPT` observation record. */
export type DecisionReceiptEnvelopeField = 'decisionReceipt';

/**
 * Existing-fact bundle identifying the turn a receipt describes. The runtime
 * seam derives `durableControlTurnId` through the SAME
 * `deriveDurableControlTurnId` authority Central Admission uses, so receipt
 * identity correlates exactly with admission/journal identity.
 */
export interface DecisionReceiptIdentityInput {
  readonly decisionId: string;
  readonly declarationDigest: string;
  readonly durableControlTurnId: string;
  readonly target: WorkflowAddress;
  readonly workflowInstanceId: string;
}

/**
 * The existing seam terminal a receipt is derived from. `admission-outcome`
 * carries the existing Central Admission outcome verbatim (plus the resolved
 * decision's selected promoted artifact identity, an existing
 * `ResolvedDecision` fact); the other terminals carry no resolved evidence by
 * construction — the resolver produced nothing admissible.
 */
export type DecisionResolutionTerminal =
  | {
      readonly kind: 'admission-outcome';
      readonly outcome: CentralAdmissionOutcome;
      readonly selectedArtifact?: CompiledArtifactIdentity;
    }
  | { readonly kind: 'semantic-unavailable' }
  | { readonly kind: 'resolver-failed'; readonly error: unknown };

const DISPOSITIONS: readonly DecisionResolutionReceiptDisposition[] = [
  'admitted',
  'denied',
  'semantic-unavailable',
  'resolver-failed',
];

const SOURCES: readonly DecisionResolverSource[] = [
  'rule',
  'exact-cache',
  'promoted-subworkflow',
  'harness-machine',
  'declared-unavailable',
];

const CACHE_READS: readonly DecisionResolverCacheTelemetry['read'][] = [
  'hit',
  'miss',
  'bypass',
  'store-error',
  'disabled',
];

const CACHE_WRITES: readonly NonNullable<DecisionResolverCacheTelemetry['write']>[] = [
  'inserted',
  'existing',
  'skipped',
  'store-error',
];

const DENIAL_REASONS: readonly AdmissionDenialReason[] = [
  'schema',
  'hard-invariant',
  'guard',
  'no-candidate-transition',
];

const RESOLVER_FAILURE_CLASSES: readonly DecisionReceiptResolverFailureClass[] = [
  'rule-failed',
  'schema-violation',
  'promoted-unconfigured',
  'promoted-revoked-deny',
  'revocation-record-missing',
  'harness-unconfigured',
  'harness-failed',
  'decision-binding-incompatible',
  'unknown',
];

const RECEIPT_KEYS: ReadonlySet<string> = new Set([
  'decisionId',
  'declarationDigest',
  'durableControlTurnId',
  'disposition',
  'source',
  'freshModelCallCount',
  'llmAvoided',
  'cacheRead',
  'cacheWrite',
  'selectedArtifact',
  'governanceBindingDigest',
  'workflowTarget',
  'workflowInstanceId',
  'failure',
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function failInvalid(detail: string): never {
  throw new RuntimeObservationError('DECISION_RECEIPT_INVALID', `invalid decision receipt: ${detail}`);
}

/**
 * Fail-closed receipt shape authority (runtime half of the type-level
 * closure): the receipt carries exactly the bounded A4 fields, no unknown
 * fields (no smuggled payloads), no functions/methods (no mutation/replay
 * surface), and the vocabulary values are exactly the declared ones.
 */
export function assertValidDecisionResolutionReceipt(receipt: unknown): asserts receipt is DecisionResolutionReceipt {
  if (!isObject(receipt)) failInvalid('receipt must be a JSON object');
  for (const key of Object.keys(receipt)) {
    if (!RECEIPT_KEYS.has(key)) failInvalid(`unknown receipt field "${key}"`);
  }
  if (!nonEmptyString(receipt.decisionId)) failInvalid('decisionId must be a non-empty string');
  if (!nonEmptyString(receipt.declarationDigest)) failInvalid('declarationDigest must be a non-empty string');
  if (!nonEmptyString(receipt.durableControlTurnId)) failInvalid('durableControlTurnId must be a non-empty string');
  if (
    typeof receipt.disposition !== 'string'
    || !DISPOSITIONS.includes(receipt.disposition as DecisionResolutionReceiptDisposition)
  ) {
    failInvalid('disposition must be a declared receipt disposition');
  }
  const withEvidence = receipt.disposition === 'admitted' || receipt.disposition === 'denied';
  if (receipt.source !== undefined) {
    if (!withEvidence) failInvalid('source is only present when a resolution result reached admission');
    if (typeof receipt.source !== 'string' || !SOURCES.includes(receipt.source as DecisionResolverSource)) {
      failInvalid('source must be a declared resolver source');
    }
  } else if (withEvidence) {
    failInvalid('source is required for an admitted/denied receipt');
  }
  if (receipt.freshModelCallCount !== undefined) {
    if (!withEvidence) failInvalid('freshModelCallCount is only present when a resolution result reached admission');
    if (
      typeof receipt.freshModelCallCount !== 'number'
      || !Number.isSafeInteger(receipt.freshModelCallCount)
      || receipt.freshModelCallCount < 0
    ) {
      failInvalid('freshModelCallCount must be a non-negative safe integer');
    }
  } else if (withEvidence) {
    failInvalid('freshModelCallCount is required for an admitted/denied receipt');
  }
  if (receipt.llmAvoided !== undefined) {
    if (!withEvidence) failInvalid('llmAvoided is only present when a resolution result reached admission');
    if (typeof receipt.llmAvoided !== 'boolean') failInvalid('llmAvoided must be a boolean');
  } else if (withEvidence) {
    failInvalid('llmAvoided is required for an admitted/denied receipt');
  }
  if (receipt.cacheRead !== undefined) {
    if (!withEvidence) failInvalid('cacheRead is only present when a resolution result reached admission');
    if (
      typeof receipt.cacheRead !== 'string'
      || !CACHE_READS.includes(receipt.cacheRead as DecisionResolverCacheTelemetry['read'])
    ) {
      failInvalid('cacheRead must be a declared cache read disposition');
    }
  } else if (withEvidence) {
    failInvalid('cacheRead is required for an admitted/denied receipt');
  }
  if (receipt.cacheWrite !== undefined) {
    if (!withEvidence) failInvalid('cacheWrite is only present when a resolution result reached admission');
    if (
      typeof receipt.cacheWrite !== 'string'
      || !CACHE_WRITES.includes(receipt.cacheWrite as NonNullable<DecisionResolverCacheTelemetry['write']>)
    ) {
      failInvalid('cacheWrite must be a declared cache write disposition');
    }
  }
  if (receipt.selectedArtifact !== undefined) {
    if (!isObject(receipt.selectedArtifact)) failInvalid('selectedArtifact must be a JSON object');
    if (!nonEmptyString(receipt.selectedArtifact.kind)) failInvalid('selectedArtifact.kind must be a non-empty string');
    if (!nonEmptyString(receipt.selectedArtifact.artifactId)) {
      failInvalid('selectedArtifact.artifactId must be a non-empty string');
    }
    if (!nonEmptyString(receipt.selectedArtifact.contentDigest)) {
      failInvalid('selectedArtifact.contentDigest must be a non-empty string');
    }
  }
  if (receipt.governanceBindingDigest !== undefined && !nonEmptyString(receipt.governanceBindingDigest)) {
    failInvalid('governanceBindingDigest must be a non-empty string when present');
  }
  if (receipt.workflowTarget !== undefined && !nonEmptyString(receipt.workflowTarget)) {
    failInvalid('workflowTarget must be a non-empty string when present');
  }
  if (receipt.workflowInstanceId !== undefined && !nonEmptyString(receipt.workflowInstanceId)) {
    failInvalid('workflowInstanceId must be a non-empty string when present');
  }
  if (receipt.failure !== undefined) {
    const failure: unknown = receipt.failure;
    if (!isObject(failure)) failInvalid('failure must be a JSON object');
    if (failure.kind === 'admission-denied') {
      if (receipt.disposition !== 'denied') failInvalid('admission-denied failure requires a denied receipt');
      if (
        typeof failure.reason !== 'string'
        || !DENIAL_REASONS.includes(failure.reason as AdmissionDenialReason)
      ) {
        failInvalid('admission-denied failure reason must be a declared denial reason');
      }
      for (const detail of ['invariantId', 'guardId', 'transitionKey'] as const) {
        if (failure[detail] !== undefined && !nonEmptyString(failure[detail])) {
          failInvalid(`failure.${detail} must be a non-empty string when present`);
        }
      }
    } else if (failure.kind === 'semantic-unavailable') {
      if (receipt.disposition !== 'semantic-unavailable') {
        failInvalid('semantic-unavailable failure requires a semantic-unavailable receipt');
      }
    } else if (failure.kind === 'resolver-failure') {
      if (receipt.disposition !== 'resolver-failed') failInvalid('resolver-failure requires a resolver-failed receipt');
      if (
        typeof failure.failureClass !== 'string'
        || !RESOLVER_FAILURE_CLASSES.includes(failure.failureClass as DecisionReceiptResolverFailureClass)
      ) {
        failInvalid('resolver-failure failureClass must be a declared failure class');
      }
    } else {
      failInvalid('failure kind must be a declared failure category');
    }
  }
}

/**
 * L3 mapping of the existing resolver/runtime error codes onto the bounded
 * public failure-class vocabulary. An unmapped error keeps the honest
 * `unknown` class — never a fabricated success.
 */
export function classifyDecisionResolverFailure(error: unknown): DecisionReceiptResolverFailureClass {
  if (error instanceof DecisionResolverError) {
    switch (error.code) {
      case 'DECISION_RESOLVER_RULE_FAILED':
        return 'rule-failed';
      case 'DECISION_RESOLVER_SCHEMA_VIOLATION':
        return 'schema-violation';
      case 'DECISION_RESOLVER_PROMOTED_UNCONFIGURED':
        return 'promoted-unconfigured';
      case 'DECISION_RESOLVER_PROMOTED_REVOKED_DENY':
        return 'promoted-revoked-deny';
      case 'DECISION_RESOLVER_REVOCATION_RECORD_MISSING':
        return 'revocation-record-missing';
      case 'DECISION_RESOLVER_HARNESS_UNCONFIGURED':
        return 'harness-unconfigured';
      case 'DECISION_RESOLVER_HARNESS_FAILED':
        return 'harness-failed';
    }
  }
  if (error instanceof DomainRuntimeV3Error && error.code === 'RUNTIME_V3_DECISION_BINDING_INCOMPATIBLE') {
    return 'decision-binding-incompatible';
  }
  return 'unknown';
}

/**
 * Derive the bounded public receipt for one semantic-decision turn from the
 * EXISTING contract-level facts of its terminal. The derivation is pure and
 * self-validating: it can never emit a receipt that fails the shape authority.
 */
export function deriveDecisionResolutionReceipt(
  identity: DecisionReceiptIdentityInput,
  terminal: DecisionResolutionTerminal,
): DecisionResolutionReceipt {
  const base = {
    decisionId: identity.decisionId,
    declarationDigest: identity.declarationDigest,
    durableControlTurnId: identity.durableControlTurnId,
    workflowTarget: identity.target.workflowId,
    workflowInstanceId: identity.workflowInstanceId,
  };
  let receipt: DecisionResolutionReceipt;
  if (terminal.kind === 'semantic-unavailable') {
    receipt = {
      ...base,
      disposition: 'semantic-unavailable',
      failure: { kind: 'semantic-unavailable' },
    };
  } else if (terminal.kind === 'resolver-failed') {
    receipt = {
      ...base,
      disposition: 'resolver-failed',
      failure: {
        kind: 'resolver-failure',
        failureClass: classifyDecisionResolverFailure(terminal.error),
      },
    };
  } else {
    const outcome = terminal.outcome;
    if (outcome.status === 'admitted') {
      const admitted = outcome.admitted;
      const evidence = admitted.resolver;
      receipt = {
        ...base,
        disposition: 'admitted',
        source: evidence.source,
        freshModelCallCount: evidence.freshModelCallCount,
        llmAvoided: evidence.llmAvoided,
        cacheRead: evidence.cacheRead,
        ...(evidence.cacheWrite === undefined ? {} : { cacheWrite: evidence.cacheWrite }),
        ...(terminal.selectedArtifact === undefined
          ? {}
          : {
              selectedArtifact: {
                kind: terminal.selectedArtifact.kind,
                artifactId: terminal.selectedArtifact.artifactId,
                contentDigest: terminal.selectedArtifact.contentDigest,
              },
            }),
        governanceBindingDigest: admitted.governanceBindingDigest,
      };
    } else {
      const denial = outcome.denial;
      const evidence = denial.resolver;
      receipt = {
        ...base,
        disposition: 'denied',
        source: evidence.source,
        freshModelCallCount: evidence.freshModelCallCount,
        llmAvoided: evidence.llmAvoided,
        cacheRead: evidence.cacheRead,
        ...(evidence.cacheWrite === undefined ? {} : { cacheWrite: evidence.cacheWrite }),
        ...(terminal.selectedArtifact === undefined
          ? {}
          : {
              selectedArtifact: {
                kind: terminal.selectedArtifact.kind,
                artifactId: terminal.selectedArtifact.artifactId,
                contentDigest: terminal.selectedArtifact.contentDigest,
              },
            }),
        governanceBindingDigest: denial.governanceBindingDigest,
        failure: {
          kind: 'admission-denied',
          reason: denial.reason,
          ...(denial.invariantId === undefined ? {} : { invariantId: denial.invariantId }),
          ...(denial.guardId === undefined ? {} : { guardId: denial.guardId }),
          ...(denial.transitionKey === undefined ? {} : { transitionKey: denial.transitionKey }),
        },
      };
    }
  }
  assertValidDecisionResolutionReceipt(receipt);
  return receipt;
}

/** Durable append request for one decision receipt observation record. */
export interface DecisionReceiptRecordRequest {
  readonly target: WorkflowAddress;
  /** Exact immutable package identity of the receipt's stream binding. */
  readonly packageIdentity: DomainIntelligencePackageIdentity;
  readonly receipt: DecisionResolutionReceipt;
  /** Informational timestamp for the record (ordering authority stays `sequence`). */
  readonly observedAt: string;
  /** Opaque DAC/A2-owned provenance refs carried verbatim when present. */
  readonly runtimeBindingRef?: string;
  readonly runtimeActivationRef?: string;
}

/**
 * Additive observation-store extension (v0.6 T006): durable append of ONE
 * `DECISION_RECEIPT` record into the EXISTING durable ordered Runtime
 * Observation Stream of the exact (target, package identity, epoch '1')
 * binding.
 *
 * Adapter contract (same binding/contiguity rules as the covered v1 appends):
 * - validates the receipt fail-closed (`DECISION_RECEIPT_INVALID`) before any
 *   durable state changes;
 * - appends exactly one record at the next contiguous sequence, creating the
 *   stream binding when absent; a package-identity mismatch with an existing
 *   binding fails closed (`STREAM_IDENTITY_MISMATCH`);
 * - the append is atomic per record: either the record is durable or nothing
 *   changed (a failed append allocates no sequence);
 * - the record carries the receipt in its `decisionReceipt` envelope field and
 *   confers no authority whatsoever.
 */
export interface DecisionReceiptObservationStore {
  recordDecisionReceipt(request: DecisionReceiptRecordRequest): Promise<RuntimeObservationRecord>;
}

/** Structural capability check: does this store implement the receipt seam? */
export function isDecisionReceiptObservationStore(store: unknown): store is DecisionReceiptObservationStore {
  return (
    store !== null
    && typeof store === 'object'
    && typeof (store as { recordDecisionReceipt?: unknown }).recordDecisionReceipt === 'function'
  );
}
