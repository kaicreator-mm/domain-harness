/**
 * V08-ABI-A02 — load trust gate + whole-closure atomicity (T-A repair, #1000).
 * ================================================================================
 *
 * Real failing counterexamples for the three controller-audit blockers
 * (#1007@6110588153), each of which FAILED against the audited HEAD and
 * now passes:
 *
 *   - V08-ABI-A02-N7 (P1-AUTH-01): in a process with NO trusted issuer
 *     registry installed, load() fails closed with UNTRUSTED_ISSUER and
 *     executes NOTHING (top-level sentinel stays 0) — even for a proof
 *     whose HMAC was genuinely computed. The audited code imported and
 *     executed a KEYLESS hand-minted 'hmac-sha256:'-shaped attestation.
 *   - V08-ABI-A02-N8 (P1-AUTH-01): with the registry installed, a keyless
 *     or wrong-secret attestation is FORGED_ATTESTATION (sentinel 0), an
 *     unregistered issuer is UNTRUSTED_ISSUER (sentinel 0).
 *   - V08-ABI-A02-P  legitimate protected installation: a genuinely HMAC'd
 *     proof loads and executes exactly once — execution exists ONLY behind
 *     the verified gate.
 *   - V08-ABI-A02-N9 approval currentness: future-dated and stale proofs
 *     never activate (APPROVAL_NOT_YET_VALID / APPROVAL_STALE).
 *   - V08-ABI-A02-N10 (P2-ATOMIC-03): bytes mutated on the LAST package
 *     reject the whole closure with INSTALL_BYTES_MUTATED BEFORE the first
 *     import — earlier modules' top-level sentinels stay 0 (the audited
 *     code executed them first).
 *   - V08-ABI-A02-N11 (P2-ATOMIC-03 honest scope): an identity failure on
 *     the LAST package still fails typed, and pins the DOCUMENTED residual
 *     evaluation scope (JS cannot inspect a module namespace without
 *     evaluating it): earlier modules HAVE evaluated. No false
 *     all-or-nothing claim is made.
 *
 * Test order is load-bearing: the registry is installed by N8; every
 * earlier test runs against the un-trusted process state. node:test runs
 * top-level tests in this file sequentially.
 */

import { createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  approvalBindingDigest,
  computeSubjectDigest,
  load,
  QualifiedPackageError,
  sha256Hex,
  type ApprovalProof,
  type QualifiedBinding,
  type SealedQualifiedPackageRoot,
} from '../../src/public-v8/index.js';
import { installTrustedIssuers } from '../../src/public-v8/trust.js';

const ISSUER = 'dac-issuer:test';
const ISSUER_SECRET = 'dac-issuer-secret:test-material';
const ATTACKER_SECRET = 'attacker-secret-material';

/** Top-level execution sentinel: incremented when a module EVALUATES. */
const SENTINEL = '__v08A02Sentinel' as const;

function sentinelCount(id: string): number {
  const registry = (globalThis as Record<string, unknown>)[SENTINEL] as Record<string, number> | undefined;
  return registry?.[id] ?? 0;
}

function kernelModule(packageId: string): string {
  return [
    `globalThis.${SENTINEL} ??= {};`,
    `globalThis.${SENTINEL}[${JSON.stringify(packageId)}] = (globalThis.${SENTINEL}[${JSON.stringify(packageId)}] ?? 0) + 1;`,
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'kernel';",
    "export const ABI_VERSION = 'v08-kernel-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];",
    'export function createOccurrenceRuntime() { return { ok: true }; }',
    '',
  ].join('\n');
}

function sdkModule(packageId: string): string {
  return [
    `globalThis.${SENTINEL} ??= {};`,
    `globalThis.${SENTINEL}[${JSON.stringify(packageId)}] = (globalThis.${SENTINEL}[${JSON.stringify(packageId)}] ?? 0) + 1;`,
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'standard-sdk';",
    "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];",
    'export function interpret() { return null; }',
    '',
  ].join('\n');
}

function businessModule(packageId: string, intentType: string, opts: { breakExport?: boolean } = {}): string {
  return [
    `globalThis.${SENTINEL} ??= {};`,
    `globalThis.${SENTINEL}[${JSON.stringify(packageId)}] = (globalThis.${SENTINEL}[${JSON.stringify(packageId)}] ?? 0) + 1;`,
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    "export const PACKAGE_KIND = 'business';",
    "export const ABI_VERSION = 'v08-business-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];",
    `export const INTENT_TYPES = [${JSON.stringify(intentType)}];`,
    opts.breakExport === true ? 'export const getPolicyMissing = true;' : 'export function getPolicy() { return {}; }',
    '',
  ].join('\n');
}

