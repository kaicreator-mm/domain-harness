import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  canonicalJsonStringify,
  computeCanonicalJsonDigest,
  computeGovernanceBaselineIdentity,
  computeGovernanceExecutionBindingDigest,
  type Sha256Port,
} from '@kaicreator/domain-harness';

/**
 * T-022 V2 — canonical digest parity on the real Node host.
 *
 * The production host wires a node:crypto-backed Sha256Port into the portable
 * core; every canonical identity (baseline identity, activation/pin binding
 * digest, evidence id material) is derived from canonicalJsonStringify + that
 * port. This suite pins the parity with independent recomputation: the digest
 * the assembled runtime will persist must be byte-identical to a from-scratch
 * node:crypto computation over the same canonical material.
 */

const hostSha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

test('T-022 V2: node:crypto host binding matches the SHA-256 known-answer vectors', async () => {
  assert.equal(
    await hostSha256.digestUtf8('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    await hostSha256.digestUtf8(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

test('T-022 V2: canonicalJsonStringify is byte-stable on the host', () => {
  const material = {
    zulu: [3, 1, 2],
    alpha: { nested: true, list: [{ b: 1, a: 2 }] },
    digest: 'sha256:fixed',
  };
  assert.equal(
    canonicalJsonStringify(material),
    '{"alpha":{"list":[{"a":2,"b":1}],"nested":true},"digest":"sha256:fixed","zulu":[3,1,2]}',
  );
});

test('T-022 V2: governance baseline identity digest parity via the host binding', async () => {
  const input = {
    domainId: 'domain-a',
    governanceId: 'gov-a',
    schemaVersion: '1',
    semantics: { invariants: [{ id: 'inv:cap-100', ceiling: 100 }] },
  };
  const identity = await computeGovernanceBaselineIdentity(input, hostSha256);

  const independentMaterial = canonicalJsonStringify({
    schemaVersion: input.schemaVersion,
    semantics: input.semantics,
  });
  const independent = createHash('sha256').update(independentMaterial, 'utf8').digest('hex');
  assert.equal(
    identity.contentDigest,
    independent,
    'persisted baseline digest must equal an independent host recomputation',
  );

  const second = await computeGovernanceBaselineIdentity(input, hostSha256);
  assert.equal(second.contentDigest, identity.contentDigest, 'digest is deterministic on the host');
});

test('T-022 V2: activation/pin binding digest parity via the host binding', async () => {
  const binding = {
    domainId: 'domain-a',
    packageId: 'pkg-a',
    domainIntelligenceContentDigest: 'sha256:cdi-1',
    governanceBaseline: {
      domainId: 'domain-a',
      governanceId: 'gov-a',
      schemaVersion: '1',
      contentDigest: 'sha256:baseline-1',
    },
  };
  const digest = await computeGovernanceExecutionBindingDigest(binding, hostSha256);
  const repeat = await computeGovernanceExecutionBindingDigest(binding, hostSha256);
  assert.equal(digest, repeat, 'binding digest is deterministic on the host');
  assert.match(digest, /^[0-9a-f]{64}$/, 'binding digest is a raw sha256 hex');

  const generic = await computeCanonicalJsonDigest(
    {
      packageId: binding.packageId,
      domainIntelligenceContentDigest: binding.domainIntelligenceContentDigest,
      governanceBaseline: {
        domainId: binding.governanceBaseline.domainId,
        governanceId: binding.governanceBaseline.governanceId,
        schemaVersion: binding.governanceBaseline.schemaVersion,
        contentDigest: binding.governanceBaseline.contentDigest,
      },
    },
    hostSha256,
  );
  assert.equal(
    digest,
    generic,
    'the frozen binding-digest material (execution-binding.ts bindingDigestMaterial) is stable on the host',
  );
});
