/**
 * v0.8 protected load trust channel — INTERNAL (T-A repair, P1-AUTH-01).
 * =====================================================================
 *
 * `load(package)` must NEVER import/executable-activate an arbitrary
 * caller-minted closure. The controller audit (#1007@6110588153) proved the
 * previous boundary verified only self-computable digests: a hand-minted
 * "hmac-sha256:"-shaped attestation minted WITHOUT any issuer key loaded
 * and executed. This module is the fail-closed repair: the executable step
 * of load() is gated on a cryptographically verified issuer attestation
 * against a trusted issuer registry that is installed ONCE per process
 * through this protected internal channel (deep module import; NOT part of
 * the public `@kaicreator/domain-harness/v8` surface, exactly like
 * installer.ts).
 *
 * Who may install the registry: the governance/Host bootstrap context that
 * owns the issuer secrets (the successor Host-channel task T-E / #1004
 * wires the physical channel; until then a process that installed nothing
 * fails closed — `load()` refuses with UNTRUSTED_ISSUER and never imports).
 * Registry material mirrors the compiler attach boundary (approval.ts
 * TrustedIssuers): the same issuerId → secret mapping the governance
 * context handed to BUILD.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { QualifiedPackageError, type ApprovalProof } from './contracts.js';

/** Default tolerance for proof clocks running slightly ahead (5 minutes). */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

interface TrustChannelState {
  readonly issuers: ReadonlyMap<string, string>;
  readonly establishedAt: number;
  readonly maxProofAgeMs: number | undefined;
}

let channel: TrustChannelState | undefined;

export interface InstallTrustedIssuersInput {
  /** issuerId → issuer secret, supplied by the governance/Host bootstrap. */
  readonly issuers: ReadonlyMap<string, string>;
  /**
   * Optional currentness policy: proofs older than this age are refused
   * (APPROVAL_STALE). When omitted, the governance context accepts proofs
   * of any age; future-dated proofs are ALWAYS refused regardless.
   */
  readonly maxProofAgeMs?: number;
}

/**
 * Install the trusted issuer registry for this process. Internal protected
 * bootstrap: one-shot (a second installation attempt fails typed, so a
 * partially-bootstrapped process cannot be re-trusted mid-flight).
 */
export function installTrustedIssuers(input: InstallTrustedIssuersInput): void {
  if (channel !== undefined) {
    throw new QualifiedPackageError(
      'TRUST_CHANNEL_ALREADY_ESTABLISHED',
      'a trusted issuer registry is already installed in this process; the protected load trust channel is one-shot',
    );
  }
  if (typeof input !== 'object' || input === null || !(input.issuers instanceof Map)) {
    throw new QualifiedPackageError('TRUST_CHANNEL_INVALID', 'installTrustedIssuers requires an issuers Map (issuerId → secret)');
  }
  if (input.issuers.size === 0) {
    throw new QualifiedPackageError('TRUST_CHANNEL_INVALID', 'the trusted issuer registry must not be empty');
  }
  for (const [issuerId, secret] of input.issuers) {
    if (typeof issuerId !== 'string' || issuerId.length === 0 || typeof secret !== 'string' || secret.length === 0) {
      throw new QualifiedPackageError('TRUST_CHANNEL_INVALID', 'issuer registry entries must be non-empty issuerId/secret strings');
    }
  }
  if (input.maxProofAgeMs !== undefined && (!Number.isSafeInteger(input.maxProofAgeMs) || input.maxProofAgeMs <= 0)) {
    throw new QualifiedPackageError('TRUST_CHANNEL_INVALID', 'maxProofAgeMs must be a positive integer of milliseconds');
  }
  channel = Object.freeze({
    issuers: new Map(input.issuers),
    establishedAt: Date.now(),
    maxProofAgeMs: input.maxProofAgeMs,
  });
}

/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export function isTrustChannelEstablished(): boolean {
  return channel !== undefined;
}

function expectedAttestation(secret: string, proofDigest: string): string {
  return `hmac-sha256:${createHmac('sha256', secret).update(proofDigest, 'utf8').digest('hex')}`;
}

/**
 * Fail-closed approval verification for the executable step of load():
 * the issuer must be trusted in THIS process, the HMAC-SHA256 attestation
 * must verify against the issuer secret, and the proof must be current.
 * Refusal codes: UNTRUSTED_ISSUER (registry absent or issuer unknown),
 * FORGED_ATTESTATION (HMAC mismatch), APPROVAL_NOT_YET_VALID (future-dated
 * beyond skew), APPROVAL_STALE (older than the installed maxProofAgeMs).
 */
export function verifyLoadApproval(proof: ApprovalProof): void {
  if (channel === undefined) {
    throw new QualifiedPackageError(
      'UNTRUSTED_ISSUER',
      'no trusted issuer registry is installed in this process (protected Host channel not established); load() fails closed and refuses every executable import',
    );
  }
  const secret = channel.issuers.get(proof.issuerId);
  if (secret === undefined) {
    throw new QualifiedPackageError('UNTRUSTED_ISSUER', `issuer ${proof.issuerId} is not in the trusted issuer registry`);
  }
  const expected = expectedAttestation(secret, proof.proofDigest);
  const given = proof.issuerAttestation;
  const forgeryDetected =
    given.length !== expected.length
    || !timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'));
  if (forgeryDetected) {
    throw new QualifiedPackageError(
      'FORGED_ATTESTATION',
      `issuer ${proof.issuerId} attestation does not verify against the trusted issuer secret; a forged or keyless-minted proof never becomes executable`,
    );
  }
  const issuedAtMs = Date.parse(proof.issuedAt);
  const now = Date.now();
  if (Number.isNaN(issuedAtMs)) {
    throw new QualifiedPackageError('FORGED_ATTESTATION', 'approval proof issuedAt is not a parseable timestamp');
  }
  if (issuedAtMs > now + CLOCK_SKEW_MS) {
    throw new QualifiedPackageError(
      'APPROVAL_NOT_YET_VALID',
      `approval proof is dated in the future (${proof.issuedAt}); future-dated authority never activates`,
    );
  }
  if (channel.maxProofAgeMs !== undefined && now - issuedAtMs > channel.maxProofAgeMs) {
    throw new QualifiedPackageError(
      'APPROVAL_STALE',
      `approval proof issued at ${proof.issuedAt} is older than the installed freshness policy (${channel.maxProofAgeMs} ms)`,
    );
  }
}