interface RootInput {
  tag: string;
  businessSource?: string;
  proof?: (subjectDigest: string) => ApprovalProof;
  bindingsOverride?: QualifiedBinding[];
}

/** Unique per-`tag` package ids keep the data:-URL module cache honest. */
function buildRoot(input: RootInput): SealedQualifiedPackageRoot {
  const kernelId = `kernel:a02-${input.tag}@1.0.0`;
  const sdkId = `std:a02-${input.tag}@1.0.0`;
  const businessId = `biz:a02-${input.tag}@1.0.0`;
  const businessSource = input.businessSource ?? businessModule(businessId, `demo.${input.tag}`);
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
      moduleSource: businessSource,
      moduleSha256: sha256Hex(businessSource),
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
    },
  ];
  const bindings: QualifiedBinding[] =
    input.bindingsOverride ??
    [
      { role: 'kernel', packageId: kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: `demo.${input.tag}`, packageId: businessId, endpointId: 'business-policy' },
    ];
  const subjectDigest = computeSubjectDigest({
    rootPackageId: 'app:demo@1.0.0',
    packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
    bindings,
  });
  const mint = input.proof ?? ((digest: string) => genuineProof(digest));
  return {
    formatVersion: 'dhpkg/v8-qualified-root/1',
    rootPackageId: 'app:demo@1.0.0',
    build: {
      producerId: 'qualified-producer:v08-ta',
      builtAt: new Date().toISOString(),
      baseCommit: 'e122a1239e03f2788eea0ad235e277d5fb4269de',
      closureDigest: subjectDigest,
    },
    approval: mint(subjectDigest),
    packages,
    bindings,
  };
}

const ISSUED_NOW = () => new Date().toISOString();

function genuineProof(subjectDigest: string, issuedAt?: string, issuerId: string = ISSUER, secret: string = ISSUER_SECRET): ApprovalProof {
  const base = { proofType: 'v08-external-approval/1', subjectDigest, issuerId, issuedAt: issuedAt ?? new Date().toISOString() };
  const proofDigest = approvalBindingDigest(base as unknown as ApprovalProof);
  return { ...base, proofDigest, issuerAttestation: `hmac-sha256:${createHmac('sha256', secret).update(proofDigest, 'utf8').digest('hex')}` };
}

/** The audited bypass vector: a KEYLESS look-alike attestation. */
function keylessForgedProof(subjectDigest: string): ApprovalProof {
  const base = { proofType: 'v08-external-approval/1', subjectDigest, issuerId: ISSUER, issuedAt: new Date().toISOString() };
  const proofDigest = approvalBindingDigest(base as unknown as ApprovalProof);
  return { ...base, proofDigest, issuerAttestation: `hmac-sha256:${sha256Hex(proofDigest)}` };
}

async function refuse(root: unknown, code: string): Promise<void> {
  await assert.rejects(
    () => load(root),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, code);
      return true;
    },
  );
}

function assertClosureNeverExecuted(tag: string): void {
  for (const id of [`kernel:a02-${tag}@1.0.0`, `std:a02-${tag}@1.0.0`, `biz:a02-${tag}@1.0.0`]) {
    assert.equal(sentinelCount(id), 0, `module ${id} must never evaluate for a refused closure`);
  }
}

test('V08-ABI-A02-N7 no trusted issuer registry installed: load() fails closed, zero execution (P1-AUTH-01)', async () => {
  // The audited bypass, replayed verbatim: keyless hand-minted attestation.
  await refuse(buildRoot({ tag: 'n7-keyless', proof: keylessForgedProof }), 'UNTRUSTED_ISSUER');
  assertClosureNeverExecuted('n7-keyless');
  // Even a GENUINELY HMAC'd proof is refused while the protected channel is
  // not established — trust is a property of the process, not the payload.
  await refuse(buildRoot({ tag: 'n7-genuine', proof: (digest) => genuineProof(digest, ISSUED_NOW()) }), 'UNTRUSTED_ISSUER');
  assertClosureNeverExecuted('n7-genuine');

  // NOW the governance/Host bootstrap installs the registry (once) with a
  // 24h currentness policy; every later test runs under this channel.
  installTrustedIssuers({ issuers: new Map([[ISSUER, ISSUER_SECRET]]), maxProofAgeMs: 24 * 60 * 60 * 1000 });
});

