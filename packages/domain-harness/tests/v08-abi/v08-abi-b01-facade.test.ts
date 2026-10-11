/**
 * V08-ABI-B01 — minimal microkernel `DomainHarness.load(package)` and the
 * scoped send/query/subscribe/stop facade (T-B, #1001).
 * ===========================================================================
 *
 * This process installs BOTH protected channels once at module scope — the
 * trusted issuer registry (trust.ts) and the kernel Host ports
 * (kernel-host.ts) — exactly what the governance/Host bootstrap performs;
 * the negative counterpart (no registry at all) lives in
 * v08-abi-b01-untrusted.test.ts, which runs as its OWN process.
 *
 * Test map (KPK ids are semantic ports of #994@b9ea4d1, re-based onto the
 * qualified package ABI; fixtures come through the REAL compiler BUILD path):
 *   - B01-P   physical selected-K import + full scoped round trip
 *             (KPK-01 source-ownership semantics: attribution to sealed bytes)
 *   - B01-P2  typed transport gates (JSON-only intents, targets, kinds)
 *   - B01-KPK02 thin-loader static proof (no engine import, no business
 *             special case, no dynamic import / data: URL / byte decoding,
 *             Host via protected channel only) (KPK-02)
 *   - B01-KPK03 fixed closure: frozen seal, no provider discovery/fallback
 *             (KPK-03)
 *   - B01-KPK08 same K/S bytes serve two business domains; package
 *             switching; per-scope isolation (KPK-08 + KPK-01 successor swap)
 *   - B01-KPK12 no whole-package rehash on install/invoke/query path
 *             (KPK-12)
 *   - B01-LIFE stop() lifecycle: final, idempotent, observers cleared
 *   - B01-N1  fake second Host argument: strictly one-arg loader (the
 *             P1-L2-ABI-02 repair); injection is never read
 *   - B01-N2  forged producerId
 *   - B01-N3  transitive import path substitution refused at BUILD
 *   - B01-N4  raw Kernel accessor / raw Journal / Host ports absent from the
 *             scoped and public surfaces
 *   - B01-N5  wrong kernel version/ABI refused (BUILD + install)
 *   - B01-N6  incomplete install leaves no side effect; loader state clean
 *   - B01-N8  forged attestation / unregistered issuer: zero execution
 *             (trusted-process counterpart of N7)
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

import * as v8Public from '../../src/public-v8/index.js';
import { DomainHarness, QualifiedPackageError } from '../../src/public-v8/index.js';
import { installTrustedIssuers } from '../../src/public-v8/trust.js';
import { installKernelHostPorts } from '../../src/public-v8/kernel-host.js';
import {
  QualificationError,
  qualifyPackageClosure,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import {
  B01_ATTACKER_SECRET,
  B01_ISSUER,
  B01_ISSUER_SECRET,
  b01Clone,
  b01DefaultClosure,
  b01MemoryHost,
  b01PackageIds,
  b01SentinelCount,
  b01Seal,
  b01Submission,
  businessFixture,
  kernelFixture,
  sdkFixture,
} from './v08-tb-fixture.js';

// Governance/Host bootstrap for THIS process (one-shot, exactly as in prod).
const host = b01MemoryHost();
installTrustedIssuers({ issuers: new Map([[B01_ISSUER, B01_ISSUER_SECRET]]) });
installKernelHostPorts(host.ports);

const TARGET = { workflowId: 'tb-flow', instanceKey: 'instance:1' };

interface ReceiptShape {
  status: string;
  occurrence: number;
  pin: string;
  kernel: { packageId: string; moduleSha256: string };
  interpreted: Record<string, unknown>;
  decision: { admit: boolean; reason: string };
}

function asReceipt(value: unknown): ReceiptShape {
  return value as ReceiptShape;
}

async function refuseFacade(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(
    () => promise,
    (error: unknown) => {
      assert.ok(error instanceof QualifiedPackageError, `expected QualifiedPackageError, got ${String(error)}`);
      assert.equal((error as QualifiedPackageError).code, code);
      return true;
    },
  );
}

function assertClosureNeverExecuted(tag: string): void {
  const closure = b01DefaultClosure(tag);
  for (const id of [closure.kernelId, closure.sdkId, closure.businessId]) {
    assert.equal(b01SentinelCount(id), 0, `module ${id} must never evaluate for a refused closure`);
  }
}

// ---------------------------------------------------------------------------

test('V08-ABI-B01-P the selected Kernel package is physically imported through the qualified path and drives the scoped facade', async () => {
  const closure = b01DefaultClosure('p1');
  const root = b01Seal(closure.input);
  assert.equal(b01SentinelCount(closure.kernelId), 0, 'inert before load — the loader imports nothing at rest');
  const facade = await DomainHarness.load(root);
  assert.equal(b01SentinelCount(closure.kernelId), 1, 'the selected kernel module was physically imported exactly once');
  assert.equal(b01SentinelCount(closure.sdkId), 1);
  assert.equal(b01SentinelCount(closure.businessId), 1);
  // The scoped surface is EXACTLY send/query/subscribe/stop.
  assert.deepEqual(Object.keys(facade).sort(), ['query', 'send', 'stop', 'subscribe']);

  const receipts: unknown[] = [];
  const unsubscribe = facade.subscribe((receipt) => receipts.push(receipt));
  const sealedKernel = root.packages.find((pkg) => pkg.packageId === closure.kernelId);
  assert.ok(sealedKernel !== undefined);
  const receipt = asReceipt(await facade.send({ intentType: 'demo.p1', target: TARGET, messageId: 'msg:1', input: { amount: 42 } }));
  assert.equal(receipt.status, 'admitted');
  assert.deepEqual(
    receipt.kernel,
    { packageId: closure.kernelId, moduleSha256: sealedKernel.moduleSha256 },
    'the executing mechanism attributes itself to the sealed kernel bytes (KPK-01 ownership semantics)',
  );
  assert.match(receipt.pin, /^[0-9a-f]{64}$/, 'the mechanism pinned the occurrence through the Host digest port');
  assert.deepEqual(receipt.interpreted, { amount: 42 }, 'the standard-sdk endpoint was wired into the kernel');
  assert.equal(receipt.decision.reason, 'within-cap', 'the business policy endpoint was wired into the kernel');
  // Host storage was reached only through the protected channel.
  const stored = host.docs.get(`occ:${closure.kernelId}:1`) as { pin: string; by: string } | undefined;
  assert.ok(stored !== undefined, 'the kernel mechanism stored its occurrence through the wired Host docs port');
  assert.equal(stored.by, closure.kernelId);
  assert.equal(stored.pin, receipt.pin);
  // Observers see every receipt exactly once.
  assert.equal(receipts.length, 1);

  const snapshot = (await facade.query({ kind: 'instance', target: TARGET })) as { occurrences: number; kernel: { packageId: string } };
  assert.equal(snapshot.occurrences, 1);
  assert.equal(snapshot.kernel.packageId, closure.kernelId);
  const trace = (await facade.query({ kind: 'build' })) as {
    root: { rootPackageId: string; closureDigest: string };
    packages: { packageId: string; moduleId: string; moduleSha256: string }[];
  };
  assert.equal(trace.root.rootPackageId, root.rootPackageId);
  assert.equal(trace.root.closureDigest, root.build.closureDigest);
  assert.equal(trace.packages.length, 3);
  const tracedKernel = trace.packages.find((pkg) => pkg.packageId === closure.kernelId);
  assert.ok(tracedKernel !== undefined);
  assert.equal(tracedKernel.moduleId, closure.kernelId);
  assert.equal(tracedKernel.moduleSha256, sealedKernel.moduleSha256);

  // Unsubscribing stops observation without stopping the scope.
  assert.equal(unsubscribe(), true);
  await facade.send({ intentType: 'demo.p1', target: TARGET, messageId: 'msg:2', input: { amount: 42 } });
  assert.equal(receipts.length, 1, 'an unsubscribed observer receives nothing more');
});

test('V08-ABI-B01-P2 transport gates fail typed at the scoped boundary', async () => {
  const closure = b01DefaultClosure('p2');
  const facade = await DomainHarness.load(b01Seal(closure.input));
  await refuseFacade(facade.send({ intentType: 'demo.p2', target: TARGET, messageId: 'm', input: { evil: () => 1 } }), 'INTENT_NOT_JSON');
  await refuseFacade(facade.send({ intentType: 'demo.p2', target: TARGET, messageId: 'm', input: { amount: Number.NaN } }), 'INTENT_NOT_JSON');
  await refuseFacade(facade.send({ intentType: 'demo.p2', target: 'bogus', messageId: 'm', input: {} }), 'TARGET_MALFORMED');
  await refuseFacade(facade.send({ intentType: 'demo.p2', target: TARGET, messageId: '', input: {} }), 'INTENT_MALFORMED');
  await refuseFacade(facade.send({ intentType: 'demo.p2', target: TARGET, input: {} }), 'INTENT_MALFORMED');
  await refuseFacade(facade.send({ intentType: 'demo.from-another-closure', target: TARGET, messageId: 'm', input: {} }), 'INTENT_UNBOUND');
  await refuseFacade(facade.query({ kind: 'warp' }), 'QUERY_KIND_UNKNOWN');
  assert.throws(
    () => facade.subscribe('nope' as unknown as () => void),
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'OBSERVER_INVALID',
  );
});

test('V08-ABI-B01-KPK02 thin-loader static proof: no engine, no business case, no byte import, protected Host only', async () => {
  const loaderRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'src', 'public-v8');
  const stripped = new Map<string, string>();
  async function strippedSource(name: string): Promise<string> {
    const cached = stripped.get(name);
    if (cached !== undefined) return cached;
    const raw = await readFile(path.join(loaderRoot, name), 'utf8');
    const value = raw
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/.*$/gm, ' ');
    stripped.set(name, value);
    return value;
  }
  // String literals carry prose (error messages, module specifiers), not
  // identifiers; the identifier-level scans below run on this form.
  async function strippedIdentifiers(name: string): Promise<string> {
    const value = (await strippedSource(name)).replace(/'[^'\n]*'|"[^"\n]*"/g, ' ');
    stripped.set(`identifiers:${name}`, value);
    return value;
  }
  for (const name of ['microkernel.ts', 'kernel-host.ts']) {
    const source = await strippedIdentifiers(name);
    assert.ok(!/\bimport\s*\(/.test(source), `${name}: the loader never imports sealed module bytes itself (no dynamic import anywhere)`);
    assert.ok(!source.includes('data:'), `${name}: no data: URL module instantiation (activation goes through the qualified path only)`);
    assert.ok(!/\bBuffer\b/.test(source), `${name}: the loader never decodes sealed bytes`);
    for (const forbidden of [
      'WorkflowInstanceEngine',
      'VolatileAdmissionEffectJournal',
      'admitCentralDecision',
      'executeEffectIntents',
      'invokeEffectfulTool',
      'PerInstanceSerializedLane',
      'createDomainRuntime',
    ]) {
      assert.ok(!new RegExp(`\\b${forbidden}\\b`).test(source), `${name}: no v0.7 engine identifier ${forbidden}`);
    }
    assert.ok(
      !/from\s+['"][^'"]*(\/engine\/|\/workflow\/|admission|public-v2|public-v7)/.test(source),
      `${name}: no v0.7 engine/workflow import`,
    );
    for (const domainWord of ['approval', 'parts', 'quote', 'invoice', 'warehouse', 'ledger']) {
      assert.ok(!new RegExp(`\\b${domainWord}\\b`).test(source), `${name}: no business special case (${domainWord})`);
    }
  }
  const micro = await strippedSource('microkernel.ts');
  assert.match(micro, /from\s+['"]\.\/load\.js['"]/, 'kernel activation goes through the merged qualified load() path');
  assert.match(micro, /from\s+['"]\.\/kernel-host\.js['"]/, 'the Host binding comes only from the protected channel');
  const microIdentifiers = await strippedIdentifiers('microkernel.ts');
  assert.doesNotMatch(microIdentifiers, /\boptions\b/, 'no options-overload residue (P1-L2-ABI-02)');
});

test('V08-ABI-B01-KPK03 the fixed closure: frozen seal, zero provider discovery or fallback', async () => {
  const closure = b01DefaultClosure('kpk03');
  const root = b01Seal(closure.input);
  // The producer deep-freezes the sealed root: the fixed closure cannot be
  // silently rewritten (strict-mode mutation throws).
  const firstSealed = root.packages.find((pkg) => pkg.packageId === closure.kernelId);
  assert.ok(firstSealed !== undefined);
  assert.throws(() => {
    (firstSealed as { moduleSha256: string }).moduleSha256 = '0'.repeat(64);
  }, TypeError);
  const facade = await DomainHarness.load(root);
  // An intent OUTSIDE the sealed closure is typed-denied; the loader never
  // discovers another provider and never falls back.
  await refuseFacade(
    facade.send({ intentType: 'demo.kpk03-unknown', target: TARGET, messageId: 'm', input: {} }),
    'INTENT_UNBOUND',
  );
  // A type bound by a DIFFERENT closure stays unbound here.
  const other = b01DefaultClosure('kpk03-other');
  b01Seal(other.input);
  await refuseFacade(
    facade.send({ intentType: other.input.businessIntentType, target: TARGET, messageId: 'm', input: {} }),
    'INTENT_UNBOUND',
  );
});

test('V08-ABI-B01-KPK08 identical kernel+SDK bytes serve two business domains; package switching keeps scopes isolated', async () => {
  const sharedKernelId = 'kernel:b01-shared@1.0.0';
  const sharedSdkId = 'std:b01-shared@1.0.0';
  const kernelSource = kernelFixture({ packageId: sharedKernelId });
  const sdkSource = sdkFixture(sharedSdkId);
  const approvalBusiness = businessFixture({ packageId: 'biz:b01-kpk08-approval@1.0.0', intentType: 'demo.approval', cap: 100 });
  const partsBusiness = businessFixture({ packageId: 'biz:b01-kpk08-parts@1.0.0', intentType: 'demo.parts', cap: 10 });
  const rootA = b01Seal({
    tag: 'kpk08a', kernelSource, sdkSource, businessSource: approvalBusiness, businessIntentType: 'demo.approval',
    kernelId: sharedKernelId, sdkId: sharedSdkId, businessId: 'biz:b01-kpk08-approval@1.0.0',
  });
  const rootB = b01Seal({
    tag: 'kpk08b', kernelSource, sdkSource, businessSource: partsBusiness, businessIntentType: 'demo.parts',
    kernelId: sharedKernelId, sdkId: sharedSdkId, businessId: 'biz:b01-kpk08-parts@1.0.0',
  });
  const sealedOf = (root: typeof rootA, id: string) => {
    const pkg = root.packages.find((candidate) => candidate.packageId === id);
    assert.ok(pkg !== undefined);
    return pkg;
  };
  assert.equal(sealedOf(rootA, sharedKernelId).moduleSha256, sealedOf(rootB, sharedKernelId).moduleSha256, 'identical kernel bytes');
  assert.equal(sealedOf(rootA, sharedSdkId).moduleSha256, sealedOf(rootB, sharedSdkId).moduleSha256, 'identical SDK bytes');
  assert.notEqual(rootA.build.closureDigest, rootB.build.closureDigest, 'distinct closures remain distinct');
  // Installing business B2 never altered the kernel package bytes.
  assert.notEqual(sealedOf(rootA, 'biz:b01-kpk08-approval@1.0.0').moduleSha256, sealedOf(rootB, 'biz:b01-kpk08-parts@1.0.0').moduleSha256);

  const facadeA = await DomainHarness.load(rootA);
  const facadeB = await DomainHarness.load(rootB);
  const approved = asReceipt(await facadeA.send({ intentType: 'demo.approval', target: TARGET, messageId: 'ma1', input: { amount: 42 } }));
  assert.equal(approved.status, 'admitted', 'approval cap admits 42');
  const reserved = asReceipt(await facadeB.send({ intentType: 'demo.parts', target: TARGET, messageId: 'mb1', input: { amount: 5 } }));
  assert.equal(reserved.status, 'admitted', 'parts cap admits 5');
  const denied = asReceipt(await facadeB.send({ intentType: 'demo.parts', target: TARGET, messageId: 'mb2', input: { amount: 42 } }));
  assert.equal(denied.status, 'denied', 'parts cap denies 42 — same kernel code, different business behavior');
  assert.equal(approved.kernel.moduleSha256, reserved.kernel.moduleSha256, 'the SAME sealed kernel bytes execute in both domains');

  // Package switching: per-scope instance state never mixes.
  const snapshotA = (await facadeA.query({ kind: 'instance', target: TARGET })) as { occurrences: number };
  const snapshotB = (await facadeB.query({ kind: 'instance', target: TARGET })) as { occurrences: number };
  assert.equal(snapshotA.occurrences, 1);
  assert.equal(snapshotB.occurrences, 2);
  // Stopping scope A never touches scope B.
  facadeA.stop();
  await refuseFacade(facadeA.send({ intentType: 'demo.approval', target: TARGET, messageId: 'ma2', input: { amount: 1 } }), 'FACADE_STOPPED');
  const stillOpen = asReceipt(await facadeB.send({ intentType: 'demo.parts', target: TARGET, messageId: 'mb3', input: { amount: 1 } }));
  assert.equal(stillOpen.status, 'admitted');
});

test('V08-ABI-B01-KPK12 no whole-package rehash: install performs zero Host digests, invoke/query perform none beyond the mechanism own pin', async () => {
  const closure = b01DefaultClosure('kpk12');
  const root = b01Seal(closure.input);
  const beforeLoad = host.digestInputs.length;
  const facade = await DomainHarness.load(root);
  assert.equal(host.digestInputs.length - beforeLoad, 0, 'byte verification is internal to the qualified installer; the Host digest port is untouched at install');
  const beforeSends = host.digestInputs.length;
  await facade.send({ intentType: 'demo.kpk12', target: TARGET, messageId: 'm1', input: { amount: 1 } });
  await facade.send({ intentType: 'demo.kpk12', target: TARGET, messageId: 'm2', input: { amount: 2 } });
  assert.equal(host.digestInputs.length - beforeSends, 2, 'exactly the mechanism own per-occurrence governance digest — never a package rehash');
  const beforeQuery = host.digestInputs.length;
  await facade.query({ kind: 'build' });
  await facade.query({ kind: 'instance', target: TARGET });
  assert.equal(host.digestInputs.length - beforeQuery, 0, 'the query path performs zero digests');
  // Across this whole process no digest input was ever a sealed module source.
  for (const input of host.digestInputs) {
    assert.ok(!input.includes('export const MODULE_ID'), 'no sealed package bytes are ever re-digested');
  }
});

test('V08-ABI-B01-LIFE stop() is final and idempotent; the scope refuses further use and clears observers', async () => {
  const closure = b01DefaultClosure('life');
  const facade = await DomainHarness.load(b01Seal(closure.input));
  const receipts: unknown[] = [];
  facade.subscribe((receipt) => receipts.push(receipt));
  await facade.send({ intentType: 'demo.life', target: TARGET, messageId: 'm1', input: { amount: 1 } });
  assert.equal(receipts.length, 1);
  facade.stop();
  facade.stop(); // idempotent
  await refuseFacade(facade.send({ intentType: 'demo.life', target: TARGET, messageId: 'm2', input: { amount: 1 } }), 'FACADE_STOPPED');
  await refuseFacade(facade.query({ kind: 'build' }), 'FACADE_STOPPED');
  assert.throws(
    () => facade.subscribe(() => {}),
    (error: unknown) => error instanceof QualifiedPackageError && error.code === 'FACADE_STOPPED',
  );
  assert.equal(receipts.length, 1, 'observers were cleared — no delivery after stop');
});

test('V08-ABI-B01-N1 fake second Host argument: strictly one-arg loader, injection is never read (P1-L2-ABI-02)', async () => {
  assert.equal(DomainHarness.load.length, 1, 'the public loader declares exactly one parameter — no options overload exists');
  const closure = b01DefaultClosure('n1');
  const root = b01Seal(closure.input);
  let evilTouches = 0;
  const evil = {
    hostPorts: {
      docs: {
        get: () => {
          evilTouches += 1;
          return null;
        },
        put: () => {
          evilTouches += 1;
        },
      },
      sha256: {
        digestUtf8: () => {
          evilTouches += 1;
          return '0'.repeat(64);
        },
      },
    },
  };
  // @ts-expect-error the ABI deliberately has no second parameter
  await refuseFacade(DomainHarness.load(root, evil), 'LOAD_ARITY_INVALID');
  assert.equal(evilTouches, 0, 'the injected Host-shaped argument was never read, pre-import or otherwise');
  // The refused attempt left no state: the honest one-arg load works identically.
  const facade = await DomainHarness.load(root);
  const receipt = asReceipt(await facade.send({ intentType: 'demo.n1', target: TARGET, messageId: 'm1', input: { amount: 3 } }));
  assert.equal(receipt.status, 'admitted', 'the fake second argument produced no effect on the legitimate load');
  assert.equal(host.docs.get(`occ:${closure.kernelId}:1`) !== undefined, true, 'storage went through the protected channel, not the fake');
});

test('V08-ABI-B01-N2 forged producerId: an unapproved root never loads and never executes', async () => {
  const closure = b01DefaultClosure('n2');
  const tampered = b01Clone(b01Seal(closure.input));
  (tampered.build as { producerId: string }).producerId = 'attacker-producer';
  await refuseFacade(DomainHarness.load(tampered), 'LOAD_PRODUCER_UNTRUSTED');
  assertClosureNeverExecuted('n2');
});

test('V08-ABI-B01-N3 transitive import path substitution is refused at BUILD before any seal exists', () => {
  const base = (tag: string, extraExports: string[]) => {
    const ids = b01PackageIds({ tag });
    return b01Submission({
      tag,
      kernelSource: kernelFixture({ packageId: ids.kernelId }),
      sdkSource: sdkFixture(ids.sdkId),
      businessSource: businessFixture({ packageId: ids.businessId, intentType: `demo.${tag}`, extraExports }),
      businessIntentType: `demo.${tag}`,
    });
  };
  // Dynamic import substitution (comment-obfuscation-proof AST scan).
  assert.throws(
    () => qualifyPackageClosure(base('n3a', [`export function smuggle() { return import(/**/ './side-channel.mjs'); }`])),
    (error: unknown) => error instanceof QualificationError && error.code === 'IMPORT_NOT_STATIC',
  );
  // Static import substitution to code outside the sealed byte set.
  assert.throws(
    () => qualifyPackageClosure(base('n3b', [`export * from './stolen.mjs';`])),
    (error: unknown) => error instanceof QualificationError && error.code === 'IMPORT_UNRESOLVED',
  );
  // Path escape out of the sealed module root.
  assert.throws(
    () => qualifyPackageClosure(base('n3c', [`export { smuggled } from '../../outside.mjs';`])),
    (error: unknown) => error instanceof QualificationError && error.code === 'IMPORT_ESCAPE',
  );
});

test('V08-ABI-B01-N4 no raw Kernel accessor, no raw Journal, no Host ports on the scoped or public surface', async () => {
  const facade = await DomainHarness.load(b01Seal(b01DefaultClosure('n4').input));
  for (const forbidden of [
    'kernelRuntime', 'getModuleNamespace', 'journal', 'mechanism', 'trace',
    'hostPorts', 'openInstance', 'observe', 'kernel', 'runtime', 'docs', 'sha256',
  ]) {
    assert.ok(!(forbidden in facade), `the scoped facade must not expose ${forbidden}`);
  }
  await refuseFacade(facade.query({ kind: 'journal' }), 'QUERY_KIND_REFUSED');
  await refuseFacade(facade.query({ kind: 'mechanism' }), 'QUERY_KIND_REFUSED');
  await refuseFacade(facade.query({ kind: 'counters' }), 'QUERY_KIND_REFUSED');
  // The public /v8 runtime surface is pinned exactly; the protected channels
  // (trust.ts, kernel-host.ts, installer.ts) are deep-imports only.
  const expected = [
    'DomainHarness', 'QualifiedPackageError',
    'V8_APPROVAL_PROOF_TYPE', 'V8_QUALIFIED_ABI', 'V8_QUALIFIED_PRODUCER_PREFIX', 'V8_QUALIFIED_ROOT_FORMAT',
    'approvalBindingDigest', 'canonicalJson', 'canonicalSnapshot', 'computeSubjectDigest', 'isApprovalProofShape', 'load', 'sha256Hex',
  ];
  assert.deepEqual(Object.keys(v8Public).sort(), [...expected].sort());
});

test('V08-ABI-B01-N5 wrong kernel version/ABI is refused at BUILD, and a wrong self-declared kind fails typed at install', async () => {
  // (a) Unknown kernel ABI version in the package descriptor: BUILD refuses
  // to qualify (the ABI registry is frozen; versions are not discoverable).
  const n5a = b01Submission({
    tag: 'n5a',
    kernelSource: kernelFixture({ packageId: 'kernel:b01-n5a@1.0.0' }),
    sdkSource: sdkFixture('std:b01-n5a@1.0.0'),
    businessSource: businessFixture({ packageId: 'biz:b01-n5a@1.0.0', intentType: 'demo.n5a' }),
    businessIntentType: 'demo.n5a',
  });
  const n5aKernel = n5a.packages.find((pkg) => pkg.kind === 'kernel');
  assert.ok(n5aKernel !== undefined);
  (n5aKernel as { abiVersion: string }).abiVersion = 'v08-kpk01-kernel-abi/9';
  assert.throws(
    () => qualifyPackageClosure(n5a),
    (error: unknown) => error instanceof QualificationError && error.code === 'QUALIFY_ABI_UNKNOWN',
  );
  // (b) Kernel package carrying the SDK ABI: kind/ABI disagreement at BUILD.
  const n5b = b01Submission({
    tag: 'n5b',
    kernelSource: kernelFixture({ packageId: 'kernel:b01-n5b@1.0.0' }),
    sdkSource: sdkFixture('std:b01-n5b@1.0.0'),
    businessSource: businessFixture({ packageId: 'biz:b01-n5b@1.0.0', intentType: 'demo.n5b' }),
    businessIntentType: 'demo.n5b',
  });
  const kernelEntry = n5b.packages.find((pkg) => pkg.kind === 'kernel');
  assert.ok(kernelEntry !== undefined);
  (kernelEntry as { abiVersion: string }).abiVersion = 'v08-standard-sdk-abi/1';
  assert.throws(
    () => qualifyPackageClosure(n5b),
    (error: unknown) => error instanceof QualificationError && error.code === 'QUALIFY_KIND_ABI_MISMATCH',
  );
  // (c) A module self-declaring the wrong PACKAGE_KIND seals (BUILD checks
  // exports, not export VALUES) and then fails typed at the trusted
  // installation boundary — with only the offending module evaluated.
  const wrongKindRoot = b01Seal({
    tag: 'n5c',
    kernelSource: kernelFixture({ packageId: 'kernel:b01-n5c@1.0.0', wrongKind: 'standard-sdk' }),
    sdkSource: sdkFixture('std:b01-n5c@1.0.0'),
    businessSource: businessFixture({ packageId: 'biz:b01-n5c@1.0.0', intentType: 'demo.n5c' }),
    businessIntentType: 'demo.n5c',
  });
  await refuseFacade(DomainHarness.load(wrongKindRoot), 'MODULE_IDENTITY_MISMATCH');
  assert.equal(b01SentinelCount('kernel:b01-n5c@1.0.0'), 1, 'documented JS residual: the offending module evaluated before its identity check');
  assert.equal(b01SentinelCount('std:b01-n5c@1.0.0'), 0, 'sequential activation: nothing after the failing module evaluated');
  assert.equal(b01SentinelCount('biz:b01-n5c@1.0.0'), 0);
});

test('V08-ABI-B01-N6 incomplete install leaves no side effect, and the loader state stays clean', async () => {
  // (a) Bytes mutated after sealing: whole-closure preflight refuses BEFORE
  // the first import — every sentinel stays 0.
  const n6a = b01DefaultClosure('n6a');
  const tampered = b01Clone(b01Seal(n6a.input));
  const businessEntry = tampered.packages.find((pkg) => pkg.packageId === n6a.businessId);
  assert.ok(businessEntry !== undefined);
  const mutatedSource = businessEntry.moduleSource.replace('within-cap', 'MUTATED-CAP');
  assert.notEqual(mutatedSource, businessEntry.moduleSource);
  (businessEntry as { moduleSource: string }).moduleSource = mutatedSource;
  await refuseFacade(DomainHarness.load(tampered), 'INSTALL_BYTES_MUTATED');
  assertClosureNeverExecuted('n6a');

  // (b) Business policy activation throws: typed failure, mechanism never
  // constructed, zero mechanism side effects.
  const n6b = b01PackageIds({ tag: 'n6b' });
  const n6bRoot = b01Seal({
    tag: 'n6b',
    kernelSource: kernelFixture({ packageId: n6b.kernelId }),
    sdkSource: sdkFixture(n6b.sdkId),
    businessSource: businessFixture({ packageId: n6b.businessId, intentType: 'demo.n6b', failPolicy: true }),
    businessIntentType: 'demo.n6b',
  });
  await refuseFacade(DomainHarness.load(n6bRoot), 'ACTIVATION_FAILED');
  assert.equal([...host.docs.keys()].some((key) => key.startsWith(`occ:${n6b.kernelId}`)), false, 'no kernel mechanism side effect survived the failed activation');

  // (c) Kernel mechanism construction throws: same guarantee.
  const n6c = b01PackageIds({ tag: 'n6c' });
  const n6cRoot = b01Seal({
    tag: 'n6c',
    kernelSource: kernelFixture({ packageId: n6c.kernelId, failActivation: true }),
    sdkSource: sdkFixture(n6c.sdkId),
    businessSource: businessFixture({ packageId: n6c.businessId, intentType: 'demo.n6c' }),
    businessIntentType: 'demo.n6c',
  });
  await refuseFacade(DomainHarness.load(n6cRoot), 'ACTIVATION_FAILED');
  assert.equal([...host.docs.keys()].some((key) => key.startsWith(`occ:${n6c.kernelId}`)), false, 'no kernel mechanism side effect survived the failed activation');

  // (d) A non-callable SDK endpoint passes the byte/identity install but is
  // refused typed at the wiring boundary.
  const n6d = b01PackageIds({ tag: 'n6d' });
  const n6dRoot = b01Seal({
    tag: 'n6d',
    kernelSource: kernelFixture({ packageId: n6d.kernelId }),
    sdkSource: sdkFixture(n6d.sdkId, { nonCallableEndpoint: true }),
    businessSource: businessFixture({ packageId: n6d.businessId, intentType: 'demo.n6d' }),
    businessIntentType: 'demo.n6d',
  });
  await refuseFacade(DomainHarness.load(n6dRoot), 'ENDPOINT_INVALID');

  // (e) After every failed activation the loader state is clean: a good
  // closure still loads and admits.
  const ok = b01DefaultClosure('n6ok');
  const facade = await DomainHarness.load(b01Seal(ok.input));
  const receipt = asReceipt(await facade.send({ intentType: 'demo.n6ok', target: TARGET, messageId: 'm1', input: { amount: 7 } }));
  assert.equal(receipt.status, 'admitted');
});

test('V08-ABI-B01-N8 forged attestation and unregistered issuer fail closed with zero execution (trusted process)', async () => {
  // Attestation minted with a key that is NOT the process-trusted issuer
  // secret: the sealed root exists (the issuer side held that key), but the
  // load trust gate refuses it cryptographically.
  const n8a = b01DefaultClosure('n8a');
  const wrongKey = b01Seal(n8a.input, B01_ISSUER, B01_ATTACKER_SECRET);
  await refuseFacade(DomainHarness.load(wrongKey), 'FORGED_ATTESTATION');
  // Issuer id that was never registered in THIS process.
  const n8b = b01DefaultClosure('n8b');
  const stranger = b01Seal(n8b.input, 'dac-issuer:stranger-tb', 'stranger-secret');
  await refuseFacade(DomainHarness.load(stranger), 'UNTRUSTED_ISSUER');
  assertClosureNeverExecuted('n8a');
  assertClosureNeverExecuted('n8b');
});
