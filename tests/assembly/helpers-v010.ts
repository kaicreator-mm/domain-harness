/**
 * T00 (#1166) assembly-test helpers — composition fixture assembly over the
 * REAL selected payload bytes (compiler K kernel mechanism + Standard SDK
 * with the pure v0.9 WorkflowRouter vendored BUILD-style + the real
 * Business approval and capability-quote-tools example packages), plus the
 * plain in-memory CAS document store used as the K docs port for the
 * composition smoke. Physical SQLite two-process proof is K01/K02 scope —
 * this store is honestly an in-process plain store, never claimed as
 * physical-host evidence.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { BuildV10AppOptions, V10ModuleInput } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import { V10_KEXT_ABI, V10_RUNTIME_ABI, V10_HOST_ABI, V10_SFEATURE_ABI, V10_TARGET_PROFILE } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';
import type { V10DocStore } from '../../packages/domain-harness-compiler/src/qualified-package/v10build/index.js';

export const KERNEL_PACKAGE_ID = 'v08-kernel-mechanism@1.0.0';
export const STANDARD_PACKAGE_ID = 'standard-sdk@v08.1.0.0';
export const BUSINESS_PACKAGE_ID = 'business-order-approval@v08.1.0.0';
export const CAPABILITY_PACKAGE_ID = 'capability-quote-tools@v08.1.0.0';

export const AUDIENCE = 'aud:v010-t00';

export function sha256HexSource(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

interface Payloads {
  readonly kernel: string;
  readonly sdk: string;
  readonly router: string;
  readonly approval: string;
  readonly capability: string;
}

const payloadsPromise: Promise<Payloads> = (async (): Promise<Payloads> => {
  const [kernel, sdk, router, approval, capability] = await Promise.all([
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../examples/v08-domain-apps/business-approval.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url), 'utf8'),
  ]);
  return { kernel, sdk, router, approval, capability };
})();

/** BUILD-style vendored bundle: SDK bytes + the pure Router in one IIFE (v0.9 bridge strategy). */
export function standardBundleSource(payloads: Payloads): string {
  const routerBody = payloads.router.replace(/^export /gm, '');
  return `${payloads.sdk}
// v0.10 T00 BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
}

async function coreEntries(): Promise<{ kernel: V10ModuleInput; standard: V10ModuleInput; business: V10ModuleInput; capability: V10ModuleInput; payloads: Payloads }> {
  const payloads = await payloadsPromise;
  const standard = standardBundleSource(payloads);
  return {
    payloads,
    kernel: {
      packageId: KERNEL_PACKAGE_ID, role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: payloads.kernel, moduleSha256: sha256HexSource(payloads.kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'], requires: [],
    },
    standard: {
      packageId: STANDARD_PACKAGE_ID, role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: standard, moduleSha256: sha256HexSource(standard),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'], requires: [],
    },
    business: {
      packageId: BUSINESS_PACKAGE_ID, role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: payloads.approval, moduleSha256: sha256HexSource(payloads.approval),
      endpoint: 'business-policy', dependencies: [], provides: ['business:policy/1', 'intent:submitQuoteDecisionDynamic'], requires: [],
    },
    capability: {
      packageId: CAPABILITY_PACKAGE_ID, role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: payloads.capability, moduleSha256: sha256HexSource(payloads.capability),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:ledger/1'], requires: [],
      capabilityId: 'ledger',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
  };
}

export interface FixtureSpec {
  readonly fixture: string;
  readonly packageId?: string;
  readonly providerId?: string;
  readonly hookExport?: string;
  readonly hook?: string;
  readonly dependencies?: readonly string[];
  readonly requires?: readonly string[];
  readonly abiVersion?: string;
  readonly externalImports?: { node?: readonly string[]; npm?: readonly string[]; native?: readonly string[] };
  readonly moduleSourceOverride?: string;
  readonly shaOverride?: string;
  readonly optional?: boolean;
  readonly bytesOnly?: boolean;
}

export async function extensionEntry(spec: FixtureSpec): Promise<V10ModuleInput> {
  const source = spec.moduleSourceOverride ?? await readFile(new URL(`./fixtures-v010/${spec.fixture}`, import.meta.url), 'utf8');
  const packageId = spec.packageId ?? declareOf(source, 'MODULE_ID') ?? 'kext-fixture@v010.1.0.0';
  const providerId = spec.providerId ?? declareOf(source, 'PROVIDER_ID') ?? 'advisory-fixture';
  const hook = spec.hook ?? declareOf(source, 'HOOK') ?? 'advisory-fixture-observation/v1';
  const bytesOnly = spec.bytesOnly === true;
  const entry: Record<string, unknown> = {
    packageId,
    role: 'kernel-extension',
    abiVersion: spec.abiVersion ?? V10_KEXT_ABI,
    endpoint: 'kernel-extension-advisory',
    dependencies: spec.dependencies ?? [],
    provides: [hook],
    requires: spec.requires ?? [],
    providerId,
    hookExport: spec.hookExport ?? 'observeFixture',
  };
  if (!bytesOnly) {
    entry.moduleSource = source;
    entry.moduleSha256 = spec.shaOverride !== undefined ? spec.shaOverride : sha256HexSource(source);
  }
  if (spec.externalImports !== undefined) entry.externalImports = spec.externalImports;
  if (spec.optional !== undefined) entry.optional = spec.optional;
  return entry as unknown as V10ModuleInput;
}

export interface FeatureSpec {
  readonly fixture: string;
  readonly packageId?: string;
  readonly featureKey?: string;
  readonly featureExport?: string;
  readonly dependencies?: readonly string[];
  readonly requires?: readonly string[];
  readonly externalImports?: { node?: readonly string[]; npm?: readonly string[]; native?: readonly string[] };
  readonly moduleSourceOverride?: string;
  readonly shaOverride?: string;
  readonly optional?: boolean;
  readonly bytesOnly?: boolean;
}

export async function featureEntry(spec: FeatureSpec): Promise<V10ModuleInput> {
  const source = spec.moduleSourceOverride ?? await readFile(new URL(`./fixtures-v010/${spec.fixture}`, import.meta.url), 'utf8');
  const packageId = spec.packageId ?? declareOf(source, 'MODULE_ID') ?? 'sfeature-fixture@v010.1.0.0';
  const featureKey = spec.featureKey ?? declareOf(source, 'FEATURE_KEY') ?? 'standard:fixture/1';
  const bytesOnly = spec.bytesOnly === true;
  const entry: Record<string, unknown> = {
    packageId,
    role: 'standard-feature',
    abiVersion: V10_SFEATURE_ABI,
    endpoint: 'standard-feature',
    dependencies: spec.dependencies ?? [],
    provides: [featureKey],
    requires: spec.requires ?? [],
    featureExport: spec.featureExport ?? declareOfExportFn(source) ?? 'applyFixture',
  };
  if (!bytesOnly) {
    entry.moduleSource = source;
    entry.moduleSha256 = spec.shaOverride !== undefined ? spec.shaOverride : sha256HexSource(source);
  }
  if (spec.externalImports !== undefined) entry.externalImports = spec.externalImports;
  if (spec.optional !== undefined) entry.optional = spec.optional;
  return entry as unknown as V10ModuleInput;
}

function declareOf(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`export const ${name} = '([^']+)';`));
  return match?.[1];
}