test('V08-ABI-A02-N8 forged attestation and untrusted issuer: FORGED_ATTESTATION / UNTRUSTED_ISSUER, zero execution (P1-AUTH-01)', async () => {
  // Keyless look-alike (the audited vector) now fails cryptographically.
  await refuse(buildRoot({ tag: 'n8-keyless', proof: keylessForgedProof }), 'FORGED_ATTESTATION');
  assertClosureNeverExecuted('n8-keyless');
  // Trusted issuer id but HMAC computed with the WRONG secret.
  await refuse(
    buildRoot({ tag: 'n8-wrongkey', proof: (digest) => genuineProof(digest, ISSUED_NOW(), ISSUER, ATTACKER_SECRET) }),
    'FORGED_ATTESTATION',
  );
  assertClosureNeverExecuted('n8-wrongkey');
  // Issuer id that was never registered.
  await refuse(
    buildRoot({ tag: 'n8-stranger', proof: (digest) => genuineProof(digest, ISSUED_NOW(), 'attacker-issuer', ATTACKER_SECRET) }),
    'UNTRUSTED_ISSUER',
  );
  assertClosureNeverExecuted('n8-stranger');
});

test('V08-ABI-A02-P legitimate protected installation: verified proof loads, execution happens exactly once', async () => {
  const root = buildRoot({ tag: 'pos', proof: (digest) => genuineProof(digest, ISSUED_NOW()) });
  const loaded = await load(root);
  assert.equal(loaded.installedPackages.length, 3);
  const kernelId = 'kernel:a02-pos@1.0.0';
  assert.equal(sentinelCount(kernelId), 1, 'the verified kernel module evaluated exactly once');
  assert.equal((loaded.getModuleNamespace(kernelId).createOccurrenceRuntime as () => { ok: boolean })().ok, true);
});

test('V08-ABI-A02-N9 approval currentness: future and stale proofs never activate', async () => {
  const future = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  await refuse(buildRoot({ tag: 'n9-future', proof: (digest) => genuineProof(digest, future) }), 'APPROVAL_NOT_YET_VALID');
  assertClosureNeverExecuted('n9-future');
  const stale = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  await refuse(buildRoot({ tag: 'n9-stale', proof: (digest) => genuineProof(digest, stale) }), 'APPROVAL_STALE');
  assertClosureNeverExecuted('n9-stale');
});

test('V08-ABI-A02-N10 mutated LAST-package bytes reject the whole closure BEFORE the first import (P2-ATOMIC-03)', async () => {
  const tag = 'n10';
  const businessId = `biz:a02-${tag}@1.0.0`;
  const original = businessModule(businessId, `demo.${tag}`);
  const mutated = original.replace('export function getPolicy() { return {}; }', 'export function getPolicy() { return { injected: true }; }');
  assert.notEqual(original, mutated);
  // Digests pinned to the ORIGINAL bytes; presented bytes are the mutation.
  const root = buildRoot({ tag, businessSource: original });
  const toctou: SealedQualifiedPackageRoot = {
    ...root,
    packages: root.packages.map((pkg) => (pkg.packageId === businessId ? { ...pkg, moduleSource: mutated } : pkg)),
  };
  await refuse(toctou, 'INSTALL_BYTES_MUTATED');
  // The audited installer imported the FIRST two packages before hitting the
  // mutated third one; the whole-closure preflight now keeps both inert.
  assertClosureNeverExecuted(tag);
});

test('V08-ABI-A02-N11 documented residual scope: identity failure on the LAST package still fails typed; earlier modules HAVE evaluated', async () => {
  const tag = 'n11';
  const businessId = `biz:a02-${tag}@1.0.0`;
  // Bytes hash-consistent but the module omits the required getPolicy export
  // — detectable only by evaluating the module namespace (JS semantics).
  const brokenBusiness = businessModule(businessId, `demo.${tag}`, { breakExport: true });
  await refuse(buildRoot({ tag, businessSource: brokenBusiness }), 'MODULE_IDENTITY_MISMATCH');
  assert.equal(sentinelCount(`kernel:a02-${tag}@1.0.0`), 1, 'documented scope: the earlier kernel module already evaluated');
  assert.equal(sentinelCount(`std:a02-${tag}@1.0.0`), 1, 'documented scope: the earlier SDK module already evaluated');
  assert.equal(sentinelCount(businessId), 1, 'the failing module evaluated (its namespace check is post-import by necessity)');
});
