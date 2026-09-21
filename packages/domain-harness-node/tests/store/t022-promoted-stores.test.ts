import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { PromotedArtifactContractError } from '@kaicreator/domain-harness';
import type {
  DynamicChildExecutionPin,
  PromotedArtifactAuthorityBinding,
  PromotedArtifactBody,
  PromotedArtifactIdentity,
  PromotedArtifactPromotionRecord,
  PromotedArtifactRetentionReference,
  PromotedArtifactRevocationRecord,
  PromotedArtifactVersionBinding,
} from '@kaicreator/domain-harness';
import {
  NodeSqliteDynamicChildPinStore,
  NodeSqlitePromotedArtifactStore,
} from '../../src/store/node-sqlite-promoted-stores.js';
import { openAuthorityTestDatabase } from './authority-test-helpers.js';

/* ------------------------------------------------------------------------ */
/* Fixtures: stores never recompute digests; sha256:-prefixed ids are enough. */
/* ------------------------------------------------------------------------ */

const AUTHORITY: PromotedArtifactAuthorityBinding = {
  domainId: 'domain-a',
  packageId: 'pkg-a',
  domainIntelligenceContentDigest: 'sha256:cdi-a',
  governanceBaseline: {
    domainId: 'domain-a',
    governanceId: 'gov-a',
    schemaVersion: '1',
    contentDigest: 'sha256:baseline-a',
  },
};

function identity(artifactId: string, contentDigest: string): PromotedArtifactIdentity {
  return { kind: 'promoted-subworkflow', artifactId, contentDigest };
}

function body(artifactId: string, contentDigest: string, marker: string): PromotedArtifactBody {
  return { identity: identity(artifactId, contentDigest), semanticMaterial: { marker } };
}

function promotion(
  recordId: string,
  artifact: PromotedArtifactIdentity,
  version: string,
): PromotedArtifactPromotionRecord {
  return {
    recordId,
    authorityRef: `authority:${recordId}`,
    recordedAt: '2026-01-01T00:00:00.000Z',
    artifact,
    version,
    sourceCandidate: {
      candidateKind: 'workflow',
      candidateId: `candidate:${artifact.artifactId}`,
      candidateContentDigest: `sha256:candidate:${recordId}`,
      validatorContractVersion: 'candidate-validator-v1',
      governanceBaseline: {
        schemaVersion: '1',
        contentDigest: 'sha256:baseline-a',
        domainId: 'domain-a',
        governanceId: 'gov-a',
      },
    },
    authorityBinding: AUTHORITY,
  };
}

function versionBinding(
  artifactId: string,
  version: string,
  artifact: PromotedArtifactIdentity,
): PromotedArtifactVersionBinding {
  return { artifactId, version, artifact };
}

function revocation(
  recordId: string,
  artifact: PromotedArtifactIdentity,
  reason: string,
): PromotedArtifactRevocationRecord {
  return {
    recordId,
    authorityRef: `authority:${recordId}`,
    recordedAt: '2026-01-01T00:00:00.000Z',
    reason,
    revocationPolicy: 'deny',
    cachePolicy: 'invalidate-produced-results',
    artifact,
  };
}

function retention(
  referenceId: string,
  artifact: PromotedArtifactIdentity,
): PromotedArtifactRetentionReference {
  return {
    referenceId,
    reason: 'recoverable-execution',
    artifact,
    authorityBinding: AUTHORITY,
  };
}

function pinFixture(pinnedAt: string, digest = 'sha256:child-1'): DynamicChildExecutionPin {
  return {
    slot: {
      target: { workflowId: 'wf-parent', instanceKey: 'inst-1' },
      parentActorId: 'actor-parent',
      childActorId: 'actor-child',
      invocationOrdinal: 1,
    },
    invokingPackageId: 'pkg-a',
    invokingAuthority: {
      domainId: 'domain-a',
      packageId: 'pkg-a',
      domainIntelligenceContentDigest: 'sha256:cdi-a',
      governanceBaseline: {
        domainId: 'domain-a',
        governanceId: 'gov-a',
        schemaVersion: '1',
        contentDigest: 'sha256:baseline-a',
      },
    },
    artifact: identity('child-artifact', digest),
    pinnedAt,
  };
}

