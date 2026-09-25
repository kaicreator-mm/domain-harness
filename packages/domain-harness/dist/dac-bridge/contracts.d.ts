import type { MessageDisposition } from '../v2/contracts/message.js';
import type { DomainQueryResult } from '../v2/contracts/query.js';
import type { WorkflowAddress, RuntimeFailure } from '../v2/contracts/workflow.js';
import type { DomainChange, DomainSubscription } from '../v2/contracts/subscription.js';
/**
 * Baseline identity an external carrier presents when adopting a UX-origin
 * reference. Must equal {@link DAC_BRIDGE_BASELINE} exactly or adoption
 * fails closed (`UNSUPPORTED_DAC_BASELINE`).
 */
export interface DacBridgeBaselineInput {
    readonly contract: string;
    readonly version: string;
    readonly baselineCommit: string;
}
/**
 * Exact identity of this bridge adapter surface. Carried by every minted
 * reference so foreign/mis-tagged objects fail closed.
 */
export declare const DAC_BRIDGE_ADAPTER_VERSION: "dac-bridge-adapter/1";
/**
 * The DAC baseline this bridge is version-bound to — the exact same frozen
 * baseline as the I-002 reference adapter core (single source of truth,
 * imported from it). A reference presented under any other baseline is
 * rejected (`UNSUPPORTED_DAC_BASELINE`).
 */
export declare const DAC_BRIDGE_BASELINE: {
    readonly contract: "domain-application-contract";
    readonly version: "v0.0.2";
    readonly baselineCommit: "9c3ef91b8b40d893e4fe2b0370200e765816ec2b";
};
/** The seven DAC section-9 UX<->Runtime roles adapted by this bridge. */
export declare const DAC_BRIDGE_ROLES: readonly ["domain-intent", "semantic-target", "command", "outcome", "view", "snapshot", "watch"];
export type DacBridgeRole = (typeof DAC_BRIDGE_ROLES)[number];
/** Nominal base shared by every bridge-minted reference. */
export interface DacBridgeReferenceBase {
    readonly adapter: typeof DAC_BRIDGE_ADAPTER_VERSION;
    readonly baseline: typeof DAC_BRIDGE_BASELINE;
    readonly opaque: Readonly<Record<string, unknown>>;
}
/**
 * Domain/application semantic target identity (DAC `SemanticTargetRef`).
 *
 * Producer rule preserved from DAC v0.0.2 section 9: the identity MUST be a
 * domain/application semantic target. A DOM node ID, component instance ID,
 * route-local widget key, canvas implementation object or pixel coordinate is
 * NOT a semantic target unless the domain explicitly defines that identity as
 * semantic. This adapter preserves the supplied identity opaquely and cannot
 * validate domain semantics; that classification burden stays with the
 * Domain UX / application layer that authors it.
 */
export interface SemanticTargetRef extends DacBridgeReferenceBase {
    readonly role: 'semantic-target';
    readonly semanticIdentity: string;
    readonly authorityScope: string;
}
/**
 * Revision basis an intent/command was observed from. Either a bridge-minted
 * `SnapshotRef` of a concrete Runtime observation, or an exact revision
 * identity plus the kind/target of the observed source.
 *
 * `revision` for a workflow-instance observation is the canonical string form
 * of `WorkflowInstanceSnapshot.stateRevision` (`String(stateRevision)`).
 * A mutable alias token (latest/current/head-style) is rejected — it can
 * never prove an exact observation basis.
 */
export type DacObservedBasis = {
    readonly kind: 'snapshot-ref';
    readonly snapshotRef: SnapshotRef;
} | {
    readonly kind: 'revision';
    readonly sourceKind: 'workflow-instance' | 'projection' | 'business' | (string & {});
    readonly revision: string;
    readonly targetKey?: string;
};
/**
 * Originating UX intent correlation (DAC `DomainIntentRef`).
 *
 * Input/correlation reference only — never transition permission. When stale
 * detection matters, the intent carries the observation/revision basis the
 * user acted from (DAC section 9: an intent MUST be correlatable to the
 * observation/revision from which the user acted).
 */
export interface DomainIntentRef extends DacBridgeReferenceBase {
    readonly role: 'domain-intent';
    readonly semanticIdentity: string;
    readonly authorityScope: string;
    readonly semanticTarget?: SemanticTargetRef;
    readonly observedBasis?: DacObservedBasis;
}
/**
 * Runtime command identity adapter (DAC `CommandRef`) over the existing
 * `DomainMessage` identity. Minted exclusively by
 * `commandRefFromDomainMessage` — there is no generic adoption constructor,
 * so a second command authority cannot be minted from arbitrary identity.
 */
export interface CommandRef extends DacBridgeReferenceBase {
    readonly role: 'command';
    readonly messageId: string;
    readonly target: WorkflowAddress;
    readonly correlationId?: string;
    readonly causationId?: string;
    readonly contractVersion?: string;
}
/**
 * Correlation evidence binding one command to its optional UX origin chain.
 * All members are optional by origin: internal Runtime commands without a UX
 * origin remain valid (L2 A2 6.4) — but when stale-observation semantics
 * matter, `observedBasis` (directly or via the intent) is mandatory and its
 * absence fails closed at classification time.
 */
export interface DomainCommandCorrelation {
    readonly command: CommandRef;
    readonly intent?: DomainIntentRef;
    readonly semanticTarget?: SemanticTargetRef;
    readonly observedBasis?: DacObservedBasis;
}
/**
 * The authoritative-outcome scope every bridge OutcomeRef carries. Message
 * dispositions are Runtime-logical facts; the Runtime-external boundary
 * (durable effect ambiguity, external authority observation/commit) stays
 * with the existing effect/evidence mechanisms (L2 A2 6.6, I-006).
 */
