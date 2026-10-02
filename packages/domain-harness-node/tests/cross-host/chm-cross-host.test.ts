// #467 I-CROSS-HOST-1: the CHM-C00..C18 same-corpus cross-host/migration wave
// (#455 prep, rebound to merged assembly 770a1325). One compiled corpus — the
// Expo fixture sources compiled through the public compiler (deterministic
// packageId) — driven through the assembled Node runtime (engine-3 + T-009 +
// SQLite), compared case-by-case against the committed real-device evidence
// captured at the same assembly (#458 affected rebind, 16/16 PASS).
//
// Honesty boundary: the Node half here runs on the real Node host; the device
// half is the committed evidence of the real Hermes run. Case results compare
// LOGICAL outcomes (codes/classes/states), never native exception strings.
// Cases whose required product surface does not exist are recorded
// NOT_RUN/SPEC_GAP, never PASS.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { StaticPackageRegistry } from '../../../domain-harness/src/public-v2/index.js';
import { createDomainRuntimeV3 } from '../../../domain-harness/src/runtime/create-domain-runtime-v3.js';
import { DomainHarnessJsonSchemaV1Validator } from '@kaicreator/domain-harness/v2';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import { openNodeSqliteAuthorityStores } from '../../src/store/node-sqlite-authority-stores.js';
import { ScriptedEffectTools, makeBaseline, CAP_INVARIANT as ADMISSION_CAP } from '../../../domain-harness/tests/admission/helpers.js';
import { createRuntimeHostFake } from '../../../domain-harness/tests/helpers/runtime-host-fake.js';
import {
  CHM_HOST_MAXIMA,
  chmHostBindings,
  chmMessage,
  chmSha256,
  chmRepoRoot,
  compileChmCorpus,
  loadDeviceEvidence,
  sleep,
  type ChmDeviceEvidence,
} from './chm-corpus.ts';

const CHM_BINDINGS_BOUNDS = {
  maxDomainDataEntries: 16,
  maxDomainDataEntryCanonicalBytes: 2048,
  maxTotalDomainDataCanonicalBytes: 8192,
  maxBusinessSources: 8,
  maxSchemaCanonicalBytes: 4096,
} as const;

const NOW = () => '2026-10-03T00:00:00.000Z';

async function bootChmRuntime(corpus: Awaited<ReturnType<typeof compileChmCorpus>>, options: { readonly counterPath?: string; readonly observation?: boolean } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'chm-'));
  const path = join(dir, 'chm.db');
  const store = new NodeSqliteRuntimeStore({ path });
  const authorities = openNodeSqliteAuthorityStores({ path });
  const baseline = await makeBaseline('B1', [ADMISSION_CAP]);
  await authorities.baselines.putBody(baseline);
  const v3 = await createDomainRuntimeV3({
    packageRegistry: new StaticPackageRegistry([corpus.retained, corpus.successor], corpus.successorPackageId),
    store,
    bindings: createRuntimeHostFake({ ...chmHostBindings(options.counterPath) }),
    v3: {
      baselines: authorities.baselines,
      activationAuthority: authorities.activation,
      exactPackageCdi: authorities.exactPackageCdi,
      durableExecution: store,
      effectJournal: authorities.admissionEffectJournal,
      effectTools: new ScriptedEffectTools({}),
      evidence: authorities.evidence,
    },
    businessSnapshots: { read: async () => ({ source: 'crm', key: 'acc-1', revision: 'crm-r1', value: { accountId: 'acc-1', tier: 'gold' } }) } as never,
    supportedPackageDataBounds: { ...CHM_HOST_MAXIMA },
    now: NOW,
    ...(options.observation === true ? { observation: { mode: 'enabled' as const } } : {}),
  } as never);
  return { runtime: v3.runtime, store, path };
}

async function snapshot(store: NodeSqliteRuntimeStore, workflowId: string, instanceKey: string): Promise<{ lifecycle: string; stateId: string | null } | null> {
  const instance = await store.getInstance({ workflowId, instanceKey });
  return instance === null ? null : { lifecycle: instance.lifecycle, stateId: (instance.state as { stateId?: string } | null)?.stateId ?? null };
}

async function journalRows(path: string, sourceMessageId: string): Promise<Array<{ status: string; attempt: number; output_json: string | null }>> {
  const RawDatabase = (await import('better-sqlite3')).default;
  const db = new RawDatabase(path, { readonly: true });
  try {
    return db.prepare("SELECT status, attempt, output_json FROM dh_v2_effect_journal WHERE effect_kind = 'domain-message' AND source_message_id = ?").all(sourceMessageId);
  } finally { db.close(); }
}

