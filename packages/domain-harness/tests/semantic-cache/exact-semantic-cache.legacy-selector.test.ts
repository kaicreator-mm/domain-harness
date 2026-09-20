import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { Sha256Port } from '../../src/contracts/identity.js';
import {
  SemanticCacheContractError,
  prepareExactSemanticInvocation,
} from '../../src/semantic-cache/exact-semantic-cache.js';

const sha256: Sha256Port = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

test('T-013 regression: legacy projection id selector cannot match another semantic source', async () => {
  await assert.rejects(
    prepareExactSemanticInvocation(
      {
        namespace: 'tenant:a',
        domainId: 'parts',
        decisionId: 'quote',
        selectedInput: { sku: 'A' },
        dependencies: {
          projections: [
            {
              source: 'domain-facts',
              projectionId: 'buyer',
              descriptorDigest: 'a'.repeat(64),
              valueDigest: 'b'.repeat(64),
            },
          ],
        },
        requiredProjectionIds: ['buyer'],
      },
      sha256,
    ),
    (error: unknown) =>
      error instanceof SemanticCacheContractError &&
      error.code === 'MISSING_REQUIRED_SEMANTIC_INPUT',
  );
});
