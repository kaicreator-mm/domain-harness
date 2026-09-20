/**
 * Deterministic simulation host ports for contract validation packs.
 * Real sha256 (package identity must match the compiler's canonical hashing),
 * the portable ExpressionRuntime (JSONata + policy), a controllable clock and
 * a deterministic id generator.
 */
import { createHash } from 'node:crypto';

import { ExpressionRuntime } from '../../../packages/domain-harness/src/expression/expression-runtime.js';
import type {
  ExpressionExecutorPort,
  RuntimeHostBindings,
  Sha256Port,
} from '../../../packages/domain-harness/src/v2/contracts/host.js';

export function createSha256Port(): Sha256Port {
  return {
    async digestUtf8(value: string): Promise<string> {
      return createHash('sha256').update(value, 'utf8').digest('hex');
    },
  };
}

export function createDeterministicRandomPort(): RuntimeHostBindings['secureRandom'] {
  let counter = 0;
  return {
    randomId(): string {
      counter += 1;
      return `sim-random-${counter}`;
    },
  };
}

export function createExpressionPort(): ExpressionExecutorPort {
  const runtime = new ExpressionRuntime();
  return {
    async evaluate(request) {
      return runtime.evaluate(request.expression, request.input, request.logicalTime, {
        ...(request.signal === undefined ? {} : { signal: request.signal }),
      });
    },
  };
}

export interface Clock {
  now(): string;
  advance(seconds: number): void;
  plus(seconds: number): string;
}

export function createClock(startIso = '2026-09-20T08:00:00.000Z'): Clock {
  let current = Date.parse(startIso);
  if (!Number.isFinite(current)) throw new Error(`invalid clock start ${startIso}`);
  return {
    now: () => new Date(current).toISOString(),
    advance(seconds: number) {
      current += seconds * 1000;
    },
    plus(seconds: number) {
      return new Date(current + seconds * 1000).toISOString();
    },
  };
}

export function canonicalString(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      result[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return result;
  }
  return value;
}
