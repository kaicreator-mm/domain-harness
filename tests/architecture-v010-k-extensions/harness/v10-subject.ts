/**
 * #1150 research harness — v0.10 candidate sealed-subject builder.
 *
 * Builds the research-flavored 'dh.v10.sealed-root/1' subject over the REAL
 * selected v0.9 payload bytes (physical K kernel mechanism, Standard SDK with
 * the pure WorkflowRouter vendored BUILD-style, the real Business approval
 * package and the real capability-quote-tools package) plus physically
 * distinct kernel-extension ESM fixture modules. The subject is plain data:
 * role, identity, module bytes, module SHA-256, endpoint, declared
 * dependencies, provider/hook keys and the immutable hard budget profile.
 *
 * The subject digest binds the roster (identities + digests + bindings), not
 * the raw bytes; bytes are bound through each entry's moduleSha256, which the
 * loader re-verifies against the actual bytes before ANY import.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const V10_SEALED_ROOT_FORMAT = 'dh.v10.sealed-root/1';
export const V10_SELECTED_ABI = 'dh.v10.selected-abi/1';
export const V10_HOST_ABI = 'dh.v10.host-abi/1';
export const V10_KEXT_ABI = 'dh.v10.k-extension/1';

export const KERNEL_PACKAGE_ID = 'v08-kernel-mechanism@1.0.0';
export const STANDARD_PACKAGE_ID = 'standard-sdk@v08.1.0.0';
export const BUSINESS_PACKAGE_ID = 'business-order-approval@v08.1.0.0';
export const CAPABILITY_PACKAGE_ID = 'capability-quote-tools@v08.1.0.0';

export const AUDIENCE = 'aud:v010-kext-spike';

export interface V10RouteRow {
  readonly intentId: string;
  readonly operationId: string;
  readonly capabilityId: string;
  readonly handlerId: string;
}

export interface V10SubjectEntry {
  packageId: string;
  role: 'kernel-primary' | 'kernel-extension' | 'standard-primary' | 'business' | 'capability';
  abiVersion: string;
  moduleSource?: string;
  moduleSha256?: string;
  endpoint: string;
  dependencies: readonly string[];
  provides: readonly string[];
  requires: readonly string[];
  optional: boolean;
  providerId?: string;
  hookExport?: string;
  capabilityId?: string;
  handlers?: readonly { operationId: string; handler: string }[];
}

export interface V10Subject {
  formatVersion: typeof V10_SEALED_ROOT_FORMAT;
  subjectDigest: string;
  appId: string;
  audience: string;
  runtimeAbi: typeof V10_SELECTED_ABI;
  hostAbi: typeof V10_HOST_ABI;
  hardBudget: { maxStepsPerTurn: number; maxWorkUnitsPerTurn: number };
  entries: readonly V10SubjectEntry[];
  routes: readonly V10RouteRow[];
}

export interface Payloads {
  readonly kernel: string;
  readonly sdk: string;
  readonly router: string;
  readonly approval: string;
  readonly capability: string;
}

const payloadsPromise: Promise<Payloads> = (async (): Promise<Payloads> => {
  const [kernel, sdk, router, approval, capability] = await Promise.all([
    readFile(new URL('../../../packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../packages/domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url), 'utf8'),
  ]);
  return { kernel, sdk, router, approval, capability };
})();

export async function loadPayloads(): Promise<Payloads> {
  return payloadsPromise;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Deterministic canonical JSON (sorted plain-data keys, stable strings). */
export function canonicalJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const write = (input: unknown, out: string[]): void => {
    if (input === null || typeof input === 'number' || typeof input === 'boolean') {
      out.push(JSON.stringify(input));
      return;
    }
    if (typeof input === 'string') {
      out.push(JSON.stringify(input));
      return;
    }
    if (typeof input !== 'object') throw new Error('subject digest input is not plain data');
    if (seen.has(input)) throw new Error('subject digest input contains a cycle');
    seen.add(input);
    try {
      if (Array.isArray(input)) {
        out.push('[');
        input.forEach((item, index) => {
          if (index > 0) out.push(',');
          write(item, out);
        });
        out.push(']');
        return;
      }
      const keys = Object.keys(input).sort();
      out.push('{');
      keys.forEach((key, index) => {
        if (index > 0) out.push(',');
        out.push(JSON.stringify(key), ':');
        write((input as Record<string, unknown>)[key], out);
      });
      out.push('}');
    } finally {
      seen.delete(input);
    }
  };
  const out: string[] = [];
  write(value, out);
  return out.join('');
}

/** BUILD-style vendored bundle: SDK bytes + the pure Router wrapped in one IIFE (v0.9 bridge test strategy, verbatim logic). */
export function standardBundleSource(payloads: Payloads): string {
  const routerBody = payloads.router.replace(/^export /gm, '');
  return `${payloads.sdk}
// v0.10 research BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv10RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv10RouterBundle.routeWorkflowIntent;
`;
}

export interface ExtensionSpec {
  readonly fixture: string;
  readonly packageId?: string;
  readonly providerId?: string;
  readonly hookExport: string;
  readonly hook: string;
  readonly dependencies?: readonly string[];
  readonly requires?: readonly string[];
  readonly abiVersion?: string;
  readonly moduleSourceOverride?: string;
  readonly shaOverride?: string;
  readonly optional?: boolean;
  readonly bytesOnly?: boolean;
}

