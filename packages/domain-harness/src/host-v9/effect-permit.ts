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

import { randomUUID } from 'node:crypto';
import { sha256Hex } from '../public-v8/contracts.js';
import { verifyV09ApprovalProof, type V09TrustedIssuers } from './approval.js';
import { governanceRefusal } from './errors.js';
import { canonicalV9Json } from './digest.js';
import { storeFailureToHostError, V09HostStoreError, type V09HostDocumentStore, type V09StoreDocument } from './store-port.js';
import { approvalKey, readV09SubjectAuthority, revocationKey, type V09SubjectAuthorityState } from './registry.js';
import type { V09HostVerifiedIdentity } from '../operations-v9/private-principal.js';

const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
/** Hard cap on retained consumed permits per subject (pruned of expired entries first). */
export const V09_EFFECT_PERMIT_CAPACITY = 256;
/** Same bounded retry budget the registry uses for authority transitions. */
const AUTHORITY_ATTEMPTS = 8;

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

function fail(code: string, message: string): never {
  throw governanceRefusal(code, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    fail('EFFECT_PERMIT_INPUT_INVALID', `${label} must match the bounded v0.9 identifier grammar (letter first, then letters/digits/._:- , ≤128 chars)`);
  }
  return value;
}

/**
 * Create the trusted-H effect-permit authority for ONE subject bound to ONE
 * principal authority. The bootstrap itself is composed only by trusted Host
 * bootstrap; every refusal below is typed and fails closed.
 */