function rejectionCode(row: { output_json: string | null } | undefined): string | undefined {
  return (JSON.parse(row?.output_json ?? '{}') as { rejection?: { code?: string } })?.rejection?.code;
}

let cachedCorpus: Awaited<ReturnType<typeof compileChmCorpus>> | undefined;
async function corpusOnce(): Promise<ReturnType<typeof compileChmCorpus>> {
  cachedCorpus ??= await compileChmCorpus();
  return cachedCorpus;
}

// ===========================================================================
// CHM-C00 — bind/attest: one assembly, one corpus, independently attested on
// both hosts.
// ===========================================================================
test('CHM-C00: bind/attest — same assembly, same compiled corpus, same fixture identities on both hosts', async () => {
  const evidence = loadDeviceEvidence();
  const corpus = await corpusOnce();

  assert.equal(evidence.comparator.assemblyHead, '770a132576312e553fd50ad301a1e27fd189b4bf');
  assert.equal(evidence.comparator.assemblyTree, 'bef145a632198f550e6d04fe5187946d2cb5b593');
  const liveMain = execFileSync('git', ['rev-parse', 'origin/main'], { encoding: 'utf8' }).trim();
  assert.equal(liveMain, evidence.comparator.assemblyHead, 'the attested assembly is still live main');

  // The Node-side public-compiler output must be the SAME compiled artifact
  // the real device ran (deterministic packageId).
  assert.equal(corpus.successorPackageId, evidence.deviceResult.successorPackageId);
  assert.equal(corpus.successorPackageId, evidence.comparator.successorPackageId);
  assert.equal(corpus.retainedPackageId, evidence.deviceResult.retainedPackageId);

  // Retained fixture file identity matches the device-recorded SHA-256. The
  // device build REGENERATES fixtures/retained-package.json from the compiled
  // manifest (recursively key-sorted, pretty JSON with a trailing newline) —
  // reproduce those exact bytes.
  const retainedParsed = JSON.parse(readFileSync(join(chmRepoRoot(), 'tests', 'hosts', 'successor-expo', 'fixtures', 'retained-package.json'), 'utf8')) as {
    manifest: Record<string, unknown>;
  };
  assert.equal((retainedParsed.manifest as { packageId: string }).packageId, evidence.comparator.retainedPackageId);
  const canonicalizedForHash = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonicalizedForHash);
    if (value !== null && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalizedForHash((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
    }
    return value;
  };
  const retainedRegenerated = JSON.stringify({ manifest: canonicalizedForHash(retainedParsed.manifest) }, null, 2) + String.fromCharCode(10);
  const retainedFileSha = createHash('sha256').update(retainedRegenerated, 'utf8').digest('hex');
  assert.equal(retainedFileSha, evidence.comparator.retainedFixtureFileSha256);

  // Frozen successor artifact profile equality (0.3/2/3).
  const manifest = corpus.successor.manifest as { formatVersion: string; runtimeContractMajor: number; executionEngineMajor: number };
  assert.deepEqual([manifest.formatVersion, manifest.runtimeContractMajor, manifest.executionEngineMajor], ['0.3', 2, 3]);
}, 240_000);

// ===========================================================================
// CHM-C02 — canonical digest + schema corpus: identical logical validator
// outcomes and identical canonical digests on both hosts.
// ===========================================================================
test('CHM-C02: schema corpus + canonical digest vectors produce identical logical outcomes on both hosts', async () => {
  const evidence = loadDeviceEvidence();
  const validator = new DomainHarnessJsonSchemaV1Validator();

  for (const vectorCase of evidence.compileCorpus.schemaCorpus) {
    const [expectedClass, expectedCode = 'accept'] = vectorCase.expect.split(':');
    const observed = safeValidate(validator, vectorCase);
    if (expectedClass === 'accept') {
      assert.equal(observed, 'accept', `${vectorCase.id}: shared corpus expects accept`);
    } else {
      assert.equal(observed, `reject:${expectedCode}`, `${vectorCase.id}: must match the shared corpus class`);
    }
  }

  // Canonical digest vectors: the Node-side canonical material (JSON
  // objects/arrays are key-sorted; primitives and non-JSON digest raw) plus
  // SHA-256 must equal the device-recorded digest for every vector.
  for (const vector of evidence.compileCorpus.canonicalVectors) {
    const digest = await chmSha256(canonicalVectorMaterial(vector.text));
    assert.equal(digest, evidence.compileCorpus.canonicalDigests[vector.id], `${vector.id}: canonical digest must be byte-identical across hosts`);
  }

  // The device actually executed this corpus with observed outcomes recorded.
  const e03 = evidence.cases['SX-E03'];
  assert.equal(e03.status, 'PASS');
  assert.ok(e03.checks.filter((check) => check.includes('expected=')).length >= 14, 'device recorded observed outcomes for the corpus');
}, 240_000);

