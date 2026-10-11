/**
 * V08-ABI-B01 physical K/S/B package fixtures (T-B, #1001).
 * ==========================================================
 *
 * Test-only producer helpers for the T-B microkernel facade tests. Sealed
 * qualified roots are built through the REAL T-A BUILD path —
 * `qualifyPackageClosure` (static AST qualification) → `issueApprovalProof`
 * (the ISSUER-side tool; tests act as the genuine external issuer) →
 * `buildQualifiedPackage` — never hand-minted, and never a second build
 * path. The K/S/B modules are minimal but physically real: they carry
 * top-level execution sentinels (import evidence) and a kernel mechanism
 * that actually consumes every endpoint the loader must wire (Host ports,
 * SDK rule interpreter, business policy, observer).
 *
 * Kernel semantics stay T-C's (#1002): these fixtures prove the LOADER's
 * wiring, not the mechanism.
 */

import { createHash } from 'node:crypto';

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
  type QualificationSubmission,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import type {
  QualifiedBinding,
  SealedQualifiedPackageRoot,
} from '../../src/public-v8/index.js';
import type { V8KernelHostPorts } from '../../src/public-v8/kernel-host.js';

export const B01_ISSUER = 'dac-issuer:test';
export const B01_ISSUER_SECRET = 'dac-issuer-secret:tb-fixture';
export const B01_ATTACKER_SECRET = 'attacker-secret:tb-fixture';

/** Top-level execution sentinel registry: packageId → evaluation count. */
export const B01_SENTINEL = '__v08B01ExecutionSentinel' as const;

export function b01SentinelCount(packageId: string): number {
  const registry = (globalThis as Record<string, unknown>)[B01_SENTINEL] as Record<string, number> | undefined;
  return registry?.[packageId] ?? 0;
}

// ---------------------------------------------------------------------------
// Sealed module fixtures (plain ESM, statically analyzable, self-contained).
// ---------------------------------------------------------------------------

function sentinelLines(packageId: string): string[] {
  const key = JSON.stringify(packageId);
  return [
    `globalThis.${B01_SENTINEL} ??= {};`,
    `globalThis.${B01_SENTINEL}[${key}] = (globalThis.${B01_SENTINEL}[${key}] ?? 0) + 1;`,
  ];
}

export interface KernelFixtureOptions {
  readonly packageId: string;
  /** Sabotage mechanism construction (activation-failure vectors). */
  readonly failActivation?: boolean | undefined;
  /** Declare a wrong PACKAGE_KIND (post-seal identity failure). */
  readonly wrongKind?: string | undefined;
  /** Extra raw export lines (transitive-substitution vectors). */
  readonly extraExports?: string[] | undefined;
}

export function kernelFixture(options: KernelFixtureOptions): string {
  return [
    ...sentinelLines(options.packageId),
    `export const MODULE_ID = ${JSON.stringify(options.packageId)};`,
    `export const PACKAGE_KIND = ${JSON.stringify(options.wrongKind ?? 'kernel')};`,
    `export const ABI_VERSION = 'v08-kernel-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];`,
    ...(options.extraExports ?? []),
    `export function createOccurrenceRuntime(deps) {`,
    ...(options.failActivation === true ? [`  throw new Error('kernel-mechanism-construction-sabotage');`] : []),
    ...(options.failActivation === true ? [] : [
      `  const docs = deps.hostPorts.docs;`,
      `  const digester = deps.hostPorts.sha256.digestUtf8;`,
      `  let occurrences = 0;`,
      `  return {`,
      `    async submitOccurrence(intent) {`,
      `      occurrences += 1;`,
      `      const interpreted = deps.sdkEndpoint.interpret(intent.input);`,
      `      const decision = deps.businessEndpoint.decide(intent, interpreted);`,
      `      const body = JSON.stringify({ input: intent.input, decision });`,
      `      const pin = digester(body);`,
      `      await docs.put('occ:' + deps.moduleIdentity.packageId + ':' + occurrences, { pin, by: deps.moduleIdentity.packageId });`,
      `      const receipt = {`,
      `        status: decision.admit ? 'admitted' : 'denied',`,
      `        occurrence: occurrences,`,
      `        pin,`,
      `        kernel: { packageId: deps.moduleIdentity.packageId, moduleSha256: deps.moduleIdentity.moduleSha256 },`,
      `        interpreted,`,
      `        decision,`,
      `      };`,
      `      deps.observe(receipt);`,
      `      return receipt;`,
      `    },`,
      `    async getSnapshot(target) {`,
      `      return { target, occurrences, kernel: deps.moduleIdentity };`,
      `    },`,
      `  };`,
    ]),
    `}`,
    '',
  ].join('\n');
}

