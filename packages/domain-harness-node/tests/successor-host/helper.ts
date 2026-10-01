// Successor Node host-validation wave (#457) shared material. Everything a
// scenario needs to run the MERGED public production path against a REAL
// better-sqlite3 file: the successor (0.3,2,3) package is compiled through
// the PUBLIC compiler entry on every use, the retained (0.2,2,2) fixture is
// derived through the public identity seam, the host fake carries a REAL
// node:crypto sha256 port, and the store factory opens one absolute-path
// SQLite file per case with WAL/FULL/FK/busy pragmas.
import { createHash } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import RawDatabase from 'better-sqlite3';
import { compileDomainPackage } from '../../../../packages/domain-harness-compiler/src/index.js';
import type {
  BusinessSourceCompileEntry,
  DomainDataCompileEntry,
} from '../../../../packages/domain-harness-compiler/src/index.js';
import type {
  CapabilityId,
  LoadedRawDomainPackage,
  RawProjectionDefinition,
  RawToolDefinition,
  RawWorkflow,
  TargetHostProfile,
} from '../../../../packages/domain-harness-compiler/src/raw/types.js';
import { computeCompiledPackageId } from '../../../../packages/domain-harness/src/package/validation.js';
import { NodeSqliteRuntimeStore } from '../../src/store/node-sqlite-runtime-store.js';
import type { RuntimeStore } from '@kaicreator/domain-harness/v2';

export const SX_CRYPTO: CapabilityId = 'crypto-hash-sha256@1';
export const SX_MODULE: CapabilityId = 'compiled-package-module@1';
export const SX_INVENTORY: CapabilityId = 'inventory-native@1';
export const INVENTORY_BINDING_ID = 'sx-node-inventory-v1';

export const PACKAGE_BOUNDS = {
  maxDomainDataEntries: 16,
  maxDomainDataEntryCanonicalBytes: 2048,
  maxTotalDomainDataCanonicalBytes: 8192,
  maxBusinessSources: 8,
  maxSchemaCanonicalBytes: 4096,
} as const;

export const HOST_MAXIMA = {
  maxDomainDataEntries: 32,
  maxDomainDataEntryCanonicalBytes: 4096,
  maxTotalDomainDataCanonicalBytes: 16384,
  maxBusinessSources: 32,
  maxSchemaCanonicalBytes: 8192,
} as const;

export const sha256 = {
  async digestUtf8(value: string): Promise<string> {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  },
};

export const BINDING_CONTENTS: Readonly<Record<string, string>> = {
  'sx-sha256-v1': 'sx node host sha256 adapter artifact',
  'sx-module-v1': 'sx node host compiled module loader artifact',
  [INVENTORY_BINDING_ID]: 'sx node host inventory adapter artifact',
};

export function nodeTarget(overrides: Partial<TargetHostProfile> = {}): TargetHostProfile {
  return {
    id: 'sx-node-host@1',
    capabilities: [SX_CRYPTO, SX_MODULE, SX_INVENTORY],
    bindings: {
      [SX_CRYPTO]: 'sx-sha256-v1',
      [SX_MODULE]: 'sx-module-v1',
      [SX_INVENTORY]: INVENTORY_BINDING_ID,
    },
    packageDataBounds: { ...PACKAGE_BOUNDS },
    ...overrides,
  };
}

/** Durable out-of-process invocation counter for the I-LOCAL tool (N14). */
export function inventoryCounterPath(dir: string): string {
  return join(dir, 'inventory-calls.jsonl');
}

