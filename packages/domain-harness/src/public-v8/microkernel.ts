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
import { currentHostModelPort } from './model-port.js';
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

/**
 * The Host-verified principal the private gateway seam binds into Kernel
 * requests (#1013, I02). Every field originates from an issuer-signed
 * credential verified by the trusted Host — a caller-declared `caller.role`
 * can never construct one of these.
 */
export interface V8GatewayPrincipal {
  readonly subject: string;
  readonly tenantId: string;
  readonly appId: string;
  readonly roles: readonly string[];
}

/**
 * Private, Host-gateway-only Kernel operations on a loaded facade
 * (#1013, I02/I03). NOT re-exported from the public `/v8` surface: the UX
 * consumer never sees this object; the trusted Host kernel gateway
 * (host-v8/kernel-gateway.ts) retrieves it right after the public one-arg
 * `DomainHarness.load(package)` and binds an AUTHENTICATED principal to
 * every Kernel request. There is no raw Kernel namespace, no raw Journal
 * and no generic second Runtime on this seam.
 *
 * #1013 review repair (@6117218727 Candidate A): every physical Kernel
 * instance address is QUALIFIED by the authenticated principal's
 * tenant/app — `${tenantId}:${appId}:${instanceKey}` — so two distinct
 * tenants addressing the same appId/instanceKey resolve to two DISTINCT
 * physical Kernel instances (state, Journal, effects and receipts are
 * namespace-isolated by construction, never by caller discipline).
 */
export interface V8FacadeKernelOps {
  /** Identity of the loaded Business policy (routing/provisioning metadata). */
  describePolicy(): {
    readonly packageId: string;
    readonly policyId: string;
    readonly workflowKey: string;
    readonly intentTypes: readonly string[];
  };
  /**
   * Submit one occurrence as the H-authenticated principal. The caller
   * record bound into the Kernel request is derived ONLY from the
   * issuer-signed roles ∩ the sealed Business binding roles; intent data
   * cannot carry a caller. The physical instance address is the
   * tenant/app-qualified key of the authenticated principal.
   */
  submitAs(principal: V8GatewayPrincipal, request: {
    readonly intentType: string;
    readonly messageId: string;
    readonly instanceKey: string;
    readonly input?: unknown;
  }): Promise<unknown>;
  /** Scoped instance read for the authenticated principal's tenant/app. */
  queryInstance(principal: V8GatewayPrincipal, instanceKey: string): Promise<unknown>;
  /**
   * The physical Kernel `workflowInstanceId` the tenant/app-qualified
   * address resolves to (`${workflowKey}:${tenantId}:${appId}:${key}`) —
   * the single source of the receipt-filter address shared by send,
   * Genesis and subscriptions.
   */
  workflowInstanceId(principal: V8GatewayPrincipal, instanceKey: string): string;
  /**
   * Observe Kernel receipts for this scope (trusted gateway use; the
   * public facade `subscribe` is closed — #1013 @6117218727 Candidate B).
   * Returns the unsubscribe function.
   */
  observeReceipts(observer: (receipt: unknown) => void): () => boolean;
  /**
   * Protected Genesis activation (#1013, I03): open the FIRST instance of
   * the loaded Business package at the authenticated principal's
   * tenant/app-qualified address. The initial state/context are owned by
   * the sealed Business policy — the request cannot choose initial
   * authority or state, and no raw `openInstance` handle escapes.
   */
  provisionGenesis(principal: V8GatewayPrincipal, request: {
    readonly instanceKey: string;
    readonly correlationId?: string;
  }): Promise<unknown>;
}

/** The shape of the wired Kernel mechanism the transport scope consumes. */
interface WiredKernelRuntime {
  submitOccurrence(intent: unknown): unknown;
  getSnapshot(target: unknown): unknown;
  /** Present on the selected Kernel mechanism (T-C); required only for Genesis. */
  openInstance?(request: unknown): unknown;
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
  /**
   * The rule-interpretation endpoint. Per the recorded ABI ruling
   * (#1013@6118426531, R1 F-03) the Kernel awaits the returned value: a
   * synchronous model-free resolution (plain value) and an async
   * Host-bound model resolution (Promise) both flow through unchanged.
   */
  readonly sdkEndpoint: { readonly packageId: string; readonly interpret: (declaration: unknown, input: unknown, context: unknown) => unknown };
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
  // argument). Fail-closed before anything else. The read carries this
  // module's gateway session capability (#1013 R2 @5494026032): the trusted
  // bootstrap installs the SAME unguessable value into the gateway channel
  // here and into the kernel Host ports channel, so the public one-arg load
  // keeps working while an uncredentialed deep importer of kernel-host.js is
  // refused at the getter before any port escapes.
  const hostPorts: V8KernelHostPorts = currentKernelHostPorts(gatewaySessionCap);

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
  const getPolicy = businessNamespace.getPolicy as () => unknown;

