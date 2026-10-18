/**
 * #1150 research harness — the v0.10 candidate loader/Host activation seam.
 *
 * Strict order of activation over the REAL selected v0.9 payload bytes plus
 * physically distinct kernel-extension ESM modules (L2 R0 §B):
 *
 *   (1) read the entire proposed subject as plain data;
 *   (2) validate descriptor shape, closed roles, provider/hook uniqueness,
 *       dependency completeness, acyclicity, required features and ABI —
 *       then re-verify EVERY selected module's bytes against its sealed
 *       SHA-256 and re-run the REAL v0.9 zero-import AST gate
 *       (assertZeroImportEsmModule) — with NO ESM evaluation anywhere;
 *   (3) only after ALL preflight passes, import the exact selected ESM in
 *       stable topological order through private per-activation `data:` URLs
 *       (fresh cache discriminators, mirroring the v0.9 protected Host);
 *   (4) check sealed exports per role (extensions export exactly their
 *       declared advisory surface);
 *   (5) initialize kernel-extensions in topological order with a bounded,
 *       data-only, port-denying advisory context; ANY late init failure
 *       (throw or contract violation) closes the facade and disposes ONLY
 *       successfully initialized modules in reverse order (durable K state
 *       is never rolled back);
 *   (6) compose the ONE K Primary facade wrapping the real v0.9
 *       createOccurrenceRuntime (lazily, exactly one factory call).
 *
 * A refusal at any step is typed (V10ActivationError) and leaves the import /
 * init / callback counters at zero for the entire closure when it happens
 * before step (3). Same-realm trusted JS is NOT treated as a sandbox; what
 * this seam proves is preflight ordering, Host-port separation and Primary
 * revalidation, not isolation from hostile JS.
 */
import { randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';

import { assertZeroImportEsmModule } from '../../../packages/domain-harness/src/host-v9/ast-gate.js';
import {
  AUDIENCE,
  V10_HOST_ABI,
  V10_KEXT_ABI,
  V10_SEALED_ROOT_FORMAT,
  V10_SELECTED_ABI,
  sha256Hex,
  type V10Subject,
  type V10SubjectEntry,
} from './v10-subject.js';
import { V10PrimaryFacade, type SelectedExtension } from './v10-kernel-primary.js';
import type { KDocumentStore } from './memory-cas-store.js';

export class V10ActivationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'V10ActivationError';
    this.code = code;
  }
}

export class V10PortDeniedError extends Error {
  readonly code = 'KEXT_PORT_DENIED';
  constructor(name: string) {
    super(`kernel-extension advisory context exposes no protected Host port '${name}'; the probe is denied`);
    this.name = 'V10PortDeniedError';
  }
}

function refuse(code: string, message: string): never {
  throw new V10ActivationError(code, message);
}

export interface V10Counters {
  importsByPackage: Record<string, number>;
  extensionImports: number;
  optionalMissing: string[];
  initCalls: string[];
  initFailures: { packageId: string; message: string }[];
  disposals: string[];
  runtimeFactoryInvocations: number;
  portProbes: { packageId: string; name: string }[];
  portDenials: number;
  activationRefusals: { code: string; message: string }[];
}

export function freshCounters(): V10Counters {
  return {
    importsByPackage: {},
    extensionImports: 0,
    optionalMissing: [],
    initCalls: [],
    initFailures: [],
    disposals: [],
    runtimeFactoryInvocations: 0,
    portProbes: [],
    portDenials: 0,
    activationRefusals: [],
  };
}

export function evalSentinels(): string[] {
  const registry = (globalThis as { __v10kextEvals?: string[] }).__v10kextEvals;
  return registry === undefined ? [] : [...registry];
}

export function clearEvalSentinels(): void {
  delete (globalThis as { __v10kextEvals?: string[] }).__v10kextEvals;
}

const PROTECTED_CONTEXT_NAMES = new Set([
  'docs', 'store', 'cas', 'sha256', 'hostPorts', 'principal', 'permit', 'resources',
  'createOccurrenceRuntime', 'effectPermit', 'interpret', 'submitOccurrence', 'openInstance',
]);

