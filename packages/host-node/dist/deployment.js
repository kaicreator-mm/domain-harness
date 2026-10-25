/**
 * DomainHarness v0.10 T08 (#1175) — governed new BUILD version activation.
 * ======================================================================
 *
 * A BUILD is a static, already-qualified executable App (`buildV10App`).
 * Selecting a *new* BUILD for a stable deployment is therefore a
 * BUILD/deployment decision, never an SDK package hot swap. This module is
 * the Host-owned deployment seam that makes that decision explicit and
 * durable:
 *
 *  - an EXACT immutable activation decision names the stable
 *    `deployedAppId`/tenant/appId, the selected BUILD's `subjectDigest`,
 *    its exact package-closure digest, the build id and an external
 *    `approvalRef`;
 *  - a trusted Host authorization authority (`verify`) must bind that very
 *    decision digest/approval reference/subject/closure to a current,
 *    unrevoked external approval. Candidate/Shadow/model material is plain
 *    data and can never stand in for that authority or authorize itself;
 *  - the accepted decision is recorded once in a durable activation ledger
 *    (idempotent retry of the same decision; a conflicting reuse refuses);
 *  - every admitted occurrence is bound to the ORIGINAL BUILD through an
 *    immutable occurrence→BUILD pin in the same CAS store. A later BUILD
 *    activation can serve new occurrences but can never re-route, replay
 *    through, rewrite or silently migrate an occurrence pinned to the old
 *    BUILD. A restored process must activate the exact pinned BUILD (the
 *    pin is never a floating "latest" pointer).
 *
 * The selected Kernel/K02 admission, CAS, Effect, UNKNOWN and original
 * receipt semantics are untouched: this layer only decides WHICH already
 * built App a caller may activate and whether a particular occurrence may
 * use that App. The physical K namespaces remain K02's own scoped tuples;
 * this module adds a separate immutable occurrence pin dimension.
 *
 * [v0.10.2 T03b (#1325)] Moved from the legacy Compiler
 * `qualified-package/v10build/deployment.ts` to its Host owner. The
 * activation dependency is now the Microkernel `./host-seam` (the narrowed
 * `HostActivation`; the governed `counters` option is dropped per L2 §3),
 * every shared constant/type comes from Contracts (never BUILD), and the
 * K02 scope prefix plus the kernel doc-key builders are consumed from the
 * LOADED selected kernel through `v10SelectedKernelIdentity` — this module
 * no longer mirrors any K document-key grammar.
 */
import { randomUUID } from 'node:crypto';
import { isPlainRecord, V10Error } from '@kaicreator/domain-harness-contracts';
import { V10_HOST_ABI, V10_KERNEL_CALLER_ROLE, V10_RUNTIME_ABI, V10_TARGET_PROFILE, sha256Canonical, } from '@kaicreator/domain-harness-contracts';
import { activateV10App, v10DeploymentDocsPrefix, v10SelectedKernelIdentity, } from '@kaicreator/domain-harness-microkernel/host-seam';
const MAX_STRING = 512;
/** Bounded concurrent submits of one RESERVED pin. */
const MAX_IN_FLIGHT = 64;
const HEX64 = /^[0-9a-f]{64}$/;
const ISO_INSTANT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const DECISION_KIND = 'v10/build-activation-decision';
const PIN_KIND = 'v10/occurrence-build-pin';
const RECORD_KIND = 'v10/deployment-activation';
const PIN_PREFIX = 'v10-occ-pin:';
const RECORD_PREFIX = 'v10-deploy-activation:';
const DECISION_FIELDS = new Set([
    'kind', 'decisionId', 'deployedAppId', 'tenantId', 'appId', 'subjectDigest',
    'buildId', 'packageClosureDigest', 'runtimeAbi', 'hostAbi', 'targetProfile',
    'approvalRef', 'approvedAt', 'validUntil',
]);
const PIN_FIELDS = new Set([
    'kind', 'deployedAppId', 'tenantId', 'appId', 'businessPackageId',
    'workflowId', 'instanceKey', 'subjectDigest', 'packageClosureDigest',
    'buildId', 'decisionId', 'approvalRef', 'pinnedAt',
    // v2 (#1219 reservation protocol): phase + ownership + writer fence slot.
    'phase', 'reservation', 'activeAttempt', 'admittedAt',
    // v3: the set of registered in-flight submits of one RESERVED pin.
    'inFlight',
]);
const RECORD_FIELDS = new Set([
    'kind', 'decisionId', 'decisionDigest', 'deployedAppId', 'tenantId', 'appId',
    'subjectDigest', 'packageClosureDigest', 'buildId', 'approvalRef',
    'authorizedAt', 'expiresAt', 'activatedAt',
]);
export class V10DeploymentError extends V10Error {
    detail;
    constructor(code, message, detail) {
        super(code, message);
        this.name = 'V10DeploymentError';
        this.detail = detail === undefined ? undefined : Object.freeze({ ...detail });
    }
}
function refuse(code, message, detail) {
    throw new V10DeploymentError(code, message, detail);
}
/**
 * Reclassify any bounded-shape failure inside a stored record under its own
 * typed code: a corrupt pin/activation record must never surface as a generic
 * BUILD-input error or be mistaken for a valid deployment fact.
 */
function reclassify(code, build) {
    try {
        return build();
    }
    catch (error) {
        if (error instanceof V10DeploymentError) {
            if (error.code === code)
                throw error;
            refuse(code, `${code}: ${error.message}`);
        }
        throw error;
    }
}
function bounded(value, label, max = MAX_STRING) {
    if (typeof value !== 'string' || value.length === 0 || value.length > max) {
        refuse('INVALID_BUILD_VERSION', `${label} must be a non-empty string of at most ${String(max)} characters`);
    }
    return value;
}
function isoInstant(value, label) {
    const text = bounded(value, label, 64);
    if (!ISO_INSTANT_RE.test(text))
        refuse('INVALID_BUILD_VERSION', `${label} must be an ISO-8601 instant with an explicit zone`);
    const ms = Date.parse(text);
    if (!Number.isFinite(ms))
        refuse('INVALID_BUILD_VERSION', `${label} must be a valid ISO-8601 instant`);
    return { text: new Date(ms).toISOString(), ms };
}
function hex64(value, label) {
    if (typeof value !== 'string' || !HEX64.test(value)) {
        refuse('INVALID_BUILD_VERSION', `${label} must be a 64-character lowercase SHA-256 hex string`);
    }
    return value;
}
function isCasConflict(error) {
    const code = error?.code;
    return code === 'HOST_CAS_CONFLICT' || code === 'HOST_KEY_EXISTS';
}
function encodeKeyComponent(value) {
    return value.replace(/%/g, '%25').replace(/:/g, '%3A');
}
function snapshotDeployment(raw) {
    if (!isPlainRecord(raw))
        refuse('INVALID_BUILD_VERSION', 'deployment must be a plain record');
    return Object.freeze({
        deployedAppId: bounded(raw.deployedAppId, 'deployment.deployedAppId', 256),
        tenantId: bounded(raw.tenantId, 'deployment.tenantId', 256),
        appId: bounded(raw.appId, 'deployment.appId', 256),
    });
}
function snapshotDecision(raw) {
    if (!isPlainRecord(raw)) {
        refuse('INVALID_BUILD_VERSION', 'a BUILD activation decision must be a plain record');
    }
    // Candidate/Shadow/model-shaped material, or a self-approval flag, is not
    // an external deployment authorization. Fail typed before reading anything.
    if ('approved' in raw || 'candidate' in raw || 'shadow' in raw || 'modelProposal' in raw) {
        refuse('UNAUTHORIZED_PROMOTION', 'candidate/Shadow/model evidence and self-approval flags cannot authorize a BUILD activation; only the Host authorization authority can');
    }
    if (raw.kind !== DECISION_KIND) {
        if (typeof raw.kind === 'string' && /shadow|candidate|model|promotion/i.test(raw.kind)) {
            refuse('UNAUTHORIZED_PROMOTION', `record kind ${raw.kind} is not an external deployment authorization`);
        }
        refuse('INVALID_BUILD_VERSION', `activation decision kind must be exactly ${DECISION_KIND}`);
    }
    const unknown = Object.keys(raw).filter((key) => !DECISION_FIELDS.has(key));
    if (unknown.length > 0) {
        refuse('INVALID_BUILD_VERSION', `activation decision carries unsupported fields: ${unknown.join(', ')}`);
    }
    const approvedAt = isoInstant(raw.approvedAt, 'decision.approvedAt');
    const validUntil = isoInstant(raw.validUntil, 'decision.validUntil');
    if (validUntil.ms <= approvedAt.ms) {
        refuse('INVALID_BUILD_VERSION', 'decision.validUntil must be later than decision.approvedAt');
    }
    return Object.freeze({
        kind: DECISION_KIND,
        decisionId: bounded(raw.decisionId, 'decision.decisionId', 256),
        deployedAppId: bounded(raw.deployedAppId, 'decision.deployedAppId', 256),
        tenantId: bounded(raw.tenantId, 'decision.tenantId', 256),
        appId: bounded(raw.appId, 'decision.appId', 256),
        subjectDigest: hex64(raw.subjectDigest, 'decision.subjectDigest'),
        buildId: bounded(raw.buildId, 'decision.buildId', 256),
        packageClosureDigest: hex64(raw.packageClosureDigest, 'decision.packageClosureDigest'),
        runtimeAbi: bounded(raw.runtimeAbi, 'decision.runtimeAbi', 128),
        hostAbi: bounded(raw.hostAbi, 'decision.hostAbi', 128),
        targetProfile: bounded(raw.targetProfile, 'decision.targetProfile', 128),
        approvalRef: bounded(raw.approvalRef, 'decision.approvalRef', 512),
        approvedAt: approvedAt.text,
        validUntil: validUntil.text,
    });
}
/**
 * The canonical digest of one decision after bounded normalization. A Host
 * authority records/verifies THIS digest, so equivalent ISO spellings of the
 * same instant cannot mint two different approvals.
 */
