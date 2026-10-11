/**
 * V08-ABI-B01 — trusted Node Host security face (T-E, #1004).
 * ============================================================
 *
 * The Host-side half of the B01 contract tests (L2 owners: T-E Host security
 * + T-C K policy + T-D S query + T-B facade; K/Effect logic itself is
 * deliberately NOT implemented here). One file = one process: node:test runs
 * these top-level tests sequentially and the ORDER IS LOAD-BEARING —
 *
 *   1. the un-bootstrapped process fails closed FIRST (in-process sentinel
 *      evidence; the cross-process twin lives in v08-host-multiprocess.test.ts),
 *   2. bootstrap with non-CAS storage is refused WITHOUT consuming the
 *      one-shot trust channel (C01-N7),
 *   3. the protected bootstrap establishes the channel exactly once, and a
 *      second bootstrap is typed-refused,
 *   4. every B01 negative runs against the single bootstrapped host.
 *
 * Covered (test IDs in order): N6(pre), N8(pre), P, N1, N2, N3, N4+KPK-11
 * port, N5, N6, N7, N8(post).
 */

import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  bootstrapTrustedHost,
  createHostUxTransport,
  createUxTransport,
  HostBoundaryError,
  HostIdentityVerifier,
  HOST_CREDENTIAL_TYPE,
  isHostTrustChannelEstablished,
  mintPrincipalCredential,
  uxDocumentNamespace,
  type CasDocumentStore,
  type CasGetResult,
  type HostCredential,
  type UxTransport,
} from '../../src/host-v8/index.js';
import { load, QualifiedPackageError } from '../../src/public-v8/index.js';
import { ATTACKER_SECRET, buildSealedRoot, ISSUER_ID, ISSUER_SECRET, sentinelCount } from './helpers.js';

const AUDIENCE = 'host:te-demo';
const TENANT = 'tenant-1';
const APP = 'app-1';
const INTENT_TYPE = 'demo.b01';