function canonical(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

async function rejectsContractError(
  run: () => Promise<unknown>,
  code: string,
  messageIncludes?: string,
): Promise<void> {
  await assert.rejects(run, (error: unknown) => {
    assert.ok(error instanceof PromotedArtifactContractError, `expected PromotedArtifactContractError, got: ${String(error)}`);
    assert.equal(error.code, code);
    if (messageIncludes !== undefined) {
      assert.ok(
        error.message.includes(messageIncludes),
        `message did not include "${messageIncludes}": ${error.message}`,
      );
    }
    return true;
  });
}

/* ------------------------------------------------------------------------ */
/* Promoted artifact store                                                   */
/* ------------------------------------------------------------------------ */

test('T-022 promoted store: commitPromotion round-trip, multi-record ordering and durable reopen', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-promoted-body-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const art = identity('artifact-1', 'sha256:digest-1');
  const body1 = body('artifact-1', 'sha256:digest-1', 'alpha');
  const promotion1 = promotion('rec-1', art, '1.0.0');
  const version1 = versionBinding('artifact-1', '1.0.0', art);

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqlitePromotedArtifactStore(first.db);
  await store.commitPromotion(body1, promotion1, version1);
  await store.commitPromotion(body1, promotion1, version1); // idempotent same-content re-commit

  assert.deepEqual(await store.getBody(art), canonical(body1));
  assert.equal(await store.getBody(identity('artifact-1', 'sha256:missing')), undefined);
  assert.deepEqual(await store.getVersion('artifact-1', '1.0.0'), canonical(version1));
  assert.equal(await store.getVersion('artifact-1', '9.9.9'), undefined);

  // Two more promotion records for the same identity; insertion order differs
  // from canonical recordId order to prove the store sorts by recordId.
  const promotion2 = promotion('rec-2', art, '1.0.0');
  const promotion10 = promotion('rec-10', art, '1.0.0');
  await store.commitPromotion(body1, promotion2, version1);
  await store.commitPromotion(body1, promotion10, version1);
  assert.deepEqual(await store.getPromotionRecords(art), [
    canonical(promotion1),
    canonical(promotion10),
    canonical(promotion2),
  ]);
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqlitePromotedArtifactStore(second.db);
  assert.deepEqual(await reopened.getBody(art), canonical(body1));
  assert.deepEqual(await reopened.getVersion('artifact-1', '1.0.0'), canonical(version1));
  assert.deepEqual(await reopened.getPromotionRecords(art), [
    canonical(promotion1),
    canonical(promotion10),
    canonical(promotion2),
  ]);
  // Same-content re-commit after reopen stays idempotent (no fourth record).
  await reopened.commitPromotion(body1, promotion1, version1);
  assert.equal((await reopened.getPromotionRecords(art)).length, 3);
  second.close();
});

test('T-022 promoted store: commitPromotion fails closed on disagreement or rebinding, atomically', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-promoted-conflict-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const art = identity('artifact-1', 'sha256:digest-1');
  const otherDigest = identity('artifact-1', 'sha256:digest-2');
  const body1 = body('artifact-1', 'sha256:digest-1', 'alpha');
  const promotion1 = promotion('rec-1', art, '1.0.0');
  const version1 = versionBinding('artifact-1', '1.0.0', art);

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqlitePromotedArtifactStore(first.db);
  await store.commitPromotion(body1, promotion1, version1);

  // Identity disagreement: promotion evidence points at another digest.
  await rejectsContractError(
    () => store.commitPromotion(
      body1,
      promotion('rec-x', otherDigest, '1.0.0'),
      version1,
    ),
    'INVALID_PROMOTED_ARTIFACT',
    'promotion transaction identities do not agree',
  );
  // Identity disagreement: version binding points at another digest.
  await rejectsContractError(
    () => store.commitPromotion(body1, promotion1, versionBinding('artifact-1', '1.0.0', otherDigest)),
    'INVALID_PROMOTED_ARTIFACT',
  );
  // Identity disagreement: promotion version differs from the bound version.
  await rejectsContractError(
    () => store.commitPromotion(body1, promotion1, versionBinding('artifact-1', '2.0.0', art)),
    'INVALID_PROMOTED_ARTIFACT',
  );
  // Immutable body conflict: same identity, different semantic material.
  await rejectsContractError(
    () => store.commitPromotion(
      body('artifact-1', 'sha256:digest-1', 'beta'),
      promotion('rec-3', art, '1.0.0'),
      version1,
    ),
    'PROMOTED_ARTIFACT_BODY_CONFLICT',
    'immutable promoted body conflict',
  );
  // Version rebind: (artifactId, version) already bound to another exact digest.
  await rejectsContractError(
    () => store.commitPromotion(
      body('artifact-1', 'sha256:digest-2', 'alpha'),
      promotion('rec-4', otherDigest, '1.0.0'),
      versionBinding('artifact-1', '1.0.0', otherDigest),
    ),
    'PROMOTED_ARTIFACT_VERSION_REBIND',
  );
  // Promotion record rebind: an existing recordId under different content.
  const art2 = identity('artifact-2', 'sha256:digest-3');
  await rejectsContractError(
    () => store.commitPromotion(
      body('artifact-2', 'sha256:digest-3', 'alpha'),
      promotion('rec-1', art2, '1.0.0'),
      versionBinding('artifact-2', '1.0.0', art2),
    ),
    'PROMOTED_ARTIFACT_BODY_CONFLICT',
    'cannot be rebound',
  );

  // Nothing above partially committed.
  assert.equal(await store.getBody(art2), undefined, 'failed commit must not insert its body');
  assert.equal(await store.getVersion('artifact-2', '1.0.0'), undefined);
  assert.equal(await store.getVersion('artifact-1', '2.0.0'), undefined);
  assert.equal((await store.getPromotionRecords(art)).length, 1, 'failed commit must not add records');
  first.close();

  // Failure modes still hold after a durable reopen.
  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqlitePromotedArtifactStore(second.db);
  await rejectsContractError(
    () => reopened.commitPromotion(
      body('artifact-1', 'sha256:digest-1', 'beta'),
      promotion('rec-9', art, '1.0.0'),
      versionBinding('artifact-1', '1.0.0', art),
    ),
    'PROMOTED_ARTIFACT_BODY_CONFLICT',
  );
  second.close();
});

