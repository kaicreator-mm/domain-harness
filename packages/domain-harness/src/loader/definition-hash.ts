import { createHash } from 'node:crypto';
import type { LoadedHarness } from './ast.js';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .sort()
        .map((key) => [key, canonicalize(source[key])]),
    );
  }
  return value;
}

function sortedEntries<T>(map: ReadonlyMap<string, T>): Array<[string, T]> {
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function buildDefinitionHash(harness: Omit<LoadedHarness, 'definitionHash'>): string {
  const payload = {
    manifest: harness.manifest,
    workflows: sortedEntries(harness.workflows),
    childDependencies: sortedEntries(harness.childDependencies),
    skills: sortedEntries(harness.skills),
    scripts: sortedEntries(harness.scripts),
    schemas: sortedEntries(harness.schemas),
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}