export function v10BuildActivationDecisionDigest(raw) {
    return sha256Canonical(snapshotDecision(raw));
}
/**
 * The exact package closure digest of one built App: its sealed package
 * identities, byte digests, roles and sealed load order. The BUILD
 * `subjectDigest` also covers routes/budgets/profile revisions; this second
 * digest is the deployment decision's explicit package-closure pin.
 */
export function v10BuildPackageClosureDigest(app) {
    return sha256Canonical({
        formatVersion: app.formatVersion,
        appId: app.appId,
        buildId: app.buildId,
        targetProfile: app.targetProfile,
        runtimeAbi: app.runtimeAbi,
        hostAbi: app.hostAbi,
        packages: [...app.modules].map((module) => ({
            packageId: module.packageId,
            role: module.role,
            abiVersion: module.abiVersion,
            moduleSha256: module.moduleSha256,
            endpoint: module.endpoint,
            capabilityId: module.capabilityId,
            externalEffect: module.externalEffect,
            handlers: module.handlers === null ? null : module.handlers.map((handler) => ({ ...handler })),
        })).sort((left, right) => (left.packageId < right.packageId ? -1 : left.packageId > right.packageId ? 1 : 0)),
        loadOrder: [...app.loadOrder],
    });
}
/** The injective durable key of one occurrence pin. */
export function v10OccurrenceBuildPinKey(deployment, target) {
    return PIN_PREFIX + [
        deployment.deployedAppId,
        deployment.tenantId,
        deployment.appId,
        target.businessPackageId,
        target.workflowId,
        target.instanceKey,
    ].map(encodeKeyComponent).join(':');
}
/** The injective durable key of one accepted activation decision. */
export function v10DeploymentActivationKey(deployedAppId, decisionId) {
    return `${RECORD_PREFIX}${encodeKeyComponent(deployedAppId)}:${encodeKeyComponent(decisionId)}`;
}
function snapshotTarget(raw) {
    if (!isPlainRecord(raw))
        refuse('OCCURRENCE_BUILD_PIN_INVALID', 'occurrence target must be a plain record');
    return Object.freeze({
        businessPackageId: bounded(raw.businessPackageId, 'occurrence.businessPackageId', 256),
        workflowId: bounded(raw.workflowId, 'occurrence.workflowId', 256),
        instanceKey: bounded(raw.instanceKey, 'occurrence.instanceKey', 256),
    });
}
function assertPinShape(value, deployment, target) {
    return reclassify('OCCURRENCE_BUILD_PIN_INVALID', () => {
        if (!isPlainRecord(value)) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a stored occurrence BUILD pin is not a plain record');
        }
        const unknown = Object.keys(value).filter((key) => !PIN_FIELDS.has(key));
        if (unknown.length > 0 || value.kind !== PIN_KIND) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a stored occurrence BUILD pin has an unrecognized shape');
        }
        const pin = Object.freeze({
            kind: PIN_KIND,
            deployedAppId: bounded(value.deployedAppId, 'pin.deployedAppId', 256),
            tenantId: bounded(value.tenantId, 'pin.tenantId', 256),
            appId: bounded(value.appId, 'pin.appId', 256),
            businessPackageId: bounded(value.businessPackageId, 'pin.businessPackageId', 256),
            workflowId: bounded(value.workflowId, 'pin.workflowId', 256),
            instanceKey: bounded(value.instanceKey, 'pin.instanceKey', 256),
            subjectDigest: hex64(value.subjectDigest, 'pin.subjectDigest'),
            packageClosureDigest: hex64(value.packageClosureDigest, 'pin.packageClosureDigest'),
            buildId: bounded(value.buildId, 'pin.buildId', 256),
            decisionId: bounded(value.decisionId, 'pin.decisionId', 256),
            approvalRef: bounded(value.approvalRef, 'pin.approvalRef', 512),
            pinnedAt: isoInstant(value.pinnedAt, 'pin.pinnedAt').text,
        });
        if (pin.deployedAppId !== deployment.deployedAppId
            || pin.tenantId !== deployment.tenantId
            || pin.appId !== deployment.appId
            || pin.businessPackageId !== target.businessPackageId
            || pin.workflowId !== target.workflowId
            || pin.instanceKey !== target.instanceKey) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a stored occurrence BUILD pin does not match its address');
        }
        // v2 (#1219): phase normalization + reservation/writer-slot validation.
        const rawPhase = value.phase;
        const phase = rawPhase === undefined ? 'ADMITTED'
            : rawPhase === 'RESERVED' || rawPhase === 'ADMITTED' ? rawPhase
                : refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a stored occurrence BUILD pin carries an unknown phase');
        let reservation;
        let activeAttempt;
        let inFlight;
        let admittedAt;
        if (phase === 'RESERVED') {
            if (!isPlainRecord(value.reservation)) {
                refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a RESERVED occurrence BUILD pin carries no reservation binding');
            }
            reservation = Object.freeze({
                messageId: bounded(value.reservation.messageId, 'pin.reservation.messageId', MAX_STRING),
                ...(value.reservation.intentType === undefined ? {} : {
                    intentType: bounded(value.reservation.intentType, 'pin.reservation.intentType', MAX_STRING),
                }),
                inputDigest: hex64(value.reservation.inputDigest, 'pin.reservation.inputDigest'),
                reservedAt: isoInstant(value.reservation.reservedAt, 'pin.reservation.reservedAt').text,
            });
            const rawAttempt = value.activeAttempt;
            if (rawAttempt !== null && rawAttempt !== undefined) {
                if (!isPlainRecord(rawAttempt) || rawAttempt.holder !== 'writer') {
                    refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a RESERVED occurrence BUILD pin carries a malformed writer fence slot');
                }
                activeAttempt = Object.freeze({
                    attemptId: bounded(rawAttempt.attemptId, 'pin.activeAttempt.attemptId', 128),
                    holder: 'writer',
                });
            }
            else {
                activeAttempt = null;
            }
            if (value.inFlight !== undefined) {
                if (!Array.isArray(value.inFlight) || value.inFlight.length > MAX_IN_FLIGHT) {
                    refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a RESERVED occurrence BUILD pin carries a malformed in-flight attempt set');
                }
                const ids = value.inFlight.map((id) => bounded(id, 'pin.inFlight[]', 128));
                if (new Set(ids).size !== ids.length) {
                    refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a RESERVED occurrence BUILD pin repeats an in-flight attempt');
                }
                inFlight = Object.freeze(ids);
            }
        }
        else if (value.reservation !== undefined || value.inFlight !== undefined
            || (value.activeAttempt !== undefined && value.activeAttempt !== null)) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', 'an ADMITTED occurrence BUILD pin carries no reservation or writer slot');
        }
        else {
            admittedAt = value.admittedAt === undefined ? undefined : isoInstant(value.admittedAt, 'pin.admittedAt').text;
        }
        return Object.freeze({
            ...pin,
            phase,
            ...(reservation !== undefined ? { reservation } : {}),
            ...(activeAttempt !== undefined ? { activeAttempt } : {}),
            ...(inFlight !== undefined ? { inFlight } : {}),
            ...(admittedAt !== undefined ? { admittedAt } : {}),
        });
    });
}
/** Read the immutable BUILD pin of one occurrence, if it exists. */
export async function readV10OccurrenceBuildPin(store, deployment, target) {
    const identity = snapshotDeployment(deployment);
    const address = snapshotTarget(target);
    const doc = await store.get(v10OccurrenceBuildPinKey(identity, address));
    return doc === null ? null : assertPinShape(doc.value, identity, address);
}
/** Read one durable accepted activation decision, if it exists. */
export async function readV10DeploymentActivationRecord(store, deployedAppId, decisionId) {
    const requestedDeployedAppId = bounded(deployedAppId, 'deployedAppId', 256);
    const requestedDecisionId = bounded(decisionId, 'decisionId', 256);
    const doc = await store.get(v10DeploymentActivationKey(requestedDeployedAppId, requestedDecisionId));
    if (doc === null)
        return null;
    return reclassify('DEPLOYMENT_ACTIVATION_RECORD_INVALID', () => {
        const value = doc.value;
        if (!isPlainRecord(value)) {
            refuse('DEPLOYMENT_ACTIVATION_RECORD_INVALID', 'a stored deployment activation record is not a plain record');
        }
        const unknown = Object.keys(value).filter((key) => !RECORD_FIELDS.has(key));
        if (unknown.length > 0 || value.kind !== RECORD_KIND) {
            refuse('DEPLOYMENT_ACTIVATION_RECORD_INVALID', 'a stored deployment activation record has an unrecognized shape');
        }
        const record = Object.freeze({
            kind: RECORD_KIND,
            decisionId: bounded(value.decisionId, 'record.decisionId', 256),
            decisionDigest: hex64(value.decisionDigest, 'record.decisionDigest'),
            deployedAppId: bounded(value.deployedAppId, 'record.deployedAppId', 256),
            tenantId: bounded(value.tenantId, 'record.tenantId', 256),
            appId: bounded(value.appId, 'record.appId', 256),
            subjectDigest: hex64(value.subjectDigest, 'record.subjectDigest'),
            packageClosureDigest: hex64(value.packageClosureDigest, 'record.packageClosureDigest'),
            buildId: bounded(value.buildId, 'record.buildId', 256),
            approvalRef: bounded(value.approvalRef, 'record.approvalRef', 512),
            authorizedAt: isoInstant(value.authorizedAt, 'record.authorizedAt').text,
            expiresAt: isoInstant(value.expiresAt, 'record.expiresAt').text,
            activatedAt: isoInstant(value.activatedAt, 'record.activatedAt').text,
        });
        if (record.deployedAppId !== requestedDeployedAppId || record.decisionId !== requestedDecisionId) {
            refuse('DEPLOYMENT_ACTIVATION_RECORD_INVALID', 'a stored deployment activation record does not match its durable key');
        }
        return record;
    });
}
/**
 * Structural and identity proof of one decision against one built App. This
 * is shared by the fresh-promotion path (`CURRENT`) and the restore path
 * (`PINNED_ONLY`); it deliberately says nothing about the clock.
 */
