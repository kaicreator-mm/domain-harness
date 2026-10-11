/**
 * Minimal microkernel — `DomainHarness.load(package)` scoped facade (T-B, #1001).
 * ================================================================================
 *
 * Selective production port of the pinned research loader #994@b9ea4d1
 * (src/microkernel/contracts.mjs `assertPlainJsonIntent` + src/microkernel/load.mjs
 * endpoint wiring and UX transport), with the research defects the task DAG
 * pinpoints FIXED:
 *
 *   - P1-L2-ABI-02: the research `load(packageRoot, options={})` read
 *     caller-provided `options.hostPorts`. The production loader is STRICTLY
 *     one-argument — there is no options overload and no caller-injected
 *     Host port; the kernel Host binding comes only from the protected
 *     internal channel (kernel-host.ts) and fails closed when absent.
 *   - Module activation goes ONLY through the merged qualified load() path
 *     (./load.js: static qualification → fail-closed issuer trust gate →
 *     whole-closure byte preflight → physical import → module
 *     self-identity). This file never imports sealed module bytes itself,
 *     never constructs `data:` URLs and never decodes base64 payload bytes.
 *   - The scoped facade exposes EXACTLY send/query/subscribe/stop. The
 *     research surface's `kernelRuntime` accessor, raw journal query,
 *     mechanism-internals query and Host ports are absent; `query` refuses
 *     those kinds typed.
 *
 * What this loader deliberately does NOT contain (KPK-02/03/10/12 heritage):
 * no v0.7 engine import or re-implementation — the physically selected
 * Kernel package owns the entire mechanism; no business special case; no
 * provider discovery or fallback; no runtime recompilation; no second
 * effect runtime (journals/effects exist only inside the wired Kernel).
 */

import { QualifiedPackageError } from './contracts.js';
import { currentKernelHostPorts, type V8KernelHostPorts } from './kernel-host.js';
import { load } from './load.js';
import type { QualifiedIntentBinding, QualifiedRoleBinding, SealedQualifiedPackageRoot } from './contracts.js';

/** The scoped consumption facade returned by `DomainHarness.load(package)`. */
export interface V8DomainFacade {
  /** Submit one occurrence intent through the wired Kernel mechanism. */
  send(intent: unknown): Promise<unknown>;
  /** Scoped queries: `{kind:'instance'}` and `{kind:'build'}` only. */
  query(query: unknown): Promise<unknown>;
  /** Observe receipts; returns the unsubscribe function. */
  subscribe(observer: (receipt: unknown) => void): () => boolean;
  /** Stop the facade scope: observers cleared, further use fails typed. */
  stop(): void;
}

/** The shape of the wired Kernel mechanism the transport scope consumes. */
interface WiredKernelRuntime {
  submitOccurrence(intent: unknown): unknown;
  getSnapshot(target: unknown): unknown;
}

/**
 * The generic mechanism-construction contract the loader wires (ported from
 * #994@b9ea4d1 load.mjs): the Kernel package's `createOccurrenceRuntime`
 * receives every resolved endpoint plus the protected Host ports. The
 * mechanism semantics themselves are the Kernel package's own (T-C).
 */
type KernelRuntimeFactory = (deps: {
  readonly moduleIdentity: { readonly packageId: string; readonly moduleSha256: string };
  readonly hostPorts: V8KernelHostPorts;
  readonly sdkEndpoint: { readonly packageId: string; readonly interpret: (input: unknown) => unknown };
  readonly businessEndpoint: object;
  readonly observe: (receipt: unknown) => void;
}) => unknown;

function typedError(code: string, message: string): QualifiedPackageError {
  return new QualifiedPackageError(code, message);
}

/**
 * Structurally validate ONE generic intent (ported from #994@b9ea4d1
 * contracts.mjs): JSON-only, no functions/symbols/handles — intents are
 * data and can never carry ports or callables across the transport scope.
 */
