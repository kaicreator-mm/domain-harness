import { V10Error } from './errors.js';
export { V10ActivationError } from './errors.js';
export declare class V10PortDeniedError extends V10Error {
    constructor(name: string);
}
/** Structural view of one built App (plain data; no compiler import). */
export interface V10AppView {
    readonly formatVersion: string;
    readonly subjectDigest: string;
    readonly appId: string;
    readonly audience: string;
    readonly targetProfile: string;
    readonly runtimeAbi: string;
    readonly hostAbi: string;
    readonly hardBudget: {
        maxStepsPerTurn: number;
        maxWorkUnitsPerTurn: number;
    };
    readonly modules: readonly {
        readonly packageId: string;
        readonly role: string;
        readonly moduleSource: string;
        readonly moduleSha256?: string;
        readonly provides: readonly string[];
        readonly providerId?: string | null;
        readonly hookExport?: string | null;
        readonly featureExport?: string | null;
        readonly handlers?: readonly {
            operationId: string;
            handler: string;
        }[] | null;
        readonly capabilityId?: string | null;
        /** Sealed external Effect provider flag (BUILD fact, C01 #1177). */
        readonly externalEffect?: boolean | null;
    }[];
    readonly loadOrder: readonly string[];
    readonly routes: readonly {
        intentId: string;
        operationId: string;
        capabilityId: string;
        handlerId: string;
    }[];
}
/** The physical CAS condition of one K document write/removal. */
export type V10DocWriteCondition = {
    kind: 'create';
} | {
    kind: 'cas';
    revision: number;
};
/** Caller-owned plain CAS document store (physical owner is K01/K02/T11). */
export interface V10DocStore {
    get(key: string): Promise<{
        value: unknown;
        revision: number;
    } | null>;
    put(key: string, value: unknown, condition: V10DocWriteCondition): Promise<{
        revision: number;
    }>;
    /**
     * Physical CAS conditional removal — the zero-ambiguity release seam K01's
     * admission-fence teardown needs (#1183: `releaseAdmissionFence` removes
     * its fence key under an exact revision match). Optional by design: a
     * physical owner implements it only when its medium supports conditional
     * deletes; the K docs port then exposes `remove`, and exposes NO remove at
     * all otherwise (fail-closed: a fence release that cannot happen beats a
     * fake success).
     */
    remove?(key: string, condition: V10DocWriteCondition): Promise<void>;
    keys?(): readonly string[];
}
export interface V10Counters {
    importsByPackage: Record<string, number>;
    extensionImports: number;
    featureImports: number;
    optionalMissing: string[];
    initCalls: string[];
    initFailures: {
        packageId: string;
        message: string;
    }[];
    disposals: string[];
    runtimeFactoryInvocations: number;
    portProbes: {
        packageId: string;
        name: string;
    }[];
    portDenials: number;
    activationRefusals: {
        code: string;
        message: string;
    }[];
    externalEffectDispatches: number;
    externalEffectRefusals: number;
}
export declare function freshV10Counters(): V10Counters;
/**
 * [v0.10 T10 #1176] The exact scoped-query target tuple. Deliberately
 * declared structurally here instead of re-exporting the Host module's type:
 * the compiler's public declaration surface must not pull the Host package's
 * deep type graph (its physical SQLite adapter types require the optional
 * better-sqlite3 driver at consumer typecheck time). Runtime composition
 * still uses the reviewed Host selector.
 */
export interface V10ScopedQueryTarget {
    readonly deployedAppId: string;
    readonly tenantId: string;
    readonly appId: string;
    readonly businessPackageId: string;
    readonly workflowId: string;
    readonly instanceKey: string;
}
/**
 * [v0.10 T10 #1176] The Host-owned authority that enables authorized scoped
 * queries on one activation. This is DEPLOYMENT WIRING, never public query
 * input: `principal` is the Host-authenticated identity and `authorize` is
 * the Host's own current policy over the exact deployment/B/instance tuple.
 * A public query supplies only workflowId/instanceKey/optional B; any
 * principal- or grant-shaped field a caller passes is ignored.
 */
export interface V10QueryAuthority {
    /** Host-verified identity; MUST NOT be sourced from public query input. */
    readonly principal: unknown;
    /** Trusted current authorization for the exact scoped target tuple. */
    readonly authorize: (principal: unknown, target: V10ScopedQueryTarget) => boolean | Promise<boolean>;
}
/** Public selector accepted by `facade.queryScopedSnapshot` (never a grant). */
export interface V10ScopedSnapshotQuery {
    readonly workflowId: string;
    readonly instanceKey: string;
    readonly businessPackageId?: string;
}
/** The exact authorized target and the selected kernel snapshot it answered. */
export interface V10ScopedSnapshotAnswer {
    readonly target: Readonly<V10ScopedQueryTarget>;
    readonly snapshot: unknown;
}
/**
 * [v0.10 T10B #1179] One truthfully correlated entry of an explicit
 * multi-target query. Each entry is independently authorized and read; a
 * refusal is scoped to its own input position and never masks another
 * target's answer.
 */