function verifyDecisionIdentity(app, deployment, rawDecision) {
    const decision = snapshotDecision(rawDecision);
    if (app.appId !== deployment.appId
        || decision.deployedAppId !== deployment.deployedAppId
        || decision.tenantId !== deployment.tenantId
        || decision.appId !== deployment.appId) {
        refuse('DEPLOYMENT_IDENTITY_MISMATCH', 'the activation decision, the built App and the stable deployment identity disagree');
    }
    if (decision.subjectDigest !== app.subjectDigest) {
        refuse('BUILD_SUBJECT_DIGEST_MISMATCH', 'the activation decision names a different BUILD subject digest than the supplied App');
    }
    const closureDigest = v10BuildPackageClosureDigest(app);
    if (decision.packageClosureDigest !== closureDigest) {
        refuse('BUILD_CLOSURE_MISMATCH', 'the activation decision names a different package closure than the supplied App');
    }
    if (decision.buildId !== app.buildId) {
        refuse('INVALID_BUILD_VERSION', 'the activation decision names a different BUILD id than the supplied App');
    }
    if (decision.runtimeAbi !== V10_RUNTIME_ABI
        || decision.hostAbi !== V10_HOST_ABI
        || decision.targetProfile !== V10_TARGET_PROFILE
        || app.runtimeAbi !== V10_RUNTIME_ABI
        || app.hostAbi !== V10_HOST_ABI
        || app.targetProfile !== V10_TARGET_PROFILE) {
        refuse('INVALID_BUILD_VERSION', 'the activation decision and the App must both carry the selected v0.10 Node24 profile/ABI');
    }
    return Object.freeze({ decision, decisionDigest: sha256Canonical(decision), closureDigest });
}
function requireAuthorizationAuthority(authorization) {
    if (!isPlainRecord(authorization)) {
        refuse('DEPLOYMENT_APPROVAL_MISSING', 'a trusted Host deployment authorization authority is required; candidate/Shadow data is not one');
    }
    let verify;
    try {
        verify = authorization.verify;
    }
    catch {
        refuse('DEPLOYMENT_APPROVAL_MISSING', 'the deployment authorization authority could not expose its verify capability');
    }
    if (typeof verify !== 'function') {
        refuse('DEPLOYMENT_APPROVAL_MISSING', 'a trusted Host deployment authorization authority with verify() is required; candidate/Shadow data is not one');
    }
    return verify;
}
function authorizationRequest(app, deployment, verified, nowMs) {
    return Object.freeze({
        requestKind: 'v10/deployment-authorization-request',
        decisionDigest: verified.decisionDigest,
        decision: verified.decision,
        build: Object.freeze({
            deployedAppId: deployment.deployedAppId,
            tenantId: deployment.tenantId,
            appId: deployment.appId,
            subjectDigest: app.subjectDigest,
            packageClosureDigest: verified.closureDigest,
            buildId: app.buildId,
        }),
        nowIso: new Date(nowMs).toISOString(),
    });
}
async function callAuthorization(verify, request) {
    let verdict;
    try {
        verdict = await verify(request);
    }
    catch (error) {
        refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', `the Host authorization authority failed closed: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!isPlainRecord(verdict)) {
        refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', 'the Host authorization authority returned no bounded verdict');
    }
    return verdict;
}
function deniedVerdict(verdict) {
    return Object.freeze({
        reasonCode: typeof verdict.reasonCode === 'string' ? verdict.reasonCode : '',
        reason: typeof verdict.reason === 'string' ? verdict.reason : 'deployment authorization denied',
    });
}
function refuseDenied(reasonCode, reason) {
    if (reasonCode === 'DEPLOYMENT_APPROVAL_REVOKED')
        refuse('DEPLOYMENT_APPROVAL_REVOKED', reason);
    if (reasonCode === 'DEPLOYMENT_APPROVAL_STALE')
        refuse('DEPLOYMENT_APPROVAL_STALE', reason);
    refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', reason, { reasonCode });
}
/** Validate that an AUTHORIZED verdict binds this exact decision/BUILD. */
function authorizedWindow(verdict, app, verified) {
    if (verdict.decisionDigest !== verified.decisionDigest
        || verdict.authorizationRef !== verified.decision.approvalRef
        || verdict.subjectDigest !== app.subjectDigest
        || verdict.packageClosureDigest !== verified.closureDigest) {
        refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', 'the Host authorization verdict does not bind this exact decision, approval reference, subject and closure');
    }
    const authorizedAtText = verdict.authorizedAt;
    const expiresAtText = verdict.expiresAt;
    if (typeof authorizedAtText !== 'string' || typeof expiresAtText !== 'string') {
        refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', 'the Host authorization verdict carries no bounded validity window');
    }
    const authorizedAt = Date.parse(authorizedAtText);
    const expiresAt = Date.parse(expiresAtText);
    if (!Number.isFinite(authorizedAt) || !Number.isFinite(expiresAt)) {
        refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', 'the Host authorization verdict validity window is not ISO-8601');
    }
    return Object.freeze({
        authorizedAt: new Date(authorizedAt).toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
    });
}
/**
 * `CURRENT` is the fresh new-BUILD authorization: the decision's promotion
 * window and the trusted authority's CURRENT unrevoked verdict must both be
 * valid right now.
 */
