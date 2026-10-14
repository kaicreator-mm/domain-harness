/**
 * #1023 S01 — trusted deployment channel: immutable content-addressed
 * Domain Package install + per-activation currentness. INTERNAL protected.
 * ============================================================================
 *
 * The closed-world architecture delta (#1023@6168603324): package admission
 * moves to BUILD/deployment, and the Microkernel loads a PREVIOUSLY
 * INSTALLED immutable linked artifact through the same public one-argument
 * `DomainHarness.load(package)` — the installed reference is an opaque,
 * nonforgeable per-Host token minted by THIS channel, never a content hash
 * a caller could compute or re-target.
 *
 * Who may establish the channel: the governance/Host bootstrap only
 * (bootstrapTrustedHost), one-shot per process exactly like trust.ts — the
 * deployment authority is the trusted physical document store of the Host
 * (SQLite true-CAS in production). The channel is NOT re-exported from the
 * public `/v8` surface.
 *
 * What install does (all BEFORE any package source execution — deployment
 * is inert byte verification, never activation):
 *   1. full static qualification of the presented sealed root
 *      (assertQualifiedRoot — the same canonical snapshot the legacy load
 *      path uses);
 *   2. the load trust gate (verifyLoadApproval — issuer attestation, clock
 *      policy) plus deployment currentness (not already revoked/withdrawn);
 *   3. whole-closure inert byte preflight (installer phase 1, no import);
 *   4. atomic publish of ONE self-contained content-addressed immutable
 *      artifact under `v8deploy:artifact:<sha256(canonical-bytes)>` with
 *      create-if-absent CAS — a conflicting pre-occupant refuses typed and
 *      NEVER substitutes other bytes; identical bytes are idempotent;
 *   5. mint one opaque installed reference and record its link record
 *      (artifact digest + approval identity) under a random key.
 *
 * What activation does on EVERY fresh load/registration/restart: resolve the
 * reference (fail-closed when unknown), re-check approval/issuer currentness
 * (a revoked/withdrawn previously installed approval refuses BEFORE any
 * package source execution), and re-verify the artifact bytes against their
 * content address (tampered store bytes refuse typed). Approved byte
 * identity is thereby distinguished from CURRENT authorization; neither
 * `maxProofAgeMs` alone nor any caller-supplied claim participates.
 *
 * The legacy approved-root path keeps ALL its existing guards; the
 * deployment revocation/withdrawal records additionally bind it (a revoked
 * proof refuses through every presentation) until a bounded reviewed
 * cutover.
 */
import { randomBytes } from 'node:crypto';
import { QualifiedPackageError, assertQualifiedRoot, canonicalJson, sha256Hex, } from './contracts.js';
import { preflightSealedClosureBytes } from './installer.js';
import { verifyLoadApproval } from './trust.js';
/** Opaque installed-reference prefix (v1; 256 bits of randomness follow). */
export const V8_DEPLOY_HANDLE_PREFIX = 'dhpkg-install/v1/';
const HANDLE_SHAPE = /^dhpkg-install\/v1\/[0-9a-f]{64}$/;
const HEX64 = /^[0-9a-f]{64}$/;
let channel;
/**
 * Validate a prospective deployment-channel installation WITHOUT consuming
 * the one-shot channel (#1013 R1 F-01 pattern): every refusal the install
 * would raise fails here first so the Host bootstrap can preflight ALL
 * one-shot channels before committing ANY.
 */
export function preflightDeploymentAuthorityInstall(input) {
    if (channel !== undefined) {
        throw new QualifiedPackageError('DEPLOY_CHANNEL_ALREADY_ESTABLISHED', 'a trusted deployment authority is already installed in this process; the protected deployment channel is one-shot');
    }
    if (typeof input !== 'object' || input === null || typeof input.store !== 'object' || input.store === null) {
        throw new QualifiedPackageError('DEPLOY_CHANNEL_INVALID', 'installDeploymentAuthority requires the trusted Host document store');
    }
    const store = input.store;
    if (typeof store.get !== 'function' || typeof store.put !== 'function') {
        throw new QualifiedPackageError('DEPLOY_CHANNEL_INVALID', 'the deployment store must provide get/put (the probed true-CAS Host store)');
    }
}
/**
 * Install the trusted deployment authority for this process: one-shot
 * (a second attempt fails typed), Host bootstrap only.
 */