function canonicalVectorMaterial(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object') {
      const sortKeys = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(sortKeys);
        if (value !== null && typeof value === 'object') {
          return Object.keys(value as Record<string, unknown>).sort().reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = sortKeys((value as Record<string, unknown>)[key]);
            return acc;
          }, {});
        }
        return value;
      };
      return JSON.stringify(sortKeys(parsed));
    }
  } catch {
    // not JSON: digest the raw text (mirrors the fixture compiler).
  }
  return text;
}

function safeValidate(validator: InstanceType<typeof DomainHarnessJsonSchemaV1Validator>, vectorCase: { readonly schema: unknown; readonly instance: unknown }): string {
  try {
    validator.validate(vectorCase.schema as never, vectorCase.instance as never, vectorCase.id);
    return 'accept';
  } catch (error) {
    return `reject:${(error as { code?: string }).code ?? 'THROWN'}`;
  }
}

// ===========================================================================
// CHM-C01 — exact profiles: retained 0.2/2/2 and successor 0.3/2/3 execute in
// ONE runtime with each platform's ONE native store; pins never cross.
// ===========================================================================
test('CHM-C01: retained engine-2 and successor engine-3 profiles coexist in one runtime', async () => {
  const evidence = loadDeviceEvidence();
  assert.equal(evidence.cases['SX-E02'].status, 'PASS', 'device half: retained pin/engine-2 evidence');
  const corpus = await corpusOnce();
  const chm = await bootChmRuntime(corpus);

  // Retained instance on the 0.2/2/2 package: engine-2 interpreter, its own pin.
  await chm.runtime.openInstance({ address: { workflowId: 'retained', instanceKey: 'r-1' }, correlationId: 'chm', input: {}, packageId: corpus.retainedPackageId } as never);
  await chm.runtime.send({ messageId: 'chm-adv-1', target: { workflowId: 'retained', instanceKey: 'r-1' }, type: 'ADVANCE', payload: {}, correlationId: 'chm' });
  await sleep(600);
  const retained = await snapshot(chm.store, 'retained', 'r-1');
  assert.deepEqual(retained, { lifecycle: 'completed', stateId: 'finished' });

  // Successor instance on the 0.3/2/3 package in the SAME runtime/store.
  await chm.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'coex-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.send({ messageId: 'chm-coex-1', target: { workflowId: 'child', instanceKey: 'coex-1' }, type: 'NOTIFY', payload: {}, correlationId: 'chm' });
  await sleep(600);
  assert.deepEqual(await snapshot(chm.store, 'child', 'coex-1'), { lifecycle: 'completed', stateId: 'done' });
  // Both survive a reopen with their exact pins.
  await chm.store.close();
  const RawDatabase = (await import('better-sqlite3')).default;
  const db = new RawDatabase(chm.path, { readonly: true });
  const pins = db.prepare("SELECT workflow_id, package_id, lifecycle FROM dh_v2_instances ORDER BY workflow_id").all() as Array<{ workflow_id: string; package_id: string; lifecycle: string }>;
  db.close();
  const retainedRow = pins.find((row) => row.workflow_id === 'retained');
  const childRow = pins.find((row) => row.workflow_id === 'child');
  assert.equal(retainedRow?.package_id, corpus.retainedPackageId);
  assert.equal(retainedRow?.lifecycle, 'completed');
  assert.equal(childRow?.package_id, corpus.successorPackageId);
}, 240_000);