export function createNodeHost(options: {
  readonly counterPath?: string;
  readonly expression?: import('@kaicreator/domain-harness').RuntimeHostBindings['expression'];
} = {}): import('@kaicreator/domain-harness').RuntimeHostBindings {
  return {
    capabilities: [SX_CRYPTO, SX_MODULE, SX_INVENTORY],
    sha256,
    secureRandom: {
      randomId(): string {
        return `sx-${Math.random().toString(36).slice(2)}`;
      },
    },
    expression: options.expression ?? {
      async evaluate(request) {
        if (request.expression === '$.child') return { workflowId: 'child', instanceKey: 'child-1' };
        if (request.expression === '$.missingChild') return { workflowId: 'child', instanceKey: 'missing-child' };
        return request.input;
      },
    },
    hostLocalDomainTools: {
      [INVENTORY_BINDING_ID]: {
        capability: SX_INVENTORY,
        digest: createHash('sha256')
          .update(JSON.stringify({
            bindingId: INVENTORY_BINDING_ID,
            contentDigest: createHash('sha256')
              .update(BINDING_CONTENTS[INVENTORY_BINDING_ID] ?? '', 'utf8')
              .digest('hex'),
          }))
          .digest('hex'),
        async execute(request) {
          if (options.counterPath !== undefined) {
            // The receipt survives process death: append-only file, one JSON
            // line per durable invocation with its effect identity.
            const { appendFileSync } = await import('node:fs');
            appendFileSync(
              options.counterPath,
              `${JSON.stringify({ toolId: request.toolId, effectId: request.context.effectId })}\n`,
            );
          }
          return { reserved: true, effectId: request.context.effectId };
        },
      },
    },
  };
}

export function inventoryTool(): RawToolDefinition {
  return {
    toolId: 'inventory.reserve',
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', additionalProperties: true },
    effect: 'idempotent',
    executionKind: 'host-local-domain-tool@1',
    bindingCapability: SX_INVENTORY,
    requiredCapabilities: [SX_INVENTORY],
  };
}

function rawPackage(workflows: readonly RawWorkflow[]): LoadedRawDomainPackage {
  return {
    root: '/sx-node-host',
    schemaVersion: '0.1',
    domainId: 'sx.node.host',
    limits: { maxSteps: 16 },
    workflows: new Map(workflows.map((workflow) => [workflow.id, workflow])),
    skills: new Map(),
    scripts: new Map(),
    schemas: new Map(),
    childDependencies: new Map(workflows.map((workflow) => [workflow.id, []])),
  };
}

function parentWorkflow(options: { readonly withTool?: boolean } = {}): RawWorkflow {
  return {
    id: 'parent',
    sourcePath: '/authoring/parent.yaml',
    initial: 'start',
    states: {
      start: {
        id: 'start',
        final: false,
        done: [],
        error: [],
        events: { BEGIN: { routes: [{ target: 'acting' }] } },
      },
      acting: {
        id: 'acting',
        final: false,
        ...(options.withTool === true ? { invoke: { kind: 'tool', ref: 'inventory.reserve' } } : {}),
        done: [{ target: 'done' }],
        error: [],
        events: {},
        effects: [{
          kind: 'domain-message',
          targetExpression: '$.child',
          messageType: 'NOTIFY',
          payloadExpression: '$',
          rejected: [{ target: 'rejected' }],
        }],
      },
      done: { id: 'done', final: true, done: [], error: [], events: {} },
      rejected: { id: 'rejected', final: true, done: [], error: [], events: {} },
    },
  };
}

export interface SuccessorFixture {
  readonly manifest: import('@kaicreator/domain-harness/v2').TargetCompiledDomainPackage['manifest'];
  readonly domainData: Readonly<Record<string, unknown>>;
}

export interface CompileSuccessorOptions {
  readonly withTool?: boolean;
  readonly domainData?: readonly DomainDataCompileEntry[];
  readonly businessSources?: readonly BusinessSourceCompileEntry[];
  readonly projections?: readonly RawProjectionDefinition[];
  readonly target?: TargetHostProfile;
  readonly domainVersion?: string;
}