export function installDeploymentAuthority(input) {
    preflightDeploymentAuthorityInstall(input);
    channel = Object.freeze({ store: input.store, establishedAt: Date.now() });
}
/** Diagnostics-only probe (tests/evidence); not a trust decision input. */
export function isDeploymentAuthorityEstablished() {
    return channel !== undefined;
}
// ---------------------------------------------------------------------------
// Store keys (single-sourced; exported for tests/evidence corruption
// injection only — never for runtime callers to synthesize authority).
// ---------------------------------------------------------------------------
export function deployArtifactKey(artifactDigest) {
    return `v8deploy:artifact:${artifactDigest}`;
}
export function deployInstallKey(handle) {
    return `v8deploy:install:${handle}`;
}
function proofRevocationKey(proofDigest) {
    return `v8deploy:revocation:proof:${proofDigest}`;
}
function issuerWithdrawalKey(issuerId) {
    return `v8deploy:revocation:issuer:${issuerId}`;
}
// ---------------------------------------------------------------------------
/** Structural check of an installed-reference presentation (shape only). */
export function isInstalledHandleShape(value) {
    return typeof value === 'string' && HANDLE_SHAPE.test(value);
}
function isPlainRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireDeploymentStore() {
    if (channel === undefined) {
        throw new QualifiedPackageError('INSTALL_CHANNEL_UNAVAILABLE', 'no trusted deployment authority is installed in this process (protected Host channel not established); the deployment seam fails closed');
    }
    return channel.store;
}
/**
 * Fail-closed typed read: an unreadable deployment store (closed, faulty)
 * refuses activation with a typed error instead of leaking a raw storage
 * exception — never a silent pass.
 */
async function readDeploymentDoc(store, key) {
    try {
        return await store.get(key);
    }
    catch (error) {
        throw new QualifiedPackageError('DEPLOY_STORE_UNAVAILABLE', `the trusted deployment store cannot be read (${key.slice(0, 72)}): ${String(error?.message ?? error)}; deployment currentness fails closed`);
    }
}
/**
 * Activation currentness: approved byte identity is not current
 * authorization. Every fresh load/registration checks the trusted
 * deployment authority's revocation records — the exact approval proof
 * (by proofDigest) and the issuer (withdrawal) — BEFORE any package source
 * execution. A process without the deployment channel keeps the legacy
 * behavior (this check is a no-op there; the trust gate still applies).
 */
export async function verifyDeploymentCurrentness(proof) {
    if (channel === undefined)
        return;
    const store = requireDeploymentStore();
    const withdrawn = await readDeploymentDoc(store, issuerWithdrawalKey(proof.issuerId));
    if (withdrawn !== null) {
        throw new QualifiedPackageError('ISSUER_WITHDRAWN', `issuer ${proof.issuerId} is withdrawn by the trusted deployment authority; none of its approvals may activate`);
    }
    const revoked = await readDeploymentDoc(store, proofRevocationKey(proof.proofDigest));
    if (revoked !== null) {
        throw new QualifiedPackageError('APPROVAL_REVOKED', `this approval proof (issuer ${proof.issuerId}, digest ${proof.proofDigest}) is revoked by the trusted deployment authority; previously installed bytes no longer activate`);
    }
}
/**
 * Trusted deployment INSTALL of one sealed qualified root (governance/
 * deployment tooling only, through the Host handle): verify approval/byte
 * links INERTLY and atomically publish the immutable content-addressed
 * artifact plus one opaque installed reference.
 */
