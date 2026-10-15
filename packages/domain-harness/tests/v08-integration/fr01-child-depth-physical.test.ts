/**
 * #1080 FR01 — selected K/Host durable child-invocation lineage DEPTH
 * bound on the SELECTED physical path (real Node24 + real SQLite + real
 * sealed closure).
 * ===========================================================================
 *
 * Frozen L1 FR01-N names "excessive child depth" as the negative slot; the
 * T-G #1006 ledger records that the selected K `kernel-mechanism-v1.mjs` +
 * Host `durable-controls.ts` child invocation carried NO proven bound on
 * recursive/deep child lineage (a valid child tree could exceed the
 * accepted maximum without fail-closed rejection).
 *
 * The bound enforced here is the smallest EXISTING frozen child-depth
 * limit — DEFAULT_MAX_CHILD_WORKFLOW_DEPTH = 32 (src/runner/
 * run-coordinator.ts, "Internal v0.1 defensive bound", pinned by
 * tests/child-workflow.test.ts) — reused by identity provenance, not a
 * newly invented scheduler constant. Edge depths 1..32 (a root parent's
 * first edge is depth 1) are the admitted range; depth 33 (max+1) refuses
 * typed BEFORE any child turn/Effect/Journal or durable allocation.
 *
 * The depth is DURABLE TRUTH, never caller arithmetic: a new edge's depth
 * is derived from the parent's own incoming invocation records, and the
 * caller's declared provenance pointer is cross-checked against that
 * truth. A non-root parent that declares nothing (missing), a pointer to
 * another pair's record or a tampered ordinal (mutation/foreign), a root
 * parent that declares provenance, and a derived depth beyond the maximum
 * (overflowed) each refuse typed with zero allocation and zero effects.
 *
 * Valid 1-level child done/error, duplicate and restart behavior stay
 * owned by HF32 (8/8 unchanged); this file only pins the depth bound.
 */

import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import {
  bootstrapTrustedHost,
  createKernelGateway,
  type HostCredential,
  type KernelGateway,
  type TrustedHostHandle,
} from '../../src/host-v8/index.js';
import {
  issueApprovalProof,
  qualifyPackageClosure,
  buildQualifiedPackage,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';
import { INTEG_ISSUER, INTEG_ISSUER_SECRET, mintCredential, sqliteTempPath } from './helpers.js';

const payloadDir = new URL('../../../domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const fixtureDir = new URL('./fixtures/', import.meta.url);

const AUDIENCE = 'dh-v08-fr01';
const APP_ID = 'durable-controls';
const TENANT = 't1';

/** The accepted maximum edge depth (identity provenance: DEFAULT_MAX_CHILD_WORKFLOW_DEPTH). */
const MAX_LINEAGE_DEPTH = 32;

let handle: TrustedHostHandle;
let gateway: KernelGateway;
let operator: HostCredential;
let requester: HostCredential;
const ledgerCalls: { operation: string; payload: Record<string, unknown> }[] = [];

/** One chain instance key: fr01c-0 (root) .. fr01c-32 (deepest child). */
function chainKey(level: number): string {
  return `fr01c-${String(level)}`;
}

async function sealControlsClosure(): Promise<SealedQualifiedPackageRoot> {
  const [kernelSource, sdkSource, businessSource] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('business-durable-controls.mjs', fixtureDir), 'utf8'),
  ]);
  const kernel = await import(`data:text/javascript;base64,${Buffer.from(kernelSource, 'utf8').toString('base64')}`);
  const sdk = await import(`data:text/javascript;base64,${Buffer.from(sdkSource, 'utf8').toString('base64')}`);
  const business = await import(`data:text/javascript;base64,${Buffer.from(businessSource, 'utf8').toString('base64')}`);
  const submission: QualificationSubmission = {
    rootPackageId: 'app:v08:durable-controls',
    packages: [
      { packageId: kernel.MODULE_ID as string, kind: 'kernel' as const, abiVersion: kernel.ABI_VERSION as string, modulePath: 'modules/kernel.mjs', moduleSource: kernelSource, endpoints: kernel.ENDPOINTS },
      { packageId: sdk.MODULE_ID as string, kind: 'standard-sdk' as const, abiVersion: sdk.ABI_VERSION as string, modulePath: 'modules/standard.mjs', moduleSource: sdkSource, endpoints: sdk.ENDPOINTS },
      { packageId: business.MODULE_ID as string, kind: 'business' as const, abiVersion: business.ABI_VERSION as string, modulePath: 'modules/business.mjs', moduleSource: businessSource, endpoints: business.ENDPOINTS, intentTypes: business.INTENT_TYPES },
    ],
    bindings: [
      { role: 'kernel' as const, packageId: kernel.MODULE_ID as string, endpointId: kernel.ENDPOINTS[0].endpointId },
      { role: 'standard-sdk' as const, packageId: sdk.MODULE_ID as string, endpointId: sdk.ENDPOINTS[0].endpointId },
      { role: 'business' as const, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId },
      ...(business.INTENT_TYPES as string[]).map((intentType) => ({
        role: 'intent' as const, intentType, packageId: business.MODULE_ID as string, endpointId: business.ENDPOINTS[0].endpointId,
      })),
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: INTEG_ISSUER,
    issuerSecret: INTEG_ISSUER_SECRET,
    issuedAt: '2026-10-15T00:00:00.000Z',
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
    baseCommit: 'v0.8-fr01-1080',
  }) as SealedQualifiedPackageRoot;
}