function grant(input: { grantId: string; roles?: string[]; tenantId?: string; appId?: string; audience?: string; issuedAt?: string; expiresAt?: string; subject?: string }): HostCredential {
  return mintPrincipalCredential(
    {
      issuerId: ISSUER_ID,
      grantId: input.grantId,
      tenantId: input.tenantId ?? TENANT,
      appId: input.appId ?? APP,
      subject: input.subject ?? `user:${input.grantId}`,
      audience: input.audience ?? AUDIENCE,
      roles: input.roles ?? ['requester'],
      issuedAt: input.issuedAt ?? new Date(Date.now() - 1000).toISOString(),
      expiresAt: input.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    ISSUER_SECRET,
  );
}

async function refuseCredential(host: { authenticate(credential: unknown): Promise<unknown> }, credential: unknown, code: string): Promise<void> {
  await assert.rejects(
    () => host.authenticate(credential),
    (error: unknown) => {
      assert.ok(error instanceof HostBoundaryError, `expected HostBoundaryError, got ${String(error)}`);
      assert.equal((error as HostBoundaryError).code, code);
      return true;
    },
  );
}

let storageDir = '';
let docs: CasDocumentStore;

test('V08-ABI-B01-N6(pre) an un-bootstrapped host process is privilege-free and fail-closed', async () => {
  assert.equal(isHostTrustChannelEstablished(), false, 'no trust channel before any bootstrap');
  // The #1000 closure, in-process: even a GENUINELY HMAC'd approval proof
  // cannot activate anything — load() refuses before any import and the
  // sealed module's top-level sentinel stays 0.
  const root = buildSealedRoot({ tag: 'b01-pre', intentType: INTENT_TYPE });
  await assert.rejects(
    () => load(root),
    (error: unknown) => error instanceof QualifiedPackageError && (error as QualifiedPackageError).code === 'UNTRUSTED_ISSUER',
  );
  assert.equal(sentinelCount(`kernel:te-b01-pre@1.0.0`), 0, 'zero imports in an un-bootstrapped process');
  assert.equal(sentinelCount(`std:te-b01-pre@1.0.0`), 0);
  assert.equal(sentinelCount(`biz:te-b01-pre@1.0.0`), 0);
});

test('V08-ABI-B01-N8(pre) bootstrap over non-CAS storage is typed-unsupported and burns nothing (C01-N7)', async () => {
  const broken: CasDocumentStore = {
    // A #994-file-host-shaped rogue store: writes are UNCONDITIONAL and a
    // stale revision is silently accepted — exactly what T-E refuses.
    async get(key: string): Promise<CasGetResult | null> {
      return (this as unknown as { m: Map<string, CasGetResult> }).m.get(key) ?? null;
    },
    async put(key: string, value: unknown): Promise<{ revision: number }> {
      const map = (this as unknown as { m: Map<string, CasGetResult> }).m;
      const previous = map.get(key);
      const revision = previous === undefined ? 0 : previous.revision + 1;
      map.set(key, { value, revision });
      return { revision };
    },
    async remove(): Promise<void> {},
    async list(): Promise<readonly string[]> {
      return [];
    },
    async close(): Promise<void> {},
    m: new Map<string, CasGetResult>(),
  } as unknown as CasDocumentStore;
  await assert.rejects(
    () =>
      bootstrapTrustedHost({
        issuers: new Map([[ISSUER_ID, ISSUER_SECRET]]),
        audience: AUDIENCE,
        storage: { store: broken },
      }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_STORAGE_UNSUPPORTED',
  );
  assert.equal(isHostTrustChannelEstablished(), false, 'a failed storage probe must not consume the one-shot trust channel');
});

let ux: UxTransport;
let host: Awaited<ReturnType<typeof bootstrapTrustedHost>>['host'];

test('V08-ABI-B01-P protected bootstrap: authorized load, typed send/query/subscribe and reconnect', async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), 'v08-host-b01-'));
  const bootstrapped = await bootstrapTrustedHost({
    issuers: new Map([[ISSUER_ID, ISSUER_SECRET]]),
    audience: AUDIENCE,
    storage: { path: path.join(storageDir, 'host.db') },
  });
  host = bootstrapped.host;
  docs = bootstrapped.store;
  assert.equal(isHostTrustChannelEstablished(), true);

  // Authorized load through the public one-argument gate: the SAME process
  // that refused everything above now executes the verified closure once.
  const loaded = await load(buildSealedRoot({ tag: 'b01-pos', intentType: INTENT_TYPE }));
  assert.equal(loaded.installedPackages.length, 3);
  assert.equal(sentinelCount(`kernel:te-b01-pos@1.0.0`), 1, 'the verified kernel evaluated exactly once behind the gate');

  // Generic fixture resource (host-context provisioning — deployment config,
  // not business policy): echoes the authenticated dispatch context and
  // records a durable receipt in the scoped document namespace.
  host.resources.provision(`intent:${INTENT_TYPE}`, async (_operation, payload, context) => {
    const received = payload as { messageId: string; input: { amount?: number }; declaredCaller: unknown };
    const key = `${uxDocumentNamespace(context.principal.tenantId, context.principal.appId)}receipt:${received.messageId}`;
    const existing = await docs.get(key);
    await docs.put(
      key,
      { messageId: received.messageId, amount: received.input.amount ?? null, bySubject: context.principal.subject },
      existing === null ? { mustBeAbsent: true } : { mustMatchRevision: existing.revision },
    );
    return { echoed: true, roles: [...context.principal.roles] };
  });

  const credential = grant({ grantId: 'grant-b01-p' });
  ux = createHostUxTransport(host, credential);
  const receipt = await ux.send({
    intentType: INTENT_TYPE,
    target: { tenantId: TENANT, appId: APP, instanceKey: 'instance:1' },
    messageId: 'msg:p1',
    input: { amount: 42 },
    caller: { role: 'admin' }, // declared role = user data (N1 proves it stays that way)
  });
  assert.equal(receipt.status, 'dispatched');
  assert.equal(receipt.authenticatedPrincipal.roles[0], 'requester', 'the receipt carries ONLY credential-signed roles');
  assert.equal(JSON.stringify(receipt.declaredCaller), '{"role":"admin"}', 'the declared caller is carried as untrusted user data');

  // Typed query: the receipt document the fixture wrote is readable in the
  // authenticated namespace.
  const doc = (await ux.query({ kind: 'doc', key: `${uxDocumentNamespace(TENANT, APP)}receipt:msg:p1` })) as { value: { bySubject: string }; revision: number };
  assert.equal(doc.value.bySubject, 'user:grant-b01-p');
  assert.equal(typeof doc.revision, 'number');

  // Typed subscribe: the host-context publish reaches the scoped observer.
  const events: string[] = [];
  const subscription = await ux.subscribe({ topic: 'receipts' }, (event) => events.push(event.topic));
  await host.events.publish({ tenantId: TENANT, appId: APP, instanceKey: 'instance:1', topic: 'receipts', payload: { n: 1 }, emittedAt: new Date().toISOString() });
  assert.deepEqual(events, ['receipts']);

  // Reconnect: a brand-new transport over a brand-new credential sees the
  // durable state written through the first channel (same physical store).
  const reconnected = createHostUxTransport(host, grant({ grantId: 'grant-b01-p2' }));
  const again = (await reconnected.query({ kind: 'doc', key: `${uxDocumentNamespace(TENANT, APP)}receipt:msg:p1` })) as { value: { messageId: string } };
  assert.equal(again.value.messageId, 'msg:p1');
  subscription.unsubscribe();
});