export async function deployInstallPackage(rootInput) {
    const store = requireDeploymentStore();
    // Qualification on the canonical snapshot — hostile getters never split
    // qualification from the published bytes.
    const root = assertQualifiedRoot(rootInput);
    // Approval/byte links: issuer attestation + clock policy, deployment
    // currentness, then whole-closure inert byte verification (no import).
    verifyLoadApproval(root.approval);
    await verifyDeploymentCurrentness(root.approval);
    preflightSealedClosureBytes(root);
    // The qualified snapshot is prototype-free by construction (record-safe
    // canonicalSnapshot output); re-materialize it as plain JSON first so the
    // canonical serialization below accepts it, then double-canonicalize —
    // the artifact bytes are the stable cross-process form of the sealed root.
    const artifactBytes = canonicalJson(JSON.parse(JSON.stringify(root)));
    const artifactDigest = sha256Hex(artifactBytes);
    // Atomic immutable publish: create-if-absent. An existing occupant with
    // IDENTICAL bytes is the idempotent reinstall of the same content; any
    // other occupant is a typed conflict — the address is never overwritten
    // and never substitutes another artifact's bytes.
    try {
        await store.put(deployArtifactKey(artifactDigest), { artifactDigest, artifactBytes }, { mustBeAbsent: true });
    }
    catch (error) {
        const existing = await store.get(deployArtifactKey(artifactDigest));
        const identical = existing !== null
            && isPlainRecord(existing.value)
            && existing.value.artifactDigest === artifactDigest
            && existing.value.artifactBytes === artifactBytes;
        if (!identical) {
            throw new QualifiedPackageError('INSTALL_ARTIFACT_CONFLICT', `the content address ${artifactDigest} is already occupied by different bytes; the immutable artifact publish refuses and substitutes nothing (${String(error?.message ?? error)})`);
        }
    }
    // Opaque per-Host reference: 256 random bits, never derived from content —
    // knowing the artifact bytes must not let a caller compute or re-target a
    // reference. Resolution exists only through this channel's store.
    const handle = `${V8_DEPLOY_HANDLE_PREFIX}${randomBytes(32).toString('hex')}`;
    const record = Object.freeze({
        artifactDigest,
        rootPackageId: root.rootPackageId,
        issuerId: root.approval.issuerId,
        proofDigest: root.approval.proofDigest,
        subjectDigest: root.approval.subjectDigest,
        installedAt: new Date().toISOString(),
    });
    await store.put(deployInstallKey(handle), record, { mustBeAbsent: true });
    return handle;
}
function readValidatedRecord(handle) {
    return (async () => {
        const store = requireDeploymentStore();
        const entry = await readDeploymentDoc(store, deployInstallKey(handle));
        if (entry === null) {
            throw new QualifiedPackageError('INSTALL_HANDLE_UNKNOWN', `installed reference ${handle.slice(V8_DEPLOY_HANDLE_PREFIX.length)} is not registered in this trusted deployment store; forged or foreign references never activate`);
        }
        const value = entry.value;
        if (!isPlainRecord(value)
            || typeof value.artifactDigest !== 'string'
            || !HEX64.test(value.artifactDigest)
            || typeof value.rootPackageId !== 'string'
            || value.rootPackageId.length === 0
            || typeof value.issuerId !== 'string'
            || value.issuerId.length === 0
            || typeof value.proofDigest !== 'string'
            || !HEX64.test(value.proofDigest)
            || typeof value.subjectDigest !== 'string'
            || !HEX64.test(value.subjectDigest)
            || typeof value.installedAt !== 'string') {
            return { invalid: 'record' };
        }
        return value;
    })();
}
/**
 * Activation resolution of an installed reference: link record → immutable
 * artifact → content-address re-verification. Fail-closed typed on every
 * inconsistency (unknown reference, corrupted record, interrupted publish,
 * mutated artifact bytes); NEVER substitutes another artifact. The returned
 * root is re-qualified, trust-verified and currentness-checked by load() —
 * resolution is not itself authority.
 */
