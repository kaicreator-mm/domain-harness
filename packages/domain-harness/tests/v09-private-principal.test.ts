/**
 * Bounded N08 private principal contract P/N, not a physical Host permit test.
 * The fake trusted authenticator is test-only; the real Host signer/session
 * adapter and same-subject CAS effect commit are separate N08 concerns.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createV09PrivatePrincipalAuthority,
  type V09HostVerifiedIdentity,
} from '../src/operations-v9/private-principal.js';

const SHA = 'f'.repeat(64);
const P = 'presentation-only-visible-to-trusted-host';

function fixture() {
  let nowMs = 1000;
  let accepted = true;
  let calls = 0;
  let current: V09HostVerifiedIdentity = {
    principalId: 'principal.alpha',
    hostAudience: 'host.prod',
    tenantId: 'tenant.alpha',
    appId: 'app.alpha',
    selectedClosureDigest: SHA,
    issuerAuthEpoch: 7,
    expiresAtMs: 4000,
    grants: ['send:demo.create', 'query:demo.read', 'delivery:demo.events'],
  };
  const auth = createV09PrivatePrincipalAuthority({
    hostAudience: 'host.prod', tenantId: 'tenant.alpha',
    appId: 'app.alpha', subjectDigest: SHA,
    authenticator: {
      authenticate: async (p: unknown) => {
        calls += 1;
        if (!accepted || p !== P) throw new Error('private issuer diagnostic');
        return current;
      },
    },
    nowMs: () => nowMs,
  });
  return {
    auth,
    get calls() { return calls; },
    set now(value: number) { nowMs = value; },
    set accepted(value: boolean) { accepted = value; },
    get current() { return current; },
    set current(value: V09HostVerifiedIdentity) { current = value; },
  };
}

test('V09-N08-SCOPE01: opaque ticket is private and every use re-authenticates', async () => {
  const f = fixture();
  const token = await f.auth.issue(P, 'demo.create', 'send');
  assert.equal(Object.getPrototypeOf(token), null);
  assert.deepEqual(Object.keys(token), []);
  assert.equal(JSON.stringify(token), '{}');
  const verified = await f.auth.recheck(token, 'demo.create', 'send');
  assert.equal(verified.principalId, 'principal.alpha');
  assert.deepEqual(verified.grants, ['send:demo.create', 'query:demo.read', 'delivery:demo.events']);
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(f.calls, 2);
  await assert.rejects(() => f.auth.recheck({}, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  await assert.rejects(() => f.auth.recheck(JSON.parse('{}'), 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  await assert.rejects(() => f.auth.recheck(token, 'demo.create', 'effect'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  await assert.rejects(() => f.auth.recheck(token, 'demo.read', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  assert.equal(f.calls, 2); // forged or wrong purpose refused before auth lookup
});

test('V09-N08-SCOPE02: scope, audience, tenant and app mismatches fail closed', async () => {
  const f = fixture();
  await assert.rejects(() => f.auth.issue(P, 'demo.unknown', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  f.current = { ...f.current, tenantId: 'tenant.other' };
  await assert.rejects(() => f.auth.issue(P, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  f.current = { ...f.current, tenantId: 'tenant.alpha', appId: 'app.other' };
  await assert.rejects(() => f.auth.issue(P, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  f.current = { ...f.current, appId: 'app.alpha', hostAudience: 'host.other' };
  await assert.rejects(() => f.auth.issue(P, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  f.current = { ...f.current, hostAudience: 'host.prod', selectedClosureDigest: '0'.repeat(64) };
  await assert.rejects(() => f.auth.issue(P, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
});

test('V09-N08-SCOPE03: epoch change, issuer withdrawal and expiry refuse before sensitive use', async () => {
  const f = fixture();
  const token = await f.auth.issue(P, 'demo.create', 'send');
  f.current = { ...f.current, issuerAuthEpoch: 8 };
  await assert.rejects(() => f.auth.recheck(token, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  f.current = { ...f.current, issuerAuthEpoch: 7 };
  f.accepted = false;
  await assert.rejects(() => f.auth.recheck(token, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  f.accepted = true;
  f.now = 4000;
  f.current = { ...f.current, expiresAtMs: 6000 }; // fresh H auth cannot extend an already expired issued ticket
  await assert.rejects(() => f.auth.recheck(token, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
});

test('V09-N08-SCOPE04: other protected gateway tokens and stopped scopes are denied', async () => {
  const first = fixture();
  const second = fixture();
  const token = await first.auth.issue(P, 'demo.create', 'send');
  await assert.rejects(() => second.auth.recheck(token, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  first.auth.close();
  await assert.rejects(() => first.auth.recheck(token, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
  await assert.rejects(() => first.auth.issue(P, 'demo.create', 'send'), { code: 'V09_PRIVATE_SCOPE_DENIED' });
});

test('V09-N08-SCOPE05: forged caller cannot bypass actual Host-authenticator refusal', async () => {
  const f = fixture();
  await assert.rejects(
    () => f.auth.issue({ principalId: 'principal.alpha', tenantId: 'tenant.alpha', roles: ['admin'] }, 'demo.create', 'send'),
    { code: 'V09_PRIVATE_SCOPE_DENIED' },
  );
  assert.equal(f.calls, 1);
});

test('V09-N08-SCOPE06: stop during pending trusted auth denies late ticket and delivery', async () => {
  const caller: V09HostVerifiedIdentity = {
    principalId: 'principal.alpha', hostAudience: 'host.prod',
    tenantId: 'tenant.alpha', appId: 'app.alpha', selectedClosureDigest: SHA,
    issuerAuthEpoch: 7, expiresAtMs: 4000,
    grants: ['send:demo.create'],
  };
  let held: Promise<V09HostVerifiedIdentity> | undefined;
  let release = (_identity: V09HostVerifiedIdentity): void => {};
  const gate = createV09PrivatePrincipalAuthority({
    hostAudience: 'host.prod', tenantId: 'tenant.alpha', appId: 'app.alpha',
    subjectDigest: SHA, nowMs: () => 1000,
    authenticator: { authenticate: async () => held ?? caller },
  });
  const validToken = await gate.issue(P, 'demo.create', 'send');
  held = new Promise<V09HostVerifiedIdentity>(resolve => { release = resolve; });
  const lateCheck = gate.recheck(validToken, 'demo.create', 'send');
  const lateTicket = gate.issue(P, 'demo.create', 'send');
  gate.close();
  release(caller);
  await assert.rejects(() => lateCheck, { code: 'V09_PRIVATE_SCOPE_DENIED' });
  await assert.rejects(() => lateTicket, { code: 'V09_PRIVATE_SCOPE_DENIED' });
});
