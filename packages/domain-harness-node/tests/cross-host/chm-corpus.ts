// #467 I-CROSS-HOST-1 corpus assembly: ONE compiled corpus shared by both
// hosts. The Node side recompiles the Expo fixture sources through the SAME
// public compiler entry the device build used (deterministic packageId), and
// consumes the committed device-evidence fixture re-captured at the v0.6
// candidate assembly (real run, T010-R1 #606).
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { TargetCompiledDomainPackage } from '@kaicreator/domain-harness/v2';
import type { RuntimeHostBindings } from '../../../domain-harness/src/index.js';

export const CHM_BINDINGS = {
  BINDING_INVENTORY: 'sx-inventory-native-v1',
  BINDING_CONTENTS: {
    'sx-sha256-v1': 'successor expo host sha256 adapter artifact',
    'sx-module-v1': 'successor expo host compiled module loader artifact',
    'sx-inventory-native-v1': 'successor expo host inventory adapter artifact',
  },
  CAP_CRYPTO: 'crypto-hash-sha256@1',
  CAP_MODULE: 'compiled-package-module@1',
  CAP_INVENTORY: 'inventory-native@1',
} as const;

export const CHM_HOST_MAXIMA = {
  maxDomainDataEntries: 32,
  maxDomainDataEntryCanonicalBytes: 4096,
  maxTotalDomainDataCanonicalBytes: 16384,
  maxBusinessSources: 32,
  maxSchemaCanonicalBytes: 8192,
} as const;

const sha256Sync = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

export const chmSha256 = async (value: string): Promise<string> => sha256Sync(value);

/** The Sha256Port shape the runtime host bindings require. */
export const chmSha256Port = {
  digestUtf8: async (value: string): Promise<string> => sha256Sync(value),
};

export interface ChmDeviceEvidence {
  readonly capturedFrom: string;
  readonly deviceResult: {
    readonly kind: string;
    readonly status: string;
    readonly phase: number;
    readonly platform: string;
    readonly hermes: boolean;
    readonly successorPackageId: string;
    readonly retainedPackageId: string;
  };
  readonly cases: Record<string, { readonly status: string; readonly checks: readonly string[]; readonly note?: string }>;
  readonly comparator: {
    readonly corpusRevision: string;
    readonly assemblyHead: string;
    readonly assemblyTree: string;
    readonly successorPackageId: string;
    readonly successorFixtureFileSha256: string;
    readonly retainedPackageId: string;
    readonly retainedFixtureFileSha256: string;
    readonly packageBounds: Record<string, number>;
    readonly hostMaxima: Record<string, number>;
    readonly schemaCorpus: ReadonlyArray<{ readonly id: string; readonly schema: unknown; readonly instance: unknown; readonly expect: string }>;
    readonly buildFacts: Readonly<Record<string, unknown>>;
  };
  readonly compileCorpus: {
    readonly successor: { readonly packageId: string };
    readonly canonicalVectors: ReadonlyArray<{ readonly id: string; readonly text: string }>;
    readonly canonicalDigests: Readonly<Record<string, string>>;
    readonly schemaCorpus: ReadonlyArray<{ readonly id: string; readonly schema: unknown; readonly instance: unknown; readonly expect: string }>;
    readonly buildFacts: Readonly<Record<string, unknown>>;
    readonly retainedPackageId: string;
  };
}

export function loadDeviceEvidence(): ChmDeviceEvidence {
  const here = dirname(fileURLToPath(import.meta.url));
  const path = join(here, 'fixtures', 'chm-device-evidence-a45f9370.json');
  return JSON.parse(readFileSync(path, 'utf8')) as ChmDeviceEvidence;
}

export function chmRepoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    try {
      statSync(join(dir, 'tests', 'hosts', 'successor-expo'));
      statSync(join(dir, 'package.json'));
      return dir;
    } catch {
      const parent = dirname(dir);
      if (parent === dir) throw new Error('chm repo root not found');
      dir = parent;
    }
  }
}

export function loadRetainedFixture(): TargetCompiledDomainPackage {
  const raw = JSON.parse(readFileSync(join(chmRepoRoot(), 'tests', 'hosts', 'successor-expo', 'fixtures', 'retained-package.json'), 'utf8'));
  return { manifest: raw.manifest, bindings: {} } as unknown as TargetCompiledDomainPackage;
}