async function verifyCurrentDecision(app, deployment, rawDecision, authorization, nowMs) {
    const verified = verifyDecisionIdentity(app, deployment, rawDecision);
    const approvedAt = Date.parse(verified.decision.approvedAt);
    const validUntil = Date.parse(verified.decision.validUntil);
    if (!(nowMs >= approvedAt && nowMs < validUntil)) {
        refuse('DEPLOYMENT_APPROVAL_STALE', 'the external deployment approval is not currently valid', {
            approvedAt: verified.decision.approvedAt,
            validUntil: verified.decision.validUntil,
        });
    }
    const verify = requireAuthorizationAuthority(authorization);
    const verdict = await callAuthorization(verify, authorizationRequest(app, deployment, verified, nowMs));
    if (verdict.status === 'DENIED') {
        const denied = deniedVerdict(verdict);
        refuseDenied(denied.reasonCode, denied.reason);
    }
    if (verdict.status !== 'AUTHORIZED') {
        refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', 'the Host authorization authority returned an unrecognized verdict');
    }
    const window = authorizedWindow(verdict, app, verified);
    if (!(nowMs >= Date.parse(window.authorizedAt) && nowMs < Date.parse(window.expiresAt))) {
        refuse('DEPLOYMENT_APPROVAL_STALE', 'the Host authorization verdict is outside its current validity window', {
            authorizedAt: window.authorizedAt,
            expiresAt: window.expiresAt,
        });
    }
    return Object.freeze({ ...verified, ...window });
}
function assertRestorableRecord(record, app, deployment, verified) {
    if (record.decisionDigest !== verified.decisionDigest
        || record.deployedAppId !== deployment.deployedAppId
        || record.tenantId !== deployment.tenantId
        || record.appId !== deployment.appId
        || record.subjectDigest !== app.subjectDigest
        || record.packageClosureDigest !== verified.closureDigest
        || record.buildId !== app.buildId
        || record.approvalRef !== verified.decision.approvalRef) {
        refuse('DEPLOYMENT_ACTIVATION_RECORD_MISMATCH', 'the durable activation record does not bind this exact BUILD/deployment identity', {
            decisionId: verified.decision.decisionId,
            buildId: app.buildId,
        });
    }
}
/**
 * `PINNED_ONLY` restores an ALREADY accepted, durably pinned BUILD. Its trust
 * anchor is the create-only activation record written by the original
 * `CURRENT` acceptance, not a fresh promotion window: a routine expiry of
 * that window must not invalidate occurrences admitted while it was valid.
 *
 * The external authority is still consulted, exactly so an explicit
 * revocation fails typed. On ordinary expiry the exact accepted decision is
 * re-verified at the durable acceptance instant, which re-proves the
 * decision/approval/BUILD binding without moving the clock; missing or
 * foreign approval material still fails closed. No activation record is
 * written on this path, and `send` still refuses any occurrence without an
 * exact prior BUILD pin.
 */
async function verifyPinnedRestoration(app, deployment, rawDecision, authorization, store, nowMs) {
    const verified = verifyDecisionIdentity(app, deployment, rawDecision);
    const record = await readV10DeploymentActivationRecord(store, deployment.deployedAppId, verified.decision.decisionId);
    if (record === null) {
        refuse('DEPLOYMENT_ACTIVATION_RECORD_MISSING', 'PINNED_ONLY restores only a durably accepted BUILD; no activation record exists for this decision', {
            decisionId: verified.decision.decisionId,
            buildId: app.buildId,
        });
    }
    assertRestorableRecord(record, app, deployment, verified);
    const verify = requireAuthorizationAuthority(authorization);
    const current = await callAuthorization(verify, authorizationRequest(app, deployment, verified, nowMs));
    if (current.status === 'DENIED') {
        const denied = deniedVerdict(current);
        if (denied.reasonCode !== 'DEPLOYMENT_APPROVAL_STALE') {
            refuseDenied(denied.reasonCode, denied.reason);
        }
        // Ordinary promotion-window expiry: ask the same authority about the
        // durable acceptance instant. Revocation/missing material still refuses.
        const historical = await callAuthorization(verify, authorizationRequest(app, deployment, verified, Date.parse(record.authorizedAt)));
        if (historical.status === 'DENIED') {
            const deniedAgain = deniedVerdict(historical);
            refuseDenied(deniedAgain.reasonCode, deniedAgain.reason);
        }
        if (historical.status !== 'AUTHORIZED') {
            refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', 'the Host authorization authority returned an unrecognized restoration verdict');
        }
        authorizedWindow(historical, app, verified);
        return verified;
    }
    if (current.status !== 'AUTHORIZED') {
        refuse('DEPLOYMENT_AUTHORIZATION_UNAUTHORIZED', 'the Host authorization authority returned an unrecognized verdict');
    }
    authorizedWindow(current, app, verified);
    return verified;
}
function recordMatches(record, candidate) {
    return record.decisionDigest === candidate.decisionDigest
        && record.deployedAppId === candidate.deployedAppId
        && record.tenantId === candidate.tenantId
        && record.appId === candidate.appId
        && record.subjectDigest === candidate.subjectDigest
        && record.packageClosureDigest === candidate.packageClosureDigest
        && record.buildId === candidate.buildId
        && record.approvalRef === candidate.approvalRef;
}
async function ensureActivationRecord(store, candidate) {
    const key = v10DeploymentActivationKey(candidate.deployedAppId, candidate.decisionId);
    const existing = await readV10DeploymentActivationRecord(store, candidate.deployedAppId, candidate.decisionId);
    if (existing !== null) {
        if (!recordMatches(existing, candidate)) {
            refuse('DEPLOYMENT_DECISION_CONFLICT', 'the same activation decision id was already used for a different BUILD identity', {
                decisionId: candidate.decisionId,
                existingSubjectDigest: existing.subjectDigest,
                candidateSubjectDigest: candidate.subjectDigest,
            });
        }
        return existing;
    }
    try {
        await store.put(key, candidate, { kind: 'create' });
        return candidate;
    }
    catch (error) {
        if (!isCasConflict(error))
            throw error;
        const raced = await readV10DeploymentActivationRecord(store, candidate.deployedAppId, candidate.decisionId);
        if (raced !== null && recordMatches(raced, candidate))
            return raced;
        refuse('DEPLOYMENT_DECISION_CONFLICT', 'a concurrent activation wrote a different decision under the same decision id');
    }
}
function pinMatches(pin, build) {
    return pin.subjectDigest === build.subjectDigest
        && pin.packageClosureDigest === build.packageClosureDigest
        && pin.deployedAppId === build.deployedAppId
        && pin.tenantId === build.tenantId
        && pin.appId === build.appId;
}
/**
 * The storable shape of one pin — exactly the PIN_FIELDS membership, so a
 * round trip through assertPinShape is identity-preserving.
 */
