/** v0.10.2: transport-only Activation/Host public types. */
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
