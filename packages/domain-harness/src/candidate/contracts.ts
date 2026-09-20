import type { ExactContentIdentity } from '../contracts/identity.js';
import type { JsonValue } from '../contracts/json.js';

export const CANDIDATE_ENVELOPE_SCHEMA_VERSION = 'candidate-envelope-v1' as const;
export const CANDIDATE_VALIDATOR_CONTRACT_VERSION = 'candidate-validator-v1' as const;

export const CANDIDATE_KINDS = [
  'rule',
  'decision-procedure',
  'skill',
  'workflow',
] as const;
export type CandidateKind = (typeof CANDIDATE_KINDS)[number];

export interface CandidateExactReference {
  readonly kind: string;
  readonly artifactId: string;
  readonly contentDigest: string;
}

export interface CandidateToolReference extends CandidateExactReference {
  readonly kind: 'tool';
  readonly capability: 'query';
}

export interface CandidateIoContract {
  readonly inputs: readonly CandidateExactReference[];
  readonly outputs: readonly CandidateExactReference[];
}

export type CandidateMutationContract =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'durable-effect';
      readonly effects: readonly CandidateExactReference[];
    };

export interface CandidateControlEdge {
  readonly from: string;
  readonly to: string;
}

export interface CandidateControlContract {
  readonly startNode: string;
  readonly nodes: readonly string[];
  readonly edges: readonly CandidateControlEdge[];
  readonly maxSteps: number;
}

/**
 * Common, engine-neutral envelope for executable CDI proposals.
 * Proposal provenance/evaluation/promotion metadata deliberately lives outside
 * the semantic body so it cannot become execution authority by accident.
 */
export interface CandidateEnvelope {
  readonly schemaVersion: typeof CANDIDATE_ENVELOPE_SCHEMA_VERSION;
  readonly candidateKind: CandidateKind;
  readonly candidateId: string;
  readonly body: JsonValue;
  readonly io: CandidateIoContract;
  readonly capabilities: readonly string[];
  readonly tools: readonly CandidateToolReference[];
  readonly events: readonly string[];
  readonly mutation: CandidateMutationContract;
  readonly references: readonly CandidateExactReference[];
  readonly applicability: readonly CandidateExactReference[];
  readonly hardInvariants: readonly CandidateExactReference[];
  readonly control?: CandidateControlContract;
}

/**
 * Narrow structural baseline reference for T-004. T-003 owns the canonical
 * GovernanceBaselineIdentity; its output is structurally compatible with this
 * validation-only reference and will be wired centrally by later tasks.
 */
export interface CandidateValidationGovernanceBaseline extends ExactContentIdentity {
  readonly domainId: string;
  readonly governanceId: string;
  readonly version?: string;
}

export interface ValidatedCandidateIdentity {
  readonly candidateKind: CandidateKind;
  readonly candidateId: string;
  readonly candidateContentDigest: string;
  readonly validatorContractVersion: typeof CANDIDATE_VALIDATOR_CONTRACT_VERSION;
  readonly governanceBaseline: CandidateValidationGovernanceBaseline;
}

export const CANDIDATE_REJECTION_CODES = [
  'INVALID_ENVELOPE',
  'NON_CANONICAL_CONTENT',
  'ARBITRARY_CODE_FORBIDDEN',
  'PROVIDER_SECRET_OR_STATE_FORBIDDEN',
  'RUNTIME_OBJECT_FORBIDDEN',
  'PRIVATE_REASONING_FORBIDDEN',
  'INPUT_CONTRACT_NOT_ALLOWED',
  'OUTPUT_CONTRACT_NOT_ALLOWED',
  'CAPABILITY_NOT_ALLOWED',
  'TOOL_NOT_ALLOWED',
  'EVENT_NOT_ALLOWED',
  'MUTATION_PATH_INVALID',
  'EXACT_REFERENCE_UNRESOLVED',
  'APPLICABILITY_NOT_ALLOWED',
  'HARD_INVARIANT_INCOMPATIBLE',
  'CONTROL_INVALID',
  'CONTROL_LIMIT_EXCEEDED',
  'CONTROL_CYCLE_FORBIDDEN',
  'SPECIALIZED_VALIDATOR_REQUIRED',
  'SPECIALIZED_REJECTED',
  'VALIDATION_AUTHORITY_INVALID',
  'CONTENT_DIGEST_INVALID',
] as const;
export type CandidateRejectionCode = (typeof CANDIDATE_REJECTION_CODES)[number];

export interface CandidateRejection {
  readonly code: CandidateRejectionCode;
  readonly path: string;
  readonly message: string;
}

export interface CandidateSpecializedIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface CandidateSpecializedValidator {
  readonly candidateKind: CandidateKind;
  /** Must be synchronous, deterministic, side-effect free and I/O free. */
  validate(candidate: CandidateEnvelope): readonly CandidateSpecializedIssue[];
}

export interface CandidateValidationAuthority {
  readonly governanceBaseline: CandidateValidationGovernanceBaseline;
  readonly allowedInputs: readonly CandidateExactReference[];
  readonly allowedOutputs: readonly CandidateExactReference[];
  readonly allowedCapabilities: readonly string[];
  readonly allowedTools: readonly CandidateToolReference[];
  readonly allowedEvents: readonly string[];
  readonly allowedMutationEffects: readonly CandidateExactReference[];
  readonly availableReferences: readonly CandidateExactReference[];
  readonly allowedApplicability: readonly CandidateExactReference[];
  readonly hardInvariants: readonly CandidateExactReference[];
  readonly maxControlNodes: number;
  readonly maxControlEdges: number;
  readonly maxControlSteps: number;
  readonly specializedValidators?: Partial<Record<CandidateKind, CandidateSpecializedValidator>>;
}

export type CandidateValidationResult =
  | {
      readonly ok: true;
      readonly identity: ValidatedCandidateIdentity;
      /** Deterministic validation never grants promotion, activation or execution. */
      readonly grantsExecutionPermission: false;
    }
  | {
      readonly ok: false;
      readonly rejections: readonly CandidateRejection[];
      readonly grantsExecutionPermission: false;
    };

export interface ReviewedCandidateValidationCompatibility {
  readonly kind: 'reviewed-exact-governance-compatibility';
  readonly validatorContractVersion: typeof CANDIDATE_VALIDATOR_CONTRACT_VERSION;
  readonly candidateKind: CandidateKind;
  readonly from: CandidateValidationGovernanceBaseline;
  readonly to: CandidateValidationGovernanceBaseline;
  readonly reviewDigest: string;
}
