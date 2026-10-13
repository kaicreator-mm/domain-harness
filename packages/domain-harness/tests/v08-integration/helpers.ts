/**
 * #1013 integration-test helpers — REAL sealed closures for the two REAL
 * T-F Business packages (adopted from PR #1012@9f6aaf4; read-only for the
 * approval bytes, one documented contract-required interface adaptation
 * for the engineering bytes — see the fixture header).
 *
 * The Kernel and Standard-SDK module bytes are the CURRENT selected
 * physical payloads from the compiler workspace. The T-F Web Builder owns
 * `examples/v08-domain-apps/*`; those files are never edited here.
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import { mintPrincipalCredential, type HostCredential, type PrincipalGrant } from '../../src/host-v8/index.js';

export const INTEG_ISSUER = 'issuer:dh-v08-integration';
export const INTEG_ISSUER_SECRET = 'integration-issuer-secret:1013';

/**
 * SHA-256 of the adopted Business fixture bytes.
 *
 * - approval: the EXACT PR #1012@9f6aaf4 authored bytes.
 * - engineering: the exact PR #1012 successor bytes (per-intent single-stage
 *   `definition`s [#1013 adaptation] + the stage-declared `contextProjection`
 *   lineage with `context`-operand guards [#1005 D3, after Kernel #1034]);
 *   byte-identical to examples/v08-domain-apps/business-engineering.mjs —
 *   one canonical D3 policy, no test-only substitute.
 */
export const FIXTURE_SHAS = {
  approval: 'b1169090676f7abe4ef04f34fc2d448b3662ce29f724fe23ed4ac5621812df5e',
  engineering: 'c2b61d24d2fe729e2a254b7efd63d4695cecf5027caddc7182873f7b89597cad',
  /** #1013-Builder-authored model-decision fixture (R1 F-03 physical path). */
  model: '659ac04523c288225756dca0bc0e651179a4ea48f5e79c911d587e0afcfa15e7',
  /** #1003 FR07-KH2-Builder-authored harness continuation fixture. */
  continuation: 'f6f974a5537f39f1bf8b11882ed62e767e450a873ae359b98e78c4bfc73d3547',
} as const;

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);

export type AppKind = 'approval' | 'engineering' | 'model' | 'continuation';

export const APP_IDS: Record<AppKind, string> = {
  approval: 'order-approval',
  engineering: 'domainharness-engineering',
  model: 'model-quote',
  continuation: 'continuation-quote',
};

export function sqliteTempPath(label: string): string {
  return join(tmpdir(), `dh1013-${label}-${process.pid}-${Date.now()}.sqlite`);
}

/** Read the exact sealed module bytes: selected K/S payloads + fixture B. */
export async function readModuleSources(kind: AppKind): Promise<{
  kernel: string;
  sdk: string;
  business: string;
}> {
  const businessFile = kind === 'approval'
    ? 'business-approval'
    : kind === 'engineering'
      ? 'business-engineering'
      : kind === 'model' ? 'business-model-port' : 'business-model-continuation';
  const [kernel, sdk, business] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL(`${businessFile}.mjs`, fixtureDir), 'utf8'),
  ]);
  return { kernel, sdk, business };
}

/** Prove the fixture bytes are still the exact adopted PR #1012 bytes. */
export async function assertFixtureBytes(kind: AppKind): Promise<void> {
  const { business } = await readModuleSources(kind);
  const digest = createHash('sha256').update(business, 'utf8').digest('hex');
  if (digest !== FIXTURE_SHAS[kind]) {
    throw new Error(`fixture drift for ${kind}: sha256 ${digest} != pinned ${FIXTURE_SHAS[kind]}`);
  }
}

function firstEndpointId(endpoints: unknown): string {
  const list = endpoints as { endpointId?: unknown }[];
  const first = list[0];
  if (typeof first?.endpointId !== 'string' || first.endpointId.length === 0) {
    throw new Error('fixture: package declares no first endpoint');
  }
  return first.endpointId;
}

/**
 * Build one REAL sealed qualified root through the compiler BUILD path
 * (static qualification → external issuer approval → seal), exactly like
 * the F01 BUILD proof but for consumption by the integrated Host.
 *
 * `variantRootPackageId` (R1 F-02 falsifier) seals an INDEPENDENTLY VALID
 * second closure from the same module bytes: a different rootPackageId
 * yields a different subjectDigest → a different issuer approval → a
 * different whole-closure digest. Both closures are qualified and
 * issuer-approved on their own; only their identity differs.
 */