export type DacOutcomeScope = 'runtime-logical';
/**
 * Fixed claim marker: an OutcomeRef adapted from Runtime message dispositions
 * never asserts an external business outcome. `runtime 'processed'` means the
 * Runtime processed the message — nothing more.
 */
export type DacExternalAuthorityOutcomeClaim = 'not-claimed';
/** Runtime outcome correlation adapter (DAC `OutcomeRef`). */
export interface OutcomeRef extends DacBridgeReferenceBase {
    readonly role: 'outcome';
    readonly messageId: string;
    readonly target: WorkflowAddress;
    readonly targetSequence?: number;
    readonly packageId?: string;
    readonly disposition: MessageDisposition;
    readonly correlationId?: string;
    readonly causationId?: string;
    readonly failure?: RuntimeFailure;
    readonly acceptedAt?: string;
    readonly resolvedAt?: string;
    readonly outcomeScope: DacOutcomeScope;
    readonly externalAuthorityOutcome: DacExternalAuthorityOutcomeClaim;
}
/**
 * Full causal-chain outcome evidence: outcome + the command correlation it
 * resolves (when the caller holds one). Correlation only — presence of an
 * intent here never influenced the Runtime decision.
 */
export interface DomainOutcomeCorrelation {
    readonly outcome: OutcomeRef;
    readonly command?: CommandRef;
    readonly intent?: DomainIntentRef;
    readonly semanticTarget?: SemanticTargetRef;
    readonly observedBasis?: DacObservedBasis;
}
/** Which existing query/projection primitive a ViewRef identifies. */
export type DacViewKind = DomainQueryResult['kind'];
/**
 * Renderer-neutral view identity adapter (DAC `ViewRef`) over a
 * `DomainQueryResult`. Identity/revision only — no value copy, no rendering
 * semantics.
 */
export interface ViewRef extends DacBridgeReferenceBase {
    readonly role: 'view';
    readonly viewKind: DacViewKind;
    readonly valuePresent: boolean;
    readonly target?: WorkflowAddress;
    readonly messageId?: string;
    readonly projectionId?: string;
    readonly key?: string;
    readonly revision?: string;
}
/** Which existing Runtime primitive a SnapshotRef preserves. */
export type DacSnapshotSourceKind = 'workflow-instance' | 'projection' | 'business';
/**
 * Revision-basis snapshot adapter (DAC `SnapshotRef`). Preserves source
 * identity plus the exact revision relationships of the source primitive —
 * a projection snapshot keeps its own revision AND its workflow-source
 * stateRevisions AND its business-source revisions (L2 A2 6.5: preserve,
 * never erase).
 */
export type SnapshotRef = (DacBridgeReferenceBase & {
    readonly role: 'snapshot';
    readonly sourceKind: 'workflow-instance';
    readonly address: WorkflowAddress;
    readonly correlationId: string;
    readonly packageId: string;
    readonly stateRevision: number;
}) | (DacBridgeReferenceBase & {
    readonly role: 'snapshot';
    readonly sourceKind: 'projection';
    readonly projectionId: string;
    readonly key: string;
    readonly packageId: string;
    readonly revision: string;
    readonly workflowSources: readonly {
        readonly address: WorkflowAddress;
        readonly stateRevision: number;
    }[];
    readonly businessSources: readonly {
        readonly source: string;
        readonly key: string;
        readonly revision: string;
    }[];
}) | (DacBridgeReferenceBase & {
    readonly role: 'snapshot';
    readonly sourceKind: 'business';
    readonly source: string;
    readonly key: string;
    readonly revision: string;
});
/** Which existing subscription primitive a WatchRef identifies. */
export type DacWatchKind = DomainSubscription['kind'];
/**
 * Watch/change identity adapter (DAC `WatchRef`) over `DomainSubscription`
 * plus, when derived from an observed `DomainChange`, the observed revision
 * and change kind.
 */
export interface WatchRef extends DacBridgeReferenceBase {
    readonly role: 'watch';
    readonly watchKind: DacWatchKind;
    readonly target?: WorkflowAddress;
    readonly messageId?: string;
    readonly projectionId?: string;
    readonly key?: string;
    readonly observedRevision?: string;
    readonly changeKind?: DomainChange['kind'];
}
export type DacBridgeErrorCode = 'UNSUPPORTED_DAC_BASELINE' | 'INVALID_REFERENCE' | 'INVALID_CORRELATION' | 'CORRELATION_CONFLICT' | 'MUTABLE_ALIAS_REJECTED' | 'ROLE_MISMATCH' | 'BASIS_REQUIRED' | 'TARGET_MISMATCH';
/** Fail-closed error surface for the DAC UX<->Runtime correlation bridge. */
export declare class DacBridgeError extends Error {
    readonly code: DacBridgeErrorCode;
    constructor(code: DacBridgeErrorCode, message: string);
}
/** Input accepted when adopting a UX-authored intent or semantic target. */
export interface DacIntentAdoptionInput {
    readonly baseline: DacBridgeBaselineInput;
    readonly semanticIdentity: string;
    readonly authorityScope: string;
    readonly semanticTarget?: SemanticTargetRef;
    readonly observedBasis?: DacObservedBasis;
    readonly opaque?: Readonly<Record<string, unknown>>;
}
//# sourceMappingURL=contracts.d.ts.map