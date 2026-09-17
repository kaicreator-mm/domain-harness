import type { AIOperationPort } from './contracts/ai.js';
import type { DomainHarness } from './contracts/runtime.js';
import type { HarnessTool } from './contracts/tool.js';
import { ExpressionRuntime } from './expression/index.js';
import { ToolRegistry } from './execution/index.js';
import { loadHarness } from './loader/index.js';
import { SqliteStore } from './persistence/sqlite-store.js';
import { RecoveryLifecycle } from './recovery/index.js';
import { RunCoordinator, RunLifecycle } from './runner/index.js';

export interface CreateDomainHarnessOptions {
  /** Root directory containing harness.yaml, workflows/, skills/, scripts/, and schemas. */
  root: string;
  /** SQLite database path owned by this DomainHarness process. `:memory:` is valid for tests. */
  sqlitePath: string;
  /** Provider-neutral AI Runtime boundary used by Skill steps. */
  ai: AIOperationPort;
  /** Host-owned Tool implementations keyed by the Tool ids referenced by Workflow YAML. */
  tools?: Readonly<Record<string, HarnessTool>>;
}

/**
 * Load one frozen Harness definition and assemble the embedded v0.1 Runtime.
 *
 * XState, SQLite schema/store, Runner and recovery implementation details remain
 * private; callers receive only the frozen DomainHarness lifecycle contract.
 */
export async function createDomainHarness(
  options: CreateDomainHarnessOptions,
): Promise<DomainHarness> {
  if (!options.root.trim()) throw new TypeError('root must be non-empty');
  if (!options.sqlitePath.trim()) throw new TypeError('sqlitePath must be non-empty');

  const tools = new ToolRegistry();
  for (const [id, tool] of Object.entries(options.tools ?? {})) {
    tools.register(id, tool);
  }

  // Load and statically validate before opening persistence so an invalid Harness
  // cannot create or migrate a database as a side effect of failed startup.
  const harness = await loadHarness({
    root: options.root,
    registeredTools: tools.names(),
  });

  const store = new SqliteStore({ path: options.sqlitePath });
  const expressions = new ExpressionRuntime();
  const coordinator = new RunCoordinator({
    harness,
    store,
    tools,
    ai: options.ai,
    expressions,
  });
  const lifecycle = new RunLifecycle({
    harness,
    store,
    coordinator,
    expressions,
  });

  return new RecoveryLifecycle({ harness, store, lifecycle });
}
