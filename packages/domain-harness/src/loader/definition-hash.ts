import { createHash } from 'node:crypto';
import type { LoadedHarness, SkillAst, WorkflowAst } from './ast.js';

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

function workflowDefinition(workflow: WorkflowAst): Omit<WorkflowAst, 'sourcePath'> {
  const { sourcePath: _sourcePath, ...definition } = workflow;
  return definition;
}

function skillDefinition(skill: SkillAst): Omit<SkillAst, 'directory'> {
  const { directory: _directory, ...definition } = skill;
  return definition;
}

export function buildDefinitionHash(harness: Omit<LoadedHarness, 'definitionHash'>): string {
  const payload = {
    manifest: harness.manifest,
    // Deployment paths are diagnostic metadata, not Runtime definition. Hash
    // logical definitions and frozen asset contents so relocating an identical
    // Harness does not invalidate active Runs.
    workflows: sortedEntries(harness.workflows)
      .map(([id, workflow]) => [id, workflowDefinition(workflow)] as const),
    childDependencies: sortedEntries(harness.childDependencies),
    skills: sortedEntries(harness.skills)
      .map(([id, skill]) => [id, skillDefinition(skill)] as const),
    scripts: sortedEntries(harness.scripts),
    schemas: sortedEntries(harness.schemas),
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalize(payload)))
    .digest('hex');
}
