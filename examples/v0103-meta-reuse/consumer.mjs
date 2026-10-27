/**
 * An application-owned public consumer, not a new SDK/Meta service.
 * All SDK imports resolve through declared installed package exports.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { V10_SFEATURE_ABI, V10_TARGET_PROFILE, sha256Hex } from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '@kaicreator/domain-harness-build';
import { activateV10App } from '@kaicreator/domain-harness-microkernel/host-seam';
import {
  metaFeedbackEvidencePrefix,
  pinCandidateSource,
  runMetaFeedbackWorkflow,
  runShadowL4,
  selectedFallbackPin,
} from '@kaicreator/domain-harness-host-node';

export const NOW = Date.UTC(2026, 9, 28);
export const BUSINESS_V1 = 'business-meta-reuse@1.0.0';
export const BUSINESS_V2 = 'business-meta-reuse@2.0.0';
export const DEPLOYMENT = Object.freeze({
  deployedAppId: 'demo:meta-reuse:v1', tenantId: 'demo:tenant', appId: 'demo:meta-reuse',
});

const copy = value => globalThis.structuredClone(value);
const failure = code => Object.assign(new Error(code), { code });

/** Small example-only in-memory V10DocStore; no disk durability is claimed. */
export class ExampleStore {
  #documents = new Map();
  writes = 0;
  async get(key) {
    const entry = this.#documents.get(key);
    return entry === undefined ? null : copy(entry);
  }
  async put(key, value, condition) {
    const current = this.#documents.get(key);
    if (condition.kind === 'create' ? current !== undefined
      : current === undefined || current.revision !== condition.revision) {
      throw failure('HOST_CAS_CONFLICT');
    }
    const revision = current === undefined ? 0 : current.revision + 1;
    this.#documents.set(key, { value: copy(value), revision });
    this.writes += 1;
    return { revision };
  }
  async remove(key, condition) {
    const current = this.#documents.get(key);
    if (condition.kind !== 'cas' || current?.revision !== condition.revision) {
      throw failure('HOST_CAS_CONFLICT');
    }
    this.#documents.delete(key);
    this.writes += 1;
  }
  keys() { return [...this.#documents.keys()]; }
  witness() {
    return { writes: this.writes, documents: copy([...this.#documents.entries()]).sort(([a], [b]) => a.localeCompare(b)) };
  }
}

const PAYLOAD_NAMES = {
  kernel: 'kernel-mechanism-v1.mjs', sdk: 'standard-sdk-v1.mjs',
  router: 'workflow-router.mjs', business: 'business-meta-feedback-v1.mjs',
  meta: 'sfeature-meta-feedback-v1.mjs', candidate: 'sfeature-candidate-validation-v1.mjs',
};

/** The trusted BUILD producer supplies approved Domain Package source bytes. */
export async function readPayloads(directory) {
  return Object.fromEntries(await Promise.all(Object.entries(PAYLOAD_NAMES).map(async ([key, name]) =>
    [key, await readFile(join(directory, name), 'utf8')])));
}

function businessSource(base, revision) {
  const original = "'business-meta-feedback@v010.1.0.0'";
  if (base.split(original).length !== 2) throw failure('DEMO_BUSINESS_SOURCE_MISMATCH');
  const id = revision === 1 ? BUSINESS_V1 : BUSINESS_V2;
  // This pure evaluator is private Business code evaluated by the existing
  // Host Shadow runner. It creates no new selected Standard Feature package.
  // The existing bounded Shadow source format treats any leftover `export`
  // token as unsupported, including prose. This example's trusted BUILD
  // producer keeps the inherited comment compatible without changing SDK code.
  return base.replace('endpoint export `getPolicy()`', 'endpoint entry `getPolicy()`')
    .replace(original, JSON.stringify(id))
    + `\nexport function evaluate() { return { reviewPolicyRevision: ${revision} }; }\n`;
}

function sealedModule(packageId, role, abiVersion, source, fields) {
  return { packageId, role, abiVersion, moduleSource: source, moduleSha256: sha256Hex(source),
    dependencies: [], requires: [], ...fields };
}

export function buildExampleApp(payloads, revision = 1) {
  if (revision !== 1 && revision !== 2) throw failure('DEMO_REVISION_INVALID');
  const router = payloads.router.replace(/^export /gm, '');
  const sdk = `${payloads.sdk}\nconst routerBundle = (() => {\n${router}\nreturn {routeWorkflowIntent};\n})();\nexport const routeWorkflowIntent = routerBundle.routeWorkflowIntent;\n`;
  const business = businessSource(payloads.business, revision);
  const capability = `export const MODULE_ID='capability-meta-preview@1.0.0';
export const PACKAGE_KIND='capability'; export const ABI_VERSION='v08-capability-abi/1';
export const ENDPOINTS=[{endpointId:'capability:preview',kind:'capability-endpoint'}];
export function preview(){return {ok:true};}`;
  return buildV10App({
    appId: DEPLOYMENT.appId, audience: 'demo:meta-reuse', targetProfile: V10_TARGET_PROFILE,
    modules: [
      sealedModule('v08-kernel-mechanism@1.0.0', 'kernel-primary', 'v08-kernel-abi/1', payloads.kernel,
        { endpoint: 'occurrence-runtime', provides: ['kernel:occurrence-runtime/1'] }),
      sealedModule('standard-sdk@v08.1.0.0', 'standard-primary', 'v08-standard-sdk-abi/1', sdk,
        { endpoint: 'rule-interpreter', provides: ['standard:interpret/1', 'standard:route/1'] }),
      sealedModule(revision === 1 ? BUSINESS_V1 : BUSINESS_V2, 'business', 'v08-business-abi/1', business,
        { endpoint: 'business-policy', provides: ['business:policy/1', 'intent:recordMetaFeedback', 'intent:closeMetaFeedback'] }),
      sealedModule('capability-meta-preview@1.0.0', 'capability', 'v08-capability-abi/1', capability,
        { endpoint: 'capability-endpoint', provides: ['capability:preview/1'], capabilityId: 'preview',
          handlers: [{ operationId: 'preview', handler: 'preview' }] }),
      sealedModule('sfeature-meta-feedback@v010.1.0.0', 'standard-feature', V10_SFEATURE_ABI, payloads.meta,
        { endpoint: 'standard-feature', provides: ['standard:meta-feedback/1'], featureExport: 'proposeMetaFeedback' }),
      sealedModule('sfeature-candidate-validation@v010.1.0.0', 'standard-feature', V10_SFEATURE_ABI, payloads.candidate,
        { endpoint: 'standard-feature', provides: ['standard:candidate-validation/1'], featureExport: 'validateCandidateReport' }),
    ],
    routes: ['recordMetaFeedback', 'closeMetaFeedback'].map(intentId =>
      ({ intentId, operationId: 'preview', capabilityId: 'preview', handlerId: 'preview' })),
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 }, buildId: `meta-reuse-v${revision}`,
  });
}

export async function openExample(payloads, revision = 1) {
  const app = buildExampleApp(payloads, revision);
  const store = new ExampleStore();
  const deployment = { ...DEPLOYMENT, deployedAppId: `demo:meta-reuse:v${revision}` };
  const activation = await activateV10App(app, {
    store, tenantId: deployment.tenantId, deploymentIdentity: deployment, now: () => NOW,
    queryAuthority: { principal: Object.freeze({ source: 'trusted-demo-host' }), authorize: () => true },
  });
  const scope = Object.freeze({ ...deployment, businessPackageId: revision === 1 ? BUSINESS_V1 : BUSINESS_V2 });
  const prefix = metaFeedbackEvidencePrefix(scope);
  return { app, store, activation, scope, prefix, payloads, revision };
}

/** Optional illustrative task-meta adapter; not a claim of a published schema.
 * Copy only safe metadata, never prompts, raw errors, credentials or text.
 * The Host supplies this exact scope. A foreign scope cannot widen it.
 */
export function taskMetaObservation(report, scope) {
  if (report?.scope?.deployedAppId !== scope.deployedAppId
    || report?.scope?.tenantId !== scope.tenantId || report?.scope?.appId !== scope.appId
    || report?.scope?.businessPackageId !== scope.businessPackageId) throw failure('DEMO_REPORT_SCOPE_MISMATCH');
  if (!/^[a-f0-9]{40}$/.test(report.sourceRevision ?? '')
    || !/^[a-f0-9]{64}$/.test(report.evidenceDigest ?? '')) throw failure('DEMO_REPORT_PROVENANCE_REQUIRED');
  return Object.freeze({
    kernelOutcome: 'admitted', semanticOutcome: 'unavailable', source: 'optional-redacted-task-meta',
    scope: Object.freeze({ deployedAppId: scope.deployedAppId, tenantId: scope.tenantId,
      appId: scope.appId, businessPackageId: scope.businessPackageId }),
    provenance: Object.freeze({ sourceRevision: report.sourceRevision, evidenceDigest: report.evidenceDigest }),
  });
}

/** Evidence and proposals are not an approval. This never builds a successor. */
export async function observeAndPropose(environment, optionalReport) {
  const { app, store, activation, prefix, scope, payloads } = environment;
  const redactedReport = optionalReport === undefined ? undefined : taskMetaObservation(optionalReport, scope);
  const receipt = await activation.facade.send({
    intentType: 'recordMetaFeedback', instanceKey: 'demo:observation', messageId: 'demo:observation:1',
    input: { disposition: 'proposal-only', effectCount: 0, proposalId: 'demo:observation',
      proposalDigest: sha256Hex('demo:observation'), evidenceDigest: sha256Hex('demo:evidence') },
  });
  if (receipt.status !== 'admitted') throw failure('DEMO_OBSERVATION_NOT_ADMITTED');
  const evidenceKey = `${prefix}evidence/receipt`;
  const observation = {
    kernelOutcome: receipt.status, semanticOutcome: 'unavailable', source: 'selected-k-receipt',
    kernelObservation: { receiptSha256: sha256Hex(JSON.stringify(receipt)) },
    scope: { tenantId: scope.tenantId, appId: scope.appId, businessPackageId: scope.businessPackageId },
  };
  await store.put(evidenceKey, observation, { kind: 'create' });
  const evidenceKeys = [evidenceKey];
  if (optionalReport !== undefined) {
    const reportKey = `${prefix}evidence/task-meta`;
    await store.put(reportKey, redactedReport, { kind: 'create' });
    evidenceKeys.push(reportKey);
  }
  const source = businessSource(payloads.business, 2);
  const pin = pinCandidateSource({ kind: 'Rule', id: 'demo:meta-review-policy', revision: BUSINESS_V2,
    provenance: 'demo:host-reviewed-source', approvalState: 'candidate' }, source);
  const fallback = selectedFallbackPin(app, { selectedPackageId: BUSINESS_V1, kind: 'Rule', id: pin.id });
  const beforeShadow = store.witness();
  const shadow = await runShadowL4({
    facade: activation.facade, app, tenantId: scope.tenantId,
    store: { get: key => store.get(key), keys: () => store.keys() },
    candidate: { pin, source, exportName: 'evaluate' },
    approvedFallback: { pin: fallback, selectedPackageId: BUSINESS_V1, exportName: 'evaluate' },
    budget: { maxCases: 8, maxComparisons: 8 }, evaluationTimeoutMs: 500,
    physicalWitness: () => store.witness(),
  });
  if (shadow.status !== 'difference' || !shadow.production.productionWritesVerifiedZero) {
    throw Object.assign(failure('DEMO_SHADOW_NOT_VERIFIED'), {
      shadowStatus: shadow.status, shadowFailure: shadow.failure, production: shadow.production,
    });
  }
  const candidate = await activation.facade.invokeSelectedStandardFeature('standard:candidate-validation/1', {
    candidate: pin, approvedFallback: fallback, budget: { maxCases: 1, maxComparisons: 1 },
    cases: [{ id: 'demo:policy-revision', candidateOutput: { reviewPolicyRevision: 2 },
      baselineOutput: { reviewPolicyRevision: 1 }, candidatePinSha256: pin.sha256, baselinePinSha256: fallback.sha256 }],
  });
  const candidateKey = `${prefix}candidate/2`;
  const shadowKey = `${prefix}shadow/2`;
  await store.put(candidateKey, candidate, { kind: 'create' });
  await store.put(shadowKey, shadow, { kind: 'create' });
  const options = { facade: activation.facade, store,
    workflow: { intentType: 'recordMetaFeedback', instanceKey: 'demo:meta', scheduleKey: 'demo:review', round: 1 },
    sources: { evidenceKeys, candidateKey, shadowKey }, now: () => NOW };
  const result = await runMetaFeedbackWorkflow(options);
  const after = await activation.facade.queryScopedSnapshot({ workflowId: 'meta-feedback-loop', instanceKey: 'demo:meta' });
  const replay = await runMetaFeedbackWorkflow(options);
  const replaySnapshot = await activation.facade.queryScopedSnapshot({ workflowId: 'meta-feedback-loop', instanceKey: 'demo:meta' });
  return { receipt, pin, candidate, shadow, beforeShadow, result, replay,
    stateRevision: after.snapshot.stateRevision, replayStateRevision: replaySnapshot.snapshot.stateRevision };
}

/** A separate trusted application-Host/operator decision, outside the SDK
 * proposal path. The callback is application code, never serialized evidence.
 * A synthetic test decision is not real-world human approval or deployment.
 */
export async function buildAfterOperatorReview(environment, review, authorize) {
  if (typeof authorize !== 'function') throw failure('DEMO_OPERATOR_APPROVAL_REQUIRED');
  const authorization = await authorize(Object.freeze({
    candidateDigest: review.pin.sha256, currentSubjectDigest: environment.app.subjectDigest,
    shadowDigest: review.shadow.replayDigest,
  }));
  if (authorization?.decision !== 'approved' || authorization?.operatorId !== 'demo:operator'
    || authorization?.candidateDigest !== review.pin.sha256
    || authorization?.currentSubjectDigest !== environment.app.subjectDigest
    || authorization?.shadowDigest !== review.shadow.replayDigest
    || authorization?.reviewRef !== 'demo:independent-review') throw failure('DEMO_OPERATOR_APPROVAL_REQUIRED');
  const future = buildExampleApp(environment.payloads, 2);
  const selected = future.modules.find(module => module.packageId === BUSINESS_V2);
  if (selected?.moduleSha256 !== review.pin.sha256) throw failure('DEMO_APPROVED_BYTES_MISMATCH');
  return future;
}
