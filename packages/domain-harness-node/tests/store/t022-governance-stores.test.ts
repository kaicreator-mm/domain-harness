import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type {
  DomainActivationBinding,
  GovernanceBaselineBody,
  GovernanceBaselineIdentity,
  GovernanceBaselineRetentionReference,
  GovernancePackageCdiBinding,
  PromotionActivationAuditRecord,
} from '@kaicreator/domain-harness';
import {
  NodeSqliteAuthorityAuditStore,
  NodeSqliteDomainActivationAuthority,
  NodeSqliteExactPackageCdiAuthority,
  NodeSqliteGovernanceBaselineStore,
} from '../../src/store/node-sqlite-governance-stores.js';
import { openAuthorityTestDatabase } from './authority-test-helpers.js';

function expectContractError(code: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof Error
    && error.name === 'GovernanceContractError'
    && (error as { code?: string }).code === code;
}

function expectAuthorityError(code: string): (error: unknown) => boolean {
  return (error: unknown) =>
    error instanceof Error
    && error.name === 'PromotionActivationAuthorityError'
    && (error as { code?: string }).code === code;
}

/** Fixture identities use plain sha256:-prefixed digests; stores never recompute digests. */
function baselineIdentity(contentDigest: string): GovernanceBaselineIdentity {
  return {
    domainId: 'domain-a',
    governanceId: 'gov-a',
    schemaVersion: '1',
    contentDigest,
  };
}

function baselineBody(marker: string): GovernanceBaselineBody {
  return {
    identity: baselineIdentity(`sha256:${marker}`),
    semantics: { marker },
  };
}

function auditReference(referenceId: string, body: GovernanceBaselineBody): GovernanceBaselineRetentionReference {
  return {
    referenceId,
    reason: 'audit',
    baseline: body.identity,
  };
}

function activationBinding(input: {
  readonly packageId: string;
  readonly diDigest: string;
  readonly baselineDigest: string;
}): DomainActivationBinding {
  return {
    domainId: 'domain-a',
    packageId: input.packageId,
    domainIntelligenceContentDigest: input.diDigest,
    governanceBaseline: {
      domainId: 'domain-a',
      governanceId: 'gov-a',
      schemaVersion: '1',
      contentDigest: input.baselineDigest,
    },
  };
}

function packageCdiBinding(diDigest: string, packageId = 'pkg-a'): GovernancePackageCdiBinding {
  return {
    domainId: 'domain-a',
    packageId,
    domainIntelligenceContentDigest: diDigest,
  };
}

function auditRecord(actionId: string, auditId: string): PromotionActivationAuditRecord {
  return {
    auditId,
    actionId,
    action: 'promote',
    actor: { kind: 'human-operator', actorId: 'actor-1', operatorId: 'op-1' },
    recordedAt: '2026-01-01T00:00:00.000Z',
    artifact: { kind: 'promoted-subworkflow', artifactId: 'artifact-a', contentDigest: 'sha256:artifact-1' },
    candidate: {
      candidateKind: 'workflow',
      candidateId: 'candidate-a',
      candidateContentDigest: 'sha256:candidate-1',
      validatorContractVersion: 'candidate-validator-v1',
      governanceBaseline: {
        domainId: 'domain-a',
        governanceId: 'gov-a',
        schemaVersion: '1',
        contentDigest: 'sha256:baseline-1',
      },
    },
    package: { domainId: 'domain-a', packageId: 'pkg-a', domainIntelligenceContentDigest: 'sha256:di-1' },
    governance: {
      preChangeBaseline: {
        domainId: 'domain-a',
        governanceId: 'gov-a',
        schemaVersion: '1',
        contentDigest: 'sha256:baseline-0',
      },
      targetBaseline: {
        domainId: 'domain-a',
        governanceId: 'gov-a',
        schemaVersion: '1',
        contentDigest: 'sha256:baseline-1',
      },
      evaluatedUnder: {
        domainId: 'domain-a',
        governanceId: 'gov-a',
        schemaVersion: '1',
        contentDigest: 'sha256:baseline-0',
      },
    },
    evaluationId: 'eval-1',
    artifactVersion: '1.0.0',
  };
}