export async function sealRealApp(kind: AppKind, variantRootPackageId?: string): Promise<SealedQualifiedPackageRoot> {
  // The sealed module payloads are plain ESM without type declarations; the
  // fixture bytes are SHA-pinned below, so the untyped namespace is safe.
  let businessModule: Record<string, unknown>;
  if (kind === 'approval') {
    // @ts-expect-error fixture module has no declaration file (byte-pinned .mjs)
    businessModule = await import('./fixtures/business-approval.mjs');
  } else if (kind === 'engineering') {
    // @ts-expect-error fixture module has no declaration file (byte-pinned .mjs)
    businessModule = await import('./fixtures/business-engineering.mjs');
  } else if (kind === 'model') {
    // @ts-expect-error fixture module has no declaration file (byte-pinned .mjs)
    businessModule = await import('./fixtures/business-model-port.mjs');
  } else {
    // @ts-expect-error fixture module has no declaration file (byte-pinned .mjs)
    businessModule = await import('./fixtures/business-model-continuation.mjs');
  }
  // @ts-expect-error selected kernel payload has no declaration file (.mjs)
  const kernelMeta = await import('../../../domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs');
  // @ts-expect-error selected standard-sdk payload has no declaration file (.mjs)
  const sdkMeta = await import('../../../domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs');
  const sources = await readModuleSources(kind);
  const kernelId = kernelMeta.MODULE_ID as string;
  const sdkId = sdkMeta.MODULE_ID as string;
  const businessId = businessModule.MODULE_ID as string;
  const kernelEndpointId = firstEndpointId(kernelMeta.ENDPOINTS);
  const sdkEndpointId = firstEndpointId(sdkMeta.ENDPOINTS);
  const businessEndpointId = firstEndpointId(businessModule.ENDPOINTS);

  const submission = {
    rootPackageId: variantRootPackageId ?? `app:v08:${APP_IDS[kind]}`,
    packages: [
      {
        packageId: kernelId, kind: 'kernel' as const, abiVersion: kernelMeta.ABI_VERSION as string,
        modulePath: 'modules/kernel.mjs', moduleSource: sources.kernel,
        endpoints: kernelMeta.ENDPOINTS as { endpointId: string; kind: string }[],
      },
      {
        packageId: sdkId, kind: 'standard-sdk' as const, abiVersion: sdkMeta.ABI_VERSION as string,
        modulePath: 'modules/standard.mjs', moduleSource: sources.sdk,
        endpoints: sdkMeta.ENDPOINTS as { endpointId: string; kind: string }[],
      },
      {
        packageId: businessId, kind: 'business' as const, abiVersion: businessModule.ABI_VERSION as string,
        modulePath: 'modules/business.mjs', moduleSource: sources.business,
        endpoints: businessModule.ENDPOINTS as { endpointId: string; kind: string }[],
        intentTypes: businessModule.INTENT_TYPES as string[],
      },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernelId, endpointId: kernelEndpointId },
      { role: 'standard-sdk' as const, packageId: sdkId, endpointId: sdkEndpointId },
      { role: 'business' as const, packageId: businessId, endpointId: businessEndpointId },
      ...(businessModule.INTENT_TYPES as string[]).map((intentType: string) => ({
        role: 'intent' as const, intentType,
        packageId: businessId, endpointId: businessEndpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-12T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-integration-1013',
  });
}

/** Mint one issuer-signed principal credential (the test IS the issuer). */
export function mintCredential(input: {
  tenantId: string;
  appId: string;
  subject: string;
  roles: readonly string[];
  audience: string;
  grantId: string;
  ttlMs?: number;
  issuedAt?: string;
}): HostCredential {
  const issuedAt = input.issuedAt ?? '2026-10-12T00:00:00.000Z';
  const grant: PrincipalGrant = {
    issuerId: INTEG_ISSUER,
    grantId: input.grantId,
    tenantId: input.tenantId,
    appId: input.appId,
    subject: input.subject,
    audience: input.audience,
    roles: [...input.roles],
    issuedAt,
    expiresAt: input.ttlMs === undefined ? '2099-01-01T00:00:00.000Z' : new Date(Date.parse(issuedAt) + input.ttlMs).toISOString(),
  };
  return mintPrincipalCredential(grant, INTEG_ISSUER_SECRET);
}
