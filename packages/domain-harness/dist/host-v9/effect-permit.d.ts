/**
 * DomainHarness v0.9 N08 (#1036) — trusted-H one-shot physical effect permit.
 * ==============================================================================
 *
 * INTERNAL ONLY. This module must NOT be re-exported from the package root,
 * ./v9 or any public runtime namespace. It is composed solely by trusted Host
 * bootstrap from three ingredients that only the trusted Host can hold:
 *
 *  1. the SAME physical `V09HostDocumentStore` the protected H registry uses
 *     (so the permit commits on the SAME `v9/revocation/<subjectDigest>`
 *     authority record activation and governance `revoke` commit through —
 *     frozen L2 §11 D02: one CAS linearization point, never a second
 *     `permits/*` key that could race a revocation);
 *  2. the SAME trusted issuer registry, re-verified against the currently
 *     stored approval proof at every mint (current package/issuer proof);
 *  3. an H-private principal authority (#1124) whose `recheck` performs REAL
 *     trusted-Host caller authentication at mint time (caller-scoped proof:
 *     audience/app/tenant/subject/principal, `effect:<operationId>` grant,
 *     issuer epoch and expiry are all re-checked — no caller-supplied
 *     authenticator/permit callback is ever accepted).
 *
 * One-shot semantics: a permit binds EXACTLY
 * `(hostAudience, appId, tenantId, principalId, subjectDigest, operationId,
 * effectId, nonce)` and its sha-256 `permitDigest` is recorded in the
 * `permits` map carried ON the live subject-epoch record. Replaying the same
 * tuple (same caller nonce) is refused typed while the entry is retained;
 * after its expiry the principal recheck itself refuses the replay. The map
 * is pruned to unexpired entries on every commit and hard-capped; a full map
 * fails closed (`EFFECT_PERMIT_MEMORY_FULL`) rather than evicting entries an
 * attacker could then replay.
 *
 * Epoch decision (reviewed before writing code): a permit commit does NOT
 * advance the subject epoch — the epoch counts activation transitions only.
 * The commit CAS-rewrites the same record at the observed revision with the
 * epoch unchanged, so activation/permit/revoke transitions still serialize
 * at ONE physical revision CAS point: a revocation that committed first is
 * observed as the terminal record (typed refusal); a permit that committed
 * first consumes the revision an in-flight activation/permit observed, which
 * then re-reads and retries against the still-live record. Registry epoch
 * transitions PRESERVE the permits map (a later activation must not drop
 * consumed-permit memory and reopen a replay window). The terminal
 * revocation record intentionally drops the map: after a revoke every new
 * permit is refused by the revoked state itself.
 *
 * #1120 lifecycle handoff (`recheckDeliveryAuthorization`, NOT implemented
 * here): the delivery path later presents the permit receipt's
 * `permitDigest` and the port answers from the CURRENT authority record —
 * revoked → refuse; entry still recorded and unexpired → authorized; entry
 * expired → refuse (the permit was short-lived by construction). Physical
 * I/O already dispatched under a committed permit is never claimed to be
 * rolled back (honest in-flight rule, D02/D03).
 *
 * Honest in-flight admission (review P1-01/P1-02): expiry and lifecycle are
 * re-checked on EVERY CAS retry BEFORE the awaited write AND again AFTER the
 * write resolves, at receipt handout. A permit whose physical CAS landed
 * while the trusted clock passed the principal expiry, or while the
 * authority was closed, is NEVER handed out as a dispatchable receipt — the
 * committed entry simply remains in the authority record as one-shot replay
 * memory; no rollback of the physical commit is claimed.
 */
import { type V09TrustedIssuers } from './approval.js';
import { type V09HostDocumentStore } from './store-port.js';
import type { V09HostVerifiedIdentity } from '../operations-v9/private-principal.js';
/** Hard cap on retained consumed permits per subject (pruned of expired entries first). */
export declare const V09_EFFECT_PERMIT_CAPACITY = 256;
/** The trusted-H principal port this authority consumes (#1124 authority shape). */
export interface V09EffectPermitPrincipalPort {
    recheck(principalToken: unknown, operationId: string, purpose: 'effect'): Promise<Readonly<V09HostVerifiedIdentity>>;
}
export interface V09EffectPermitAuthorityBootstrap {
    readonly store: V09HostDocumentStore;
    readonly trustedIssuers: V09TrustedIssuers;
    readonly audience: string;
    readonly subjectDigest: string;
    readonly principal: V09EffectPermitPrincipalPort;
    /** Trusted monotonic-enough Host clock for pruning/expiry; test injection internal. */
    readonly nowMs?: () => number;
}
/** Trusted-path receipt for one committed one-shot physical effect permit. */
export interface V09EffectPermitReceipt {
    readonly subjectDigest: string;
    readonly appId: string;
    readonly tenantId: string;
    readonly principalId: string;
    readonly operationId: string;
    readonly effectId: string;
    readonly nonce: string;
    readonly permitDigest: string;
    readonly authorityEpoch: number;
    readonly authorityRevision: number;
    readonly expiresAtMs: number;
    readonly mintedAt: string;
}
/**
 * Create the trusted-H effect-permit authority for ONE subject bound to ONE
 * principal authority. The bootstrap itself is composed only by trusted Host
 * bootstrap; every refusal below is typed and fails closed.
 */
export declare function createV09EffectPermitAuthority(bootstrap: V09EffectPermitAuthorityBootstrap): Readonly<{
    mint: (principalToken: unknown, request: unknown) => Promise<V09EffectPermitReceipt>;
    close: () => void;
}>;
//# sourceMappingURL=effect-permit.d.ts.map