  // ---- FR08 (#1013, I04 + R1 F-03 / ABI ruling #1013@6118426531): trusted
  // ModelPort binding, protected channel ONLY. When this process bootstrapped
  // a Host ModelPort and the qualified Standard SDK exposes the host-bound
  // resolver factory, the endpoint handed to the Kernel is a COMPOSITE that
  // dispatches ONLY on the SEALED business rule declaration: a
  // `model-decision` rule routes through the resolver's real async
  // port-invoking endpoint (`invokeDecision` — the Kernel awaits the result
  // per the recorded ABI ruling), every other declared kind stays on the
  // resolver's model-free wrapper (honest `measured(0)` scoped to bound-port
  // invocations). Caller input/context never selects the path. Without an
  // installed port the plain `interpret` stays wired and evidence remains
  // `unsupported`/`unmeasured` — there is no synthetic measured zero and no
  // caller-supplied port anywhere. The read carries this module's gateway
  // session capability (#1013 R2 @5494026032): the same unguessable value
  // the bootstrap installed with the port, so the trusted load path keeps
  // working while an uncredentialed deep importer of model-port.js is
  // refused at the getter before the frozen {invoke} object can be reached.
  const modelPort = currentHostModelPort(gatewaySessionCap);
  const resolverFactory = sdkNamespace.createHostBoundModelResolver;
  const interpret = (
    modelPort !== undefined && typeof resolverFactory === 'function'
      ? (() => {
          const factory = resolverFactory as (port: unknown) => {
            interpret: (declaration: unknown, input: unknown, context: unknown) => unknown;
            invokeDecision: (declaration: unknown, input: unknown, context: unknown) => unknown;
          };
          let bound: ReturnType<typeof factory>;
          try {
            bound = factory(modelPort);
          } catch (error) {
            throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} host-bound model resolver activation failed: ${String((error as Error)?.message ?? error)}`);
          }
          if (
            typeof bound !== 'object'
            || bound === null
            || typeof bound.interpret !== 'function'
            || typeof bound.invokeDecision !== 'function'
          ) {
            // R1 F-03 stale/failed-bind negative: a factory that does not
            // expose the real port-invoking endpoint is not a usable
            // production binding — refuse typed, never degrade silently.
            throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} host-bound model resolver exposes no callable interpret/invokeDecision pair (stale or failed bind)`);
          }
          return (declaration: unknown, input: unknown, context: unknown): unknown => {
            const kind = (declaration as { kind?: unknown } | null | undefined)?.kind;
            return kind === 'model-decision'
              ? bound.invokeDecision(declaration, input, context)
              : bound.interpret(declaration, input, context);
          };
        })()
      : (sdkNamespace.interpret as (declaration: unknown, input: unknown, context: unknown) => unknown)
  );

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

  /**
   * #1013 review repair (@6117218727 Candidate B): the PUBLIC facade verbs
   * are CLOSED for authority-carrying routes. `send`, `instance` reads and
   * receipt observation have no authentication channel at this surface —
   * an unauthenticated in-process caller (including one holding a sealed
   * root after a trusted Host bootstrap) must never mutate Kernel state,
   * read instance data or observe receipts. Every such operation goes
   * through the Host-authenticated kernel gateway seam
   * (`getFacadeKernelOps`, trusted Host context only). The inert `build`
   * trace stays public: it restates sealed-root metadata the caller
   * already supplied and reads no Kernel state.
   */
  function refusePublicRoute(verb: string): QualifiedPackageError {
    return typedError(
      'FACADE_PUBLIC_ROUTE_CLOSED',
      `the public facade ${verb} route is closed (#1013): mutations, instance reads and receipt observation require the Host-authenticated kernel gateway; DomainHarness.load stays the one-argument public entry`,
    );
  }

  async function send(intent: unknown): Promise<unknown> {
    assertOpen();
    assertPlainJsonIntent(intent);
    const record = intent as { intentType?: unknown; target?: unknown; messageId?: unknown; caller?: unknown };
    if (typeof record.intentType !== 'string' || record.intentType.length === 0) {
      throw typedError('INTENT_MALFORMED', 'intent.intentType must be a non-empty string');
    }
    if (record.caller !== undefined) {
      // #1013 I02: a caller-declared `caller` is user data and can never
      // carry authority. The public route refuses it outright; the only
      // route that binds a caller is the Host gateway's authenticated seam.
      throw typedError(
        'INTENT_CALLER_FORBIDDEN',
        'intent.caller is caller-declared data and can never carry authority; submit through the Host-authenticated kernel gateway which binds the verified principal',
      );
    }
    // The no-caller variant would reach the Kernel as the implicit
    // 'anonymous' caller — an unauthenticated mutation. Closed alike.
    throw refusePublicRoute('send');
  }

  async function query(query: unknown): Promise<unknown> {
    assertOpen();
    assertPlainJsonIntent(query);
    const record = query as { kind?: unknown; target?: unknown };
    switch (record.kind) {
      case 'instance':
        // Unauthenticated instance reads are closed with the send route.
        throw refusePublicRoute('query instance');
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
    // Receipt observation without an authenticated principal would leak
    // occurrence facts to any in-process holder of the facade. Closed.
    throw refusePublicRoute('subscribe');
  }

  function stop(): void {
    stopped = true;
    observers.clear();
  }

  // ---- #1013 private gateway seam (I02/I03), module-private WeakMap ----
  // The UX consumer receives ONLY the frozen facade above; the trusted Host
  // kernel gateway retrieves the ops below through getFacadeKernelOps()
  // (never exported from the public /v8 index) to bind an H-authenticated
  // principal to Kernel requests and to run the protected Genesis path.
  const policyRecord = businessPolicy as Record<string, unknown>;

  function resolveWorkflowKey(): string {
    const definition = policyRecord.workflowDefinition as { workflowKey?: unknown } | null | undefined;
    const key = definition === null || typeof definition !== 'object' ? undefined : definition.workflowKey;
    if (typeof key !== 'string' || key.length === 0 || key.includes(':')) {
      throw typedError(
        'POLICY_ADDRESSING_INVALID',
        `business package ${businessBinding.packageId} policy must declare a non-empty ':'-free workflowDefinition.workflowKey for gateway instance addressing`,
      );
    }
    return key;
  }

  function resolveIntentRoles(intentType: string): readonly string[] | undefined {
    const bindings = policyRecord.intentBindings as Record<string, { roles?: unknown }> | null | undefined;
    if (bindings === null || typeof bindings !== 'object') return undefined;
    const binding = Object.prototype.hasOwnProperty.call(bindings, intentType) ? bindings[intentType] : undefined;
    if (binding === null || typeof binding !== 'object') return undefined;
    return Array.isArray(binding.roles) ? (binding.roles as readonly string[]) : undefined;
  }

  /**
   * The ONLY caller derivation on this path: an issuer-signed principal role
   * that the sealed Business binding itself admits. Mirrors the Kernel's own
   * gate (deny when `binding.roles` is an array that excludes the caller) so
   * the Host-side pick and the Kernel-side check can never disagree.
   */
  function requirePrincipalRole(principal: V8GatewayPrincipal, intentType: string): string {
    const roles = resolveIntentRoles(intentType);
    if (roles === undefined) return 'anonymous';
    const granted = principal.roles.find((role) => roles.includes(role));
    if (granted === undefined) {
      throw typedError(
        'PRINCIPAL_ROLE_NOT_BOUND',
        `authenticated principal (subject ${principal.subject}, roles [${principal.roles.join(', ')}]) holds none of the Business-bound roles [${roles.join(', ')}] required by intent ${intentType}`,
      );
    }
    return granted;
  }

  function requireInstanceKey(instanceKey: unknown): string {
    if (typeof instanceKey !== 'string' || instanceKey.length === 0 || instanceKey.includes(':')) {
      throw typedError('INSTANCE_KEY_INVALID', 'instanceKey must be a non-empty string without the addressing delimiter \':\'');
    }
    return instanceKey;
  }

  function requirePrincipal(principal: V8GatewayPrincipal): void {
    if (
      typeof principal !== 'object'
      || principal === null
      || typeof principal.subject !== 'string'
      || principal.subject.length === 0
      || typeof principal.tenantId !== 'string'
      || principal.tenantId.length === 0
      || principal.tenantId.includes(':')
      || typeof principal.appId !== 'string'
      || principal.appId.length === 0
      || principal.appId.includes(':')
      || !Array.isArray(principal.roles)
      || !principal.roles.every((role) => typeof role === 'string' && role.length > 0)
    ) {
      throw typedError('PRINCIPAL_INVALID', 'the gateway principal must carry the H-verified subject/tenant/app and issuer-signed roles (tenant/app without the \':\' delimiter)');
    }
  }

  /**
   * The Host-derived, collision-free physical instance address: the
   * authenticated principal's tenant/app qualify the caller-chosen key
   * (#1013 @6117218727 Candidate A repair). All three components are
   * ':'-free (credentials at identity shape check, registerApp at the
   * gateway, requireInstanceKey here), so the join is unambiguous and two
   * distinct tenants can never resolve to the same physical Kernel
   * instance regardless of appId/instanceKey reuse. The namespace identity
   * is derived ONLY from the VERIFIED principal — never caller-provided.
   */
  function qualifiedInstanceKey(principal: V8GatewayPrincipal, instanceKey: string): string {
    return `${principal.tenantId}:${principal.appId}:${instanceKey}`;
  }

  const gatewayOps: V8FacadeKernelOps = {
    describePolicy(): { packageId: string; policyId: string; workflowKey: string; intentTypes: readonly string[] } {
      assertOpen();
      return Object.freeze({
        packageId: typeof policyRecord.packageId === 'string' ? policyRecord.packageId : businessBinding.packageId,
        policyId: typeof policyRecord.policyId === 'string' ? policyRecord.policyId : businessBinding.packageId,
        workflowKey: resolveWorkflowKey(),
        intentTypes: Object.freeze([...intentIndex.keys()]),
      });
    },
    async submitAs(principal: V8GatewayPrincipal, request: {
      readonly intentType: string;
      readonly messageId: string;
      readonly instanceKey: string;
      readonly input?: unknown;
    }): Promise<unknown> {
      assertOpen();
      requirePrincipal(principal);
      const { intentType, messageId, instanceKey } = request;
      if (typeof intentType !== 'string' || intentType.length === 0) {
        throw typedError('INTENT_MALFORMED', 'intent.intentType must be a non-empty string');
      }
      if (typeof messageId !== 'string' || messageId.length === 0) {
        throw typedError('INTENT_MALFORMED', 'intent.messageId must be a non-empty string');
      }
      if (!intentIndex.has(intentType)) {
        throw typedError('INTENT_UNBOUND', `intent type ${intentType} is not bound in this sealed package closure; no provider discovery or fallback exists at runtime`);
      }
      const key = requireInstanceKey(instanceKey);
      const role = requirePrincipalRole(principal, intentType);
      // The Kernel request is CONSTRUCTED here — intent data never carries a
      // caller; the verified principal is the only authority source, and the
      // physical instance address is the principal's tenant/app-qualified
      // key (two tenants reusing the same appId/instanceKey are two distinct
      // physical instances — never shared state, Journal or effects).
      const kernelRequest = {
        intentType,
        messageId,
        input: request.input === undefined ? null : request.input,
        target: { workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) },
        caller: { role, subject: principal.subject, tenantId: principal.tenantId, appId: principal.appId },
      };
      assertPlainJsonIntent(kernelRequest);
      return kernelRuntime.submitOccurrence(kernelRequest);
    },
    async queryInstance(principal: V8GatewayPrincipal, instanceKey: string): Promise<unknown> {
      assertOpen();
      requirePrincipal(principal);
      const key = requireInstanceKey(instanceKey);
      return kernelRuntime.getSnapshot({ workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) });
    },
    workflowInstanceId(principal: V8GatewayPrincipal, instanceKey: string): string {
      requirePrincipal(principal);
      const key = requireInstanceKey(instanceKey);
      return `${resolveWorkflowKey()}:${qualifiedInstanceKey(principal, key)}`;
    },
    observeReceipts(observer: (receipt: unknown) => void): () => boolean {
      assertOpen();
      if (typeof observer !== 'function') {
        throw typedError('OBSERVER_INVALID', 'a Kernel receipt observer must be a function');
      }
      observers.add(observer);
      return () => observers.delete(observer);
    },
    async provisionGenesis(principal: V8GatewayPrincipal, request: { readonly instanceKey: string; readonly correlationId?: string }): Promise<unknown> {
      assertOpen();
      requirePrincipal(principal);
      const key = requireInstanceKey(request.instanceKey);
      const runtimeWithOpener = kernelRuntime as WiredKernelRuntime & { openInstance: (request: unknown) => unknown };
      if (typeof runtimeWithOpener.openInstance !== 'function') {
        throw typedError('GENESIS_ENDPOINT_INVALID', `kernel package ${kernelBinding.packageId} mechanism exposes no instance-open endpoint; protected Genesis provisioning is unavailable for this closure`);
      }
      // I03: the initial state/context are the sealed Business policy's own
      // (the Kernel reads initialStateKey/initialContext from the policy) —
      // this seam deliberately forwards NO caller-chosen initial context,
      // and the instance address is the principal's tenant/app-qualified
      // key (per-tenant Genesis by construction).
      return runtimeWithOpener.openInstance({
        target: { workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) },
        ...(request.correlationId === undefined ? {} : { correlationId: request.correlationId }),
      });
    },
  };

  const facade: V8DomainFacade = Object.freeze({ send, query, subscribe, stop });
  facadeScopes.set(facade, Object.freeze(gatewayOps));
  return facade;
}

