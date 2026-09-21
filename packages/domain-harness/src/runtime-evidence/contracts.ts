import type { ContentDigest } from '../contracts/identity.js';
import { isContentDigest } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';
import type {
  RuntimeEvidenceArtifactRef,
  RuntimeEvidenceExternalScopeContract,
  RuntimeEvidenceGovernanceBaselineRef,
  RuntimeEvidenceRecord,
  RuntimeEvidenceScope,
  RuntimeEvidenceSourceExecutionRef,
} from '../contracts/runtime-evidence.js';
import type { HumanOperatorActorIdentity } from '../promotion-activation/contracts.js';

export type RuntimeEvidenceIntegrationErrorCode =
  | 'INVALID_RUNTIME_EVIDENCE_INTEGRATION'
  | 'RUNTIME_EVIDENCE_FLOATING_FALLBACK'
  | 'RUNTIME_EVIDENCE_SHADOW_FAILED'
  | 'RUNTIME_EVIDENCE_APPEND_CONFLICT';

export class RuntimeEvidenceIntegrationError extends Error {
  readonly code: RuntimeEvidenceIntegrationErrorCode;

  constructor(code: RuntimeEvidenceIntegrationErrorCode, message: string) {
    super(message);
    this.name = 'RuntimeEvidenceIntegrationError';
    this.code = code;
  }
}

function fail(code: RuntimeEvidenceIntegrationErrorCode, message: string): never {
  throw new RuntimeEvidenceIntegrationError(code, message);
}

/**
 * Exact stable fallback reference every represented Experimental artifact
 * must carry (Amendment A1 §15.2). The triple is content-exact: package id,
 * Governance Baseline content digest and artifact content identity.
 */
export interface StableFallbackIdentity {
  readonly packageId: string;
  readonly governanceBaselineContentDigest: ContentDigest;
  readonly artifact: RuntimeEvidenceArtifactRef;
}

/** An Experimental artifact is represented only together with its exact stable fallback. */
export interface ExperimentalArtifactReference {
  readonly subjectArtifact: RuntimeEvidenceArtifactRef;
  readonly stableFallback: StableFallbackIdentity;
}

/** Forbidden floating fallback authority tokens (A1 §15.2/§16). */
const FLOATING_FALLBACK_TOKENS: readonly string[] = [
  'latest',
  'active',
  'current stable',
  'nearest compatible',
];

function normalized(value: string): string {
  return value.trim().toLowerCase();
}

function assertExactSlot(value: unknown, field: string, digest: boolean): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail('INVALID_RUNTIME_EVIDENCE_INTEGRATION', `${field} must be a non-empty string`);
  }
  if (digest && !isContentDigest(value)) {
    fail('INVALID_RUNTIME_EVIDENCE_INTEGRATION', `${field} must be a non-empty content digest`);
  }
  if (FLOATING_FALLBACK_TOKENS.includes(normalized(value))) {
    fail(
      'RUNTIME_EVIDENCE_FLOATING_FALLBACK',
      `${field} uses forbidden floating fallback authority: ${normalized(value)}`,
    );
  }
}

function assertExactArtifactRef(value: RuntimeEvidenceArtifactRef, field: string): void {
  assertExactSlot(value.kind, `${field}.kind`, false);
  assertExactSlot(value.artifactId, `${field}.artifactId`, false);
  assertExactSlot(value.contentDigest, `${field}.contentDigest`, true);
}

/**
 * Fail-closed validation of the exact stable fallback identity. Any floating
 * alias in any identity slot rejects the representation before it can be used.
 */
export function assertExactStableFallbackIdentity(fallback: StableFallbackIdentity): void {
  assertExactSlot(fallback.packageId, 'stableFallback.packageId', false);
  assertExactSlot(
    fallback.governanceBaselineContentDigest,
    'stableFallback.governanceBaselineContentDigest',
    true,
  );
  assertExactArtifactRef(fallback.artifact, 'stableFallback.artifact');
}

/** Fail-closed validation of a represented Experimental artifact. */
export function assertExactExperimentalArtifact(reference: ExperimentalArtifactReference): void {
  assertExactArtifactRef(reference.subjectArtifact, 'subjectArtifact');
  assertExactStableFallbackIdentity(reference.stableFallback);
}

/** Capture-time binding of the exact authority context every record inherits. */
export interface RuntimeEvidenceCaptureContext {
  readonly domainId: string;
  readonly tenantScope?: string;
  readonly packageId: string;
  readonly governanceBaseline: RuntimeEvidenceGovernanceBaselineRef;
}

/** Shadow-only L4 evaluation request (A1 §15.1). */
export interface ShadowEvaluationRequest {
  readonly shadowId: string;
  readonly experimentalArtifact: ExperimentalArtifactReference;
  readonly input: JsonValue;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
}

export interface ShadowEvaluationResult {
  readonly verdict: JsonValue;
  readonly counterexamples?: readonly JsonValue[];
  readonly metrics?: Readonly<Record<string, JsonValue>>;
}

/**
 * Host-supplied pure shadow evaluator. The seam injects no admission port,
 * effect journal, tool port, baseline store, durable store or activation
 * authority, so a shadow run has no mutation channel by construction.
 */
export interface ShadowEvaluatorPort {
  evaluate(input: JsonValue): Promise<ShadowEvaluationResult>;
}

/** The shadow path's only output channel: Runtime Evidence records. */
export interface ShadowEvaluationOutcome {
  readonly evidence: readonly RuntimeEvidenceRecord[];
}

/** Operator rollback request against an Experimental artifact (A1 §15.2). */
export interface ExperimentalRollbackRequest {
  readonly experimentalArtifact: ExperimentalArtifactReference;
  readonly operator: HumanOperatorActorIdentity;
  readonly reason: string;
  readonly sourceExecution?: RuntimeEvidenceSourceExecutionRef;
}

/**
 * Rollback output is evidence plus the exact fallback identity for a future
 * fresh selection/evaluation contract. It carries no pin/registry/journal
 * handle: running instances keep their exact pins and committed external
 * effects are never undone here.
 */
export interface ExperimentalRollbackOutcome {
  readonly evidence: readonly RuntimeEvidenceRecord[];
  readonly stableFallback: StableFallbackIdentity;
}

/** Use gate input for governance-critical evaluation (V9, A1 §13.4/§16). */
export interface GovernedEvaluationUse {
  readonly target: RuntimeEvidenceScope;
  readonly expectedPackageId: string;
  readonly expectedGovernanceBaseline: RuntimeEvidenceGovernanceBaselineRef;
  readonly expectedSubjectArtifact?: RuntimeEvidenceArtifactRef;
  readonly externalScopeContract?: RuntimeEvidenceExternalScopeContract;
}

/** Use gate input for non-governance-critical observation. */
export interface ObservationUse {
  readonly target: RuntimeEvidenceScope;
  readonly externalScopeContract?: RuntimeEvidenceExternalScopeContract;
}