test('T-022 promoted store: alias CAS create, stale expectation, movement and reopen', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-promoted-alias-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const art = identity('artifact-1', 'sha256:digest-1');
  const otherArt = identity('artifact-2', 'sha256:digest-2');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqlitePromotedArtifactStore(first.db);

  const created = await store.putAlias({
    artifactId: 'artifact-1',
    alias: 'stable',
    artifact: art,
    expectedRevision: 0,
  });
  assert.deepEqual(created, { artifactId: 'artifact-1', alias: 'stable', artifact: art, revision: 1 });
  assert.deepEqual(await store.getAlias('artifact-1', 'stable'), created);

  // Stale expectation: revision moved to 1 already.
  await rejectsContractError(
    () => store.putAlias({ artifactId: 'artifact-1', alias: 'stable', artifact: art, expectedRevision: 0 }),
    'PROMOTED_ARTIFACT_STALE_SELECTION',
    'expected revision 0, current 1',
  );
  // Malformed expectations are rejected outright.
  await rejectsContractError(
    () => store.putAlias({ artifactId: 'artifact-1', alias: 'stable', artifact: art, expectedRevision: -1 }),
    'INVALID_PROMOTED_ARTIFACT',
  );
  await rejectsContractError(
    () => store.putAlias({ artifactId: 'artifact-1', alias: 'stable', artifact: art, expectedRevision: 1.5 }),
    'INVALID_PROMOTED_ARTIFACT',
  );

  // Movement with the current revision rebinds the alias and bumps to revision 2.
  const moved = await store.putAlias({
    artifactId: 'artifact-1',
    alias: 'stable',
    artifact: otherArt,
    expectedRevision: 1,
  });
  assert.equal(moved.revision, 2);
  assert.deepEqual(moved.artifact, otherArt);
  assert.deepEqual(await store.getAlias('artifact-1', 'stable'), moved);
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqlitePromotedArtifactStore(second.db);
  assert.deepEqual(await reopened.getAlias('artifact-1', 'stable'), moved);
  // Reopened revision persists for the next CAS step.
  const again = await reopened.putAlias({
    artifactId: 'artifact-1',
    alias: 'stable',
    artifact: art,
    expectedRevision: 2,
  });
  assert.equal(again.revision, 3);
  second.close();
});

test('T-022 promoted store: revocation idempotence, conflict and reopen', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-promoted-revocation-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const art = identity('artifact-1', 'sha256:digest-1');
  const record = revocation('rev-1', art, 'compromised');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqlitePromotedArtifactStore(first.db);
  await store.putRevocation(record);
  await store.putRevocation(record); // identical content is idempotent
  assert.deepEqual(await store.getRevocation(art), canonical(record));
  assert.equal(await store.getRevocation(identity('artifact-9', 'sha256:none')), undefined);

  await rejectsContractError(
    () => store.putRevocation(revocation('rev-2', art, 'other-reason')),
    'PROMOTED_ARTIFACT_REVOCATION_CONFLICT',
    'already has different revocation evidence',
  );
  assert.equal((await store.getRevocation(art))?.recordId, 'rev-1', 'conflict never overwrites');
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqlitePromotedArtifactStore(second.db);
  assert.deepEqual(await reopened.getRevocation(art), canonical(record));
  await rejectsContractError(
    () => reopened.putRevocation(revocation('rev-3', art, 'third-reason')),
    'PROMOTED_ARTIFACT_REVOCATION_CONFLICT',
  );
  second.close();
});

