/**
 * #1118 review P1-01 — deployment-owned trusted bootstrap integration proof.
 *
 * EVERYTHING in this file imports the two PUBLISHED subpaths only
 * (`@kaicreator/domain-harness/v9` and `.../v9/deployment`) plus Node
 * builtins and the repository's static sealed-payload byte files (the build
 * artifacts a real deployment receives). No `../src/...` module import
 * exists here: this is the proof that an independently installed consumer +
 * operator can run the real two-App selected-Kernel send/query flow with no
 * monorepo source access. The physical out-of-monorepo `npm pack` + fresh
 * install repetition is owned by #1119; this in-repo test pins the same
 * published surface on every verify run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { DomainHarness, DomainHarnessV9Error } from '@kaicreator/domain-harness/v9';
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
  type V09ComposedBridge,
  type V09HostDocumentStore,
  type V09HostVerifiedIdentity,
  type V09PrivateHostAuthenticator,
  type V09StorePutCondition,
} from '@kaicreator/domain-harness/v9/deployment';

const ISSUER = 'issuer:v09-deployment-bootstrap';
const SECRET = 'v09-deployment-bootstrap-local-issuer-proof-only';
const AUDIENCE = 'aud:v09-deployment-bootstrap';
const BASE_MS = Date.UTC(2026, 9, 18, 8, 0, 0);
const TOKEN_TTL_MS = 120_000;

const sha256Hex = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/** The deployment's physical store port (real true-CAS behavior, deployment material). */
class DeploymentMemoryStore implements V09HostDocumentStore {
  readonly #docs = new Map<string, { value: unknown; revision: number }>();

  async get(key: string): Promise<{ value: unknown; revision: number } | null> {
    const doc = this.#docs.get(key);
    return doc === undefined ? null : { value: structuredClone(doc.value), revision: doc.revision };
  }

