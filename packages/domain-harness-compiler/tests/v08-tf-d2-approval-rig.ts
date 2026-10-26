/**
 * T-F D2 (#1005, lane partition @6113088850) — shared rig for the Approval
 * Domain App dedicated positive/negative tests.
 * ===========================================================================
 *
 * Write set of the D2 lane ONLY: `tests/v08-tf-d2-approval-*.test.ts` plus
 * this helper. The shared F01 BUILD test and the PR #1012 Business sources
 * are consumed read-only, never edited.
 *
 * Evidence chain assembled here (frozen #994 KPK15 semantics, current v0.8
 * physical modules, PR #1012@9f6aaf4 `examples/v08-domain-apps/business-approval.mjs`):
 *
 *   1. REAL BUILD — the current compiler pipeline `qualifyPackageClosure` →
 *      external `issueApprovalProof` (issuer act, never a BUILD self-mint) →
 *      `buildQualifiedPackage`, over the physical K/S payload bytes and the
 *      real Approval Business module (same submission shape as F01).
 *   2. REAL PUBLIC LOAD — the v0.8 `DomainHarness.load(package)` one-argument
 *      entry over the sealed root, after the LEGITIMATE protected issuer
 *      trust installation (the governance/Host bootstrap act; deep module
 *      import mirroring packages/domain-harness/tests/v08-abi-a01.test.ts).
 *   3. SEALED EXECUTION — `createOccurrenceRuntime` comes from the INSTALLED
 *      sealed Kernel namespace (not the repo file), with `moduleIdentity`
 *      pinned to the sealed root digests; the SDK endpoint is the sealed
 *      `interpret`; the Business endpoint is the sealed `getPolicy()`.
 *
 * NOT claimed here (waits for #1013 per the lane stop gate): real Host
 * bootstrap, H↔K protected port wiring, authenticated UX principal, Genesis,
 * SQLite/CAS durability. The Host ports below are an in-test fixture double
 * (memory CAS docs + ledger resource port), the same convention as the T-C
 * kernel contract tests (v08-kernel-package-c01.test.ts).
 */

import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

import { qualifyPackageClosure } from '../src/qualified-package/qualify.js';
import { buildQualifiedPackage } from '../src/qualified-package/build.js';
import { issueApprovalProof } from '../src/qualified-package/approval.js';
import * as kernelPayload from '../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs';
import * as sdkPayload from '../../../domain-packages/standard/basic/standard-sdk-v1.mjs';

// `load` and the protected trust channel must be the SAME physical module
// instance: both come from the runtime package src tree (exactly what the
// runtime package's own v08-abi contract tests import; tsx transpiles).
import { load } from '../../domain-harness/src/public-v8/index.js';
import { installTrustedIssuers } from '../../domain-harness/src/public-v8/trust.js';

export const ISSUER = 'issuer:d2-approval-test';
export const ISSUER_SECRET = 'd2-approval-issuer-test-material';
export const ISSUED_AT = '2026-10-11T00:00:00.000Z';
export const NOW = '2026-10-11T07:00:00.000Z';

/** Legitimate protected installation (one-shot per test process). */
export function installApprovalTestIssuers(): void {
  installTrustedIssuers({ issuers: new Map([[ISSUER, ISSUER_SECRET]]) });
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
// Phase 1+2: REAL compiler BUILD over the physical current-v0.8 K/S payload
// bytes and the PR #1012 Approval Business module (read-only consumption).
// ---------------------------------------------------------------------------

const payloadSources = {
  kernel: new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url),
  sdk: new URL('../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url),
  approval: new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url),
};