export async function extensionEntry(spec: ExtensionSpec): Promise<V10SubjectEntry> {
  const source = spec.moduleSourceOverride ?? await readFile(new URL(`../fixtures/${spec.fixture}`, import.meta.url), 'utf8');
  const packageId = spec.packageId ?? sourcePackageId(source);
  return {
    packageId,
    role: 'kernel-extension',
    abiVersion: spec.abiVersion ?? V10_KEXT_ABI,
    moduleSource: spec.bytesOnly === true ? undefined : source,
    moduleSha256: spec.shaOverride ?? sha256Hex(source),
    endpoint: 'kernel-extension-advisory',
    dependencies: spec.dependencies ?? [],
    provides: [spec.hook],
    requires: spec.requires ?? [],
    optional: spec.optional ?? false,
    providerId: spec.providerId ?? providerIdOf(source),
    hookExport: spec.hookExport,
  };
}

function declareOf(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`export const ${name} = '([^']+)';`));
  return match?.[1];
}

function sourcePackageId(source: string): string {
  const id = declareOf(source, 'MODULE_ID');
  if (id === undefined) throw new Error('fixture carries no MODULE_ID export');
  return id;
}

function providerIdOf(source: string): string {
  const id = declareOf(source, 'PROVIDER_ID');
  if (id === undefined) throw new Error('fixture carries no PROVIDER_ID export');
  return id;
}

export interface BuildSubjectOptions {
  readonly appId?: string;
  readonly extensions?: readonly V10SubjectEntry[];
  readonly hardBudget?: { maxStepsPerTurn: number; maxWorkUnitsPerTurn: number };
}

export async function buildSubject(options: BuildSubjectOptions = {}): Promise<{ subject: V10Subject; digest: string }> {
  const payloads = await payloadsPromise;
  const standard = standardBundleSource(payloads);
  const core: V10SubjectEntry[] = [
    {
      packageId: KERNEL_PACKAGE_ID, role: 'kernel-primary', abiVersion: 'v08-kernel-abi/1',
      moduleSource: payloads.kernel, moduleSha256: sha256Hex(payloads.kernel),
      endpoint: 'occurrence-runtime', dependencies: [], provides: ['kernel:occurrence-runtime/1'],
      requires: [], optional: false,
    },
    {
      packageId: STANDARD_PACKAGE_ID, role: 'standard-primary', abiVersion: 'v08-standard-sdk-abi/1',
      moduleSource: standard, moduleSha256: sha256Hex(standard),
      endpoint: 'rule-interpreter', dependencies: [], provides: ['standard:interpret/1', 'standard:route/1'],
      requires: [], optional: false,
    },
    {
      packageId: BUSINESS_PACKAGE_ID, role: 'business', abiVersion: 'v08-business-abi/1',
      moduleSource: payloads.approval, moduleSha256: sha256Hex(payloads.approval),
      endpoint: 'business-policy', dependencies: [], provides: ['business:policy/1', 'intent:submitQuoteDecisionDynamic'],
      requires: [], optional: false,
    },
    {
      packageId: CAPABILITY_PACKAGE_ID, role: 'capability', abiVersion: 'v08-capability-abi/1',
      moduleSource: payloads.capability, moduleSha256: sha256Hex(payloads.capability),
      endpoint: 'capability-endpoint', dependencies: [], provides: ['capability:ledger/1'],
      requires: [], optional: false, capabilityId: 'ledger',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
  ];
  const entries = [...core, ...(options.extensions ?? [])];
  const subject: V10Subject = {
    formatVersion: V10_SEALED_ROOT_FORMAT,
    subjectDigest: '',
    appId: options.appId ?? 'app:v010-kext-spike',
    audience: AUDIENCE,
    runtimeAbi: V10_SELECTED_ABI,
    hostAbi: V10_HOST_ABI,
    hardBudget: options.hardBudget ?? { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
    entries,
    routes: [{ intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' }],
  };
  const digest = subjectDigestOf(subject);
  return { subject: { ...subject, subjectDigest: digest }, digest };
}

/** The subject digest binds the roster's identities, digests and bindings — never the raw bytes. */
export function subjectDigestOf(subject: V10Subject): string {
  const roster = subject.entries.map((entry) => ({
    packageId: entry.packageId,
    role: entry.role,
    abiVersion: entry.abiVersion,
    moduleSha256: entry.moduleSha256 ?? null,
    endpoint: entry.endpoint,
    dependencies: [...entry.dependencies],
    provides: [...entry.provides],
    requires: [...entry.requires],
    optional: entry.optional,
    providerId: entry.providerId ?? null,
    hookExport: entry.hookExport ?? null,
    capabilityId: entry.capabilityId ?? null,
    handlers: entry.handlers?.map((handler) => ({ ...handler })) ?? null,
  }));
  const bound = {
    formatVersion: subject.formatVersion,
    appId: subject.appId,
    audience: subject.audience,
    runtimeAbi: subject.runtimeAbi,
    hostAbi: subject.hostAbi,
    hardBudget: subject.hardBudget,
    routes: subject.routes.map((route) => ({ ...route })),
    roster,
  };
  return sha256Hex(canonicalJson(bound));
}
