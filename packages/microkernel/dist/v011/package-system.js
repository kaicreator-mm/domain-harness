/**
 * DomainHarness v0.11.0 T03 (#1577) — KDP Package System internals.
 *
 * Started by the KDP Primary AFTER self-boot of the Kernel Core; loads
 * ONLY what the sealed Lock selects, in the Lock's own
 * `technicalInitOrder` — never re-BUILDs, never repairs, never resolves
 * alternatives at runtime (PRD K05/B07). Physical load failures are
 * ordinary startup failures (DH_KDP_PACKAGE_LOAD_FAILED, PRD K07): no
 * retry, no recovery engine.
 *
 * Runtime lifecycle convention (T03): a selected package artifact module
 * may export named `technicalInit` / `technicalDispose` functions. The
 * frozen Lock has no per-package init EntryRef field, so this named-export
 * convention is the minimal 0.11.0 runtime contract; BUILD still enforces
 * the manifest pairing rule (DH_BUILD_LIFECYCLE_HALF) for authoring
 * hygiene. Hook bindings are SEALED at bootstrap: provider modules are
 * imported and their named exports frozen into an immutable table; 0.11.0
 * exposes no hook invocation channel beyond that.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { contentDigestOf, canonicalJson } from '@kaicreator/domain-harness-contracts/v011';
import { resolvePackageFile, splitResourceKey } from './paths.js';
import { bytesContentDigest } from './verify.js';
/**
 * Startup failure carrier (PRD K07): no retry, no recovery. `code` is
 * DH_KDP_PACKAGE_LOAD_FAILED for ordinary physical load failures and
 * DH_BOOT_PIN_MISMATCH when actual bytes do not match the sealed Lock /
 * ResourceRef digests (post-install tamper inside the trust root).
 */