export async function buildApprovalQualifiedRoot() {
  const [kernelBytes, sdkBytes, approvalBytes] = await Promise.all([
    readFile(payloadSources.kernel, 'utf8'),
    readFile(payloadSources.sdk, 'utf8'),
    readFile(payloadSources.approval, 'utf8'),
  ]);
  const submission = {
    rootPackageId: 'app:v08:order-approval',
    packages: [
      {
        packageId: kernelPayload.MODULE_ID, kind: 'kernel', abiVersion: kernelPayload.ABI_VERSION,
        modulePath: 'modules/kernel.mjs', moduleSource: kernelBytes,
        endpoints: kernelPayload.ENDPOINTS,
      },
      {
        packageId: sdkPayload.MODULE_ID, kind: 'standard-sdk', abiVersion: sdkPayload.ABI_VERSION,
        modulePath: 'modules/standard.mjs', moduleSource: sdkBytes,
        endpoints: sdkPayload.ENDPOINTS,
      },
      {
        packageId: 'business-order-approval@v08.1.0.0', kind: 'business', abiVersion: 'v08-business-abi/1',
        modulePath: 'modules/business.mjs', moduleSource: approvalBytes,
        endpoints: [{ endpointId: 'business:order-approval', kind: 'business-policy' }],
        intentTypes: ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic'],
      },
    ],
    bindings: [
      { role: 'kernel', packageId: kernelPayload.MODULE_ID, endpointId: kernelPayload.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk', packageId: sdkPayload.MODULE_ID, endpointId: sdkPayload.ENDPOINTS[0].endpointId },
      { role: 'business', packageId: 'business-order-approval@v08.1.0.0', endpointId: 'business:order-approval' },
      { role: 'intent', intentType: 'submitQuoteDecision', packageId: 'business-order-approval@v08.1.0.0', endpointId: 'business:order-approval' },
      { role: 'intent', intentType: 'submitQuoteDecisionStrict', packageId: 'business-order-approval@v08.1.0.0', endpointId: 'business:order-approval' },
      { role: 'intent', intentType: 'submitQuoteDecisionDynamic', packageId: 'business-order-approval@v08.1.0.0', endpointId: 'business:order-approval' },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  // The issuer is a separate explicit act in this TEST, never a BUILD
  // self-authorizing step; the producer only attaches and verifies it.
  const approvalProof = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: ISSUER, issuerSecret: ISSUER_SECRET, issuedAt: ISSUED_AT,
  });
  const root = buildQualifiedPackage({
    unsigned,
    approval: approvalProof,
    trustedIssuers: new Map([[ISSUER, ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((item) => [item.modulePath, item.moduleSource])),
    baseCommit: 'v0.8-tf-d2-approval-test',
  });
  const physicalBytes = { kernel: kernelBytes, sdk: sdkBytes, approval: approvalBytes };
  return { root, submission, unsigned, physicalBytes };
}

// ---------------------------------------------------------------------------
// Public one-argument load over the sealed root → installed sealed modules.
// ---------------------------------------------------------------------------

export interface SealedApprovalApp {
  readonly loaded: Awaited<ReturnType<typeof load>>;
  readonly kernelPackageId: string;
  readonly kernelModuleSha256: string;
  readonly sdkPackageId: string;
  readonly businessPackageId: string;
  readonly kernelNs: typeof kernelPayload;
  readonly sdkNs: typeof sdkPayload;
  readonly businessNs: { getPolicy: () => any; MODULE_ID: string; INTENT_TYPES: string[] };
}

export async function loadSealedApprovalApp(root: any): Promise<SealedApprovalApp> {
  const loaded = await load(root);
  const kernelPkg = root.packages.find((p: any) => p.kind === 'kernel');
  const sdkPkg = root.packages.find((p: any) => p.kind === 'standard-sdk');
  const businessPkg = root.packages.find((p: any) => p.kind === 'business');
  const kernelNs = loaded.getModuleNamespace(kernelPkg.packageId) as unknown as typeof kernelPayload;
  const sdkNs = loaded.getModuleNamespace(sdkPkg.packageId) as unknown as typeof sdkPayload;
  const businessNs = loaded.getModuleNamespace(businessPkg.packageId) as unknown as SealedApprovalApp['businessNs'];
  assert.equal(kernelNs.MODULE_ID, kernelPkg.packageId);
  assert.equal(sdkNs.MODULE_ID, sdkPkg.packageId);
  assert.equal(businessNs.MODULE_ID, businessPkg.packageId);
  return {
    loaded,
    kernelPackageId: kernelPkg.packageId,
    kernelModuleSha256: kernelPkg.moduleSha256,
    sdkPackageId: sdkPkg.packageId,
    businessPackageId: businessPkg.packageId,
    kernelNs, sdkNs, businessNs,
  };
}

/**
 * Wire the occurrence runtime FROM THE SEALED INSTALLED KERNEL NAMESPACE with
 * `moduleIdentity` pinned to the sealed root digests, the sealed SDK
 * `interpret` and the sealed Business `getPolicy()` (or an explicit rig
 * override for wiring-tamper negatives).
 */
export function wireSealedD2Runtime(
  app: SealedApprovalApp,
  hostPorts: any,
  businessEndpointOverride?: any,
) {
  return app.kernelNs.createOccurrenceRuntime({
    moduleIdentity: { packageId: app.kernelPackageId, moduleSha256: app.kernelModuleSha256 },
    hostPorts,
    sdkEndpoint: { packageId: app.sdkPackageId, interpret: app.sdkNs.interpret },
    businessEndpoint: businessEndpointOverride ?? app.businessNs.getPolicy(),
    observe: () => {},
  });
}

// ---------------------------------------------------------------------------
// In-test Host ports fixture (memory CAS docs + ledger resource port), the
// T-C kernel contract-test convention. NOT the real Host (#1013 owns that).
// ---------------------------------------------------------------------------

export class FixtureHostStoreError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'FixtureHostStoreError';
    this.code = code;
  }
}

export interface FixtureDocStore {
  get(key: string): Promise<{ value: any; revision: number } | null>;
  put(key: string, value: any, conditions?: { mustBeAbsent?: boolean; mustMatchRevision?: number }): Promise<{ revision: number }>;
  list(prefix: string): Promise<string[]>;
  failNextPutMatching(keySubstring: string, options?: { skip?: number }): void;
}

export function memoryDocStore(): FixtureDocStore {
  const store = new Map<string, { value: any; revision: number }>();
  const fault: { keySubstring: string; remainingSkips: number } | null = { keySubstring: '', remainingSkips: 0 };
  const armed = () => fault !== null && fault.keySubstring.length > 0;
  return {
    failNextPutMatching(keySubstring, options) {
      fault.keySubstring = keySubstring;
      fault.remainingSkips = options?.skip ?? 0;
    },
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value, conditions = {}) {
      if (armed() && key.includes(fault!.keySubstring)) {
        if (fault!.remainingSkips > 0) {
          fault!.remainingSkips -= 1;
        } else {
          fault!.keySubstring = '';
          throw new FixtureHostStoreError('HOST_FAULT_INJECTED', `host storage physically faulted during write of ${key}`);
        }
      }
      const existing = store.get(key) ?? null;
      if (conditions.mustBeAbsent === true && existing !== null) {
        throw new FixtureHostStoreError('HOST_KEY_EXISTS', `host doc ${key} already exists`);
      }
      if (conditions.mustMatchRevision !== undefined) {
        if (existing === null || existing.revision !== conditions.mustMatchRevision) {
          throw new FixtureHostStoreError('HOST_CAS_CONFLICT', `host doc ${key} failed the conditional write (CAS expected ${String(conditions.mustMatchRevision)})`);
        }
      }
      const revision = existing === null ? 0 : existing.revision + 1;
      store.set(key, { value, revision });
      return { revision };
    },
    async list(prefix) {
      return [...store.keys()].filter((key) => key.startsWith(prefix)).sort();
    },
  };
}

