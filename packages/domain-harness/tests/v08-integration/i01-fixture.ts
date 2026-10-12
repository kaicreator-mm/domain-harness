/**
 * V08-INT-I01 integration fixtures — protected Kernel Host ports (#1013).
 * =====================================================================
 *
 * I01-dedicated K/S/B module sources for the v08-integration suite. The
 * Kernel fixture deliberately consumes the FULL bounded Host port contract
 * the merged T-C mechanism consumes at runtime (true-CAS docs
 * get/put/list, sha256.digestUtf8, trusted clock, physical resources
 * dispatch), so every I01 test that loads a closure through the one-arg
 * `DomainHarness.load(package)` proves each installed port is REAL —
 * physically backed by the bootstrapped Host storage, node:crypto, the
 * bootstrap clock and the generic resource dispatcher.
 *
 * Closure assembly reuses the REAL T-A BUILD path through b01Seal
 * (qualifyPackageClosure → issueApprovalProof → buildQualifiedPackage).
 */

import type { B01ClosureInput } from '../v08-abi/v08-tb-fixture.js';
import { b01PackageIds, b01Seal } from '../v08-abi/v08-tb-fixture.js';
import type { SealedQualifiedPackageRoot } from '../../src/public-v8/index.js';

/**
 * Kernel mechanism that exercises every Host port exactly once per
 * occurrence and reports the physical facts back through the receipt:
 *   - docs.put with a create condition (mustBeAbsent) → physical revision;
 *   - docs.list under the occurrence prefix → physical enumeration;
 *   - docs.get read-back → true-CAS {value, revision} shape;
 *   - sha256.digestUtf8 → the trusted node:crypto digest;
 *   - clock() → the bootstrap (injectable) trusted timestamp;
 *   - resources.call('i01-ledger', 'reserve', ...) → generic dispatcher
 *     dispatch behind the Host's kernel dispatch principal.
 */
export function i01KernelSource(packageId: string): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    `export const PACKAGE_KIND = 'kernel';`,
    `export const ABI_VERSION = 'v08-kernel-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'occurrence-runtime', kind: 'occurrence-runtime' }];`,
    `export function createOccurrenceRuntime(deps) {`,
    `  const ports = deps.hostPorts;`,
    `  if (typeof ports.docs.list !== 'function' || typeof ports.clock !== 'function' || typeof ports.resources?.call !== 'function') {`,
    `    throw new Error('kernel fixture requires the full I01 Host port set');`,
    `  }`,
    `  return {`,
    `    async submitOccurrence(intent) {`,
    `      const at = ports.clock();`,
    `      const pin = ports.sha256.digestUtf8(JSON.stringify(intent.input));`,
    `      const key = 'i01-occ:' + deps.moduleIdentity.packageId + ':' + intent.messageId;`,
    `      const written = await ports.docs.put(key, { pin, input: intent.input, at }, { mustBeAbsent: true });`,
    `      const readBack = await ports.docs.get(key);`,
    `      const listed = await ports.docs.list('i01-occ:' + deps.moduleIdentity.packageId + ':');`,
    `      const resource = await ports.resources.call('i01-ledger', 'reserve', { effectId: 'fx:' + intent.messageId, amount: intent.input.amount });`,
    `      const interpreted = deps.sdkEndpoint.interpret(intent.input);`,
    `      const decision = deps.businessEndpoint.decide(intent, interpreted);`,
    `      const receipt = {`,
    `        status: decision.admit ? 'admitted' : 'denied',`,
    `        pin, key, revision: written.revision, readBackRevision: readBack === null ? null : readBack.revision,`,
    `        at, resource, listedKeys: listed.length,`,
    `        kernel: { packageId: deps.moduleIdentity.packageId, moduleSha256: deps.moduleIdentity.moduleSha256 },`,
    `        interpreted, decision,`,
    `      };`,
    `      deps.observe(receipt);`,
    `      return receipt;`,
    `    },`,
    `    async getSnapshot(target) {`,
    `      return { target, kernel: deps.moduleIdentity };`,
    `    },`,
    `  };`,
    `}`,
    '',
  ].join('\n');
}

export function i01SdkSource(packageId: string): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    `export const PACKAGE_KIND = 'standard-sdk';`,
    `export const ABI_VERSION = 'v08-standard-sdk-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'rule-interpreter', kind: 'rule-interpreter' }];`,
    `export function interpret(input) {`,
    `  return input !== null && typeof input === 'object' ? Object.assign({}, input) : { value: input };`,
    `}`,
    '',
  ].join('\n');
}

export function i01BusinessSource(packageId: string, intentType: string, cap: number): string {
  return [
    `export const MODULE_ID = ${JSON.stringify(packageId)};`,
    `export const PACKAGE_KIND = 'business';`,
    `export const ABI_VERSION = 'v08-business-abi/1';`,
    `export const ENDPOINTS = [{ endpointId: 'business-policy', kind: 'business-policy' }];`,
    `export const INTENT_TYPES = [${JSON.stringify(intentType)}];`,
    `export function getPolicy() {`,
    `  return {`,
    `    packageId: MODULE_ID,`,
    `    decide(intent, interpreted) {`,
    `      const amount = Number(interpreted && interpreted.amount);`,
    `      if (!Number.isFinite(amount)) return { admit: false, reason: 'amount-required' };`,
    `      return { admit: amount <= ${cap}, reason: amount <= ${cap} ? 'within-cap' : 'over-cap' };`,
    `    },`,
    `  };`,
    `}`,
    '',
  ].join('\n');
}

export interface I01Closure {
  readonly tag: string;
  readonly intentType: string;
  readonly kernelId: string;
  readonly sdkId: string;
  readonly businessId: string;
  readonly root: SealedQualifiedPackageRoot;
  readonly cap: number;
}

export function i01Closure(tag: string, cap = 100): I01Closure {
  const intentType = `i01.${tag}`;
  const ids = b01PackageIds({ tag: `i01-${tag}` });
  const input: B01ClosureInput = {
    tag: `i01-${tag}`,
    kernelSource: i01KernelSource(ids.kernelId),
    sdkSource: i01SdkSource(ids.sdkId),
    businessSource: i01BusinessSource(ids.businessId, intentType, cap),
    businessIntentType: intentType,
    ...ids,
  };
  return { tag, intentType, cap, ...ids, root: b01Seal(input) };
}

export function i01Intent(
  intentType: string,
  messageId: string,
  amount: number,
): { intentType: string; target: { workflowId: string; instanceKey: string }; messageId: string; input: { amount: number } } {
  return {
    intentType,
    target: { workflowId: 'i01-flow', instanceKey: 'instance:1' },
    messageId,
    input: { amount },
  };
}