/** Compile through the PUBLIC compiler entry — the only fixture source. */
export function compileSuccessor(options: CompileSuccessorOptions = {}): SuccessorFixture {
  const compiled = compileDomainPackage({
    raw: rawPackage([
      parentWorkflow({ withTool: options.withTool === true }),
      {
        id: 'child',
        sourcePath: '/authoring/child.yaml',
        initial: 'start',
        states: {
          start: {
            id: 'start',
            final: false,
            done: [],
            error: [],
            events: { NOTIFY: { routes: [{ target: 'done' }] } },
          },
          done: { id: 'done', final: true, done: [], error: [], events: {} },
        },
      },
    ]),
    domainVersion: options.domainVersion ?? '1.0.0-sx-node',
    target: options.target ?? nodeTarget(),
    bindingContents: BINDING_CONTENTS,
    ...(options.withTool === true ? { tools: [inventoryTool()] } : {}),
    ...(options.domainData === undefined
      ? { domainData: [{ key: 'tier', value: { level: 1 } }] }
      : { domainData: options.domainData }),
    ...(options.businessSources === undefined
      ? { businessSources: [{ source: 'crm', valueSchema: { type: 'object', additionalProperties: true } }] }
      : { businessSources: options.businessSources }),
    ...(options.projections === undefined
      ? {
          projections: [{
            projectionId: 'overview',
            expression: '$',
            dependencies: [
              { kind: 'domain-data', key: 'tier' },
              { kind: 'business', source: 'crm', selector: {} },
            ],
            outputSchema: { type: 'object', additionalProperties: true },
          }] satisfies readonly RawProjectionDefinition[],
        }
      : { projections: options.projections }),
  });
  return {
    manifest: compiled.manifest,
    domainData: compiled.domainData as Readonly<Record<string, unknown>>,
  };
}

/** Retained (0.2,2,2) fixture through the public historical identity seam. */
export async function retainedLegacyPackage(): Promise<import('@kaicreator/domain-harness/v2').TargetCompiledDomainPackage> {
  const manifest = {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: 'sx.node.retained',
    domainVersion: '1.0.0-retained',
    packageId: 'pending',
    targetProfileId: 'sx-node-host@1',
    requiredCapabilities: [],
    workflows: {
      retained: {
        workflowId: 'retained',
        definition: {
          initial: 'idle',
          states: {
            idle: {
              final: false,
              done: [],
              error: [],
              events: { ADVANCE: { routes: [{ target: 'finished' }] } },
            },
            finished: { final: true, done: [], error: [], events: {} },
          },
          limits: { maxSteps: 8 },
        },
        messageContracts: { ADVANCE: { type: 'ADVANCE', payloadSchema: {} } },
      },
    },
    tools: {},
    projections: {},
    schemas: {},
    bindingDigests: {},
  };
  manifest.packageId = await computeCompiledPackageId(
    manifest as unknown as import('@kaicreator/domain-harness/v2').TargetCompiledDomainPackage['manifest'],
    sha256,
  );
  return {
    manifest: manifest as unknown as import('@kaicreator/domain-harness/v2').TargetCompiledDomainPackage['manifest'],
    bindings: {},
  };
}

/** One fresh absolute-path real SQLite file per case. */
export function freshDbPath(caseName: string): { readonly dir: string; readonly path: string } {
  const dir = mkdtempSync(join(tmpdir(), `dh457-${caseName}-`));
  return { dir, path: join(dir, `${caseName}.sqlite`) };
}

export function openStore(path: string, busyTimeoutMs = 10_000): NodeSqliteRuntimeStore {
  return new NodeSqliteRuntimeStore({ path, busyTimeoutMs });
}

/** N00 identity record: the exact subject this wave validated against. */
export function testedIdentity(): {
  readonly head: string;
  readonly tree: string;
  readonly dirty: boolean;
} {
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
  const status = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
  return { head, tree, dirty: status.length > 0 };
}

/** Raw SQL read access for independent durable-state assertions. */
export function rawSql(path: string): {
  readonly rows: (sql: string, ...params: readonly unknown[]) => unknown[];
  readonly exec: (sql: string) => void;
  readonly close: () => void;
} {
  const db = new RawDatabase(path);
  db.pragma('journal_mode = WAL');
  return {
    rows: (sql, ...params) => db.prepare(sql).all(...params),
    exec: (sql) => db.exec(sql),
    close: () => db.close(),
  };
}

export type { RuntimeStore };

/** Deterministic external Business Snapshot port for projection scenarios. */
export function fixedBusinessSnapshots(
  snapshot: import('@kaicreator/domain-harness/v2').BusinessSnapshot,
): { read(request: { source: string; key: string }): Promise<import('@kaicreator/domain-harness/v2').BusinessSnapshot> } {
  return {
    async read(request) {
      if (request.source !== snapshot.source) {
        throw new Error(`business snapshot source '${request.source}' is not provisioned by this fake`);
      }
      return { ...snapshot, key: request.key };
    },
  };
}

export const CRM_SNAPSHOT = {
  source: 'crm',
  key: 'case-1',
  revision: 'crm-r1',
  value: { approved: true },
} as const;