  async put(key: string, value: unknown, condition: V09StorePutCondition): Promise<{ revision: number }> {
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

  async close(): Promise<void> {
    // The deployment store outlives individual governance host wrappers.
  }
}

async function readPayloads(): Promise<{ kernel: string; sdk: string; router: string; business: string; capability: string }> {
  const [kernel, sdk, router, business, capability] = await Promise.all([
    readFile(new URL('../../domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../domain-harness-compiler/src/qualified-package/v09/workflow-router.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/business-approval.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../examples/v08-domain-apps/capability-quote-tools.mjs', import.meta.url), 'utf8'),
  ]);
  return { kernel, sdk, router, business, capability };
}

/** Same BUILD-style vendored standard bundle the sealed roots carry (D01 zero-import discipline). */
function standardBundleSource(sdk: string, router: string): string {
  const routerBody = router.replace(/^export /gm, '');
  return `${sdk}
// v0.9 BUILD-style vendored bundle: the pure Standard WorkflowRouter.
const __dhv9RouterBundle = (() => {
${routerBody}
return { routeWorkflowIntent };
})();
export const routeWorkflowIntent = __dhv9RouterBundle.routeWorkflowIntent;
`;
}

const KERNEL_ID = 'v08-kernel-mechanism@1.0.0';
const STANDARD_ID = 'standard-sdk@v08.1.0.0';
const BUSINESS_ID = 'business-order-approval@v08.1.0.0';
const CAPABILITY_ID = 'capability-quote-tools@v08.1.0.0';
const INTENTS = ['submitQuoteDecision', 'submitQuoteDecisionStrict', 'submitQuoteDecisionDynamic'] as const;

function makeRoot(payloads: Awaited<ReturnType<typeof readPayloads>>, appId: string): { root: Record<string, unknown>; subjectDigest: string } {
  const standard = standardBundleSource(payloads.sdk, payloads.router);
  const packages = [
    { packageId: KERNEL_ID, kind: 'kernel', abiVersion: 'v08-kernel-abi/1', moduleSource: payloads.kernel },
    { packageId: STANDARD_ID, kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', moduleSource: standard },
    { packageId: BUSINESS_ID, kind: 'business', abiVersion: 'v08-business-abi/1', moduleSource: payloads.business },
    { packageId: CAPABILITY_ID, kind: 'capability', abiVersion: 'v08-capability-abi/1', moduleSource: payloads.capability },
  ].map((pkg) => ({ ...pkg, moduleSha256: sha256Hex(pkg.moduleSource), imports: [] as string[] }));
  const bindings: unknown[] = [
    { role: 'kernel', packageId: KERNEL_ID, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: STANDARD_ID, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: BUSINESS_ID, endpointId: 'business-policy' },
    ...INTENTS.map((intentType) => ({ role: 'intent', intentType, packageId: BUSINESS_ID, endpointId: 'business-policy' })),
    {
      role: 'capability', capabilityId: 'ledger', packageId: CAPABILITY_ID, endpointId: 'capability-endpoint',
      handlers: [{ operationId: 'reserve', handler: 'reserveLedger' }, { operationId: 'preview', handler: 'previewTotal' }],
    },
    { role: 'route', intentId: 'submitQuoteDecisionDynamic', operationId: 'reserve', capabilityId: 'ledger', handlerId: 'reserveLedger' },
  ];
  const subjectDigest = computeV09SealedRootSubjectDigest({
    rootPackageId: appId,
    buildId: `build:${appId}`,
    bundlerRevision: 'vendored-esbuild/0',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi: V09_RUNTIME_ABI,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  });
  const root = {
    formatVersion: V09_SEALED_ROOT_FORMAT,
    subjectDigest,
    rootPackageId: appId,
    buildId: `build:${appId}`,
    bundlerRevision: 'vendored-esbuild/0',
    importPolicyRevision: V09_IMPORT_POLICY_REVISION,
    runtimeAbi: V09_RUNTIME_ABI,
    hostAbi: V09_HOST_ABI,
    packages,
    bindings,
  };
  return { root, subjectDigest };
}

const GRANTS = ['send:submitQuoteDecisionDynamic', 'query:instance', 'effect:reserve', 'effect:preview'];

interface Deployment {
  readonly store: DeploymentMemoryStore;
  readonly clock: { now: number };
  ref(appId: string): string;
  bridge(appId: string, tenantId: string): V09ComposedBridge;
}

async function setupDeployment(): Promise<Deployment> {
  const payloads = await readPayloads();
  const store = new DeploymentMemoryStore();
  const clock = { now: BASE_MS };
  const trustedIssuers = new Map([[ISSUER, SECRET]]);
  const refs: Record<string, string> = {};
  const digests: Record<string, string> = {};
  const govHost = await createProtectedHostV09({ store, trustedIssuers, audience: AUDIENCE, runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI });
  for (const appId of ['app:deploy:one', 'app:deploy:two']) {
    const { root, subjectDigest } = makeRoot(payloads, appId);
    const approval = issueV09ApprovalProof({ subjectDigest, issuerId: ISSUER, issuerSecret: SECRET, issuedAt: new Date(BASE_MS).toISOString() });
    const installed = await govHost.install(root, approval, AUDIENCE);
    refs[appId] = installed.installedRef;
    digests[appId] = subjectDigest;
  }
  await govHost.close();

  function bridge(appId: string, tenantId: string): V09ComposedBridge {
    const presentation = { kind: 'v09-deployment-presentation', appId, tenantId, principalId: `principal:${appId}:${tenantId}` };
    let frozenIdentity: Record<string, unknown> | undefined;
    const authenticator: V09PrivateHostAuthenticator = {
      async authenticate(offered: unknown): Promise<V09HostVerifiedIdentity> {
        assert.deepEqual((offered as { appId?: string })?.appId, appId, 'the deployment authenticator answers only its own composition presentation');
        if (frozenIdentity === undefined) {
          frozenIdentity = {
            principalId: presentation.principalId,
            hostAudience: AUDIENCE,
            appId,
            tenantId,
            selectedClosureDigest: digests[appId],
            issuerAuthEpoch: 1,
            expiresAtMs: clock.now + TOKEN_TTL_MS,
            grants: GRANTS,
          };
        }
        return { ...frozenIdentity } as unknown as V09HostVerifiedIdentity;
      },
    };
    return createV09DomainHarnessBridge({
      store, trustedIssuers, audience: AUDIENCE,
      runtimeAbi: V09_RUNTIME_ABI, hostAbi: V09_HOST_ABI,
      authenticator, presentation,
      nowMs: (): number => clock.now,
    });
  }

  return {
    store,
    clock,
    ref: (appId) => {
      const value = refs[appId];
      assert.ok(value !== undefined, `no installed reference for ${appId}`);
      return value;
    },
    bridge,
  };
}

const dynamicIntent = (instanceKey: string, messageId: string) => ({
  intentType: 'submitQuoteDecisionDynamic',
  instanceKey,
  messageId,
  input: { amount: 30, requestId: 'R1' },
});

test('V09-PKG-BOOT: published deployment bootstrap runs the real two-App consumer flow with zero source imports', async () => {
  const deployment = await setupDeployment();
  const first = deployment.bridge('app:deploy:one', 'tenant:one');
  const second = deployment.bridge('app:deploy:two', 'tenant:two');

  // Ordinary consumer module behavior (this file imports ONLY ./v9 for it):
  // with no trusted deployment scope at all, every load refuses uniformly.
  await assert.rejects(DomainHarness.load(deployment.ref('app:deploy:one')), (error: unknown) => {
    assert.ok(error instanceof DomainHarnessV9Error);
    assert.equal(error.code, 'PACKAGE_NOT_AUTHORIZED');
    return true;
  });

  // The deployment enters its trusted request scopes around consumer handlers.
  const [facadeOne, facadeTwo] = await Promise.all([
    first.runWithinTrustedContext(() => DomainHarness.load(deployment.ref('app:deploy:one'))),
    second.runWithinTrustedContext(() => DomainHarness.load(deployment.ref('app:deploy:two'))),
  ]);
  assert.equal(facadeOne.package.rootPackageId, 'app:deploy:one');
  assert.equal(facadeTwo.package.rootPackageId, 'app:deploy:two');

  // A foreign installed reference is NOT borrowable across trusted scopes:
  // the same registry can activate it, but the caller presentation's
  // appId/selectedClosureDigest no longer match that closure — the honest
  // public family for a foreign-closure load is CALLER_SCOPE_DENIED.
  await first.runWithinTrustedContext(async () => {
    await assert.rejects(DomainHarness.load(deployment.ref('app:deploy:two')), (error: unknown) => {
      assert.ok(error instanceof DomainHarnessV9Error);
      assert.equal(error.code, 'CALLER_SCOPE_DENIED');
      return true;
    });
  });

  // Real selected-Kernel send/query on both Apps through the public facade.
  const [receiptOne, receiptTwo] = await Promise.all([
    first.runWithinTrustedContext(() => facadeOne.send(dynamicIntent('instance:deploy-one', 'msg:deploy-one'))),
    second.runWithinTrustedContext(() => facadeTwo.send(dynamicIntent('instance:deploy-two', 'msg:deploy-two'))),
  ]);
  assert.ok(receiptOne !== undefined && receiptTwo !== undefined, 'both Apps committed real occurrences');
  const [snapshotOne, snapshotTwo] = await Promise.all([
    first.runWithinTrustedContext(() => facadeOne.query({ kind: 'instance', instanceKey: 'instance:deploy-one' })),
    second.runWithinTrustedContext(() => facadeTwo.query({ kind: 'instance', instanceKey: 'instance:deploy-two' })),
  ]);
  assert.ok(snapshotOne !== null && snapshotOne !== undefined, 'App one holds the sent instance');
  assert.ok(snapshotTwo !== null && snapshotTwo !== undefined, 'App two holds the sent instance');

  // Request-scoped facade discipline: after the trusted callback returned,
  // the captured facade is dead (CALLER_SCOPE_DENIED), and inside another
  // deployment's scope it is refused just the same.
  await assert.rejects(facadeOne.send(dynamicIntent('instance:late', 'msg:late')), (error: unknown) => {
    assert.ok(error instanceof DomainHarnessV9Error);
    assert.equal(error.code, 'CALLER_SCOPE_DENIED');
    return true;
  });
  await second.runWithinTrustedContext(async () => {
    await assert.rejects(facadeOne.query({ kind: 'instance', instanceKey: 'instance:deploy-one' }), (error: unknown) => {
      assert.ok(error instanceof DomainHarnessV9Error);
      assert.equal(error.code, 'CALLER_SCOPE_DENIED');
      return true;
    });
  });

  // Deployment shutdown: detach happens synchronously before teardown, so a
  // later consumer load inside a stale callback fails closed.
  await first.close();
  await second.close();
  await assert.rejects(DomainHarness.load(deployment.ref('app:deploy:one')), (error: unknown) => {
    assert.ok(error instanceof DomainHarnessV9Error);
    assert.equal(error.code, 'PACKAGE_NOT_AUTHORIZED');
    return true;
  });
  await deployment.store.close();
});
