/**
 * KPK-10 — raw/unqualified manifest
 * =================================
 * An uncompiled/unapproved producer candidate cannot be loaded: the failure
 * occurs at the CONTROLLED PRODUCER (build-time static qualification) or at
 * the trusted Host installation boundary (load-time shape/digest/identity
 * checks). The Microkernel has NO redundant semantic legality engine — only
 * generic structural checks.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { load, buildPackageRoot, createMemoryHost, MicrokernelError, ProducerError } from '../index.mjs';
import { NOW } from './helpers.mjs';
import { writeEvidence } from './evidence.mjs';

test('KPK-10: producer rejects unqualified candidates BEFORE any load', async () => {
  // Wrong Kind: the SDK module submitted under the business ABI.
  await assert.rejects(
    () => buildPackageRoot({
      rootPackageId: 'app:bogus@1',
      businessModule: 'sdk-standard.mjs',
    }),
    (error) => error instanceof ProducerError && (
      error.code === 'PRODUCER_KIND_MISMATCH' || error.code === 'PRODUCER_EXPORT_MISSING'
    ),
  );

  // Wrong provider role: the kernel module submitted as the SDK.
  await assert.rejects(
    () => buildPackageRoot({
      rootPackageId: 'app:bogus@2',
      sdkModule: 'kernel-mechanism-v1.mjs',
      businessModule: 'business-approval.mjs',
    }),
    (error) => error instanceof ProducerError && (
      error.code === 'PRODUCER_KIND_MISMATCH' || error.code === 'PRODUCER_ABI_MISMATCH' || error.code === 'PRODUCER_EXPORT_MISSING'
    ),
  );

  await writeEvidence('kpk10-producer-qualification', {
    falsifier: 'KPK-10',
    wrongKindRejected: 'PRODUCER_KIND_MISMATCH/PRODUCER_EXPORT_MISSING',
    wrongProviderRejected: 'PRODUCER_KIND_MISMATCH/PRODUCER_ABI_MISMATCH',
  });
});

test('KPK-10: load rejects raw/unsealed manifests with typed installation errors', async () => {
  const host = createMemoryHost({ now: () => NOW });
  const pkg = await buildPackageRoot({ rootPackageId: 'app:order-approval@1.0.0', businessModule: 'business-approval.mjs' });

  // Raw hand-authored manifest: not a sealed root at all.
  await assert.rejects(
    () => load({ packages: [], bindings: [] }, { hostPorts: host }),
    (error) => error instanceof MicrokernelError && error.code === 'LOAD_NOT_A_SEALED_ROOT',
  );

  // Untrusted producer id.
  await assert.rejects(
    () => load({ ...JSON.parse(JSON.stringify(pkg)), build: { ...pkg.build, producerId: 'random-person' } }, { hostPorts: host }),
    (error) => error instanceof MicrokernelError && error.code === 'LOAD_PRODUCER_UNTRUSTED',
  );

  // Sealed shape but a package claims an ABI whose kind it is not.
  const kindSwap = JSON.parse(JSON.stringify(pkg));
  kindSwap.packages[1].kind = 'kernel';
  await assert.rejects(
    () => load(kindSwap, { hostPorts: host }),
    (error) => error instanceof MicrokernelError && error.code === 'LOAD_KIND_ABI_MISMATCH',
  );

  // A package whose module self-identifies under another identity.
  const impostor = JSON.parse(JSON.stringify(pkg));
  impostor.packages[2] = { ...impostor.packages[2], packageId: 'business-order-approval@1.0.0' };
  impostor.packages[2].moduleSource = impostor.packages[2].moduleSource
    .replace("export const MODULE_ID = 'business-order-approval@1.0.0';", "export const MODULE_ID = 'kernel-vnext@1.0.0';");
  impostor.packages[2].moduleSha256 = (await import('node:crypto'))
    .createHash('sha256').update(impostor.packages[2].moduleSource, 'utf8').digest('hex');
  await assert.rejects(
    () => load(impostor, { hostPorts: host }),
    (error) => error instanceof MicrokernelError && error.code === 'MODULE_IDENTITY_MISMATCH',
  );

  // Missing mechanism: a kernel module stripped of its endpoint factory.
  const stripped = JSON.parse(JSON.stringify(pkg));
  stripped.packages[0].moduleSource = stripped.packages[0].moduleSource
    .replace('export function createOccurrenceRuntime', 'function createOccurrenceRuntime');
  stripped.packages[0].moduleSha256 = (await import('node:crypto'))
    .createHash('sha256').update(stripped.packages[0].moduleSource, 'utf8').digest('hex');
  await assert.rejects(
    () => load(stripped, { hostPorts: host }),
    (error) => error instanceof MicrokernelError && error.code === 'MODULE_IDENTITY_MISMATCH',
  );

  await writeEvidence('kpk10-load-boundary', {
    falsifier: 'KPK-10',
    rejections: [
      'LOAD_NOT_A_SEALED_ROOT', 'LOAD_PRODUCER_UNTRUSTED', 'LOAD_KIND_ABI_MISMATCH',
      'MODULE_IDENTITY_MISMATCH (identity impostor)', 'MODULE_IDENTITY_MISMATCH (missing mechanism export)',
    ],
    note: 'all failures occur at producer/build or Host installation; the Microkernel runs no semantic legality engine',
  });
});
