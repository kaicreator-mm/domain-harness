/**
 * Pack loading and compilation.
 *
 * A contract validation pack is the "验证数据包" for one project contract
 * draft (docs/domain-data/contract-drafts/<project>.md):
 *
 *   pack.json            { project, tier: executable|data-only, domainId,
 *                          domainVersion, contractDraft, blockers?, notes? }
 *   host-profile.json    TargetHostProfile { id, capabilities, bindings }
 *   bindings/<id>.txt    immutable simulated binding content (digest input)
 *   tools.json           RawToolDefinition[]
 *   projections.json     RawProjectionDefinition[]
 *   tool-handlers.json   { "/tools/<id>": "handlers/<file>.mjs" }
 *   raw/                 Raw Domain Package (harness.yaml, workflows/,
 *                        skills/, schemas/) — executable tier
 *   domain-data/<key>.json  compiled Domain Data entries (G1 workaround:
 *                        delivered out-of-band, pinned by packageId)
 *   business/<source>.json  BusinessSeedEntry[] { key, revision, value }
 *   business-sources.json   [{ source, valueSchema, notes? }] — the living
 *                        embodiment of the [G2/L2-8] declaration proposal
 *   ai-responses.json    { skillId: { output } } deterministic fake AI
 *   scenarios/*.json     { id, description, steps[] }
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  compileDomainPackage,
  loadRawDomainPackage,
  type RawProjectionDefinition,
  type RawToolDefinition,
  type TargetHostProfile,
} from '../../../packages/domain-harness-compiler/src/index.js';
import { validateCompiledPackage } from '../../../packages/domain-harness/src/package/validation.js';
import type { TargetCompiledDomainPackage } from '../../../packages/domain-harness/src/v2/contracts/package.js';
import type { JsonValue } from '../../../packages/domain-harness/src/contracts/json.js';
import { createSha256Port } from './host.js';
import type { BusinessSeedEntry } from './business-store.js';
import type { SimAiResponse } from './sim-ports.js';

export interface PackMeta {
  project: string;
  tier: 'executable' | 'data-only';
  domainId: string;
  domainVersion: string;
  contractDraft?: string;
  blockers?: string[];
  notes?: string;
}

export interface BusinessSourceDeclaration {
  source: string;
  valueSchema: Record<string, unknown>;
  notes?: string;
}

export interface ScenarioStep {
  action: string;
  [field: string]: unknown;
}

export interface Scenario {
  id: string;
  description: string;
  steps: ScenarioStep[];
}

export interface LoadedPack {
  dir: string;
  meta: PackMeta;
  businessSources: BusinessSourceDeclaration[];
  businessSeeds: Record<string, BusinessSeedEntry[]>;
  domainData: Record<string, JsonValue>;
  aiResponses: Record<string, SimAiResponse>;
  scenarios: Scenario[];
  tools: RawToolDefinition[];
  projections: RawProjectionDefinition[];
  hostProfile?: TargetHostProfile;
  handlerModules?: Record<string, string>;
  compiled?: TargetCompiledDomainPackage;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function readJsonIfExists<T>(path: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function loadPack(dir: string): Promise<LoadedPack> {
  const meta = await readJson<PackMeta>(join(dir, 'pack.json'));
  const businessSources = await readJsonIfExists<BusinessSourceDeclaration[]>(
    join(dir, 'business-sources.json'),
    [],
  );

  const businessSeeds: Record<string, BusinessSeedEntry[]> = {};
  for (const file of await listFiles(join(dir, 'business'))) {
    if (!file.endsWith('.json')) continue;
    const source = file.slice(0, -'.json'.length);
    businessSeeds[source] = await readJson<BusinessSeedEntry[]>(join(dir, 'business', file));
  }

  const domainData: Record<string, JsonValue> = {};
  for (const file of await listFiles(join(dir, 'domain-data'))) {
    if (!file.endsWith('.json')) continue;
    domainData[file.slice(0, -'.json'.length)] = await readJson<JsonValue>(join(dir, 'domain-data', file));
  }

  const scenarios: Scenario[] = [];
  for (const file of await listFiles(join(dir, 'scenarios'))) {
    if (!file.endsWith('.json')) continue;
    scenarios.push(await readJson<Scenario>(join(dir, 'scenarios', file)));
  }
  scenarios.sort((left, right) => left.id.localeCompare(right.id));

  const aiResponses = await readJsonIfExists<Record<string, SimAiResponse>>(
    join(dir, 'ai-responses.json'),
    {},
  );
  const tools = await readJsonIfExists<RawToolDefinition[]>(join(dir, 'tools.json'), []);
  const projections = await readJsonIfExists<RawProjectionDefinition[]>(join(dir, 'projections.json'), []);

  const pack: LoadedPack = {
    dir,
    meta,
    businessSources,
    businessSeeds,
    domainData,
    aiResponses,
    scenarios,
    tools,
    projections,
  };

  if (meta.tier !== 'executable') return pack;

  pack.hostProfile = await readJson<TargetHostProfile>(join(dir, 'host-profile.json'));
  pack.handlerModules = await readJsonIfExists<Record<string, string>>(join(dir, 'tool-handlers.json'), {});

  const bindingContents: Record<string, string> = {};
  for (const file of await listFiles(join(dir, 'bindings'))) {
    if (!file.endsWith('.txt')) continue;
    bindingContents[file.slice(0, -'.txt'.length)] = await readFile(join(dir, 'bindings', file), 'utf8');
  }

  const registeredTools = new Set(tools.map((tool) => tool.toolId));
  const raw = await loadRawDomainPackage({ root: join(dir, 'raw'), registeredTools });
  const { manifest } = compileDomainPackage({
    raw,
    domainVersion: meta.domainVersion,
    target: pack.hostProfile,
    bindingContents,
    tools,
    projections,
  });

  const bindings: Record<string, unknown> = {};
  for (const bindingId of Object.values(pack.hostProfile.bindings)) {
    bindings[bindingId] = { simulated: true, bindingId };
  }

  const compiled: TargetCompiledDomainPackage = { manifest, bindings };
  const sha256 = createSha256Port();
  await validateCompiledPackage(compiled, {
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    hostCapabilities: pack.hostProfile.capabilities,
    sha256,
    targetProfileId: pack.hostProfile.id,
  });
  // sha256 port identity: validateCompiledPackage is async over the port; keep
  // the compiler-computed packageId authoritative for the runtime registry.
  void sha256;
  pack.compiled = compiled;
  return pack;
}