function assertPlainJsonIntent(intent: unknown): void {
  const stack: [string, unknown][] = [['$intent', intent]];
  for (let cursor = stack.pop(); cursor !== undefined; cursor = stack.pop()) {
    const [path, value] = cursor;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') continue;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw typedError('INTENT_NOT_JSON', `${path} contains a non-finite number`);
      }
      continue;
    }
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
      throw typedError('INTENT_NOT_JSON', `${path} carries a non-JSON ${typeof value}; intents are data only and can never carry handles, ports or callables`);
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => stack.push([`${path}[${index}]`, item]));
      continue;
    }
    if (typeof value !== 'object') {
      throw typedError('INTENT_NOT_JSON', `${path} carries unsupported ${typeof value}`);
    }
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (prototype !== Object.prototype && prototype !== null) {
      throw typedError('INTENT_NOT_JSON', `${path} must be a plain JSON object`);
    }
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      stack.push([`${path}.${key}`, record[key]]);
    }
  }
}

function requireTarget(target: unknown): void {
  const record = target as { workflowId?: unknown; instanceKey?: unknown } | null;
  if (
    typeof target !== 'object'
    || target === null
    || typeof record?.workflowId !== 'string'
    || record.workflowId.length === 0
    || typeof record?.instanceKey !== 'string'
    || record.instanceKey.length === 0
  ) {
    throw typedError('TARGET_MALFORMED', 'target must be {workflowId, instanceKey} non-empty strings');
  }
}

function requireRoleBinding(bindings: readonly SealedQualifiedPackageRoot['bindings'][number][], role: 'kernel' | 'standard-sdk' | 'business'): QualifiedRoleBinding {
  const binding = bindings.find((candidate): candidate is QualifiedRoleBinding => candidate.role === role);
  // Unreachable after assertQualifiedRoot (exactly-one K/S, >=1 B), but a
  // typed internal-invariant failure beats an untyped undefined deref.
  if (binding === undefined) {
    throw typedError('LOAD_ROLE_BINDING_INVALID', `sealed closure carries no ${role} role binding`);
  }
  return binding;
}


/**
 * `DomainHarness.load(package)` — the minimal microkernel consumption
 * abstraction (T-B, #1001). Exactly ONE argument: the sealed qualified
 * package root produced by `@kaicreator/domain-harness-compiler` BUILD plus
 * an externally issued approval proof.
 *
 * Every module activation happens inside the qualified load() path below —
 * static qualification, the fail-closed issuer trust gate (UNTRUSTED_ISSUER
 * / FORGED_ATTESTATION refuse EVERY import in a process without an
 * established trust channel) and the whole-closure byte preflight all run
 * BEFORE the first executable byte of any package. This loader then wires
 * the already-installed module namespaces (kernel mechanism, standard-sdk
 * rule interpreter, business policy) together through the kernel's own
 * `createOccurrenceRuntime` and returns the scoped facade.
 *
 * Activation is ordered so a wiring failure leaves the LEAST possible
 * residue: endpoint type checks and business policy resolution run BEFORE
 * the kernel mechanism is constructed; on any failure no facade escapes,
 * no observer is registered and the kernel mechanism has produced no
 * side effect. Residual scope honestly documented (same JS semantics as
 * the installer): packages whose module top level already evaluated during
 * the qualified install cannot be un-evaluated; the loader guarantees only
 * that nothing of ITS OWN (facade, observers, mechanism construction)
 * outlives a failed activation.
 */
