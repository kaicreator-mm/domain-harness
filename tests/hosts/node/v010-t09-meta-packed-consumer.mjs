/**
 * v0.10 T09 R1 P1-3 — the clean packed consumer executed in an isolated
 * directory. It may import ONLY the installed packed packages and Node
 * builtins; any monorepo path resolution would fail this probe.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { V10_SFEATURE_ABI, V10_TARGET_PROFILE, sha256Hex } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '@kaicreator/domain-harness-build';
import { activateV10App } from '@kaicreator/domain-harness-microkernel/host-seam';
import {
  metaFeedbackClaimKey,
  metaFeedbackEvidencePrefix,
  metaFeedbackLedgerKey,
  runMetaFeedbackWorkflow,
} from '@kaicreator/domain-harness-host-node';

const DEPLOYMENT = Object.freeze({
  deployedAppId: 'deploy:packed-t09',
  tenantId: 'tenant:packed-t09',
  appId: 'app:packed-t09',
});
const BUSINESS_ID = 'business-meta-feedback@v010.1.0.0';
const NOW = Date.UTC(2026, 9, 20, 4, 0, 0);
const INSTANCE = 'instance:packed';
const SCHEDULE = 'schedule:packed';

// v0.10.2 T01: payloads are Domain Package bytes (domain-packages/**, examples/v010-meta-feedback)
// that the test copies, unchanged, next to this script; the compiler package no longer ships them.
function payloadPath(name) {
  return fileURLToPath(new URL(`./payload/${name}.mjs`, import.meta.url));
}

const kernel = readFileSync(payloadPath('kernel-mechanism-v1'), 'utf8');
const sdk = readFileSync(payloadPath('standard-sdk-v1'), 'utf8');
const business = readFileSync(payloadPath('business-meta-feedback-v1'), 'utf8');
const metaFeature = readFileSync(payloadPath('sfeature-meta-feedback-v1'), 'utf8');

const routerSource = `
export function routeWorkflowIntent(request) {
  const binding = request.bindings[0];
  return {
    kind: 'selected',
    operationId: binding.operationId,
    capabilityId: binding.capabilityId,
    handlerId: binding.handlerId,
    basisDigest: request.basisDigest,
  };
}
`;
const standardSource = `${sdk}\n${routerSource}`;
const capabilitySource = `
export const MODULE_ID = 'capability-packed-probe@v010.1.0.0';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [{ endpointId: 'capability:probe', kind: 'capability-endpoint' }];
export function previewTotal() { return { ok: true }; }
`;

/** The physical store persists JSON documents; copy them the same way. */
function copyValue(value) {
  return JSON.parse(JSON.stringify(value));
}

class MapStore {
  #docs = new Map();

  async get(key) {
    const doc = this.#docs.get(key);
    return doc === undefined ? null : { value: copyValue(doc.value), revision: doc.revision };
  }

  async put(key, value, condition) {
    const existing = this.#docs.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) {
        throw Object.assign(new Error('host doc already exists'), { code: 'HOST_KEY_EXISTS' });
      }
      this.#docs.set(key, { value: copyValue(value), revision: 0 });
      return { revision: 0 };
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw Object.assign(new Error('host doc revision moved'), { code: 'HOST_CAS_CONFLICT' });
    }
    this.#docs.set(key, { value: copyValue(value), revision: existing.revision + 1 });
    return { revision: existing.revision + 1 };
  }

  keys() {
    return [...this.#docs.keys()];
  }
}