before(async () => {
  const root = await sealControlsClosure();
  handle = await bootstrapTrustedHost({
    issuers: new Map([[INTEG_ISSUER, INTEG_ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: sqliteTempPath('fr01depth') },
  });
  handle.host.resources.provision('ledger', (operation: string, payload: unknown) => {
    ledgerCalls.push({ operation, payload: payload as Record<string, unknown> });
    return { reserved: true };
  });
  gateway = createKernelGateway({ host: handle.host, gatewaySessionCap: handle.gatewaySessionCap });
  await gateway.registerApp({ appId: APP_ID, packageRoot: root, genesisRoles: ['platform-operator'] });
  operator = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'op', roles: ['platform-operator'], audience: AUDIENCE, grantId: 'g-op' });
  requester = mintCredential({ tenantId: TENANT, appId: APP_ID, subject: 'req', roles: ['requester'], audience: AUDIENCE, grantId: 'g-req' });
});

after(async () => {
  await handle.host.close();
});

async function activate(instanceKey: string): Promise<void> {
  await gateway.activateGenesis(operator, { appId: APP_ID, instanceKey });
}

async function stateKeyOf(instanceKey: string): Promise<string> {
  const snapshot = await gateway.queryInstance(requester, { tenantId: TENANT, appId: APP_ID, instanceKey }) as { state: { stateKey: string } };
  return snapshot.state.stateKey;
}

async function assertRefused(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code, `expected ${code}, got: ${String((error as Error)?.message ?? error)}`);
    return true;
  });
}

function sendChild(
  parentKey: string,
  childKey: string,
  parentLineage?: { viaParentInstanceKey: string; invocationOrdinal: number },
): Promise<unknown> {
  return gateway.sendChildMessage(requester, {
    appId: APP_ID,
    parentInstanceKey: parentKey,
    childInstanceKey: childKey,
    childIntentType: 'runChildTask',
    doneIntentType: 'onChildDone',
    errorIntentType: 'onChildError',
    input: { amount: 1 },
    ...(parentLineage === undefined ? {} : { parentLineage }),
  });
}

async function invocation(parentKey: string, childKey: string, ordinal = 1): Promise<unknown> {
  return gateway.queryChildInvocation(requester, {
    appId: APP_ID, parentInstanceKey: parentKey, childInstanceKey: childKey, invocationOrdinal: ordinal,
  });
}

// ---------------------------------------------------------------------------
// FR01-P: a REAL 32-deep durable child lineage — the accepted maximum
// ---------------------------------------------------------------------------

test('FR01-P a real nested child lineage admits every edge up to the frozen maximum (32); each edge stamps its durable lineageDepth and runs its real child effect', async () => {
  for (let level = 0; level <= MAX_LINEAGE_DEPTH + 5; level += 1) {
    await activate(chainKey(level));
  }
  const ledgerBefore = ledgerCalls.length;
  for (let level = 1; level <= MAX_LINEAGE_DEPTH; level += 1) {
    // The declared provenance points at the parent's own incoming edge
    // (grandparent -> parent, ordinal 1); a root parent declares nothing.
    const declared = level === 1
      ? undefined
      : { viaParentInstanceKey: chainKey(level - 2), invocationOrdinal: 1 };
    const sent = await sendChild(chainKey(level - 1), chainKey(level), declared) as {
      status: string;
      invocation: { status: string; lineageDepth: number };
    };
    assert.equal(sent.status, 'accepted', `edge ${String(level)} must be admitted`);
    assert.equal(sent.invocation.status, 'accepted');
    assert.equal(sent.invocation.lineageDepth, level, `edge ${String(level)} stamps its durable lineage depth`);
  }
  const deepest = await invocation(chainKey(MAX_LINEAGE_DEPTH - 1), chainKey(MAX_LINEAGE_DEPTH)) as {
    status: string; lineageDepth: number;
  };
  assert.equal(deepest.status, 'accepted', 'the depth-32 invocation record is durable accepted truth');
  assert.equal(deepest.lineageDepth, MAX_LINEAGE_DEPTH, 'the maximum edge depth is exactly the frozen bound');
  assert.equal(ledgerCalls.length - ledgerBefore, MAX_LINEAGE_DEPTH, 'every admitted edge ran exactly one real child effect');
  assert.equal(await stateKeyOf(chainKey(MAX_LINEAGE_DEPTH)), 'taskDone', 'the deepest child instance committed its task');
});