test('T-022 promoted store: retention bind, idempotence, release tombstone and stale-release fail closed', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-promoted-retention-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const art = identity('artifact-1', 'sha256:digest-1');
  const refA = retention('ref-a', art);
  const refB = retention('ref-b', art);

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqlitePromotedArtifactStore(first.db);
  await store.commitPromotion(
    body('artifact-1', 'sha256:digest-1', 'alpha'),
    promotion('rec-1', art, '1.0.0'),
    versionBinding('artifact-1', '1.0.0', art),
  );

  await store.putRetention(refB);
  await store.putRetention(refA);
  assert.deepEqual(await store.getRetention('ref-a'), canonical(refA));
  assert.deepEqual(await store.listRetentions(art), [canonical(refA), canonical(refB)]);
  await store.putRetention(refA); // same-content re-put is idempotent
  assert.equal((await store.listRetentions(art)).length, 2);

  // Live rebind with different content fails closed.
  await rejectsContractError(
    () => store.putRetention({ ...refA, reason: 'audit' }),
    'PROMOTED_ARTIFACT_RETENTION_REBIND',
    'cannot be rebound',
  );
  // Retention requires an existing promoted body.
  const ghost = identity('ghost', 'sha256:ghost');
  await rejectsContractError(
    () => store.putRetention(retention('ref-ghost', ghost)),
    'PROMOTED_ARTIFACT_NOT_FOUND',
    'cannot retain missing artifact ghost@sha256:ghost',
  );

  // Conditional release of an exact live reference.
  assert.equal(await store.releaseRetention(refA), 'released');
  assert.equal(await store.getRetention('ref-a'), undefined);
  assert.deepEqual(
    (await store.listRetentions(art)).map((reference) => reference.referenceId),
    ['ref-b'],
  );
  // Releasing an already-released matching reference is absent, not an error.
  assert.equal(await store.releaseRetention(refA), 'absent');
  // A released reference is tombstoned forever: re-binding fails closed.
  await rejectsContractError(
    () => store.putRetention(refA),
    'PROMOTED_ARTIFACT_RETENTION_REBIND',
    'tombstoned',
  );
  // Stale release against a live reference with changed content fails closed
  // and keeps the reference live.
  await rejectsContractError(
    () => store.releaseRetention({ ...refB, reason: 'audit' }),
    'PROMOTED_ARTIFACT_STALE_RELEASE',
    'changed before release',
  );
  assert.deepEqual(await store.getRetention('ref-b'), canonical(refB));
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqlitePromotedArtifactStore(second.db);
  assert.deepEqual(await reopened.getRetention('ref-b'), canonical(refB), 'live retention survives reopen');
  // The tombstone survives reopen: re-bind still fails, matching release is absent.
  await rejectsContractError(() => reopened.putRetention(refA), 'PROMOTED_ARTIFACT_RETENTION_REBIND');
  assert.equal(await reopened.releaseRetention(refA), 'absent');
  // A stale caller cannot turn a released tombstone into an apparent success.
  await rejectsContractError(
    () => reopened.releaseRetention({ ...refA, reason: 'audit' }),
    'PROMOTED_ARTIFACT_STALE_RELEASE',
    'does not match stale caller authority',
  );
  second.close();
});

/* ------------------------------------------------------------------------ */
/* Dynamic child pin store                                                   */
/* ------------------------------------------------------------------------ */

test('T-022 dynamic child pin store: insert-once semantics survive reopen on the real host', async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-child-pins-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, 'authority.sqlite');

  const pinA = pinFixture('2026-01-01T00:00:00.000Z');
  const pinAReplay = JSON.parse(JSON.stringify(pinA)) as DynamicChildExecutionPin;
  const pinConflict = pinFixture('2026-01-02T00:00:00.000Z');

  const first = openAuthorityTestDatabase(path);
  const store = new NodeSqliteDynamicChildPinStore(first.db);
  assert.equal(await store.get('slot-1'), undefined);

  assert.equal(await store.insertOnce('slot-1', pinA), 'inserted');
  // Identical replay through a JSON roundtrip (fresh object, same content).
  assert.equal(await store.insertOnce('slot-1', pinAReplay), 'existing');
  // A different exact child definition for the same slot conflicts and never overwrites.
  assert.equal(await store.insertOnce('slot-1', pinConflict), 'conflict');
  assert.deepEqual(await store.get('slot-1'), canonical(pinA), 'conflict leaves the pin untouched');

  // A distinct slot keys independently.
  assert.equal(await store.insertOnce('slot-2', pinConflict), 'inserted');
  first.close();

  const second = openAuthorityTestDatabase(path);
  const reopened = new NodeSqliteDynamicChildPinStore(second.db);
  assert.deepEqual(await reopened.get('slot-1'), canonical(pinA));
  assert.deepEqual(await reopened.get('slot-2'), canonical(pinConflict));
  assert.equal(await reopened.insertOnce('slot-1', pinConflict), 'conflict');
  assert.equal(await reopened.insertOnce('slot-1', JSON.parse(JSON.stringify(pinA))), 'existing');
  second.close();
});
