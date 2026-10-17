/**
 * DomainHarness v0.9 N08 (#1036) — the ONE executable H→K runtime bridge.
 * ===========================================================================
 *
 * INTERNAL TRUSTED COMPOSITION ONLY. This module is NOT re-exported from
 * `./v9` or any public subpath: there is deliberately no public constructor
 * that could accept a caller-supplied Host, Authenticator, Kernel, store or
 * module namespace. Only the trusted deployment/Host bootstrap composes it:
 *
 *   createV09DomainHarnessBridge({ store, trustedIssuers, audience,
 *     runtimeAbi, hostAbi, authenticator, presentation })
 *
 * …over the SAME trusted ingredients `createProtectedHostV09` consumes. It
 * consumes — never duplicates — the merged protected components:
 *
 *   - #1032 protected H registry: `activate(installedRef)` performs the real
 *     reference lookup, audience/ABI binding, stored-bytes re-hash, zero-import
 *     AST repeat, current approval proof and the shared per-subject CAS epoch
 *     commit, then evaluates the sealed bytes into REAL per-activation
 *     `data:` ESM namespaces (D01/D02).
 *   - #1124 trusted private principal authority: every `send`/`query`/effect
 *     mint re-authenticates the trusted presentation at the requested purpose
 *     (audience/app/tenant/subject/grant/epoch/expiry re-checked at every
 *     sensitive use — D03).
 *   - #1126 one-shot physical effect permit on the SAME shared per-subject
 *     CAS authority: `resources.call` mints a permit BEFORE the sealed
 *     capability handler executes; revoke-first refuses typed, permit-first
 *     completes truthfully (honest in-flight rule, D02/D03).
 *   - #1027 selected ABI discipline: the pure Standard WorkflowRouter runs
 *     from the SEALED standard module's own evaluated namespace, over the
 *     sealed route rows; a `missing`/`ambiguous`/`denied` outcome and a
 *     router result that does not exactly match one sealed route row
 *     (including the `sha256:<subjectDigest>` basis) admits nothing.
 *   - the selected Kernel mechanism (`createOccurrenceRuntime`) from the
 *     sealed kernel module's own namespace — the Kernel alone owns
 *     Admission, State, Journal, Effect and UNKNOWN; this bridge adds no
 *     second Runtime, Journal or Admission engine. K-owned durable docs ride
 *     the SAME injected physical store under `v9/k/<subjectDigest>/<tenantId>/`
 *     through a condition-shape adapter (per-tenant physical isolation).
 *
 * `load(installedRef: string)` is the one public input: exactly the opaque
 * H-issued reference string. `send`/`query` accept caller business data
 * only; authenticated identity and scope are always H-sourced. Public
 * failures collapse onto the frozen D04 families; protected subcodes stay
 * on the internal bridge diagnostics channel.
 *
 * #1120 lifecycle wiring: `subscribe`/`stop` are the #1120 scoped
 * lifecycle over THIS bridge's trusted ports — the selected Kernel's own
 * `observe` receipt side-channel (wired into `createOccurrenceRuntime`),
 * a REAL #1126 one-shot delivery permit minted on the shared per-subject
 * CAS authority at subscription, the #1124 fresh principal issue at every
 * `subscribe`/`delivery`/`stop` purpose, and the private #1120
 * `recheckDeliveryAuthorization` seam answering from the CURRENT authority
 * record (revoked / expired / unknown-permit refuse; a recorded unexpired
 * permit digest is authorized with its epoch) on EVERY sensitive delivery.
 * The per-facade `dispose` mirrors the bridge's own trusted teardown for
 * exactly that facade. No second Runtime, Journal, issuer or observer
 * authority is created here.
 */

import { createHash, randomUUID } from 'node:crypto';
import { createProtectedHostV09, parseV09SealedRoot, readV09SubjectAuthority, type ProtectedHostV09, type V09ActivationRecord, type V09SealedQualifiedRootData } from '../host-v9/registry.js';
import { V09HostError, governanceRefusal } from '../host-v9/errors.js';
import { storeFailureToHostError, V09HostStoreError, type V09HostDocumentStore, type V09StorePutCondition } from '../host-v9/store-port.js';
import type { V09TrustedIssuers } from '../host-v9/approval.js';
import { createV09EffectPermitAuthority } from '../host-v9/effect-permit.js';
import { createV09PrivatePrincipalAuthority, V09PrivateScopeError, type V09HostVerifiedIdentity, type V09PrivateHostAuthenticator, type V09PrivatePrincipalToken } from '../operations-v9/private-principal.js';
import { createV09ScopedLifecycle, type V09SelectedReceipt, type V09ScopedLifecyclePorts } from '../operations-v9/stream-lifecycle.js';
import { DomainHarnessV9Error, V9_PUBLIC_ERROR_CODES, type V9PublicErrorCode } from './errors.js';
import { attachV09TrustedBridge, runV09InTrustedHostScope } from './runtime-channel.js';
import type {
  V9DomainFacade,
  V9DomainHarness,
  V9PublicLoadedPackage,
  V9PublicSendIntent,
  V9PublicInstanceQuery,
  V9PublicSubscription,
} from './contracts.js';

const HEX64 = /^[0-9a-f]{64}$/;
const SAFE_ID = /^[A-Za-z][A-Za-z0-9._:-]{0,127}$/;
const MAX_STRING = 512;
/** The registry's content-addressed artifact key prefix (kept in lockstep with registry.ts). */
const ARTIFACT_PREFIX = 'v9/artifact/';
/** K-owned durable document namespace on the SAME injected store (per subject AND tenant). */
const K_DOCS_PREFIX = 'v9/k/';
/** Bounded internal diagnostics retention; protected subcodes never travel publicly. */
const MAX_DIAGNOSTICS = 256;

/** A private brand: arbitrary same-shape JS objects may not register as H. */
const constructedV09Harnesses = new WeakSet<object>();

/** Internal channel verification; does NOT return a Host or privileged port. */
export function isV09AuthenticatedBridgeHarness(value: unknown): value is V9DomainHarness {
  return typeof value === 'object' && value !== null && constructedV09Harnesses.has(value);
}