export function sdkFixture(packageId: string, opts: { nonCallableEndpoint?: boolean | undefined } = {}): string {
  return [
    ...sentinelLines(packageId),
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    `export const PACKAGE_KIND = 'standard-sdk';`,
    `export const ABI_VERSION = 'v08-standard-sdk-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];`,
    ...(opts.nonCallableEndpoint === true ? [`export const interpret = 42;`] : [
      `export function interpret(input) {`,
      `  if (input !== null && typeof input === 'object' && !Array.isArray(input)) {`,
      `    return Object.assign({}, input);`,
      `  }`,
      `  return { value: input === undefined ? null : input };`,
      `}`,
    ]),
    '',
  ].join('\n');
}

export interface BusinessFixtureOptions {
  readonly packageId: string;
  readonly intentType: string;
  /** Admission cap the minimal policy enforces over `amount`. */
  readonly cap?: number | undefined;
  /** Policy resolution throws (activation-failure vector). */
  readonly failPolicy?: boolean | undefined;
  /** Extra raw export lines (transitive-substitution vectors). */
  readonly extraExports?: string[] | undefined;
}

export function businessFixture(options: BusinessFixtureOptions): string {
  const cap = options.cap ?? 100;
  return [
    ...sentinelLines(options.packageId),
    `export const MODULE_ID = ${JSON.stringify(options.packageId)};`,
    `export const PACKAGE_KIND = 'business';`,
    `export const ABI_VERSION = 'v08-business-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];`,
    `export const INTENT_TYPES = [${JSON.stringify(options.intentType)}];`,
    ...(options.extraExports ?? []),
    `export function getPolicy() {`,
    ...(options.failPolicy === true ? [`  throw new Error('business-policy-sabotage');`] : []),
    ...(options.failPolicy === true ? [] : [
      `  return {`,
      `    packageId: MODULE_ID,`,
      `    decide(intent, interpreted) {`,
      `      const amount = Number(interpreted && interpreted.amount);`,
      `      if (!Number.isFinite(amount)) return { admit: false, reason: 'amount-required' };`,
      `      return { admit: amount <= ${cap}, reason: amount <= ${cap} ? 'within-cap' : 'over-cap' };`,
      `    },`,
      `  };`,
    ]),
    `}`,
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Closure assembly through the REAL compiler BUILD path.
// ---------------------------------------------------------------------------

export interface B01ClosureInput {
  readonly tag: string;
  readonly kernelSource: string;
  readonly sdkSource: string;
  readonly businessSource: string;
  readonly businessIntentType: string;
  readonly kernelId?: string | undefined;
  readonly sdkId?: string | undefined;
  readonly businessId?: string | undefined;
  readonly rootPackageId?: string | undefined;
}

export interface B01ClosureIds {
  readonly kernelId: string;
  readonly sdkId: string;
  readonly businessId: string;
}

export function b01PackageIds(input: Pick<B01ClosureInput, 'tag'> & { readonly kernelId?: string | undefined; readonly sdkId?: string | undefined; readonly businessId?: string | undefined }): B01ClosureIds {
  return {
    kernelId: input.kernelId ?? `kernel:b01-${input.tag}@1.0.0`,
    sdkId: input.sdkId ?? `std:b01-${input.tag}@1.0.0`,
    businessId: input.businessId ?? `biz:b01-${input.tag}@1.0.0`,
  };
}

export function b01Submission(input: B01ClosureInput): QualificationSubmission {
  const ids = b01PackageIds(input);
  const packages = [
    {
      packageId: ids.kernelId,
      kind: 'kernel' as const,
      abiVersion: 'v08-kernel-abi/1',
      modulePath: 'modules/kernel.mjs',
      moduleSource: input.kernelSource,
      endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }],
    },
    {
      packageId: ids.sdkId,
      kind: 'standard-sdk' as const,
      abiVersion: 'v08-standard-sdk-abi/1',
      modulePath: 'modules/sdk.mjs',
      moduleSource: input.sdkSource,
      endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }],
    },
    {
      packageId: ids.businessId,
      kind: 'business' as const,
      abiVersion: 'v08-business-abi/1',
      modulePath: 'modules/business.mjs',
      moduleSource: input.businessSource,
      endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }],
      intentTypes: [input.businessIntentType],
    },
  ];
  const bindings: QualifiedBinding[] = [
    { role: 'kernel', packageId: ids.kernelId, endpointId: 'occurrence-runtime' },
    { role: 'standard-sdk', packageId: ids.sdkId, endpointId: 'rule-interpreter' },
    { role: 'business', packageId: ids.businessId, endpointId: 'business-policy' },
    { role: 'intent', intentType: input.businessIntentType, packageId: ids.businessId, endpointId: 'business-policy' },
  ];
  return { rootPackageId: input.rootPackageId ?? `app:b01-${input.tag}@1.0.0`, packages, bindings };
}