export class KdpLoadError extends Error {
    code;
    constructor(reason, code = 'DH_KDP_PACKAGE_LOAD_FAILED') {
        super(reason);
        this.name = 'KdpLoadError';
        this.code = code;
    }
}
export class PackageSystem {
    installRoot;
    lock;
    hostPorts;
    moduleCache = new Map();
    definitionCache = new Map();
    schemaCache = new Map();
    sealedHookTable = null;
    constructor(installRoot, lock, hostPorts) {
        this.installRoot = installRoot;
        this.lock = lock;
        this.hostPorts = hostPorts;
    }
    packageById(packageId) {
        return this.lock.selectedPackages.find((pkg) => pkg.packageId === packageId);
    }
    async importModule(absolutePath, what) {
        let cached = this.moduleCache.get(absolutePath);
        if (cached === undefined) {
            cached = import(pathToFileURL(absolutePath).href).then((mod) => mod, (error) => {
                throw new KdpLoadError(`${what} failed to import: ${error.message}`);
            });
            this.moduleCache.set(absolutePath, cached);
        }
        return cached;
    }
    /**
     * Read a package file's actual bytes and verify them against the sealed
     * digest before use. `expected` comes from the trusted Lock surface (a
     * ResourceRef digest or the `resourceDigests` closure entry); a mismatch
     * means post-install tampering inside the trust root and is refused with
     * DH_BOOT_PIN_MISMATCH.
     */
    async readVerifiedBytes(packageId, path, expected, what) {
        const absolute = resolvePackageFile(this.installRoot, packageId, path);
        if (absolute === null) {
            throw new KdpLoadError(`${what} path '${packageId}/${path}' is not an in-package relative path`);
        }
        let bytes;
        try {
            bytes = await readFile(absolute);
        }
        catch {
            throw new KdpLoadError(`${what} '${packageId}/${path}' is not readable`);
        }
        if (bytesContentDigest(bytes) !== expected) {
            throw new KdpLoadError(`${what} bytes at '${packageId}/${path}' do not match the sealed digest (post-install tamper refused)`, 'DH_BOOT_PIN_MISMATCH');
        }
        return bytes;
    }
    /** Load a package artifact module addressed by its sealed ResourceRef. */
    async loadArtifactModule(ref, what) {
        const absolute = resolvePackageFile(this.installRoot, ref.packageId, ref.path);
        if (absolute === null) {
            throw new KdpLoadError(`${what} artifact path '${ref.packageId}/${ref.path}' is not an in-package relative path`);
        }
        // Hash the ACTUAL artifact bytes against the sealed ref.digest BEFORE
        // import — never execute bytes the Lock did not pin.
        await this.readVerifiedBytes(ref.packageId, ref.path, ref.digest, `${what} artifact`);
        return this.importModule(absolute, what);
    }
    /** Resolve an EntryRef to its named export; refuses default/anonymous and missing exports. */
    async loadEntry(entry, what) {
        const mod = await this.loadArtifactModule(entry.module, what);
        const exported = mod[entry.exportName];
        if (exported === undefined) {
            throw new KdpLoadError(`${what} has no named export '${entry.exportName}'`);
        }
        return exported;
    }
    /**
     * Technical init in the Lock's exact `technicalInitOrder`; module
     * evaluation plus the optional named `technicalInit` export per package.
     */
    async runTechnicalInit() {
        for (const packageId of this.lock.technicalInitOrder) {
            const pkg = this.packageById(packageId);
            if (pkg === undefined) {
                throw new KdpLoadError(`technicalInitOrder references unselected package '${packageId}'`);
            }
            const mod = await this.loadArtifactModule(pkg.artifact, `selected package '${packageId}'`);
            const technicalInit = mod['technicalInit'];
            if (technicalInit !== undefined) {
                if (typeof technicalInit !== 'function') {
                    throw new KdpLoadError(`package '${packageId}' export 'technicalInit' is not a function`);
                }
                const context = { packageId, hostPorts: this.hostPorts };
                await technicalInit(context);
            }
        }
    }
    /** Strict reverse teardown per the Lock's `technicalDisposeOrder`. */
    async runTechnicalDispose() {
        for (const packageId of this.lock.technicalDisposeOrder) {
            const pkg = this.packageById(packageId);
            if (pkg === undefined)
                continue;
            const mod = await this.loadArtifactModule(pkg.artifact, `selected package '${packageId}'`);
            const technicalDispose = mod['technicalDispose'];
            if (technicalDispose !== undefined) {
                if (typeof technicalDispose !== 'function') {
                    throw new KdpLoadError(`package '${packageId}' export 'technicalDispose' is not a function`);
                }
                const context = { packageId, hostPorts: this.hostPorts };
                await technicalDispose(context);
            }
        }
    }
    /** Seal hook bindings: import every provider module, freeze the table. No invocation channel. */
    async sealHooks() {
        const table = new Map();
        for (const binding of this.lock.hookBindings) {
            const providers = [];
            for (const provider of binding.providers) {
                const exported = await this.loadEntry(provider, `hook '${binding.hookId}' provider in package '${provider.module.packageId}'`);
                if (typeof exported !== 'function') {
                    throw new KdpLoadError(`hook '${binding.hookId}' provider export '${provider.exportName}' is not a function`);
                }
                providers.push(exported);
            }
            table.set(`${binding.ownerPackageId}#${binding.hookId}`, Object.freeze(providers));
        }
        this.sealedHookTable = Object.freeze(table);
        return this.sealedHookTable;
    }
    /** The sealed hook table (available after `sealHooks`). */
    get hooks() {
        return this.sealedHookTable ?? new Map();
    }
    /** Find the selected implementation entry for a FunctionRef (exact canonical equality). */
    functionByRef(ref) {
        const wanted = canonicalJson(ref);
        return this.lock.selectedFunctions.find((fn) => canonicalJson(fn.ref) === wanted);
    }
    /**
     * Content-addressed Element definition lookup: the Lock pins each
     * definition by `definitionDigest` (canonical JSON digest), and the
     * definition document is part of the sealed resource closure. The
     * runtime scans the closure (T02 `V011ResourceScope` keys of the frozen
     * `<packageId>/<path>` form, rightmost-`/`) for the resource whose
     * parsed canonical digest equals the pinned ElementRef digest. Negative
     * results are cached; failure means invoke-time schema validation is
     * unavailable.
     */
    async findElementDefinition(definitionDigest) {
        const cached = this.definitionCache.get(definitionDigest);
        if (cached !== undefined)
            return cached;
        let found = null;
        for (const [key] of Object.entries(this.lock.resourceDigests)) {
            const split = splitResourceKey(key);
            if (split === null)
                continue;
            const absolute = resolvePackageFile(this.installRoot, split.packageId, split.path);
            if (absolute === null)
                continue;
            let parsed;
            try {
                parsed = JSON.parse(await readFile(absolute, 'utf8'));
            }
            catch {
                continue;
            }
            try {
                if (contentDigestOf(parsed) === definitionDigest) {
                    found = parsed;
                    break;
                }
            }
            catch {
                continue; // non-plain data cannot be a definition digest match
            }
        }
        this.definitionCache.set(definitionDigest, found);
        return found;
    }
    /**
     * Resolve the input/output schema documents for a selected function
     * from its owner Element definition (inline SchemaRef or in-closure
     * resource SchemaRef). null = schemas unavailable for this install.
     */
    async functionSchemas(fn) {
        const key = canonicalJson(fn.ref);
        const cached = this.schemaCache.get(key);
        if (cached !== undefined)
            return cached;
        let resolved = null;
        const element = this.lock.selectedElements.find((candidate) => canonicalJson(candidate.ref) === canonicalJson(fn.ref.element));
        if (element !== undefined) {
            const definition = await this.findElementDefinition(element.ref.digest);
            const contract = definition?.functions.find((candidate) => candidate.id === fn.ref.functionId && candidate.contractVersion === fn.ref.contractVersion);
            if (definition !== null && contract !== undefined) {
                const input = await this.resolveSchemaRef(contract.inputSchemaRef);
                const output = await this.resolveSchemaRef(contract.outputSchemaRef);
                if (input !== null && output !== null)
                    resolved = { input, output };
            }
        }
        this.schemaCache.set(key, resolved);
        return resolved;
    }
    async resolveSchemaRef(schemaRef) {
        if (typeof schemaRef !== 'object' || schemaRef === null)
            return null;
        const ref = schemaRef;
        if ('inline' in ref)
            return ref['inline'];
        const packageId = ref['packageId'];
        const path = ref['path'];
        if (typeof packageId !== 'string' || typeof path !== 'string')
            return null;
        // A schema resource outside the sealed closure is unavailable; one
        // INSIDE the closure must match its pinned digest byte-for-byte.
        const closureDigest = this.lock.resourceDigests[`${packageId}/${path}`];
        if (closureDigest === undefined)
            return null;
        const bytes = await this.readVerifiedBytes(packageId, path, closureDigest, 'schema resource');
        try {
            return JSON.parse(bytes.toString('utf8'));
        }
        catch {
            return null;
        }
    }
    /**
     * Readonly resource handle for one sealed closure resource. read()
     * verifies the actual bytes against the Lock `resourceDigests` entry for
     * its `<packageId>/<path>` key before returning them.
     */
    resourceHandle(key) {
        const split = splitResourceKey(key);
        const packageId = split?.packageId ?? '';
        const path = split?.path ?? '';
        const ref = {
            packageId,
            path,
            digest: this.lock.resourceDigests[key] ?? 'sha256:0',
        };
        return {
            ref,
            read: async () => {
                const expected = this.lock.resourceDigests[key];
                if (expected === undefined) {
                    throw new KdpLoadError(`resource '${key}' is not part of the sealed closure`);
                }
                return this.readVerifiedBytes(packageId, path, expected, `resource '${key}'`);
            },
        };
    }
}
