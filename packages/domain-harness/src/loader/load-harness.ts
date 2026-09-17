import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import jsonata from 'jsonata';
import { parse } from 'yaml';
import type { JsonSchema } from '../contracts/json.js';
import {
  type ExternalEventAst,
  type HarnessManifestAst,
  type InvokeAst,
  type LoadedHarness,
  type RouteAst,
  type SkillAst,
  type StateAst,
  type WorkflowAst,
} from './ast.js';
import { buildDefinitionHash } from './definition-hash.js';
import {
  HarnessDefinitionError,
  validateChildGraph,
  validateWorkflowStructure,
} from './static-validation.js';
import {
  eventSpecSchema,
  harnessManifestSchema,
  skillSidecarSchema,
  workflowFileSchema,
  type RawEventSpec,
  type RawWorkflowFile,
} from './schemas.js';

export interface LoadHarnessOptions {
  root: string;
  registeredTools?: ReadonlySet<string>;
}

function assertContained(root: string, candidate: string, ref: string): void {
  const rel = relative(root, candidate);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`path escapes Harness root: ${ref}`);
  }
}

async function safeExistingPath(root: string, ref: string): Promise<string> {
  if (isAbsolute(ref)) throw new Error(`absolute path is not allowed: ${ref}`);
  const lexical = resolve(root, normalize(ref));
  assertContained(root, lexical, ref);
  const canonical = await realpath(lexical);
  assertContained(root, canonical, ref);
  return canonical;
}

async function readYaml(path: string): Promise<unknown> {
  return parse(await readFile(path, 'utf8')) as unknown;
}

function normalizeRoutes(spec: RawEventSpec): { schemaPath?: string; routes: RouteAst[] } {
  if (Array.isArray(spec)) {
    return { routes: spec.map((route) => ({ target: route.target, ...(route.when ? { when: route.when } : {}) })) };
  }
  if ('routes' in spec) {
    return {
      ...(spec.schema ? { schemaPath: spec.schema } : {}),
      routes: spec.routes.map((route) => ({ target: route.target, ...(route.when ? { when: route.when } : {}) })),
    };
  }
  return {
    ...(spec.schema ? { schemaPath: spec.schema } : {}),
    routes: [{ target: spec.target, ...(spec.when ? { when: spec.when } : {}) }],
  };
}

function normalizeInvoke(raw: Record<string, unknown>): InvokeAst {
  const input = typeof raw.input === 'string' ? raw.input : undefined;
  const timeoutMs = typeof raw.timeoutMs === 'number' ? raw.timeoutMs : undefined;
  const common = { ...(input ? { input } : {}), ...(timeoutMs ? { timeoutMs } : {}) };
  if (typeof raw.skill === 'string') return { kind: 'skill', ref: raw.skill, ...common };
  if (typeof raw.tool === 'string') return { kind: 'tool', ref: raw.tool, ...common };
  if (typeof raw.script === 'string') return { kind: 'script', ref: raw.script, ...common };
  if (typeof raw.workflow === 'string') return { kind: 'workflow', ref: raw.workflow, ...common };
  if (typeof raw.expr === 'string') return { kind: 'expr', expression: raw.expr, ...common };
  throw new Error('validated invoke contains no step kind');
}

