/**
 * v0.10 T09 (#1178) — shared physical fixture for the Meta Feedback Workflow
 * tests and their real second-process witnesses.
 *
 * The fixture is deliberately source-imported (repository source, not a packed
 * install); the separate packed-consumer test proves the public package
 * delivery story.
 */
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

import {
  V10_TARGET_PROFILE,
  type V10BuiltApp,
  type V10DocStore,
  type V10DocWriteCondition,
  type V10ModuleInput,
  type V10QueryAuthority,
} from '@kaicreator/domain-harness-contracts';
import { buildV10App } from '@kaicreator/domain-harness-build';
import { activateV10App, type V10Activation } from '../../../packages/microkernel/src/internal/activation.js';
import {
  createDecisionEvidenceObserver,
  MetaFeedbackError,
  metaFeedbackClaimKey,
  metaFeedbackEvidencePrefix,
  metaFeedbackLedgerKey,
  type MetaFeedbackScope,
  type V10DeploymentIdentity,
} from '@kaicreator/domain-harness-host-node';
import { openSqliteCasStore, type SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import { featureEntry, sha256HexSource } from '../../assembly/helpers-v010.js';

export const metaFeedbackFeatureUrl = new URL('../../../domain-packages/standard/features/meta-feedback/modules/sfeature-meta-feedback-v1.mjs', import.meta.url);
export const routerUrl = new URL('../../../domain-packages/standard/basic/workflow-router.mjs', import.meta.url);
export const capabilityUrl = new URL('../../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url);

export const TENANT = 'tenant:v010-t09-meta';
export const APP_ID = 'app:v010-t09-meta-feedback';
export const BUSINESS_ID = 'business-meta-feedback@v010.1.0.0';
export const CAPABILITY_ID = 'capability-quote-tools@v08.1.0.0';
export const DEPLOYMENT: V10DeploymentIdentity = Object.freeze({
  deployedAppId: 'deploy:v010-t09-meta',
  tenantId: TENANT,
  appId: APP_ID,
});
export const NOW = Date.UTC(2026, 9, 20, 4, 0, 0);
export const MAIN_INSTANCE = 'instance:t09-main';
export const SCHEDULE = 'schedule:t09-main';
export const HEX64 = /^[0-9a-f]{64}$/;

export function scopeFor(
  deployment: V10DeploymentIdentity = DEPLOYMENT,
  businessPackageId: string = BUSINESS_ID,
): MetaFeedbackScope {
  return Object.freeze({
    deployedAppId: deployment.deployedAppId,
    tenantId: deployment.tenantId,
    appId: deployment.appId,
    businessPackageId,
  });
}

export const SCOPE: MetaFeedbackScope = scopeFor();

export function evidenceKeyFor(
  suffix: string,
  deployment: V10DeploymentIdentity = DEPLOYMENT,
  businessPackageId: string = BUSINESS_ID,
): string {
  return `${metaFeedbackEvidencePrefix(scopeFor(deployment, businessPackageId))}${suffix}`;
}

export const EVIDENCE_KEY = evidenceKeyFor('evidence/obs-1');
export const CANDIDATE_KEY = evidenceKeyFor('candidate/1');
export const SHADOW_KEY = evidenceKeyFor('shadow/1');

export function ledgerKeyFor(
  round: number,
  scope: MetaFeedbackScope = SCOPE,
  instanceKey: string = MAIN_INSTANCE,
  scheduleKey: string = SCHEDULE,
): string {
  return metaFeedbackLedgerKey(scope, instanceKey, scheduleKey, round);
}

export function claimKeyFor(
  round: number,
  scope: MetaFeedbackScope = SCOPE,
  instanceKey: string = MAIN_INSTANCE,
  scheduleKey: string = SCHEDULE,
): string {
  return metaFeedbackClaimKey(scope, instanceKey, scheduleKey, round);
}

export interface Counts { gets: number; puts: number; removes: number; }

export interface CountingStore extends V10DocStore {
  readonly counts: Counts;
  readonly readKeys: string[];
  keys(): readonly string[];
}

export function v10Store(sqlite: SqliteCasStore, counts: Counts): CountingStore {
  const readKeys: string[] = [];
  return {
    get: async (key) => {
      counts.gets += 1;
      readKeys.push(key);
      return await sqlite.get(key);
    },
    put: async (key, value, condition: V10DocWriteCondition) => {
      counts.puts += 1;
      return await sqlite.put(key, value, condition.kind === 'create'
        ? { mustBeAbsent: true }
        : { mustMatchRevision: condition.revision });
    },
    remove: async (key, condition: V10DocWriteCondition) => {
      counts.removes += 1;
      await sqlite.remove(key, condition.kind === 'create'
        ? { mustBeAbsent: true }
        : { mustMatchRevision: condition.revision });
    },
    keys: async () => await sqlite.list(''),
    counts,
    readKeys,
  };
}

export interface Harness {
  readonly activation: V10Activation;
  readonly store: CountingStore;
  readonly counts: Counts;
  readonly sqlite: SqliteCasStore;
}

export const candidatePins = {
  candidate: {
    kind: 'Rule', id: 'rule:meta', revision: 'r2',
    sha256: 'd'.repeat(64), provenance: 'pinned:approved-source', approvalState: 'candidate',
  },
  approvedFallback: {
    kind: 'Rule', id: 'rule:meta', revision: 'r1',
    sha256: 'e'.repeat(64), provenance: 'pinned:approved-source', approvalState: 'approved',
  },
};
export const candidateRequest = {
  ...candidatePins,
  budget: { maxCases: 4, maxComparisons: 4 },
  cases: [{
    id: 'case:t09-1',
    candidateOutput: { quote: 'review' },
    baselineOutput: { quote: 'approved' },
    candidatePinSha256: candidatePins.candidate.sha256,
    baselinePinSha256: candidatePins.approvedFallback.sha256,
  }],
};

export function shadowReport(
  app: V10BuiltApp,
  deployment: V10DeploymentIdentity = DEPLOYMENT,
): Record<string, unknown> {
  return {
    kind: 'shadow-l4-evidence',
    shadowAbi: 'dh.v10.shadow-l4-readonly/1',
    appSubjectDigest: app.subjectDigest,
    deployedAppId: deployment.deployedAppId,
    tenantId: deployment.tenantId,
    status: 'difference',
    productionWritesVerifiedZero: true,
    replayDigest: 'c'.repeat(64),
    candidate: candidatePins.candidate,
    approvedFallback: candidatePins.approvedFallback,
    canSelfApprove: false,
    canPromote: false,
    kernelEffectPermit: false,
  };
}

export async function buildT09App(metaSourceOverride?: string): Promise<V10BuiltApp> {
  const [kernel, sdk, router, business, capability, evidenceSource, semanticSource, candidateSource, defaultMetaSource] = await Promise.all([
    readFile(new URL('../../../domain-packages/kernel/basic/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../domain-packages/standard/basic/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(routerUrl, 'utf8'),
    readFile(new URL('../../../examples/v010-meta-feedback/business-meta-feedback-v1.mjs', import.meta.url), 'utf8'),
    readFile(capabilityUrl, 'utf8'),
    readFile(new URL('../../../domain-packages/standard/features/decision-evidence/modules/sfeature-decision-evidence-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../domain-packages/standard/features/candidate-validation/modules/sfeature-candidate-validation-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../domain-packages/standard/features/meta-feedback/modules/sfeature-meta-feedback-v1.mjs', import.meta.url), 'utf8'),
  ]);
  const metaSource = metaSourceOverride ?? defaultMetaSource;
  const routerBody = router.replace(/^export /gm, '');
  const standardBundle = `${sdk}
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
  const modules: V10ModuleInput[] = [
    {
      packageId: 'v08-kernel-mechanism@1.0.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel, moduleSha256: sha256HexSource(kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: standardBundle, moduleSha256: sha256HexSource(standardBundle),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    {
      packageId: BUSINESS_ID, role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: business, moduleSha256: sha256HexSource(business),
      endpoint: 'business-policy', dependencies: [],
      provides: ['business:policy/1', 'intent:recordMetaFeedback', 'intent:closeMetaFeedback'], requires: [],
    },
    {
      packageId: CAPABILITY_ID, role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: capability, moduleSha256: sha256HexSource(capability),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:ledger/1'], requires: [],
      capabilityId: 'ledger',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: semanticSource,
      featureExport: 'resolveSemanticDecision',
    }),
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: evidenceSource,
      featureExport: 'recordDecisionEvidence',
    }),
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: candidateSource,
      featureExport: 'validateCandidateReport',
    }),
    await featureEntry({
      fixture: 'sfeature-validation-v1.mjs', moduleSourceOverride: metaSource,
      featureExport: 'proposeMetaFeedback',
    }),
  ];
  return buildV10App({
    appId: APP_ID,
    audience: 'aud:v010-t09',
    targetProfile: V10_TARGET_PROFILE,
    modules,
    routes: [
      { intentId: 'recordMetaFeedback', operationId: 'preview', capabilityId: 'ledger', handlerId: 'previewTotal' },
      { intentId: 'closeMetaFeedback', operationId: 'preview', capabilityId: 'ledger', handlerId: 'previewTotal' },
    ],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 't09-meta-feedback',
  });
}

export function queryAuthorityFor(tenantId: string = TENANT): V10QueryAuthority {
  return {
    principal: Object.freeze({ source: 'host-authenticated', subject: 'host:t09', tenantId }),
    authorize: () => true,
  };
}

export async function activateApp(
  appToActivate: V10BuiltApp,
  store: V10DocStore,
  deployment: V10DeploymentIdentity = DEPLOYMENT,
  tenantId: string = deployment.tenantId,
  authority: V10QueryAuthority = queryAuthorityFor(tenantId),
): Promise<V10Activation> {
  return await activateV10App(appToActivate, {
    store,
    tenantId,
    now: () => NOW,
    deploymentIdentity: deployment,
    queryAuthority: authority,
  });
}

/** An activation with NO deployment identity: the scoped runner must refuse. */
export async function activateWithoutDeployment(appToActivate: V10BuiltApp, store: V10DocStore): Promise<V10Activation> {
  return await activateV10App(appToActivate, {
    store,
    tenantId: TENANT,
    now: () => NOW,
  });
}

export async function openHarness(
  kPath: string,
  options: {
    readonly app?: V10BuiltApp;
    readonly deployment?: V10DeploymentIdentity;
    readonly tenantId?: string;
  } = {},
): Promise<Harness> {
  const sqlite = await openSqliteCasStore({ path: kPath });
  const counts: Counts = { gets: 0, puts: 0, removes: 0 };
  const store = v10Store(sqlite, counts);
  const appToActivate = options.app ?? await buildT09App();
  const deployment = options.deployment ?? DEPLOYMENT;
  const tenantId = options.tenantId ?? deployment.tenantId;
  const activation = await activateApp(appToActivate, store, deployment, tenantId);
  return { sqlite, counts, store, activation };
}

export async function seedEvidence(
  activation: V10Activation,
  store: V10DocStore,
  options: {
    readonly app: V10BuiltApp;
    readonly deployment?: V10DeploymentIdentity;
    readonly evidenceKey?: string;
    readonly candidateKey?: string;
    readonly shadowKey?: string;
  },
): Promise<void> {
  const deployment = options.deployment ?? DEPLOYMENT;
  const evidenceKey = options.evidenceKey ?? EVIDENCE_KEY;
  const candidateKey = options.candidateKey ?? CANDIDATE_KEY;
  const shadowKey = options.shadowKey ?? SHADOW_KEY;
  const observer = createDecisionEvidenceObserver({
    facade: activation.facade,
    evidenceFeatureKey: 'standard:decision-evidence/1',
    semanticFeatureKey: 'standard:semantic-decision/1',
  });
  const schema = { id: 'schema:meta', revision: 'r1', provenanceKey: 'approved:t09' };
  const observation = await observer.observeAndRecord({
    intent: {
      intentType: 'recordMetaFeedback',
      instanceKey: 'instance:t09-evidence',
      messageId: 'msg:t09-evidence',
      input: {
        disposition: 'proposal-only',
        effectCount: 0,
        proposalId: 'seed-proposal',
        proposalDigest: 'a'.repeat(64),
        evidenceDigest: 'b'.repeat(64),
      },
    },
    evidence: {
      observationId: 'obs:t09-1',
      schema,
      observedDependencies: [],
    },
    semanticRequest: {
      input: { amount: 30 },
      schema,
      limits: { maxSteps: 8, maxModelCalls: 1, maxToolCalls: 1 },
      rules: [{ id: 'meta-rule', when: { amount: 30 }, decision: { disposition: 'approved' } }],
    },
  });
  if ((observation.kernelReceipt as Record<string, unknown>).status !== 'admitted') {
    throw new Error('the seeded T06 evidence did not come from a real admitted K receipt');
  }
  await store.put(evidenceKey, observation.decisionTrace, { kind: 'create' });

  const candidate = await activation.facade.invokeSelectedStandardFeature(
    'standard:candidate-validation/1',
    candidateRequest,
  ) as Record<string, unknown>;
  if (candidate.status !== 'reported-difference') {
    throw new Error('the seeded candidate report did not report the expected difference');
  }
  await store.put(candidateKey, candidate, { kind: 'create' });
  await store.put(shadowKey, shadowReport(options.app, deployment), { kind: 'create' });
}

export function roundIntent(
  round: number,
  instanceKey: string = MAIN_INSTANCE,
  scheduleKey: string = SCHEDULE,
): {
  intentType: string;
  instanceKey: string;
  scheduleKey: string;
  round: number;
} {
  return { intentType: 'recordMetaFeedback', instanceKey, scheduleKey, round };
}

export const sources = { evidenceKeys: [EVIDENCE_KEY], candidateKey: CANDIDATE_KEY, shadowKey: SHADOW_KEY } as const;

export async function stateOf(
  activation: V10Activation,
  instanceKey: string = MAIN_INSTANCE,
): Promise<Record<string, any>> {
  const answer = await activation.facade.queryScopedSnapshot({
    workflowId: 'meta-feedback-loop',
    instanceKey,
  });
  return answer.snapshot as Record<string, any>;
}

export async function refusal(promise: Promise<unknown>): Promise<MetaFeedbackError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof MetaFeedbackError, `expected a MetaFeedbackError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected the meta feedback round to be refused');
}