/**
 * Module-private registry of the gateway ops bound to each facade this
 * loader produced. Not exported from the public `/v8` index.
 */
const facadeScopes = new WeakMap<object, V8FacadeKernelOps>();

/**
 * #1013 R2 repair (@6122817203): the gateway ops session capability channel.
 * The packed npm distribution ships this module's compiled sibling next to
 * the public entry, and stock Node resolves an absolute `file:` URL past any
 * package-exports map — so "not re-exported" alone is NOT an enforceable
 * boundary for an uncredentialed same-process consumer. The ops seam is
 * therefore gated by a one-shot, host-generated unguessable session
 * capability installed ONLY by `bootstrapTrustedHost` (which hands it to the
 * trusted Host kernel gateway and to nobody else): without the exact
 * capability, `getFacadeKernelOps` refuses typed before the WeakMap is ever
 * consulted, and forging a `V8GatewayPrincipal` (structural check only) can
 * never reach the Kernel. A deep import of this module yields functions, not
 * authority. Mirrors the one-shot channel pattern of trust.ts/kernel-host.ts
 * /model-port.ts: first installation wins, and a bootstrap whose session
 * channel is already occupied refuses with zero residue.
 */
let gatewaySessionCap: string | undefined;

/**
 * Validate the gateway session channel WITHOUT consuming it (#1013 R2): the
 * Host bootstrap preflights this channel alongside every other one-shot
 * channel before committing any installation. Internal protected.
 */