export type V10ScopedSnapshotManyAnswer = {
    readonly status: 'answered';
    readonly index: number;
    readonly target: Readonly<V10ScopedQueryTarget>;
    readonly snapshot: unknown;
} | {
    readonly status: 'refused';
    readonly index: number;
    readonly code: string;
    readonly message: string;
};
export interface V10PublicIntent {
    readonly intentType: string;
    readonly instanceKey: string;
    readonly messageId: string;
    readonly input: Record<string, unknown>;
}
type Namespace = Record<string, unknown>;
interface SelectedAdvisory {
    readonly packageId: string;
    readonly kind: 'kernel-extension' | 'standard-feature';
    readonly identityLabel: string;
    readonly identityKey: string;
    readonly dispose: (() => void) | undefined;
}
/**
 * The kernel-facing K docs port: prefix-bounded physical CAS conditionals
 * only. `remove` is exposed when — and only when — the physical store
 * implements it; unsupported stores expose no removal capability.
 */
export interface V10DocsPort {
    get(key: string): Promise<{
        value: unknown;
        revision: number;
    } | null>;
    put(key: string, value: unknown, condition: unknown): Promise<{
        revision: number;
    }>;
    list(prefix: string): Promise<readonly string[]>;
    /**
     * Zero-ambiguity CAS removal (K01 admission-fence release, #1183).
     * Conditions mirror `put`: `{ mustMatchRevision }` deletes under an exact
     * revision match; `{ mustBeAbsent: true }` ensures absence (a no-op over
     * an absent key, a typed refusal over a present one — it never deletes).
     * Present only when the physical store implements `remove`: a missing
     * physical remove must surface as "no such port", never as fake success.
     */
    remove?(key: string, condition: unknown): Promise<void>;
}
/** Build the prefix-bounded K docs port over one physical store. */
export declare function createV10DocsPort(deps: {
    store: V10DocStore;
    docsPrefix: string;
    assertOpen: () => void;
}): V10DocsPort;
/**
 * The ONE governed K-docs outer prefix of a deployment: the stable,
 * delimiter-escaped `deployment:<deployedAppId>:<tenantId>:<appId>` tuple.
 * Shared by the writer (V10AppFacade.#docsPrefix), the reported shadow
 * binding and the Shadow L4 verifier's independent re-derivation — the three
 * must never drift apart.
 */
export declare function v10DeploymentDocsPrefix(deployment: {
    deployedAppId: string;
    tenantId: string;
    appId: string;
}): string;
/**
 * The exact K02 physical prefix of ONE deployment
 * and ONE selected Business: the injective
 * `v010-k02:<deployedAppId>:<tenantId>:<appId>:<businessPackageId>:`
 * component the Host docs port prepends. This is the ONE derivation both the
 * write path (`scopedDocsView`) and the read-only deployment binding use, so
 * a Shadow observation set can never drift wider than what this deployment
 * physically writes.
 */
export declare function v10K02DocumentPrefix(scope: {
    deployedAppId: string;
    tenantId: string;
    appId: string;
    businessPackageId: string;
}): string;
export interface ActivateV10AppOptions {
    readonly store: V10DocStore;
    readonly tenantId?: string;
    readonly now?: () => number;
    readonly counters?: V10Counters;
    /**
     * The stable deployment identity of this App
     * (deployedAppId/tenantId/appId). When present, EVERY business runtime is
     * created under the K02 SCOPED document grammar with its own
     * businessPackageId appended — the exact injective tuple the K02 selected
     * kernel owns — so C01 permits/journals/fences live in the same scoped
     * namespace as every other K record. Absent: the historical unscoped
     * legacy family, byte-for-byte compatible.
     */
    readonly deploymentIdentity?: {
        readonly deployedAppId: string;
        readonly tenantId: string;
        readonly appId: string;
    };
    /**
     * [v0.10 T10 #1176] Host-authenticated query authority. Absent: scoped
     * queries are disabled typed (`QUERY_AUTHORIZATION_REQUIRED`) — there is
     * deliberately no allow-all default. Present without `deploymentIdentity`:
     * every query refuses typed (`QUERY_DEPLOYMENT_REQUIRED`) because no K02
     * scoped namespace exists and no unscoped cross-B fallback is permitted.
     */
    readonly queryAuthority?: V10QueryAuthority;
    /**
     * Deployment anchor for resolving the DECLARED bare npm/native imports of
     * sealed modules — the deployment root whose `node_modules` physically
     * holds the installed dependencies (the A01-PC05 "installed" half of the
     * allowance). Defaults to this activation module's own resolution context.
     * Bounded: only specifiers sealed in a consumed module's externalImports
     * allowance are ever resolved through it; everything else is left to the
     * default resolver, which refuses.
     */
    readonly deploymentRoot?: string;
}
export interface V10Activation {
    readonly facade: V10AppFacade;
    readonly counters: V10Counters;
    /** Explicit, idempotent cleanup: closes facade and all import allowances. */
    dispose(): void;
    /** Node >=22.15: permits `using activation = await activateV10App(...)`. */
    [Symbol.dispose](): void;
}
/**
 * The composed App facade: the ONE composition-owned boundary over the
 * selected kernel primary. `send` runs a public intent through the sealed
 * route (Standard Router selection over the real selected modules) and the
 * real kernel admission path.
 */