/** FIXTURE ledger resource dispatcher with call accounting (effect:reserve). */
export function ledgerResourcePort() {
  const calls: { resourceKey: string; operation: string; payload: any }[] = [];
  let failingNext = false;
  return {
    async call(resourceKey: string, operation: string, payload: any) {
      calls.push({ resourceKey, operation, payload });
      if (failingNext) {
        failingNext = false;
        throw new Error(`physical resource ${resourceKey}.${operation} timed out after dispatch (uncertain outcome)`);
      }
      if (resourceKey === 'ledger' && operation === 'reserve') {
        return { reserved: true, effectId: payload.effectId };
      }
      throw new Error(`host resource ${resourceKey}.${operation} is not provisioned`);
    },
    failNextCall() {
      failingNext = true;
    },
    callCount: () => calls.length,
    calls: () => calls.slice(),
  };
}

export function fixtureHostPorts() {
  const docs = memoryDocStore();
  const resources = ledgerResourcePort();
  return {
    host: { docs, resources, sha256: { async digestUtf8(value: string) { return sha256Hex(value); } }, clock: () => NOW },
    docs, resources,
  };
}

// ---------------------------------------------------------------------------
// D2 occurrence helpers.
// ---------------------------------------------------------------------------

export function d2Target(instanceKey: string) {
  return { workflowId: 'order-quote', instanceKey };
}

export function dynamicIntent(policy: any) {
  return policy.intentBindings.submitQuoteDecisionDynamic.definition.states[0]
    .transitions.find((transition: any) => transition.transitionKey === 'approve').effectIntents[0];
}

export function staticApproveIntent(policy: any) {
  return policy.workflowDefinition.states[0]
    .transitions.find((transition: any) => transition.transitionKey === 'approve').effectIntents[0];
}

export function isTypedCentralAdmission(code: string) {
  return (error: unknown) => {
    assert.ok(error instanceof Error, `expected Error, got ${String(error)}`);
    const central = error as Error & { name?: string; code?: string };
    assert.equal(central.name, 'CentralAdmissionError', `expected CentralAdmissionError, got ${central.name}`);
    assert.equal(central.code, code, `expected code ${code}, got ${String(central.code)}`);
    return true;
  };
}
