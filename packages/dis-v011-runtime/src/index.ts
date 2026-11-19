import { buildV10App } from '@kaicreator/domain-harness-build';
import { V10_TARGET_PROFILE } from '@kaicreator/domain-harness-contracts';
import { assertVerifiedSelection, canonicalDigest, digest } from './knowledge.js';
import { registerBuild } from './provider-bindings.js';
import type { Selection } from './types.js';

export { bootKdp } from './boot.js';
export { selectKnowledge, canonicalDigest, digest } from './knowledge.js';

// D1 element-first contract layer (#1530) and D2 bounded execution envelope
// (#1531), wired at I0 integration (#1529). Both stay inside this private
// runtime workspace; no SDK contract surface changes.
export {
  ELEMENT_MANIFEST_SCHEMA, IMPLEMENTATION_KINDS, EFFECT_MODES,
  parseElementManifest,
  resolveDependencyClosure, validateSemanticRelations,
  lockAot, resolveLockedFunction, assertFunctionBindings,
  ElementContractError,
} from './element/index.js';
export type {
  ElementManifest, ElementConsumer, ElementDefinition, ElementFunctionDecl,
  ElementSourceDecl, SemanticRelationDecl, ImplementationKind, EffectMode,
  DependencyClosure, AotArtifactPin, AotLock, AotLockEntry, AotImplementationCandidate,
} from './element/index.js';
export {
  BOUNDED_PROVIDER_KINDS, RESERVED_UNAVAILABLE_PROVIDER_KINDS, realClock,
  BudgetLedger, BoundedBudgetExhaustedError,
  assertBoundedBudget, assertBoundedClock, validateProviderRegistry,
  admitProviderKind, createBoundedEnvelope, boundedConfigError,
} from './bounded/envelope.js';
export type {
  BoundedBudget, BudgetSnapshot, BoundedBudgetAxis, BoundedClock,
  BoundedProviderDescriptor, BoundedProviderKind, BoundedProviderLabel,
  ProviderAdmission, ProviderRejectionCode, BoundedEventFields, BoundedTraceEvent,
  BoundedStepTicket, BoundedStepContext, BoundedPlan, BoundedOutcome, BoundedEnvelope,
} from './bounded/envelope.js';

// A1 App-session lifecycle (#1541), A2 selected no-effect Function invocation
// channel (#1542) and the I0 Domain App composition (#1543), wired at this
// public entry. All stay inside this private runtime workspace; no SDK
// contract surface changes.
export {
  APP_SESSION_STATES, AppSessionError, createAppSession, createAppSessionObserver,
} from './app-init/index.js';
export type {
  AppSessionState, AppSessionErrorCode, AppSessionStepPhase, AppSessionDisposeMode,
  AppLifecycleStep, AppSessionConfig, AppSessionStepRecord, AppSessionDisposeError,
  AppSessionStartedResult, AppSessionStartFailedResult, AppSessionStartResult,
  AppSessionStoppedResult, AppSessionStopFailedResult, AppSessionStopResult,
  AppSessionObservation, AppSessionObserver, AppSession,
} from './app-init/index.js';
export { FunctionCallError } from './function-call/errors.js';
export { createFunctionInvoker } from './function-call/invoker.js';
export type {
  FunctionInputValidator, FunctionBinding, FunctionBindingEntry, FunctionBindings,
  FunctionCallRejectionCode, FunctionCallValidationStatus, InvokerFunctionInfo,
  FunctionCallOutcome, FunctionInvokeRequest, FunctionInvoker, FunctionInvokerConfig,
} from './function-call/invoker.js';
export { createDomainAppSession } from './domain-app.js';
export type { DomainAppConfig, DomainApp } from './domain-app.js';

