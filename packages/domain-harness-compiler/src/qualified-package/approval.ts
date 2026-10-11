/**
 * v0.8 BUILD approval — phase 2, EXTERNAL authority (T-A, #1000).
 * ================================================================
 *
 * Two-phase BUILD (frozen L2 fact 3): BUILD qualifies the exact closure
 * first (qualify.ts) and can then only ATTACH an approval proof that was
 * issued EXTERNALLY by the designated DAC/governance issuer. BUILD never
 * mints authority: `buildQualifiedPackage` accepts an already-issued proof
 * and verifies it against the trusted issuer registry supplied by the
 * calling governance context.
 *
 * `issueApprovalProof` is the ISSUER-side tool (it needs the issuer secret);
 * it exists so tests and the future DAC channel can act as the genuine
 * external issuer. It is never called by the BUILD path itself.
 */

import { createHmac } from 'node:crypto';
import { approvalBindingDigest, type ApprovalProof } from '@kaicreator/domain-harness/v8';

export class ApprovalError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ApprovalError';
    this.code = code;
  }
}

function fail(code: string, detail: string): never {
  throw new ApprovalError(code, detail);
}

/** Trusted issuer registry: issuerId → issuer secret (governance channel). */
export type TrustedIssuers = ReadonlyMap<string, string>;

function attestation(secret: string, proofDigest: string): string {
  return `hmac-sha256:${createHmac('sha256', secret).update(proofDigest, 'utf8').digest('hex')}`;
}

/**
 * ISSUER-side proof minting (external DAC/governance actor). Requires the
 * issuer secret; the BUILD path has no secret and no call into this
 * function.
 */
export function issueApprovalProof(input: {
  subjectDigest: string;
  issuerId: string;
  issuerSecret: string;
  issuedAt?: string;
}): ApprovalProof {
  if (typeof input.subjectDigest !== 'string' || !/^[0-9a-f]{64}$/.test(input.subjectDigest)) {
    fail('APPROVAL_SUBJECT_MALFORMED', 'issuer refuses to attest a malformed subject digest');
  }
  if (typeof input.issuerId !== 'string' || input.issuerId.length === 0) {
    fail('APPROVAL_ISSUER_MALFORMED', 'issuerId must be a non-empty string');
  }
  if (typeof input.issuerSecret !== 'string' || input.issuerSecret.length === 0) {
    fail('APPROVAL_ISSUER_MALFORMED', 'issuerSecret is required to mint an attestation');
  }
  const issuedAt = input.issuedAt ?? new Date().toISOString();
  const base = {
    proofType: 'v08-external-approval/1',
    subjectDigest: input.subjectDigest,
    issuerId: input.issuerId,
    issuedAt,
  };
  const proofDigest = approvalBindingDigest(base as unknown as ApprovalProof);
  return Object.freeze({ ...base, proofDigest, issuerAttestation: attestation(input.issuerSecret, proofDigest) });
}

/**
 * Verify an externally issued proof against the trusted issuer registry and
 * one exact qualification subject. Used by the BUILD attach boundary and by
 * Host/governance re-verification.
 */
export function verifyApprovalProof(proof: unknown, expectedSubjectDigest: string, trustedIssuers: TrustedIssuers): ApprovalProof {
  if (typeof proof !== 'object' || proof === null) {
    fail('APPROVAL_PROOF_INVALID', 'approval proof must be an object');
  }
  const candidate = proof as Partial<ApprovalProof>;
  const { proofType, subjectDigest, issuerId, issuedAt, proofDigest, issuerAttestation } = candidate;
  if (proofType !== 'v08-external-approval/1') {
    fail('APPROVAL_PROOF_INVALID', `proof type ${String(proofType)} is not v08-external-approval/1`);
  }
  if (typeof subjectDigest !== 'string' || typeof issuerId !== 'string' || typeof issuedAt !== 'string') {
    fail('APPROVAL_PROOF_INVALID', 'approval proof material is malformed');
  }
  if (subjectDigest !== expectedSubjectDigest) {
    fail(
      'APPROVAL_SUBJECT_MISMATCH',
      `approval proof subjects ${subjectDigest} but the qualification subject digests ${expectedSubjectDigest}; a proof minted for another closure is refused`,
    );
  }
  const secret = trustedIssuers.get(issuerId);
  if (secret === undefined) {
    fail('APPROVAL_ISSUER_UNTRUSTED', `issuer ${issuerId} is not in the trusted issuer registry`);
  }
  if (typeof proofDigest !== 'string' || typeof issuerAttestation !== 'string') {
    fail('APPROVAL_PROOF_INVALID', 'approval proof digest material is malformed');
  }
  const complete: ApprovalProof = { proofType, subjectDigest, issuerId, issuedAt, proofDigest, issuerAttestation };
  if (complete.proofDigest !== approvalBindingDigest(complete)) {
    fail('APPROVAL_PROOF_INVALID', 'approval proof binding digest does not match its own material (tampered proof)');
  }
  if (complete.issuerAttestation !== attestation(secret, complete.proofDigest)) {
    fail('APPROVAL_PROOF_INVALID', `issuer ${complete.issuerId} attestation does not verify; forged or re-signed proofs are refused`);
  }
  return Object.freeze({ ...complete });
}
