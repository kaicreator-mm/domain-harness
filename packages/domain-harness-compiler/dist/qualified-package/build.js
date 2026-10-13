/**
 * v0.8 sealed qualified package producer (T-A, #1000).
 * ====================================================
 *
 * `buildQualifiedPackage` assembles the sealed root that the public
 * `DomainHarness.load(package)` (core `/v8` ABI) accepts. It is the
 * successor of the #994@b9ea4d1 experiment producer
 * `src/producer/build-package.mjs`, selectively adapted:
 *
 *   qualifyPackageClosure (phase 1, static Identity/Compatibility/Binding
 *   + AST closure)  →  externally issued approval (phase 2, verified here,
 *   never minted here)  →  sealed root with frozen provenance and closure
 *   digest.
 *
 * The producer signature takes NO issuer secret: structurally, the BUILD
 * path cannot self-mint approval authority (Issue #1000 contract: "DAC
 * authorizes governance externally").
 */
import { computeSubjectDigest, sha256Hex } from '@kaicreator/domain-harness/v8';
import { ApprovalError, verifyApprovalProof } from './approval.js';
export class BuildError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'BuildError';
        this.code = code;
    }
}
function deepFreeze(value) {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
        for (const key of Reflect.ownKeys(value)) {
            deepFreeze(value[key]);
        }
        Object.freeze(value);
    }
    return value;
}
/**
 * Produce the sealed qualified package root. Re-qualifies nothing but
 * re-verifies: the presented module bytes must still hash to the
 * qualification's pinned digests (byte substitution between qualification
 * and sealing is refused) and the approval must verify for this exact
 * subject against the trusted issuers.
 */
export function buildQualifiedPackage(options) {
    if (typeof options !== 'object' || options === null) {
        throw new BuildError('BUILD_INPUT_INVALID', 'buildQualifiedPackage requires an options object');
    }
    const { unsigned } = options;
    if (unsigned.formatVersion !== 'v08-build-qualification/1') {
        throw new BuildError('BUILD_INPUT_INVALID', 'unsigned qualification has the wrong format version');
    }
    let approval;
    try {
        approval = verifyApprovalProof(options.approval, unsigned.subjectDigest, options.trustedIssuers);
    }
    catch (error) {
        if (error instanceof ApprovalError) {
            throw new BuildError(error.code, error.message);
        }
        throw error;
    }
    const packages = unsigned.packages.map((pkg) => {
        const moduleSource = options.moduleSources.get(pkg.modulePath);
        if (moduleSource === undefined) {
            throw new BuildError('BUILD_MODULE_MISSING', `sealed module ${pkg.modulePath} (package ${pkg.packageId}) is not part of the build input`);
        }
        // Re-hash the PRESENTED bytes against the approved qualification pin:
        // byte substitution between qualification and sealing is refused here.
        if (sha256Hex(moduleSource) !== pkg.moduleSha256) {
            throw new BuildError('BUILD_SUBJECT_DRIFT', `sealed module ${pkg.modulePath} (package ${pkg.packageId}) no longer hashes to the approved qualification digest; byte substitution after approval is refused`);
        }
        return {
            packageId: pkg.packageId,
            kind: pkg.kind,
            abiVersion: pkg.abiVersion,
            moduleSource,
            moduleSha256: pkg.moduleSha256,
            endpoints: pkg.endpoints.map((endpoint) => ({ ...endpoint })),
        };
    });
    const subjectDigest = computeSubjectDigest({
        rootPackageId: unsigned.rootPackageId,
        packages: packages.map((pkg) => ({ packageId: pkg.packageId, moduleSha256: pkg.moduleSha256 })),
        bindings: unsigned.bindings,
    });
    if (subjectDigest !== unsigned.subjectDigest) {
        throw new BuildError('BUILD_SUBJECT_DRIFT', `presented bytes digest ${subjectDigest} but the approved qualification subjects ${unsigned.subjectDigest}; byte substitution after approval is refused`);
    }
    return deepFreeze({
        formatVersion: 'dhpkg/v8-qualified-root/1',
        rootPackageId: unsigned.rootPackageId,
        build: {
            producerId: 'qualified-producer:v08-ta',
            builtAt: options.builtAt ?? new Date().toISOString(),
            baseCommit: options.baseCommit ?? 'unknown',
            closureDigest: subjectDigest,
        },
        approval,
        packages,
        // One-level-deep plain copies, mirroring the endpoint copies above:
        // qualification bindings arrive from canonicalSnapshot output whose
        // records are prototype-free, and a capability binding carries a nested
        // handler map that must be reproduced as ordinary objects so the sealed
        // root itself survives the load-side canonical snapshot.
        bindings: unsigned.bindings.map((binding) => binding.role === 'capability'
            ? { ...binding, handlers: binding.handlers.map((handler) => ({ ...handler })) }
            : { ...binding }),
    });
}
export { QualificationError, qualifyPackageClosure } from './qualify.js';
export { ApprovalError, issueApprovalProof, verifyApprovalProof } from './approval.js';