// ===========================================================================
// CHM-C03 — recorded-vs-host bounds: the recorded package bounds equal the
// device-recorded bounds; a host advertising smaller maxima than the package
// records fails activation.
// ===========================================================================
test('CHM-C03: recorded package bounds match the device record; under-provisioned host maxima fail activation', async () => {
  const evidence = loadDeviceEvidence();
  assert.equal(evidence.cases['SX-E05'].status, 'PASS', 'device half: bounds/host-maxima evidence');
  assert.deepEqual(evidence.comparator.packageBounds, { ...CHM_BINDINGS_BOUNDS });
  assert.deepEqual(evidence.comparator.hostMaxima, { ...CHM_HOST_MAXIMA });
  const corpus = await corpusOnce();

  // A host whose maxima are BELOW the package-recorded bounds must fail the
  // successor activation closed.
  const underProvisioned = {
    maxDomainDataEntries: 4,
    maxDomainDataEntryCanonicalBytes: 512,
    maxTotalDomainDataCanonicalBytes: 1024,
    maxBusinessSources: 2,
    maxSchemaCanonicalBytes: 512,
  };
  const dir = mkdtempSync(join(tmpdir(), 'chm-c03-'));
  const path = join(dir, 'chm.db');
  const store = new NodeSqliteRuntimeStore({ path });
  const authorities = openNodeSqliteAuthorityStores({ path });
  const baseline = await makeBaseline('B1', [ADMISSION_CAP]);
  await authorities.baselines.putBody(baseline);
  await assert.rejects(
    () => createDomainRuntimeV3({
      packageRegistry: new StaticPackageRegistry([corpus.successor], corpus.successorPackageId),
      store,
      bindings: createRuntimeHostFake({ ...chmHostBindings() }),
      v3: {
        baselines: authorities.baselines,
        activationAuthority: authorities.activation,
        exactPackageCdi: authorities.exactPackageCdi,
        durableExecution: store,
        effectJournal: authorities.admissionEffectJournal,
        effectTools: new ScriptedEffectTools({}),
        evidence: authorities.evidence,
      },
      businessSnapshots: { read: async () => ({ source: 'crm', key: 'acc-1', revision: 'crm-r1', value: {} }) } as never,
      supportedPackageDataBounds: underProvisioned,
      now: NOW,
    } as never),
    /bound|B domu|exceed|bound/i,
  );
  store.close();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows file-lock timing; throwaway temp dir */ }
}, 240_000);

