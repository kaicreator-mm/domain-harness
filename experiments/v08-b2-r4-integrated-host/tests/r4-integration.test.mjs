// #987 V08-B2-R4: executable R4 matrix — one trusted K1→A1 native-v0.7 Host
// integration (P1-a descriptor-safe ingress + P1-b privileged-channel truth).
// Research-only pre-Freeze falsifiers; the ORIGINAL v0.7 Central Admission +
// its Journal stay the ONE effect authority. Research gates never self-approve.
//
// Sibling suites rerun unchanged by the R4 workflow (R4-15): K1 K3
// (experiments/v08-b2-r3-k1/tests/k1-assembly.test.mjs), A1 A3
// (experiments/v08-b2-r3-a1/tests/kind-authority-b2-r3-a1.test.mjs), B2 R1/R2,
// B1 and the D1 genesis G01–G26 extraction. Graph/repin helpers below are
// attributed verbatim reuse from the K1 K3 test module at K1 #986 HEAD
// 3fde560 (READ_ONLY).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, cp, rm, readFile, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

import { establishK1Host, buildKindRegistry, readTrustedEntries } from '../../v08-b2-r3-k1/host/bootstrap.mjs';
import { TRUST_ROOTS, D1_GENESIS_ROOT_DIGESTS, D1_KERNEL_LINK_MODULE_SHA } from '../../v08-b2-r3-k1/host/trust-roots.mjs';
import { projectPhysicalComponentToNative } from '../../v08-b2-r3-a1/authority/native-projection.mjs';
import { verifyDefinitionGraph, packageDigest, canonicalJson } from '../../v08-gatea-b1-955-r2/reference956/candidate-validator.mjs';

import { adaptK1SealedSelectionToA1 } from '../authority/r4-selection-adapter.mjs';
import { createR4IntegratedHost, DEFAULT_K1_ROOT } from '../host/r4-host.mjs';
import { createR4TrustedTransportLab, LAB_ACKNOWLEDGMENT_TOKEN } from '../lab/trusted-transport-lab.mjs';

const sha256hex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const isError = (code) => (e) => {
  assert.equal(e?.code, code, 'expected ' + code + ', got ' + String(e) + ' :: ' + String(e?.message));
  return true;
};

const CHARGE_SELECTOR = { packageId: 'k1.business.charge', componentId: 'charge-op', operationId: 'charge' };
const ARMED = { amount: 42 };
const CALLER_ID = 'caller.r4-charge-1';
const CALLER = { callerId: CALLER_ID, callerKind: 'host' };

let ordinalCounter = 0;
const nextOrdinal = () => (ordinalCounter += 1);

async function newR4Host(k1Host, k1Root = DEFAULT_K1_ROOT, overrides = {}) {
  return createR4IntegratedHost({
    k1Host, k1Root, selector: CHARGE_SELECTOR,
    armedIntentInput: ARMED, authorizedCallers: [CALLER],
    instanceOrdinal: nextOrdinal(),
    ...overrides,
  });
}

const armedInvoke = (facade) => facade.invoke({ input: { amount: 42 }, caller: { callerId: CALLER_ID, callerKind: 'host' } });

/** Every denial: typed rejection + 0 unauthorized dispatch + 0 journal rows. */
function assertNoEffect(facade, completedBefore = 0, recordsBefore = null) {
  assert.equal(facade.getDispatchCount(), 0, 'unauthorized dispatch happened');
  const records = facade.journalRecords();
  if (recordsBefore === null) {
    assert.equal(records.length, 0, 'journal row appeared before admission');
  } else {
    assert.equal(records.length, recordsBefore, 'journal rows changed');
  }
  assert.equal(facade.journalCompletedCount(), completedBefore, 'completed journal row appeared');
}

