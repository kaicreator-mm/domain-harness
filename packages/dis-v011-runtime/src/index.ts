import { buildV10App } from '@kaicreator/domain-harness-build';
import { V10_TARGET_PROFILE } from '@kaicreator/domain-harness-contracts';
import { consumeDis } from './dis-consumer.js';
import { canonicalDigest, digest } from './knowledge.js';
import type { Selection } from './types.js';

export { bootKdp } from './kdp.js';
export { selectKnowledge, canonicalDigest, digest } from './knowledge.js';

const business = `
export const MODULE_ID = 'business-dis-player@0.11.0-dev.0';
export const PACKAGE_KIND = 'business';
export const ABI_VERSION = 'v08-business-abi/1';
export const ENDPOINTS = [{ endpointId: 'business:dis-player', kind: 'business-policy' }];
export const INTENT_TYPES = ['recognizePlayer'];
export const EFFECT_TYPES = ['effect:dis-read'];
export function getPolicy() {
  return {
    packageId: MODULE_ID, policyId: 'dis-player', domainId: 'xdownload',
    workflowDefinition: { workflowKey: 'dis-player', initialState: 'ready', initialContext: {}, guards: [],
      states: [{ stateKey: 'ready', transitions: [{ transitionKey: 'consume-dis', trigger: { kind: 'event', eventType: 'PAGE_OBSERVED' },
        targetState: 'ready', effectIntents: [{ effectType: 'effect:dis-read',
          inputFrom: { observation: { source: 'event', path: ['payload','observation'] } } }] }] }] },
    decisionSchema: { isValid(value) { return value?.event?.type === 'PAGE_OBSERVED' && typeof value?.decision?.outcome === 'string'; } },
    governanceSemantics: { hardInvariants: [] }, initialStateKey: 'ready', initialContext: {},
    rules: { 'rule:observe': { ruleId: 'rule:observe', eventType: 'PAGE_OBSERVED', payloadFromInput: { observation: 'observation' } } },
    intentBindings: { recognizePlayer: { trigger: { kind: 'event', eventType: 'PAGE_OBSERVED' }, ruleId: 'rule:observe', roles: ['requester'] } },
    effectBindings: { 'effect:dis-read': { semantics: 'idempotent', resource: { key: 'dis-player', operation: 'dis.consume' },
      handler: async ({ input, resources }) => resources.call('dis-player', 'dis.consume', input.observation) } },
  };
}
`;

/** One selected BUILD. The frozen registry reference is an interface, while the
 * executed private adapter is identified by the capability's actual BUILD digest. */
export function buildConsumer(selection: Selection, payload: { kernel: string; standard: string; router: string }) {
  const selectedDigest = canonicalDigest(selection);
  const kernelId = 'v08-kernel-mechanism@1.0.0';
  const standardId = 'standard-sdk@v08.1.0.0';
  const standard = payload.standard + '\nconst selectedRouter = (() => {\n'
    + payload.router.replace(/^export /gm, '') + '\nreturn { routeWorkflowIntent };\n})();\n'
    + 'export const routeWorkflowIntent = selectedRouter.routeWorkflowIntent;\n';
  const adapterId = 'capability-dis-player@0.11.0-dev.0';
  const moduleSource = `
export const MODULE_ID = '${adapterId}';
export const PACKAGE_KIND = 'capability';
export const ABI_VERSION = 'v08-capability-abi/1';
export const ENDPOINTS = [{ endpointId: 'capability:dis-player', kind: 'capability-endpoint' }];
const selected = ${JSON.stringify(selection)};
const evaluate = ${consumeDis.toString()};
export function consumeObservation(input) {
  return { ...evaluate(input, selected), selectedDigest: '${selectedDigest}' };
}
`;
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
  return { app, selectedDigest, adapterSha256: digest(moduleSource) };
}
