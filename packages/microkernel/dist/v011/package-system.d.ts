import type { DomainAppLock, ElementDefinition, EntryRef, HostPortBinding, ReadonlyResourceHandle, ResourceRef, SelectedFunction, SelectedPackage } from '@kaicreator/domain-harness-contracts/v011';
/** Ordinary startup failure carrier (PRD K07): no retry, no recovery. */
export declare class KdpLoadError extends Error {
    readonly code: "DH_KDP_PACKAGE_LOAD_FAILED";
    constructor(reason: string);
}
export interface TechnicalLifecycleContext {
    readonly packageId: string;
    /** Fixture channels only (L2 §6.2.3) — never Effect authority. */
    readonly hostPorts: readonly HostPortBinding[];
}
type ModuleExports = Record<string, unknown>;
export declare class PackageSystem {
    private readonly installRoot;
    readonly lock: DomainAppLock;
    private readonly hostPorts;
    private readonly moduleCache;
    private readonly definitionCache;
    private readonly schemaCache;
    private sealedHookTable;
    constructor(installRoot: string, lock: DomainAppLock, hostPorts: readonly HostPortBinding[]);
    packageById(packageId: string): SelectedPackage | undefined;
    private importModule;
    /** Load a package artifact module addressed by its sealed ResourceRef. */
    loadArtifactModule(ref: ResourceRef, what: string): Promise<ModuleExports>;
    /** Resolve an EntryRef to its named export; refuses default/anonymous and missing exports. */
    loadEntry(entry: EntryRef, what: string): Promise<unknown>;
    /**
     * Technical init in the Lock's exact `technicalInitOrder`; module
     * evaluation plus the optional named `technicalInit` export per package.
     */
    runTechnicalInit(): Promise<void>;
    /** Strict reverse teardown per the Lock's `technicalDisposeOrder`. */
    runTechnicalDispose(): Promise<void>;
    /** Seal hook bindings: import every provider module, freeze the table. No invocation channel. */
    sealHooks(): Promise<ReadonlyMap<string, readonly unknown[]>>;
    /** The sealed hook table (available after `sealHooks`). */
    get hooks(): ReadonlyMap<string, readonly unknown[]>;
    /** Find the selected implementation entry for a FunctionRef (exact canonical equality). */
    functionByRef(ref: SelectedFunction['ref']): SelectedFunction | undefined;
    /**
     * Content-addressed Element definition lookup: the Lock pins each
     * definition by `definitionDigest` (canonical JSON digest), and the
     * definition document is part of the sealed resource closure. The
     * runtime scans the closure for the resource whose parsed canonical
     * digest equals the pinned ElementRef digest. Negative results are
     * cached; failure means invoke-time schema validation is unavailable.
     */
    findElementDefinition(definitionDigest: string): Promise<ElementDefinition | null>;
    /**
     * Resolve the input/output schema documents for a selected function
     * from its owner Element definition (inline SchemaRef or in-closure
     * resource SchemaRef). null = schemas unavailable for this install.
     */
    functionSchemas(fn: SelectedFunction): Promise<{
        input: unknown;
        output: unknown;
    } | null>;
    private resolveSchemaRef;
    /** Readonly resource handle for one sealed closure resource (`<pkg>:<path>` key). */
    resourceHandle(key: string): ReadonlyResourceHandle;
}
export {};
