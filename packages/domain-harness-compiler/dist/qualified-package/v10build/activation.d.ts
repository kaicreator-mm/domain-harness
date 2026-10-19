export declare class V10ActivationError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare class V10PortDeniedError extends Error {
    readonly code = "KEXT_PORT_DENIED";
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
}
export declare function freshV10Counters(): V10Counters;
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
 * implements it (review 6254726674, P1-2).
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
export interface ActivateV10AppOptions {
    readonly store: V10DocStore;
    readonly tenantId?: string;
    readonly now?: () => number;
    readonly counters?: V10Counters;
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
    /** Dispose: facade closes first, then advisory modules in reverse init order. */
    dispose(): void;
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
    isClosed(): boolean;
    close(): void;
    /** The real kernel's own counters for one business package. */
    kCounters(businessPackageId: string): Record<string, number>;
    /** One public intent through the sealed route and the real kernel. */
    send(intent: V10PublicIntent): Promise<Record<string, unknown>>;
}
/**
 * Activate one built App. Trusts the BUILD output's static facts (no
 * re-attestation) and performs the ordinary module lifecycle only.
 */
export declare function activateV10App(app: unknown, options: ActivateV10AppOptions): Promise<V10Activation>;
export {};