export function preflightGatewaySessionCap(): void {
  if (gatewaySessionCap !== undefined) {
    throw typedError(
      'GATEWAY_SESSION_ALREADY_INSTALLED',
      'a gateway session capability is already installed in this process; the protected gateway ops seam is one-shot',
    );
  }
}

/**
 * Install the gateway session capability for this process. Internal
 * protected bootstrap (`bootstrapTrustedHost` only): one-shot, and the
 * capability value must be an unguessable host-generated string so a
 * consumer can never brute-force or guess its way past the seam.
 */
export function installGatewaySessionCap(cap: unknown): void {
  preflightGatewaySessionCap();
  if (typeof cap !== 'string' || cap.length < 32 || cap.length > 256) {
    throw typedError(
      'GATEWAY_SESSION_INVALID',
      'installGatewaySessionCap requires an unguessable host-generated session capability string (32–256 chars)',
    );
  }
  gatewaySessionCap = cap;
}

/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export function isGatewaySessionCapInstalled(): boolean {
  return gatewaySessionCap !== undefined;
}

/**
 * Constant-time equality for the session capability (fixed-length host
 * random; pure JS on purpose — this module stays free of byte-decoding
 * machinery by static proof).
 */
function sessionMatches(cap: unknown): boolean {
  if (gatewaySessionCap === undefined || typeof cap !== 'string' || cap.length !== gatewaySessionCap.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < cap.length; index += 1) {
    diff |= cap.charCodeAt(index) ^ gatewaySessionCap.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * Retrieve the private Kernel operations of a facade produced by
 * `DomainHarness.load(package)` in THIS process (#1013, I02/I03). Returns
 * `undefined` for anything that is not such a facade. Trusted Host gateway
 * use only: the caller must present the EXACT gateway session capability
 * installed by `bootstrapTrustedHost` — a process without one fails closed
 * (`GATEWAY_SESSION_NOT_INSTALLED`) and a wrong or absent capability is
 * refused typed (`GATEWAY_SESSION_DENIED`) before any Kernel operation,
 * observer or address is reachable. Deep-importing this module grants no
 * authority: the capability never exists in this module's exports, only in
 * the trusted Host bootstrap's closure.
 */
export function getFacadeKernelOps(facade: object, sessionCap?: unknown): V8FacadeKernelOps | undefined {
  if (gatewaySessionCap === undefined) {
    throw typedError(
      'GATEWAY_SESSION_NOT_INSTALLED',
      'no gateway session capability is installed in this process; the protected ops seam stays closed until the trusted Host bootstrap establishes one',
    );
  }
  if (!sessionMatches(sessionCap)) {
    throw typedError(
      'GATEWAY_SESSION_DENIED',
      'the protected facade ops seam requires the Host bootstrap gateway session capability; structural module access or a forged principal carries no authority (#1013 R2 @6122817203)',
    );
  }
  return facadeScopes.get(facade);
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
