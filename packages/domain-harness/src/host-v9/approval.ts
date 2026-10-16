/**
 * DomainHarness v0.9 N06 (#1032) — external approval proof for the v0.9
 * qualified-root subject (D02/D04).
 * =======================================================================
 *
 * Retains the v0.8 issuer-attestation strength (HMAC-SHA256 over a binding
 * digest of the proof material) as a versioned v0.9 proof type bound to the
 * `dh.v9.qualified-root.subject/1` subject digest. Issuance requires the
 * issuer secret and is NEVER part of the BUILD path or of any public load
 * argument — it exists for the genuine external DAC/governance issuer and
 * for tests acting as that issuer. The protected H verifies the attestation
 * against its governance-installed trusted issuer registry at install and
 * again at every activation (currentness per activation, D02).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { sha256Hex } from '../public-v8/contracts.js';
import { governanceRefusal } from './errors.js';

export const V09_APPROVAL_PROOF_TYPE = 'dh.v9.external-approval/1';

export interface V09ApprovalProof {
  readonly proofType: typeof V09_APPROVAL_PROOF_TYPE;
  readonly subjectDigest: string;
  readonly issuerId: string;
  readonly issuedAt: string;
  readonly proofDigest: string;
  readonly issuerAttestation: string;
}

/** Trusted issuer registry: issuerId → issuer secret (governance channel). */
export type V09TrustedIssuers = ReadonlyMap<string, string>;

/** Binding digest committing the issuer to exactly one v0.9 subject. */
export function v09ApprovalBindingDigest(proof: Pick<V09ApprovalProof, 'proofType' | 'subjectDigest' | 'issuerId' | 'issuedAt'>): string {
  return sha256Hex(`${proof.proofType}\n${proof.subjectDigest}\n${proof.issuerId}\n${proof.issuedAt}`);
}

function attestation(secret: string, proofDigest: string): string {
  return `hmac-sha256:${createHmac('sha256', secret).update(proofDigest, 'utf8').digest('hex')}`;
}

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * ISSUER-side proof minting (external DAC/governance actor). Requires the
 * issuer secret; no BUILD or H verification path calls this.
 */
export function issueV09ApprovalProof(input: {
  readonly subjectDigest: string;
  readonly issuerId: string;
  readonly issuerSecret: string;
  readonly issuedAt?: string;
}): V09ApprovalProof {
  if (typeof input.subjectDigest !== 'string' || !HEX64.test(input.subjectDigest)) {
    throw governanceRefusal('APPROVAL_SUBJECT_MALFORMED', 'issuer refuses to attest a malformed v0.9 subject digest');
  }
  if (typeof input.issuerId !== 'string' || input.issuerId.length === 0) {
    throw governanceRefusal('APPROVAL_ISSUER_MALFORMED', 'issuerId must be a non-empty string');
  }
  if (typeof input.issuerSecret !== 'string' || input.issuerSecret.length === 0) {
    throw governanceRefusal('APPROVAL_ISSUER_MALFORMED', 'issuerSecret is required to mint a v0.9 attestation');
  }
  const base: Pick<V09ApprovalProof, 'proofType' | 'subjectDigest' | 'issuerId' | 'issuedAt'> = {
    proofType: V09_APPROVAL_PROOF_TYPE,
    subjectDigest: input.subjectDigest,
    issuerId: input.issuerId,
    issuedAt: input.issuedAt ?? new Date().toISOString(),
  };
  const proofDigest = v09ApprovalBindingDigest(base);
  return Object.freeze({ ...base, proofDigest, issuerAttestation: attestation(input.issuerSecret, proofDigest) });
}

function constantTimeEqual(given: string, expected: string): boolean {
  return (
    given.length === expected.length
    && timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(expected, 'utf8'))
  );
}

/**
 * Verify an externally issued v0.9 proof against the trusted issuer registry
 * and one exact subject digest. Refusals are typed
 * (`APPROVAL_PROOF_INVALID` for malformed/tampered material,
 * `APPROVAL_UNTRUSTED` for an issuer outside the registry) and never degrade
 * into a pass.
 */
export function verifyV09ApprovalProof(proof: unknown, expectedSubjectDigest: string, trustedIssuers: V09TrustedIssuers): V09ApprovalProof {
  if (typeof proof !== 'object' || proof === null || Array.isArray(proof)) {
    throw governanceRefusal('APPROVAL_PROOF_INVALID', 'v0.9 approval proof must be a record');
  }
  const candidate = proof as Partial<V09ApprovalProof>;
  const { proofType, subjectDigest, issuerId, issuedAt, proofDigest, issuerAttestation } = candidate;
  if (proofType !== V09_APPROVAL_PROOF_TYPE) {
    throw governanceRefusal('APPROVAL_PROOF_INVALID', `proof type ${String(proofType)} is not ${V09_APPROVAL_PROOF_TYPE}`);
  }
  if (typeof subjectDigest !== 'string' || typeof issuerId !== 'string' || typeof issuedAt !== 'string') {
    throw governanceRefusal('APPROVAL_PROOF_INVALID', 'v0.9 approval proof material is malformed');
  }
  if (subjectDigest !== expectedSubjectDigest) {
    throw governanceRefusal(
      'APPROVAL_PROOF_INVALID',
      `v0.9 approval proof subjects ${subjectDigest} but the closure subject is ${expectedSubjectDigest}; a proof minted for another closure is refused`,
    );
  }
  const secret = trustedIssuers.get(issuerId);
  if (secret === undefined) {
    throw governanceRefusal('APPROVAL_UNTRUSTED', `issuer ${issuerId} is not in the trusted issuer registry of this protected host`);
  }
  if (typeof proofDigest !== 'string' || typeof issuerAttestation !== 'string') {
    throw governanceRefusal('APPROVAL_PROOF_INVALID', 'v0.9 approval proof digest material is malformed');
  }
  const complete: V09ApprovalProof = { proofType, subjectDigest, issuerId, issuedAt, proofDigest, issuerAttestation };
  if (complete.proofDigest !== v09ApprovalBindingDigest(complete)) {
    throw governanceRefusal('APPROVAL_PROOF_INVALID', 'v0.9 approval proof binding digest does not match its own material (tampered proof)');
  }
  if (!constantTimeEqual(complete.issuerAttestation, attestation(secret, complete.proofDigest))) {
    throw governanceRefusal('APPROVAL_PROOF_INVALID', `issuer ${complete.issuerId} attestation does not verify; forged or re-signed v0.9 proofs are refused`);
  }
  return Object.freeze({ ...complete });
}

/** Narrow a stored/verified value back to the proof shape (post-validation). */
export function isV09ApprovalProofShape(value: unknown): value is V09ApprovalProof {
  return (
    typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && (value as Partial<V09ApprovalProof>).proofType === V09_APPROVAL_PROOF_TYPE
    && typeof (value as Partial<V09ApprovalProof>).subjectDigest === 'string'
  );
}