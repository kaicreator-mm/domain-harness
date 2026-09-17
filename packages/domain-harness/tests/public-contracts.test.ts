import {
  HARNESS_ERROR_CODES,
  isHarnessErrorCode,
  type AIOperationPort,
  type DomainHarness,
  type HarnessRun,
  type HarnessTool,
  type JsonValue,
  type RunStatus,
  type ToolEffect,
} from '../src/index.js';

const statuses: RunStatus[] = ['running', 'waiting', 'completed', 'failed', 'cancelled'];
const effects: ToolEffect[] = ['none', 'idempotent', 'non-idempotent'];
const value: JsonValue = { nested: [1, true, null, 'ok'] };
const run = null as unknown as HarnessRun;
const runtime = null as unknown as DomainHarness;
const tool = null as unknown as HarnessTool;
const ai = null as unknown as AIOperationPort;

void [statuses, effects, value, run, runtime, tool, ai];

if (HARNESS_ERROR_CODES.length !== 11) {
  throw new Error('frozen error-code set drifted');
}
if (!isHarnessErrorCode('interrupted') || isHarnessErrorCode('retry_me')) {
  throw new Error('error-code guard drifted');
}