export declare class V10AppFacade {
    #private;
    constructor(deps: {
        app: V10AppView;
        namespaces: ReadonlyMap<string, Namespace>;
        advisories: readonly SelectedAdvisory[];
        store: V10DocStore;
        tenantId: string;
        now: () => number;
        counters: V10Counters;
        deploymentIdentity?: {
            deployedAppId: string;
            tenantId: string;
            appId: string;
        };
        queryAuthority?: V10QueryAuthority;
    });
    get selectedExtensions(): readonly {
        packageId: string;
        providerId: string | null;
        hook: string | null;
    }[];
    get selectedFeatures(): readonly {
        packageId: string;
        featureKey: string | null;
    }[];
    /**
     * T07: read-only, activation-origin BUILD/tenant identity used by the Host
     * Shadow L4 verifier. Derived exclusively from private activated state,
     * never a caller-provided digest or a user-supplied matching claim.
     *
     * `deployedAppId` and `k02DocumentPrefixes` are the exact
     * deployment instance and its per-B physical document prefixes. They are
     * derived here from the same private deployment identity the write path
     * uses (`v10K02DocumentPrefix`), so a shadow can select one deployment's K
     * rows without accepting a caller's deployment/tenant/B claim. A facade
     * activated WITHOUT a deployment identity reports `deployedAppId: null` and
     * no prefixes; its K rows carry no deployment attribution and a shadow must
     * refuse rather than widen to the whole App/Tenant namespace.
     */
    get selectedShadowBinding(): Readonly<{
        subjectDigest: string;
        appId: string;
        tenantId: string;
        deployedAppId: string | null;
        deploymentAppId: string | null;
        businessPackageIds: readonly string[];
        k02DocumentPrefixes: readonly string[];
    }>;
    /**
     * Invoke one actually selected Standard feature through its sealed ABI.
     * The Host supplies any trusted read/query/model dependencies; merely
     * possessing semantic data never creates a K Permit or Effect authority.
     * An unselected feature is NOT dynamically discovered or imported.
     */
    invokeSelectedStandardFeature(featureKey: string, request: unknown, trustedDependencies?: unknown): Promise<unknown>;
    isClosed(): boolean;
    close(): void;
    /** The real kernel's own counters for one business package. */
    kCounters(businessPackageId: string): Record<string, number>;
    /**
     * [v0.10 T08 #1175] Read-only resolution of ONE sealed public intent to
     * its exact selected Business package and policy workflow id. Deployment
     * governance uses this to address the immutable occurrence→BUILD pin; it
     * grants no admission/query authority, reads no K storage and cannot
     * change route selection.
     */
    resolveIntentTarget(intentType: string): Readonly<{
        businessPackageId: string;
        workflowId: string;
    }>;
    /**
     * [v0.10 T10 #1176] Authorized, explicit scoped snapshot query over the
     * selected kernel. The public caller supplies ONLY workflowId, instanceKey
     * and optionally the Business packageId — never a principal, grant,
     * deployment or reader. Authorization is Host wiring fixed at activation,
     * runs on every selected candidate BEFORE any snapshot read and is
     * rechecked immediately before the single read. Unscoped ambiguity is
     * decided among VISIBLE selected Business packages only (never storage
     * existence or a denied package), denied/unselected/absent targets collapse
     * into one non-oracle refusal, and no query path writes K state or
     * dispatches an effect.
     */
    queryScopedSnapshot(selector: V10ScopedSnapshotQuery): Promise<V10ScopedSnapshotAnswer>;
    /**
     * [v0.10 T10B #1179] Explicit multi-target variant of
     * `queryScopedSnapshot`. Every requested selector is independently
     * authorized and read; each result is correlated to its input index and a
     * failure is confined to that entry. The public selector still carries only
     * workflow/instance/optional B — the Host authority and deployment identity
     * remain activation wiring. No cross-B transaction or hidden-B oracle is
     * introduced, and no query path writes K state or dispatches an Effect.
     */
    queryManyScopedSnapshots(selectors: readonly V10ScopedSnapshotQuery[]): Promise<readonly V10ScopedSnapshotManyAnswer[]>;
    /**
     * Deterministic, read-only Standard Router preflight. It cannot confer K
     * admission; governed deployment uses it BEFORE minting a durable BUILD pin
     * so a rejected/ambiguous route cannot orphan an unadmitted occurrence.
     * No K/runtime/docs/effect port is touched by this method.
     */
    preflightIntentRouting(intentType: string): Readonly<{
        businessPackageId: string;
        workflowId: string;
    }>;
    /** One public intent through the sealed route and the real kernel. */
    send(intent: V10PublicIntent): Promise<Record<string, unknown>>;
}
/**
 * Activate one built App. Trusts the BUILD output's static facts (no
 * re-attestation) and performs the ordinary module lifecycle only.
 */
export declare function activateV10App(app: unknown, options: ActivateV10AppOptions): Promise<V10Activation>;