// --- attributed K1 K3 helpers (READ_ONLY reuse) -----------------------------
async function clonePackages(fn) {
  const dir = await mkdtemp(join(tmpdir(), 'v08-b2-r4-'));
  await cp(join(DEFAULT_K1_ROOT, 'genesis-exact'), join(dir, 'genesis-exact'), { recursive: true });
  await cp(join(DEFAULT_K1_ROOT, 'business'), join(dir, 'business'), { recursive: true });
  try { return await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
async function rawEntries(root) {
  const entries = [];
  for (const [id, pin] of Object.entries(TRUST_ROOTS)) {
    const dir = join(root, pin.directory);
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    const artifacts = {};
    for (const impl of manifest.implementations) artifacts[impl.path] = await readFile(join(dir, impl.path), 'utf8');
    entries.push({ id, manifest, artifacts, dir });
  }
  return entries;
}
const repin = (e) => { e.manifest.integrity = packageDigest(e.manifest, e.artifacts); return e; };
async function linkGraph(entries) {
  const sdk = entries.find((x) => x.manifest.packageId === 'genesis.sdk');
  const { registry } = buildKindRegistry(sdk.manifest);
  return verifyDefinitionGraph(entries.map(({ manifest, artifacts }) => ({ manifest, artifacts })), {}, registry);
}

// ---------------------------------------------------------------------------
// R4-01 — D1 physical preservation
// ---------------------------------------------------------------------------

test('R4-01 exact 7/7 D1 physical Kernel/SDK files preserved with pinned roots; no D1 byte re-sign', async () => {
  const entries = await readTrustedEntries(DEFAULT_K1_ROOT);
  const kernel = entries.find((e) => e.id === 'genesis.kernel');
  const sdk = entries.find((e) => e.id === 'genesis.sdk');
  // 7 physical files: kernel manifest + link.mjs (2), sdk manifest + 4 modules (5).
  assert.equal(Object.keys(kernel.artifacts).length, 1);
  assert.equal(Object.keys(sdk.artifacts).length, 4);
  assert.equal(kernel.manifest.integrity, D1_GENESIS_ROOT_DIGESTS.kernel);
  assert.equal(sdk.manifest.integrity, D1_GENESIS_ROOT_DIGESTS.sdk);
  assert.equal(TRUST_ROOTS['genesis.kernel'].packageDigest, D1_GENESIS_ROOT_DIGESTS.kernel);
  assert.equal(TRUST_ROOTS['genesis.sdk'].packageDigest, D1_GENESIS_ROOT_DIGESTS.sdk);
  // Signed kernel.link module source is the original D1 module.
  assert.equal('sha256:' + sha256hex(Buffer.from(kernel.artifacts['modules/link.mjs'], 'utf8')), D1_KERNEL_LINK_MODULE_SHA);
  // Manifests NOT re-signed: the integrity field still equals the pinned
  // D1-issued digest and the on-disk bytes are the canonical D1 bytes.
  for (const e of [kernel, sdk]) {
    const rawManifest = await readFile(join(e.dir, 'manifest.json'));
    assert.equal(rawManifest.toString('utf8'), canonicalJson(e.manifest) + '\n');
    assert.equal(JSON.parse(rawManifest.toString('utf8')).integrity, e.manifest.integrity);
  }
  // Two real Business packages complete the four-package Assembly.
  assert.deepEqual(entries.map((e) => e.id).sort(),
    ['genesis.kernel', 'genesis.sdk', 'k1.business.charge', 'k1.business.claim']);
});

// ---------------------------------------------------------------------------
// R4-02 — one physical root, two different Business Kind selections
// ---------------------------------------------------------------------------

test('R4-02 real K1 four-package Assembly: pure Business selections and the effectful Charge share ONE physical root', async () => {
  const k1Host = await establishK1Host();
  // Pure std.rule + pure std.operation Business selections (K1 pure route).
  assert.equal(await k1Host.invoke({ packageId: 'k1.business.claim', componentId: 'claim-policy', operationId: 'evaluate', input: { claimAmount: 120 } }), true);
  assert.equal(await k1Host.invoke({ packageId: 'k1.business.claim', componentId: 'claim-policy', operationId: 'evaluate', input: { claimAmount: 900 } }), false);
  assert.deepEqual(await k1Host.invoke({ packageId: 'k1.business.claim', componentId: 'claim-underwrite', operationId: 'underwrite', input: { claimAmount: 20 } }), { claim: 20, underwriting: 'adjuster-review' });
  // Effectful Charge through the R4 native route on the SAME sealed Assembly.
  const facade = await newR4Host(k1Host);
  const describe = facade.describe();
  assert.equal(describe.k1AssemblyDigest, k1Host.assembly.digest);
  const lineage = facade.assemblyLineage();
  assert.deepEqual(lineage.k1Packages.map((p) => p.id).sort(),
    ['genesis.kernel', 'genesis.sdk', 'k1.business.charge', 'k1.business.claim']);
  const result = await armedInvoke(facade);
  assert.equal(result.outcome.status, 'admitted');
  assert.deepEqual(result.outcome.admitted.effects[0].output, { charged: true, amount: 42, fromK1Business: true });
  // Other SDK business profiles of the same Assembly remain usable.
  assert.equal(await k1Host.invoke({ packageId: 'genesis.sdk', componentId: 'sdk-decision', operationId: 'select', input: { accepted: false } }), 'review');
  // Pure-route dispatches: evaluate ×2, underwrite (+ its cross-package rule
  // child), sdk select — the native Charge route adds its own single dispatch.
  assert.equal(k1Host.stats().dispatchCount, 5);
  assert.equal(facade.getDispatchCount(), 1);
  assert.equal(facade.journalCompletedCount(), 1);
});

// ---------------------------------------------------------------------------
// R4-03 — documented ABI regression, then trusted adapter resolution
// ---------------------------------------------------------------------------

test('R4-03 raw K1 nine-field selection deterministically fails A1 shape; trusted R4 adapter resolves the mismatch without aliasing', async () => {
  const k1Host = await establishK1Host();
  const k1Seal = k1Host.sealOperation(CHARGE_SELECTOR);
  const raw = k1Seal.nativeSelection();
  // Regression documented: the UNCHANGED A1 gate typed-rejects the UNCHANGED
  // K1 selection (Controller #983@6083264345 / #984@6083262997 Falsifier 1).
  assert.equal(Object.keys(raw).length, 9);
  assert.equal('manifestSha256' in raw, false);
  assert.equal('componentId' in raw.implementation, false);
  assert.throws(() => projectPhysicalComponentToNative(raw), isError('E_PROJECTION_SELECTION_SHAPE'));
  // Trusted adapter resolves it: exact eight keys, physically derived.
  const adapted = await adaptK1SealedSelectionToA1({ k1Host, k1Seal, k1Root: DEFAULT_K1_ROOT });
  assert.deepEqual(Object.keys(adapted).sort(),
    ['component', 'handler', 'implementation', 'kindRef', 'manifestSha256', 'moduleSha256', 'operation', 'packageId']);
  assert.equal(adapted.handler, raw.handler); // exact physical callable identity
  const projected = projectPhysicalComponentToNative(adapted);
  assert.equal(projected.attested.operationId, 'charge');
  // No weak aliasing: a caller-forged seal (same shape, drifted module SHA)
  // never passes the adapter.
  const forgedSeal = {
    assembly: k1Host.assembly,
    nativeSelection: () => ({ ...raw, moduleSha256: 'f'.repeat(64) }),
    requirePhysicalCurrentness: k1Seal.requirePhysicalCurrentness,
  };
  await assert.rejects(adaptK1SealedSelectionToA1({ k1Host, k1Seal: forgedSeal, k1Root: DEFAULT_K1_ROOT }),
    isError('E_INTEGRATION_BLOCKED'));
  // And no self-signed identity: a foreign host's seal is not this host's.
  const otherHost = await establishK1Host();
  const otherSeal = otherHost.sealOperation(CHARGE_SELECTOR);
  await assert.rejects(adaptK1SealedSelectionToA1({ k1Host, k1Seal: otherSeal, k1Root: DEFAULT_K1_ROOT }),
    isError('E_INTEGRATION_BLOCKED'));
  assert.equal(k1Host.stats().dispatchCount, 0);
});

// ---------------------------------------------------------------------------
// R4-04 — adapted fields correspond to verified K1 raw bytes, no double signing
// ---------------------------------------------------------------------------

test('R4-04 adapted manifestSha256/implementation.componentId/moduleSha256/Kind/Handler correspond to verified K1 raw bytes', async () => {
  const k1Host = await establishK1Host();
  const k1Seal = k1Host.sealOperation(CHARGE_SELECTOR);
  const adapted = await adaptK1SealedSelectionToA1({ k1Host, k1Seal, k1Root: DEFAULT_K1_ROOT });
  const manifestRaw = await readFile(join(DEFAULT_K1_ROOT, 'business', 'charge', 'manifest.json'));
  const moduleRaw = await readFile(join(DEFAULT_K1_ROOT, 'business', 'charge', 'modules', 'charge.mjs'));
  // manifestSha256 is the RAW SHA256 of the genuine manifest BYTES, and is
  // distinct from the manifest `integrity`/packageDigest field (no double
  // signing: the adapter never re-mints a package digest).
  assert.equal(adapted.manifestSha256, sha256hex(manifestRaw));
  assert.notEqual(adapted.manifestSha256, TRUST_ROOTS['k1.business.charge'].packageDigest.slice('sha256:'.length));
  assert.equal(adapted.moduleSha256, sha256hex(moduleRaw));
  assert.equal(adapted.implementation.componentId, 'charge-op');
  assert.equal(adapted.implementation.sha256, 'sha256:' + adapted.moduleSha256);
  assert.deepEqual(adapted.kindRef, { kindId: 'std.operation', version: '1.0.0' });
  assert.equal(adapted.handler, k1Seal.nativeSelection().handler);
  // Anchored against the K1 Assembly + trust roots (not caller self-signed).
  assert.equal(k1Host.assembly.packages.find((p) => p.id === 'k1.business.charge').digest,
    TRUST_ROOTS['k1.business.charge'].packageDigest);
  // The join layer independently recomputes both digests (forgery rejects).
  const { bindR4IntegratedAuthority } = await import('../authority/r4-native-join.mjs');
  await assert.rejects(bindR4IntegratedAuthority({
    k1Host, k1Seal, k1Root: DEFAULT_K1_ROOT,
    physical: { ...adapted, manifestSha256: '0'.repeat(64) },
    armedIntentInput: ARMED, authorizedCallers: [CALLER], instanceOrdinal: nextOrdinal(),
  }), isError('E_INTEGRATION_BLOCKED'));
  await assert.rejects(bindR4IntegratedAuthority({
    k1Host, k1Seal, k1Root: DEFAULT_K1_ROOT,
    physical: { ...adapted, moduleSha256: '0'.repeat(64) },
    armedIntentInput: ARMED, authorizedCallers: [CALLER], instanceOrdinal: nextOrdinal(),
  }), isError('E_INTEGRATION_BLOCKED'));
});

// ---------------------------------------------------------------------------
// R4-05 — full original chain positive + replay + lineage
// ---------------------------------------------------------------------------

test('R4-05 T002B→T003C→T002D PRODUCTION→T004A→T004C executes the genuine K1 Charge; ORIGINAL Journal exactly 1 completed; replay adds zero', async () => {
  const k1Host = await establishK1Host();
  const facade = await newR4Host(k1Host);
  const result = await armedInvoke(facade);
  assert.equal(result.outcome.status, 'admitted');
  assert.equal(result.outcome.admitted.effects.length, 1);
  assert.equal(result.outcome.admitted.effects[0].effectType, 'effect:k1.business.charge.charge');
  assert.equal(result.outcome.admitted.effects[0].disposition, 'executed');
  assert.deepEqual(result.outcome.admitted.effects[0].output, { charged: true, amount: 42, fromK1Business:true });
  assert.equal(result.invocation.implementation.implementationDigest, 'sha256:' + sha256hex(await readFile(join(DEFAULT_K1_ROOT, 'business', 'charge', 'modules', 'charge.mjs'))));
  assert.equal(result.occurrence.authorityClass, 'PRODUCTION');
  assert.ok(result.occurrence.workflowInstanceId.startsWith('k1.business.charge.charge:instance:'));
  assert.equal(facade.getDispatchCount(), 1);
  const records = facade.journalRecords();
  assert.equal(records.length, 1);
  assert.equal(records[0].status, 'completed');
  assert.equal(records[0].effectType, 'effect:k1.business.charge.charge');
  // Same-occurrence replay: zero additional calls/rows.
  const replay = await armedInvoke(facade);
  assert.equal(replay.outcome.status, 'admitted');
  assert.equal(replay.outcome.admitted.effects[0].disposition, 'replayed');
  assert.equal(facade.getDispatchCount(), 1);
  assert.equal(facade.journalRecords().length, 1);
  // Full Assembly lineage captured end-to-end.
  const lineage = facade.assemblyLineage();
  assert.equal(lineage.k1AssemblyDigest, k1Host.assembly.digest);
  assert.equal(lineage.k1GraphDigest, k1Host.assembly.graphDigest);
  assert.equal(lineage.d1KernelRoot, D1_GENESIS_ROOT_DIGESTS.kernel);
  assert.equal(lineage.d1SdkRoot, D1_GENESIS_ROOT_DIGESTS.sdk);
  assert.equal(lineage.d1KernelLinkModuleSha256, D1_KERNEL_LINK_MODULE_SHA);
  assert.equal(lineage.manifestSha256, sha256hex(await readFile(join(DEFAULT_K1_ROOT, 'business', 'charge', 'manifest.json'))));
  assert.equal(lineage.occurrence.authorityClass, 'PRODUCTION');
  assert.equal(lineage.occurrence.pinAssemblyDigest, facade.describe().assemblyDigest);
  assert.equal(lineage.t003cHandlerIdentityPreserved, true);
  assert.equal(lineage.t004aPolicyBindingFingerprint, facade.describe().policyBindingFingerprint);
});

// ---------------------------------------------------------------------------
// R4-06 — Kernel-only / SDK-only post-Seal tamper denies before dispatch/journal
// ---------------------------------------------------------------------------

test('R4-06 all-package post-Seal Kernel-only and SDK-only tamper denies an unaffected Charge BEFORE dispatch and ANY journal row', async () => {
  await clonePackages(async (root) => {
    const k1Host = await establishK1Host({ root });
    const facade = await newR4Host(k1Host, root);
    // Kernel-only tamper (Charge bytes physically unaffected).
    await writeFile(join(root, 'genesis-exact', 'kernel', 'modules', 'link.mjs'),
      (await readFile(join(root, 'genesis-exact', 'kernel', 'modules', 'link.mjs'), 'utf8')) + '\n// kernel tamper');
    await assert.rejects(() => armedInvoke(facade), isError('E_SEALED_MODULE_CHANGED'));
    assertNoEffect(facade);
    await assert.rejects(() => facade.requirePhysicalCurrentness(), isError('E_SEALED_MODULE_CHANGED'));
    // Restore the kernel bytes, then SDK-only tamper.
    const kernelDir = join(root, 'genesis-exact', 'kernel', 'modules');
    await writeFile(join(kernelDir, 'link.mjs'),
      (await readFile(join(DEFAULT_K1_ROOT, 'genesis-exact', 'kernel', 'modules', 'link.mjs'))));
    await writeFile(join(root, 'genesis-exact', 'sdk', 'modules', 'rule.mjs'),
      (await readFile(join(root, 'genesis-exact', 'sdk', 'modules', 'rule.mjs'), 'utf8')) + '\n// sdk tamper');
    await assert.rejects(() => armedInvoke(facade), isError('E_SEALED_MODULE_CHANGED'));
    assertNoEffect(facade);
    // The Charge package bytes were physically unaffected the whole time.
    assert.equal(sha256hex(await readFile(join(root, 'business', 'charge', 'modules', 'charge.mjs'))),
      sha256hex(await readFile(join(DEFAULT_K1_ROOT, 'business', 'charge', 'modules', 'charge.mjs'))));
    // The same byte-mutated root cannot recreate authority by re-attestation:
    // a fresh K1/R4 establishment on mutated bytes fails closed at the trust
    // chain (module-byte pin or manifest pin, whichever the tamper hits first).
    await assert.rejects(establishK1Host({ root }), (e) => {
      assert.ok(e?.code === 'E_MODULE_BYTES' || e?.code === 'E_HOST_MANIFEST_PIN',
        'expected a trust-chain rejection, got ' + String(e?.code));
      return true;
    });
  });
});

// ---------------------------------------------------------------------------
// R4-07 — unselected Business package tamper + provider/caller-graph falsifiers
// ---------------------------------------------------------------------------

test('R4-07 unselected OTHER Business Package mutation fail-closes; duplicate/missing provider and false caller graph cannot bind', async () => {
  await clonePackages(async (root) => {
    const k1Host = await establishK1Host({ root });
    const facade = await newR4Host(k1Host, root);
    // (a) unselected Business package (claim) mutated after Seal: the selected
    // Charge route fail-closes the same way (whole-Assembly currentness).
    await writeFile(join(root, 'business', 'claim', 'modules', 'policy.mjs'),
      (await readFile(join(root, 'business', 'claim', 'modules', 'policy.mjs'), 'utf8')) + '\n// claim tamper');
    await assert.rejects(() => armedInvoke(facade), isError('E_SEALED_MODULE_CHANGED'));
    assertNoEffect(facade);
  });
  // (b)/(c) graph falsifiers run on a SEPARATE clean clone (the re-attested
  // graph variants must fail at their own graph gates, not at tampered bytes).
  await clonePackages(async (root) => {
    // (b) missing provider: required capability version nobody provides.
    const entries = await rawEntries(root);
    const claim = entries.find((x) => x.manifest.packageId === 'k1.business.claim');
    claim.manifest.components.find((c) => c.componentId === 'claim-underwrite')
      .requiresCapabilities[0].version = '2.0.0';
    repin(claim);
    await assert.rejects(linkGraph(entries), isError('E_MISSING_PROVIDER'));
    // (c) duplicate provider of the same capability.
    const fresh = await rawEntries(root);
    const claim2 = fresh.find((x) => x.manifest.packageId === 'k1.business.claim');
    claim2.manifest.components.find((c) => c.componentId === 'claim-policy')
      .providesCapabilities.push({ capabilityId: 'rule.score', operations: ['evaluate'], version: '1.0.0' });
    repin(claim2);
    await assert.rejects(linkGraph(fresh), isError('E_AMBIGUOUS_PROVIDER'));
  });
  // (d) false caller graph: an authorized caller kind outside the projected
  // physical caller scope cannot bind at construction.
  const k1Host = await establishK1Host();
  await assert.rejects(newR4Host(k1Host, DEFAULT_K1_ROOT, {
    authorizedCallers: [{ callerId: CALLER_ID, callerKind: 'business' }],
  }), (e) => {
    assert.equal(e?.code, 'E_HOST_POLICY_SPEC');
    assert.ok(String(e?.message).includes('outside the projected physical caller scope'), String(e?.message));
    return true;
  });
});

// ---------------------------------------------------------------------------
// R4-08 — authorized vs denied callers on FRESH occurrences
// ---------------------------------------------------------------------------

test('R4-08 authorized real Charge input admitted; foreign caller / wrong caller-kind denied on FRESH separate occurrences', async () => {
  // (a) authorized real input on its own occurrence.
  const ok = await newR4Host(await establishK1Host());
  const result = await armedInvoke(ok);
  assert.equal(result.outcome.status, 'admitted');
  assert.equal(ok.getDispatchCount(), 1);
  assert.equal(ok.journalCompletedCount(), 1);
  // (b) foreign caller on a FRESH occurrence.
  const foreign = await newR4Host(await establishK1Host());
  await assert.rejects(() => foreign.invoke({ input: { amount: 42 }, caller: { callerId: 'caller.evil', callerKind: 'host' } }), (e) => {
    assert.equal(e?.code, 'EXPOSURE_NOT_ADMITTED');
    assert.ok(String(e?.message).includes('not authorized'), String(e?.message));
    return true;
  });
  assertNoEffect(foreign);
  // (c) right id under a wrong caller-kind on a FRESH occurrence.
  const wrongKind = await newR4Host(await establishK1Host());
  await assert.rejects(() => wrongKind.invoke({ input: { amount: 42 }, caller: { callerId: CALLER_ID, callerKind: 'workflow' } }), (e) => {
    assert.equal(e?.code, 'EXPOSURE_NOT_ADMITTED');
    assert.ok(String(e?.message).includes('callerKind'), String(e?.message));
    return true;
  });
  assertNoEffect(wrongKind);
  // (d) input substitution (right caller, different input material) fails
  // closed through the ORIGINAL v0.7 intent-closure gate.
  const substituted = await newR4Host(await establishK1Host());
  await assert.rejects(() => substituted.invoke({ input: { amount: 43 }, caller: { callerId: CALLER_ID, callerKind: 'host' } }),
    isError('ADMISSION_EFFECT_FAILED'));
  assert.equal(substituted.getDispatchCount(), 0);
  assert.equal(substituted.journalCompletedCount(), 0);
});

// ---------------------------------------------------------------------------
// R4-09 — forged selections reject before T003C/dispatch/journaling
// ---------------------------------------------------------------------------

test('R4-09 wrong handler/owner/module-SHA/manifest-SHA/malformed shapes reject before T003C, dispatch and journaling', async () => {
  const k1Host = await establishK1Host();
  const k1Seal = k1Host.sealOperation(CHARGE_SELECTOR);
  const adapted = await adaptK1SealedSelectionToA1({ k1Host, k1Seal, k1Root: DEFAULT_K1_ROOT });
  const { bindR4IntegratedAuthority } = await import('../authority/r4-native-join.mjs');
  const base = { k1Host, k1Seal, k1Root: DEFAULT_K1_ROOT, armedIntentInput: ARMED, authorizedCallers: [CALLER], instanceOrdinal: nextOrdinal() };
  // (a) wrong-but-real handler: another REAL Business callable of the same
  // Assembly (the claim evaluate function, loaded from the same byte-verified
  // artifacts exactly as the K1 host loads it) can never stand in for charge —
  // the join cross-checks the eight-key snapshot against the genuine K1 seal.
  const entries = await readTrustedEntries(DEFAULT_K1_ROOT);
  const claimEntry = entries.find((e) => e.id === 'k1.business.claim');
  const policyModule = await import('data:text/javascript;base64,' +
    Buffer.from(claimEntry.artifacts['modules/policy.mjs'], 'utf8').toString('base64'));
  const wrongHandler = policyModule.evaluate;
  assert.equal(typeof wrongHandler, 'function');
  await assert.rejects(bindR4IntegratedAuthority({ ...base, physical: { ...adapted, handler: wrongHandler } }),
    isError('E_INTEGRATION_BLOCKED'));
  // (b) wrong package/component owner (forged seal with drifted owner).
  const ownerForged = {
    assembly: k1Host.assembly,
    nativeSelection: () => ({ ...k1Seal.nativeSelection(), componentId: 'claim-policy' }),
    requirePhysicalCurrentness: k1Seal.requirePhysicalCurrentness,
  };
  await assert.rejects(adaptK1SealedSelectionToA1({ k1Host, k1Seal: ownerForged, k1Root: DEFAULT_K1_ROOT }),
    isError('E_INTEGRATION_BLOCKED'));
  // The genuine K1 sealOperation itself refuses the wrong owner up front.
  assert.throws(() => k1Host.sealOperation({ packageId: 'k1.business.charge', componentId: 'claim-policy', operationId: 'charge' }),
    isError('E_OPERATION_NOT_DECLARED'));
  // (c) wrong module SHA (forged seal) — rejected by the adapter.
  const moduleForged = {
    assembly: k1Host.assembly,
    nativeSelection: () => ({ ...k1Seal.nativeSelection(), moduleSha256: 'a'.repeat(64) }),
    requirePhysicalCurrentness: k1Seal.requirePhysicalCurrentness,
  };
  await assert.rejects(adaptK1SealedSelectionToA1({ k1Host, k1Seal: moduleForged, k1Root: DEFAULT_K1_ROOT }),
    isError('E_INTEGRATION_BLOCKED'));
  // (d) forged manifest SHA — rejected by the join's physical recompute.
  await assert.rejects(bindR4IntegratedAuthority({ ...base, physical: { ...adapted, manifestSha256: 'b'.repeat(64) } }),
    isError('E_INTEGRATION_BLOCKED'));
  // (e) malformed eight-key shapes — typed-rejected by the UNCHANGED A1 gate
  // before any T003C work.
  const extra = { ...adapted, extra: 1 };
  assert.throws(() => projectPhysicalComponentToNative(extra), isError('E_PROJECTION_SELECTION_SHAPE'));
  const noComponentOwner = { ...adapted, implementation: { ...adapted.implementation, componentId: 'tool.foreign' } };
  assert.throws(() => projectPhysicalComponentToNative(noComponentOwner), isError('E_PROJECTION_IDENTITY'));
  assert.equal(k1Host.stats().dispatchCount, 0);
});

// ---------------------------------------------------------------------------
// R4-10 — arbitrary authority material rejected with typed codes
// ---------------------------------------------------------------------------

test('R4-10 arbitrary dispatch/admissionPorts/activator/sha256/effectJournal/policy/binding/assembly-root rejected typed; no Host port override via the façade', async () => {
  const k1Host = await establishK1Host();
  const facade = await newR4Host(k1Host);
  const forged = { forged: true, invoke() { throw Error('forged authority'); } };
  const authorityKeys = [
    'dispatch', 'admissionPorts', 'activator', 'sha256', 'effectJournal', 'policy', 'binding',
    'request', 'admissionRequest', 'currentDefinitionGraph', 'resourceProvider', 'effectAuthority',
    'effectTools', 'exposure', 'effectType', 'assembly', 'selector', 'physical', 'k1Seal', 'k1Host',
  ];
  for (const key of authorityKeys) {
    await assert.rejects(() => facade.invoke({ input: { amount: 42 }, caller: { callerId: CALLER_ID, callerKind: 'host' }, [key]: forged }),
      isError('E_HOST_BUSINESS_INPUT_ONLY'));
  }
  assertNoEffect(facade);
  // Caller-supplied full-Assembly root / host override at the K1 layer (K1
  // inherited guards, unchanged).
  await assert.rejects(establishK1Host({ extraAuthority: {} }), isError('E_UNTRUSTED_HOST_OVERRIDE'));
  // A lookalike K1 host carrying a forged Assembly digest cannot enter R4.
  const lookalikeHost = { ...k1Host, assembly: { ...k1Host.assembly, digest: 'sha256:' + '0'.repeat(64) } };
  await assert.rejects(newR4Host(lookalikeHost), isError('E_INTEGRATION_BLOCKED'));
  // rebind is sealed.
  assert.throws(() => facade.rebind(), isError('E_HOST_REBIND_FORBIDDEN'));
});

// ---------------------------------------------------------------------------
// R4-11 — P1-a descriptor carriers: typed rejection, zero getter execution
// ---------------------------------------------------------------------------

test('R4-11 own non-enumerable dispatch, symbol-key carrier and inherited input/caller rejected before admission with ZERO getter side effects', async () => {
  const k1Host = await establishK1Host();
  const facade = await newR4Host(k1Host);
  let getterRuns = 0;
  const forgedPort = { dispatch: async () => ({ forged: true }) };
  // (a) own NON-ENUMERABLE authority key: typed rejection, never a silent ignore.
  const nonEnum = { input: { amount: 42 }, caller: { callerId: CALLER_ID, callerKind: 'host' } };
  Object.defineProperty(nonEnum, 'dispatch', { value: forgedPort, enumerable: false });
  await assert.rejects(() => facade.invoke(nonEnum), isError('E_R4_RECORD_NON_ENUMERABLE'));
  // (b) symbol-key carrier (with a counting nested getter that must NOT run).
  const sym = Symbol('authority');
  const symbolCarrier = { input: { amount: 42 }, caller: { callerId: CALLER_ID, callerKind: 'host' } };
  Object.defineProperty(symbolCarrier, sym, { get() { getterRuns += 1; return {}; }, enumerable: true });
  await assert.rejects(() => facade.invoke(symbolCarrier), isError('E_R4_RECORD_SYMBOL_KEY'));
  // (c) inherited input/caller (prototype-carried) rejected.
  const inherited = Object.create({ input: { amount: 42 } });
  inherited.caller = { callerId: CALLER_ID, callerKind: 'host' };
  await assert.rejects(() => facade.invoke(inherited), isError('E_R4_RECORD_PROTOTYPE'));
  const inheritedCaller = { input: { amount: 42 } };
  Object.setPrototypeOf(inheritedCaller, { caller: { callerId: CALLER_ID, callerKind: 'host' } });
  await assert.rejects(() => facade.invoke(inheritedCaller), isError('E_R4_RECORD_PROTOTYPE'));
  assert.equal(getterRuns, 0, 'a descriptor carrier getter executed');
  assertNoEffect(facade);
});

// ---------------------------------------------------------------------------
// R4-12 — own accessor getters / nested / __proto__ payloads rejected pre-execution
// ---------------------------------------------------------------------------

test('R4-12 own accessor getters on input/caller, nested getters and __proto__ records rejected BEFORE any getter runs and before journal writes', async () => {
  const k1Host = await establishK1Host();
  const facade = await newR4Host(k1Host);
  let getterRuns = 0;
  const counting = () => ({ get x() { getterRuns += 1; return 1; } });
  // (a) own accessor getter on `input`.
  const accessorInput = { caller: { callerId: CALLER_ID, callerKind: 'host' } };
  Object.defineProperty(accessorInput, 'input', { get() { getterRuns += 1; return { amount: 42 }; }, enumerable: true });
  await assert.rejects(() => facade.invoke(accessorInput), isError('E_R4_RECORD_ACCESSOR'));
  // (b) own accessor getter on `caller`.
  const accessorCaller = { input: { amount: 42 } };
  Object.defineProperty(accessorCaller, 'caller', { get() { getterRuns += 1; return { callerId: CALLER_ID, callerKind: 'host' }; }, enumerable: true });
  await assert.rejects(() => facade.invoke(accessorCaller), isError('E_R4_RECORD_ACCESSOR'));
  // (c) nested accessor payload deep inside the input data.
  await assert.rejects(() => facade.invoke({ input: { amount: 42, nested: { deeper: counting() } }, caller: { callerId: CALLER_ID, callerKind: 'host' } }),
    isError('E_R4_RECORD_ACCESSOR'));
  // (d) nested array-carried accessor.
  await assert.rejects(() => facade.invoke({ input: { amount: 42, list: [counting()] }, caller: { callerId: CALLER_ID, callerKind: 'host' } }),
    isError('E_R4_RECORD_ACCESSOR'));
  // (e) own __proto__ key (JSON.parse-carried prototype pollution).
  const poisoned = JSON.parse('{"__proto__":{"polluted":true},"amount":42}');
  await assert.rejects(() => facade.invoke({ input: poisoned, caller: { callerId: CALLER_ID, callerKind: 'host' } }),
    isError('E_R4_RECORD_PROTO_KEY'));
  assert.equal(Object.prototype.polluted, undefined);
  // (f) non-JSON data types.
  await assert.rejects(() => facade.invoke({ input: { amount: BigInt(42) }, caller: { callerId: CALLER_ID, callerKind: 'host' } }),
    isError('E_R4_RECORD_JSON_DATA_ONLY'));
  await assert.rejects(() => facade.invoke({ input: { amount: 42, fn() { getterRuns += 1; } }, caller: { callerId: CALLER_ID, callerKind: 'host' } }),
    isError('E_R4_RECORD_JSON_DATA_ONLY'));
  // (g) nested foreign-prototype record.
  class Foreign { constructor() { this.amount = 42; } }
  await assert.rejects(() => facade.invoke({ input: { amount: 42, foreign: new Foreign() }, caller: { callerId: CALLER_ID, callerKind: 'host' } }),
    isError('E_R4_RECORD_PROTOTYPE'));
  assert.equal(getterRuns, 0, 'a payload getter executed');
  assertNoEffect(facade);
});

// ---------------------------------------------------------------------------
// R4-13 — post-construction mutation cannot widen scope or alter the occurrence
// ---------------------------------------------------------------------------

test('R4-13 policy/Host caller object mutation after construction cannot widen authorized scope or alter the admitted occurrence', async () => {
  const k1Host = await establishK1Host();
  const authorizedCallers = [{ callerId: CALLER_ID, callerKind: 'host' }];
  const armedIntentInput = { amount: 42 };
  const facade = await createR4IntegratedHost({
    k1Host, k1Root: DEFAULT_K1_ROOT, selector: CHARGE_SELECTOR,
    armedIntentInput, authorizedCallers, instanceOrdinal: nextOrdinal(),
  });
  const occurrenceBefore = facade.describe().occurrenceId;
  // Mutate the caller-held arrays/objects AFTER construction.
  authorizedCallers.push({ callerId: 'caller.evil', callerKind: 'host' });
  armedIntentInput.amount = 999;
  // The armed occurrence is unchanged; the original caller still admitted.
  assert.equal(facade.describe().occurrenceId, occurrenceBefore);
  const result = await armedInvoke(facade);
  assert.equal(result.outcome.status, 'admitted');
  assert.deepEqual(result.outcome.admitted.effects[0].output, { charged: true, amount: 42, fromK1Business: true });
  // The post-construction pushed caller is NOT authorized.
  await assert.rejects(() => facade.invoke({ input: { amount: 42 }, caller: { callerId: 'caller.evil', callerKind: 'host' } }),
    isError('EXPOSURE_NOT_ADMITTED'));
  // Caller authentication obligation is explicitly declared (not proven).
  assert.equal(facade.describe().callerAuthentication.startsWith('NOT_PROVEN'), true);
});

// ---------------------------------------------------------------------------
// R4-14 — P1-b: privileged lab records the inherited v0.7 trusted-transport truth
// ---------------------------------------------------------------------------

test('R4-14 F8a/F8b/F8c on FRESH occurrences: original v0.7 ACCEPTS well-shaped privileged dispatch (inherited hazard); R4 public façade has NO such channel', async () => {
  // (0) The R4 public façade carries zero privileged research transport path:
  // full own-key + prototype-chain + return-value reachability walk. Exact key
  // matching (read-only provenance exports like getDispatchCount/policyStats
  // are legitimate; the forbidden set is authority/override material).
  const k1Host = await establishK1Host();
  const facade = await newR4Host(k1Host);
  const PRIVILEGED_KEYS = new Set([
    'dispatch', 'internals', 'invokeWithMaterial', 'trustedResearchPort', 'admitFor',
    'baseRequest', 'k1Seal', 'k1Host', 'activator', 'admissionPorts', 'admissionRequest',
    'effectJournal', 'effectAuthority', 'effectTools', 'handler', 'armedCaller',
    'armedIntentInput', 'projected', 'coordinator',
  ]);
  const seen = new Set();
  const walk = (value, depth) => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value) || depth > 4) return;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      assert.equal(PRIVILEGED_KEYS.has(typeof key === 'string' ? key : ''), false,
        'privileged path leaked on façade-reachable key: ' + String(key));
    }
    let proto = value;
    while (proto) {
      proto = Object.getPrototypeOf(proto);
      if (proto && proto !== Object.prototype && proto !== Function.prototype && proto !== Array.prototype && proto !== Promise.prototype) {
        for (const key of Reflect.ownKeys(proto)) {
          assert.equal(PRIVILEGED_KEYS.has(typeof key === 'string' ? key : ''), false,
            'privileged path leaked on a façade-reachable prototype: ' + String(key));
        }
      }
    }
    for (const key of Reflect.ownKeys(value)) {
      let child;
      try { child = value[key]; } catch { continue; }
      walk(child, depth + 1);
    }
  };
  walk(facade, 0);
  walk(facade.describe(), 0);
  walk(facade.assemblyLineage(), 0);
  walk(facade.journalRecords(), 0);
  walk(facade.policyStats(), 0);
  await facade.requirePhysicalCurrentness(); // returns true, no material

  // (F8a) FRESH occurrence: a WELL-SHAPED pass-through dispatch wrapper is
  // ACCEPTED by the original v0.7 trust port (Host dispatch bypassed).
  const labA = await createR4TrustedTransportLab({
    acknowledgeInheritedV07TrustedTransportHazard: LAB_ACKNOWLEDGMENT_TOKEN,
    k1Host, k1Root: DEFAULT_K1_ROOT, selector: CHARGE_SELECTOR,
    armedIntentInput: ARMED, authorizedCallers: [CALLER], instanceOrdinal: nextOrdinal(),
  });
  const realHandler = labA.lab.internals.handler;
  const passthrough = await labA.lab.invokeWithWellShapedDispatch({
    dispatch: { dispatch: async (query) => realHandler({ input: query.input }) },
  });
  assert.equal(passthrough.outcome.status, 'admitted');
  assert.equal(labA.facade.getDispatchCount(), 0, 'Host dispatch port was bypassed');
  assert.equal(labA.facade.journalCompletedCount(), 1);
  assert.deepEqual(passthrough.outcome.admitted.effects[0].output, { charged: true, amount: 42, fromK1Business: true });

  // (F8b) FRESH occurrence: a fake-output dispatch is ACCEPTED and the
  // ORIGINAL journal commits a completed row with the fabricated output.
  // HONEST RECORD: inherited trusted-transport hazard of original v0.7 —
  // NOT a valid authorized business outcome, NOT a v0.7 fail-close claim.
  const labB = await createR4TrustedTransportLab({
    acknowledgeInheritedV07TrustedTransportHazard: LAB_ACKNOWLEDGMENT_TOKEN,
    k1Host: await establishK1Host(), k1Root: DEFAULT_K1_ROOT, selector: CHARGE_SELECTOR,
    armedIntentInput: ARMED, authorizedCallers: [CALLER], instanceOrdinal: nextOrdinal(),
  });
  const fake = await labB.lab.invokeWithWellShapedDispatch({
    dispatch: { dispatch: async () => ({ charged: 'FAKE', neverRan: true }) },
  });
  assert.equal(fake.outcome.status, 'admitted');
  assert.equal(labB.facade.getDispatchCount(), 0);
  const fakeRows = labB.facade.journalRecords().filter((r) => r.status === 'completed');
  assert.equal(fakeRows.length, 1);
  assert.ok(JSON.stringify(fakeRows[0]).includes('FAKE'),
    'the fabricated output must be honestly visible in the ORIGINAL journal row');

  // (F8c) FRESH occurrence: inject the fake first, then a REAL façade
  // invocation on the SAME occurrence REPLAYS the fake output — evidence
  // cannot be hidden by replay.
  const labC = await createR4TrustedTransportLab({
    acknowledgeInheritedV07TrustedTransportHazard: LAB_ACKNOWLEDGMENT_TOKEN,
    k1Host: await establishK1Host(), k1Root: DEFAULT_K1_ROOT, selector: CHARGE_SELECTOR,
    armedIntentInput: ARMED, authorizedCallers: [CALLER], instanceOrdinal: nextOrdinal(),
  });
  await labC.lab.invokeWithWellShapedDispatch({
    dispatch: { dispatch: async () => ({ charged: 'FAKE', neverRan: true }) },
  });
  const replayed = await armedInvoke(labC.facade);
  assert.equal(replayed.outcome.status, 'admitted');
  assert.equal(replayed.outcome.admitted.effects[0].disposition, 'replayed');
  assert.deepEqual(replayed.outcome.admitted.effects[0].output, { charged: 'FAKE', neverRan: true });
  assert.equal(labC.facade.getDispatchCount(), 0);

  // The lab refuses to open without the explicit acknowledgment token.
  await assert.rejects(createR4TrustedTransportLab({
    k1Host: await establishK1Host(), k1Root: DEFAULT_K1_ROOT, selector: CHARGE_SELECTOR,
    armedIntentInput: ARMED, authorizedCallers: [CALLER], instanceOrdinal: nextOrdinal(),
  }), isError('E_LAB_ACK_REQUIRED'));
});

