/**
 * Shared builders for the v0.8 trusted-Host tests (T-E, #1004).
 * ==============================================================
 *
 * Mirrors the sealed-root builder of tests/v08-abi/v08-abi-a02 so the Host
 * tests exercise the REAL public load() gate: a genuinely HMAC'd approval
 * proof, real sealed module bytes with a top-level execution sentinel, and
 * unique per-tag package ids (the data:-URL module cache is per process).
 */

import { createHmac } from 'node:crypto';

import {
  approvalBindingDigest,
  computeSubjectDigest,
  sha256Hex,
  type ApprovalProof,
  type QualifiedBinding,
  type SealedQualifiedPackageRoot,
} from '../../src/public-v8/index.js';

export const ISSUER_ID = 'dac-issuer:te';
export const ISSUER_SECRET = 'dac-issuer-secret:te-material';
export const ATTACKER_SECRET = 'attacker-secret:te-material';

/** Top-level execution sentinel: incremented when a sealed module EVALUATES. */
export const SENTINEL = '__v08HostSentinel';

export function sentinelCount(id: string): number {
  const registry = (globalThis as Record<string, unknown>)[SENTINEL] as Record<string, number> | undefined;
  return registry?.[id] ?? 0;
}

function sentinelLines(packageId: string): string[] {
  return [
    `globalThis.${SENTINEL} ??= {};`,
    `globalThis.${SENTINEL}[${JSON.stringify(packageId)}] = (globalThis.${SENTINEL}[${JSON.stringify(packageId)}] ?? 0) + 1;`,
  ];
}

export function kernelModule(packageId: string): string {
  return [
    ...sentinelLines(packageId),
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'kernel';",
    "export const ABI_VERSION = 'v08-kernel-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];",
    'export function createOccurrenceRuntime() { return { ok: true }; }',
    '',
  ].join('\n');
}

export function sdkModule(packageId: string): string {
  return [
    ...sentinelLines(packageId),
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'standard-sdk';",
    "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];",
    'export function interpret() { return null; }',
    '',
  ].join('\n');
}

export function businessModule(packageId: string, intentType: string): string {
  return [
    ...sentinelLines(packageId),
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'business';",
    "export const ABI_VERSION = 'v08-business-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];",
    `export const INTENT_TYPES = [${JSON.stringify(intentType)}];`,
    'export function getPolicy() { return {}; }',
    '',
  ].join('\n');
}

/** Genuine issuer attestation (what the external DAC/governance side mints). */
export function genuineApprovalProof(subjectDigest: string, issuedAt?: string, issuerId: string = ISSUER_ID, secret: string = ISSUER_SECRET): ApprovalProof {
  const base = { proofType: 'v08-external-approval/1', subjectDigest, issuerId, issuedAt: issuedAt ?? new Date().toISOString() };
  const proofDigest = approvalBindingDigest(base as unknown as ApprovalProof);
  return { ...base, proofDigest, issuerAttestation: `hmac-sha256:${createHmac('sha256', secret).update(proofDigest, 'utf8').digest('hex')}` };
}

export interface TestRootInput {
  readonly tag: string;
  readonly intentType?: string;
  readonly proof?: ApprovalProof;
}

export function buildSealedRoot(input: TestRootInput): SealedQualifiedPackageRoot {
  const intentType = input.intentType ?? `demo.${input.tag}`;
  const kernelId = `kernel:te-${input.tag}@1.0.0`;
  const sdkId = `std:te-${input.tag}@1.0.0`;
  const businessId = `biz:te-${input.tag}@1.0.0`;
  const packages = [
    {
      packageId: kernelId,
      kind: 'kernel' as const,
      abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernelModule(kernelId),
      moduleSha256: sha256Hex(kernelModule(kernelId)),
      endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
    },
    {
      packageId: sdkId,
      kind: 'standard-sdk' as const,
      abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: sdkModule(sdkId),
      moduleSha256: sha256Hex(sdkModule(sdkId)),
      endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
    },
    {
      packageId: businessId,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      moduleSource: businessModule(businessId, intentType),
      moduleSha256: sha256Hex(businessModule(businessId, intentType)),
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
    },
  ];
  const bindings: QualifiedBinding[] = [
    { role: 'kernel', packageId: kernelId, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: sdkId, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: businessId, endpointId: 'business-policy' },
    { role: 'intent', intentType, packageId: businessId, endpointId: 'business-policy' },
  ];
  const subjectDigest = computeSubjectDigest({
    rootPackageId: 'app:te-demo@1.0.0',
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
    bindings,
  });
  return {
    formatVersion: 'dhpkg/v8-qualified-root/1',
    rootPackageId: 'app:te-demo@1.0.0',
    build: {
      producerId: 'qualified-producer:v08-te',
      builtAt: new Date().toISOString(),
      baseCommit: 'a835cabf7f0733797b421381d21104324310e75f',
      closureDigest: subjectDigest,
    },
    approval: input.proof ?? genuineApprovalProof(subjectDigest),
    packages,
    bindings,
  };
}