function compileExpression(expression: string, label: string, issues: string[]): void {
  try {
    jsonata(expression);
  } catch (error) {
    issues.push(`${label}: JSONata compile failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadJsonSchema(
  path: string,
  logicalRef: string,
  schemas: Map<string, JsonSchema>,
  ajv: Ajv2020,
  issues: string[],
): Promise<JsonSchema | undefined> {
  const existing = schemas.get(logicalRef);
  if (existing) return existing;
  try {
    const parsed = JSON.parse(await readFile(path, 'utf8')) as JsonSchema;
    ajv.compile(parsed);
    schemas.set(logicalRef, parsed);
    return parsed;
  } catch (error) {
    issues.push(`${logicalRef}: JSON Schema compile failed: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
}

async function loadSkills(
  root: string,
  schemas: Map<string, JsonSchema>,
  ajv: Ajv2020,
  issues: string[],
): Promise<Map<string, SkillAst>> {
  const skills = new Map<string, SkillAst>();
  let skillsDir: string;
  try {
    skillsDir = await safeExistingPath(root, 'skills');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return skills;
    throw error;
  }

  const entries = await readdir(skillsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const id = entry.name;
    const directory = join(skillsDir, id);
    try {
      const skillMd = await safeExistingPath(directory, 'SKILL.md');
      const sidecarPath = await safeExistingPath(directory, 'skill.harness.yaml');
      const [instructions, rawSidecar] = await Promise.all([
        readFile(skillMd, 'utf8'),
        readYaml(sidecarPath),
      ]);
      const sidecar = skillSidecarSchema.parse(rawSidecar);
      const resources: Array<{ path: string; content: string }> = [];
      for (const resourceRef of sidecar.resources) {
        const resourcePath = await safeExistingPath(directory, resourceRef);
        resources.push({ path: resourceRef, content: await readFile(resourcePath, 'utf8') });
      }
      const inputSchema = sidecar.input
        ? await loadJsonSchema(
          await safeExistingPath(directory, sidecar.input.schema),
          `skill:${id}:input:${sidecar.input.schema}`,
          schemas,
          ajv,
          issues,
        )
        : undefined;
      const outputSchema = await loadJsonSchema(
        await safeExistingPath(directory, sidecar.output.schema),
        `skill:${id}:output:${sidecar.output.schema}`,
        schemas,
        ajv,
        issues,
      );
      if (!outputSchema) continue;
      skills.set(id, {
        id,
        directory,
        instructions,
        sidecar: {
          ...(sidecar.input ? { input: sidecar.input } : {}),
          output: sidecar.output,
          resources: [...sidecar.resources],
          ...(sidecar.profile ? { profile: sidecar.profile } : {}),
        },
        ...(inputSchema ? { inputSchema } : {}),
        outputSchema,
        resources,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      issues.push(`skill:${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return skills;
}

async function loadWorkflows(root: string, issues: string[]): Promise<Map<string, WorkflowAst>> {
  const workflows = new Map<string, WorkflowAst>();
  const dir = await safeExistingPath(root, 'workflows');
  const entries = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && ['.yaml', '.yml'].includes(extname(entry.name)))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const sourcePath = await safeExistingPath(dir, entry.name);
    const id = basename(entry.name, extname(entry.name));
    try {
      const raw = workflowFileSchema.parse(await readYaml(sourcePath)) as RawWorkflowFile;
      const states: Record<string, StateAst> = {};
      for (const [stateId, rawState] of Object.entries(raw.states)) {
        const on = rawState.on ?? {};
        const doneSpec = on.done ? eventSpecSchema.parse(on.done) : undefined;
        const errorSpec = on.error ? eventSpecSchema.parse(on.error) : undefined;
        const normalizedDone = doneSpec ? normalizeRoutes(doneSpec) : undefined;
        const normalizedError = errorSpec ? normalizeRoutes(errorSpec) : undefined;
        if (normalizedDone?.schemaPath) issues.push(`workflow:${id}.${stateId}.on.done cannot declare an event payload schema`);
        if (normalizedError?.schemaPath) issues.push(`workflow:${id}.${stateId}.on.error cannot declare an event payload schema`);
        const done = normalizedDone?.routes ?? [];
        const error = normalizedError?.routes ?? (rawState.invoke ? [{ target: 'failed' }] : []);
        const events: Record<string, ExternalEventAst> = {};
        for (const [eventName, spec] of Object.entries(on)) {
          if (eventName === 'done' || eventName === 'error') continue;
          const normalized = normalizeRoutes(eventSpecSchema.parse(spec));
          events[eventName] = normalized;
        }
        states[stateId] = {
          id: stateId,
          final: rawState.final ?? false,
          ...(rawState.invoke ? { invoke: normalizeInvoke(rawState.invoke as Record<string, unknown>) } : {}),
          done,
          error,
          events,
        };
      }
      const workflow: WorkflowAst = {
        id,
        sourcePath,
        initial: raw.initial,
        ...(raw.output ? { output: raw.output } : {}),
        states,
      };
      issues.push(...validateWorkflowStructure(workflow));
      workflows.set(id, workflow);
    } catch (error) {
      issues.push(`workflow:${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return workflows;
}

export async function loadHarness(options: LoadHarnessOptions): Promise<LoadedHarness> {
  const root = await realpath(resolve(options.root));
  const issues: string[] = [];
  const manifestPath = await safeExistingPath(root, 'harness.yaml');
  const manifest = harnessManifestSchema.parse(await readYaml(manifestPath)) as HarnessManifestAst;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  const schemas = new Map<string, JsonSchema>();
  const skills = await loadSkills(root, schemas, ajv, issues);
  const workflows = await loadWorkflows(root, issues);
  const scripts = new Map<string, string>();
  const childDependencies = new Map<string, string[]>();

  for (const workflow of workflows.values()) {
    const children = new Set<string>();
    if (workflow.output) compileExpression(workflow.output, `${workflow.id}.output`, issues);
    for (const state of Object.values(workflow.states)) {
      if (state.invoke?.input) compileExpression(state.invoke.input, `${workflow.id}.${state.id}.invoke.input`, issues);
      if (state.invoke?.kind === 'expr' && state.invoke.expression) {
        compileExpression(state.invoke.expression, `${workflow.id}.${state.id}.invoke.expr`, issues);
      }
      for (const [routeClass, routes] of [['done', state.done], ['error', state.error]] as const) {
        for (const [index, route] of routes.entries()) {
          if (route.when) compileExpression(route.when, `${workflow.id}.${state.id}.on.${routeClass}[${index}].when`, issues);
        }
      }
      for (const [eventName, event] of Object.entries(state.events)) {
        if (event.schemaPath) {
          const eventSchema = await loadJsonSchema(
            await safeExistingPath(root, event.schemaPath),
            `event:${workflow.id}:${state.id}:${eventName}:${event.schemaPath}`,
            schemas,
            ajv,
            issues,
          );
          if (eventSchema) event.schema = eventSchema;
        }
        for (const [index, route] of event.routes.entries()) {
          if (route.when) compileExpression(route.when, `${workflow.id}.${state.id}.on.${eventName}[${index}].when`, issues);
        }
      }

      const invoke = state.invoke;
      if (!invoke) continue;
      if (invoke.kind === 'skill' && invoke.ref && !skills.has(invoke.ref)) {
        issues.push(`${workflow.id}.${state.id}: referenced Skill '${invoke.ref}' does not exist or lacks a valid sidecar`);
      }
      if (invoke.kind === 'tool' && invoke.ref && !options.registeredTools?.has(invoke.ref)) {
        issues.push(`${workflow.id}.${state.id}: referenced Tool '${invoke.ref}' is not registered`);
      }
      if (invoke.kind === 'script' && invoke.ref) {
        try {
          const scriptPath = await safeExistingPath(root, invoke.ref);
          const info = await stat(scriptPath);
          if (!info.isFile()) throw new Error('not a file');
          const source = await readFile(scriptPath, 'utf8');
          scripts.set(invoke.ref, source);
          invoke.scriptSource = source;
        } catch (error) {
          issues.push(`${workflow.id}.${state.id}: referenced Script '${invoke.ref}' cannot be loaded: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (invoke.kind === 'workflow' && invoke.ref) children.add(invoke.ref);
    }
    childDependencies.set(workflow.id, [...children].sort());
  }

  issues.push(...validateChildGraph(workflows, childDependencies));
  if (issues.length > 0) throw new HarnessDefinitionError(issues);

  const withoutHash = { root, manifest, workflows, skills, scripts, schemas, childDependencies };
  return { ...withoutHash, definitionHash: buildDefinitionHash(withoutHash) };
}
