/**
 * #1023 S01 clean-process child — trusted-deployment install/activation legs
 * that REQUIRE a fresh process (one-shot channels cannot be reinstalled):
 * restart revocation durability, per-Store reference opacity, missing-channel
 * fail-closed, stale-proof currentness, deployment-audience binding and
 * authorized-withdrawal restart durability (S01-R1).
 *
 * argv: <mode> [...args]
 *   deploy <sqlite> <tag>                 → { ok, handle }
 *   load <sqlite> <handle>                → { ok, rootPackageId } | { ok:false, code }
 *   revoke <sqlite> <handle>              → { ok }
 *   withdraw <sqlite> <handle>            → { ok } (authorized issuer withdrawal)
 *   cross-audience-load <sqlite> <handle> → { ok:false, code } (SAME store, DIFFERENT audience)
 *   nochannel <handle>                    → { ok:false, code } (trust gate only)
 *   stale-install <sqlite>                → { ok:false, code } (maxProofAgeMs at INSTALL)
 *   stale-activation <sqlite>             → { ok:false, code } (ages out at ACTIVATION)
 *
 * Prints ONE `JSON_RESULT: {...}` line for the parent to assert; exit 0.
 */

import {
  buildQualifiedPackage,
  issueApprovalProof,
  qualifyPackageClosure,
} from '../../../domain-harness-compiler/src/qualified-package/index.js';
import { load } from '../../src/public-v8/index.js';
import { deployInstallPackage, revokeDeployedApproval, withdrawDeploymentIssuer } from '../../src/public-v8/deploy.js';
import { installTrustedIssuers } from '../../src/public-v8/trust.js';
import { bootstrapTrustedHost } from '../../src/host-v8/index.js';

const ISSUER = 'dac-issuer:s01';
const ISSUER_SECRET = 'dac-issuer-secret:s01-material';
const AUDIENCE = 'dh-v08-s01-child';
/** S01-R1-P1-02: the cross-audience leg boots the SAME store under a DIFFERENT audience. */
const AUDIENCE_B = 'dh-v08-s01-child-b';

/** Minimal self-contained K/S/B module bytes (sentinel-keyed by packageId). */
function closureSources(tag) {
  const kernelId = `kernel:s01-${tag}@1.0.0`;
  const sdkId = `std:s01-${tag}@1.0.0`;
  const businessId = `biz:s01-${tag}@1.0.0`;
  const kernel = [
    `globalThis.__s01ChildSentinel ??= {};`,
    `globalThis.__s01ChildSentinel[${JSON.stringify(kernelId)}] = (globalThis.__s01ChildSentinel[${JSON.stringify(kernelId)}] ?? 0) + 1;`,
    `export const MODULE_ID = ${JSON.stringify(kernelId)};`,
    `export const PACKAGE_KIND = 'kernel';`,
    `export const ABI_VERSION = 'v08-kernel-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];`,
    `export function createOccurrenceRuntime(deps) {`,
    `  return {`,
    `    async submitOccurrence(intent) {`,
    `      const interpreted = deps.sdkEndpoint.interpret(intent.input);`,
    `      const decision = deps.businessEndpoint.decide(intent, interpreted);`,
    `      const receipt = { status: decision.admit ? 'admitted' : 'denied', kernel: deps.moduleIdentity.packageId };`,
    `      deps.observe(receipt);`,
    `      return receipt;`,
    `    },`,
    `    async getSnapshot(target) { return { target, kernel: deps.moduleIdentity.packageId }; },`,
    `  };`,
    `}`,
    ``,
  ].join('\n');
  const sdk = [
    `globalThis.__s01ChildSentinel ??= {};`,
    `globalThis.__s01ChildSentinel[${JSON.stringify(sdkId)}] = (globalThis.__s01ChildSentinel[${JSON.stringify(sdkId)}] ?? 0) + 1;`,
    `export const MODULE_ID = ${JSON.stringify(sdkId)};`,
    `export const PACKAGE_KIND = 'standard-sdk';`,
    `export const ABI_VERSION = 'v08-standard-sdk-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];`,
    `export function interpret(input) {`,
    `  if (input !== null && typeof input === 'object' && !Array.isArray(input)) return Object.assign({}, input);`,
    `  return { value: input === undefined ? null : input };`,
    `}`,
    ``,
  ].join('\n');
  const business = [
    `globalThis.__s01ChildSentinel ??= {};`,
    `globalThis.__s01ChildSentinel[${JSON.stringify(businessId)}] = (globalThis.__s01ChildSentinel[${JSON.stringify(businessId)}] ?? 0) + 1;`,
    `export const MODULE_ID = ${JSON.stringify(businessId)};`,
    `export const PACKAGE_KIND = 'business';`,
    `export const ABI_VERSION = 'v08-business-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];`,
    `export const INTENT_TYPES = ['demo.s01-child-${tag}'];`,
    `export function getPolicy() {`,
    `  return {`,
    `    packageId: MODULE_ID,`,
    `    workflowDefinition: { workflowKey: 's01-child-flow' },`,
    `    decide(intent, interpreted) {`,
    `      const amount = Number(interpreted && interpreted.amount);`,
    `      if (!Number.isFinite(amount)) return { admit: false, reason: 'amount-required' };`,
    `      return { admit: amount <= 100, reason: amount <= 100 ? 'within-cap' : 'over-cap' };`,
    `    },`,
    `  };`,
    `}`,
    ``,
  ].join('\n');
  return { kernelId, sdkId, businessId, kernel, sdk, business };
}