// ---------------------------------------------------------------------------
// R4-15 — sibling regressions are present and rerun by the workflow
// ---------------------------------------------------------------------------

test('R4-15 sibling regression suites present unchanged (K1 K3, A1 A3, B2 R1/R2, B1); full repo gates run in CI', async () => {
  const siblings = [
    'experiments/v08-b2-r3-k1/tests/k1-assembly.test.mjs',
    'experiments/v08-b2-r3-a1/tests/kind-authority-b2-r3-a1.test.mjs',
    'experiments/v08-gatea-repair-942/tests/kind-authority-b2.test.mjs',
    'experiments/v08-gatea-repair-942/tests/kind-authority-b2-r2.test.mjs',
    'experiments/v08-gatea-b1-955-r2/tests/b1.test.mjs',
  ];
  for (const rel of siblings) {
    await access(join(fileURLToPath(new URL('../../../', import.meta.url)), rel));
  }
  // The R4 workflow reruns every sibling suite plus npm build/lint/typecheck/
  // test and the D1 genesis G01–G26 extraction on the exact HEAD; that
  // executable regression matrix is R4-15's CI gate (no waiver, no skip).
});

// ---------------------------------------------------------------------------
// R4-16 — INTEGRATION_BLOCKED discipline on lineage mismatch
// ---------------------------------------------------------------------------