export interface V09BridgeBootstrap {
  /** The SAME physical store the protected H registry was bootstrapped with. */
  readonly store: V09HostDocumentStore;
  readonly trustedIssuers: V09TrustedIssuers;
  readonly audience: string;
  readonly runtimeAbi: string;
  readonly hostAbi: string;
  /** Trusted Host caller authenticator (#1124 port); deployment material, never public. */
  readonly authenticator: V09PrivateHostAuthenticator;
  /** The deployment's authenticated caller presentation, fixed at composition. */
  readonly presentation: unknown;
  /** Trusted activation authority class; fixed by the deployment profile, never caller input. */
  readonly authorityClass?: string;
  /** Trusted monotonic-enough Host clock; test injection internal. */
  readonly nowMs?: () => number;
}

/** Internal typed refusal carrying the D04 public family + protected subcode. */
class V09BridgeRefusalError extends Error {
  readonly internalCode: string;
  readonly publicCode: V9PublicErrorCode;
  constructor(internalCode: string, publicCode: V9PublicErrorCode, message: string) {
    super(message);
    this.name = 'V09BridgeRefusalError';
    this.internalCode = internalCode;
    this.publicCode = publicCode;
  }
}

export interface V09BridgeDiagnostic {
  readonly at: string;
  readonly operation: string;
  readonly internalCode: string;
  readonly publicCode: V9PublicErrorCode;
}

/** The #1120 delivery-recheck seam answer for a still-current one-shot permit. */
export interface V09DeliveryAuthorization {
  readonly decision: 'authorized';
  readonly authorityEpoch: number;
  readonly expiresAtMs: number;
}

export interface V09ComposedBridge {
  /** The public value: `load` is the ONLY method; no host/kernel/namespace escape. */
  readonly harness: V9DomainHarness;
  /** Host-only request scope: never exposed from the published ./v9 value. */
  runWithinTrustedContext<T>(action: () => T | Promise<T>): Promise<T>;
  /** The trusted governance channel (the protected H this bridge composed). */
  host(): Promise<ProtectedHostV09>;
  /** Private #1120 seam: current-authority delivery authorization recheck. */
  recheckDeliveryAuthorization(subjectDigest: unknown, permitDigest: unknown): Promise<V09DeliveryAuthorization>;
  /** Trusted-internal protected subcode channel (never public). */
  drainBridgeDiagnostics(): readonly V09BridgeDiagnostic[];
  /** Trusted lifecycle teardown: invalidates every facade and closes the host. */
  close(): Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function boundedId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new V09BridgeRefusalError('BRIDGE_INPUT_INVALID', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, `${label} must satisfy the bounded v0.9 identifier grammar`);
  }
  return value;
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * Duck-typed kernel-error inspection: sealed modules evaluate on private
 * `data:` URLs, so an instanceof check never crosses that boundary — the
 * Kernel's own documented contract is the `code` string.
 */
function kernelErrorCode(error: unknown): string | undefined {
  if (isRecord(error) && typeof error.code === 'string') return error.code;
  return undefined;
}

function isKernelAmbiguousEffect(code: string | undefined): boolean {
  return code === 'ADMISSION_EFFECT_JOURNAL_CONFLICT' || code === 'ADMISSION_EFFECT_AMBIGUOUS';
}

function isAlreadyExists(error: unknown): boolean {
  const code = kernelErrorCode(error);
  return code === 'HOST_CAS_CONFLICT' || code === 'HOST_KEY_EXISTS';
}

/**
 * K-owned document port over the SAME injected physical store. The selected
 * Kernel's v0.8 port face uses `{mustBeAbsent}|{mustMatchRevision}` with
 * `code === 'HOST_CAS_CONFLICT'` rejections; this adapter maps the shapes
 * 1:1 and preserves the fail-closed discipline (unconditional writes do not
 * exist on either side). `list` is not available on the v0.9 host document
 * port and fails typed instead of guessing (the Kernel only consumes it on
 * its `getRecords` diagnostic surface; the durable journal is inspected
 * through the raw trusted store).
 */
function kernelDocsPort(store: V09HostDocumentStore, subjectDigest: string, tenantId: string) {
  const prefix = `${K_DOCS_PREFIX}${subjectDigest}/${tenantId}/`;
  return {
    async get(key: string): Promise<{ value: unknown; revision: number } | null> {
      try {
        return await store.get(`${prefix}${key}`);
      } catch (error) {
        throw storeFailureToHostError(error, 'K document read');
      }
    },
    async put(key: string, value: unknown, condition: unknown): Promise<{ revision: number }> {
      let mapped: V09StorePutCondition;
      const revision = isRecord(condition) ? condition.mustMatchRevision : undefined;
      if (isRecord(condition) && condition.mustBeAbsent === true) {
        mapped = { kind: 'create' };
      } else if (typeof revision === 'number' && Number.isSafeInteger(revision)) {
        mapped = { kind: 'cas', revision };
      } else {
        throw new V09HostStoreError('V09_STORE_MISUSE', `K document write of ${key} requires a physical revision expectation; unconditional writes do not exist on this port`);
      }
      try {
        return await store.put(`${prefix}${key}`, value, mapped);
      } catch (error) {
        if (error instanceof V09HostStoreError && error.code === 'V09_STORE_CONFLICT') {
          // The Kernel duck-checks this exact code; preserve its contract.
          throw Object.assign(new Error(error.message), { code: 'HOST_CAS_CONFLICT' });
        }
        throw storeFailureToHostError(error, 'K document write');
      }
    },
    async list(): Promise<readonly string[]> {
      throw new V09HostStoreError('V09_STORE_MISUSE', 'K document scan is not available on the v0.9 host document port');
    },
  };
}

interface SealedTables {
  readonly root: V09SealedQualifiedRootData;
  readonly kernelPackageId: string;
  readonly standardPackageId: string;
  readonly businessPackageIds: readonly string[];
  readonly intents: ReadonlyMap<string, string>;
  readonly capabilities: ReadonlyMap<string, { packageId: string; handlers: ReadonlyMap<string, string> }>;
  readonly routes: ReadonlyMap<string, readonly { operationId: string; capabilityId: string; handlerId: string }[]>;
}

/**
 * Re-derive the selected closure tables from the STORED sealed root through
 * the SAME strict parser the registry uses (trusted internal path), and
 * enforce the #1027 selected-ABI discipline the v0.9 registry parse does not
 * cover: every route row must name a sealed intent, a sealed capability and
 * the exact sealed handler for its operation.
 */
