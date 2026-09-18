import { parentPort, workerData } from 'node:worker_threads';

interface WorkerInput {
  readonly moduleUrl: string;
  readonly exportName: string;
  readonly inputJson: string;
  readonly maxOutputBytes: number;
}

interface WorkerResponse {
  readonly ok: boolean;
  readonly outputJson?: string;
  readonly message?: string;
}

const port = parentPort;
if (port === null) {
  throw new Error('DomainHarness Script worker requires parentPort');
}

void run(workerData as WorkerInput).then(
  (response) => port.postMessage(response),
  (error: unknown) =>
    port.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse),
);

async function run(input: WorkerInput): Promise<WorkerResponse> {
  const scriptModule = (await import(input.moduleUrl)) as Record<string, unknown>;
  const execute = scriptModule[input.exportName];
  if (typeof execute !== 'function') {
    throw new Error(`Script module must export function '${input.exportName}'`);
  }

  const scriptInput = JSON.parse(input.inputJson) as unknown;
  const result = await (execute as (value: unknown) => unknown | Promise<unknown>)(scriptInput);
  const outputJson = serializeJsonOnly(result);
  if (Buffer.byteLength(outputJson, 'utf8') > input.maxOutputBytes) {
    throw new Error('Script result exceeds maxOutputBytes');
  }
  return { ok: true, outputJson };
}

function serializeJsonOnly(value: unknown): string {
  if (!isPortableJson(value)) {
    throw new Error('Script result is not a portable JSON value');
  }
  return JSON.stringify(value);
}

function isPortableJson(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPortableJson);
  if (typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(value as Record<string, unknown>).every(isPortableJson);
}