function pinStoreValue(pin) {
    return {
        kind: PIN_KIND,
        deployedAppId: pin.deployedAppId,
        tenantId: pin.tenantId,
        appId: pin.appId,
        businessPackageId: pin.businessPackageId,
        workflowId: pin.workflowId,
        instanceKey: pin.instanceKey,
        subjectDigest: pin.subjectDigest,
        packageClosureDigest: pin.packageClosureDigest,
        buildId: pin.buildId,
        decisionId: pin.decisionId,
        approvalRef: pin.approvalRef,
        pinnedAt: pin.pinnedAt,
        ...(pin.phase === undefined ? {} : { phase: pin.phase }),
        ...(pin.reservation === undefined ? {} : { reservation: { ...pin.reservation } }),
        ...(pin.activeAttempt === undefined || pin.activeAttempt === null ? {} : { activeAttempt: { ...pin.activeAttempt } }),
        ...(pin.inFlight === undefined ? {} : { inFlight: [...pin.inFlight] }),
        ...(pin.admittedAt === undefined ? {} : { admittedAt: pin.admittedAt }),
    };
}
class GovernedBuildActivation {
    #store;
    #deployment;
    #build;
    #selection;
    #activation;
    #now;
    #closed = false;
    constructor(deps) {
        this.#store = deps.store;
        this.#deployment = deps.deployment;
        this.#build = deps.build;
        this.#selection = deps.selection;
        this.#activation = deps.activation;
        this.#now = deps.now;
    }
    get build() {
        return this.#build;
    }
    get selection() {
        return this.#selection;
    }
    get selectedShadowBinding() {
        return this.#activation.facade.selectedShadowBinding;
    }
    resolveIntentTarget(intentType) {
        this.#assertOpen();
        return this.#activation.facade.resolveIntentTarget(intentType);
    }
    async readPin(intent) {
        this.#assertOpen();
        const target = this.#targetFor(intent);
        return await readV10OccurrenceBuildPin(this.#store, this.#deployment, target);
    }
    async send(intent) {
        this.#assertOpen();
        const target = this.#targetFor(intent);
        // The selected Standard Router is pure: reject missing/ambiguous/forged
        // route outcomes before creating any durable occurrence BUILD pin.
        this.#activation.facade.preflightIntentRouting(intent.intentType);
        const attempt = await this.#beginOccurrenceAttempt(intent, target);
        let receipt;
        try {
            receipt = await this.#activation.facade.send(intent);
        }
        catch (error) {
            // A thrown failure is never proven pre-write (e.g. a lost write ACK
            // after the Kernel's admission committed). The attempt heals from its
            // witness, or else stays registered as possibly-admitting; the RESERVED
            // pin is never deleted on this path (#1219 F2).
            await this.#concludeAmbiguousAttempt(attempt).catch(() => { });
            throw error;
        }
        return await this.#settleOccurrenceAttempt(attempt, receipt);
    }
    async recoverReservation(intent, options) {
        this.#assertOpen();
        const target = this.#targetFor(intent);
        const doc = await this.#readPinDoc(target);
        if (doc === null)
            return 'ABSENT';
        if (!pinMatches(doc.value, this.#build)) {
            if (doc.value.phase === 'RESERVED') {
                refuse('OCCURRENCE_RESERVATION_PENDING', 'this occurrence has an unresolved RESERVED pin of another BUILD; only its owning BUILD recovers or continues it', {
                    retryable: true,
                    pinnedBuildId: doc.value.buildId,
                    activatedBuildId: this.#build.buildId,
                    businessPackageId: target.businessPackageId,
                    workflowId: target.workflowId,
                    instanceKey: target.instanceKey,
                });
            }
            refuse('OCCURRENCE_REDIRECTED_TO_NEW_BUILD', 'this occurrence is immutably pinned to its original BUILD; the current activation cannot serve it', {
                pinnedSubjectDigest: doc.value.subjectDigest,
                activatedSubjectDigest: this.#build.subjectDigest,
                businessPackageId: target.businessPackageId,
                workflowId: target.workflowId,
                instanceKey: target.instanceKey,
            });
        }
        if (doc.value.phase === 'ADMITTED')
            return 'ADMITTED';
        const reservation = doc.value.reservation;
        const witness = await this.#readAdmissionWitness(target, reservation.messageId);
        if (witness !== null && witness.messageId === reservation.messageId && witness.inputDigest === reservation.inputDigest
            && (reservation.intentType === undefined || witness.intentType === reservation.intentType)) {
            await this.#commitAdmitted(target);
            return 'ADMITTED';
        }
        // Fail-closed core of the #1219 corrections: an instance snapshot proves
        // nothing (F1 — openInstance durability is not admission), and a
        // possibly-live Kernel writer can never be fenced from here (F2). The
        // RESERVED pin stays; the owner continues the exact reserved messageId.
        // Only the Host's explicit assertions release durable attempt state:
        // `priorWriterTerminated` frees the writer slot alone (registered
        // in-flight submits still block compensation, so a false assertion
        // cannot cause a pin delete); `allAttemptsTerminated` also empties the
        // in-flight set and is SAFE ONLY IF TRUE — it is the exit for crashed
        // submits whose stale entries would otherwise block compensation.
        const clearAll = options?.allAttemptsTerminated === true;
        const slotHeld = doc.value.activeAttempt !== null && doc.value.activeAttempt !== undefined;
        const inFlightHeld = doc.value.inFlight === undefined || doc.value.inFlight.length > 0;
        if ((clearAll && (slotHeld || inFlightHeld)) || (options?.priorWriterTerminated === true && slotHeld)) {
            try {
                await this.#store.put(v10OccurrenceBuildPinKey(this.#deployment, target), pinStoreValue({ ...doc.value, activeAttempt: null, ...(clearAll ? { inFlight: [] } : {}) }), { kind: 'cas', revision: doc.revision });
            }
            catch (error) {
                if (!isCasConflict(error))
                    throw error;
                refuse('OCCURRENCE_RESERVATION_INDETERMINATE', 'the reservation changed while its stale writer slot was being freed; nothing was deleted (fail-closed)');
            }
        }
        return 'PENDING';
    }
    async #readPinDoc(target) {
        const doc = await this.#store.get(v10OccurrenceBuildPinKey(this.#deployment, target));
        if (doc === null)
            return null;
        return { value: assertPinShape(doc.value, this.#deployment, target), revision: doc.revision };
    }
    /**
     * Mint or join the occurrence's reservation. Creates the pin as RESERVED
     * with the writer slot claimed by this attempt; an existing ADMITTED pin
     * (same BUILD) passes through unchanged; an existing RESERVED pin accepts
     * only its exact (messageId, bound intentType, inputDigest) owner — either
     * by claiming a free writer slot, or by adopting under a held one. K02's
     * durable dedup prevents duplicate committed turns. Everything else
     * refuses typed before any Kernel access.
     */
    async #beginOccurrenceAttempt(intent, target) {
        const messageId = intent.messageId;
        if (typeof messageId !== 'string' || messageId.length === 0 || messageId.length > MAX_STRING) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a governed send requires a bounded non-empty messageId; the reservation protocol binds admission to it');
        }
        if (!isPlainRecord(intent.input)) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a governed send requires a plain record input; the reservation digest and the Kernel witness must bind the exact same canonical bytes');
        }
        // The SELECTED kernel's own canonical digest: the witness compares it
        // byte-for-byte with the receipt's inputDigest (compiler canonicalJson
        // differs on integer-like keys).
        const inputDigest = v10SelectedKernelIdentity(this.#activation.facade).inputDigest(intent.input);
        const intentType = intent.intentType;
        const attemptId = randomUUID();
        const now = new Date(this.#now()).toISOString();
        for (let round = 0; round < 5; round += 1) {
            const doc = await this.#readPinDoc(target);
            if (doc === null) {
                if (this.#selection === 'PINNED_ONLY') {
                    refuse('OCCURRENCE_BUILD_PIN_MISSING', 'this activation restores pinned occurrences only; the occurrence has no original BUILD pin', {
                        businessPackageId: target.businessPackageId,
                        workflowId: target.workflowId,
                        instanceKey: target.instanceKey,
                    });
                }
                const reserved = Object.freeze({
                    kind: PIN_KIND,
                    deployedAppId: this.#deployment.deployedAppId,
                    tenantId: this.#deployment.tenantId,
                    appId: this.#deployment.appId,
                    businessPackageId: target.businessPackageId,
                    workflowId: target.workflowId,
                    instanceKey: target.instanceKey,
                    subjectDigest: this.#build.subjectDigest,
                    packageClosureDigest: this.#build.packageClosureDigest,
                    buildId: this.#build.buildId,
                    decisionId: this.#build.decisionId,
                    approvalRef: this.#build.approvalRef,
                    pinnedAt: now,
                    phase: 'RESERVED',
                    reservation: Object.freeze({ messageId, intentType, inputDigest, reservedAt: now }),
                    activeAttempt: Object.freeze({ attemptId, holder: 'writer' }),
                    inFlight: Object.freeze([attemptId]),
                });
                try {
                    const put = await this.#store.put(v10OccurrenceBuildPinKey(this.#deployment, target), pinStoreValue(reserved), { kind: 'create' });
                    return { mode: 'owner', target, messageId, intentType, intentBound: true, inputDigest, attemptId, revision: put.revision, registered: true };
                }
                catch (error) {
                    if (!isCasConflict(error))
                        throw error;
                    continue;
                }
            }
            const pin = doc.value;
            if (!pinMatches(pin, this.#build)) {
                if (pin.phase === 'RESERVED') {
                    refuse('OCCURRENCE_RESERVATION_PENDING', 'this occurrence has an unresolved RESERVED pin of another BUILD; no takeover exists — its owning BUILD continues or recovers it', {
                        retryable: true,
                        pinnedBuildId: pin.buildId,
                        activatedBuildId: this.#build.buildId,
                        businessPackageId: target.businessPackageId,
                        workflowId: target.workflowId,
                        instanceKey: target.instanceKey,
                    });
                }
                refuse('OCCURRENCE_REDIRECTED_TO_NEW_BUILD', 'this occurrence is immutably pinned to its original BUILD; the current activation cannot serve it', {
                    pinnedSubjectDigest: pin.subjectDigest,
                    activatedSubjectDigest: this.#build.subjectDigest,
                    businessPackageId: target.businessPackageId,
                    workflowId: target.workflowId,
                    instanceKey: target.instanceKey,
                });
            }
            if (pin.phase === 'ADMITTED') {
                return { mode: 'admitted', target, messageId, intentType, intentBound: false, inputDigest, attemptId, revision: doc.revision, registered: false };
            }
            const reservation = pin.reservation;
            if (reservation.messageId !== messageId || reservation.inputDigest !== inputDigest
                || (reservation.intentType !== undefined && reservation.intentType !== intentType)) {
                refuse('OCCURRENCE_RESERVATION_PENDING', 'this occurrence has an unresolved RESERVED pin for a different message; only its exact (messageId, intent, input) owner may continue it', {
                    // A different message waits its turn; the SAME messageId with a
                    // different input/intent is a conflict that no retry resolves.
                    retryable: reservation.messageId !== messageId,
                    reservedMessageId: reservation.messageId,
                    requestedMessageId: messageId,
                    businessPackageId: target.businessPackageId,
                    workflowId: target.workflowId,
                    instanceKey: target.instanceKey,
                });
            }
            const intentBound = reservation.intentType === intentType;
            // Tracked (v3) pins register EVERY submit before it reaches the Kernel;
            // a pre-v3 pin stays untracked (an unregistered submit may be live).
            const tracked = pin.inFlight !== undefined;
            if (tracked && pin.inFlight.length >= MAX_IN_FLIGHT) {
                refuse('OCCURRENCE_RESERVATION_PENDING', 'too many concurrent submits of this reserved message are in flight', {
                    retryable: true,
                    businessPackageId: target.businessPackageId,
                    workflowId: target.workflowId,
                    instanceKey: target.instanceKey,
                });
            }
            const inFlight = tracked ? { inFlight: Object.freeze([...pin.inFlight, attemptId]) } : {};
            const slotFree = pin.activeAttempt === null || pin.activeAttempt === undefined;
            // A held slot (a live concurrent submit or a crashed one —
            // indistinguishable durably): K02's durable (target, messageId) dedup
            // prevents duplicate committed turns, so a retry proceeds as ADOPTER
            // without the slot. Adopters on an untracked pin cannot be counted and
            // so never reclaim; on a tracked pin they are registered like owners.
            if (!slotFree && !tracked) {
                return { mode: 'adopt', target, messageId, intentType, intentBound, inputDigest, attemptId, revision: doc.revision, registered: false };
            }
            try {
                const joined = await this.#store.put(v10OccurrenceBuildPinKey(this.#deployment, target), pinStoreValue({ ...pin, ...inFlight, ...(slotFree ? { activeAttempt: Object.freeze({ attemptId, holder: 'writer' }) } : {}) }), { kind: 'cas', revision: doc.revision });
                return { mode: slotFree ? 'owner' : 'adopt', target, messageId, intentType, intentBound, inputDigest, attemptId, revision: joined.revision, registered: tracked };
            }
            catch (error) {
                if (!isCasConflict(error))
                    throw error;
                continue;
            }
        }
        refuse('OCCURRENCE_RESERVATION_INDETERMINATE', 'the occurrence reservation kept changing under concurrent writers; nothing was deleted (fail-closed)');
    }
    /** Settle one concluded submit against its reservation. */
    async #settleOccurrenceAttempt(attempt, receipt) {
        const status = typeof receipt.status === 'string' ? receipt.status : 'unreadable';
        if (status === 'admitted') {
            if (attempt.mode !== 'admitted')
                await this.#commitAdmitted(attempt.target);
            return receipt;
        }
        if (status === 'UNKNOWN') {
            // The Kernel's own honest UNKNOWN: never a delete, never a retry.
            await this.#concludeAmbiguousAttempt(attempt);
            return receipt;
        }
        // A concluded non-admitted receipt (deny / terminated): the Kernel's
        // durable admission evidence decides — the receipt alone never settles.
        if (await this.#witnessMatches(attempt)) {
            if (attempt.mode !== 'admitted')
                await this.#commitAdmitted(attempt.target);
            refuse('OCCURRENCE_RESERVATION_INDETERMINATE', 'the Kernel durably admitted this reservation while returning a non-admitted receipt; the pin is settled ADMITTED and the caller reconciles through the original messageId', { receiptStatus: status });
        }
        const denial = isPlainRecord(receipt.denial) ? receipt.denial : null;
        // This selected Kernel gate depends only on the sealed intent's roles
        // and the facade's fixed caller role, BEFORE interpretation/admission:
        // every submit of the bound intent fails it, including live adopters.
        // Legacy pins lack intent binding and cannot establish this proof.
        const callerRoleDenial = attempt.mode === 'owner' && attempt.intentBound && status === 'denied'
            && denial?.reason === 'business-caller-role'
            && denial.deniedBy === attempt.target.businessPackageId
            && denial.intentType === attempt.intentType && denial.callerRole === V10_KERNEL_CALLER_ROLE;
        // A dynamic deny or `terminated` result proves only that THIS evaluation
        // did not admit; another registered submit may still admit. So it
        // compensates only as the last registered in-flight submit (#concludeAttempt).
        const concluded = status === 'denied' || status === 'terminated';
        await this.#concludeAttempt(attempt, concluded ? { despiteOthers: callerRoleDenial } : null, status);
        return receipt;
    }
    /** True iff the Kernel's durable original receipt admitted this exact reservation. */
    async #witnessMatches(attempt) {
        const witness = await this.#readAdmissionWitness(attempt.target, attempt.messageId);
        return witness !== null && witness.messageId === attempt.messageId && witness.inputDigest === attempt.inputDigest
            && (!attempt.intentBound || witness.intentType === attempt.intentType);
    }
    /**
     * Conclude a submit whose outcome is ambiguous (thrown, or Kernel UNKNOWN):
     * its admission may already be durable, or — for a store that rejects
     * before a write lands — may still become durable. A matching witness
     * settles the pin ADMITTED; otherwise the attempt releases only its writer
     * slot and KEEPS its in-flight entry, so no competing non-admission can
     * become the "last" submit and delete the pin under it. The entry is
     * resolved by a same-message resend that admits, a witness heal in
     * recoverReservation, or the Host's allAttemptsTerminated assertion.
     */
    async #concludeAmbiguousAttempt(attempt) {
        if (attempt.mode === 'admitted')
            return;
        if (await this.#witnessMatches(attempt)) {
            await this.#commitAdmitted(attempt.target);
            return;
        }
        await this.#concludeAttempt(attempt, null, 'ambiguous', { keepInFlight: true });
    }
    /** CAS the pin from RESERVED to ADMITTED (idempotent; witness-backed). */
    async #commitAdmitted(target) {
        for (let round = 0; round < 5; round += 1) {
            const doc = await this.#readPinDoc(target);
            if (doc === null) {
                refuse('OCCURRENCE_RESERVATION_INDETERMINATE', 'the RESERVED pin vanished before its ADMITTED settlement could commit; nothing further is deleted (fail-closed)');
            }
            if (!pinMatches(doc.value, this.#build)) {
                refuse('OCCURRENCE_REDIRECTED_TO_NEW_BUILD', 'the occurrence pin moved to another BUILD while its admission was being settled');
            }
            if (doc.value.phase === 'ADMITTED')
                return;
            try {
                const admitted = {
                    ...doc.value,
                    phase: 'ADMITTED',
                    reservation: undefined,
                    activeAttempt: undefined,
                    inFlight: undefined,
                    admittedAt: new Date(this.#now()).toISOString(),
                };
                await this.#store.put(v10OccurrenceBuildPinKey(this.#deployment, target), pinStoreValue(admitted), { kind: 'cas', revision: doc.revision });
                return;
            }
            catch (error) {
                if (!isCasConflict(error))
                    throw error;
                continue;
            }
        }
        refuse('OCCURRENCE_RESERVATION_INDETERMINATE', 'the RESERVED pin kept changing while its ADMITTED settlement was committing (fail-closed)');
    }
    /**
     * Conclude one submit against its RESERVED pin in ONE exact-revision write:
     * deregister this attempt (in-flight entry + its own writer slot) and —
     * when `compensate` is given — delete the pin instead if no admission can
     * follow. Deletion is legal only (a) for the fixed caller-role denial
     * (`despiteOthers`), or (b) when this registered attempt is the LAST
     * in-flight submit of a tracked pin with no foreign slot holder: every
     * other submit already concluded unambiguously (ambiguous ones stay
     * registered) or was declared terminated by the Host, so no evaluation can
     * still admit. That proves nothing about an admission ALREADY committed by
     * a submit that has since deregistered, so the witness is re-read AFTER the
     * pin revision the removal is conditioned on: every deregistration happens
     * after its own Kernel writes, hence before that revision. The exact
     * revision fences a concurrent registration. Any doubt keeps the pin; a
     * lost compensation race refuses typed INDETERMINATE — never a silent
     * delete or fake success. `keepInFlight` deregisters the slot only.
     */
    async #concludeAttempt(attempt, compensate, receiptStatus, options = {}) {
        if (attempt.mode === 'admitted')
            return;
        const key = v10OccurrenceBuildPinKey(this.#deployment, attempt.target);
        for (let round = 0; round < 5; round += 1) {
            const doc = await this.#readPinDoc(attempt.target);
            if (doc === null || doc.value.phase !== 'RESERVED' || !pinMatches(doc.value, this.#build))
                return;
            const pin = doc.value;
            const others = pin.inFlight === undefined || options.keepInFlight === true
                ? pin.inFlight
                : pin.inFlight.filter((id) => id !== attempt.attemptId);
            const ownSlot = pin.activeAttempt?.attemptId === attempt.attemptId;
            const foreignSlot = !ownSlot && pin.activeAttempt !== null && pin.activeAttempt !== undefined;
            // Current membership, not the historical `registered` flag: an entry
            // cleared by a Host reset no longer vouches for this attempt.
            const member = pin.inFlight !== undefined && pin.inFlight.includes(attempt.attemptId);
            const lastInFlight = attempt.registered && member && others !== undefined && others.length === 0 && !foreignSlot;
            if (compensate !== null && (compensate.despiteOthers || lastInFlight)) {
                // Fresh negative witness tied to THIS pin revision (see above).
                if (await this.#witnessMatches(attempt)) {
                    await this.#commitAdmitted(attempt.target);
                    refuse('OCCURRENCE_RESERVATION_INDETERMINATE', 'the Kernel durably admitted this reservation while this submit returned a non-admitted receipt; the pin is settled ADMITTED and the caller reconciles through the original messageId', { receiptStatus });
                }
                if (this.#store.remove === undefined) {
                    // Best-effort deregistration; a lost race only leaves a stale
                    // entry (fail-closed). The typed refusal below is the outcome.
                    await this.#writeDeregistered(key, pin, doc.revision, others, ownSlot).catch(() => { });
                    refuse('OCCURRENCE_RESERVATION_INDETERMINATE', 'the physical store exposes no conditional remove seam; the RESERVED pin is retained fail-closed and the non-admitted receipt must be reconciled through the same messageId', { receiptStatus });
                }
                try {
                    await this.#store.remove(key, { kind: 'cas', revision: doc.revision });
                    return;
                }
                catch (error) {
                    if (!isCasConflict(error))
                        throw error;
                    continue;
                }
            }
            if (!ownSlot && (others === undefined || others.length === pin.inFlight?.length))
                return;
            try {
                await this.#writeDeregistered(key, pin, doc.revision, others, ownSlot);
                return;
            }
            catch (error) {
                if (!isCasConflict(error))
                    throw error;
                continue;
            }
        }
        if (compensate !== null) {
            const doc = await this.#readPinDoc(attempt.target);
            if (doc !== null && pinMatches(doc.value, this.#build) && doc.value.phase === 'ADMITTED')
                return;
            refuse('OCCURRENCE_RESERVATION_INDETERMINATE', 'the guarded reservation compensation kept losing its exact-revision race; the pin is retained fail-closed (never a silent delete)', { receiptStatus });
        }
        // Deregistration only: a stale entry merely blocks later compensation
        // (fail-closed); the Host's allAttemptsTerminated assertion clears it.
    }
    async #writeDeregistered(key, pin, revision, others, ownSlot) {
        await this.#store.put(key, pinStoreValue({
            ...pin,
            ...(others === undefined ? {} : { inFlight: Object.freeze([...others]) }),
            ...(ownSlot ? { activeAttempt: null } : {}),
        }), { kind: 'cas', revision });
    }
    /**
     * The trusted durable Kernel admission witness (#1219 F1): the SAME-CAS
     * original receipt of the exact turn — `turn:<workflowId>:<instanceKey>:
     * message:<messageId>` — read back from the Kernel's own instance doc
     * (`durableOriginalReceipts` ring) or its per-turn receipt-archive doc.
     * Instance-snapshot existence is deliberately NOT consulted: a Genesis
     * openInstance survives crashes that never admitted anything.
     */
    async #readAdmissionWitness(target, messageId) {
        // The selected kernel derives the durable turn id itself; the witness
        // never re-implements its component encoding.
        const identity = v10SelectedKernelIdentity(this.#activation.facade);
        const turnId = identity.messageTurnId(target, messageId);
        const prefix = v10DeploymentDocsPrefix(this.#deployment) + identity.k02ScopePrefix({
            deployedAppId: this.#deployment.deployedAppId,
            tenantId: this.#deployment.tenantId,
            appId: this.#deployment.appId,
            businessPackageId: target.businessPackageId,
        });
        const envelopeWitness = (raw) => {
            if (!isPlainRecord(raw))
                return null;
            const receipt = isPlainRecord(raw.receipt) ? raw.receipt : null;
            if (receipt === null || receipt.status !== 'admitted')
                return null;
            const occurrence = isPlainRecord(receipt.occurrence) ? receipt.occurrence : null;
            // The Kernel persists its digest in `sha256:<hex>` wire form; normalize
            // to bare hex so it compares like-for-like with the reservation digest
            // (the same kernel canonical form, see v10SelectedKernelIdentity).
            const wireDigest = typeof receipt.inputDigest === 'string' ? receipt.inputDigest : '';
            const inputDigest = wireDigest.startsWith('sha256:') ? wireDigest.slice('sha256:'.length) : wireDigest;
            if (!HEX64.test(inputDigest) || occurrence === null || typeof occurrence.messageId !== 'string')
                return null;
            return { inputDigest, messageId: occurrence.messageId,
                ...(typeof receipt.intentType === 'string' ? { intentType: receipt.intentType } : {}),
            };
        };
        const kernelDocKeys = identity.docKeys();
        // The K protocol exposes the builder family as a record; a missing family
        // member is the same typed K-protocol refusal the identity access raises.
        const kernelDocKey = (name, ...args) => {
            const build = kernelDocKeys[name];
            if (typeof build !== 'function') {
                refuse('V10_EXPORT_CONTRACT_REFUSED', `the selected kernel-primary does not expose the '${name}' document key builder`);
            }
            return String(build(...args));
        };
        const ringDoc = await this.#store.get(`${prefix}${kernelDocKey('instance', target.workflowId, target.instanceKey)}`);
        if (ringDoc !== null && isPlainRecord(ringDoc.value)) {
            const ring = isPlainRecord(ringDoc.value.durableOriginalReceipts) ? ringDoc.value.durableOriginalReceipts : null;
            if (ring !== null) {
                const ringWitness = envelopeWitness(ring[turnId]);
                if (ringWitness !== null)
                    return ringWitness;
            }
        }
        const archiveDoc = await this.#store.get(`${prefix}${kernelDocKey('receiptArchive', turnId)}`);
        if (archiveDoc !== null) {
            const archiveWitness = envelopeWitness(archiveDoc.value);
            if (archiveWitness !== null)
                return archiveWitness;
        }
        return null;
    }
    async queryScopedSnapshot(selector) {
        this.#assertOpen();
        return await this.#activation.facade.queryScopedSnapshot(selector);
    }
    async queryManyScopedSnapshots(selectors) {
        this.#assertOpen();
        return await this.#activation.facade.queryManyScopedSnapshots(selectors);
    }
    async subscribe(selector, listener) {
        this.#assertOpen();
        // Delegation only, exactly like the governed queries: the facade owns
        // the preconditions, the multi-B target resolution/authorization and
        // the live registry/pump; no pin check exists on this read-only path.
        return await this.#activation.facade.subscribe(selector, listener);
    }
    kCounters(businessPackageId) {
        this.#assertOpen();
        return this.#activation.facade.kCounters(businessPackageId);
    }
    stop() {
        // The public name of close() (L2 §8 F04): one teardown path — the
        // facade clears every subscription/queue before the reverse disposal.
        this.close();
    }
    close() {
        if (this.#closed)
            return;
        this.#closed = true;
        this.#activation.dispose();
    }
    #targetFor(intent) {
        if (!isPlainRecord(intent)) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a governed send requires a plain intent record');
        }
        const intentType = intent.intentType;
        const instanceKey = intent.instanceKey;
        if (typeof intentType !== 'string' || intentType.length === 0) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', 'a governed send requires a non-empty sealed intentType');
        }
        if (typeof instanceKey !== 'string' || instanceKey.length === 0 || instanceKey.length > MAX_STRING) {
            refuse('OCCURRENCE_BUILD_PIN_INVALID', `a governed send requires a bounded non-empty instanceKey (max ${String(MAX_STRING)} characters)`);
        }
        const resolved = this.#activation.facade.resolveIntentTarget(intentType);
        return Object.freeze({
            businessPackageId: resolved.businessPackageId,
            workflowId: resolved.workflowId,
            instanceKey,
        });
    }
    #assertOpen() {
        if (this.#closed)
            refuse('FACADE_CLOSED', 'the governed BUILD activation is closed; no further occurrence activity can start');
    }
}
/**
 * Activate one exact, externally authorized new BUILD. Every denial happens
 * before any K or pin mutation; a granted decision is recorded durably and
 * only then does the ordinary trusted activation run.
 */