// ---------------------------------------------------------------------------
// FR01-N: max+1 — the overflowed edge refuses typed BEFORE any durable
// child allocation, turn, Effect or Journal
// ---------------------------------------------------------------------------

test('FR01-N an edge one level beyond the maximum (max+1) refuses typed CHILD_DEPTH_EXCEEDED with zero allocation and zero effects', async () => {
  const ledgerBefore = ledgerCalls.length;
  await assertRefused(
    sendChild(chainKey(MAX_LINEAGE_DEPTH), chainKey(MAX_LINEAGE_DEPTH + 1), {
      viaParentInstanceKey: chainKey(MAX_LINEAGE_DEPTH - 1), invocationOrdinal: 1,
    }),
    'CHILD_DEPTH_EXCEEDED',
  );
  assert.equal(await invocation(chainKey(MAX_LINEAGE_DEPTH), chainKey(MAX_LINEAGE_DEPTH + 1)), null, 'no durable invocation record was allocated');
  assert.equal(await stateKeyOf(chainKey(MAX_LINEAGE_DEPTH + 1)), 'review', 'the overflowed child state was never touched');
  assert.equal(ledgerCalls.length, ledgerBefore, 'the overflowed send dispatched no effect');
});

// ---------------------------------------------------------------------------
// FR01-N: missing — a non-root parent MUST declare its durable provenance
// ---------------------------------------------------------------------------

test('FR01-N a non-root parent that declares no lineage refuses typed CHILD_LINEAGE_REQUIRED with zero allocation (fail-closed, never root-claim)', async () => {
  const ledgerBefore = ledgerCalls.length;
  await assertRefused(sendChild(chainKey(MAX_LINEAGE_DEPTH), chainKey(MAX_LINEAGE_DEPTH + 2)), 'CHILD_LINEAGE_REQUIRED');
  assert.equal(await invocation(chainKey(MAX_LINEAGE_DEPTH), chainKey(MAX_LINEAGE_DEPTH + 2)), null, 'no durable invocation record was allocated');
  assert.equal(await stateKeyOf(chainKey(MAX_LINEAGE_DEPTH + 2)), 'review', 'the child state was never touched');
  assert.equal(ledgerCalls.length, ledgerBefore, 'the undeclared send dispatched no effect');
});

// ---------------------------------------------------------------------------
// FR01-N: mutation/foreign — a declared provenance pointer that does not
// match the durable incoming truth refuses typed CHILD_LINEAGE_FORGERY
// ---------------------------------------------------------------------------

test('FR01-N mutated ordinals, foreign pairs and forged root provenance each refuse typed CHILD_LINEAGE_FORGERY with zero allocation and zero effects', async () => {
  const ledgerBefore = ledgerCalls.length;

  // Mutation: the correct grandparent with a tampered ordinal (the real
  // incoming edge is ordinal 1).
  await assertRefused(
    sendChild(chainKey(MAX_LINEAGE_DEPTH), chainKey(MAX_LINEAGE_DEPTH + 3), {
      viaParentInstanceKey: chainKey(MAX_LINEAGE_DEPTH - 1), invocationOrdinal: 99,
    }),
    'CHILD_LINEAGE_FORGERY',
  );

  // Foreign: an existing durable edge of a DIFFERENT pair (the chain's
  // root edge grandparent=fr01c-0/child=fr01c-1) presented as this
  // parent's provenance.
  await assertRefused(
    sendChild(chainKey(MAX_LINEAGE_DEPTH), chainKey(MAX_LINEAGE_DEPTH + 4), {
      viaParentInstanceKey: chainKey(0), invocationOrdinal: 1,
    }),
    'CHILD_LINEAGE_FORGERY',
  );

  // Forged root provenance: a ROOT parent (no incoming invocation record)
  // declares lineage it cannot have.
  await assertRefused(
    sendChild(chainKey(0), chainKey(MAX_LINEAGE_DEPTH + 5), {
      viaParentInstanceKey: chainKey(1), invocationOrdinal: 1,
    }),
    'CHILD_LINEAGE_FORGERY',
  );

  for (const offset of [3, 4, 5]) {
    assert.equal(await invocation(chainKey(MAX_LINEAGE_DEPTH), chainKey(MAX_LINEAGE_DEPTH + offset)), null, `no durable record for the forged send at offset ${String(offset)}`);
  }
  assert.equal(await invocation(chainKey(0), chainKey(MAX_LINEAGE_DEPTH + 5)), null, 'no durable record for the forged-root send');
  for (const offset of [3, 4, 5]) {
    assert.equal(await stateKeyOf(chainKey(MAX_LINEAGE_DEPTH + offset)), 'review', `child at offset ${String(offset)} was never touched`);
  }
  assert.equal(ledgerCalls.length, ledgerBefore, 'the forged sends dispatched no effect');
});