const EXTENSION_EXPORT_BASE = ['MODULE_ID', 'PACKAGE_KIND', 'EXTENSION_ABI', 'PROVIDER_ID', 'HOOK', 'init'];
const INIT_RETURN_FIELDS = new Set(['ok', 'providerId', 'hook', 'observedContext']);

type Namespace = Record<string, unknown>;

export interface ActivateOptions {
  readonly store: KDocumentStore;
  readonly tenantId?: string;
  readonly now?: () => number;
  /** Caller-owned counters: visible even when the activation refuses typed. */
  readonly counters?: V10Counters;
}

export interface Activation {
  readonly facade: V10PrimaryFacade;
  readonly counters: V10Counters;
  readonly subject: V10Subject;
  readonly digest: string;
}

/** One bounded, port-denying advisory init context for ONE extension. */
function advisoryContext(subject: V10Subject, entry: V10SubjectEntry, counters: V10Counters): Record<string, unknown> {
  const base: Record<string, unknown> = Object.freeze({
    subjectDigest: subject.subjectDigest,
    appId: subject.appId,
    audience: subject.audience,
    hostProfile: Object.freeze({ hostAbi: subject.hostAbi, runtimeAbi: subject.runtimeAbi }),
    advisoryKeys: Object.freeze([...entry.provides]),
  });
  return new Proxy(base, {
    get(target, property): unknown {
      if (typeof property !== 'string') return undefined;
      if (PROTECTED_CONTEXT_NAMES.has(property)) {
        counters.portProbes.push({ packageId: entry.packageId, name: property });
        const denied = (): never => {
          counters.portDenials += 1;
          throw new V10PortDeniedError(property);
        };
        Object.defineProperty(denied, 'get', { value: denied });
        Object.defineProperty(denied, 'put', { value: denied });
        Object.defineProperty(denied, 'call', { value: denied });
        return denied;
      }
      return target[property];
    },
  });
}

interface ImportPlan {
  readonly order: readonly V10SubjectEntry[];
  readonly extensions: readonly V10SubjectEntry[];
  readonly skippedOptional: readonly string[];
}