export async function resolveInstalledPackageRoot(handle) {
    const record = await readValidatedRecord(handle);
    if ('invalid' in record) {
        throw new QualifiedPackageError('INSTALL_RECORD_INVALID', 'the install record of this reference is corrupted (malformed fields); activation refuses fail-closed');
    }
    const store = requireDeploymentStore();
    const artifactEntry = await readDeploymentDoc(store, deployArtifactKey(record.artifactDigest));
    if (artifactEntry === null || !isPlainRecord(artifactEntry.value) || typeof artifactEntry.value.artifactBytes !== 'string') {
        throw new QualifiedPackageError('INSTALL_RECORD_INVALID', `the install record points at artifact ${record.artifactDigest} which is absent from the trusted deployment store (interrupted or corrupted publish); activation refuses and substitutes nothing`);
    }
    const artifactBytes = artifactEntry.value.artifactBytes;
    if (sha256Hex(artifactBytes) !== record.artifactDigest) {
        throw new QualifiedPackageError('INSTALL_ARTIFACT_MUTATED', `stored artifact bytes no longer match their content address ${record.artifactDigest}; mutated installed bytes never activate`);
    }
    return JSON.parse(artifactBytes);
}
/** Durable revocation of ONE installed approval (write-once, typed double-revoke). */
export async function revokeDeployedApproval(input) {
    if (typeof input !== 'object' || input === null || !isInstalledHandleShape(input.handle)) {
        throw new QualifiedPackageError('REVOCATION_MALFORMED', 'revokeDeployedApproval requires the installed reference handle');
    }
    const record = await readValidatedRecord(input.handle);
    if ('invalid' in record) {
        throw new QualifiedPackageError('INSTALL_RECORD_INVALID', 'cannot revoke: the install record is corrupted');
    }
    const store = requireDeploymentStore();
    const key = proofRevocationKey(record.proofDigest);
    const existing = await store.get(key);
    if (existing !== null) {
        throw new QualifiedPackageError('APPROVAL_ALREADY_REVOKED', 'this approval proof is already revoked by the deployment authority');
    }
    const value = Object.freeze({
        revokedAt: new Date().toISOString(),
        issuerId: record.issuerId,
        subjectDigest: record.subjectDigest,
        ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    try {
        await store.put(key, value, { mustBeAbsent: true });
    }
    catch (error) {
        // A lost concurrent race proves double-revoke; any other store failure
        // rethrows as-is (never claim a revocation that did not commit).
        if ((await store.get(key)) !== null) {
            throw new QualifiedPackageError('APPROVAL_ALREADY_REVOKED', 'this approval proof is already revoked by the deployment authority');
        }
        throw error;
    }
}
/** Durable withdrawal of an issuer (write-once, typed double-withdrawal). */
export async function withdrawDeploymentIssuer(input) {
    if (typeof input !== 'object' || input === null || typeof input.issuerId !== 'string' || input.issuerId.length === 0) {
        throw new QualifiedPackageError('REVOCATION_MALFORMED', 'withdrawDeploymentIssuer requires a non-empty issuerId');
    }
    const store = requireDeploymentStore();
    const key = issuerWithdrawalKey(input.issuerId);
    const existing = await store.get(key);
    if (existing !== null) {
        throw new QualifiedPackageError('ISSUER_ALREADY_WITHDRAWN', `issuer ${input.issuerId} is already withdrawn by the deployment authority`);
    }
    const value = Object.freeze({
        withdrawnAt: new Date().toISOString(),
        ...(input.reason === undefined ? {} : { reason: input.reason }),
    });
    try {
        await store.put(key, value, { mustBeAbsent: true });
    }
    catch (error) {
        if ((await store.get(key)) !== null) {
            throw new QualifiedPackageError('ISSUER_ALREADY_WITHDRAWN', `issuer ${input.issuerId} is already withdrawn by the deployment authority`);
        }
        throw error;
    }
}
//# sourceMappingURL=deploy.js.map