function buildSealedTables(root: V09SealedQualifiedRootData): SealedTables {
  let kernelPackageId: string | undefined;
  let standardPackageId: string | undefined;
  const businessPackageIds: string[] = [];
  const intents = new Map<string, string>();
  const capabilities = new Map<string, { packageId: string; handlers: ReadonlyMap<string, string> }>();
  const routes = new Map<string, { operationId: string; capabilityId: string; handlerId: string }[]>();
  for (const row of root.bindings) {
    if (row.role === 'kernel') kernelPackageId = row.packageId;
    else if (row.role === 'standard-sdk') standardPackageId = row.packageId;
    else if (row.role === 'business') businessPackageIds.push(row.packageId);
    else if (row.role === 'intent') intents.set(row.intentType, row.packageId);
    else if (row.role === 'capability') {
      const handlers = new Map<string, string>();
      for (const handler of row.handlers) handlers.set(handler.operationId, handler.handler);
      capabilities.set(row.capabilityId, { packageId: row.packageId, handlers });
    } else if (row.role === 'route') {
      const rows = routes.get(row.intentId) ?? [];
      rows.push({ operationId: row.operationId, capabilityId: row.capabilityId, handlerId: row.handlerId });
      routes.set(row.intentId, rows);
    }
  }
  if (kernelPackageId === undefined || standardPackageId === undefined || businessPackageIds.length === 0) {
    throw new V09BridgeRefusalError('BRIDGE_ABI_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'the sealed closure must select one Kernel, one Standard SDK and at least one Business package');
  }
  for (const [intentId, rows] of routes) {
    if (!intents.has(intentId)) {
      throw new V09BridgeRefusalError('BRIDGE_ROUTE_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `route intent ${intentId} is not sealed as a business intent binding of this closure`);
    }
    for (const row of rows) {
      const capability = capabilities.get(row.capabilityId);
      if (capability === undefined) {
        throw new V09BridgeRefusalError('BRIDGE_ROUTE_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `route intent ${intentId} names capability ${row.capabilityId} which is not sealed in this closure`);
      }
      const sealedHandler = capability.handlers.get(row.operationId);
      if (sealedHandler === undefined) {
        throw new V09BridgeRefusalError('BRIDGE_ROUTE_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `route intent ${intentId} names operation ${row.operationId} which capability ${row.capabilityId} does not seal`);
      }
      if (sealedHandler !== row.handlerId) {
        throw new V09BridgeRefusalError('BRIDGE_ROUTE_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `route intent ${intentId} claims handler ${row.handlerId} but the sealed binding pins ${sealedHandler} for ${row.operationId}`);
      }
    }
  }
  return { root, kernelPackageId, standardPackageId, businessPackageIds, intents, capabilities, routes };
}

interface FacadeRuntime {
  readonly submitOccurrence: (request: unknown) => Promise<unknown>;
  readonly openInstance: (request: unknown) => Promise<unknown>;
  readonly getSnapshot: (target: unknown) => Promise<unknown>;
}

/**
 * One #1120 subscription's seat on the selected Kernel receipt side-channel.
 * The permitDigest is the REAL #1126 one-shot delivery permit minted (on the
 * shared per-subject CAS authority) when this subscription attached; every
 * envelope built for it re-presents that digest for the live #1120 recheck.
 */
interface ReceiptListenerRegistration {
  readonly permitDigest: string;
  readonly deliver: (event: V09SelectedReceipt) => void;
}

interface ActiveFacade {
  readonly packageRecord: V9PublicLoadedPackage;
  readonly tables: SealedTables;
  readonly namespaces: ReadonlyMap<string, Record<string, unknown>>;
  readonly tenantId: string;
  readonly principal: ReturnType<typeof createV09PrivatePrincipalAuthority>;
  readonly permit: ReturnType<typeof createV09EffectPermitAuthority>;
  readonly runtimes: Map<string, FacadeRuntime>;
  readonly receiptListeners: Set<ReceiptListenerRegistration>;
  closed: boolean;
}

/**
 * Compose the ONE executable bridge. Trusted bootstrap only; the returned
 * `harness` is the public `V9DomainHarness` value (`load` alone).
 */
export function createV09DomainHarnessBridge(bootstrap: V09BridgeBootstrap): V09ComposedBridge {
  if (!isRecord(bootstrap)) {
    throw new V09BridgeRefusalError('BRIDGE_BOOTSTRAP_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'createV09DomainHarnessBridge requires a trusted bootstrap record');
  }
  const { store, trustedIssuers, authenticator, presentation } = bootstrap;
  if (typeof store !== 'object' || store === null || typeof store.get !== 'function' || typeof store.put !== 'function' || typeof store.close !== 'function') {
    throw new V09BridgeRefusalError('BRIDGE_BOOTSTRAP_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'the bridge requires the SAME injected V09HostDocumentStore the protected H registry uses');
  }
  if (!(trustedIssuers instanceof Map) || trustedIssuers.size === 0) {
    throw new V09BridgeRefusalError('BRIDGE_BOOTSTRAP_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'the bridge requires the trusted issuer registry the protected H registry was bootstrapped with');
  }
  if (!isRecord(authenticator) || typeof (authenticator as V09PrivateHostAuthenticator).authenticate !== 'function') {
    throw new V09BridgeRefusalError('BRIDGE_BOOTSTRAP_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'the bridge requires the trusted Host caller authenticator (#1124 port) — never a caller-supplied callback');
  }
  const now = bootstrap.nowMs ?? Date.now;
  const audience = typeof bootstrap.audience === 'string' && bootstrap.audience.length > 0 ? bootstrap.audience : '';
  const runtimeAbi = typeof bootstrap.runtimeAbi === 'string' && bootstrap.runtimeAbi.length > 0 ? bootstrap.runtimeAbi : '';
  const hostAbi = typeof bootstrap.hostAbi === 'string' && bootstrap.hostAbi.length > 0 ? bootstrap.hostAbi : '';
  if (audience === '' || runtimeAbi === '' || hostAbi === '') {
    throw new V09BridgeRefusalError('BRIDGE_BOOTSTRAP_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'the bridge requires non-empty audience/runtimeAbi/hostAbi');
  }
  const authorityClass = typeof bootstrap.authorityClass === 'string' && bootstrap.authorityClass.length > 0 ? bootstrap.authorityClass : 'PRODUCTION';

  const diagnostics: V09BridgeDiagnostic[] = [];
  function recordDiag(operation: string, internalCode: string, publicCode: V9PublicErrorCode): void {
    if (diagnostics.length >= MAX_DIAGNOSTICS) diagnostics.shift();
    diagnostics.push({ at: new Date(now()).toISOString(), operation, internalCode, publicCode });
  }

  let hostPromise: Promise<ProtectedHostV09> | undefined;

  function hostInstance(): Promise<ProtectedHostV09> {
    if (hostPromise === undefined) {
      hostPromise = createProtectedHostV09({ store, trustedIssuers, audience, runtimeAbi, hostAbi }).catch((error: unknown) => {
        hostPromise = undefined;
        throw error;
      });
    }
    return hostPromise;
  }

  /** Collapse ANY protected refusal onto the frozen D04 public families. */
  function toPublicError(error: unknown, operation: string): DomainHarnessV9Error {
    if (error instanceof DomainHarnessV9Error) return error;
    let internalCode = 'UNKNOWN_REFUSAL';
    let publicCode: V9PublicErrorCode = V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED;
    if (error instanceof V09BridgeRefusalError) {
      internalCode = error.internalCode;
      publicCode = error.publicCode;
    } else if (error instanceof V09PrivateScopeError) {
      internalCode = 'V09_PRIVATE_SCOPE_DENIED';
      publicCode = V9_PUBLIC_ERROR_CODES.CALLER_SCOPE_DENIED;
    } else if (error instanceof V09HostError) {
      internalCode = error.diagnosticCode;
      publicCode = error.code === 'UNSUPPORTED_RUNTIME_ABI'
        ? V9_PUBLIC_ERROR_CODES.UNSUPPORTED_RUNTIME_ABI
        : error.code === 'ACTIVATION_EVAL_FAILED' ? V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED : V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED;
    } else {
      const code = kernelErrorCode(error);
      if (isKernelAmbiguousEffect(code)) {
        // The Kernel's own honest UNKNOWN: the physical effect may have
        // landed but its terminal journal commit is ambiguous — no false ACK.
        internalCode = `KERNEL_${code ?? 'AMBIGUOUS'}`;
        publicCode = V9_PUBLIC_ERROR_CODES.EFFECT_UNKNOWN;
      } else if (code !== undefined) {
        internalCode = `KERNEL_${code}`;
        publicCode = V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED;
      }
    }
    recordDiag(operation, internalCode, publicCode);
    return new DomainHarnessV9Error(publicCode);
  }

  /** Trusted read of the stored sealed-root artifact (the registry's own content-addressed key). */
  async function readStoredRoot(subjectDigest: string): Promise<V09SealedQualifiedRootData> {
    let doc: { value: unknown } | null;
    try {
      doc = await store.get(`${ARTIFACT_PREFIX}${subjectDigest}`);
    } catch (error) {
      throw storeFailureToHostError(error, 'bridge artifact lookup');
    }
    if (doc === null) {
      throw new V09BridgeRefusalError('INSTALL_ARTIFACT_MISSING', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'the installed reference resolves to a missing immutable artifact');
    }
    return parseV09SealedRoot(doc.value);
  }

  /** Fresh load-time identity binding: the trusted presentation must be CURRENT for this subject/app. */
  async function preflightIdentity(subjectDigest: string, rootPackageId: string): Promise<V09HostVerifiedIdentity> {
    let identity: unknown;
    try {
      identity = await authenticator.authenticate(presentation);
    } catch {
      throw new V09BridgeRefusalError('BRIDGE_CALLER_UNAUTHENTICATED', V9_PUBLIC_ERROR_CODES.CALLER_SCOPE_DENIED, 'the trusted presentation no longer authenticates');
    }
    const expiresAtMs = isRecord(identity) ? identity.expiresAtMs : undefined;
    if (!isRecord(identity)
      || identity.hostAudience !== audience
      || identity.appId !== rootPackageId
      || identity.selectedClosureDigest !== subjectDigest
      || typeof identity.tenantId !== 'string'
      || !Array.isArray(identity.grants)
      || typeof expiresAtMs !== 'number'
      || !Number.isSafeInteger(expiresAtMs)
      || expiresAtMs <= now()) {
      throw new V09BridgeRefusalError('BRIDGE_CALLER_SCOPE_MISMATCH', V9_PUBLIC_ERROR_CODES.CALLER_SCOPE_DENIED, 'the verified principal is not current for this subject/app/audience');
    }
    return identity as unknown as V09HostVerifiedIdentity;
  }

  const facades = new Set<ActiveFacade>();
  let bridgeClosed = false;

  function requireNamespace(namespaces: ReadonlyMap<string, Record<string, unknown>>, packageId: string, label: string): Record<string, unknown> {
    const namespace = namespaces.get(packageId);
    if (namespace === undefined || typeof namespace !== 'object') {
      throw new V09BridgeRefusalError('BRIDGE_ABI_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `activated closure is missing the ${label} package namespace`);
    }
    return namespace;
  }

  function requireExport(namespace: Record<string, unknown>, name: string, label: string): void {
    if (typeof namespace[name] !== 'function') {
      throw new V09BridgeRefusalError('BRIDGE_ABI_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `${label} does not export the selected ABI function '${name}'`);
    }
  }

  /** The #1124 grant purpose-operation for every scoped lifecycle check. */
  const LIFECYCLE_OPERATION_ID = 'lifecycle';

  /**
   * The selected Kernel's `observe` receipt side-channel for ONE facade
   * (passed into every `createOccurrenceRuntime` this bridge composes).
   * Each committed K occurrence fans out as a scope-bound, permit-carrying
   * envelope to the #1120 lifecycle subscriptions attached to this facade.
   * The Kernel's side-channel is best-effort by its own contract; a failing
   * downstream entry never mutates the authoritative occurrence.
   */
  function kernelObserveFor(facade: ActiveFacade): (receipt: unknown) => void {
    return (receipt: unknown): void => {
      for (const registration of facade.receiptListeners) {
        try {
          registration.deliver({
            subjectDigest: facade.tables.root.subjectDigest,
            appId: facade.packageRecord.rootPackageId,
            tenantId: facade.tenantId,
            permitDigest: registration.permitDigest,
            // One private copy per subscriber: an observer mutating its own
            // receipt can never corrupt the send caller's value, another
            // subscriber's copy, or any durable K record. A non-cloneable
            // receipt fails closed into the swallow below.
            receipt: structuredClone(receipt),
          });
        } catch {
          // Same best-effort discipline as K's own safeObserve; the #1120
          // lifecycle itself never throws synchronously into this seam.
        }
      }
    };
  }

  /**
   * Compose the #1120 scoped lifecycle for ONE activated facade over this
   * bridge's real trusted ports only: #1124 fresh principal issues at every
   * subscribe/delivery/stop purpose, a REAL #1126 delivery-permit mint on
   * the shared per-subject CAS authority at attachment, the #1129 CURRENT
   * delivery recheck on every sensitive delivery, and the per-facade
   * trusted teardown as dispose. No second authority is created here.
   *
   * Honest liveness semantics (fail-closed by design, #1120 N-cases): the
   * delivery permit lives exactly as long as the verified presentation
   * scope; once it expires or the subject authority is revoked, later
   * deliveries are silently REFUSED (a stale stream never delivers) and
   * only a fresh subscribe under a current principal re-attaches.
   */
  function composeFacadeLifecycle(facade: ActiveFacade): ReturnType<typeof createV09ScopedLifecycle> {
    const ports: V09ScopedLifecyclePorts = {
      subjectDigest: facade.tables.root.subjectDigest,
      appId: facade.packageRecord.rootPackageId,
      tenantId: facade.tenantId,
      authorize: async (purpose): Promise<void> => {
        try {
          if (facade.closed || bridgeClosed) {
            throw new V09BridgeRefusalError('BRIDGE_CLOSED', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `the facade lifecycle requires an open facade at purpose ${purpose}`);
          }
          // D03: a FRESH trusted principal issue per purpose — the frozen
          // composition presentation re-authenticated at every use.
          await facade.principal.issue(presentation, LIFECYCLE_OPERATION_ID, purpose);
        } catch (error) {
          void toPublicError(error, `lifecycle-${purpose}`); // protected subcode stays internal
          throw error;
        }
      },
      recheckDeliveryAuthorization: async (subjectDigest, permitDigest) => {
        try {
          return await recheckDeliveryAuthorization(subjectDigest, permitDigest);
        } catch (error) {
          void toPublicError(error, 'lifecycle-delivery'); // protected subcode stays internal
          throw error;
        }
      },
      observeSelectedReceipts: async (listener) => {
        // The delivery credential: ONE real one-shot #1126 permit tuple on
        // the shared per-subject CAS authority (fresh #1124 effect-purpose
        // recheck at mint). Its recorded, unexpired presence — re-read from
        // the CURRENT record on EVERY delivery — is what later authorizes
        // each sensitive delivery; revocation or expiry refuses it.
        let permitReceipt: Awaited<ReturnType<typeof facade.permit.mint>>;
        try {
          if (facade.closed || bridgeClosed) {
            throw new V09BridgeRefusalError('BRIDGE_CLOSED', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'the facade lifecycle requires an open facade to attach a subscription');
          }
          const token: V09PrivatePrincipalToken = await facade.principal.issue(presentation, 'delivery', 'effect');
          const nonce = `dhv9sub-${randomUUID()}`;
          permitReceipt = await facade.permit.mint(token, { operationId: 'delivery', effectId: `dhv9dly-${sha256Hex(nonce)}`, nonce });
        } catch (error) {
          void toPublicError(error, 'lifecycle-subscribe'); // protected subcode stays internal
          throw error;
        }
        const registration: ReceiptListenerRegistration = { permitDigest: permitReceipt.permitDigest, deliver: listener };
        facade.receiptListeners.add(registration);
        return async (): Promise<void> => {
          facade.receiptListeners.delete(registration);
        };
      },
      dispose: async (): Promise<void> => {
        // Trusted teardown of exactly THIS facade's resources, mirroring the
        // bridge's own close loop: no further send/query/subscribe/effect
        // or lifecycle purpose can start on it.
        facade.closed = true;
        facade.permit.close();
        facade.principal.close();
        facades.delete(facade);
      },
    };
    return createV09ScopedLifecycle(ports);
  }

  async function loadImpl(installedRef: string): Promise<V9DomainFacade> {
    if (bridgeClosed) {
      recordDiag('load', 'BRIDGE_CLOSED', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
      throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
    }
    if (typeof installedRef !== 'string' || installedRef.length === 0 || installedRef.length > MAX_STRING) {
      recordDiag('load', 'INSTALL_HANDLE_UNKNOWN', V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED);
      throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED);
    }
    let record: V09ActivationRecord;
    try {
      record = await (await hostInstance()).activate(installedRef);
    } catch (error) {
      throw toPublicError(error, 'load');
    }
    let tables: SealedTables;
    try {
      const root = await readStoredRoot(record.subjectDigest);
      if (root.subjectDigest !== record.subjectDigest) {
        throw new V09BridgeRefusalError('BRIDGE_SUBJECT_DRIFT', V9_PUBLIC_ERROR_CODES.PACKAGE_NOT_AUTHORIZED, 'stored artifact subject digest does not match the activation');
      }
      tables = buildSealedTables(root);
      // Selected-ABI validation on the REAL activated namespaces, before any
      // facade exists: Kernel runtime factory, Standard Router+interpreter,
      // every sealed capability handler export and every Business policy.
      const kernelNamespace = requireNamespace(record.namespaces, tables.kernelPackageId, 'Kernel');
      requireExport(kernelNamespace, 'createOccurrenceRuntime', `Kernel ${tables.kernelPackageId}`);
      const standardNamespace = requireNamespace(record.namespaces, tables.standardPackageId, 'Standard SDK');
      requireExport(standardNamespace, 'routeWorkflowIntent', `Standard ${tables.standardPackageId}`);
      requireExport(standardNamespace, 'interpret', `Standard ${tables.standardPackageId}`);
      for (const [capabilityId, capability] of tables.capabilities) {
        const namespace = requireNamespace(record.namespaces, capability.packageId, `capability ${capabilityId}`);
        for (const [operationId, handlerName] of capability.handlers) {
          requireExport(namespace, handlerName, `capability ${capabilityId} operation ${operationId}`);
        }
      }
      for (const packageId of tables.businessPackageIds) {
        requireExport(requireNamespace(record.namespaces, packageId, 'Business'), 'getPolicy', `Business ${packageId}`);
      }
    } catch (error) {
      throw toPublicError(error, 'load');
    }
    let identity: V09HostVerifiedIdentity;
    try {
      identity = await preflightIdentity(record.subjectDigest, record.rootPackageId);
    } catch (error) {
      throw toPublicError(error, 'load');
    }
    // Review P1-01 repair: the per-facade authority composition enforces its
    // own identifier grammar (SAFE_ID app/tenant); a trusted-side data defect
    // (e.g. a rootPackageId/tenantId that passes the registry's bounded-string
    // checks but not #1124's grammar) must still collapse onto the frozen D04
    // public families like every other load failure — never leak a raw
    // protected-namespace error shape on the public path.
    let principal: ReturnType<typeof createV09PrivatePrincipalAuthority>;
    let permit: ReturnType<typeof createV09EffectPermitAuthority>;
    try {
      principal = createV09PrivatePrincipalAuthority({
        hostAudience: audience,
        appId: record.rootPackageId,
        tenantId: identity.tenantId,
        subjectDigest: record.subjectDigest,
        authenticator,
        nowMs: (): number => now(),
      });
      permit = createV09EffectPermitAuthority({
        store, trustedIssuers, audience,
        subjectDigest: record.subjectDigest,
        principal, nowMs: (): number => now(),
      });
    } catch (error) {
      throw toPublicError(error, 'load');
    }
    const facade: ActiveFacade = {
      packageRecord: Object.freeze({
        installedRef: record.installedRef,
        activationNonce: record.activationNonce,
        subjectDigest: record.subjectDigest,
        rootPackageId: record.rootPackageId,
        runtimeAbi: record.runtimeAbi,
        hostAbi: record.hostAbi,
        packages: record.packages,
      }),
      tables,
      namespaces: record.namespaces,
      tenantId: identity.tenantId,
      principal,
      permit,
      runtimes: new Map(),
      receiptListeners: new Set(),
      closed: false,
    };
    facades.add(facade);
    const lifecycle = composeFacadeLifecycle(facade);
    return Object.freeze({
      package: facade.packageRecord,
      send: (intent: Readonly<V9PublicSendIntent>): Promise<unknown> => sendImpl(facade, intent),
      query: (query: Readonly<V9PublicInstanceQuery>): Promise<unknown> => queryImpl(facade, query),
      // #1120 scoped lifecycle over this facade's real trusted ports; the
      // H-private delivery drain stays internal to the lifecycle helper.
      subscribe: (observer: (receipt: unknown) => void): Promise<V9PublicSubscription> => lifecycle.subscribe(observer),
      stop: (): Promise<void> => lifecycle.stop(),
    } satisfies V9DomainFacade);
  }

  /** D02 advisory gate: a committed revocation refuses BEFORE any new K activity (the permit CAS remains the authoritative gate). */
  async function refuseIfRevoked(subjectDigest: string, operation: string): Promise<void> {
    let state: Awaited<ReturnType<typeof readV09SubjectAuthority>>;
    try {
      state = await readV09SubjectAuthority(store, subjectDigest, `${operation} authority precheck`);
    } catch (error) {
      throw toPublicError(error, operation);
    }
    if (state.status === 'revoked') {
      throw toPublicError(governanceRefusal('APPROVAL_REVOKED', 'the approval for this installed subject has been revoked'), operation);
    }
    if (state.status === 'absent') {
      throw toPublicError(governanceRefusal('EFFECT_PERMIT_SUBJECT_INACTIVE', 'no activation epoch has committed for this subject'), operation);
    }
  }

  function strictIntent(intent: Readonly<V9PublicSendIntent>): { intentType: string; instanceKey: string; messageId: string; input: unknown } {
    if (!isRecord(intent)) {
      throw new V09BridgeRefusalError('BRIDGE_INPUT_INVALID', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, 'send accepts a record of exactly {intentType, instanceKey, messageId, input?}');
    }
    for (const key of Object.keys(intent)) {
      if (key !== 'intentType' && key !== 'instanceKey' && key !== 'messageId' && key !== 'input') {
        throw new V09BridgeRefusalError('BRIDGE_INPUT_INVALID', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, `send intent carries unsupported field '${key}'; caller data is not authority`);
      }
    }
    return {
      intentType: boundedId(intent.intentType, 'intent.intentType'),
      instanceKey: boundedId(intent.instanceKey, 'intent.instanceKey'),
      messageId: boundedId(intent.messageId, 'intent.messageId'),
      input: intent.input,
    };
  }

  /** The Kernel-owned physical resource port: sealed capability table + #1126 one-shot permit BEFORE dispatch. */
  function resourcesPort(facade: ActiveFacade) {
    return {
      async call(resourceKey: unknown, operation: unknown, payload: unknown): Promise<unknown> {
        const capabilityId = boundedId(resourceKey, 'resource capabilityId');
        const operationId = boundedId(operation, 'resource operationId');
        if (!isRecord(payload)) {
          throw new V09BridgeRefusalError('BRIDGE_EFFECT_INPUT_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'a physical resource call payload must be a record');
        }
        const rawEffectId = payload.effectId;
        if (typeof rawEffectId !== 'string' || rawEffectId.length === 0 || rawEffectId.length > 256) {
          throw new V09BridgeRefusalError('BRIDGE_EFFECT_INPUT_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, 'a physical resource call must carry its Kernel effectId for one-shot permit binding');
        }
        const capability = facade.tables.capabilities.get(capabilityId);
        if (capability === undefined) {
          throw new V09BridgeRefusalError('BRIDGE_EFFECT_ROUTE_UNSEALED', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, `resource ${capabilityId} is not a sealed capability of this closure`);
        }
        const handlerName = capability.handlers.get(operationId);
        if (handlerName === undefined) {
          throw new V09BridgeRefusalError('BRIDGE_EFFECT_ROUTE_UNSEALED', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, `resource ${capabilityId} does not seal operation ${operationId}`);
        }
        const handlerExport = facade.namespaces.get(capability.packageId)?.[handlerName];
        if (typeof handlerExport !== 'function') {
          throw new V09BridgeRefusalError('BRIDGE_ABI_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `sealed handler ${handlerName} is not an export of capability ${capabilityId}`);
        }
        // Deterministic one-shot identity derived from the Kernel effectId: a
        // re-dispatch of the same effect replays the exact permit tuple and
        // is refused (bounded v0.9 identifier grammar; sha256 fits it).
        const effectId = `dhv9fx-${sha256Hex(rawEffectId)}`;
        const nonce = `dhv9nn-${sha256Hex(rawEffectId)}`;
        // Fresh trusted authentication at effect-permit issue time (D03): the
        // #1124 authority re-checks `effect:<operationId>` grant and expiry.
        const token: V09PrivatePrincipalToken = await facade.principal.issue(presentation, operationId, 'effect');
        await facade.permit.mint(token, { operationId, effectId, nonce });
        return await (handlerExport as (payload: unknown) => unknown)(payload);
      },
    };
  }

  /** Lazily compose the selected Kernel occurrence runtime for ONE business package (the kernel module's own mechanism). */
  function runtimeFor(facade: ActiveFacade, businessPackageId: string): FacadeRuntime {
    const existing = facade.runtimes.get(businessPackageId);
    if (existing !== undefined) return existing;
    const kernelNamespace = facade.namespaces.get(facade.tables.kernelPackageId) as Record<string, unknown>;
    const standardNamespace = facade.namespaces.get(facade.tables.standardPackageId) as Record<string, unknown>;
    const businessNamespace = facade.namespaces.get(businessPackageId) as Record<string, unknown>;
    const kernelModule = facade.tables.root.packages.find((pkg) => pkg.packageId === facade.tables.kernelPackageId);
    const createRuntime = kernelNamespace.createOccurrenceRuntime as (options: unknown) => FacadeRuntime;
    const interpret = standardNamespace.interpret as (declaration: unknown, input: unknown, context: unknown) => unknown;
    const policy = (businessNamespace.getPolicy as () => unknown)();
    if (!isRecord(policy)) {
      throw new V09BridgeRefusalError('BRIDGE_ABI_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `Business ${businessPackageId} policy is not a record`);
    }
    const runtime = createRuntime({
      moduleIdentity: { packageId: facade.tables.kernelPackageId, moduleSha256: kernelModule?.moduleSha256 },
      hostPorts: {
        docs: kernelDocsPort(store, facade.tables.root.subjectDigest, facade.tenantId),
        resources: resourcesPort(facade),
        sha256: { digestUtf8: (value: string): string => sha256Hex(value) },
        clock: (): string => new Date(now()).toISOString(),
      },
      sdkEndpoint: {
        packageId: facade.tables.standardPackageId,
        interpret: (declaration: unknown, input: unknown, context: unknown): unknown => interpret(declaration, input, context),
      },
      businessEndpoint: policy,
      // The selected Kernel's own receipt side-channel (#1120 delivery
      // source): every committed occurrence of this facade fans out through
      // the scoped lifecycle's per-delivery authorization chain.
      observe: kernelObserveFor(facade),
    });
    facade.runtimes.set(businessPackageId, runtime);
    return runtime;
  }

  async function sendImpl(facade: ActiveFacade, intent: Readonly<V9PublicSendIntent>): Promise<unknown> {
    if (facade.closed || bridgeClosed) {
      recordDiag('send', 'BRIDGE_CLOSED', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
      throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
    }
    try {
      const { intentType, instanceKey, messageId, input } = strictIntent(intent);
      const subjectDigest = facade.tables.root.subjectDigest;
      // D03: current principal/tenant/app scope at receipt (fresh trusted authentication).
      await facade.principal.issue(presentation, intentType, 'send');
      await refuseIfRevoked(subjectDigest, 'send');

      const rows = facade.tables.routes.get(intentType);
      if (rows === undefined || rows.length === 0) {
        throw new V09BridgeRefusalError('BRIDGE_INTENT_UNSEALED', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, `intent ${intentType} carries no sealed route rows`);
      }
      // The pure Standard Router runs from the SEALED standard module's own
      // namespace over the sealed route rows (D05); candidates are the sealed
      // rows themselves — the Router resolves priority/eligibility only.
      const basisDigest = `sha256:${subjectDigest}`;
      const bindings = rows.map((row) => ({ intentId: intentType, operationId: row.operationId, capabilityId: row.capabilityId, handlerId: row.handlerId }));
      const candidates = rows.map((row) => ({ operationId: row.operationId, capabilityId: row.capabilityId, priority: 1, eligibility: 'eligible' as const }));
      const standardNamespace = facade.namespaces.get(facade.tables.standardPackageId) as Record<string, unknown>;
      const router = standardNamespace.routeWorkflowIntent as (request: unknown) => { kind: string; operationId?: string; capabilityId?: string; handlerId?: string; basisDigest?: string };
      let routed: ReturnType<typeof router>;
      try {
        routed = router({ intentId: intentType, basisDigest, bindings, candidates });
      } catch (error) {
        throw new V09BridgeRefusalError(`ROUTER_REFUSED_${kernelErrorCode(error) ?? 'UNKNOWN'}`, V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, 'the selected Standard Router refused the request');
      }
      if (routed.kind !== 'selected') {
        if (routed.kind === 'denied') {
          throw new V09BridgeRefusalError('ROUTER_ELIGIBILITY_DENIED', V9_PUBLIC_ERROR_CODES.CALLER_SCOPE_DENIED, 'the Router found no eligible operation');
        }
        throw new V09BridgeRefusalError(`ROUTER_${routed.kind.toUpperCase()}`, V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, `the Router outcome '${routed.kind}' admits nothing`);
      }
      // K-boundary revalidation (#1027 discipline): the selected result must
      // match ONE sealed route row exactly, including the basis digest.
      const matched = rows.some((row) => row.operationId === routed.operationId
        && row.capabilityId === routed.capabilityId
        && row.handlerId === routed.handlerId);
      if (!matched || routed.basisDigest !== basisDigest) {
        throw new V09BridgeRefusalError('BRIDGE_BINDING_UNMATCHED', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, 'the Router result does not exactly match a sealed route row of this closure');
      }

      const businessPackageId = facade.tables.intents.get(intentType) as string;
      const runtime = runtimeFor(facade, businessPackageId);
      const businessNamespace = facade.namespaces.get(businessPackageId) as Record<string, unknown>;
      const policy = (businessNamespace.getPolicy as () => Record<string, unknown>)();
      const definition = isRecord(policy.workflowDefinition) ? policy.workflowDefinition : undefined;
      const workflowId = definition !== undefined && typeof definition.workflowKey === 'string' ? definition.workflowKey : undefined;
      if (workflowId === undefined || workflowId.length === 0) {
        throw new V09BridgeRefusalError('BRIDGE_ABI_INVALID', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED, `Business ${businessPackageId} policy declares no workflowKey`);
      }
      const target = { workflowId, instanceKey };
      try {
        // The Kernel's outward read answers null for an absent instance (it
        // is deliberately not an existence oracle): a null snapshot is the
        // lazy-open signal, and an already-open race is absorbed below.
        const existing = await runtime.getSnapshot(target);
        if (existing === null || existing === undefined) {
          try {
            await runtime.openInstance({ target, correlationId: `corr:${messageId}`, authorityClass });
          } catch (openError) {
            if (!isAlreadyExists(openError)) throw openError;
          }
        }
        return await runtime.submitOccurrence({
          kind: 'v08/tc-intent', intentType, target, messageId, input,
          caller: { role: 'requester' },
        });
      } catch (error) {
        throw toPublicError(error, 'send');
      }
    } catch (error) {
      throw toPublicError(error, 'send');
    }
  }

  async function queryImpl(facade: ActiveFacade, query: Readonly<V9PublicInstanceQuery>): Promise<unknown> {
    if (facade.closed || bridgeClosed) {
      recordDiag('query', 'BRIDGE_CLOSED', V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
      throw new DomainHarnessV9Error(V9_PUBLIC_ERROR_CODES.LIFECYCLE_FAILED);
    }
    try {
      if (!isRecord(query) || Object.keys(query).some((key) => key !== 'kind' && key !== 'instanceKey') || query.kind !== 'instance') {
        throw new V09BridgeRefusalError('BRIDGE_INPUT_INVALID', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, 'query accepts a record of exactly {kind: "instance", instanceKey}');
      }
      const instanceKey = boundedId(query.instanceKey, 'query.instanceKey');
      const subjectDigest = facade.tables.root.subjectDigest;
      await facade.principal.issue(presentation, 'instance', 'query');
      await refuseIfRevoked(subjectDigest, 'query');
      for (const businessPackageId of facade.tables.businessPackageIds) {
        const runtime = runtimeFor(facade, businessPackageId);
        const businessNamespace = facade.namespaces.get(businessPackageId) as Record<string, unknown>;
        const policy = (businessNamespace.getPolicy as () => Record<string, unknown>)();
        const definition = isRecord(policy.workflowDefinition) ? policy.workflowDefinition : undefined;
        const workflowId = definition !== undefined && typeof definition.workflowKey === 'string' ? definition.workflowKey : undefined;
        if (workflowId === undefined || workflowId.length === 0) continue;
        // Null is the Kernel's honest "no such instance here" answer (no
        // existence oracle); keep scanning the closure's business workflows.
        const snapshot = await runtime.getSnapshot({ workflowId, instanceKey });
        if (snapshot !== null && snapshot !== undefined) {
          return snapshot;
        }
      }
      throw new V09BridgeRefusalError('BRIDGE_INSTANCE_UNKNOWN', V9_PUBLIC_ERROR_CODES.OPERATION_NOT_BOUND, 'no business workflow of this closure holds the requested instance');
    } catch (error) {
      throw toPublicError(error, 'query');
    }
  }

  async function recheckDeliveryAuthorization(subjectDigest: unknown, permitDigest: unknown): Promise<V09DeliveryAuthorization> {
    if (typeof subjectDigest !== 'string' || !HEX64.test(subjectDigest)
      || typeof permitDigest !== 'string' || !HEX64.test(permitDigest)) {
      throw governanceRefusal('EFFECT_PERMIT_INPUT_INVALID', 'delivery authorization recheck requires lowercase hex sha-256 subject and permit digests');
    }
    const state = await readV09SubjectAuthority(store, subjectDigest, 'delivery authorization recheck');
    if (state.status === 'revoked') {
      throw governanceRefusal('APPROVAL_REVOKED', 'the approval for this installed subject has been revoked; delivery authorization is refused');
    }
    if (state.status === 'absent') {
      throw governanceRefusal('EFFECT_PERMIT_UNKNOWN', 'no activation epoch has committed for this subject; delivery authorization cannot be current');
    }
    const entry = state.permits[permitDigest];
    if (entry === undefined) {
      throw governanceRefusal('EFFECT_PERMIT_UNKNOWN', 'the presented permit digest is not recorded on the current shared subject authority');
    }
    if (entry.expiresAtMs <= now()) {
      throw governanceRefusal('EFFECT_PERMIT_EXPIRED', 'the recorded one-shot permit has expired; delivery authorization is refused');
    }
    return { decision: 'authorized', authorityEpoch: state.epoch, expiresAtMs: entry.expiresAtMs };
  }

  // Only this selected trusted H→K composition may bind a public load target.
  const harness = Object.freeze({ load: loadImpl }) satisfies V9DomainHarness;
  constructedV09Harnesses.add(harness); // only this trusted composer can brand
  const detachPublic = attachV09TrustedBridge(harness);
  return Object.freeze({
    harness,
    runWithinTrustedContext: <T>(action: () => T | Promise<T>): Promise<T> => runV09InTrustedHostScope(harness, action),
    host: (): Promise<ProtectedHostV09> => hostInstance(),
    recheckDeliveryAuthorization,
    drainBridgeDiagnostics: (): readonly V09BridgeDiagnostic[] => {
      const drained = [...diagnostics];
      diagnostics.length = 0;
      return Object.freeze(drained);
    },
    close: async (): Promise<void> => {
      bridgeClosed = true;
      detachPublic(); // before async teardown, public loads fail closed
      for (const facade of facades) {
        facade.closed = true;
        facade.permit.close();
        facade.principal.close();
      }
      facades.clear();
      if (hostPromise !== undefined) {
        try {
          await (await hostPromise).close();
        } catch {
          // close() is best-effort teardown; the store port's own typed
          // failures surface through its contract on later use.
        }
      }
    },
  }) satisfies V09ComposedBridge;
}