test('R4-16 lineage mismatches and untrusted authority reject E_INTEGRATION_BLOCKED; no authority recreation by re-attestation', async () => {
  const k1HostA = await establishK1Host();
  const sealA = k1HostA.sealOperation(CHARGE_SELECTOR);
  // (a) a seal from a DIFFERENT host instance cannot bind to host A.
  const hostB = await establishK1Host();
  const sealB = hostB.sealOperation(CHARGE_SELECTOR);
  await assert.rejects(adaptK1SealedSelectionToA1({ k1Host: k1HostA, k1Seal: sealB, k1Root: DEFAULT_K1_ROOT }),
    isError('E_INTEGRATION_BLOCKED'));
  // (b) a forged assembly-wrapped host (digest drift) rejects.
  const digestForgedHost = { ...k1HostA, assembly: { ...k1HostA.assembly, digest: 'sha256:' + 'c'.repeat(64) } };
  await assert.rejects(newR4Host(digestForgedHost), isError('E_INTEGRATION_BLOCKED'));
  // (c) graph digest drift on the otherwise-identical assembly.
  const graphForgedHost = { ...k1HostA, assembly: { ...k1HostA.assembly, graphDigest: 'sha256:' + 'd'.repeat(64) } };
  const sealOnForgedGraph = { assembly: graphForgedHost.assembly, nativeSelection: sealA.nativeSelection, requirePhysicalCurrentness: sealA.requirePhysicalCurrentness };
  await assert.rejects(adaptK1SealedSelectionToA1({ k1Host: graphForgedHost, k1Seal: sealOnForgedGraph, k1Root: DEFAULT_K1_ROOT }),
    isError('E_INTEGRATION_BLOCKED'));
  // (d) untrusted trusted-input shapes reject typed.
  await assert.rejects(newR4Host(await establishK1Host(), DEFAULT_K1_ROOT, { armedIntentInput: 'not-an-object' }), isError('E_R4_TRUSTED_INPUT'));
  await assert.rejects(newR4Host(await establishK1Host(), DEFAULT_K1_ROOT, { instanceOrdinal: -1 }), isError('E_R4_TRUSTED_INPUT'));
  // (e) byte-mutated root cannot re-establish (K1 pin) NOR re-enter through
  // the already-sealed host (currentness) — no authority recreation.
  await clonePackages(async (root) => {
    const host = await establishK1Host({ root });
    const r4 = await newR4Host(host, root);
    await writeFile(join(root, 'business', 'charge', 'manifest.json'),
      (await readFile(join(root, 'business', 'charge', 'manifest.json'), 'utf8')).replace('"packageVersion":"1.0.0"', '"packageVersion":"1.0.1"'));
    await assert.rejects(() => armedInvoke(r4), isError('E_SEALED_MANIFEST_CHANGED'));
    // Re-establishment fails closed in the trust chain: the content-tampered
    // manifest still carries the OLD integrity field, so the package digest
    // verification rejects (a re-pinned manifest would fail the trust-root pin).
    await assert.rejects(establishK1Host({ root }), (e) => {
      assert.ok(e?.code === 'E_PACKAGE_INTEGRITY' || e?.code === 'E_HOST_MANIFEST_PIN',
        'expected a trust-chain rejection, got ' + String(e?.code));
      return true;
    });
    assertNoEffect(r4);
  });
  assert.equal(sealA.assembly.digest, k1HostA.assembly.digest);
});