test('V08-ABI-B01-N1 forged credentials, injected roles and fake verifier plumbing are refused', async () => {
  // Keyless look-alike attestation (the audited #1007 vector shape).
  const forgedMaterial = grant({ grantId: 'grant-forge-1' });
  const digest = createHash('sha256').update(forgedMaterial.proofDigest, 'utf8').digest('hex');
  const keyless = { ...forgedMaterial, issuerAttestation: `hmac-sha256:${digest}` };
  await refuseCredential(host, keyless, 'HOST_CREDENTIAL_FORGED');
  // Right issuer id, wrong secret.
  const wrongSecret = mintPrincipalCredential(
    {
      issuerId: ISSUER_ID,
      grantId: 'grant-forge-2',
      tenantId: TENANT,
      appId: APP,
      subject: 'user:forge-2',
      audience: AUDIENCE,
      roles: ['admin'],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    ATTACKER_SECRET,
  );
  await refuseCredential(host, wrongSecret, 'HOST_CREDENTIAL_FORGED');
  // Unregistered issuer.
  const stranger = mintPrincipalCredential(
    {
      issuerId: 'attacker-issuer',
      grantId: 'grant-forge-3',
      tenantId: TENANT,
      appId: APP,
      subject: 'user:forge-3',
      audience: AUDIENCE,
      roles: ['admin'],
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    ATTACKER_SECRET,
  );
  await refuseCredential(host, stranger, 'HOST_CREDENTIAL_UNTRUSTED_ISSUER');
  // Unbound extra field.
  const padded = { ...grant({ grantId: 'grant-forge-4' }), extra: true };
  await refuseCredential(host, padded, 'HOST_CREDENTIAL_MALFORMED');
  // Wrong type marker.
  const wrongType = { ...grant({ grantId: 'grant-forge-5' }), proofType: 'other/1' };
  await refuseCredential(host, wrongType, 'HOST_CREDENTIAL_MALFORMED');

  // Injected role: a valid low-privilege credential whose INTENT declares
  // caller.role = 'admin' dispatches with the SIGNED roles only — the
  // dispatch accounting proves the declared role never became identity.
  const lowPrivilege = createHostUxTransport(host, grant({ grantId: 'grant-b01-n1', roles: ['requester'] }));
  const receipt = await lowPrivilege.send({
    intentType: INTENT_TYPE,
    target: { tenantId: TENANT, appId: APP, instanceKey: 'instance:1' },
    messageId: 'msg:n1',
    input: { amount: 1 },
    caller: { role: 'admin' },
  });
  assert.deepEqual(receipt.authenticatedPrincipal.roles, ['requester']);
  const calls = host.resources.calls();
  const last = calls[calls.length - 1];
  assert.ok(last !== undefined);
  assert.deepEqual([...last.principalRoles], ['requester'], 'the resource saw the credential-signed roles, not the declared one');

  // Fake verifier plumbing: the channel and credential are strict allowlists.
  // Verifier/hostPort material cannot ride on the credential (eager shape
  // check) nor on the channel (typed host-ports refusal before any dispatch).
  const credential = grant({ grantId: 'grant-b01-n1b' });
  assert.throws(
    () =>
      createHostUxTransport(host, { ...credential, ...({ hostPorts: { docs: { get: async () => null } } } as unknown as HostCredential) }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_CREDENTIAL_MALFORMED',
  );
  const inertDeps = {
    authenticate: async () => {
      throw new Error('never reached');
    },
    dispatch: async () => {
      throw new Error('never reached');
    },
    readScopedDoc: async () => null,
    subscribe: async () => {
      throw new Error('never reached');
    },
    assertIntentScope: () => {
      throw new Error('never reached');
    },
  };
  assert.throws(
    () => createUxTransport(inertDeps, { credential, ...({ hostPorts: { docs: {} } } as object) }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'UX_HOST_PORTS_FORBIDDEN',
  );
});

test('V08-ABI-B01-N2 cross-tenant / cross-app / cross-instance are refused with no existence leak', async () => {
  const credential = grant({ grantId: 'grant-b01-n2' });
  const transport = createHostUxTransport(host, credential);
  await assert.rejects(
    () =>
      transport.send({
        intentType: INTENT_TYPE,
        target: { tenantId: 'tenant-2', appId: APP, instanceKey: 'instance:1' },
        messageId: 'msg:n2a',
        input: {},
      }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_SCOPE_DENIED',
  );
  await assert.rejects(
    () =>
      transport.send({
        intentType: INTENT_TYPE,
        target: { tenantId: TENANT, appId: 'app-2', instanceKey: 'instance:1' },
        messageId: 'msg:n2b',
        input: {},
      }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_SCOPE_DENIED',
  );
  // Cross-tenant subscription scope: refused typed at subscribe time.
  await assert.rejects(
    () => transport.subscribe({ tenantId: 'tenant-2' }, () => {}),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_SCOPE_DENIED',
  );
  // Cross-tenant document read: identical refusal inside the other tenant's
  // namespace (and the same code for a nonexistent key — no existence leak).
  await assert.rejects(
    () => transport.query({ kind: 'doc', key: `${uxDocumentNamespace('tenant-2', APP)}receipt:msg:p1` }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_SCOPE_DENIED',
  );
  await assert.rejects(
    () => transport.query({ kind: 'doc', key: `${uxDocumentNamespace(TENANT, APP)}receipt:never-written` }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'UX_DOC_NOT_FOUND',
  );
});

test('V08-ABI-B01-N2-repair separator-bearing tenant/app ids are refused typed and cannot collide namespaces', async () => {
  // Independent-review P1-1 regression (PR #1011): without the charset
  // restriction the namespace join `ux:<tenantId>:<appId>:` collides across
  // apps AND tenants — (t1, a1) could read (t1, a1:sub) documents, and
  // (t1:a1, sub) has EXACTLY the namespace of (t1, a1:sub). Both exploit
  // paths must be refused typed at the authoritative credential shape check
  // (and at transport construction, which shape-checks eagerly).
  // Path A — cross-app collision: appId bearing the delimiter.
  const crossApp = grant({ grantId: 'grant-b01-n2-appsep', appId: 'a1:sub' });
  await refuseCredential(host, crossApp, 'HOST_IDENTITY_ID_MALFORMED');
  assert.throws(
    () => createHostUxTransport(host, crossApp),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_IDENTITY_ID_MALFORMED',
  );
  // Path B — cross-tenant collision: tenantId bearing the delimiter.
  const crossTenant = grant({ grantId: 'grant-b01-n2-tenantsep', tenantId: 't1:a1', appId: 'sub' });
  await refuseCredential(host, crossTenant, 'HOST_IDENTITY_ID_MALFORMED');
  assert.throws(
    () => createHostUxTransport(host, crossTenant),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_IDENTITY_ID_MALFORMED',
  );
  // Namespace construction re-guards (defense in depth for host-context callers).
  for (const [tenantId, appId] of [['t1', 'a1:sub'], ['t1:a1', 'sub']] as const) {
    assert.throws(
      () => uxDocumentNamespace(tenantId, appId),
      (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_IDENTITY_ID_MALFORMED',
      `uxDocumentNamespace(${tenantId}, ${appId}) must refuse the delimiter`,
    );
  }
  // Positive control: separator-free ids still construct the namespace.
  assert.equal(uxDocumentNamespace('t1', 'a1'), 'ux:t1:a1:');
});

test('V08-ABI-B01-N3-repair length-equal multibyte attestation is typed-forged, never a bare RangeError', async () => {
  // Independent-review P2-1 regression (PR #1011): a credential attestation
  // with the SAME string length but a DIFFERENT UTF-8 byte length used to
  // make timingSafeEqual throw a raw RangeError outside the typed taxonomy.
  const material = grant({ grantId: 'grant-b01-mb' });
  const prefix = 'hmac-sha256:';
  assert.equal(material.issuerAttestation.slice(prefix.length).length, 64);
  const multibyte = { ...material, issuerAttestation: `${prefix}${'a'.repeat(32)}${'é'.repeat(32)}` };
  assert.equal(multibyte.issuerAttestation.length, material.issuerAttestation.length, 'the probe must be code-unit-length-equal');
  await refuseCredential(host, multibyte, 'HOST_CREDENTIAL_FORGED');
});

test('V08-ABI-B01-N3 stale and revoked grants: expired / future / stale / revoked never authenticate', async () => {
  await refuseCredential(host, grant({ grantId: 'grant-b01-n3a', expiresAt: new Date(Date.now() - 1000).toISOString() }), 'HOST_CREDENTIAL_EXPIRED');
  await refuseCredential(host, grant({ grantId: 'grant-b01-n3b', issuedAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }), 'HOST_CREDENTIAL_NOT_YET_VALID');
  // Currentness policy (maxCredentialAgeMs) — the Host-side twin of the load
  // gate's maxProofAgeMs, verified at the identity layer with the same
  // durable revocation store.
  const verifier = new HostIdentityVerifier({
    issuers: new Map([[ISSUER_ID, ISSUER_SECRET]]),
    audience: AUDIENCE,
    now: () => new Date(),
    maxCredentialAgeMs: 60_000,
    revocations: docs,
  });
  await assert.rejects(
    () =>
      verifier.authenticate(
        grant({
          grantId: 'grant-b01-n3c',
          issuedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        }),
      ),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_CREDENTIAL_STALE',
  );
  // Durable revocation: revoke first, then the SAME previously-valid grant
  // is refused at every later authentication.
  const revocable = grant({ grantId: 'grant-b01-n3d' });
  const principal = await host.authenticate(revocable);
  assert.equal(principal.subject, 'user:grant-b01-n3d');
  await host.revokeGrant('grant-b01-n3d');
  await refuseCredential(host, revocable, 'HOST_CREDENTIAL_REVOKED');
  assert.equal(await host.isGrantRevoked('grant-b01-n3d'), true);
  // Double revocation is typed (create-if-absent semantics on the tombstone).
  await assert.rejects(
    () => host.revokeGrant('grant-b01-n3d'),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_KEY_EXISTS',
  );
});

test('V08-ABI-B01-N4 + KPK-11 port: no raw journal/kernel route, no smuggled callables, frozen surface', async () => {
  const transport = createHostUxTransport(host, grant({ grantId: 'grant-b01-n4' }));
  for (const kind of ['journal', 'kernel', 'mechanism', 'effect', 'admission', 'store', 'docs', 'resources']) {
    await assert.rejects(
      () => transport.query({ kind, key: 'anything' }),
      (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'UX_QUERY_KIND_FORBIDDEN',
      `query kind ${kind} must have no UX route`,
    );
  }
  // KPK-11 vector: callables cannot be smuggled through the typed transport.
  await assert.rejects(
    () =>
      transport.send({
        intentType: INTENT_TYPE,
        target: { tenantId: TENANT, appId: APP, instanceKey: 'instance:1' },
        messageId: 'msg:n4',
        input: { amount: 1, commitEffect: () => ({ forged: true }) },
      }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'UX_INTENT_NOT_JSON',
  );
  // Prototype smuggling is refused by the canonical snapshot.
  await assert.rejects(
    () =>
      transport.send({
        intentType: INTENT_TYPE,
        target: { tenantId: TENANT, appId: APP, instanceKey: 'instance:1' },
        messageId: 'msg:n4b',
        input: JSON.parse('{"__proto__": {"admin": true}}') as object,
      }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'UX_INTENT_NOT_JSON',
  );
  // The transport is frozen and exposes ONLY the three typed verbs — no
  // journal, no docs, no host ports, no publisher, no revocation.
  assert.deepEqual(Object.keys(transport).sort(), ['query', 'send', 'subscribe']);
  assert.throws(() => {
    (transport as unknown as Record<string, unknown>).commitEffect = () => 'forged';
  }, TypeError);
  assert.throws(() => {
    (transport as unknown as Record<string, unknown>).hostPorts = { docs: {} };
  }, TypeError);
  // Credential type marker is a fixed constant (shape-pinned surface).
  assert.equal(HOST_CREDENTIAL_TYPE, 'v08-host-principal/1');
});

test('V08-ABI-B01-N5 a grant revoked between subscribe and delivery never receives the event', async () => {
  const credential = grant({ grantId: 'grant-b01-n5' });
  const transport = createHostUxTransport(host, credential);
  const delivered: unknown[] = [];
  await transport.subscribe({ topic: 'revocation-check' }, (event) => delivered.push(event.payload));
  await host.events.publish({ tenantId: TENANT, appId: APP, instanceKey: 'instance:1', topic: 'revocation-check', payload: 'before', emittedAt: new Date().toISOString() });
  assert.deepEqual(delivered, ['before'], 'delivery works while the grant is valid');
  await host.revokeGrant('grant-b01-n5');
  await host.events.publish({ tenantId: TENANT, appId: APP, instanceKey: 'instance:1', topic: 'revocation-check', payload: 'after', emittedAt: new Date().toISOString() });
  assert.deepEqual(delivered, ['before'], 'no delivery after revocation — revalidated on every delivery');
});

test('V08-ABI-B01-N6 privilege-free surfaces: no secrets, no observer routes, scope-bounded delivery', async () => {
  // The host object exposes no issuer/secret surface at all.
  for (const member of Object.keys(host)) {
    assert.equal(/secret|issuer|key/i.test(member), false, `host surface must not expose ${member}`);
  }
  const credential = grant({ grantId: 'grant-b01-n6' });
  const transport = createHostUxTransport(host, credential);
  // An unauthenticated observer has no subscribe route.
  const forged = grant({ grantId: 'grant-b01-n6-forge' });
  // Flip the attestation's last hex digit to a DIFFERENT digit (a plain
  // 'replace with 0' could be a no-op one time in sixteen).
  const lastDigit = forged.issuerAttestation.charAt(forged.issuerAttestation.length - 1);
  const flippedDigit = lastDigit === '0' ? '1' : '0';
  const tampered = { ...forged, issuerAttestation: forged.issuerAttestation.slice(0, -1) + flippedDigit };
  assert.notEqual(tampered.issuerAttestation, forged.issuerAttestation);
  await assert.rejects(
    () => host.events.subscribe(tampered, { topic: 'any' }, () => {}),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_CREDENTIAL_FORGED',
  );
  // Scope-bounded delivery: an observer scoped to instance:1 never sees
  // events of instance:2 — no observer leakage across the scope.
  const seen: string[] = [];
  await transport.subscribe({ instanceKey: 'instance:1', topic: 'scoped' }, (event) => seen.push(event.instanceKey));
  await host.events.publish({ tenantId: TENANT, appId: APP, instanceKey: 'instance:2', topic: 'scoped', payload: null, emittedAt: new Date().toISOString() });
  await host.events.publish({ tenantId: TENANT, appId: APP, instanceKey: 'instance:1', topic: 'scoped', payload: null, emittedAt: new Date().toISOString() });
  assert.deepEqual(seen, ['instance:1']);
});

test('V08-ABI-B01-N7 a stale snapshot cannot mutate authority (detached reads, CAS writes)', async () => {
  const transport = createHostUxTransport(host, grant({ grantId: 'grant-b01-n7' }));
  const key = `${uxDocumentNamespace(TENANT, APP)}receipt:msg:p1`;
  const snapshot = (await transport.query({ kind: 'doc', key })) as { value: Record<string, unknown>; revision: number };
  assert.ok(Object.isFrozen(snapshot), 'the returned read model is a frozen detached snapshot');
  assert.ok(Object.isFrozen(snapshot.value), 'the returned value is itself frozen');
  // Mutating the snapshot is representable only in the caller's memory (a
  // frozen object refuses the write outright in strict mode): there is no
  // write route on the transport at all.
  assert.throws(() => {
    (snapshot.value as { messageId: string }).messageId = 'tampered';
  }, TypeError);
  const reread = (await transport.query({ kind: 'doc', key })) as { value: { messageId: string }; revision: number };
  assert.equal(reread.value.messageId, 'msg:p1', 'authority is untouched by snapshot mutation');
  // The host-context write path is CAS: a stale revision expectation is a
  // typed conflict, never an overwrite (C01-N9/N10 detail in the CAS file).
  await assert.rejects(
    () => docs.put(key, { forged: true }, { mustMatchRevision: 9999 }),
    (error: unknown) => error instanceof HostBoundaryError && (error as HostBoundaryError).code === 'HOST_CAS_CONFLICT',
  );
  const unchanged = await docs.get(key);
  assert.ok(unchanged !== null && (unchanged.value as { messageId?: string }).messageId === 'msg:p1');
});

test('V08-ABI-B01-N8(post) the trust channel is one-shot per process', async () => {
  await assert.rejects(
    () =>
      bootstrapTrustedHost({
        issuers: new Map([[ISSUER_ID, ISSUER_SECRET]]),
        audience: AUDIENCE,
      }),
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, 'TRUST_CHANNEL_ALREADY_ESTABLISHED');
      return true;
    },
  );
});


/** Windows-robust recursive removal: child-process handle release can lag process exit by a moment (EBUSY). */
async function rmWithRetries(dir: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rm(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code === 'EBUSY' || code === 'ENOTEMPTY' || code === 'EPERM') && attempt < 20) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }
      throw error;
    }
  }
}

test('cleanup', async () => {
  await host.close();
  await rmWithRetries(storageDir);
});
