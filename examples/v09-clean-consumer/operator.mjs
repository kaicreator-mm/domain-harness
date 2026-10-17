/**
 * #1119 — the deployment operator of the v0.9 clean-consumer example.
 *
 * Imports ONLY the published deployment bootstrap entry
 * `@kaicreator/domain-harness/v9/deployment` (plus Node builtins, the
 * consumer module and the sealed module bytes this deployment received from
 * its build pipeline). It owns the physical store, the trusted issuer secret
 * and the Host caller authenticator, installs the sealed closure, composes
 * the trusted bridge per presentation, and runs every consumer request
 * handler inside `bridge.runWithinTrustedContext`.
 *
 * CLI: node operator.mjs [payloadDir]
 *   Runs the full external two-B load/send/query/subscribe/stop journey and
 *   prints one final `JOURNEY_RESULT <json>` line. Exit 0 only if every step
 *   passed. Used as-is by the repository test from a freshly npm-installed
 *   packed tarball in an isolated directory.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import {
  V09_HOST_ABI,
  V09_IMPORT_POLICY_REVISION,
  V09_RUNTIME_ABI,
  V09_SEALED_ROOT_FORMAT,
  V09HostStoreError,
  computeV09SealedRootSubjectDigest,
  createProtectedHostV09,
  createV09DomainHarnessBridge,
  issueV09ApprovalProof,
} from '@kaicreator/domain-harness/v9/deployment';
import {
  assertConsumerSurface,
  loadRequest,
  loadRequestWithSmuggledAuthority,
  queryRequest,
  sendRequest,
  stopRequest,
  subscribeRequest,
  unsubscribeRequest,
} from './consumer.mjs';

const ISSUER = 'issuer:v09-clean-consumer-example';
const SECRET = 'v09-clean-consumer-example-local-issuer-proof-only';
const AUDIENCE = 'aud:v09-clean-consumer';
const BASE_MS = Date.UTC(2026, 9, 18, 10, 0, 0);
/** The #1124 principal authority caps token lifetime at 300s; stay inside it. */
const TOKEN_TTL_MS = 120_000;
const sha256Hex = (value) => createHash('sha256').update(value, 'utf8').digest('hex');

class DeploymentMemoryStore {
  #docs = new Map();
  async get(key) {
    const doc = this.#docs.get(key);
    return doc === undefined ? null : { value: structuredClone(doc.value), revision: doc.revision };
  }
  async put(key, value, condition) {
    const existing = this.#docs.get(key);
    if (condition.kind === 'create') {
      if (existing !== undefined) throw new V09HostStoreError('V09_STORE_CONFLICT', `${key} already exists`);
      this.#docs.set(key, { value: structuredClone(value), revision: 0 });
      return { revision: 0 };
    }
    if (existing === undefined || existing.revision !== condition.revision) {
      throw new V09HostStoreError('V09_STORE_CONFLICT', `${key} revision moved`);
    }
    this.#docs.set(key, { value: structuredClone(value), revision: condition.revision + 1 });
    return { revision: condition.revision + 1 };
  }
  async close() { /* the deployment store outlives governance host wrappers */ }
}

async function readPayloads(payloadDir) {
  const read = (name) => readFile(new URL(`./${name}`, payloadDir), 'utf8');
  const [kernel, sdk, router, approval, engineering, capability] = await Promise.all([
    read('kernel-mechanism-v1.mjs'), read('standard-sdk-v1.mjs'), read('workflow-router.mjs'),
    read('business-approval.mjs'), read('business-engineering.mjs'), read('capability-quote-tools.mjs'),
  ]);
  return { kernel, sdk, router, approval, engineering, capability };
}

