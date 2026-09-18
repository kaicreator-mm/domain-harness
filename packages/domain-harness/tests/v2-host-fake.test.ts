import assert from 'node:assert/strict';
import test from 'node:test';
import type { RuntimeHostBindings } from '../src/v2/index.js';
import { STANDARD_CAPABILITIES } from '../src/v2/index.js';
import { createRuntimeHostFake } from './helpers/runtime-host-fake.js';

test('runtime host fake satisfies RuntimeHostBindings deterministically for downstream reuse', async () => {
  const fake: RuntimeHostBindings = createRuntimeHostFake();

  assert.deepEqual(fake.capabilities, [
    STANDARD_CAPABILITIES.cryptoHashSha256,
    STANDARD_CAPABILITIES.secureRandom,
    STANDARD_CAPABILITIES.expressionJsonata,
  ]);

  assert.equal(fake.secureRandom.randomId(), 'fake-random-1');
  assert.equal(fake.secureRandom.randomId(), 'fake-random-2');

  assert.equal(await fake.sha256.digestUtf8('abc'), 'fake-sha256:abc');

  assert.deepEqual(
    await fake.expression.evaluate({
      expression: '$.value',
      input: { value: 7 },
      logicalTime: '2026-09-18T00:00:00.000Z',
    }),
    { value: 7 },
  );

  assert.equal(fake.script, undefined);
  assert.equal(fake.remoteTransports, undefined);

  const overridden = createRuntimeHostFake({
    secureRandom: { randomId: () => 'pinned-id' },
  });
  assert.equal(overridden.secureRandom.randomId(), 'pinned-id');
});

test('separate runtime host fakes keep independent deterministic id sequences', () => {
  const first = createRuntimeHostFake();
  const second = createRuntimeHostFake();
  assert.equal(first.secureRandom.randomId(), 'fake-random-1');
  assert.equal(second.secureRandom.randomId(), 'fake-random-1');
  assert.equal(first.secureRandom.randomId(), 'fake-random-2');
  assert.equal(second.secureRandom.randomId(), 'fake-random-2');
});