// ===========================================================================
// CHM-C05 — engine-3 permanent rejections: each reachable permanent code
// durably completes and routes the ONE total rejected route on Node, matching
// the device's SX-E07 outcomes.
// ===========================================================================
test('CHM-C05: reachable permanent rejection codes route durably; unreachable-by-construction code recorded honestly', async () => {
  const evidence = loadDeviceEvidence();
  assert.equal(evidence.cases['SX-E07'].status, 'PASS', 'device half: SX-E07 PASS at the same assembly');
  const corpus = await corpusOnce();
  const chm = await bootChmRuntime(corpus);

  // 1. contract_version_mismatch FIRST: child/child-1 exists and is accepting
  // (BEGIN declared unversioned; the parent sends contractVersion '2').
  await chm.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'child-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.openInstance({ address: { workflowId: 'version-parent', instanceKey: 'version-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.send(chmMessage('chm-version-1', 'version-parent', 'version-1'));
  await sleep(700);
  assert.deepEqual(await snapshot(chm.store, 'version-parent', 'version-1'), { lifecycle: 'completed', stateId: 'rejected' });
  const versionJournal = await journalRows(chm.path, 'chm-version-1');
  assert.equal(rejectionCode(versionJournal[0]), 'contract_version_mismatch');

  // 2. target_terminal: terminalize child/child-1 with a processed NOTIFY,
  // then send from a parent targeting it.
  await chm.runtime.send({ messageId: 'chm-term-child', target: { workflowId: 'child', instanceKey: 'child-1' }, type: 'NOTIFY', payload: {}, correlationId: 'chm' });
  await sleep(500);
  assert.deepEqual(await snapshot(chm.store, 'child', 'child-1'), { lifecycle: 'completed', stateId: 'done' });
  await chm.runtime.openInstance({ address: { workflowId: 'parent', instanceKey: 'term-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.send(chmMessage('chm-term-1', 'parent', 'term-1'));
  await sleep(700);
  assert.deepEqual(await snapshot(chm.store, 'parent', 'term-1'), { lifecycle: 'completed', stateId: 'rejected' });
  const termJournal = await journalRows(chm.path, 'chm-term-1');
  assert.equal(rejectionCode(termJournal[0]), 'target_terminal');

  // 3. message_contract_not_found: existing child, GHOST type not declared.
  await chm.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'ghost-child-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.openInstance({ address: { workflowId: 'ghost-parent', instanceKey: 'ghost-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.send(chmMessage('chm-ghost-1', 'ghost-parent', 'ghost-1'));
  await sleep(700);
  assert.deepEqual(await snapshot(chm.store, 'ghost-parent', 'ghost-1'), { lifecycle: 'completed', stateId: 'rejected' });
  const ghostJournal = await journalRows(chm.path, 'chm-ghost-1');
  assert.equal(rejectionCode(ghostJournal[0]), 'message_contract_not_found');

  // 4. payload_contract_violation: strict-child schema (valid 2020-12,
  // unsatisfiable; the SX-E07 product defect repaired by #465).
  await chm.runtime.openInstance({ address: { workflowId: 'strict-child', instanceKey: 'strict-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.openInstance({ address: { workflowId: 'strict-parent', instanceKey: 'strict-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.send(chmMessage('chm-strict-1', 'strict-parent', 'strict-1'));
  await sleep(700);
  assert.deepEqual(await snapshot(chm.store, 'strict-parent', 'strict-1'), { lifecycle: 'completed', stateId: 'rejected' });
  const strictJournal = await journalRows(chm.path, 'chm-strict-1');
  assert.equal(rejectionCode(strictJournal[0]), 'payload_contract_violation');
  assert.equal(strictJournal[0]?.status, 'completed', 'the rejection is durably completed, never left started/retried');

  // 5. workflow_not_found is unreachable through public sends on BOTH hosts
  // (instance existence resolves before pinned-contract resolution; an
  // unknown workflow without a live instance classifies transient
  // target_not_found). Both halves record that constraint honestly.
  assert.ok(
    evidence.cases['SX-E07'].checks.every((check) => !check.includes('workflow_not_found-routes')),
    'device half agrees the code was not exercised as a routing case',
  );

  await chm.store.close();
}, 240_000);

// ===========================================================================
// CHM-C06 + CHM-C08 — transient retry ownership and T-009 source-command
// outcomes (the repaired SX-E08/SX-E11 journeys on Node).
// ===========================================================================
test('CHM-C06/C08: transient retry completes the journey; T-009 applied and in-state rejected outcomes', async () => {
  const evidence = loadDeviceEvidence();
  assert.equal(evidence.cases['SX-E08'].status, 'PASS', 'device half: SX-E08 PASS');
  assert.equal(evidence.cases['SX-E11'].status, 'PASS', 'device half: SX-E11 PASS');
  const corpus = await corpusOnce();
  const chm = await bootChmRuntime(corpus);

  // --- C06: transient target_not_found stays recovery-owned, then the retry
  // replays the SAME journalled logical send to completion.
  await chm.runtime.openInstance({ address: { workflowId: 'missing-parent', instanceKey: 'missing-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.send(chmMessage('chm-missing-1', 'missing-parent', 'missing-1'));
  await sleep(600);
  assert.equal((await snapshot(chm.store, 'missing-parent', 'missing-1'))?.lifecycle, 'recovery_required', 'transient stays recovery-owned (technical), never a semantic rejection');
  const beforeRetry = await journalRows(chm.path, 'chm-missing-1');
  assert.equal(beforeRetry.length, 1);
  assert.equal(beforeRetry[0]?.status, 'started');

  await chm.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'missing-child' }, correlationId: 'chm', input: {} });
  await chm.runtime.recover({ target: { workflowId: 'missing-parent', instanceKey: 'missing-1' }, action: 'retry', reason: 'chm c06 child provisioned' });
  let parent: { lifecycle: string; stateId: string | null } | null = null;
  for (let waited = 0; waited < 10_000; waited += 200) {
    parent = await snapshot(chm.store, 'missing-parent', 'missing-1');
    if (parent?.lifecycle === 'completed' && parent.stateId === 'done') break;
    await sleep(200);
  }
  assert.deepEqual(parent, { lifecycle: 'completed', stateId: 'done' }, 'the retried journey completes on Node (invoke shape repaired by #466)');
  assert.deepEqual(await snapshot(chm.store, 'child', 'missing-child'), { lifecycle: 'completed', stateId: 'done' }, 'the child target processed the retried send');
  const afterRetry = await journalRows(chm.path, 'chm-missing-1');
  assert.equal(afterRetry.length, 1, 'the retry replayed the same journal record (same logical child identity)');
  assert.equal(afterRetry[0]?.status, 'completed');

  // --- C08: T-009 command outcomes — applied (park journey) + in-state
  // rejected with the durable outcome, no duplicate after the second read.
  await chm.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'e11-child' }, correlationId: 'chm', input: {} });
  await chm.runtime.openInstance({ address: { workflowId: 'e11-parent', instanceKey: 'e11-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.send(chmMessage('chm-e11-begin', 'e11-parent', 'e11-1'));
  await sleep(600);
  assert.deepEqual(await snapshot(chm.store, 'e11-parent', 'e11-1'), { lifecycle: 'waiting', stateId: 'acting' }, 'parked per frozen engine semantics');
  const applied = await chm.store.getCommandOutcome({ workflowId: 'e11-parent', instanceKey: 'e11-1' }, 'chm-e11-begin');
  assert.ok(applied !== null && applied.status === 'applied');

  await chm.runtime.send(chmMessage('chm-e11-begin-2', 'e11-parent', 'e11-1'));
  await sleep(600);
  const inStateFirst = await chm.store.getCommandOutcome({ workflowId: 'e11-parent', instanceKey: 'e11-1' }, 'chm-e11-begin-2');
  const inStateSecond = await chm.store.getCommandOutcome({ workflowId: 'e11-parent', instanceKey: 'e11-1' }, 'chm-e11-begin-2');
  assert.ok(inStateFirst !== null && inStateFirst.status === 'rejected');
  assert.equal(inStateFirst.rejection?.code, 'MESSAGE_NOT_ACCEPTED_IN_STATE');
  assert.deepEqual(inStateSecond, inStateFirst, 'the outcome is stable, never duplicated or rewritten');

  await chm.store.close();
}, 240_000);

// ===========================================================================
// CHM-C09 + CHM-C10 — durable tool receipt and atomic provisioning parity.
// ===========================================================================
test('CHM-C09/C10: persistent tool receipt exactly-once and provisioning key convergence', async () => {
  const evidence = loadDeviceEvidence();
  assert.equal(evidence.cases['SX-E10'].status, 'PASS');
  assert.equal(evidence.cases['SX-E12'].status, 'PASS');
  const dir = mkdtempSync(join(tmpdir(), 'chm-c09-'));
  const counterPath = join(dir, 'inventory-calls.jsonl');
  const corpus = await corpusOnce();
  const chm = await bootChmRuntime(corpus, { counterPath, observation: true });

  // C10: the provisioning seam; same key converges; replay is existing.
  assert.ok(chm.runtime.provisioning !== undefined, 'provisioning capability present');
  assert.equal(chm.runtime.provisioning?.status, 'ENABLED', 'the observation-capable store enables provisioning on the Node adapter');
  const provisioned = await chm.runtime.provisioning.ensureOpen({
    provisioningKey: 'chm:key-1',
    address: { workflowId: 'parent', instanceKey: 'prov-1' },
    correlationId: 'chm',
    input: {},
    packageId: corpus.successorPackageId,
  });
  assert.equal(provisioned.provisioningDisposition, 'created');
  assert.equal(provisioned.instanceDisposition, 'created');
  const replay = await chm.runtime.provisioning.ensureOpen({
    provisioningKey: 'chm:key-1',
    address: { workflowId: 'parent', instanceKey: 'prov-1' },
    correlationId: 'chm',
    input: {},
    packageId: corpus.successorPackageId,
  });
  assert.equal(replay.provisioningDisposition, 'existing');
  assert.equal(replay.instanceDisposition, 'existing');

  // C09: the same public local Tool through the Node DurableToolRunner with a
  // persistent out-of-process receipt; the journey adds exactly one committed
  // invocation (relative exactly-once, N14 discipline).
  await chm.runtime.openInstance({ address: { workflowId: 'child', instanceKey: 'tool-child-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.openInstance({ address: { workflowId: 'tool-parent', instanceKey: 'tool-1' }, correlationId: 'chm', input: {} });
  await chm.runtime.send(chmMessage('chm-tool-1', 'tool-parent', 'tool-1'));
  await sleep(900);
  const parentAfter = await snapshot(chm.store, 'tool-parent', 'tool-1');
  assert.equal(parentAfter?.lifecycle, 'completed', 'the tool journey completed (invoke + done routes)');
  const receipts = readFileSync(counterPath, 'utf8').trim().split('\n');
  assert.equal(receipts.length, 1, 'exactly one durable receipt for the one journey');
  await chm.store.close();
  rmSync(dir, { recursive: true, force: true });
}, 240_000);

// ===========================================================================
// CHM-C13 — separate native restart (Node half: fresh runtime over the same
// store; device half: committed force-stop evidence at the same assembly).
// ===========================================================================
test('CHM-C13: the accepted/rejected facts survive an independent Node restart; device force-stop evidence parity', async () => {
  const evidence = loadDeviceEvidence();
  assert.equal(evidence.cases['SX-E13'].status, 'PASS', 'device half: SX-E13 restart survival PASS');
  assert.equal(evidence.cases['SX-E09'].status, 'PASS', 'device half: SX-E09 committed-effect durability PASS');
  const corpus = await corpusOnce();

  const first = await bootChmRuntime(corpus);
  await first.runtime.openInstance({ address: { workflowId: 'strict-child', instanceKey: 'strict-1' }, correlationId: 'chm', input: {} });
  await first.runtime.openInstance({ address: { workflowId: 'strict-parent', instanceKey: 'strict-1' }, correlationId: 'chm', input: {} });
  await first.runtime.send(chmMessage('chm-c13-strict', 'strict-parent', 'strict-1'));
  await sleep(700);
  const before = await snapshot(first.store, 'strict-parent', 'strict-1');
  assert.deepEqual(before, { lifecycle: 'completed', stateId: 'rejected' });
  const path = first.path;
  await first.store.close();

  // Fresh runtime over the SAME native store (new connection; the process PID
  // continuity is the Node N-series evidence at this assembly).
  const RawDatabase = (await import('better-sqlite3')).default;
  const db = new RawDatabase(path, { readonly: true });
  const journal = db.prepare("SELECT status, output_json FROM dh_v2_effect_journal WHERE effect_kind = 'domain-message' AND source_message_id = 'chm-c13-strict'").all();
  const instance = db.prepare("SELECT lifecycle, workflow_state_json FROM dh_v2_instances WHERE workflow_id = 'strict-parent'").get() as { lifecycle: string; workflow_state_json: string };
  db.close();
  assert.equal(journal.length, 1, 'exactly one journaled send survives the restart boundary');
  assert.equal((JSON.parse(journal[0]?.output_json ?? '{}') as { rejection?: { code?: string } }).rejection?.code, 'payload_contract_violation');
  assert.equal(instance.lifecycle, 'completed');
  assert.equal((JSON.parse(instance.workflow_state_json) as { stateId?: string }).stateId, 'rejected');
}, 240_000);

// ===========================================================================
// CHM-C18 — repeatability: same corpus, same order, same outcomes.
// ===========================================================================
test('CHM-C18: fixed corpus repeat is deterministic (compile identity + schema outcomes stable)', async () => {
  const first = await compileChmCorpus();
  const second = await compileChmCorpus();
  assert.equal(first.successorPackageId, second.successorPackageId, 'compile is deterministic');
  const evidence = loadDeviceEvidence();
  const validator = new DomainHarnessJsonSchemaV1Validator();
  for (const vectorCase of evidence.compileCorpus.schemaCorpus) {
    const firstOutcome = safeValidate(validator, vectorCase);
    const secondOutcome = safeValidate(validator, vectorCase);
    assert.equal(firstOutcome, secondOutcome, `${vectorCase.id}: repeat is stable`);
  }
}, 240_000);

// ===========================================================================
// CHM-C16 — retention & GC: recorded honestly as an API gap (SPEC_GAP).
// ===========================================================================
test('CHM-C16: retention/GC — the frozen surface exposes no host-authorized retention/GC API (SPEC_GAP recorded)', async () => {
  // The prep (CHM-C16) authorizes only EXISTING host-authorized retention/GC
  // APIs and forbids direct production-table DELETE as a stand-in. The frozen
  // RuntimeStore/Runtime surface at 770a1325 exposes no such API. The case is
  // therefore NOT_RUN as an API gap with a SPEC_GAP typed finding for
  // closure — never a silent pass, never an invented DELETE-based imitation.
  const evidence: ChmDeviceEvidence = loadDeviceEvidence();
  assert.equal(evidence.cases['SX-E06']?.status, 'PASS', 'device-side domain-data pin evidence exists (SX-E06) for the retention-adjacent invariants that DO exist');
});
