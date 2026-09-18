import type { RuntimeHostBindings } from '../../src/v2/index.js';
import { STANDARD_CAPABILITIES } from '../../src/v2/index.js';

// Minimal deterministic RuntimeHostBindings fake for T-001+ test reuse.
// No real I/O, no SQLite, no HTTP, no Worker, no jsonata runtime: sha256 and
// secureRandom return stable prefixed values, expression evaluation echoes its
// input. Downstream tests override whole ports via the `overrides` argument.
const defaultFakeCapabilities = [
  STANDARD_CAPABILITIES.cryptoHashSha256,
  STANDARD_CAPABILITIES.secureRandom,
  STANDARD_CAPABILITIES.expressionJsonata,
] as const;

export function createRuntimeHostFake(
  overrides: Partial<RuntimeHostBindings> = {},
): RuntimeHostBindings {
  let randomIdCounter = 0;
  return {
    capabilities: defaultFakeCapabilities,
    sha256: {
      async digestUtf8(value: string): Promise<string> {
        return `fake-sha256:${value}`;
      },
    },
    secureRandom: {
      randomId(): string {
        randomIdCounter += 1;
        return `fake-random-${randomIdCounter}`;
      },
    },
    expression: {
      async evaluate(request) {
        return request.input;
      },
    },
    ...overrides,
  };
}