function planImports(subject: V10Subject): ImportPlan {
  const selected: V10SubjectEntry[] = [];
  const skippedOptional: string[] = [];
  for (const entry of subject.entries) {
    if (entry.role === 'kernel-extension' && entry.optional && entry.moduleSource === undefined) {
      skippedOptional.push(entry.packageId);
      continue;
    }
    selected.push(entry);
  }

  // Closed roles: exactly one K Primary, one Standard Primary, >=1 Business.
  const primaries = selected.filter((entry) => entry.role === 'kernel-primary');
  if (primaries.length !== 1) {
    refuse('V10_ROLE_PRIMARY_CARDINALITY', `the subject must select exactly one kernel-primary; found ${primaries.length}`);
  }
  const standards = selected.filter((entry) => entry.role === 'standard-primary');
  if (standards.length !== 1) {
    refuse('V10_ROLE_PRIMARY_CARDINALITY', `the subject must select exactly one standard-primary; found ${standards.length}`);
  }
  if (!selected.some((entry) => entry.role === 'business')) {
    refuse('V10_ROLE_PRIMARY_CARDINALITY', 'the subject must select at least one business package');
  }

  // Extension ABI and provider/hook uniqueness.
  const extensions = selected.filter((entry) => entry.role === 'kernel-extension');
  const byProvider = new Map<string, V10SubjectEntry>();
  const byHook = new Map<string, V10SubjectEntry>();
  for (const entry of extensions) {
    if (entry.abiVersion !== V10_KEXT_ABI) {
      refuse('V10_ABI_UNSUPPORTED', `kernel-extension ${entry.packageId} declares unsupported ABI ${entry.abiVersion}`);
    }
    if (typeof entry.providerId !== 'string' || entry.providerId.length === 0) {
      refuse('V10_SUBJECT_INVALID', `kernel-extension ${entry.packageId} declares no provider identity`);
    }
    if (typeof entry.hookExport !== 'string' || entry.hookExport.length === 0) {
      refuse('V10_SUBJECT_INVALID', `kernel-extension ${entry.packageId} declares no hook export`);
    }
    const hook = entry.provides[0];
    if (typeof hook !== 'string' || hook.length === 0) {
      refuse('V10_SUBJECT_INVALID', `kernel-extension ${entry.packageId} declares no advisory hook key`);
    }
    const providerOwner = byProvider.get(entry.providerId);
    if (providerOwner !== undefined) {
      refuse('V10_PROVIDER_COLLISION', `provider ${entry.providerId} is claimed by both ${providerOwner.packageId} and ${entry.packageId}`);
    }
    const hookOwner = byHook.get(hook);
    if (hookOwner !== undefined) {
      refuse('V10_PROVIDER_COLLISION', `advisory hook ${hook} is claimed by both ${hookOwner.packageId} and ${entry.packageId}`);
    }
    byProvider.set(entry.providerId, entry);
    byHook.set(hook, entry);
  }

  // Dependency completeness over the selected closure.
  const selectedIds = new Set(selected.map((entry) => entry.packageId));
  for (const entry of selected) {
    for (const dependency of entry.dependencies) {
      if (!selectedIds.has(dependency)) {
        refuse('V10_DEPENDENCY_MISSING', `${entry.packageId} declares a dependency on ${dependency} which is not part of the selected closure`);
      }
    }
  }

  // Stable topological order (cycles refuse typed). Core roles keep BUILD
  // order first; extensions follow dependency order deterministically.
  const roleRank: Record<V10SubjectEntry['role'], number> = {
    'kernel-primary': 0, 'standard-primary': 1, business: 2, capability: 3, 'kernel-extension': 4,
  };
  const order: V10SubjectEntry[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (entry: V10SubjectEntry): void => {
    const status = state.get(entry.packageId);
    if (status === 'done') return;
    if (status === 'visiting') {
      refuse('V10_DEPENDENCY_CYCLE', `the declared dependency graph reaches ${entry.packageId} twice; the closure contains a cycle`);
    }
    state.set(entry.packageId, 'visiting');
    const dependencies = entry.dependencies
      .map((id) => selected.find((candidate) => candidate.packageId === id))
      .filter((candidate): candidate is V10SubjectEntry => candidate !== undefined);
    for (const dependency of dependencies) visit(dependency);
    state.set(entry.packageId, 'done');
    order.push(entry);
  };
  for (const entry of [...selected].sort((left, right) => roleRank[left.role] - roleRank[right.role])) visit(entry);

  // Required features must be provided by the SELECTED closure only.
  const provided = new Set(selected.flatMap((entry) => [...entry.provides]));
  for (const entry of selected) {
    for (const feature of entry.requires) {
      if (!provided.has(feature)) {
        refuse('V10_FEATURE_MISSING', `${entry.packageId} requires feature ${feature} which no selected package provides`);
      }
    }
  }
  return { order, extensions, skippedOptional };
}

function privateModuleUrl(source: string, activationNonce: string, packageId: string): string {
  const bytes = Buffer.from(source, 'utf8').toString('base64');
  return `data:text/javascript;base64,${bytes}#v10-${activationNonce}-${encodeURIComponent(packageId)}`;
}

function assertPlainRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    refuse('V10_EXPORT_CONTRACT_REFUSED', `${label} must be a plain record`);
  }
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    refuse('V10_EXPORT_CONTRACT_REFUSED', `${label} must be a plain-record (data-only) value`);
  }
  return value as Record<string, unknown>;
}