/** First `export function <name>` of the fixture source (its feature surface). */
function declareOfExportFn(source: string): string | undefined {
  const match = source.match(/export function ([A-Za-z][A-Za-z0-9_]*)\(/);
  return match?.[1];
}

export interface CompositionOverrides {
  readonly extensions?: readonly V10ModuleInput[];
  readonly features?: readonly V10ModuleInput[];
  readonly routes?: BuildV10AppOptions['routes'];
}

export async function basicComposition(overrides: CompositionOverrides = {}): Promise<BuildV10AppOptions> {
  const core = await coreEntries();
  return {
    appId: 'app:v010-t00-basic',
    audience: AUDIENCE,
    targetProfile: V10_TARGET_PROFILE,
    modules: [core.kernel, core.standard, core.business, core.capability, ...(overrides.extensions ?? []), ...(overrides.features ?? [])],
    routes: overrides.routes ?? [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 't00-basic',
  };
}

export async function richComposition(overrides: CompositionOverrides = {}): Promise<BuildV10AppOptions> {
  const core = await coreEntries();
  const extensions = overrides.extensions ?? [
    await extensionEntry({ fixture: 'kext-advisory-alpha-v1.mjs', hookExport: 'observeAlpha' }),
    await extensionEntry({ fixture: 'kext-advisory-beta-v1.mjs', hookExport: 'observeBeta' }),
  ];
  const features = overrides.features ?? [
    await featureEntry({ fixture: 'sfeature-validation-v1.mjs', featureExport: 'validate' }),
    await featureEntry({ fixture: 'sfeature-aggregation-v1.mjs', featureExport: 'sum' }),
    await featureEntry({ fixture: 'sfeature-formatting-v1.mjs', featureExport: 'canonicalDigest', externalImports: { node: ['node:crypto'] } }),
  ];
  return {
    appId: 'app:v010-t00-rich',
    audience: AUDIENCE,
    targetProfile: V10_TARGET_PROFILE,
    modules: [core.kernel, core.standard, core.business, core.capability, ...features, ...extensions],
    routes: overrides.routes ?? [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }],
    hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    buildId: 't00-rich',
  };
}

export const V10_ABIS = { runtime: V10_RUNTIME_ABI, host: V10_HOST_ABI, target: V10_TARGET_PROFILE };

/** Plain in-memory CAS document store (create-if-absent at revision 0, cas at revision+1 — the same conditional-write discipline the v0.9 bridge/E2 research world uses; conflicts typed). */
export class PlainCasDocStore implements V10DocStore {
  readonly #documents = new Map<string, { value: unknown; revision: number }>();

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    const doc = this.#documents.get(key);
    return doc === undefined ? null : { value: structuredClone(doc.value), revision: doc.revision };
  }

  async put(key: string, value: unknown, condition: { kind: 'create' } | { kind: 'cas'; revision: number }): Promise<{ revision: number }> {
    const existing = this.#documents.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) {
        throw Object.assign(new Error(`CAS conflict on ${key}: document already exists`), { code: 'HOST_CAS_CONFLICT' });
      }
      this.#documents.set(key, { value: structuredClone(value), revision: 0 });
      return { revision: 0 };
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw Object.assign(new Error(`CAS conflict on ${key}: revision moved (expected ${condition.revision})`), { code: 'HOST_CAS_CONFLICT' });
    }
    const revision = existing.revision + 1;
    this.#documents.set(key, { value: structuredClone(value), revision });
    return { revision };
  }

  keys(): readonly string[] {
    return [...this.#documents.keys()];
  }

  size(): number {
    return this.#documents.size;
  }
}

export function evalLog(): readonly string[] {
  const log = (globalThis as { __v010EvalLog?: string[] }).__v010EvalLog;
  return log === undefined ? [] : [...log];
}

export function clearEvalLog(): void {
  delete (globalThis as { __v010EvalLog?: string[] }).__v010EvalLog;
}

export function disposalLog(): readonly string[] {
  const log = (globalThis as { __v010Disposals?: string[] }).__v010Disposals;
  return log === undefined ? [] : [...log];
}

export function clearDisposalLog(): void {
  delete (globalThis as { __v010Disposals?: string[] }).__v010Disposals;
}

export const INTENT = {
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey: 'instance:t00-1',
  messageId: 'msg:t00-1',
  input: { amount: 30, requestId: 'R-t00-1' },
} as const;