function businessModule(selection: Selection): string {
  const policy = { packageId: 'business-dis-player@0.11.0-dev.0', packageRevision: selection.revision,
    definitionId: selection.packageId, graphSha256: selection.graphSha256,
    readBinding:selection.businessPolicy };
  return `
export const MODULE_ID = 'business-dis-player@0.11.0-dev.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [{ endpointId: 'business:dis-player', kind: 'business-policy' }];
export const INTENT_TYPES = ['recognizePlayer'];
export const EFFECT_TYPES = ['effect:dis-read'];
export function getPolicy() { return ${JSON.stringify(policy)}; }
`;
}

/** BUILD seals exactly the Runtime Package's selected provider bytes. */
export function buildConsumer(selection: Selection, payload: { kernel: string; standard: string; router: string; provider: string }) {
  assertVerifiedSelection(selection);
  if (digest(payload.kernel) !== 'e1ed59556f8b447b5f559302a893738eeae1d272e3a30ac4545fedfb1da8a3e7'
      || digest(payload.standard) !== 'dec042cacee70a8762b693f02b80ce14844b52bdf12969ff2250c7013c67c8bf'
      || digest(payload.router) !== 'd9f9c33f08951aacebe1648fb44554ecacb70db6292f02367035d99ea1c112b5') throw new Error('UNTRUSTED_HOST_MODULE');
  const selectedDigest = canonicalDigest(selection);
  const business = businessModule(selection);
  const kernelId = 'v08-kernel-mechanism@1.0.0';
  const standardId = 'standard-sdk@v08.1.0.0';
  const standard = payload.standard + '\nconst selectedRouter = (() => {\n'
    + payload.router.replace(/^export /gm, '') + '\nreturn { routeWorkflowIntent };\n})();\n'
    + 'export const routeWorkflowIntent = selectedRouter.routeWorkflowIntent;\n';
  const adapterId = 'capability-dis-player@0.11.0-dev.0';
  const moduleSource = payload.provider;
  if (!selection.providerArtifact || digest(moduleSource) !== selection.providerArtifact.sha256) throw new Error('BUILD_PROVIDER_DIGEST_MISMATCH');
  const app = buildV10App({
    appId: 'app:xdownload-dis', audience: 'aud:xdownload-dis', targetProfile: V10_TARGET_PROFILE,
    buildId: 'dis-xdownload-' + selectedDigest.slice(0, 24),
    modules: [
      { packageId: kernelId, role:'kernel-primary', abiVersion:'v08-kernel-abi/1', moduleSource:payload.kernel, moduleSha256:digest(payload.kernel),
        endpoint:'occurrence-runtime', dependencies:[], provides:['kernel:occurrence-runtime/1'], requires:[] },
      { packageId: standardId, role:'standard-primary', abiVersion:'v08-standard-sdk-abi/1', moduleSource:standard, moduleSha256:digest(standard),
        endpoint:'rule-interpreter', dependencies:[], provides:['standard:interpret/1','standard:route/1'], requires:[] },
      { packageId:'business-dis-player@0.11.0-dev.0', role:'business', abiVersion:'v08-business-abi/1', moduleSource:business, moduleSha256:digest(business),
        endpoint:'business-policy', dependencies:[], provides:['business:policy/1','intent:recognizePlayer'], requires:[] },
      { packageId:adapterId, role:'capability', abiVersion:'v08-capability-abi/1', moduleSource, moduleSha256:digest(moduleSource),
        endpoint:'capability-endpoint', dependencies:[], provides:['capability:dis-player/1'], requires:[], capabilityId:'dis-player',
        handlers:[{ operationId:'dis.consume', handler:'consumeObservation' }] },
    ],
    routes:[{ intentId:'recognizePlayer', operationId:'dis.consume', capabilityId:'dis-player', handlerId:'consumeObservation' }],
    hardBudget:{ maxStepsPerTurn:8, maxWorkUnitsPerTurn:64 },
  });
  return registerBuild({ app, selection, selectedDigest, adapterSha256: digest(moduleSource) });
}
