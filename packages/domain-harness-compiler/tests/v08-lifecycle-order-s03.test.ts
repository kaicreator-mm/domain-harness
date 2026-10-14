/**
 * V08-S03 — BUILD-boundary pins for the package lifecycle order (#1023 S03).
 * ===========================================================================
 *
 * The S03 runtime lifecycle contract (optional `init(context)` /
 * `dispose(context)` on the selected closure) draws its dependency order
 * from the sealed root's `packages` ARRAY ORDER: BUILD seals the closure in
 * the producer's submission order, init runs ascending, dispose runs
 * descending. These vectors pin the two BUILD facts that contract rests on:
 *
 *   - S03-B1 `qualifyPackageClosure` and `buildQualifiedPackage` preserve
 *     the submission order verbatim in `unsigned.packages` and the sealed
 *     root's `packages` (no reordering, sorting or canonicalization).
 *   - S03-B2 the order is INSIDE the approval subject digest: the same
 *     packages sealed in a different order subject a different closure, so
 *     an approval can never be replayed onto a reordered lifecycle.
 *
 * These are pins of pre-existing BUILD behavior (not red-phase rejections
 * — S03 adds no BUILD-side rule); they exist so a future "canonical
 * ordering" change cannot silently break the lifecycle contract. The
 * activation-side vectors (ordering, failure cleanup, typed errors) live
 * in packages/domain-harness/tests/v08-abi/v08-abi-s03-lifecycle.test.ts.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
} from '../src/qualified-package/index.js';

const ISSUER_ID = 'dac-issuer:s03-order';
const ISSUER_SECRET = 'issuer-secret-material:s03-order';

function moduleSource(kind: 'kernel' | 'standard-sdk' | 'business', packageId: string, intentType?: string): string {
  const head = [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    `export const PACKAGE_KIND = ${JSON.stringify(kind)};`,
  ];
  if (kind === 'kernel') {
    return [
      ...head,
      "export const ABI_VERSION = 'v08-kernel-abi/1';",
      "export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];",
      'export function createOccurrenceRuntime() { return {}; }',
      '',
    ].join('\n');
  }
  if (kind === 'standard-sdk') {
    return [
      ...head,
      "export const ABI_VERSION = 'v08-standard-sdk-abi/1';",
      "export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];",
      'export function interpret() { return null; }',
      '',
    ].join('\n');
  }
  return [
    ...head,
    "export const ABI_VERSION = 'v08-business-abi/1';",
    "export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];",
    `export const INTENT_TYPES = [${JSON.stringify(intentType ?? 'demo.order')}];`,
    'export function getPolicy() { return { packageId: MODULE_ID }; }',
    '',
  ].join('\n');
}

interface OrderFixture {
  readonly submission: QualificationSubmission;
  readonly order: readonly string[];
}

/** A K/S/B closure whose submission order is deliberately NOT alphabetical. */
function orderFixture(tag: string): OrderFixture {
  const kernelId = `biz-order:${tag}-kernel@1.0.0`; // sorts AFTER the others on purpose
  const sdkId = `a-order:${tag}-sdk@1.0.0`;
  const businessId = `m-order:${tag}-business@1.0.0`;
  const submission: QualificationSubmission = {
    rootPackageId: `app:s03-order-${tag}@1.0.0`,
    packages: [
      {
        packageId: kernelId,
        kind: 'kernel',
        abiVersion: 'v08-kernel-abi/1',
        modulePath: 'modules/kernel.mjs',
        moduleSource: moduleSource('kernel', kernelId),
        endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
      },
      {
        packageId: sdkId,
        kind: 'standard-sdk',
        abiVersion: 'v08-standard-sdk-abi/1',
        modulePath: 'modules/sdk.mjs',
        moduleSource: moduleSource('standard-sdk', sdkId),
        endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
      },
      {
        packageId: businessId,
        kind: 'business',
        abiVersion: 'v08-business-abi/1',
        modulePath: 'modules/business.mjs',
        moduleSource: moduleSource('business', businessId, `demo.s03-order-${tag}`),
        endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
        intentTypes: [`demo.s03-order-${tag}`],
      },
    ],
    bindings: [
      { role: 'kernel', packageId: kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: `demo.s03-order-${tag}`, packageId: businessId, endpointId: 'business-policy' },
    ],
  };
  return { submission, order: [kernelId, sdkId, businessId] };
}

function seal(submission: QualificationSubmission) {
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId: ISSUER_ID, issuerSecret: ISSUER_SECRET });
  const root = buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[ISSUER_ID, ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
  });
  return { unsigned, root };
}

test('V08-S03-B1 BUILD preserves the producer submission order through qualification and sealing (the lifecycle order contract)', () => {
  const fixture = orderFixture('b1');
  const { unsigned, root } = seal(fixture.submission);
  assert.deepEqual(
    unsigned.packages.map((pkg) => pkg.packageId),
    [...fixture.order],
    'the unsigned qualification keeps the submission order verbatim',
  );
  assert.deepEqual(
    root.packages.map((pkg) => pkg.packageId),
    [...fixture.order],
    'the sealed root keeps the submission order verbatim — init ascending / dispose descending are defined over it',
  );
});

test('V08-S03-B2 the sealed order is inside the approval subject: a reordered closure subjects a different digest', () => {
  const first = orderFixture('b2a');
  const second = orderFixture('b2b');
  // Same three packages, same bytes, DIFFERENT submission order.
  const reordered: QualificationSubmission = {
    ...second.submission,
    packages: [...second.submission.packages].reverse(),
  };
  const a = seal(first.submission);
  const b = seal(second.submission);
  const c = seal(reordered);
  assert.notEqual(a.unsigned.subjectDigest, b.unsigned.subjectDigest, 'sanity: distinct roots subject distinct digests');
  assert.notEqual(
    b.unsigned.subjectDigest,
    c.unsigned.subjectDigest,
    'reordering the SAME packages changes the subject digest — an approval can never be replayed onto a reordered lifecycle',
  );
  assert.deepEqual(
    c.root.packages.map((pkg) => pkg.packageId),
    [...second.order].reverse(),
    'the reordered submission seals in ITS order (BUILD-fixed, not normalized)',
  );
});
