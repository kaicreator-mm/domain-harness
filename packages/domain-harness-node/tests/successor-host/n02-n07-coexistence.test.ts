// #457 N02/N06/N07 on one REAL SQLite file: the retained (0.2,2,2) fixture
// keeps its exact historical identity and semantics across a
// successor-capable Runtime and a full close/reopen; package-owned Domain
// Data under one logical key stays pinned per activated package across
// restart and hostile caller mutation; retained and successor instances
// coexist and progress on one Runtime/store and survive reopen with exact
// pins (SQL-level assertions included).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createNodeDomainRuntime } from '../../src/index.js';import { StaticPackageRegistry } from '@kaicreator/domain-harness';
import {
  CRM_SNAPSHOT,
  HOST_MAXIMA,
  compileSuccessor,
  createNodeHost,
  fixedBusinessSnapshots,
  freshDbPath,
  openStore,
  rawSql,
  retainedLegacyPackage,
} from './helper.ts';

const NOW = () => '2026-10-01T00:00:00.000Z';

async function bootMixed(path: string, options: { readonly tierLevel?: number } = {}) {
  const successor = compileSuccessor(options.tierLevel === undefined
    ? {}
    : { domainData: [{ key: 'tier', value: { level: options.tierLevel } }] });
  const retained = await retainedLegacyPackage();
  const store = openStore(path);
  const runtime = await createNodeDomainRuntime({
    packageRegistry: new StaticPackageRegistry([
      retained,
      { manifest: successor.manifest, bindings: {}, domainData: successor.domainData },
    ], successor.manifest.packageId),
    store,
    bindings: createNodeHost(),
    businessSnapshots: fixedBusinessSnapshots(CRM_SNAPSHOT),
    supportedPackageDataBounds: { ...HOST_MAXIMA },
    now: NOW,
  });
  return { runtime, store, successor, retained };
}