export interface ChmCorpus {
  readonly successor: TargetCompiledDomainPackage;
  readonly retained: TargetCompiledDomainPackage;
  readonly successorPackageId: string;
  readonly retainedPackageId: string;
}

/**
 * Recompiles the Expo fixture sources through the public compiler and returns
 * the compiled successor + retained packages. Deterministic: the packageId
 * must equal the device-run packageId or the corpus is NOT shared.
 */
export async function compileChmCorpus(): Promise<ChmCorpus> {
  const repoRoot = chmRepoRoot();
  const script = join(repoRoot, 'tests', 'hosts', 'successor-expo', 'compile-successor-fixture.mts');
  const stdout = await new Promise<string>((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, ['--import', 'tsx', script], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NODE_TEST_CONTEXT: undefined as unknown as string },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk: Buffer) => { err += chunk.toString('utf8'); });
    child.on('error', rejectPromise);
    child.on('close', (code) => {
      if (code !== 0) rejectPromise(new Error(`fixture compile failed (${code}): ${err.slice(0, 400)}`));
      else resolvePromise(out);
    });
  });
  const compiled = JSON.parse(stdout.trim().split('\n').filter((line) => line.trimStart().startsWith('{')).pop()!);
  const retainedRaw = JSON.parse(readFileSync(join(repoRoot, 'tests', 'hosts', 'successor-expo', 'fixtures', 'retained-package.json'), 'utf8'));
  const retained = { manifest: retainedRaw.manifest, bindings: {} } as unknown as TargetCompiledDomainPackage;
  const successor = {
    manifest: compiled.successor.manifest,
    bindings: { [CHM_BINDINGS.BINDING_INVENTORY]: { opaque: 'chm-host-local-slot' } },
    domainData: compiled.successor.domainData,
  } as unknown as TargetCompiledDomainPackage;
  return {
    successor,
    retained,
    successorPackageId: compiled.successor.packageId as string,
    retainedPackageId: retainedRaw.manifest.packageId as string,
  };
}

/** The host bindings for the compiled successor corpus on Node (digests must match the vendored device bindings). */
export function chmHostBindings(counterPath?: string): RuntimeHostBindings {
  const inventoryContentDigest = sha256Sync(CHM_BINDINGS.BINDING_CONTENTS[CHM_BINDINGS.BINDING_INVENTORY] ?? '');
  const inventoryDigest = sha256Sync(JSON.stringify({ bindingId: CHM_BINDINGS.BINDING_INVENTORY, contentDigest: inventoryContentDigest }));
  return {
    capabilities: [CHM_BINDINGS.CAP_CRYPTO, CHM_BINDINGS.CAP_MODULE, CHM_BINDINGS.CAP_INVENTORY],
    sha256: chmSha256Port,
    secureRandom: { randomId: () => `chm-${Math.random().toString(36).slice(2)}` },
    expression: {
      async evaluate(request: { expression: string; input: unknown }) {
        if (request.expression === '$.child') return { workflowId: 'child', instanceKey: 'child-1' };
        if (request.expression === '$.missingChild') return { workflowId: 'child', instanceKey: 'missing-child' };
        if (request.expression === '$.strictChild') return { workflowId: 'strict-child', instanceKey: 'strict-1' };
        if (request.expression === '$.ghostChild') return { workflowId: 'child', instanceKey: 'ghost-child-1' };
        if (request.expression === '$.toolChild') return { workflowId: 'child', instanceKey: 'tool-child-1' };
        if (request.expression === '$.e11Child') return { workflowId: 'child', instanceKey: 'e11-child' };
        return request.input as never;
      },
    },
    hostLocalDomainTools: {
      [CHM_BINDINGS.BINDING_INVENTORY]: {
        capability: CHM_BINDINGS.CAP_INVENTORY,
        digest: inventoryDigest,
        async execute(request: { context: { effectId: string } }) {
          if (counterPath !== undefined) {
            const { appendFileSync } = await import('node:fs');
            appendFileSync(counterPath, `${JSON.stringify({ toolId: 'inventory.reserve', effectId: request.context.effectId })}\n`);
          }
          return { reserved: true, effectId: request.context.effectId };
        },
      },
    },
  } as never;
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const chmMessage = (messageId: string, workflowId: string, instanceKey: string, type = 'BEGIN', payload: unknown = {}): never => ({
  messageId,
  target: { workflowId, instanceKey },
  type,
  payload,
  correlationId: 'chm-correlation',
} as never);
