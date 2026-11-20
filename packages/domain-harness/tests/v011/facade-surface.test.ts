/**
 * DomainHarness v0.11.0 T04 (#1578) — canonical public facade surface proof.
 *
 * The package root `.` (dist/v011) must re-export the REAL contracts/BUILD/
 * Boot/KDP surface and must NOT become a second Runtime/Kernel/BUILD or
 * re-introduce any legacy v0.2–v0.10 symbol.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as facade from '../../src/v011/index.js';

test('T04-FACADE-1: the canonical entry composes the real contracts/BUILD/Boot/KDP exports', () => {
  // T01 frozen contracts.
  assert.equal(typeof facade.contentDigestOf, 'function');
  assert.equal(typeof facade.canonicalJson, 'function');
  assert.equal(typeof facade.validateElementDefinition, 'function');
  assert.equal(typeof facade.DH_LOCK_SCHEMA_VERSION, 'string');
  // T02 canonical BUILD.
  assert.equal(typeof facade.buildV011App, 'function');
  assert.equal(typeof facade.V011BuildRefusal, 'function');
  assert.equal(typeof facade.digestOfBytes, 'function');
  // T03 Boot + the one pinned KDP Primary entry.
  assert.equal(typeof facade.boot, 'function');
  assert.equal(typeof facade.bootstrap, 'function');
});

test('T04-FACADE-2: no second Runtime/Kernel and no legacy symbol leaks into the canonical entry', () => {
  const forbidden = [
    'DOMAIN_HARNESS_VERSION', // legacy root version constant
    'createDomainRuntime', // v0.2 runtime factory
    'createDomainRuntimeV3', // v0.3 runtime assembly
    'buildV10App', // legacy BUILD face (only via @kaicreator/domain-harness-build/legacy)
    'load', // legacy microkernel load facade (only via ./legacy)
  ];
  for (const name of forbidden) {
    assert.equal(
      (facade as unknown as Record<string, unknown>)[name],
      undefined,
      `canonical v011 entry must not export '${name}'`,
    );
  }
});