test('T-022 governance baseline store: body round-trip, conflict, and reopen durability', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-governance-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteGovernanceBaselineStore(first.db);
  const body = baselineBody('baseline-1');
  await store.putBody(body);
  await store.putBody(body); // idempotent same-content re-put
  assert.deepEqual(await store.getBody(body.identity), JSON.parse(JSON.stringify(body)));
  assert.equal(await store.getBody(baselineIdentity('sha256:absent')), undefined);
  await assert.rejects(
    () => store.putBody({ identity: body.identity, semantics: { marker: 'other' } }),
    expectContractError('GOVERNANCE_BODY_CONFLICT'),
  );
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteGovernanceBaselineStore(second.db);
  assert.deepEqual(await reopened.getBody(body.identity), JSON.parse(JSON.stringify(body)));
  await assert.rejects(
    () => reopened.putBody({ identity: body.identity, semantics: { marker: 'other' } }),
    expectContractError('GOVERNANCE_BODY_CONFLICT'),
  );
  second.close();
});

test('T-022 governance baseline store: retention reference lifecycle with tombstone durability', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-governance-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteGovernanceBaselineStore(first.db);
  const body = baselineBody('baseline-1');
  await store.putBody(body);

  const reference = auditReference('ref-b', body);
  await store.putReference(reference);
  await store.putReference(reference); // idempotent live re-put
  assert.deepEqual(await store.getReference('ref-b'), JSON.parse(JSON.stringify(reference)));
  assert.deepEqual(await store.getReference('ref-absent'), undefined);

  const earlier = auditReference('ref-a', body);
  await store.putReference(earlier);
  assert.deepEqual(
    (await store.listReferences(body.identity)).map((entry) => entry.referenceId),
    ['ref-a', 'ref-b'],
  );
  assert.deepEqual(await store.listReferences(baselineIdentity('sha256:absent')), []);

  // A reference requires the exact retained body to be present.
  const orphanBody = baselineBody('baseline-orphan');
  await assert.rejects(
    () => store.putReference(auditReference('ref-orphan', orphanBody)),
    expectContractError('MISSING_RETAINED_GOVERNANCE_BASELINE'),
  );

  // Conditional release with stale content fails closed while the reference is live.
  await assert.rejects(
    () => store.releaseReference({ ...reference, reason: 'validation' }),
    expectContractError('RETENTION_REFERENCE_CONFLICT'),
  );

  assert.equal(await store.releaseReference(reference), 'released');
  assert.equal(await store.getReference('ref-b'), undefined);
  assert.equal(await store.releaseReference(reference), 'absent'); // re-release
  assert.deepEqual(
    (await store.listReferences(body.identity)).map((entry) => entry.referenceId),
    ['ref-a'],
  );

  // A released referenceId cannot be reactivated with the same content...
  await assert.rejects(
    () => store.putReference(reference),
    expectContractError('RETENTION_REFERENCE_CONFLICT'),
  );
  // ...nor rebound with different content.
  await assert.rejects(
    () => store.putReference({ ...reference, reason: 'promotion' }),
    expectContractError('RETENTION_REFERENCE_CONFLICT'),
  );
  first.close();

  // The tombstone survives reopen on the real host.
  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteGovernanceBaselineStore(second.db);
  assert.equal(await reopened.getReference('ref-b'), undefined, 'released stays released');
  await assert.rejects(
    () => reopened.putReference(reference),
    expectContractError('RETENTION_REFERENCE_CONFLICT'),
  );
  await assert.rejects(
    () => reopened.putReference({ ...reference, reason: 'promotion' }),
    expectContractError('RETENTION_REFERENCE_CONFLICT'),
  );
  second.close();
});