function seal(tag, issuedAt) {
  const sources = closureSources(tag);
  const submission = {
    rootPackageId: `app:s01-${tag}@1.0.0`,
    packages: [
      { packageId: sources.kernelId, kind: 'kernel', abiVersion: 'v08-kernel-abi/1', modulePath: 'modules/kernel.mjs', moduleSource: sources.kernel, endpoints: [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }] },
      { packageId: sources.sdkId, kind: 'standard-sdk', abiVersion: 'v08-standard-sdk-abi/1', modulePath: 'modules/sdk.mjs', moduleSource: sources.sdk, endpoints: [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }] },
      { packageId: sources.businessId, kind: 'business', abiVersion: 'v08-business-abi/1', modulePath: 'modules/business.mjs', moduleSource: sources.business, endpoints: [{ endpointId: 'business-policy', kind: 'business-policy' }], intentTypes: [`demo.s01-child-${tag}`] },
    ],
    bindings: [
      { role: 'kernel', packageId: sources.kernelId, endpointId: 'occurrence-runtime' },
      { role: 'standard-sdk', packageId: sources.sdkId, endpointId: 'rule-interpreter' },
      { role: 'business', packageId: sources.businessId, endpointId: 'business-policy' },
      { role: 'intent', intentType: `demo.s01-child-${tag}`, packageId: sources.businessId, endpointId: 'business-policy' },
    ],
  };
  const unsigned = qualifyPackageClosure(submission);
  const approval = issueApprovalProof({
    subjectDigest: unsigned.subjectDigest,
    issuerId: ISSUER,
    issuerSecret: ISSUER_SECRET,
    ...(issuedAt === undefined ? {} : { issuedAt }),
  });
  return buildQualifiedPackage({
    unsigned,
    approval,
    trustedIssuers: new Map([[ISSUER, ISSUER_SECRET]]),
    moduleSources: new Map(submission.packages.map((pkg) => [pkg.modulePath, pkg.moduleSource])),
  });
}

async function boot(sqlite, maxProofAgeMs, audience) {
  return bootstrapTrustedHost({
    issuers: new Map([[ISSUER, ISSUER_SECRET]]),
    audience: audience ?? AUDIENCE,
    storage: { path: sqlite },
    ...(maxProofAgeMs === undefined ? {} : { maxProofAgeMs }),
  });
}

async function main() {
  const [mode, ...rest] = process.argv.slice(2);
  let outcome;
  try {
    if (mode === 'deploy') {
      const [sqlite, tag] = rest;
      // Authorized install: the governance capability the bootstrap minted.
      const handle = await boot(sqlite).then((h) => deployInstallPackage(seal(tag), h.gatewaySessionCap));
      outcome = { ok: true, handle };
    } else if (mode === 'load') {
      const [sqlite, handle] = rest;
      const h = await boot(sqlite);
      const loaded = await load(handle);
      await h.host.close();
      outcome = { ok: true, rootPackageId: loaded.rootPackageId };
    } else if (mode === 'revoke') {
      const [sqlite, handle] = rest;
      const h = await boot(sqlite);
      await revokeDeployedApproval({ handle, governanceCap: h.gatewaySessionCap, reason: 's01-restart-test' });
      await h.host.close();
      outcome = { ok: true };
    } else if (mode === 'withdraw') {
      const [sqlite] = rest;
      const h = await boot(sqlite);
      // Authorized issuer withdrawal (S01-R1-P1-01 restart durability leg).
      await withdrawDeploymentIssuer({ issuerId: ISSUER, governanceCap: h.gatewaySessionCap, reason: 's01-r1-withdraw' });
      await h.host.close();
      outcome = { ok: true };
    } else if (mode === 'cross-audience-load') {
      const [sqlite, handle] = rest;
      // S01-R1-P1-02: SAME physical SQLite store, DIFFERENT trusted Host
      // audience — the installed reference must refuse typed.
      const h = await boot(sqlite, undefined, AUDIENCE_B);
      await load(handle);
      await h.host.close();
      outcome = { ok: true, unexpected: 'cross-audience load should have refused' };
    } else if (mode === 'nochannel') {
      const [handle] = rest;
      // Trust gate present, trusted deployment channel NOT: an installed
      // reference must fail closed (no fallback execution path).
      installTrustedIssuers({ issuers: new Map([[ISSUER, ISSUER_SECRET]]) });
      await load(handle);
      outcome = { ok: true, unexpected: 'load should have refused' };
    } else if (mode === 'stale-install') {
      const [sqlite] = rest;
      const h = await boot(sqlite, 4000);
      // Proof already older than the 4000ms freshness policy at INSTALL time.
      await deployInstallPackage(seal('stale', new Date(Date.now() - 5000).toISOString()), h.gatewaySessionCap);
      outcome = { ok: true, unexpected: 'deploy should have refused' };
    } else if (mode === 'stale-activation') {
      const [sqlite] = rest;
      const h = await boot(sqlite, 4000);
      // Installation-current (age < policy), then ages out before activation.
      const root = seal('staleAct', new Date(Date.now() - 3000).toISOString());
      const handle = await deployInstallPackage(root, h.gatewaySessionCap);
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await load(handle);
      outcome = { ok: true, unexpected: 'activation should have refused' };
    } else {
      outcome = { ok: false, code: 'CHILD_MODE_UNKNOWN', message: String(mode) };
    }
  } catch (error) {
    outcome = {
      ok: false,
      code: typeof error?.code === 'string' ? error.code : null,
      message: String(error?.message ?? error).slice(0, 300),
    };
  }
  console.log(`JSON_RESULT: ${JSON.stringify(outcome)}`);
  if (typeof process.exit === 'function') process.exit(0);
}

await main();
