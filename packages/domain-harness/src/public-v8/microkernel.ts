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
 * effect runtime (journals/effects exist only inside the wired Kernel);
 * no init-script engine — the #1023 S03 lifecycle hooks are optional
 * module exports of BUILD-sealed packages, called in the sealed
 * BUILD-fixed packages order, and nothing more. The #1023 S04 callable
 * OperationCall surface adds NO second Runtime either: pure operations
 * dispatch the exact BUILD-bound sealed handler with plain-JSON data only,
 * effectful operations are ordinary authenticated Kernel occurrences
 * (Business admission → Journal → Effect), and the capability-owned
 * physical handlers run only behind the Kernel's effect dispatch as
 * Host-provisioned resource adapters.
 */

import { QualifiedPackageError, sha256Hex, type QualifiedCleanupFailure, type QualifiedPackageKind, type V8PackageLifecycleContext } from './contracts.js';
import { currentKernelHostPorts, type V8KernelHostPorts } from './kernel-host.js';
import { currentHostModelPort, type V8CancellationSignal } from './model-port.js';
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
  /**
   * Stop the facade scope. The scope is stopped for further use
   * IMMEDIATELY (synchronous part); the returned promise settles when the
   * reverse-order lifecycle teardown COMPLETES (#1023 S03, R1 P1-01: the
   * stop contract is awaitable — every `dispose(context)` is awaited in
   * reverse sealed order before the next one starts, a failing dispose
   * never aborts the remaining teardown, and the aggregate typed error
   * `LIFECYCLE_DISPOSE_FAILED` REJECTS the promise instead of being
   * swallowed). Repeated stop is one-shot idempotent: the same cached
   * outcome is reported and no teardown runs twice. Callers that ignore
   * the returned promise leave a rejection unobserved — by design, the
   * failure is never silenced.
   */
  stop(): Promise<void>;
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
 * Protected, request-scoped occurrence control (#1003 FR07-KH2, B3). Only
 * the H-authenticated kernel gateway constructs one (per `send`); it rides
 * BESIDE the plain-JSON Kernel request — never inside intent data — and the
 * selected Kernel owns the cancellation latch the signal drives.
 */
export interface V8OccurrenceControl {
  readonly signal: V8CancellationSignal;
}

/**
 * #1023 S04 — one BUILD-fixed callable OperationCall envelope. The
 * capability/operation identity and the plain-JSON input are the ONLY
 * caller-controlled content; an effectful operation additionally carries
 * the occurrence address components (instanceKey/messageId) exactly like an
 * authenticated send. No caller-declared role, principal, verifiedPrincipal
 * or Host port can ride this envelope.
 */
export interface V8OperationCall {
  readonly capabilityId: string;
  readonly operationId: string;
  readonly input?: unknown;
  /** Effectful operations only: the occurrence instance address component. */
  readonly instanceKey?: string;
  /** Effectful operations only: the occurrence dedup/replay identity. */
  readonly messageId?: string;
}

/**
 * #1023 S04 — one trusted-Host physical resource adapter derived from the
 * sealed capability OperationCall ABI: the BUILD-selected capability
 * handlers for one Host resource key, reachable ONLY through the selected
 * Kernel's effect dispatch (`hostPorts.resources`), never from a call.
 */
export interface V8OperationResourceAdapter {
  /** The LOGICAL sealed route key (the Business policy's own declaration). */
  readonly resourceKey: string;
  /**
   * #1023 S05: this activation's injective physical deployment identity,
   * minted by the trusted loader from load-verified closure bytes — never
   * from caller payload, never ambient mutable routing state.
   */
  readonly scopeId: string;
  /** The dispatcher map key: `${scopeId}\u0000${resourceKey}`. */
  readonly physicalResourceKey: string;
  readonly operations: ReadonlyMap<string, (payload: unknown) => unknown>;
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
   * tenant/app-qualified key of the authenticated principal. The optional
   * `control` (#1003 FR07-KH2) is forwarded to the Kernel unchanged.
   *
   * [#1062 shared durable-control seam] The optional `turnSource` is a
   * TRUSTED-HOST-ONLY field: it is constructed by the Host gateway from a
   * durably settled control record (timer/callback/child-terminal), never
   * from caller data — the public `send` verb has no such field and this
   * ops seam is capability-guarded (getFacadeKernelOps). The Kernel
   * validates the shape strictly and derives the deterministic turn id.
   */
  submitAs(principal: V8GatewayPrincipal, request: {
    readonly intentType: string;
    readonly messageId: string;
    readonly instanceKey: string;
    readonly input?: unknown;
    readonly turnSource?: unknown;
  }, control?: V8OccurrenceControl): Promise<unknown>;
  /**
   * [#1066 R1 P1-A] Non-throwing Business-role admission probe of the
   * EXACT pick `submitAs`'s internal role gate makes (an intent without a
   * bound role set admits every authenticated principal, exactly like the
   * submit-time gate's 'anonymous'). The trusted Host gateway uses it to
   * enforce intent authority BEFORE any durable-control settlement CAS —
   * never as a substitute for the submit-time gate, which stays
   * authoritative for every actual Kernel submission.
   */
  roleAdmitted(principal: V8GatewayPrincipal, intentType: string): boolean;
  /** Scoped instance read for the authenticated principal's tenant/app. */
  queryInstance(principal: V8GatewayPrincipal, instanceKey: string): Promise<unknown>;
  /**
   * [#1003 NF06] Authorized read of ONE persisted decision receipt: the
   * authenticated principal's tenant/app-qualified instance plus the exact
   * message (durable control turn). The Kernel owns the reader-role gate
   * (the Business receiptPolicy readerRoles) and the record bytes; this
   * seam forwards only the verified principal — never caller-chosen
   * authority.
   */
  queryDecisionReceipt(principal: V8GatewayPrincipal, request: {
    readonly instanceKey: string;
    readonly messageId: string;
  }): Promise<unknown>;
  /**
   * [#1063 HF20] Authorized read of the ordered durable mutation-observation
   * window riding the principal's tenant/app-qualified instance document:
   * the Kernel alone validates the opaque cursor against the current
   * committed window (stream-bound, never beyond the watermark) and owns
   * the record/page bytes; this seam forwards only the verified principal —
   * never caller-chosen authority, exactly like the NF06 receipt read.
   */
  queryMutationObservations(principal: V8GatewayPrincipal, request: {
    readonly instanceKey: string;
    readonly afterCursor?: string;
    readonly limit?: number;
  }): Promise<unknown>;
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
  /**
   * #1023 S04: BUILD-fixed OperationCall dispatch on the protected gateway
   * seam. The exact handler comes from the sealed S02a capability binding
   * matched against the sealed module `OPERATIONS` ABI — no runtime
   * discovery. A pure (`effectClass 'none'`) operation runs the exact
   * handler with the plain-JSON input ONLY (no Host/Kernel port is in
   * scope, no State/Journal/Effect is touched) behind the Business-governed
   * visibility gate. An effectful operation NEVER touches the handler
   * directly: the call traverses the sealed Business intent's role gate and
   * the selected Kernel's submitOccurrence (Admission → Journal → Effect);
   * the capability-owned physical handler runs only behind the Kernel's
   * effect dispatch as the Host-provisioned resource adapter.
   */
  invokeOperation(principal: V8GatewayPrincipal, call: V8OperationCall, control?: V8OccurrenceControl): Promise<unknown>;
  /**
   * #1023 S04: the BUILD-selected physical resource adapters derived from
   * the sealed capability OperationCall ABI — trusted Host wiring input for
   * `registerApp` provisioning ONLY. Never caller-visible.
   */
  operationResourceAdapters(): readonly V8OperationResourceAdapter[];
  /**
   * #1003 HF23: the BUILD-sealed inert operation descriptors, computed for
   * the AUTHENTICATED principal. Discovery metadata only — no handler, no
   * physical resource route, no admission authority; the `agentExposed`
   * marking is sealed BUILD data and `principalAdmitted` mirrors the same
   * Business-bound role pick an actual OperationCall would take.
   */
  describeOperationSurface(principal: V8GatewayPrincipal): readonly V8OperationSurfaceDescriptor[];
  /**
   * #1003 FR05/HF17/HF23: the retained Standard-SDK query/observer/agent
   * projections surfaced for the trusted gateway exactly like the FR08
   * retained decision-source endpoints — additive optional ABI members,
   * wired all-or-none only when the sealed Standard SDK exports all three.
   * Pure inert S projections: H authentication and the Kernel's own reads
   * stay the authority; nothing here mints a revision or admits a call.
   */
  readonly retainedProjection?: {
    /** FR05: deterministic multi-source projection over exact K-attested revision selectors. */
    readonly projectRead: (declaration: unknown, snapshots: unknown) => unknown;
    /** HF17: monotonic-epoch coalescing of delivered revision observations. */
    readonly coalesceObservations: (observations: unknown) => unknown;
    /** HF23: read-only agent tool surface over BUILD-sealed descriptors. */
    readonly projectAgentTools: (operations: unknown) => unknown;
  };
}

/** The shape of the wired Kernel mechanism the transport scope consumes. */
interface WiredKernelRuntime {
  submitOccurrence(intent: unknown, control?: V8OccurrenceControl): unknown;
  getSnapshot(target: unknown): unknown;
  /** Present on the selected Kernel mechanism (T-C); required only for Genesis. */
  openInstance?(request: unknown): unknown;
  /** [#1003 NF06] Present on the selected Kernel mechanism; the authorized read of one persisted decision receipt. */
  getDecisionReceipt?(request: unknown): unknown;
  /** [#1063 HF20] Present on the selected Kernel mechanism; the K-validated ordered mutation-observation read. */
  readMutationObservations?(request: unknown): unknown;
}

/**
 * The generic mechanism-construction contract the loader wires (ported from
 * #994@b9ea4d1 load.mjs): the Kernel package's `createOccurrenceRuntime`
 * receives every resolved endpoint plus the protected Host ports. The
 * mechanism semantics themselves are the Kernel package's own (T-C).
 */
type KernelRuntimeFactory = (deps: {
  readonly moduleIdentity: { readonly packageId: string; readonly moduleSha256: string };
  readonly hostPorts: V8KernelMechanismHostPorts;
  /**
   * The rule-interpretation endpoint. Per the recorded ABI ruling
   * (#1013@6118426531, R1 F-03) the Kernel awaits the returned value: a
   * synchronous model-free resolution (plain value) and an async
   * Host-bound model resolution (Promise) both flow through unchanged.
   * `invokeStep` (#1003 FR07-KH2) is the S single-step surface the Kernel's
   * bounded continuation drives; present only with a trusted ModelPort.
   * Both accept the optional protected occurrence control as a 4th argument.
   */
  readonly sdkEndpoint: {
    readonly packageId: string;
    readonly interpret: (declaration: unknown, input: unknown, context: unknown, control?: V8OccurrenceControl) => unknown;
    readonly invokeStep?: (declaration: unknown, input: unknown, context: unknown, control?: V8OccurrenceControl) => unknown;
    /** [#1003 NF06] The S bounded redacted data-only decision-receipt projection; optional ABI member. */
    readonly projectDecisionReceipt?: (verified: unknown) => unknown;
    /**
     * [#1003 FR08 general + FR09 + FR12] The retained S decision-source
     * semantics; optional ABI members. S remains the ONLY ordering,
     * currentness and eligibility authority — the selected Kernel supplies
     * the qualified observations and owns every durable record. A Standard
     * SDK without them cannot serve a Business policy that declares
     * decision-source rules (the Kernel refuses the load typed).
     */
    readonly resolveDecisionSource?: (selection: unknown) => unknown;
    readonly selectPromotedChild?: (selection: unknown) => unknown;
    readonly checkEvidenceApplicability?: (record: unknown, expected: unknown) => unknown;
  };
  readonly businessEndpoint: object;
  readonly observe: (receipt: unknown) => void;
}) => unknown;

/**
 * The Host-port view the wired Kernel mechanism consumes: the raw protected
 * ports MINUS the #1023 S05 R1 privileged `callScoped` member. The mechanism
 * (and through it every Business package and effect handler) can only ever
 * see the plain `resources.call`, which refuses the reserved scoped-physical
 * namespace at the dispatcher — a scope can never be presented to a package.
 */
type V8KernelMechanismHostPorts = Omit<V8KernelHostPorts, 'resources'> & {
  readonly resources: { readonly call: V8KernelHostPorts['resources']['call'] };
};

function typedError(code: string, message: string): QualifiedPackageError {
  return new QualifiedPackageError(code, message);
}

function errorMessage(error: unknown): string {
  return String((error as Error | undefined)?.message ?? error);
}

// ---- #1023 S05: per-activation physical resource deployment identity ----

/**
 * Process-monotonic activation ordinal. Read exactly once per qualified load
 * to mint that activation's scope; it is never ambient routing state — no
 * "current app" variable exists anywhere on this path, so interleaved async
 * activations can never observe each other's identity.
 */
let resourceActivationCounter = 0;

/**
 * Compose the PHYSICAL dispatcher key of one logical route under one
 * activation scope. The scope is NUL-free hex, so the composition is
 * injective in (scope, logicalKey) — two deployments can never resolve onto
 * each other's entries. #1023 S05 R1 P1-01: a caller or Business effect
 * handler naming a FORGED composed string is stopped by the dispatcher's
 * reserved-namespace guard, not by this composition — the raw `call` refuses
 * any key containing the delimiter typed, and the only route into the
 * reserved namespace is the privileged `callScoped` member the trusted
 * loader's per-activation view calls with the scope it minted itself.
 */
function physicalResourceKey(scopeId: string, resourceKey: string): string {
  return `${scopeId}\u0000${resourceKey}`;
}

/**
 * Mint one activation's scope: sha256 over the load-VERIFIED closure
 * identity (root package id + whole-closure digest) plus the activation
 * ordinal. Deterministic and auditable (a physical key in the dispatcher's
 * accounting recomputes to the exact closure activation that produced it),
 * unforgeable by collision, and minted exclusively inside the trusted
 * loader — a caller can neither choose it nor observe it before dispatch.
 */
function mintResourceScopeId(rootPackageId: string, closureDigest: string): string {
  return sha256Hex(JSON.stringify({
    resourceScopeVersion: 1,
    rootPackageId,
    closureDigest,
    activation: (resourceActivationCounter += 1),
  }));
}

// ---- #1023 S03: optional package lifecycle (init/dispose hooks) ----

/** The optional lifecycle export shape every sealed package MAY expose. */
type LifecycleHook = (context: V8PackageLifecycleContext) => unknown;

/**
 * One closure package that participates in the S03 lifecycle: it exports
 * `init` and/or `dispose` (participation is per package; a hook-less
 * package is never touched). `context` is the frozen data-only identity
 * record shared by that package's init and dispose.
 */
interface LifecycleParticipant {
  readonly packageId: string;
  readonly context: V8PackageLifecycleContext;
  readonly init: LifecycleHook | undefined;
  readonly dispose: LifecycleHook | undefined;
}

/**
 * Reverse-order cleanup of already-initialized packages along the sealed
 * (BUILD-fixed) dependency order. Every participant is offered its
 * `dispose` even when an earlier dispose failed; failures are COLLECTED,
 * never thrown, so the caller can report them beside the primary failure
 * without erasing it.
 */
async function disposeInitialized(initialized: readonly LifecycleParticipant[]): Promise<QualifiedCleanupFailure[]> {
  const failures: QualifiedCleanupFailure[] = [];
  for (const participant of [...initialized].reverse()) {
    if (participant.dispose === undefined) continue;
    try {
      await participant.dispose(participant.context);
    } catch (error) {
      failures.push({ packageId: participant.packageId, message: errorMessage(error) });
    }
  }
  return failures;
}

// ---- #1023 S04: BUILD-fixed callable OperationCall ----

/** The pre-existing effect-class declaration family (L2 successor §4). */
type V8OperationEffectClass = 'none' | 'idempotent' | 'non-idempotent';

/** One wired callable operation: the sealed ABI entry plus the exact BUILD-bound handler. */
interface WiredOperation {
  readonly effectClass: V8OperationEffectClass;
  readonly handler: (input: unknown) => unknown;
  /** Pure: the sealed Business intent whose issuer-bound role set governs visibility. */
  readonly visibilityIntentType?: string;
  /** Effectful: the sealed Business intent that owns admission (roles/guard/invariant/effects). */
  readonly intentType?: string;
  /** Effectful: the Host physical resource route behind the Kernel's effect dispatch. */
  readonly resource?: { readonly key: string; readonly operation: string };
  /**
   * #1003 HF23: the BUILD-sealed agent exposure marking — pure operations
   * only (the wiring refuses an effectful marking typed below). An inert
   * discovery flag: it never widens dispatch, never bypasses the Business
   * visibility gate and never admits a mutation.
   */
  readonly agent?: true;
}

interface WiredCapability {
  readonly packageId: string;
  readonly endpointId: string;
  readonly operations: Map<string, WiredOperation>;
}

/**
 * #1003 HF23 — one BUILD-sealed operation descriptor for an authenticated
 * principal: inert discovery metadata only. No handler, no physical
 * resource route and no admission authority ever rides a descriptor; the
 * `agentExposed` marking is the sealed BUILD approval, and
 * `principalAdmitted` mirrors the same Business-bound role pick a call
 * would take (requirePrincipalRole) without throwing.
 */
export interface V8OperationSurfaceDescriptor {
  readonly capabilityId: string;
  readonly operationId: string;
  readonly effectClass: V8OperationEffectClass;
  /** Pure operations only: the sealed BUILD `agent` approval marking. */
  readonly agentExposed: boolean;
  /** Pure: the sealed Business intent whose bound role set governs visibility. */
  readonly visibilityIntentType?: string;
  /** Effectful: the sealed Business intent that owns central admission. */
  readonly admissionIntentType?: string;
  /** Whether the authenticated principal holds the Business-bound role. */
  readonly principalAdmitted: boolean;
}

const OPERATION_EFFECT_CLASSES: readonly V8OperationEffectClass[] = ['none', 'idempotent', 'non-idempotent'];

function isOperationEffectClass(value: unknown): value is V8OperationEffectClass {
  return typeof value === 'string' && (OPERATION_EFFECT_CLASSES as readonly string[]).includes(value);
}

// ---- #1023 S04 R1 P1-02: Operation↔Effect binding interlock ----

/**
 * Read the AUTHORITATIVE physical-route semantics of one effect binding off
 * the sealed Business policy — the same policy object the selected Kernel
 * dispatches effects on. An effect binding that declares no Host route is
 * unverifiable at wiring: `undefined`.
 */
function readEffectBindingRoute(effectBinding: unknown): { semantics: unknown; resource?: { key: string; operation: string } } | undefined {
  if (!isPlainRecordValue(effectBinding)) return undefined;
  const resource = effectBinding.resource;
  if (resource === undefined) return { semantics: effectBinding.semantics };
  if (!isPlainRecordValue(resource) || typeof resource.key !== 'string' || typeof resource.operation !== 'string') return undefined;
  return { semantics: effectBinding.semantics, resource: { key: resource.key, operation: resource.operation } };
}

/**
 * The wiring-time Operation→Effect interlock (#1023 S04 R1 P1-02). The
 * sealed capability ABI's CLAIMS are checked against the sealed Business
 * policy's own declarations — the exact data the selected Kernel's effect
 * dispatch reads — so a callable effectful operation can never declare a
 * route, an effect class or an intent the Business policy contradicts:
 *
 *   - the policy must actually BIND the claimed admission intent;
 *   - the intent binding's trigger-matching transitions must dispatch at
 *     least one Business effect intent (a no-effect intent would return a
 *     K receipt with no capability handler ever running);
 *   - every dispatched effect binding must DECLARE its Host physical route
 *     `{key, operation}` and it must EQUAL the ABI's claimed route;
 *   - the effect binding's `semantics` must EQUAL the ABI's declared
 *     `effectClass` (no false idempotency/retry-safety declaration);
 *   - the union of dispatched routes must be EXACTLY the one claimed route
 *     (one callable effectful operation = one physical route).
 *
 * This is a declarative, K-compatible link (sealed policy data, no
 * speculative runtime handler introspection): a Business handler that lied
 * about its route dispatches into the injective adapter map and fails
 * closed typed (HOST_RESOURCE_OPERATION_UNKNOWN) at runtime.
 */
function assertOperationEffectBinding(input: {
  readonly capabilityId: string;
  readonly operationId: string;
  readonly intentType: string;
  readonly resource: { readonly key: string; readonly operation: string };
  readonly effectClass: V8OperationEffectClass;
  readonly businessPolicy: Record<string, unknown>;
}): void {
  const { capabilityId, operationId, intentType, resource, effectClass, businessPolicy } = input;
  const where = `capability ${capabilityId} operation ${operationId}`;
  const intentBindings = businessPolicy.intentBindings;
  const binding = isPlainRecordValue(intentBindings) && Object.prototype.hasOwnProperty.call(intentBindings, intentType)
    ? intentBindings[intentType]
    : undefined;
  if (!isPlainRecordValue(binding)) {
    throw typedError(
      'OPERATION_BINDING_MISMATCH',
      `${where} claims admission intent ${intentType}, but the sealed Business policy binds no such intent; the Operation→Effect link is unverifiable`,
    );
  }
  const trigger = binding.trigger;
  const eventType = isPlainRecordValue(trigger) ? trigger.eventType : undefined;
  if (typeof eventType !== 'string' || eventType.length === 0) {
    throw typedError(
      'OPERATION_BINDING_MISMATCH',
      `${where} claims admission intent ${intentType}, whose sealed Business binding declares no usable event trigger; the Operation→Effect link is unverifiable`,
    );
  }
  const definition = isPlainRecordValue(binding.definition) ? binding.definition : businessPolicy.workflowDefinition;
  if (!isPlainRecordValue(definition) || !Array.isArray(definition.states)) {
    throw typedError(
      'OPERATION_BINDING_MISMATCH',
      `${where} claims admission intent ${intentType}, whose sealed Business definition is unreadable; the Operation→Effect link is unverifiable`,
    );
  }
  // Collect every effect intent the intent's trigger can dispatch, across ALL
  // states of its definition — the guard/state branch is a runtime decision,
  // so the wiring link must cover every declared branch or refuse.
  const effectTypes = new Set<string>();
  for (const state of definition.states) {
    if (!isPlainRecordValue(state) || !Array.isArray(state.transitions)) continue;
    for (const transition of state.transitions) {
      if (!isPlainRecordValue(transition)) continue;
      const transitionTrigger = transition.trigger;
      if (!isPlainRecordValue(transitionTrigger) || transitionTrigger.eventType !== eventType) continue;
      // #1023 S04 R2 (@5514296714): EVERY trigger-matching transition the
      // selected Kernel could admit must dispatch the promised effect - a
      // same-event branch WITHOUT effects (the real approval policy's guarded
      // approve plus fallback reject) could otherwise be admitted with an
      // 'admitted' receipt while the promised capability handler never runs.
      // Guarded DENIALS stay valid: a denied occurrence never reaches effect
      // dispatch and is not affected here.
      const intents = Array.isArray(transition.effectIntents) ? transition.effectIntents : [];
      if (intents.length === 0) {
        const transitionKey = typeof transition.transitionKey === 'string' ? transition.transitionKey : '(unnamed)';
        throw typedError(
          'OPERATION_BINDING_MISMATCH',
          `${where} claims admission intent ${intentType}, but its transition ${transitionKey} for event ${eventType} dispatches no Business effect - the Kernel could admit this branch and the OperationCall would report success without the promised capability handler (mixed effectful/effectless same-event branches refuse)`,
        );
      }
      for (const effectIntent of intents) {
        if (isPlainRecordValue(effectIntent) && typeof effectIntent.effectType === 'string') {
          effectTypes.add(effectIntent.effectType);
        }
      }
    }
  }
  if (effectTypes.size === 0) {
    throw typedError(
      'OPERATION_BINDING_MISMATCH',
      `${where} claims admission intent ${intentType}, but none of its transitions dispatches a Business effect — a callable effectful operation cannot bind a no-effect intent (its K receipt would run no capability handler)`,
    );
  }
  const effectBindings = businessPolicy.effectBindings;
  const routes = new Set<string>();
  for (const effectType of effectTypes) {
    const route = isPlainRecordValue(effectBindings) && Object.prototype.hasOwnProperty.call(effectBindings, effectType)
      ? readEffectBindingRoute(effectBindings[effectType])
      : undefined;
    if (route === undefined || route.resource === undefined) {
      throw typedError(
        'OPERATION_BINDING_MISMATCH',
        `${where} resolves Business effect ${effectType}, which declares no Host physical route {key, operation}; the Operation→Effect link is unverifiable`,
      );
    }
    if (route.semantics !== effectClass) {
      throw typedError(
        'OPERATION_BINDING_MISMATCH',
        `${where} declares effectClass ${effectClass}, but Business effect ${effectType} declares semantics ${String(route.semantics)} — a false idempotency/retry-safety declaration refuses`,
      );
    }
    if (route.resource.key !== resource.key || route.resource.operation !== resource.operation) {
      throw typedError(
        'OPERATION_BINDING_MISMATCH',
        `${where} claims the Host physical route ${resource.key}.${resource.operation}, but Business effect ${effectType} dispatches ${route.resource.key}.${route.resource.operation}`,
      );
    }
    routes.add(`${route.resource.key}\u0000${route.resource.operation}`);
  }
  if (routes.size !== 1) {
    throw typedError(
      'OPERATION_BINDING_MISMATCH',
      `${where} claims one Host physical route, but its admission intent dispatches ${routes.size} distinct Business routes`,
    );
  }
}

const OPERATION_JSON_MAX_DEPTH = 64;

function isPlainRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Descriptor-safe bounded JSON validation for OperationCall payloads: plain
 * JSON data only (finite numbers, plain arrays/objects), hostile ACCESSORS
 * refused WITHOUT invocation, depth-capped so a cyclic presentation cannot
 * exhaust the stack. Unlike assertPlainJsonIntent (the transport-intent
 * walker), this reads every slot through its property descriptor — an
 * OperationCall is a NEW externally shaped surface, so its input AND the
 * handler's output both pass this gate typed.
 */
function assertOperationJsonData(value: unknown, path: string, code: string, depth = 0): void {
  if (depth > OPERATION_JSON_MAX_DEPTH) {
    throw typedError(code, `${path} exceeds the maximum OperationCall JSON depth (${OPERATION_JSON_MAX_DEPTH})`);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw typedError(code, `${path} contains a non-finite number`);
    }
    return;
  }
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint' || typeof value === 'undefined') {
    throw typedError(code, `${path} carries a non-JSON ${typeof value}; OperationCall payloads are data only`);
  }
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      throw typedError(code, `${path} is not a plain array`);
    }
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor | undefined>;
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined
      || !Object.hasOwn(lengthDescriptor, 'value')
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
    ) {
      throw typedError(code, `${path}.length descriptor is not the intrinsic array length`);
    }
    const length = lengthDescriptor.value as number;
    if (Reflect.ownKeys(descriptors).length !== length + 1) {
      throw typedError(code, `${path} has non-index own keys`);
    }
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
        throw typedError(code, `${path}[${index}] is not an own enumerable data slot (accessors are refused)`);
      }
      assertOperationJsonData(descriptor.value, `${path}[${index}]`, code, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw typedError(code, `${path} must be a plain JSON object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor | undefined>;
  for (const key of Object.keys(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      throw typedError(code, `${path}.${key} is a dangerous own key`);
    }
    const descriptor = descriptors[key];
    if (descriptor === undefined || descriptor.enumerable !== true || !Object.hasOwn(descriptor, 'value')) {
      throw typedError(code, `${path}.${key} is not an own enumerable data slot (accessors are refused)`);
    }
    assertOperationJsonData(descriptor.value, `${path}.${key}`, code, depth + 1);
  }
  if (Reflect.ownKeys(descriptors).length !== Object.keys(value).length) {
    throw typedError(code, `${path} has non-enumerable own keys`);
  }
}

/**
 * Wire the callable operation surface of every sealed S02a capability
 * binding at THIS trusted activation boundary (#1023 S04): the module's
 * optional `OPERATIONS` ABI table is validated against the BUILD capability
 * binding's exact operation→handler map (the installer already proved every
 * bound handler is a callable export), every referenced visibility/admission
 * intent must be sealed in THIS closure, and every effectful entry must
 * carry its Host physical resource route. A malformed, unbound, duplicate
 * or contradictory ABI fails typed BEFORE any facade escapes — a capability
 * package without an `OPERATIONS` export keeps the S02a-only behavior (its
 * handlers stay installed but not callable). No runtime discovery exists:
 * what BUILD sealed here is the entire callable surface.
 */
function wireCapabilityOperations(input: {
  readonly bindings: readonly SealedQualifiedPackageRoot['bindings'][number][];
  readonly getModuleNamespace: (packageId: string) => Record<string, unknown>;
  readonly sealedIntentTypes: ReadonlySet<string>;
  readonly businessPolicy: Record<string, unknown>;
}): { capabilities: Map<string, WiredCapability>; adapters: Map<string, Map<string, (payload: unknown) => unknown>> } {
  const capabilities = new Map<string, WiredCapability>();
  const adapters = new Map<string, Map<string, (payload: unknown) => unknown>>();
  for (const binding of input.bindings) {
    if (binding.role !== 'capability') continue;
    const namespace = input.getModuleNamespace(binding.packageId);
    const operations = new Map<string, WiredOperation>();
    const abiTable: unknown = namespace.OPERATIONS;
    if (abiTable === undefined) {
      capabilities.set(binding.capabilityId, { packageId: binding.packageId, endpointId: binding.endpointId, operations });
      continue;
    }
    if (!Array.isArray(abiTable) || abiTable.length === 0) {
      throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} exports an OPERATIONS ABI that is not a non-empty array`);
    }
    for (const entry of abiTable) {
      if (!isPlainRecordValue(entry)) {
        throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} OPERATIONS entries must be plain records`);
      }
      const operationId = entry.operationId;
      if (typeof operationId !== 'string' || operationId.length === 0) {
        throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} declares an OPERATIONS entry without a non-empty operationId`);
      }
      if (operations.has(operationId)) {
        throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} declares operation ${operationId} more than once in its OPERATIONS ABI`);
      }
      const effectClass = entry.effectClass;
      if (!isOperationEffectClass(effectClass)) {
        throw typedError(
          'OPERATION_ABI_INVALID',
          `capability ${binding.capabilityId} operation ${operationId} declares effectClass ${String(effectClass)}; the declaration family is none | idempotent | non-idempotent`,
        );
      }
      const boundHandler = binding.handlers.find((candidate) => candidate.operationId === operationId);
      if (boundHandler === undefined) {
        throw typedError(
          'OPERATION_ABI_INVALID',
          `capability ${binding.capabilityId} OPERATIONS entry ${operationId} has no exact BUILD handler binding; the callable surface is BUILD-fixed`,
        );
      }
      const handlerExport = namespace[boundHandler.handler];
      // The installer already refused non-callable bound exports
      // (MODULE_HANDLER_MISSING); this is the same invariant re-anchored at
      // the dispatch wiring.
      if (typeof handlerExport !== 'function') {
        throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} operation ${operationId} handler ${boundHandler.handler} is not callable on the installed namespace`);
      }
      const handler = handlerExport as (input: unknown) => unknown;
      if (effectClass === 'none') {
        const visibility = entry.visibility;
        if (!isPlainRecordValue(visibility) || typeof visibility.intentType !== 'string' || visibility.intentType.length === 0) {
          throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} pure operation ${operationId} must declare visibility.intentType (Business-governed role set)`);
        }
        if (!input.sealedIntentTypes.has(visibility.intentType)) {
          throw typedError(
            'OPERATION_ABI_INVALID',
            `capability ${binding.capabilityId} pure operation ${operationId} visibility references intent ${visibility.intentType} which is not bound in this sealed closure`,
          );
        }
        if (entry.intentType !== undefined || entry.resource !== undefined) {
          throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} pure operation ${operationId} cannot declare an admission intent or a physical resource route`);
        }
        // #1003 HF23: the optional agent exposure marking is the exact
        // boolean `true` or absent — anything else is a malformed seal.
        if (entry.agent !== undefined && entry.agent !== true) {
          throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} pure operation ${operationId} declares an agent exposure marking that is not the exact boolean true`);
        }
        operations.set(operationId, {
          effectClass,
          handler,
          visibilityIntentType: visibility.intentType,
          ...(entry.agent === true ? { agent: true } : {}),
        });
        continue;
      }
      const intentType = entry.intentType;
      if (typeof intentType !== 'string' || intentType.length === 0) {
        throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} effectful operation ${operationId} must declare the sealed Business intentType that owns its admission`);
      }
      // #1003 HF23: an effectful operation can never carry the agent
      // exposure marking — the agent surface is read-only BY SEAL, and a
      // mutation reaches the Kernel only through the central occurrence
      // admission the intent below owns. The refusal fires at wiring,
      // BEFORE any facade escapes.
      if (entry.agent === true) {
        throw typedError(
          'OPERATION_AGENT_MUTATION_REFUSED',
          `capability ${binding.capabilityId} effectful operation ${operationId} cannot carry the agent exposure marking; the agent surface is read-only and effectful admission belongs to the sealed central occurrence path only`,
        );
      }
      if (!input.sealedIntentTypes.has(intentType)) {
        throw typedError(
          'OPERATION_ABI_INVALID',
          `capability ${binding.capabilityId} effectful operation ${operationId} references intent ${intentType} which is not bound in this sealed closure; every effect traverses the sealed Business admission`,
        );
      }
      if (entry.visibility !== undefined) {
        throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} effectful operation ${operationId} visibility is the intent's own role gate; an extra visibility declaration is contradictory`);
      }
      const resource = entry.resource;
      if (
        !isPlainRecordValue(resource)
        || typeof resource.key !== 'string' || resource.key.length === 0
        || typeof resource.operation !== 'string' || resource.operation.length === 0
      ) {
        throw typedError('OPERATION_ABI_INVALID', `capability ${binding.capabilityId} effectful operation ${operationId} must declare resource {key, operation} for the Host physical route`);
      }
      // #1023 S04 R1 P1-02: the ABI's claims must match the AUTHORITATIVE
      // sealed Business policy declarations the selected Kernel's effect
      // dispatch reads - wrong route, wrong effect class, no-effect intent
      // or an unbound intent refuses typed HERE, before any facade escapes.
      assertOperationEffectBinding({
        capabilityId: binding.capabilityId,
        operationId,
        intentType,
        resource: { key: resource.key, operation: resource.operation },
        effectClass,
        businessPolicy: input.businessPolicy,
      });
      const resourceOperations = adapters.get(resource.key) ?? new Map<string, (payload: unknown) => unknown>();
      if (resourceOperations.has(resource.operation)) {
        throw typedError(
          'OPERATION_ABI_INVALID',
          `resource ${resource.key}.${resource.operation} is claimed by more than one capability operation; Host physical routes are injective`,
        );
      }
      resourceOperations.set(resource.operation, handler);
      adapters.set(resource.key, resourceOperations);
      operations.set(operationId, { effectClass, handler, intentType, resource: { key: resource.key, operation: resource.operation } });
    }
    capabilities.set(binding.capabilityId, { packageId: binding.packageId, endpointId: binding.endpointId, operations });
  }
  return { capabilities, adapters };
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
 * side effect. #1023 S03 adds the optional package lifecycle phase
 * (init ascending / dispose descending along the sealed BUILD-fixed
 * packages order) between import and wiring: an init failure blocks the
 * entire activation and cleans up in reverse order starting from the
 * failed package itself (best-effort, R1 P1-02); a post-init wiring
 * failure cleans up the initialized packages the same way with its own
 * typed error rethrown unchanged. Residual scope honestly documented
 * (same JS semantics as the installer): packages whose module top level
 * already evaluated during the qualified install cannot be un-evaluated;
 * the loader guarantees only that nothing of ITS OWN (facade, observers,
 * mechanism construction, lifecycle participants) outlives a failed
 * activation.
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

  // #1023 S05: this activation's physical resource deployment identity —
  // consumed by the claim-gated scoped resources view built below.
  const resourceScopeId = mintResourceScopeId(loaded.rootPackageId, loaded.build.closureDigest);

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

  // ---- #1023 S03: optional package lifecycle (init/dispose) ----
  // Module import stays the existing trusted preflight above (load() →
  // installer); ACTIVATION side effects are this phase. Every package of
  // the actually selected closure (K/S/B plus any BUILD-admitted capability
  // package) MAY export `init(context)` / `dispose(context)`; the sealed
  // root's packages array order — BUILD-fixed and committed inside the
  // approval subject digest — IS the dependency order: init runs ascending,
  // cleanup runs descending. A present-but-non-callable hook is refused by
  // the pre-scan BEFORE any lifecycle side effect; an init failure blocks
  // the whole activation (no policy resolution, no mechanism construction,
  // no facade) and cleans up along the reverse order starting with the
  // FAILED package itself (R1 P1-02: its init may have partially allocated
  // resources — a best-effort dispose runs first when the package exports
  // one), then the already-initialized packages. The context is the frozen
  // data-only identity record (contracts.ts V8PackageLifecycleContext); it
  // never carries Host ports, gateway session material or any Kernel/Host
  // private capability, and there is no init-script engine — the hooks are
  // exports of BUILD-sealed module bytes, nothing else.
  const participants: LifecycleParticipant[] = [];
  for (const pkg of loaded.installedPackages) {
    const namespace = loaded.getModuleNamespace(pkg.packageId);
    const initHook = namespace.init;
    const disposeHook = namespace.dispose;
    if (initHook === undefined && disposeHook === undefined) continue;
    if ((initHook !== undefined && typeof initHook !== 'function') || (disposeHook !== undefined && typeof disposeHook !== 'function')) {
      const which = initHook !== undefined && typeof initHook !== 'function' ? 'init' : 'dispose';
      throw typedError(
        'LIFECYCLE_HOOK_INVALID',
        `package ${pkg.packageId} exports a ${which} hook that is not a function; lifecycle hooks must be callable module exports`,
      );
    }
    participants.push({
      packageId: pkg.packageId,
      context: Object.freeze({
        packageId: pkg.packageId,
        kind: pkg.kind as QualifiedPackageKind,
        abiVersion: pkg.abiVersion,
        rootPackageId: loaded.rootPackageId,
        closureDigest: loaded.build.closureDigest,
      }),
      init: initHook as LifecycleHook | undefined,
      dispose: disposeHook as LifecycleHook | undefined,
    });
  }
  const initialized: LifecycleParticipant[] = [];
  for (const participant of participants) {
    if (participant.init === undefined) {
      // A dispose-only participant is vacuously initialized: it never
      // receives init, but its cleanup runs in the reverse sealed order.
      initialized.push(participant);
      continue;
    }
    try {
      await participant.init(participant.context);
    } catch (error) {
      // R1 P1-02: a failed init may hold PARTIALLY allocated resources —
      // best-effort dispose the FAILING participant FIRST (its allocation
      // is the most recent), then the already-initialized packages in
      // reverse sealed order. Every cleanup failure is collected beside
      // the primary LIFECYCLE_INIT_FAILED error without erasing it.
      const cleanupFailures: QualifiedCleanupFailure[] = [];
      if (participant.dispose !== undefined) {
        try {
          await participant.dispose(participant.context);
        } catch (disposeError) {
          cleanupFailures.push({ packageId: participant.packageId, message: errorMessage(disposeError) });
        }
      }
      cleanupFailures.push(...await disposeInitialized(initialized));
      const failure = typedError(
        'LIFECYCLE_INIT_FAILED',
        `package ${participant.packageId} lifecycle init failed: ${errorMessage(error)}; activation is blocked and lifecycle cleanup ran (the failed package best-effort first, then the initialized packages in reverse sealed order)`,
      );
      if (cleanupFailures.length > 0) failure.cleanupFailures = cleanupFailures;
      throw failure;
    }
    initialized.push(participant);
  }

  const observers = new Set<(receipt: unknown) => void>();
  // The sealed intent index IS the fixed closure: send() performs no
  // provider discovery and never falls back (KPK-03 heritage). Built before
  // the activation try so the #1023 S04 capability OperationCall wiring can
  // validate every ABI-referenced intent against the SAME sealed set.
  const intentIndex = new Map(
    bindings
      .filter((binding): binding is QualifiedIntentBinding => binding.role === 'intent')
      .map((binding) => [binding.intentType, binding]),
  );
  let businessPolicy: object;
  let kernelRuntime: WiredKernelRuntime;
  let wiredOperations: { capabilities: Map<string, WiredCapability>; adapters: Map<string, Map<string, (payload: unknown) => unknown>> };
  try {
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
    type SdkEndpointFn = (declaration: unknown, input: unknown, context: unknown, control?: V8OccurrenceControl) => unknown;
    /**
     * [#1003 FR08 general + FR09 + FR12] The retained S decision-source
     * endpoints (resolveRetainedDecision / selectRetainedPromotedChild /
     * checkRetainedEvidenceApplicability) surfaced on the protected
     * sdkEndpoint handed to the selected Kernel — additive optional ABI
     * members exactly like the NF06 decision-receipt projection. All
     * three must be exposed together or none is wired; the Kernel refuses
     * a decision-source-declaring Business policy when they are absent.
     */
    interface RetainedDecisionSourceEndpoints {
      readonly resolveDecisionSource: (selection: unknown) => unknown;
      readonly selectPromotedChild: (selection: unknown) => unknown;
      readonly checkEvidenceApplicability: (record: unknown, expected: unknown) => unknown;
    }
    const retainedDecisionSource: Partial<RetainedDecisionSourceEndpoints> =
      typeof sdkNamespace.resolveRetainedDecision === 'function'
      && typeof sdkNamespace.selectRetainedPromotedChild === 'function'
      && typeof sdkNamespace.checkRetainedEvidenceApplicability === 'function'
        ? {
          resolveDecisionSource: (selection: unknown) => (sdkNamespace.resolveRetainedDecision as (v: unknown) => unknown)(selection),
          selectPromotedChild: (selection: unknown) => (sdkNamespace.selectRetainedPromotedChild as (v: unknown) => unknown)(selection),
          checkEvidenceApplicability: (record: unknown, expected: unknown) => (sdkNamespace.checkRetainedEvidenceApplicability as (a: unknown, b: unknown) => unknown)(record, expected),
        }
        : {};
    const sdkEndpoint: { packageId: string; interpret: SdkEndpointFn; invokeStep?: SdkEndpointFn } & Partial<RetainedDecisionSourceEndpoints> = (
      modelPort !== undefined && typeof resolverFactory === 'function'
        ? (() => {
            interface BoundResolver {
              interpret: (declaration: unknown, input: unknown, context: unknown) => unknown;
              invokeDecision: (declaration: unknown, input: unknown, context: unknown) => unknown;
              invokeStep?: (declaration: unknown, input: unknown, context: unknown) => unknown;
            }
            const factory = resolverFactory as (port: unknown) => BoundResolver;
            let bound: BoundResolver;
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
            /**
             * #1003 FR07-KH2 (B3): the resolver for ONE model turn. Without a
             * protected control it is the load-time binding. With one, the SAME
             * qualified factory is bound to a request-scoped view of the SAME
             * trusted port that adds only the cancellation signal to the
             * physical invocation — the S step/decision code, its evidence
             * minting and the port identity are unchanged; nothing else rides.
             */
            const resolverFor = (control: V8OccurrenceControl | undefined): BoundResolver => {
              if (control === undefined) return bound;
              const signal = control.signal;
              const signalledPort = Object.freeze({
                invoke: (request: { readonly operation: string; readonly input: unknown }): unknown =>
                  modelPort.invoke({ operation: request.operation, input: request.input, signal }),
              });
              try {
                return factory(signalledPort);
              } catch (error) {
                throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} request-scoped model resolver bind failed: ${String((error as Error)?.message ?? error)}`);
              }
            };
            const interpretComposite: SdkEndpointFn = (declaration, input, context, control) => {
              const kind = (declaration as { kind?: unknown } | null | undefined)?.kind;
              return kind === 'model-decision'
                ? resolverFor(control).invokeDecision(declaration, input, context)
                : bound.interpret(declaration, input, context);
            };
            if (typeof bound.invokeStep !== 'function') {
              // An S package without the step surface still serves one-turn
              // decisions; a harness rule then refuses typed inside K.
              return { packageId: sdkBinding.packageId, interpret: interpretComposite, ...retainedDecisionSource };
            }
            const invokeStep: SdkEndpointFn = (declaration, input, context, control) => {
              const resolver = resolverFor(control);
              if (typeof resolver.invokeStep !== 'function') {
                throw typedError('ACTIVATION_FAILED', `standard-sdk package ${sdkBinding.packageId} request-scoped model resolver exposes no invokeStep`);
              }
              return resolver.invokeStep(declaration, input, context);
            };
            return {
              packageId: sdkBinding.packageId,
              interpret: interpretComposite,
              invokeStep,
              ...retainedDecisionSource,
              ...(typeof sdkNamespace.projectDecisionReceiptRecord === 'function'
                ? { projectDecisionReceipt: (verified: unknown) => (sdkNamespace.projectDecisionReceiptRecord as (v: unknown) => unknown)(verified) }
                : {}),
            };
          })()
        : {
          packageId: sdkBinding.packageId,
          interpret: sdkNamespace.interpret as SdkEndpointFn,
          ...retainedDecisionSource,
          ...(typeof sdkNamespace.projectDecisionReceiptRecord === 'function'
            ? { projectDecisionReceipt: (verified: unknown) => (sdkNamespace.projectDecisionReceiptRecord as (v: unknown) => unknown)(verified) }
            : {}),
        }
    );

    // Business policy resolution precedes kernel construction: a policy that
    // throws or returns a non-object fails typed with the mechanism still inert.
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

    // ---- #1023 S04: BUILD-fixed callable OperationCall wiring ----
    // The sealed S02a capability bindings plus each capability module's
    // optional sealed OPERATIONS ABI become the dispatch table (and the
    // trusted-Host physical resource adapters) — validated HERE, at the
    // same trusted boundary and BEFORE the kernel mechanism is constructed,
    // so a malformed ABI leaves no facade and no mechanism side effect (the
    // S03 reverse cleanup above applies to any initialized packages).
    wiredOperations = wireCapabilityOperations({
      bindings,
      getModuleNamespace: (packageId: string) => loaded.getModuleNamespace(packageId),
      sealedIntentTypes: new Set(intentIndex.keys()),
      businessPolicy: businessPolicy as Record<string, unknown>,
    });

    // ---- #1023 S05: capability-owned physical Node adapter identity. Every
    // LOGICAL resource key THIS closure claims through its sealed effectful
    // OPERATIONS ABI is dispatched through THIS activation's injective
    // physical scope — `<scopeId>\u0000<logicalKey>` — so the capability-
    // owned handlers the trusted Host gateway provisions can never be
    // crossed, shadowed or shared between two deployments binding the same
    // logical route. UNCLAIMED keys keep the historical deployment-owned
    // bare-key routing verbatim (the D2/D3 Apps and mixed closures consume
    // those unchanged). The claim set is sealed BUILD data and the scope is
    // loader-minted wiring: the Kernel mechanism, the Business effect
    // handlers and every caller keep seeing the plain
    // `resources.call(logicalKey, operation, payload)` port shape — the
    // claimed route keeps its OWN scoped adapter (BUILD binding precedence).
    //
    // #1023 S05 R1 P1-01 — the reserved scoped-physical namespace: the raw
    // `resources.call` REFUSES any key containing the scope delimiter at the
    // physical Host dispatcher, so a Business effect handler — scoped or
    // adapter-less alike — cannot reach ANOTHER deployment's scoped entry by
    // naming its exact string, even when its executable lies about its
    // declared route (a signed package's declaration is not proof of what
    // its code calls; the unclaimed fallback above lands on that guard and
    // the occurrence fails typed). The claimed branch dispatches through the
    // privileged `callScoped` member, which exists only on the raw
    // session-capability-gated ports this trusted loader reads; the runtime
    // view forwards ONLY the plain `call`, so no Kernel mechanism, Business
    // package or caller can ever present a scope. ----
    const claimedResourceKeys = wiredOperations.adapters;
    // #1023 S05 R2 P1: the mechanism-facing view is ALWAYS a fresh frozen
    // RUNTIME-narrowed object — including the adapter-less branch. A TS type
    // cannot strip runtime members: forwarding the raw `hostPorts` would
    // hand the unchanged Kernel (and through `resources: hostPorts.resources`
    // every Business effect handler) the privileged `callScoped` member,
    // letting a signed but buggy or input-parametrized adapter-less Business
    // present a foreign scope and bypass the reserved-namespace guard. The
    // zero-claim branch keeps the plain bare-key `call` semantics verbatim
    // (the bare function reference carries no sibling member).
    const runtimeHostPorts: V8KernelMechanismHostPorts = Object.freeze({
      docs: hostPorts.docs,
      sha256: hostPorts.sha256,
      resources: Object.freeze({
        call: claimedResourceKeys.size === 0
          ? hostPorts.resources.call
          : (resourceKey: string, operation: string, payload: unknown) =>
            claimedResourceKeys.has(resourceKey)
              ? hostPorts.resources.callScoped(resourceScopeId, resourceKey, operation, payload)
              : hostPorts.resources.call(resourceKey, operation, payload),
      }),
      clock: hostPorts.clock,
    });

    // ---- Kernel mechanism construction (LAST; kernel-owned side effects
    // exist only from this point on, and only behind the verified gate). ----
    let kernelCandidate: unknown;
    try {
      kernelCandidate = createOccurrenceRuntime({
        moduleIdentity,
        hostPorts: runtimeHostPorts,
        sdkEndpoint: Object.freeze(sdkEndpoint),
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
    kernelRuntime = kernelCandidate as WiredKernelRuntime;
  } catch (error) {
    // #1023 S03: a post-init activation failure leaves NO partial active
    // residue either — every already-initialized package is disposed in
    // reverse sealed order, the primary typed error is rethrown unchanged,
    // and dispose failures ride beside it without erasing it.
    const cleanupFailures = await disposeInitialized(initialized);
    if (cleanupFailures.length > 0 && error instanceof QualifiedPackageError) {
      error.cleanupFailures = cleanupFailures;
    }
    throw error;
  }

  // The frozen trusted-Host adapter view (#1023 S04/S05): one entry per
  // sealed LOGICAL resource key, each carrying the activation's injective
  // physical identity, each operation map frozen at this trusted boundary.
  const resourceAdapters: readonly V8OperationResourceAdapter[] = Object.freeze(
    [...wiredOperations.adapters.entries()].map(([resourceKey, operations]) =>
      Object.freeze({
        resourceKey,
        scopeId: resourceScopeId,
        physicalResourceKey: physicalResourceKey(resourceScopeId, resourceKey),
        operations: new Map(operations),
      }),
    ),
  );
  const capabilityOperations = wiredOperations.capabilities;
  /**
   * [#1003 FR05/HF17/HF23] The retained S query/observer/agent projections
   * (projectRetainedRead / coalesceRetainedObservations /
   * projectRetainedAgentTools) surfaced on the protected gateway ops —
   * additive optional ABI members exactly like the FR08 retained
   * decision-source endpoints; all three wire together or none does. The
   * projections are the SEALED SDK's own code (the same module the Kernel
   * validated at load), never a Host re-implementation.
   */
  const retainedProjection:
    | {
      readonly projectRead: (declaration: unknown, snapshots: unknown) => unknown;
      readonly coalesceObservations: (observations: unknown) => unknown;
      readonly projectAgentTools: (operations: unknown) => unknown;
    }
    | undefined = typeof sdkNamespace.projectRetainedRead === 'function'
      && typeof sdkNamespace.coalesceRetainedObservations === 'function'
      && typeof sdkNamespace.projectRetainedAgentTools === 'function'
      ? Object.freeze({
        projectRead: (declaration: unknown, snapshots: unknown) => (sdkNamespace.projectRetainedRead as (a: unknown, b: unknown) => unknown)(declaration, snapshots),
        coalesceObservations: (observations: unknown) => (sdkNamespace.coalesceRetainedObservations as (v: unknown) => unknown)(observations),
        projectAgentTools: (operations: unknown) => (sdkNamespace.projectRetainedAgentTools as (v: unknown) => unknown)(operations),
      })
      : undefined;

  let stopped = false;
  let stopDisposal: Promise<void> | undefined;
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

  function stop(): Promise<void> {
    stopped = true;
    observers.clear();
    // #1023 S03, R1 P1-01: stopping the scope tears the package lifecycle
    // down along the reverse sealed (BUILD-fixed) order and the teardown is
    // AWAITABLE — each dispose is fully awaited (sync or async) before the
    // next participant starts, a failing dispose never aborts the remaining
    // teardown, and the aggregate typed LIFECYCLE_DISPOSE_FAILED error
    // REJECTS the returned promise (a rejection is never silenced: callers
    // that ignore the promise leave it unobserved, which surfaces through
    // the host's unhandled-rejection channel). The disposal is ONE-SHOT:
    // the first stop caches the outcome promise and every repeated stop
    // reports that same outcome without re-running anything.
    stopDisposal ??= disposeInitialized(initialized).then((failures) => {
      if (failures.length > 0) {
        throw typedError(
          'LIFECYCLE_DISPOSE_FAILED',
          `facade stop lifecycle cleanup failed for ${failures.map((failure) => failure.packageId).join(', ')}: ${failures.map((failure) => failure.message).join('; ')}`,
        );
      }
    });
    return stopDisposal;
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

  /**
   * #1003 HF23: the non-throwing visibility probe of the SAME pick
   * requirePrincipalRole makes (an intent without a bound role set admits
   * everyone, exactly like the call gate's 'anonymous'); discovery hides
   * what the authenticated principal could not call.
   */
  function roleAdmittedByIntent(principal: V8GatewayPrincipal, intentType: string): boolean {
    const roles = resolveIntentRoles(intentType);
    if (roles === undefined) return true;
    return principal.roles.some((role) => roles.includes(role));
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

  /**
   * The single authenticated Kernel-occurrence request construction
   * (#1013 I02, shared verbatim by submitAs and the #1023 S04 effectful
   * OperationCall): intent shape check, sealed-intent binding check, the
   * principal's tenant/app-qualified instance address and the caller
   * derived ONLY from the issuer-signed roles ∩ the sealed Business binding
   * roles. `send` and an effectful OperationCall can never diverge — they
   * are the same unbypassable route. [#1062] An optional `turnSource`
   * (trusted-Host-derived durable control source) rides along verbatim;
   * the public send path never supplies one.
   */
  function buildKernelOccurrenceRequest(principal: V8GatewayPrincipal, request: {
    readonly intentType: string;
    readonly messageId: string;
    readonly instanceKey: string;
    readonly input?: unknown;
    readonly turnSource?: unknown;
  }): Record<string, unknown> {
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
      ...(request.turnSource === undefined ? {} : { turnSource: request.turnSource }),
    };
    assertPlainJsonIntent(kernelRequest);
    return kernelRequest;
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
      readonly turnSource?: unknown;
    }, control?: V8OccurrenceControl): Promise<unknown> {
      assertOpen();
      requirePrincipal(principal);
      const kernelRequest = buildKernelOccurrenceRequest(principal, request);
      // #1003 FR07-KH2: the protected control stays OUT of the plain-JSON
      // request; the Kernel validates it and owns the latch it drives.
      return control === undefined
        ? kernelRuntime.submitOccurrence(kernelRequest)
        : kernelRuntime.submitOccurrence(kernelRequest, control);
    },
    roleAdmitted(principal: V8GatewayPrincipal, intentType: string): boolean {
      assertOpen();
      requirePrincipal(principal);
      return roleAdmittedByIntent(principal, intentType);
    },
    async queryInstance(principal: V8GatewayPrincipal, instanceKey: string): Promise<unknown> {
      assertOpen();
      requirePrincipal(principal);
      const key = requireInstanceKey(instanceKey);
      return kernelRuntime.getSnapshot({ workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) });
    },
    async queryDecisionReceipt(principal: V8GatewayPrincipal, request: {
      readonly instanceKey: string;
      readonly messageId: string;
    }): Promise<unknown> {
      assertOpen();
      requirePrincipal(principal);
      const key = requireInstanceKey(request.instanceKey);
      if (typeof request.messageId !== 'string' || request.messageId.length === 0) {
        throw typedError('INTENT_MALFORMED', 'a decision-receipt read requires a non-empty messageId');
      }
      const runtimeWithReceiptRead = kernelRuntime as WiredKernelRuntime & { getDecisionReceipt: (request: unknown) => unknown };
      if (typeof runtimeWithReceiptRead.getDecisionReceipt !== 'function') {
        throw typedError('DECISION_RECEIPT_ENDPOINT_INVALID', `kernel package ${kernelBinding.packageId} mechanism exposes no decision-receipt read endpoint`);
      }
      // Same authority discipline as buildKernelOccurrenceRequest: the
      // address and the caller are derived ONLY from the verified
      // principal — intent data never chooses them here either.
      return runtimeWithReceiptRead.getDecisionReceipt({
        target: { workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) },
        messageId: request.messageId,
        caller: { subject: principal.subject, tenantId: principal.tenantId, appId: principal.appId, roles: [...principal.roles] },
      });
    },
    async queryMutationObservations(principal: V8GatewayPrincipal, request: {
      readonly instanceKey: string;
      readonly afterCursor?: string;
      readonly limit?: number;
    }): Promise<unknown> {
      assertOpen();
      requirePrincipal(principal);
      const key = requireInstanceKey(request.instanceKey);
      if (request.afterCursor !== undefined && (typeof request.afterCursor !== 'string' || request.afterCursor.length === 0)) {
        throw typedError('INTENT_MALFORMED', 'a mutation-observation read cursor, when present, must be a non-empty string');
      }
      if (request.limit !== undefined && (typeof request.limit !== 'number' || !Number.isSafeInteger(request.limit) || request.limit < 1)) {
        throw typedError('INTENT_MALFORMED', 'a mutation-observation read limit, when present, must be a positive safe integer');
      }
      const runtimeWithObservationRead = kernelRuntime as WiredKernelRuntime & { readMutationObservations: (request: unknown) => unknown };
      if (typeof runtimeWithObservationRead.readMutationObservations !== 'function') {
        throw typedError('MUTATION_OBSERVATION_ENDPOINT_INVALID', `kernel package ${kernelBinding.packageId} mechanism exposes no mutation-observation read endpoint`);
      }
      // Same authority discipline as queryDecisionReceipt: the stream
      // address is derived ONLY from the verified principal.
      return runtimeWithObservationRead.readMutationObservations({
        target: { workflowId: resolveWorkflowKey(), instanceKey: qualifiedInstanceKey(principal, key) },
        ...(request.afterCursor === undefined ? {} : { afterCursor: request.afterCursor }),
        ...(request.limit === undefined ? {} : { limit: request.limit }),
      });
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
    async invokeOperation(principal: V8GatewayPrincipal, call: V8OperationCall, control?: V8OccurrenceControl): Promise<unknown> {
      assertOpen();
      requirePrincipal(principal);
      if (typeof call !== 'object' || call === null) {
        throw typedError('OPERATION_CALL_MALFORMED', 'an OperationCall must be a plain record {capabilityId, operationId, input?}');
      }
      const callRecord = call as unknown as Record<string, unknown>;
      if (typeof callRecord.capabilityId !== 'string' || callRecord.capabilityId.length === 0) {
        throw typedError('OPERATION_CALL_MALFORMED', 'OperationCall.capabilityId must be a non-empty string');
      }
      if (typeof callRecord.operationId !== 'string' || callRecord.operationId.length === 0) {
        throw typedError('OPERATION_CALL_MALFORMED', 'OperationCall.operationId must be a non-empty string');
      }
      const capability = capabilityOperations.get(callRecord.capabilityId);
      if (capability === undefined) {
        throw typedError(
          'OPERATION_CAPABILITY_UNKNOWN',
          `capability ${callRecord.capabilityId} is not bound in this sealed package closure; the callable surface is BUILD-fixed with no runtime discovery`,
        );
      }
      const operation = capability.operations.get(callRecord.operationId);
      if (operation === undefined) {
        throw typedError(
          'OPERATION_UNKNOWN',
          `operation ${callRecord.operationId} is not declared callable on capability ${callRecord.capabilityId} in this sealed closure`,
        );
      }
      if (operation.effectClass === 'none') {
        // PURE dispatch: the ONLY inputs are the plain-JSON OperationCall
        // data. No Host/Kernel port, no State/Journal/Effect contact, and
        // no occurrence address may ride (one surface, one meaning).
        if (callRecord.instanceKey !== undefined || callRecord.messageId !== undefined) {
          throw typedError('OPERATION_CALL_MALFORMED', 'a pure OperationCall carries no occurrence address (instanceKey/messageId)');
        }
        const visibilityIntent = operation.visibilityIntentType as string;
        // B-governed visibility: the issuer-signed principal must hold a
        // role the SEALED Business intent binding admits — the same gate as
        // an authenticated send, decided by the same sealed policy data.
        requirePrincipalRole(principal, visibilityIntent);
        const input = callRecord.input === undefined ? null : callRecord.input;
        assertOperationJsonData(input, '$operationCall.input', 'OPERATION_INPUT_INVALID');
        let output: unknown;
        try {
          output = await operation.handler(input);
        } catch (error) {
          throw typedError('OPERATION_HANDLER_FAILED', `operation ${callRecord.operationId} handler failed: ${errorMessage(error)}`);
        }
        assertOperationJsonData(output, '$operationCall.output', 'OPERATION_OUTPUT_INVALID');
        return output;
      }
      // EFFECTFUL dispatch: the capability handler is NEVER executed here.
      // The call is an authenticated Kernel occurrence like send — the
      // sealed Business intent owns the role/guard/invariant and the effect
      // declaration, and the physical handler runs only behind the
      // Kernel's effect dispatch (Admission → Journal → Effect) as the
      // Host-provisioned resource adapter. This branch constructs the SAME
      // request submitAs builds — there is no alternate K/S composition.
      if (typeof callRecord.messageId !== 'string' || callRecord.messageId.length === 0 || typeof callRecord.instanceKey !== 'string' || callRecord.instanceKey.length === 0) {
        throw typedError('OPERATION_CALL_MALFORMED', 'an effectful OperationCall must carry the occurrence address (instanceKey and messageId) exactly like an authenticated send');
      }
      const kernelRequest = buildKernelOccurrenceRequest(principal, {
        intentType: operation.intentType as string,
        messageId: callRecord.messageId,
        instanceKey: callRecord.instanceKey,
        input: callRecord.input,
      });
      return control === undefined
        ? kernelRuntime.submitOccurrence(kernelRequest)
        : kernelRuntime.submitOccurrence(kernelRequest, control);
    },
    operationResourceAdapters(): readonly V8OperationResourceAdapter[] {
      assertOpen();
      return resourceAdapters;
    },
    describeOperationSurface(principal: V8GatewayPrincipal): readonly V8OperationSurfaceDescriptor[] {
      assertOpen();
      requirePrincipal(principal);
      const out: V8OperationSurfaceDescriptor[] = [];
      for (const [capabilityId, capability] of capabilityOperations) {
      for (const [operationId, operation] of capability.operations) {
        const pure = operation.effectClass === 'none';
        const governingIntent = pure ? operation.visibilityIntentType : operation.intentType;
        out.push(Object.freeze({
          capabilityId,
          operationId,
          effectClass: operation.effectClass,
          agentExposed: operation.agent === true,
          ...(pure && operation.visibilityIntentType !== undefined ? { visibilityIntentType: operation.visibilityIntentType } : {}),
          ...(!pure && operation.intentType !== undefined ? { admissionIntentType: operation.intentType } : {}),
          principalAdmitted: governingIntent === undefined ? true : roleAdmittedByIntent(principal, governingIntent),
        }));
      }
      }
      return Object.freeze(out);
    },
    ...(retainedProjection === undefined ? {} : { retainedProjection }),
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
