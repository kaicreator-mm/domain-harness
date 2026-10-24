/**
 * v0.10.2 L2 §4 / #1304: BUILD-only manifest and authority refusal matrix.
 * These tests deliberately import the NEW production entry, never Compiler's
 * legacy v10build; previous tests could pass against the wrong implementation.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildV10App } from '../src/index.js';
import {
  V10BuildError, V10_SELECTED_ROLE_ABI, V10_TARGET_PROFILE,
  type BuildV10AppOptions, type V10ModuleInput,
} from '@kaicreator/domain-harness-contracts';

const base = [
  { packageId: 'k', role: 'kernel-primary', abiVersion: V10_SELECTED_ROLE_ABI['kernel-primary'], endpoint: 'createOccurrenceRuntime', moduleSource: 'export const a=1;', moduleSha256: '0'.repeat(64) },
  { packageId: 's', role: 'standard-primary', abiVersion: V10_SELECTED_ROLE_ABI['standard-primary'], endpoint: 'interpret', moduleSource: 'export const a=1;', moduleSha256: '0'.repeat(64) },
  { packageId: 'b', role: 'business', abiVersion: V10_SELECTED_ROLE_ABI.business, endpoint: 'getPolicy', moduleSource: 'export const a=1;', moduleSha256: '0'.repeat(64), provides: ['intent:purchase'] },
] satisfies V10ModuleInput[];

const capability = {
  packageId: 'c', role: 'capability', abiVersion: V10_SELECTED_ROLE_ABI.capability,
  endpoint: 'lookup', moduleSource: 'export const a=1;', moduleSha256: '0'.repeat(64),
  capabilityId: 'cap:purchase', handlers: [{ operationId: 'purchase.lookup', handler: 'lookup' }],
  externalEffect: false,
} satisfies V10ModuleInput;

function options(modules: readonly V10ModuleInput[]): BuildV10AppOptions {
  return { appId: 'app', audience: 'test', targetProfile: V10_TARGET_PROFILE, modules, routes: [] };
}
function refusal(modules: readonly V10ModuleInput[], code: string): void {
  assert.throws(
    () => buildV10App(options(modules)),
    (error: unknown) => error instanceof V10BuildError && error.code === code,
    'the NEW BUILD package must fail before module evaluation',
  );
}

test('L2 §4: module manifest unknown-field allowlist is strict (no silent authority aliases)', () => {
  refusal([...base, { ...capability, handlerAuthority: 'effect' } as V10ModuleInput], 'BUILD_GRAPH_INVALID');
  refusal([...base, { ...capability, routeHandlers: [{ operationId: 'x', handler: 'y' }] } as V10ModuleInput], 'BUILD_GRAPH_INVALID');
  refusal([...base, { ...capability, handlers: [{ operationId: 'purchase.lookup', handler: 'lookup', effect: 'write' }] } as unknown as V10ModuleInput], 'BUILD_GRAPH_INVALID');
});

test('L2 §4: Business or Standard cannot claim Capability operation handlers', () => {
  refusal(base.map((m) => m.role === 'business'
    ? { ...m, handlers: [{ operationId: 'purchase.lookup', handler: 'lookup' }] }
    : m), 'V10_AUTHORITY_FORGERY');
  refusal(base.map((m) => m.role === 'standard-primary'
    ? { ...m, handlers: [{ operationId: 'purchase.lookup', handler: 'lookup' }] }
    : m), 'V10_AUTHORITY_FORGERY');
});

test('L2 §4: externalEffect is module-level Capability-only, never Business/Kernel/Standard', () => {
  for (const forbiddenRole of ['business', 'kernel-primary', 'standard-primary'] as const) {
    refusal(base.map((m) => m.role === forbiddenRole ? { ...m, externalEffect: true } : m), 'V10_AUTHORITY_FORGERY');
  }
});

test('L2 §4: per-handler effect field cannot be expressed in the public typed contract', () => {
  const disallowed: V10ModuleInput = {
    ...capability,
    handlers: [{
      operationId: 'purchase.lookup',
      handler: 'lookup',
      // @ts-expect-error effect class is sealed at module level, not handler
      effect: true,
    }],
  };
  assert.equal('effect' in disallowed.handlers![0]!, true);
  refusal([...base, disallowed], 'BUILD_GRAPH_INVALID');
});

test('L2 §4: non-capability cannot squat Kernel authority namespaces', () => {
  for (const role of ['business', 'standard-primary'] as const) {
    refusal(base.map((m) => m.role === role ? { ...m, provides: ['kernel:commit'] } : m), 'V10_AUTHORITY_FORGERY');
  }
});