/** BUILD-style zero-import vendored Standard bundle (D01 discipline). */
function standardBundleSource(sdk, router) {
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
const __dhv9RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv9RouterBundle.routeWorkflowIntent;
`;
}

const KERNEL_ID = 'v08-kernel-mechanism@1.0.0';
const STANDARD_ID = 'standard-sdk@v08.1.0.0';
const APPROVAL_ID = 'business-order-approval@v08.1.0.0';
const ENGINEERING_ID = 'business-engineering@v08.1.0.0';
const CAPABILITY_ID = 'capability-quote-tools@v08.1.0.0';
const APPROVAL_INTENTS = ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic'];
const ENGINEERING_INTENTS = ['reviewChange', 'recordValidation', 'qualifyRelease'];

/**
 * The two-B closure: one Kernel, one Standard SDK, TWO Business packages
 * (order-approval + engineering) and the shared quote-tools capability, with
 * one sealed route per business intent:
 *   approval    submitQuoteDecisionDynamic → ledger.reserve
 *   engineering reviewChange              → ledger.preview
 */
function makeTwoBusinessRoot(payloads, appId) {
  return makeRoot(payloads, appId, { twoBusiness: true });
}

function makeRoot(payloads, appId, { twoBusiness = false, runtimeAbiOverride = undefined } = {}) {
  const standard = standardBundleSource(payloads.sdk, payloads.router);
  const packages = [
    { packageId: KERNEL_ID, kind: 'kernel', abiVersion: 'v08-kernel-abi/1', moduleSource: payloads.kernel },
    { packageId: STANDARD_ID, kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', moduleSource: standard },
    { packageId: APPROVAL_ID, kind: 'business', abiVersion: 'v08-business-abi/1', moduleSource: payloads.approval },
    ...(twoBusiness ? [{ packageId: ENGINEERING_ID, kind: 'business', abiVersion: 'v08-business-abi/1', moduleSource: payloads.engineering }] : []),
    { packageId: CAPABILITY_ID, kind: 'capability', abiVersion: 'v08-capability-abi/1', moduleSource: payloads.capability },
  ].map((pkg) => ({ ...pkg, moduleSha256: sha256Hex(pkg.moduleSource), imports: [] }));
  const bindings = [
    { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: STANDARD_ID, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: APPROVAL_ID, endpointId: 'business-policy' },
    ...(twoBusiness ? [{ role: 'business', packageId: ENGINEERING_ID, endpointId: 'business-policy' }] : []),
    ...APPROVAL_INTENTS.map((intentType) => ({ role: 'intent', intentType, packageId: APPROVAL_ID, endpointId: 'business-policy' })),
    ...(twoBusiness ? ENGINEERING_INTENTS.map((intentType) => ({ role: 'intent', intentType, packageId: ENGINEERING_ID, endpointId: 'business-policy' })) : []),
    {
      role: 'capability', capabilityId: 'ledger', packageId: CAPABILITY_ID, endpointId: 'capability-endpoint',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
    { role: 'route', intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
    ...(twoBusiness ? [{ role: 'route', intentId: 'reviewChange', operationId: 'preview', capabilityId: 'ledger', handlerId: 'previewTotal' }] : []),
  ];
  const runtimeAbi = runtimeAbiOverride ?? V09_RUNTIME_ABI;
  const subjectDigest = computeV09SealedRootSubjectDigest({
    rootPackageId: appId,
    buildId: `build:${appId}`,
    bundlerRevision: 'vendored-esbuild/0',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  });
  return {
    formatVersion: V09_SEALED_ROOT_FORMAT,
    subjectDigest,
    rootPackageId: appId,
    buildId: `build:${appId}`,
    bundlerRevision: 'vendored-esbuild/0',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  };
}

/** The full grant set a presentation needs for the whole public lifecycle. */
const FULL_GRANTS = [
  'send:submitQuoteDecisionDynamic', 'send:reviewChange',
  'query:instance', 'effect:reserve', 'effect:preview',
  'subscribe:lifecycle', 'delivery:lifecycle', 'stop:lifecycle', 'effect:delivery',
];
/** A principal whose grants omit the engineering send and every lifecycle purpose. */
const LIMITED_GRANTS = ['query:instance', 'effect:reserve'];

export async function runExternalConsumerJourney(payloadDirUrl) {
  const events = [];
  const step = async (name, fn) => {
    try {
      const detail = await fn();
      events.push({ name, ok: true, detail: detail ?? null });
    } catch (error) {
      events.push({ name, ok: false, error: String(error?.stack ?? error).slice(0, 1600) });
      throw error;
    }
  };

  const payloads = await readPayloads(payloadDirUrl);
  const clock = { now: BASE_MS };
  const store = new DeploymentMemoryStore();
  const trustedIssuers = new Map([[ISSUER, SECRET]]);
  const digests = {};
  const refs = {};

  await step('install.twoBusinessClosure', async () => {
    const govHost = await createProtectedHostV09({ store, trustedIssuers, audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
    const root = makeTwoBusinessRoot(payloads, 'app:clean:two-b');
    const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest, issuerId: ISSUER, issuerSecret: SECRET, issuedAt: new Date(BASE_MS).toISOString() });
    const installed = await govHost.install(root, approval, AUDIENCE);
    refs['app:clean:two-b'] = installed.installedRef;
    digests['app:clean:two-b'] = root.subjectDigest;
    await govHost.close();
    return { installedRef: `${installed.installedRef.slice(0, 18)}…`, businessPackages: 2 };
  });

  // A wrong-runtime-ABI root is installable as data (install does not bind
  // the ABI), but the public load path must refuse it typed on the frozen
  // UNSUPPORTED_RUNTIME_ABI family at activation — the wrong-API-version
  // negative of the #1119 acceptance.
  await step('negative.wrongRuntimeAbiLoadRefused', async () => {
    const govHost = await createProtectedHostV09({ store, trustedIssuers, audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
    const bad = makeRoot(payloads, 'app:clean:wrongabi', { twoBusiness: true, runtimeAbiOverride: 'v09.runtime/bogus' });
    const approval = issueV09ApprovalProof({ subjectDigest: bad.subjectDigest, issuerId: ISSUER, issuerSecret: SECRET, issuedAt: new Date(BASE_MS).toISOString() });
    const installed = await govHost.install(bad, approval, AUDIENCE);
    await govHost.close();
    const primaryBridge = bridgeFor('app:clean:wrongabi', 'tenant:clean', ['send:submitQuoteDecisionDynamic']);
    const result = await primaryBridge.runWithinTrustedContext(() => loadRequest(installed.installedRef));
    assert.deepEqual(result, { ok: false, code: 'UNSUPPORTED_RUNTIME_ABI' });
    return result;
  });

  function bridgeFor(appId, tenantId, grants) {
    const presentation = { kind: 'v09-clean-consumer-presentation', appId, tenantId, principalId: `principal:${appId}:${tenantId}` };
    let frozen;
    const authenticator = {
      async authenticate(offered) {
        assert.equal(offered?.appId, appId, 'the deployment authenticator answers only its own composition presentation');
        if (frozen === undefined) {
          frozen = {
            principalId: presentation.principalId,
            hostAudience: AUDIENCE,
            appId,
            tenantId,
            selectedClosureDigest: digests[appId],
            issuerAuthEpoch: 1,
            expiresAtMs: clock.now + TOKEN_TTL_MS,
            grants,
          };
        }
        return { ...frozen };
      },
    };
    return createV09DomainHarnessBridge({
      store, trustedIssuers, audience: AUDIENCE,
      runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI,
      authenticator, presentation,
      nowMs: () => clock.now,
    });
  }

  const primary = bridgeFor('app:clean:two-b', 'tenant:clean', FULL_GRANTS);
  const limited = bridgeFor('app:clean:two-b', 'tenant:limited', LIMITED_GRANTS);

  await step('install.foreignSingleBusinessApp', async () => {
    const govHost = await createProtectedHostV09({ store, trustedIssuers, audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
    const root = makeRoot(payloads, 'app:clean:foreign');
    const approval = issueV09ApprovalProof({ subjectDigest: root.subjectDigest, issuerId: ISSUER, issuerSecret: SECRET, issuedAt: new Date(BASE_MS).toISOString() });
    const installed = await govHost.install(root, approval, AUDIENCE);
    refs['app:clean:foreign'] = installed.installedRef;
    digests['app:clean:foreign'] = root.subjectDigest;
    await govHost.close();
    return { appId: 'app:clean:foreign' };
  });
  const foreign = bridgeFor('app:clean:foreign', 'tenant:other', ['send:submitQuoteDecisionDynamic', 'query:instance', 'effect:reserve']);

  await step('consumer.surface', assertConsumerSurface);

  await step('negative.loadRefusesWithoutDeploymentScope', async () => {
    const result = await loadRequest(refs['app:clean:two-b']);
    assert.deepEqual(result, { ok: false, code: 'PACKAGE_NOT_AUTHORIZED' });
    return result;
  });

  await step('negative.rawAndObjectReferenceRefused', async () => {
    // A raw sealed-root JSON string is not an installed reference...
    const rawRootJson = JSON.stringify(makeTwoBusinessRoot(payloads, 'app:clean:two-b'));
    const raw = await loadRequest(rawRootJson);
    assert.deepEqual(raw, { ok: false, code: 'PACKAGE_NOT_AUTHORIZED' });
    // ...and neither is a non-string object: the public load's own type
    // check refuses before any registry access, whatever the shape.
    const object = await primary.runWithinTrustedContext(() => loadRequest({ installedRef: refs['app:clean:two-b'], root: makeTwoBusinessRoot(payloads, 'app:clean:two-b') }));
    assert.deepEqual(object, { ok: false, code: 'PACKAGE_NOT_AUTHORIZED' });
    return { raw, object };
  });

  await step('negative.smuggledAuthorityRefused', async () => {
    const result = await loadRequestWithSmuggledAuthority(refs['app:clean:two-b']);
    assert.deepEqual(result, { ok: false, code: 'PACKAGE_NOT_AUTHORIZED' });
    return result;
  });

  let facade;
  await step('positive.loadTwoBusinessFacade', async () => {
    const result = await primary.runWithinTrustedContext(() => loadRequest(refs['app:clean:two-b']));
    assert.equal(result.ok, true);
    facade = result.value;
    assert.equal(facade.package.rootPackageId, 'app:clean:two-b');
    const packageIds = facade.package.packages.map((pkg) => pkg.packageId);
    assert.ok(packageIds.includes(APPROVAL_ID) && packageIds.includes(ENGINEERING_ID), 'the closure carries both Business packages');
    return { rootPackageId: facade.package.rootPackageId, packages: facade.package.packages.length };
  });

  await step('negative.foreignScopeCannotBorrowReference', async () => {
    const result = await foreign.runWithinTrustedContext(() => loadRequest(refs['app:clean:two-b']));
    assert.deepEqual(result, { ok: false, code: 'CALLER_SCOPE_DENIED' });
    return result;
  });

  let received;
  let subscription;
  await step('positive.subscribeReceiptObserver', async () => {
    const result = await primary.runWithinTrustedContext(() => subscribeRequest(facade));
    assert.equal(result.ok, true, `subscribe must be authorized with the full lifecycle grant set, got ${JSON.stringify(result)}`);
    ({ received, subscription } = result);
    return { attached: true };
  });

  const approvalIntent = (instanceKey, messageId) => ({
    intentType: 'submitQuoteDecisionDynamic', instanceKey, messageId,
    input: { amount: 30, requestId: 'R1' },
  });

  await step('positive.approvalSendCommitsRealEffect', async () => {
    const result = await primary.runWithinTrustedContext(() => sendRequest(facade, approvalIntent('instance:clean-approval', 'msg:clean-approval')));
    assert.equal(result.ok, true);
    assert.notEqual(result.value, undefined, 'a committed occurrence returns a real Kernel receipt');
    return { receiptKind: String(result.value?.kind ?? typeof result.value) };
  });

  await step('positive.receiptDeliveredToObserver', async () => {
    assert.ok(received.length >= 1, 'the committed occurrence delivered a real Kernel receipt to the subscribed observer');
    // The public observer sees ONLY the selected Kernel's redacted receipt —
    // never the trusted delivery envelope (no permitDigest/subjectDigest/
    // tenantId metadata crosses to consumer code).
    const delivered = received[0];
    assert.equal(typeof delivered, 'object');
    for (const envelopeField of ['permitDigest', 'subjectDigest', 'appId', 'tenantId']) {
      assert.equal(envelopeField in (delivered ?? {}), false, `the ${envelopeField} envelope field must not leak to the public observer`);
    }
    return { delivered: received.length, receiptKeys: Object.keys(delivered ?? {}).slice(0, 6) };
  });

  await step('positive.approvalInstanceSnapshot', async () => {
    const result = await primary.runWithinTrustedContext(() => queryRequest(facade, 'instance:clean-approval'));
    assert.equal(result.ok, true);
    assert.notEqual(result.value, null);
    return { snapshotPresent: true };
  });

  await step('positive.engineeringIntentRealDispatchTruthfulBusinessDenial', async () => {
    // reviewChange is really routed (Router → Kernel admission → engineering
    // policy); the engineering rule set reserves it for the 'reviewer' role,
    // so the public 'requester' caller receives the Kernel's truthful denial
    // receipt — a real second-Business execution, not a shortcut.
    const result = await primary.runWithinTrustedContext(() => sendRequest(facade, {
      intentType: 'reviewChange', instanceKey: 'instance:clean-engineering', messageId: 'msg:clean-engineering',
      input: { changeId: 'CH-1' },
    }));
    assert.equal(result.ok, true);
    assert.equal(result.value?.status, 'denied');
    return { status: result.value?.status, reason: result.value?.denial?.reason };
  });

  await step('positive.unsubscribeInsideSameScope', async () => {
    const result = await primary.runWithinTrustedContext(() => unsubscribeRequest(subscription));
    assert.deepEqual(result, { ok: true, value: undefined });
    return { detached: true };
  });

  await step('positive.noDeliveryAfterUnsubscribe', async () => {
    const before = received.length;
    const result = await primary.runWithinTrustedContext(() => sendRequest(facade, approvalIntent('instance:clean-approval-2', 'msg:clean-approval-2')));
    assert.equal(result.ok, true);
    assert.equal(received.length, before, 'a detached observer receives nothing after unsubscribe');
    return { deliveriesAfterUnsubscribe: received.length - before };
  });

  await step('negative.unapprovedToolCallRefused', async () => {
    // The limited principal holds no engineering send grant and no lifecycle
    // purposes: both must refuse on the public CALLER_SCOPE_DENIED family.
    const send = await limited.runWithinTrustedContext(() => loadRequest(refs['app:clean:two-b']).then((loaded) => loaded.ok
      ? sendRequest(loaded.value, { intentType: 'reviewChange', instanceKey: 'instance:x', messageId: 'msg:x', input: { changeId: 'CH-9' } })
      : loaded));
    assert.deepEqual(send, { ok: false, code: 'CALLER_SCOPE_DENIED' });
    // A missing LIFECYCLE-purpose grant refuses on the public lifecycle
    // family (the scoped lifecycle's own typed refusal), not the caller
    // family — both are frozen D04 outcomes with no effect or delivery.
    const subscribe = await limited.runWithinTrustedContext(() => loadRequest(refs['app:clean:two-b']).then((loaded) => loaded.ok
      ? subscribeRequest(loaded.value)
      : loaded));
    assert.deepEqual(subscribe, { ok: false, code: 'LIFECYCLE_FAILED' });
    return { send, subscribe };
  });

  await step('positive.stopIsIdempotentAndFailsClosed', async () => {
    // #1120 semantics: an authenticated stop tears exactly this facade down
    // once and is IDEMPOTENT (a second stop is the same single-flight
    // outcome); every further verb on the stopped facade fails closed.
    const first = await primary.runWithinTrustedContext(() => stopRequest(facade));
    assert.deepEqual(first, { ok: true, value: undefined });
    const second = await primary.runWithinTrustedContext(() => stopRequest(facade));
    assert.deepEqual(second, { ok: true, value: undefined });
    const afterStop = await primary.runWithinTrustedContext(() => sendRequest(facade, approvalIntent('instance:late', 'msg:late')));
    assert.deepEqual(afterStop, { ok: false, code: 'LIFECYCLE_FAILED' });
    const queryAfterStop = await primary.runWithinTrustedContext(() => queryRequest(facade, 'instance:clean-approval'));
    assert.deepEqual(queryAfterStop, { ok: false, code: 'LIFECYCLE_FAILED' });
    return { sendAfterStop: afterStop.code, queryAfterStop: queryAfterStop.code };
  });

  await step('negative.capturedFacadeDiesOutsideTrustedScope', async () => {
    // A fresh facade from the limited bridge, used outside any scope.
    const loaded = await limited.runWithinTrustedContext(() => loadRequest(refs['app:clean:two-b']));
    assert.equal(loaded.ok, true);
    const outside = await sendRequest(loaded.value, approvalIntent('instance:leak', 'msg:leak'));
    assert.deepEqual(outside, { ok: false, code: 'CALLER_SCOPE_DENIED' });
    return outside;
  });

  await step('teardown.deploymentCloseDetachesSynchronously', async () => {
    await primary.close();
    await limited.close();
    await foreign.close();
    await store.close();
    // Entering the CLOSED bridge's own request channel refuses synchronously
    // (LIFECYCLE_FAILED): this pins the synchronous detach of the trusted
    // scope itself, not just the missing-scope branch of load.
    const insideClosedScope = await primary.runWithinTrustedContext(() => loadRequest(refs['app:clean:two-b'])).then(
      () => 'RESOLVED',
      (error) => String(error?.code ?? error?.message),
    );
    assert.equal(insideClosedScope, 'LIFECYCLE_FAILED');
    const outsideScope = await loadRequest(refs['app:clean:two-b']);
    assert.deepEqual(outsideScope, { ok: false, code: 'PACKAGE_NOT_AUTHORIZED' });
    return { insideClosedScope, outsideScope };
  });

  const failed = events.filter((event) => !event.ok);
  return { ok: failed.length === 0, steps: events };
}

const invokedDirectly = process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const payloadDir = process.argv[2] !== undefined
    ? pathToFileURL(process.argv[2].replace(/[\/]$/, '') + '/').href
    : new URL('./payload/', import.meta.url).href;
  runExternalConsumerJourney(payloadDir).then(
    (result) => {
      console.log(`JOURNEY_RESULT ${JSON.stringify(result)}`);
      process.exitCode = result.ok ? 0 : 1;
    },
    (error) => {
      console.error(`JOURNEY_FAILED ${String(error?.stack ?? error)}`);
      process.exitCode = 1;
    },
  );
}