export async function activateV10Subject(subject: V10Subject, options: ActivateOptions): Promise<Activation> {
  const counters = options.counters ?? freshCounters();
  try {
    // ---- (1) whole-subject shape validation, still zero imports ----
    if (subject?.formatVersion !== V10_SEALED_ROOT_FORMAT) {
      refuse('V10_SUBJECT_INVALID', `unsupported subject format ${String(subject?.formatVersion)}`);
    }
    if (subject.audience !== AUDIENCE) {
      refuse('V10_SUBJECT_INVALID', `subject audience ${subject.audience} does not match this Host audience`);
    }
    if (subject.runtimeAbi !== V10_SELECTED_ABI || subject.hostAbi !== V10_HOST_ABI) {
      refuse('V10_ABI_UNSUPPORTED', 'subject ABI bindings do not match this Host');
    }
    if (!Array.isArray(subject.entries) || subject.entries.length === 0) {
      refuse('V10_SUBJECT_INVALID', 'subject carries no package roster');
    }
    const plan = planImports(subject);
    counters.optionalMissing.push(...plan.skippedOptional);

    // ---- (2) byte + digest + zero-import AST verification, still zero imports ----
    for (const entry of plan.order) {
      if (typeof entry.moduleSource !== 'string' || entry.moduleSource.length === 0) {
        refuse('V10_SUBJECT_INVALID', `${entry.packageId} carries no sealed module bytes`);
      }
      if (typeof entry.moduleSha256 !== 'string' || entry.moduleSha256.length === 0) {
        refuse('V10_SUBJECT_INVALID', `${entry.packageId} declares no sealed module digest`);
      }
      const actual = sha256Hex(entry.moduleSource);
      if (actual !== entry.moduleSha256) {
        refuse('V10_DIGEST_MISMATCH', `module ${entry.packageId} bytes hash to ${actual} but the subject seals ${entry.moduleSha256}`);
      }
      try {
        assertZeroImportEsmModule(`${entry.packageId}/${entry.moduleSha256}`, entry.moduleSource);
      } catch (error) {
        refuse('V10_AST_GATE_REFUSED', `module ${entry.packageId} failed the v0.9 zero-import AST gate: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // ---- (3) import the exact selected ESM in stable topological order ----
    const activationNonce = randomUUID();
    const namespaces = new Map<string, Namespace>();
    for (const entry of plan.order) {
      const url = privateModuleUrl(entry.moduleSource as string, activationNonce, entry.packageId);
      const namespace = (await import(url)) as Namespace;
      if (namespace === null || typeof namespace !== 'object') {
        refuse('V10_IMPORT_EVAL_FAILED', `module ${entry.packageId} did not evaluate to a module namespace`);
      }
      namespaces.set(entry.packageId, namespace);
      counters.importsByPackage[entry.packageId] = (counters.importsByPackage[entry.packageId] ?? 0) + 1;
      if (entry.role === 'kernel-extension') counters.extensionImports += 1;
    }

    // ---- (4) sealed exports per role ----
    const kernelEntry = plan.order.find((entry) => entry.role === 'kernel-primary');
    const standardEntry = plan.order.find((entry) => entry.role === 'standard-primary');
    if (kernelEntry === undefined || standardEntry === undefined) {
      refuse('V10_SUBJECT_INVALID', 'the closure lost a closed primary role during planning');
    }
    const kernelNamespace = namespaces.get(kernelEntry.packageId) as Namespace;
    if (typeof kernelNamespace.createOccurrenceRuntime !== 'function') {
      refuse('V10_EXPORT_CONTRACT_REFUSED', `kernel-primary ${kernelEntry.packageId} does not export createOccurrenceRuntime`);
    }
    const standardNamespace = namespaces.get(standardEntry.packageId) as Namespace;
    for (const name of ['interpret', 'routeWorkflowIntent']) {
      if (typeof standardNamespace[name] !== 'function') {
        refuse('V10_EXPORT_CONTRACT_REFUSED', `standard-primary ${standardEntry.packageId} does not export ${name}`);
      }
    }
    for (const entry of plan.order) {
      if (entry.role === 'business' && typeof namespaces.get(entry.packageId)?.getPolicy !== 'function') {
        refuse('V10_EXPORT_CONTRACT_REFUSED', `business ${entry.packageId} does not export getPolicy`);
      }
      if (entry.role === 'capability') {
        for (const handler of entry.handlers ?? []) {
          if (typeof namespaces.get(entry.packageId)?.[handler.handler] !== 'function') {
            refuse('V10_EXPORT_CONTRACT_REFUSED', `capability ${entry.packageId} does not export sealed handler ${handler.handler}`);
          }
        }
      }
    }
    for (const entry of plan.extensions) {
      const namespace = namespaces.get(entry.packageId) as Namespace;
      const exported = new Set(Object.keys(namespace));
      const allowed = new Set([...EXTENSION_EXPORT_BASE, entry.hookExport as string]);
      if (typeof namespace.dispose === 'function') allowed.add('dispose');
      const unexpected = [...exported].filter((name) => !allowed.has(name));
      if (unexpected.length > 0) {
        refuse('V10_EXPORT_CONTRACT_REFUSED', `kernel-extension ${entry.packageId} exports beyond its sealed advisory surface: ${unexpected.join(', ')}`);
      }
      const missing = [...allowed].filter((name) => name !== 'dispose' && !exported.has(name));
      if (missing.length > 0) {
        refuse('V10_EXPORT_CONTRACT_REFUSED', `kernel-extension ${entry.packageId} does not export its sealed surface: ${missing.join(', ')}`);
      }
    }

    // ---- (5) bounded init of extensions; ANY late failure disposes initialized modules in reverse ----
    const initialized: SelectedExtension[] = [];
    const failActivation = (code: string, failedPackageId: string, message: string): never => {
      for (let index = initialized.length - 1; index >= 0; index -= 1) {
        const extension = initialized[index];
        counters.disposals.push(extension.packageId);
        try {
          extension.dispose?.();
        } catch {
          // Bounded best-effort teardown; the authority evidence is that no
          // further K state or protected port changed, not this call itself.
        }
      }
      counters.initFailures.push({ packageId: failedPackageId, message });
      refuse(code, message);
    };
    for (const entry of plan.extensions) {
      const namespace = namespaces.get(entry.packageId) as Namespace;
      const init = namespace.init as (context: unknown) => unknown;
      counters.initCalls.push(entry.packageId);
      let initReturn: unknown;
      try {
        initReturn = init(advisoryContext(subject, entry, counters));
      } catch (error) {
        failActivation('V10_EXTENSION_INIT_FAILED', entry.packageId, `kernel-extension ${entry.packageId} init threw: ${error instanceof Error ? error.message : String(error)}`);
      }
      const record = assertPlainRecord(initReturn, `kernel-extension ${entry.packageId} init return`);
      const fields = Object.keys(record);
      if (fields.some((field) => !INIT_RETURN_FIELDS.has(field))) {
        // A forged createOccurrenceRuntime / effectPermit / principal rides
        // exactly here: authority-shaped caller data is refused typed, never
        // interpreted.
        failActivation('V10_INIT_CONTRACT_REFUSED', entry.packageId, `kernel-extension ${entry.packageId} init return carries non-contract fields: ${fields.join(', ')}`);
      }
      const declaredHook = entry.provides[0];
      if (record.ok !== true || record.providerId !== entry.providerId || record.hook !== declaredHook) {
        failActivation('V10_INIT_CONTRACT_REFUSED', entry.packageId, `kernel-extension ${entry.packageId} init return does not confirm its sealed provider/hook identity`);
      }
      initialized.push({
        packageId: entry.packageId,
        providerId: entry.providerId as string,
        hook: declaredHook,
        hookFn: namespace[entry.hookExport as string] as (...args: unknown[]) => unknown,
        dispose: typeof namespace.dispose === 'function' ? (namespace.dispose as () => void) : undefined,
      });
    }

    // ---- (6) compose the ONE K Primary facade over the real v0.9 kernel ----
    const facade = new V10PrimaryFacade({
      subject,
      namespaces,
      kernelEntry,
      standardEntry,
      extensions: initialized,
      store: options.store,
      tenantId: options.tenantId ?? 'tenant:spike',
      now: options.now ?? (() => 0),
      counters,
    });
    return { facade, counters, subject, digest: subject.subjectDigest };
  } catch (error) {
    if (error instanceof V10ActivationError) {
      counters.activationRefusals.push({ code: error.code, message: error.message });
    }
    throw error;
  }
}