export function createV09EffectPermitAuthority(bootstrap: V09EffectPermitAuthorityBootstrap) {
  if (!isRecord(bootstrap)) {
    fail('EFFECT_PERMIT_BOOTSTRAP_INVALID', 'createV09EffectPermitAuthority requires a bootstrap record');
  }
  const { store, trustedIssuers, audience, subjectDigest, principal } = bootstrap;
  if (typeof store !== 'object' || store === null || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.close !== 'function') {
    fail('EFFECT_PERMIT_BOOTSTRAP_INVALID', 'the effect-permit authority requires the SAME injected V09HostDocumentStore the protected H registry uses');
  }
  if (!(trustedIssuers instanceof Map) || trustedIssuers.size === 0) {
    fail('EFFECT_PERMIT_BOOTSTRAP_INVALID', 'the effect-permit authority requires the trusted issuer registry the protected H registry was bootstrapped with');
  }
  if (typeof audience !== 'string' || audience.length === 0 || audience.length > 512) {
    fail('EFFECT_PERMIT_BOOTSTRAP_INVALID', 'the effect-permit authority requires the host audience string of the protected H registry');
  }
  if (typeof subjectDigest !== 'string' || !HEX64.test(subjectDigest)) {
    fail('EFFECT_PERMIT_BOOTSTRAP_INVALID', 'the effect-permit authority is bound to one exact lowercase hex sha-256 subject digest');
  }
  if (!isRecord(principal) || typeof principal.recheck !== 'function') {
    fail('EFFECT_PERMIT_BOOTSTRAP_INVALID', 'the effect-permit authority requires the H-private principal authority (#1124) — never a caller-supplied callback');
  }
  const now = bootstrap.nowMs ?? Date.now;
  if (typeof now !== 'function') {
    fail('EFFECT_PERMIT_BOOTSTRAP_INVALID', 'nowMs, when provided, must be a function returning the trusted Host clock');
  }
  let closed = false;

  /**
   * Mint ONE one-shot physical effect permit. The caller-scoped proof
   * (principal recheck) and the current package/issuer proof are taken at
   * commit time; the permit commits on the shared per-subject CAS authority
   * record, so a revocation that committed first refuses here, and a permit
   * that commits first stays truthful for in-flight work (D02/D03).
   */
  async function mint(principalToken: unknown, request: unknown): Promise<V09EffectPermitReceipt> {
    if (closed) {
      fail('EFFECT_PERMIT_CLOSED', 'this effect-permit authority has been closed by trusted Host lifecycle');
    }
    if (!isRecord(request)) {
      fail('EFFECT_PERMIT_INPUT_INVALID', 'an effect-permit mint request must be a record of exactly {operationId, effectId, nonce?}');
    }
    const known = Object.keys(request);
    if (!(known.length === 2 || (known.length === 3 && request.nonce !== undefined)) ||
        !('operationId' in request) || !('effectId' in request)) {
      fail('EFFECT_PERMIT_INPUT_INVALID', 'an effect-permit mint request carries exactly operationId, effectId and an optional caller idempotency nonce; unknown fields are refused, not ignored');
    }
    const operationId = validId(request.operationId, 'effect-permit operationId');
    const effectId = validId(request.effectId, 'effect-permit effectId');
    const nonce = request.nonce === undefined ? `dhv9nonce-${randomUUID()}` : validId(request.nonce, 'effect-permit nonce');

    // Caller-scoped proof at commit time: the #1124 authority re-authenticates
    // the presentation against the trusted Host and re-checks audience, app,
    // tenant, subject digest, `effect:<operationId>` grant, issuer epoch and
    // expiry. A refused/expired/forged principal never reaches the CAS.
    const identity = await principal.recheck(principalToken, operationId, 'effect');
    if (closed) {
      fail('EFFECT_PERMIT_CLOSED', 'trusted Host lifecycle closed this authority while the principal recheck was pending');
    }
    const at = now();
    if (!Number.isSafeInteger(at)) {
      fail('EFFECT_PERMIT_CLOCK_INVALID', 'the trusted Host clock returned a non-safe-integer value; refusing to order permits on it');
    }
    if (identity.hostAudience !== audience || identity.selectedClosureDigest !== subjectDigest) {
      fail('EFFECT_PERMIT_SCOPE_INVALID', 'the verified principal is not scoped to this authority (audience/subject); a foreign scope never mints here');
    }

    // Current package/issuer proof at commit time (same discipline as every
    // activation): the stored approval proof must still verify against the
    // trusted issuer registry for exactly this subject.
    let approvalDoc: V09StoreDocument | null;
    try {
      approvalDoc = await store.get(approvalKey(subjectDigest));
    } catch (error) {
      throw storeFailureToHostError(error, 'effect-permit approval lookup');
    }
    if (approvalDoc === null) {
      fail('INSTALL_APPROVAL_MISSING', 'the subject has no stored approval record; an effect permit requires a current package/issuer proof and fails closed');
    }
    verifyV09ApprovalProof(approvalDoc.value, subjectDigest, trustedIssuers);

    const permitDigest = sha256Hex(canonicalV9Json({
      hostAudience: audience,
      appId: identity.appId,
      tenantId: identity.tenantId,
      principalId: identity.principalId,
      subjectDigest,
      operationId,
      effectId,
      nonce,
    }));

    for (let attempt = 0; attempt < AUTHORITY_ATTEMPTS; attempt += 1) {
      const state: V09SubjectAuthorityState = await readV09SubjectAuthority(store, subjectDigest, 'effect-permit authority read');
      if (state.status === 'revoked') {
        fail('APPROVAL_REVOKED', 'the approval for this installed subject has been revoked; a new one-shot effect permit is refused at the shared per-subject CAS authority');
      }
      if (state.status === 'absent') {
        fail('EFFECT_PERMIT_SUBJECT_INACTIVE', 'no activation epoch has committed for this subject; physical effect permits require the live shared per-subject authority an activation created');
      }
      // Fresh expiry on EVERY retry: the trusted clock may have passed the
      // principal expiry while an approval read, authority read or a held CAS
      // write was pending (D03 requires fresh scope+expiry at admission).
      const attemptAt = now();
      if (!Number.isSafeInteger(attemptAt)) {
        fail('EFFECT_PERMIT_CLOCK_INVALID', 'the trusted Host clock returned a non-safe-integer value; refusing to order permits on it');
      }
      if (identity.expiresAtMs <= attemptAt) {
        fail('EFFECT_PERMIT_EXPIRED_INFLIGHT', 'the trusted clock passed the principal expiry while the permit admission was pending; the one-shot permit is refused before its commit');
      }
      // Prune expired entries first: an expired permit can no longer be
      // validly replayed because the principal recheck refuses expired
      // presentations before this loop is ever reached.
      const kept: Record<string, { expiresAtMs: number }> = {};
      let retained = 0;
      for (const [digest, entry] of Object.entries(state.permits)) {
        if (entry.expiresAtMs > attemptAt) {
          kept[digest] = entry;
          retained += 1;
        }
      }
      if (Object.hasOwn(kept, permitDigest)) {
        fail('EFFECT_PERMIT_REPLAYED', 'this exact effect-permit tuple (app/tenant/principal/subject/operation/effect/nonce) has already been consumed once; one-shot permits never commit twice');
      }
      if (retained >= V09_EFFECT_PERMIT_CAPACITY) {
        fail('EFFECT_PERMIT_MEMORY_FULL', `the shared subject authority already retains ${String(V09_EFFECT_PERMIT_CAPACITY)} unexpired consumed permits; failing closed instead of evicting replay protection`);
      }
      const next = {
        kind: 'v9/subject-epoch',
        subjectDigest,
        epoch: state.epoch,
        permits: { ...kept, [permitDigest]: { expiresAtMs: identity.expiresAtMs } },
      };
      let committedRevision: number;
      try {
        committedRevision = (await store.put(revocationKey(subjectDigest), next, { kind: 'cas', revision: state.revision })).revision;
      } catch (error) {
        if (error instanceof V09HostStoreError && error.code === 'V09_STORE_CONFLICT') {
          continue; // an activation/permit/revoke transition won the revision; re-read and decide again
        }
        throw storeFailureToHostError(error, 'effect-permit authority commit');
      }
      // Guarded post-commit admission: lifecycle and expiry are re-checked at
      // handout, not only before the awaited write. A permit whose CAS
      // physically landed while the authority closed or the trusted clock
      // passed the principal expiry is NEVER handed out as a dispatchable
      // receipt; the committed entry stays in the authority record as one-shot
      // replay memory and no rollback of the physical commit is claimed
      // (honest in-flight rule, D02/D03).
      if (closed) {
        fail('EFFECT_PERMIT_CLOSED', 'trusted Host lifecycle closed this authority while the permit CAS was pending; the physical commit is not claimed to be rolled back, but no dispatchable receipt is handed out');
      }
      const landedAt = now();
      if (!Number.isSafeInteger(landedAt)) {
        fail('EFFECT_PERMIT_CLOCK_INVALID', 'the trusted Host clock returned a non-safe-integer value; refusing to order permits on it');
      }
      if (identity.expiresAtMs <= landedAt) {
        fail('EFFECT_PERMIT_EXPIRED_INFLIGHT', 'the trusted clock passed the principal expiry while the permit CAS was pending; the committed entry remains recorded as replay memory and no dispatchable receipt is handed out');
      }
      return Object.freeze({
        subjectDigest,
        appId: identity.appId,
        tenantId: identity.tenantId,
        principalId: identity.principalId,
        operationId,
        effectId,
        nonce,
        permitDigest,
        authorityEpoch: state.epoch,
        authorityRevision: committedRevision,
        expiresAtMs: identity.expiresAtMs,
        mintedAt: new Date(landedAt).toISOString(),
      }) satisfies V09EffectPermitReceipt;
    }
    fail('SUBJECT_AUTHORITY_CONTENTION', 'the shared per-subject CAS authority kept conflicting under sustained contention; the effect permit fails closed instead of racing');
  }

  /**
   * Trusted-lifecycle closure invalidates every further mint on this
   * authority — including a mint whose physical CAS was already pending (or
   * even landed): such an entry stays recorded, but no receipt is handed out.
   */
  function close(): void {
    closed = true;
  }

  return Object.freeze({ mint, close });
}