/**
 * Qualify → externally issue → seal, exactly as the governance flow does.
 * The BUILD-side registry is the ISSUER-side mapping (tests act as the
 * issuer); the LOAD-side process registry is installed separately by the
 * test files — keeping the two sides distinct is what makes the forged /
 * unregistered-issuer vectors honest.
 */
export function b01Seal(
  input: B01ClosureInput,
  issuerId: string = B01_ISSUER,
  issuerSecret: string = B01_ISSUER_SECRET,
): SealedQualifiedPackageRoot {
  const submission = b01Submission(input);
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({ subjectDigest: unsigned.subjectDigest, issuerId, issuerSecret });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[issuerId, issuerSecret]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
  });
}

/** Convenience: the standard happy-path closure for a tag (cap 100). */
export function b01DefaultClosure(tag: string, cap = 100): { input: B01ClosureInput } & B01ClosureIds {
  const ids = b01PackageIds({ tag });
  return {
    ...ids,
    input: {
      tag,
      kernelSource: kernelFixture({ packageId: ids.kernelId }),
      sdkSource: sdkFixture(ids.sdkId),
      businessSource: businessFixture({ packageId: ids.businessId, intentType: `demo.${tag}`, cap }),
      businessIntentType: `demo.${tag}`,
    },
  };
}

/** Raw-JSON clone that sheds the producer's deep freeze (tamper vectors). */
export function b01Clone(root: SealedQualifiedPackageRoot): SealedQualifiedPackageRoot {
  return JSON.parse(JSON.stringify(root)) as SealedQualifiedPackageRoot;
}

// ---------------------------------------------------------------------------
// Memory kernel Host (the protected channel's bootstrap input in tests).
// ---------------------------------------------------------------------------

export interface B01MemoryHost {
  readonly ports: V8KernelHostPorts;
  readonly docs: Map<string, unknown>;
  readonly puts: { key: string; value: unknown }[];
  readonly digestInputs: string[];
}

export function b01MemoryHost(): B01MemoryHost {
  const docs = new Map<string, unknown>();
  const puts: { key: string; value: unknown }[] = [];
  const digestInputs: string[] = [];
  return {
    docs,
    puts,
    digestInputs,
    ports: {
      docs: {
        get: (key: string) => docs.get(key),
        put: (key: string, value: unknown) => {
          docs.set(key, value);
          puts.push({ key, value });
        },
      },
      sha256: {
        digestUtf8: (value: string) => {
          digestInputs.push(value);
          return createHash('sha256').update(value, 'utf8').digest('hex');
        },
      },
    },
  };
}