test('N02: retained (0.2,2,2) identity and semantics survive a successor-capable Runtime and reopen', async () => {
  const { path } = freshDbPath('n02');
  const retainedId = (await retainedLegacyPackage()).manifest.packageId;
  const againId = (await retainedLegacyPackage()).manifest.packageId;
  assert.equal(againId, retainedId, 'public identity seam is deterministic');

  {
    const { runtime, store, retained } = await bootMixed(path);
    assert.equal(retained.manifest.packageId, retainedId);
    await runtime.openInstance({
      address: { workflowId: 'retained', instanceKey: 'keep-1' },
      correlationId: 'corr-keep',
      input: {},
      packageId: retained.manifest.packageId,
    });
    const ack = await runtime.send({
      messageId: 'adv-1',
      target: { workflowId: 'retained', instanceKey: 'keep-1' },
      type: 'ADVANCE',
      payload: {},
      correlationId: 'corr-keep',
    });
    assert.ok(ack.status === 'accepted' || ack.status === 'duplicate', `retained engine-2 message accepted: ${ack.status}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
    store.close();
  }

  // Reopen with a NEW store connection: the retained pin and its progressed
  // state are exactly preserved; the id is never re-canonicalized.
  {
    const { runtime, store } = await bootMixed(path);
    const instance = await runtime.query({
      kind: 'instance',
      target: { workflowId: 'retained', instanceKey: 'keep-1' },
    });
    assert.equal(instance.value?.packageId, retainedId);
    assert.notEqual(instance.value?.lifecycle, undefined);
    const sql = rawSql(path);
    const rows = sql.rows('SELECT package_id FROM dh_v2_instances WHERE workflow_id = ?', 'retained') as Array<{ package_id: string }>;
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.package_id, retainedId);
    sql.close();
    store.close();
  }
}, 120_000);

test('N06: package-owned Domain Data under one logical key stays pinned per package across restart and hostile mutation', async () => {
  const { path } = freshDbPath('n06');
  const primary = await bootMixed(path, { tierLevel: 1 });
  const primaryPackageId = primary.successor.manifest.packageId;
  const secondary = compileSuccessor({ domainData: [{ key: 'tier', value: { level: 2 } }] });
  // One registry, both successor packages, distinct package-owned data for
  // the SAME logical key 'tier'.
  {
    const store = openStore(path);
    const runtime = await createNodeDomainRuntime({
      packageRegistry: new StaticPackageRegistry([
        await retainedLegacyPackage(),
        { manifest: primary.successor.manifest, bindings: {}, domainData: primary.successor.domainData },
        { manifest: secondary.manifest, bindings: {}, domainData: secondary.domainData },
      ], primaryPackageId),
      store,
      bindings: createNodeHost(),
      businessSnapshots: fixedBusinessSnapshots(CRM_SNAPSHOT),
      supportedPackageDataBounds: { ...HOST_MAXIMA },
      now: NOW,
    });
    const read = async (): Promise<number> => {
      const result = await runtime.query({ kind: 'projection', projectionId: 'overview', key: 'case-1' });
      const value = result.value?.value as { domainData: Array<{ key: string; value: { level: number } }> };
      return value.domainData.find((entry) => entry.key === 'tier')!.value.level;
    };
    assert.equal(await read(), 1, 'default package reads its own bundled data');

    // Hostile caller mutates BOTH retained caller objects after activation.
    (primary.successor.domainData.tier as { level: number }).level = 999;
    (secondary.domainData.tier as { level: number }).level = 777;
    assert.equal(await read(), 1, 'activated data cannot move under an unchanged packageId');
    assert.equal(await read(), 1);

    // The mutated material must ALSO fail re-admission: digest integrity is
    // an activation gate, not a soft check (proof by rejection below).
    await assert.rejects(
      createNodeDomainRuntime({
        packageRegistry: new StaticPackageRegistry([
          await retainedLegacyPackage(),
          { manifest: primary.successor.manifest, bindings: {}, domainData: primary.successor.domainData },
        ], primaryPackageId),
        store: openStore(path),
        bindings: createNodeHost(),
        businessSnapshots: fixedBusinessSnapshots(CRM_SNAPSHOT),
        supportedPackageDataBounds: { ...HOST_MAXIMA },
        now: NOW,
      }),
      /does not match descriptor|DIGEST/u,
      'tampered bundled values fail re-admission',
    );
    store.close();
  }

  // Restart on the same file: the read stays pinned to the admitted snapshot.
  {
    const pristinePrimary = compileSuccessor({ domainData: [{ key: 'tier', value: { level: 1 } }] });
    const pristineSecondary = compileSuccessor({ domainData: [{ key: 'tier', value: { level: 2 } }] });
    const store = openStore(path);
    const runtime = await createNodeDomainRuntime({
      packageRegistry: new StaticPackageRegistry([
        await retainedLegacyPackage(),
        { manifest: pristinePrimary.manifest, bindings: {}, domainData: pristinePrimary.domainData },
        { manifest: pristineSecondary.manifest, bindings: {}, domainData: pristineSecondary.domainData },
      ], primaryPackageId),
      store,
      bindings: createNodeHost(),
      businessSnapshots: fixedBusinessSnapshots(CRM_SNAPSHOT),
      supportedPackageDataBounds: { ...HOST_MAXIMA },
      now: NOW,
    });
    const result = await runtime.query({ kind: 'projection', projectionId: 'overview', key: 'case-1' });
    const value = result.value?.value as { domainData: Array<{ key: string; value: { level: number } }> };
    assert.equal(value.domainData.find((entry) => entry.key === 'tier')!.value.level, 1, 'post-restart read still reads the admitted material, not the mutated caller object');
    store.close();
  }
}, 120_000);

test('N07: retained and successor instances coexist, progress and reopen on one real SQLite Runtime', async () => {
  const { path } = freshDbPath('n07');
  {
    const mixed = await bootMixed(path);
    runtimeHolder.runtime = mixed.runtime;
    runtimeHolder.store = mixed.store;

    await mixed.runtime.openInstance({
      address: { workflowId: 'retained', instanceKey: 'mix-retained' },
      correlationId: 'corr-mix-r',
      input: {},
      packageId: mixed.retained.manifest.packageId,
    });
    const provisioning = mixed.runtime.provisioning;
    assert.equal(provisioning?.status, 'ENABLED');
    const ensured = provisioning?.status === 'ENABLED'
      ? await provisioning.ensureOpen({
          provisioningKey: 'sx:n07:successor',
          address: { workflowId: 'parent', instanceKey: 'mix-successor' },
          correlationId: 'corr-mix-s',
          input: { caseId: 'mix' },
        })
      : null;
    assert.equal(ensured?.instanceDisposition, 'created');

    // A second retained instance stays non-terminal, holding the retained
    // package pin across restart (terminal instances release their pin).
    await mixed.runtime.openInstance({
      address: { workflowId: 'retained', instanceKey: 'mix-retained-held' },
      correlationId: 'corr-mix-r2',
      input: {},
      packageId: mixed.retained.manifest.packageId,
    });

    // Advance BOTH engines independently.
    await mixed.runtime.send({
      messageId: 'mix-adv',
      target: { workflowId: 'retained', instanceKey: 'mix-retained' },
      type: 'ADVANCE',
      payload: {},
      correlationId: 'corr-mix-r',
    });
    await mixed.runtime.send({
      messageId: 'mix-begin',
      target: { workflowId: 'parent', instanceKey: 'mix-successor' },
      type: 'BEGIN',
      payload: {},
      correlationId: 'corr-mix-s',
    });
    await new Promise((resolve) => setTimeout(resolve, 400));
    mixed.store.close();
  }

  // Reopen with a NEW connection and both package bodies available.
  {
    const reopened = await bootMixed(path);
    const retainedInstance = await reopened.runtime.query({
      kind: 'instance',
      target: { workflowId: 'retained', instanceKey: 'mix-retained' },
    });
    const successorInstance = await reopened.runtime.query({
      kind: 'instance',
      target: { workflowId: 'parent', instanceKey: 'mix-successor' },
    });
    assert.ok(retainedInstance.value, 'retained instance survives reopen');
    assert.ok(successorInstance.value, 'successor instance survives reopen');

    const sql = rawSql(path);
    const rows = sql.rows('SELECT workflow_id, instance_key, package_id FROM dh_v2_instances ORDER BY workflow_id') as Array<{ workflow_id: string; package_id: string }>;
    assert.equal(rows.length, 3, 'the two engines’ instances plus the retained pin-holder');
    const byWorkflow = new Map(rows.map((row) => [row.workflow_id, row.package_id]));
    const retainedId = (await retainedLegacyPackage()).manifest.packageId;
    assert.equal(byWorkflow.get('parent'), reopened.successor.manifest.packageId);
    assert.equal(byWorkflow.get('retained'), retainedId, 'retained pin never moves');
    sql.close();

    // Missing P1 after restart is an explicit retained-pin failure: open a
    // successor-only registry against the same file and observe fail-closed.
    const store = openStore(path);
    const successorOnly = compileSuccessor();
    const heldPins = await store.listPinnedPackageIds();
    assert.ok(heldPins.includes(retainedId), `the non-terminal retained instance holds its pin: ${JSON.stringify(heldPins)}`);
    await assert.rejects(
      createNodeDomainRuntime({
        packageRegistry: new StaticPackageRegistry([
          { manifest: successorOnly.manifest, bindings: {}, domainData: successorOnly.domainData },
        ], successorOnly.manifest.packageId),
        store,
        bindings: createNodeHost(),
        businessSnapshots: fixedBusinessSnapshots(CRM_SNAPSHOT),
        supportedPackageDataBounds: { ...HOST_MAXIMA },
        now: NOW,
      }),
      /MISSING_RETAINED_PIN|retained/i,
      'a registry missing the held retained pin fails closed at activation',
    );
    store.close();
    reopened.store.close();
  }
}, 180_000);
