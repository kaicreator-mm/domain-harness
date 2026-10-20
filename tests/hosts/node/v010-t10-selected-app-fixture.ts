/**
 * v0.10 T10 (#1176) — selected-App two-B fixture shared by the physical test
 * and its two-process query child.
 *
 * ONE deployment selects TWO Business packages whose sealed policies declare
 * the SAME workflowKey (`order-quote`). Their intents differ only so the
 * public `send` route can address each B; the physical K namespace is the
 * K02 scoped tuple [deployedAppId,tenantId,appId,businessPackageId].
 */
import { readFile } from 'node:fs/promises';

import type {
  V10BuiltApp,
  V10DocStore,
  V10DocWriteCondition,
  V10ModuleInput,
  V10QueryAuthority,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import {
  V10_TARGET_PROFILE,
  buildV10App,
  sha256Hex,
} from '../../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { SqliteCasStore } from '../../../packages/domain-harness/src/host-v8/index.js';
import type { V10MultiBQueryTarget } from '../../../packages/domain-harness/src/host-v8/v010-authorized-multib-query.js';

export const T10_DEPLOYMENT = Object.freeze({
  deployedAppId: 'deploy-selected-t10',
  tenantId: 'tenant-shared-t10',
  appId: 'app-selected-t10',
});
export const T10_ALPHA = 'business-order-approval-alpha@v010.1.0.0';
export const T10_BETA = 'business-order-approval-beta@v010.1.0.0';
export const T10_WORKFLOW_ID = 'order-quote';
export const T10_INSTANCE_KEY = 'shared-q-1';
export const T10_SHARED_TARGET = Object.freeze({ workflowId: T10_WORKFLOW_ID, instanceKey: T10_INSTANCE_KEY });
export const T10_NOW = Date.UTC(2026, 9, 19, 12, 0, 0);

export const T10_HOST_PRINCIPAL = Object.freeze({
  source: 'host-authenticated',
  subject: 'user:t10-scoped-query',
  tenantId: T10_DEPLOYMENT.tenantId,
});

const payloadDir = new URL('../../../packages/domain-harness-compiler/src/qualified-package/payload/', import.meta.url);
const routerUrl = new URL('../../../packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url);
const approvalUrl = new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url);
const capabilityUrl = new URL('../../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url);

/** BUILD the selected two-B App over the REAL payload/example bytes. */
export async function buildT10TwoBApp(): Promise<V10BuiltApp> {
  const [kernel, sdk, router, approval, capability] = await Promise.all([
    readFile(new URL('kernel-mechanism-v1.mjs', payloadDir), 'utf8'),
    readFile(new URL('standard-sdk-v1.mjs', payloadDir), 'utf8'),
    readFile(routerUrl, 'utf8'),
    readFile(approvalUrl, 'utf8'),
    readFile(capabilityUrl, 'utf8'),
  ]);
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
      packageId: 'v08-kernel-mechanism@v0.10.0', role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: kernel, moduleSha256: sha256Hex(kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    {
      packageId: 'standard-sdk@v08.1.0.0', role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: standardBundle, moduleSha256: sha256Hex(standardBundle),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    {
      packageId: T10_ALPHA, role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: approval, moduleSha256: sha256Hex(approval),
      endpoint: 'business-policy', dependencies: [],
      provides: ['business:policy/1', 'intent:submitQuoteDecision'], requires: [],
    },
    {
      packageId: T10_BETA, role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: approval, moduleSha256: sha256Hex(approval),
      endpoint: 'business-policy', dependencies: [],
      provides: ['business:policy/1', 'intent:submitQuoteDecisionStrict'], requires: [],
    },
    {
      packageId: 'capability-quote-tools@v08.1.0.0', role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: capability, moduleSha256: sha256Hex(capability),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:ledger/1'], requires: [],
      capabilityId: 'ledger',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
  ];
  return buildV10App({
    appId: 'app:v010-t10-selected-two-b',
    audience: 'aud:v010-t10',
    targetProfile: V10_TARGET_PROFILE,
    modules,
    routes: [
      { intentId: 'submitQuoteDecision', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
      { intentId: 'submitQuoteDecisionStrict', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
    ],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 'v010-t10-selected-two-b',
  });
}

export interface T10PhysicalCounts {
  gets: number;
  puts: number;
  removes: number;
}

/** One observed access on the merged authorization→read sequence. */
export interface T10AccessEvent {
  readonly kind: 'get' | 'put' | 'remove' | 'authorize';
  readonly key: string;
}

/**
 * Instrumented wrapper: counts every physical access to the ONE SQLite file
 * and appends key-level events so a test can prove authorization precedes the
 * only snapshot read and that denial/ambiguity paths read nothing.
 */
export function t10CountingStore(
  store: SqliteCasStore,
  counts: T10PhysicalCounts,
  events?: T10AccessEvent[],
): V10DocStore {
  return {
    get: async (key) => {
      counts.gets += 1;
      events?.push({ kind: 'get', key });
      return await store.get(key);
    },
    put: async (key, value, condition: V10DocWriteCondition) => {
      counts.puts += 1;
      events?.push({ kind: 'put', key });
      return await store.put(key, value,
        condition.kind === 'create' ? { mustBeAbsent: true } : { mustMatchRevision: condition.revision });
    },
    remove: async (key, condition: V10DocWriteCondition) => {
      counts.removes += 1;
      events?.push({ kind: 'remove', key });
      await store.remove(key, condition.kind === 'create' ? { mustBeAbsent: true } : { mustMatchRevision: condition.revision });
    },
    keys: async () => await store.list(''),
  };
}

export interface T10AuthorityProbe {
  /** The Host-verified principal object passed to authorize(). */
  readonly observedPrincipals: unknown[];
  /** Every target considered for authorization. */
  readonly checks: V10MultiBQueryTarget[];
}

/** A trusted-Host query authority over a MUTABLE visible set. */
export function t10Authority(
  visible: Set<string>,
  probe: T10AuthorityProbe,
  principal: unknown = T10_HOST_PRINCIPAL,
  events?: T10AccessEvent[],
): V10QueryAuthority {
  return {
    principal,
    authorize: (verified, target) => {
      probe.observedPrincipals.push(verified);
      probe.checks.push(target);
      events?.push({ kind: 'authorize', key: target.businessPackageId });
      const subject = verified as { tenantId?: string };
      return subject?.tenantId === target.tenantId && visible.has(target.businessPackageId);
    },
  };
}

export function t10Probe(): T10AuthorityProbe {
  return { observedPrincipals: [], checks: [] };
}

export function refusalCode(error: unknown): string {
  return String((error as { code?: unknown })?.code ?? 'NO_CODE');
}
