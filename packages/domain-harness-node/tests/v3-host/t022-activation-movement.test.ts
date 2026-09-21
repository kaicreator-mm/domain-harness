import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { DomainActivationBinding } from '@kaicreator/domain-harness';
import { openHostFixture } from './host-fixture.js';

function tempDir(): string {
  const directory = mkdtempSync(join(tmpdir(), 'domain-harness-t022-v5-'));
  return directory;
}

function activationBinding(input: {
  readonly packageId: string;
  readonly cdiDigest: string;
  readonly baseline: DomainActivationBinding['governanceBaseline'];
}): DomainActivationBinding {
  return {
    domainId: 'orders',
    packageId: input.packageId,
    domainIntelligenceContentDigest: input.cdiDigest,
    governanceBaseline: input.baseline,
  };
}

/**
 * T-022 V5: Domain Activation movement is published/read as ONE durable
 * record. A reader after movement observes the whole v2 binding, never a
 * torn mix of v1 and v2 fields, including across process reopen.
 */
test('T-022 V5: activation movement publishes non-torn bindings durably', async (t) => {
  const directory = tempDir();
  const path = join(directory, 'host.sqlite');
  const fixture = await openHostFixture(path);
  t.after(() => {
    fixture.close();
    rmSync(directory, { recursive: true, force: true });
  });

  fixture.authorities.exactPackageCdi.registerExactPackageCdi({
    domainId: 'orders',
    packageId: fixture.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b1',
  });
  fixture.authorities.exactPackageCdi.registerExactPackageCdi({
    domainId: 'orders',
    packageId: fixture.packageId,
    domainIntelligenceContentDigest: 'cdi-orders-b2',
  });

  const v1 = activationBinding({
    packageId: fixture.packageId,
    cdiDigest: 'cdi-orders-b1',
    baseline: fixture.b1.identity,
  });
  const v2 = activationBinding({
    packageId: fixture.packageId,
    cdiDigest: 'cdi-orders-b2',
    baseline: fixture.b2.identity,
  });

  await fixture.assembly.activation.publish(v1);
  assert.deepEqual(await fixture.assembly.activation.resolveForNewInstance('orders'), v1);

  await fixture.assembly.activation.publish(v2);
  const moved = await fixture.assembly.activation.resolveForNewInstance('orders');
  assert.deepEqual(moved, v2);
  // Torn read would pair one field from v1 with another from v2.
  assert.equal(moved.domainIntelligenceContentDigest, 'cdi-orders-b2');
  assert.equal(moved.governanceBaseline.contentDigest, fixture.b2.identity.contentDigest);
  assert.notDeepEqual(
    {
      cdi: moved.domainIntelligenceContentDigest,
      baseline: moved.governanceBaseline.contentDigest,
    },
    { cdi: 'cdi-orders-b1', baseline: fixture.b2.identity.contentDigest },
    'no torn v1-CDI/v2-baseline mix',
  );
  assert.notDeepEqual(
    {
      cdi: moved.domainIntelligenceContentDigest,
      baseline: moved.governanceBaseline.contentDigest,
    },
    { cdi: 'cdi-orders-b2', baseline: fixture.b1.identity.contentDigest },
    'no torn v2-CDI/v1-baseline mix',
  );

  // Interleaved movement: after every publication a reader observes exactly
  // one complete tuple — never a field-level mix of the two.
  for (let index = 0; index < 8; index += 1) {
    const expected = index % 2 === 0 ? v1 : v2;
    await fixture.assembly.activation.publish(expected);
    const observed = await fixture.assembly.activation.resolveForNewInstance('orders');
    assert.deepEqual(observed, expected, `iteration ${index}: complete tuple only`);
    const other = index % 2 === 0 ? v2 : v1;
    const tornCdi = observed.domainIntelligenceContentDigest === other.domainIntelligenceContentDigest
      && observed.governanceBaseline.contentDigest === expected.governanceBaseline.contentDigest;
    const tornBaseline = observed.domainIntelligenceContentDigest === expected.domainIntelligenceContentDigest
      && observed.governanceBaseline.contentDigest === other.governanceBaseline.contentDigest;
    assert.equal(tornCdi || tornBaseline, false, `iteration ${index}: no torn mix`);
  }
  await fixture.assembly.activation.publish(v2);

  fixture.close();
  const reopened = await openHostFixture(path);
  assert.deepEqual(
    await reopened.assembly.activation.resolveForNewInstance('orders'),
    v2,
    'the whole v2 record survives process reopen exactly',
  );
  reopened.close();
});
