/**
 * DomainHarness v0.11.0 T03 (#1577) — the one pinned KDP Primary entry
 * (L2 §6.2d, frozen named export `bootstrap`).
 *
 * KDP self-boots the Kernel Core + this Package System WITHOUT first
 * importing any SDK / Business / K Extension module, then:
 *   1. reads the exact Lock (re-verifying the closure digest it already
 *      passed at Boot — defense in depth for direct callers);
 *   2. verifies the Descriptor bytes against the Lock-pinned
 *      descriptorDigest and takes the selected read-only config (PRD A03);
 *   3. loads the selected packages in the Lock's `technicalInitOrder` and
 *      runs their technical init;
 *   4. seals the Hook bindings (imports providers, freezes the table — no
 *      invocation channel, no caller replacement);
 *   5. executes EXACTLY the locked `businessAppInit` — never a
 *      caller-supplied callback, never a Main Workflow, never a dynamic
 *      alternative, no retry/recovery/stop engine (PRD K04/K07, A01/A02).
 *
 * Physical load/init failure is an ordinary startup failure:
 * `KdpBootstrapResult.FAILED` with zero ingress and no App handle (PRD K07).
 */
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { NODE24_ESM_PROFILE, contentDigestOf, } from '@kaicreator/domain-harness-contracts/v011';
import { resolveInRoot } from './paths.js';
import { PackageSystem, KdpLoadError } from './package-system.js';
import { createDomainApp } from './domain-app.js';
function sha256HexOf(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
}
function failed(code, reason) {
    return { status: 'FAILED', code, reason };
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isJsonValue(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return true;
    if (typeof value === 'number')
        return Number.isFinite(value);
    if (Array.isArray(value))
        return value.every(isJsonValue);
    if (isRecord(value))
        return Object.values(value).every(isJsonValue);
    return false;
}
async function readVerifiedLock(context) {
    const lockPath = resolveInRoot(context.installRoot, context.lockPath);
    if (lockPath === null) {
        return failed('DH_BOOT_PIN_MISMATCH', `context.lockPath '${context.lockPath}' is not an in-root relative path`);
    }
    let bytes;
    try {
        bytes = await readFile(lockPath);
    }
    catch {
        return failed('DH_KDP_PACKAGE_LOAD_FAILED', `Lock file '${context.lockPath}' is not readable`);
    }
    let parsed;
    try {
        parsed = JSON.parse(bytes.toString('utf8'));
    }
    catch {
        return failed('DH_KDP_PACKAGE_LOAD_FAILED', `Lock file '${context.lockPath}' is not parseable JSON`);
    }
    if (!isRecord(parsed) || typeof parsed['closureDigest'] !== 'string') {
        return failed('DH_KDP_PACKAGE_LOAD_FAILED', 'Lock file has no closureDigest field');
    }
    const { closureDigest, ...preimage } = parsed;
    if (contentDigestOf(preimage) !== closureDigest) {
        return failed('DH_BOOT_PIN_MISMATCH', 'Lock closureDigest recomputation failed at KDP');
    }
    const lock = parsed;
    const profile = lock.target.profile;
    if (profile !== NODE24_ESM_PROFILE) {
        return failed('DH_KDP_PACKAGE_LOAD_FAILED', `Lock target profile '${profile}' is not the frozen '${NODE24_ESM_PROFILE}'`);
    }
    return lock;
}
async function readDescriptorConfig(context, lock) {
    const fail = (reason) => ({
        ok: false,
        result: failed('DH_KDP_PACKAGE_LOAD_FAILED', reason),
    });
    const descriptorPath = resolveInRoot(context.installRoot, context.descriptorPath);
    if (descriptorPath === null) {
        return {
            ok: false,
            result: failed('DH_BOOT_PIN_MISMATCH', `context.descriptorPath '${context.descriptorPath}' is not an in-root relative path`),
        };
    }
    let bytes;
    try {
        bytes = await readFile(descriptorPath);
    }
    catch {
        return fail(`Descriptor file '${context.descriptorPath}' is not readable`);
    }
    if (`sha256:${sha256HexOf(bytes)}` !== lock.appIdentity.descriptorDigest) {
        return fail('Descriptor bytes do not equal the Lock-pinned descriptorDigest');
    }
    let parsed;
    try {
        parsed = JSON.parse(bytes.toString('utf8'));
    }
    catch {
        return fail('Descriptor file is not parseable JSON');
    }
    if (!isRecord(parsed)) {
        return fail('Descriptor file is not a JSON object');
    }
    const descriptor = parsed;
    const config = descriptor.config ?? {};
    if (!isRecord(config) || !Object.values(config).every(isJsonValue)) {
        return fail('Descriptor config is not a JSON object');
    }
    return { ok: true, config };
}
const APP_STATUSES = ['READY', 'DEGRADED', 'BLOCKED', 'FAILED'];
function validateInitResult(result, ingress) {
    if (!isRecord(result) || typeof result['status'] !== 'string') {
        return 'businessAppInit must return an AppInitResult object with a status';
    }
    const status = result['status'];
    if (!APP_STATUSES.includes(status)) {
        return `businessAppInit returned unknown status '${status}'`;
    }
    const hasSuppressed = 'suppressedIngress' in result;
    const suppressedRaw = hasSuppressed ? result['suppressedIngress'] : undefined;
    const suppressed = suppressedRaw === undefined ? [] : suppressedRaw;
    if (!Array.isArray(suppressed) || !suppressed.every((id) => typeof id === 'string')) {
        return 'suppressedIngress must be an array of ingress id strings';
    }
    const ids = new Set(ingress.map((entry) => entry.id));
    const optionalIds = new Set(ingress.filter((entry) => entry.optional).map((entry) => entry.id));
    for (const id of suppressed) {
        if (!ids.has(id))
            return `suppressedIngress names unknown ingress '${id}'`;
        if (!optionalIds.has(id)) {
            return `suppressedIngress names required ingress '${id}'; DEGRADED may suppress only predeclared optional ingress`;
        }
    }
    if ('detail' in result && result['detail'] !== undefined && !isJsonValue(result['detail'])) {
        return 'detail must be a JSON value';
    }
    if (status === 'READY' && suppressed.length > 0) {
        return 'READY cannot carry suppressedIngress; a required service is missing (refuse to masquerade as READY, PRD A04)';
    }
    if (status === 'BLOCKED' && suppressed.length > 0) {
        return 'BLOCKED cannot carry suppressedIngress';
    }
    return { status: status, suppressed };
}
/** The one pinned KDP Primary entry (frozen named export `bootstrap`). */
export async function bootstrap(context) {
    const lock = await readVerifiedLock(context);
    if ('status' in lock)
        return lock;
    const configResult = await readDescriptorConfig(context, lock);
    if (!configResult.ok)
        return configResult.result;
    const config = configResult.config;
    const packages = new PackageSystem(context.installRoot, lock, context.hostPorts ?? []);
    // 3. Technical package load + init in the Lock's exact order.
    try {
        await packages.runTechnicalInit();
    }
    catch (error) {
        return failed(error.code ?? 'DH_KDP_PACKAGE_LOAD_FAILED', error.message);
    }
    // 4. Seal Hook bindings (import providers, freeze; no invocation channel).
    try {
        await packages.sealHooks();
    }
    catch (error) {
        return failed(error.code ?? 'DH_KDP_PACKAGE_LOAD_FAILED', error.message);
    }
    // 5a. Resolve the locked ingress implementations and the one businessAppInit.
    const ingressImpls = new Map();
    try {
        for (const entry of lock.ingress) {
            const selected = packages.functionByRef(entry.function);
            if (selected === undefined) {
                throw new KdpLoadError(`ingress '${entry.id}' has no selected function in the Lock`);
            }
            const impl = await packages.loadEntry(selected.implementation, `ingress '${entry.id}' implementation`);
            if (typeof impl !== 'function') {
                throw new KdpLoadError(`ingress '${entry.id}' implementation export '${selected.implementation.exportName}' is not a function`);
            }
            ingressImpls.set(entry.id, { fn: selected, impl: impl });
        }
        const initSelected = packages.functionByRef(lock.businessAppInit);
        if (initSelected === undefined) {
            throw new KdpLoadError('businessAppInit has no selected function in the Lock');
        }
        const initExport = await packages.loadEntry(initSelected.implementation, 'businessAppInit implementation');
        if (typeof initExport !== 'function') {
            throw new KdpLoadError(`businessAppInit export '${initSelected.implementation.exportName}' is not a function`);
        }
        const initFn = initExport;
        // 5b. Execute exactly the locked businessAppInit. Function handles are
        // live BEFORE init runs (PRD A03): they close over a deferred app
        // reference that exists only after a validated BOOTED result.
        const resources = new Map(Object.keys(lock.resourceDigests).map((key) => [key, packages.resourceHandle(key)]));
        let appRef = null;
        const functionHandles = new Map();
        for (const entry of lock.ingress) {
            functionHandles.set(entry.id, {
                invoke: (input) => {
                    if (appRef === null) {
                        return Promise.resolve({
                            kind: 'FAILED',
                            failure: { code: 'DH_RUNTIME_NOT_READY', message: 'app is not booted yet' },
                        });
                    }
                    return appRef.invoke(entry.id, input);
                },
            });
        }
        const initContext = {
            appId: lock.appIdentity.id,
            activationId: randomUUID(),
            lockDigest: lock.closureDigest,
            config,
            functions: functionHandles,
            resources,
        };
        let rawInitResult;
        try {
            rawInitResult = await initFn(initContext);
        }
        catch (error) {
            return failed('DH_RUNTIME_NOT_READY', `businessAppInit threw: ${error.message}; ordinary startup failure, no retry (PRD K07)`);
        }
        const validated = validateInitResult(rawInitResult, lock.ingress);
        if (typeof validated === 'string') {
            return failed('DH_RUNTIME_NOT_READY', `businessAppInit result refused: ${validated}`);
        }
        if (validated.status === 'FAILED') {
            return failed('DH_RUNTIME_NOT_READY', 'businessAppInit reported status FAILED; ordinary startup failure, no ingress, no retry (PRD K07)');
        }
        const app = createDomainApp({
            lock,
            packages,
            ingressImpls: new Map([...ingressImpls].map(([id, value]) => [
                id,
                { ...value.fn, impl: value.impl },
            ])),
            suppressedIngress: validated.suppressed,
            initialStatus: validated.status,
        });
        appRef = app;
        return { status: 'BOOTED', app };
    }
    catch (error) {
        const loadError = error;
        return failed(loadError.code ?? 'DH_KDP_PACKAGE_LOAD_FAILED', error.message);
    }
}