async function loadScopedFacade(packageRoot: unknown): Promise<V8DomainFacade> {
  if (arguments.length !== 1) {
    throw typedError(
      'LOAD_ARITY_INVALID',
      'load accepts exactly one argument: the sealed qualified package root; there is no options overload and no caller-injectable Host port (P1-L2-ABI-02)',
    );
  }
  // Kernel Host binding: protected internal channel ONLY (never a load
  // argument). Fail-closed before anything else.
  const hostPorts: V8KernelHostPorts = currentKernelHostPorts();

  // THE qualified load path — qualification, trust gate, whole-closure
  // preflight and every physical import happen here and nowhere else.
  const loaded = await load(packageRoot);

  const bindings = loaded.bindings;
  const kernelBinding = requireRoleBinding(bindings, 'kernel');
  const sdkBinding = requireRoleBinding(bindings, 'standard-sdk');
  const businessBinding = requireRoleBinding(bindings, 'business');

  const kernelNamespace = loaded.getModuleNamespace(kernelBinding.packageId);
  const sdkNamespace = loaded.getModuleNamespace(sdkBinding.packageId);
  const businessNamespace = loaded.getModuleNamespace(businessBinding.packageId);

  // ---- Endpoint wiring validation (before ANY mechanism construction) ----
  // Runtime shape first (typed), precise casts second: the module namespaces
  // are unknown records; the loader never calls a bare Function type.
  if (typeof kernelNamespace.createOccurrenceRuntime !== 'function') {
    throw typedError('ENDPOINT_INVALID', `kernel package ${kernelBinding.packageId} does not provide a callable occurrence-runtime endpoint`);
  }
  if (typeof sdkNamespace.interpret !== 'function') {
    throw typedError('ENDPOINT_INVALID', `standard-sdk package ${sdkBinding.packageId} does not provide a callable rule-interpreter endpoint`);
  }
  if (typeof businessNamespace.getPolicy !== 'function') {
    throw typedError('ENDPOINT_INVALID', `business package ${businessBinding.packageId} does not provide a callable business-policy endpoint`);
  }
  const createOccurrenceRuntime = kernelNamespace.createOccurrenceRuntime as KernelRuntimeFactory;
  const interpret = sdkNamespace.interpret as (input: unknown) => unknown;
  const getPolicy = businessNamespace.getPolicy as () => unknown;

  // Business policy resolution precedes kernel construction: a policy that
  // throws or returns a non-object fails typed with the mechanism still inert.
  let businessPolicy: object;
  try {
    businessPolicy = getPolicy() as object;
  } catch (error) {
    throw typedError('ACTIVATION_FAILED', `business package ${businessBinding.packageId} policy activation failed: ${String((error as Error)?.message ?? error)}`);
  }
  if (businessPolicy === null || typeof businessPolicy !== 'object') {
    throw typedError('ACTIVATION_FAILED', `business package ${businessBinding.packageId} policy activation did not resolve to an object`);
  }

  const kernelProvenance = loaded.installedPackages.find((pkg) => pkg.packageId === kernelBinding.packageId);
  // Unreachable after the qualified install (every bound package is
  // installed), but the mechanism identity is never silently empty.
  if (kernelProvenance === undefined) {
    throw typedError('LOAD_ROLE_BINDING_INVALID', `kernel package ${kernelBinding.packageId} is bound but not installed in this closure`);
  }
  const moduleIdentity = {
    packageId: kernelBinding.packageId,
    moduleSha256: kernelProvenance.moduleSha256,
  };

  const observers = new Set<(receipt: unknown) => void>();

  // ---- Kernel mechanism construction (LAST; kernel-owned side effects
  // exist only from this point on, and only behind the verified gate). ----
  let kernelCandidate: unknown;
  try {
    kernelCandidate = createOccurrenceRuntime({
      moduleIdentity,
      hostPorts,
      sdkEndpoint: { packageId: sdkBinding.packageId, interpret },
      businessEndpoint: businessPolicy,
      observe: (receipt: unknown) => {
        for (const observer of observers) {
          try {
            observer(receipt);
          } catch {
            // An observer failure never mutates the authoritative occurrence.
          }
        }
      },
    });
  } catch (error) {
    throw typedError('ACTIVATION_FAILED', `kernel package ${kernelBinding.packageId} mechanism activation failed: ${String((error as Error)?.message ?? error)}`);
  }
  if (
    typeof kernelCandidate !== 'object'
    || kernelCandidate === null
    || typeof (kernelCandidate as WiredKernelRuntime).submitOccurrence !== 'function'
    || typeof (kernelCandidate as WiredKernelRuntime).getSnapshot !== 'function'
  ) {
    throw typedError('KERNEL_RUNTIME_INVALID', `kernel package ${kernelBinding.packageId} did not activate a mechanism with submitOccurrence/getSnapshot`);
  }
  const kernelRuntime = kernelCandidate as WiredKernelRuntime;

  // The sealed intent index IS the fixed closure: send() performs no
  // provider discovery and never falls back (KPK-03 heritage).
  const intentIndex = new Map(
    bindings
      .filter((binding): binding is QualifiedIntentBinding => binding.role === 'intent')
      .map((binding) => [binding.intentType, binding]),
  );

  let stopped = false;
  function assertOpen(): void {
    if (stopped) {
      throw typedError('FACADE_STOPPED', 'this facade scope is stopped; load the package again for a fresh scope');
    }
  }

  function buildTrace(): unknown {
    return Object.freeze({
      root: Object.freeze({
        rootPackageId: loaded.rootPackageId,
        build: loaded.build,
        closureDigest: loaded.build.closureDigest,
      }),
      packages: Object.freeze(
        loaded.installedPackages.map((pkg) =>
          Object.freeze({
            packageId: pkg.packageId,
            kind: pkg.kind,
            abiVersion: pkg.abiVersion,
            moduleSha256: pkg.moduleSha256,
            moduleId: loaded.getModuleNamespace(pkg.packageId).MODULE_ID,
            endpoints: pkg.endpoints,
          }),
        ),
      ),
    });
  }

  async function send(intent: unknown): Promise<unknown> {
    assertOpen();
    assertPlainJsonIntent(intent);
    const record = intent as { intentType?: unknown; target?: unknown; messageId?: unknown };
    if (typeof record.intentType !== 'string' || record.intentType.length === 0) {
      throw typedError('INTENT_MALFORMED', 'intent.intentType must be a non-empty string');
    }
    if (!intentIndex.has(record.intentType)) {
      throw typedError(
        'INTENT_UNBOUND',
        `intent type ${record.intentType} is not bound in this sealed package closure; no provider discovery or fallback exists at runtime`,
      );
    }
    requireTarget(record.target);
    if (typeof record.messageId !== 'string' || record.messageId.length === 0) {
      throw typedError('INTENT_MALFORMED', 'intent.messageId must be a non-empty string');
    }
    return kernelRuntime.submitOccurrence(intent);
  }

  async function query(query: unknown): Promise<unknown> {
    assertOpen();
    assertPlainJsonIntent(query);
    const record = query as { kind?: unknown; target?: unknown };
    switch (record.kind) {
      case 'instance':
        requireTarget(record.target);
        return kernelRuntime.getSnapshot(record.target);
      case 'build':
        return buildTrace();
      case 'journal':
      case 'mechanism':
      case 'counters':
        // Raw journal, kernel-mechanism internals and mechanism counters are
        // deliberately NOT on the scoped public surface (task #1001: no raw
        // Kernel accessor, no raw Journal).
        throw typedError('QUERY_KIND_REFUSED', `query kind ${String(record.kind)} is not part of the scoped public facade`);
      default:
        throw typedError('QUERY_KIND_UNKNOWN', `query kind ${String(record.kind)} is not a transport query`);
    }
  }

  function subscribe(observer: (receipt: unknown) => void): () => boolean {
    assertOpen();
    if (typeof observer !== 'function') {
      throw typedError('OBSERVER_INVALID', 'subscribe requires a listener function');
    }
    observers.add(observer);
    return () => observers.delete(observer);
  }

  function stop(): void {
    stopped = true;
    observers.clear();
  }

  const facade: V8DomainFacade = Object.freeze({ send, query, subscribe, stop });
  return facade;
}

/**
 * Public consumption brand (#994 heritage): `const facade =
 * await DomainHarness.load(package)`. The brand object is frozen and its
 * loader is the strictly one-argument scoped-facade loader above — the
 * qualified installation proof surface (`load`, T-A) and this consumption
 * entry are distinct public symbols of the `/v8` subpath.
 */
export const DomainHarness: Readonly<{ readonly load: (packageRoot: unknown) => Promise<V8DomainFacade> }> = Object.freeze({
  load: loadScopedFacade,
});