test('T-022 governance baseline store: collectBodyIfUnreferenced honors live references', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-governance-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteGovernanceBaselineStore(first.db);
  const retained = baselineBody('baseline-retain');
  const free = baselineBody('baseline-free');
  await store.putBody(retained);
  await store.putBody(free);

  const reference = auditReference('ref-collect', retained);
  await store.putReference(reference);

  // Live reference blocks collection of exactly its own identity.
  assert.equal(await store.collectBodyIfUnreferenced(retained.identity), false);
  assert.notEqual(await store.getBody(retained.identity), undefined);
  assert.equal(await store.collectBodyIfUnreferenced(free.identity), true);
  assert.equal(await store.getBody(free.identity), undefined);
  assert.notEqual(await store.getBody(retained.identity), undefined, 'other bodies are untouched');

  assert.equal(await store.releaseReference(reference), 'released');
  assert.equal(await store.collectBodyIfUnreferenced(retained.identity), true);
  assert.equal(await store.getBody(retained.identity), undefined);

  // After collection the tombstone still blocks the old referenceId...
  await assert.rejects(
    () => store.putReference(reference),
    expectContractError('RETENTION_REFERENCE_CONFLICT'),
  );
  // ...and a brand-new referenceId fails closed on the missing body.
  await assert.rejects(
    () => store.putReference(auditReference('ref-after-collect', retained)),
    expectContractError('MISSING_RETAINED_GOVERNANCE_BASELINE'),
  );
  first.close();
});

test('T-022 domain activation authority: complete-tuple publication, replacement, reopen', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-activation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const authority = new NodeSqliteDomainActivationAuthority(first.db);
  assert.equal(await authority.readDomainActivationBinding('domain-a'), undefined);

  const initial = activationBinding({
    packageId: 'pkg-a',
    diDigest: 'sha256:di-1',
    baselineDigest: 'sha256:baseline-1',
  });
  await authority.publishDomainActivationBinding(initial);
  assert.deepEqual(await authority.readDomainActivationBinding('domain-a'), JSON.parse(JSON.stringify(initial)));

  // Movement: the replacement publishes the complete new tuple; the old tuple is gone.
  const moved = activationBinding({
    packageId: 'pkg-b',
    diDigest: 'sha256:di-2',
    baselineDigest: 'sha256:baseline-2',
  });
  await authority.publishDomainActivationBinding(moved);
  assert.deepEqual(await authority.readDomainActivationBinding('domain-a'), JSON.parse(JSON.stringify(moved)));
  assert.notDeepEqual(await authority.readDomainActivationBinding('domain-a'), JSON.parse(JSON.stringify(initial)));
  assert.equal(await authority.readDomainActivationBinding('domain-z'), undefined);
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteDomainActivationAuthority(second.db);
  assert.deepEqual(await reopened.readDomainActivationBinding('domain-a'), JSON.parse(JSON.stringify(moved)));
  second.close();
});

test('T-022 exact package/CDI authority: exact-tuple resolution and reopen durability', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-cdi-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const authority = new NodeSqliteExactPackageCdiAuthority(first.db);
  const binding = packageCdiBinding('sha256:di-1');
  assert.equal(await authority.resolveExactPackageCdi(binding), undefined);
  authority.registerExactPackageCdi(binding);
  authority.registerExactPackageCdi(binding); // idempotent exact-tuple re-register
  assert.deepEqual(await authority.resolveExactPackageCdi(binding), JSON.parse(JSON.stringify(binding)));
  assert.equal(await authority.resolveExactPackageCdi(packageCdiBinding('sha256:di-unknown')), undefined);
  assert.equal(await authority.resolveExactPackageCdi(packageCdiBinding('sha256:di-1', 'pkg-other')), undefined);
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteExactPackageCdiAuthority(second.db);
  assert.deepEqual(await reopened.resolveExactPackageCdi(binding), JSON.parse(JSON.stringify(binding)));
  second.close();
});

test('T-022 authority audit store: bind-once actionId semantics with reopen durability', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-audit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteAuthorityAuditStore(first.db);
  assert.equal(await store.getByActionId('action-1'), undefined);

  const record = auditRecord('action-1', 'sha256:audit-1');
  await store.put(record);
  assert.deepEqual(await store.getByActionId('action-1'), JSON.parse(JSON.stringify(record)));
  await assert.rejects(
    () => store.put(auditRecord('action-1', 'sha256:audit-1')),
    (error: unknown) =>
      expectAuthorityError('AUDIT_IDENTITY_CONFLICT')(error)
      && error instanceof Error
      && error.message === 'authority action action-1 is already bound to audit sha256:audit-1',
  );
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteAuthorityAuditStore(second.db);
  assert.deepEqual(await reopened.getByActionId('action-1'), JSON.parse(JSON.stringify(record)));
  second.close();
});