export async function activateGovernedV10Build(app, options) {
    if (!isPlainRecord(app)) {
        refuse('INVALID_BUILD_VERSION', 'a governed activation requires the plain-data BUILD output');
    }
    const deployment = snapshotDeployment(options.deployment);
    const now = options.now ?? Date.now;
    const selection = options.selection ?? 'CURRENT';
    if (selection !== 'CURRENT' && selection !== 'PINNED_ONLY') {
        refuse('INVALID_BUILD_VERSION', 'selection must be CURRENT or PINNED_ONLY');
    }
    const nowMs = now();
    const current = selection === 'CURRENT'
        ? await verifyCurrentDecision(app, deployment, options.decision, options.authorization, nowMs)
        : null;
    const verified = current !== null
        ? current
        : await verifyPinnedRestoration(app, deployment, options.decision, options.authorization, options.store, nowMs);
    const activation = await activateV10App(app, {
        store: options.store,
        tenantId: deployment.tenantId,
        now,
        ...(options.queryAuthority === undefined ? {} : { queryAuthority: options.queryAuthority }),
        ...(options.deploymentRoot === undefined ? {} : { deploymentRoot: options.deploymentRoot }),
        deploymentIdentity: deployment,
    });
    const build = Object.freeze({
        deployedAppId: deployment.deployedAppId,
        tenantId: deployment.tenantId,
        appId: deployment.appId,
        subjectDigest: app.subjectDigest,
        packageClosureDigest: verified.closureDigest,
        buildId: app.buildId,
        decisionId: verified.decision.decisionId,
        decisionDigest: verified.decisionDigest,
        approvalRef: verified.decision.approvalRef,
    });
    // Only a fresh CURRENT promotion writes the durable accepted decision.
    // PINNED_ONLY restores that record and may never mint a new acceptance.
    if (current !== null) {
        try {
            const record = Object.freeze({
                kind: RECORD_KIND,
                decisionId: verified.decision.decisionId,
                decisionDigest: verified.decisionDigest,
                deployedAppId: deployment.deployedAppId,
                tenantId: deployment.tenantId,
                appId: deployment.appId,
                subjectDigest: app.subjectDigest,
                packageClosureDigest: verified.closureDigest,
                buildId: app.buildId,
                approvalRef: verified.decision.approvalRef,
                authorizedAt: current.authorizedAt,
                expiresAt: current.expiresAt,
                activatedAt: new Date(now()).toISOString(),
            });
            // Re-check currentness after module evaluation; a decision that expired
            // while the App was being activated must not leave an accepted record.
            if (now() >= Date.parse(record.expiresAt) || now() >= Date.parse(verified.decision.validUntil)) {
                refuse('DEPLOYMENT_APPROVAL_STALE', 'the deployment approval expired during activation');
            }
            await ensureActivationRecord(options.store, record);
        }
        catch (error) {
            activation.dispose();
            throw error;
        }
    }
    return new GovernedBuildActivation({
        store: options.store,
        deployment,
        build,
        selection,
        activation,
        now,
    });
}