async function main() {
  const app = buildV10App({
    appId: DEPLOYMENT.appId,
    audience: 'aud:packed-t09',
    targetProfile: V10_TARGET_PROFILE,
    modules: [
      {
        packageId: 'v08-kernel-mechanism@1.0.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
        moduleSource: kernel, moduleSha256: sha256Hex(kernel),
        endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
      },
      {
        packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
        moduleSource: standardSource, moduleSha256: sha256Hex(standardSource),
        endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
      },
      {
        packageId: BUSINESS_ID, role: 'business', abiVersion: 'v08-business-abi/1',
        moduleSource: business, moduleSha256: sha256Hex(business),
        endpoint: 'business-policy', dependencies: [],
        provides: ['business:policy/1', 'intent:recordMetaFeedback', 'intent:closeMetaFeedback'], requires: [],
      },
      {
        packageId: 'capability-packed-probe@v010.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
        moduleSource: capabilitySource, moduleSha256: sha256Hex(capabilitySource),
        endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:probe/1'], requires: [],
        capabilityId: 'probe', handlers: [{ operationId: 'preview', handler: 'previewTotal' }],
      },
      {
        packageId: 'sfeature-meta-feedback@v010.1.0.0', role: 'standard-feature', abiVersion: V10_SFEATURE_ABI,
        moduleSource: metaFeature, moduleSha256: sha256Hex(metaFeature),
        endpoint: 'standard-feature', dependencies: [], provides: ['standard:meta-feedback/1'], requires: [],
        featureExport: 'proposeMetaFeedback',
      },
    ],
    routes: [
      { intentId: 'recordMetaFeedback', operationId: 'preview', capabilityId: 'probe', handlerId: 'previewTotal' },
      { intentId: 'closeMetaFeedback', operationId: 'preview', capabilityId: 'probe', handlerId: 'previewTotal' },
    ],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 't09-packed-probe',
  });
  const store = new MapStore();
  const activation = await activateV10App(app, {
    store,
    tenantId: DEPLOYMENT.tenantId,
    now: () => NOW,
    deploymentIdentity: DEPLOYMENT,
    queryAuthority: { principal: Object.freeze({ source: 'host' }), authorize: () => true },
  });
  try {
    const scope = Object.freeze({
      deployedAppId: DEPLOYMENT.deployedAppId,
      tenantId: DEPLOYMENT.tenantId,
      appId: DEPLOYMENT.appId,
      businessPackageId: BUSINESS_ID,
    });
    const evidenceKey = `${metaFeedbackEvidencePrefix(scope)}evidence/1`;
    await store.put(evidenceKey, { kernelOutcome: 'admitted', semanticOutcome: 'unavailable' }, { kind: 'create' });
    const workflow = Object.freeze({
      intentType: 'recordMetaFeedback', instanceKey: INSTANCE, scheduleKey: SCHEDULE, round: 1,
    });
    const first = await runMetaFeedbackWorkflow({
      facade: activation.facade, store, workflow, sources: { evidenceKeys: [evidenceKey] }, now: () => NOW,
    });
    const snapshot1 = await activation.facade.queryScopedSnapshot({
      workflowId: 'meta-feedback-loop', instanceKey: INSTANCE,
    });
    const replay = await runMetaFeedbackWorkflow({
      facade: activation.facade, store, workflow, sources: { evidenceKeys: [evidenceKey] }, now: () => NOW,
    });
    const snapshot2 = await activation.facade.queryScopedSnapshot({
      workflowId: 'meta-feedback-loop', instanceKey: INSTANCE,
    });
    let deepImportCode = null;
    try {
      await import('@kaicreator/domain-harness-compiler/dist/qualified-package/v10meta/meta-feedback-workflow.js');
    } catch (error) {
      deepImportCode = error && error.code ? error.code : 'NO_CODE';
    }
    return {
      ok: true,
      resolved: import.meta.resolve('@kaicreator/domain-harness-host-node'),
      payloadResolved: payloadPath('business-meta-feedback-v1'),
      status: first.status,
      replayed: replay.replayed,
      proposalDigest: first.proposalDigest,
      receiptDigest: first.receiptDigest,
      replayReceiptDigest: replay.receiptDigest,
      ledgerKey: first.ledgerKey,
      claimKey: first.claimKey,
      expectedLedgerKey: metaFeedbackLedgerKey(scope, INSTANCE, SCHEDULE, 1),
      expectedClaimKey: metaFeedbackClaimKey(scope, INSTANCE, SCHEDULE, 1),
      stateRevision1: snapshot1.snapshot.stateRevision,
      stateRevision2: snapshot2.snapshot.stateRevision,
      keys: store.keys(),
      deepImportCode,
    };
  } finally {
    activation.dispose();
  }
}

try {
  process.stdout.write(JSON.stringify(await main()));
} catch (error) {
  process.stdout.write(JSON.stringify({
    ok: false,
    code: error && error.code ? error.code : 'NO_CODE',
    message: String(error && error.message ? error.message : error).slice(0, 1200),
    stack: String(error && error.stack ? error.stack : '').slice(0, 2000),
  }));
  process.exitCode = 1;
}
