import jsonata from 'jsonata';
import type {
  CapabilityId,
  JsonObject,
  JsonSchema,
  JsonValue,
  LoadedRawDomainPackage,
  RawInvoke,
  RawProjectionDefinition,
  RawRoute,
  RawToolDefinition,
  TargetHostProfile,
} from '../raw/types.js';
import { canonicalJson, sha256Text } from '../package/canonical.js';
import {
  assertCompiledPackageManifest,
  buildBindingDigests,
  buildCompiledPackageManifest,
  InvalidToolConfigError,
  type CompiledMessageContract,
  type CompiledPackageManifest,
  type CompiledProjectionDescriptor,
  type CompiledToolDescriptor,
  type CompiledWorkflowDescriptor,
  toolConfigIssues,
} from '../package/manifest.js';
import { assertTargetCapabilities, collectRequiredCapabilities } from './capabilities.js';

export interface CompileDomainPackageInput {
  raw: LoadedRawDomainPackage;
  domainVersion: string;
  target: TargetHostProfile;
  /**
   * Immutable target binding artifact content per bindingId. Required for every
   * capability-bound binding the package uses; binding identity is content-addressed
   * and compilation fails closed when content is missing.
   */
  bindingContents: Readonly<Record<string, string>>;
  requiredCapabilities?: readonly CapabilityId[];
  tools?: readonly RawToolDefinition[];
  projections?: readonly RawProjectionDefinition[];
}

export interface CompileDomainPackageResult {
  manifest: CompiledPackageManifest;
  requiredBindingIds: readonly string[];
}

function jsonRoute(route: RawRoute): JsonObject {
  return { target: route.target, ...(route.when ? { when: route.when } : {}) };
}

function jsonInvoke(invoke: RawInvoke): JsonObject {
  const common: Record<string, JsonValue> = {};
  if (invoke.input) common.input = invoke.input;
  if (invoke.timeoutMs !== undefined) common.timeoutMs = invoke.timeoutMs;
  if (invoke.kind === 'expr') return { kind: 'expr', expression: invoke.expression ?? '', ...common };
  if (invoke.kind === 'script') {
    if (!invoke.ref || invoke.scriptSource === undefined) throw new Error('script invoke must have frozen build-time source');
    return {
      kind: 'script',
      ref: invoke.ref,
      sourceDigest: sha256Text(invoke.scriptSource),
      ...common,
    };
  }
  return { kind: invoke.kind, ref: invoke.ref ?? '', ...common };
}

function compiledSkill(raw: LoadedRawDomainPackage, ref: string): JsonObject {
  const skill = raw.skills.get(ref);
  if (!skill) throw new Error(`referenced Skill '${ref}' does not exist in the loaded Raw Domain Package`);
  return {
    skillId: skill.id,
    instructions: skill.instructions,
    ...(skill.inputSchema ? { inputSchema: skill.inputSchema } : {}),
    outputSchema: skill.outputSchema,
    resources: skill.resources.map((resource) => ({ path: resource.path, content: resource.content })),
    ...(skill.profile ? { profile: skill.profile } : {}),
  };
}

function sameSchema(left: JsonSchema, right: JsonSchema): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function compileWorkflow(raw: LoadedRawDomainPackage, workflowId: string): CompiledWorkflowDescriptor {
  const workflow = raw.workflows.get(workflowId);
  if (!workflow) throw new Error(`workflow '${workflowId}' does not exist`);
  const messageContracts: Record<string, CompiledMessageContract> = {};
  const states: Record<string, JsonValue> = {};
  for (const stateId of Object.keys(workflow.states).sort()) {
    const state = workflow.states[stateId];
    if (!state) continue;
    const events: Record<string, JsonValue> = {};
    for (const eventName of Object.keys(state.events).sort()) {
      const event = state.events[eventName];
      if (!event) continue;
      const payloadSchema = event.schema ?? {};
      const existing = messageContracts[eventName];
      if (existing && !sameSchema(existing.payloadSchema, payloadSchema)) {
        throw new Error(`workflow '${workflowId}' message '${eventName}' declares inconsistent payload schemas across states`);
      }
      if (!existing) messageContracts[eventName] = { type: eventName, payloadSchema };
      events[eventName] = { routes: event.routes.map(jsonRoute) };
    }
    states[stateId] = {
      final: state.final,
      ...(state.invoke ? {
        invoke: state.invoke.kind === 'skill' && state.invoke.ref
          ? { ...jsonInvoke(state.invoke), skill: compiledSkill(raw, state.invoke.ref) }
          : jsonInvoke(state.invoke),
      } : {}),
      done: state.done.map(jsonRoute),
      error: state.error.map(jsonRoute),
      events,
      ...(state.effects?.length ? {
        effects: state.effects.map((effect) => ({
          kind: 'domain-message',
          targetExpression: effect.targetExpression,
          messageType: effect.messageType,
          ...(effect.payloadExpression ? { payloadExpression: effect.payloadExpression } : {}),
          ...(effect.contractVersion ? { contractVersion: effect.contractVersion } : {}),
        })),
      } : {}),
    };
  }
  const definition: JsonObject = {
    initial: workflow.initial,
    ...(workflow.output ? { output: workflow.output } : {}),
    states,
    limits: { maxSteps: raw.limits.maxSteps },
  };
  return { workflowId, definition, messageContracts };
}

function compileTools(
  tools: readonly RawToolDefinition[],
  target: TargetHostProfile,
  bindingDigests: Readonly<Record<string, string>>,
): Record<string, CompiledToolDescriptor> {
  const result: Record<string, CompiledToolDescriptor> = {};
  for (const tool of [...tools].sort((a, b) => a.toolId.localeCompare(b.toolId))) {
    if (result[tool.toolId]) throw new Error(`duplicate tool '${tool.toolId}'`);
    const requiredCapabilities = [...(tool.requiredCapabilities ?? [])].sort();
    if (tool.bindingCapability && !requiredCapabilities.includes(tool.bindingCapability)) {
      throw new Error(`tool '${tool.toolId}' bindingCapability '${tool.bindingCapability}' must also appear in requiredCapabilities`);
    }
    const bindingCapability = tool.bindingCapability ?? (requiredCapabilities.length === 1 ? requiredCapabilities[0] : undefined);
    if (requiredCapabilities.length > 1 && !bindingCapability) {
      throw new Error(`tool '${tool.toolId}' declares multiple required capabilities and must select bindingCapability explicitly`);
    }
    const bindingId = bindingCapability ? target.bindings[bindingCapability] : `runtime:${tool.executionKind}`;
    if (!bindingId) throw new Error(`tool '${tool.toolId}' cannot resolve a target binding`);
    if (tool.config !== undefined) {
      const configIssues = toolConfigIssues(tool.config, `tool '${tool.toolId}' config`);
      if (configIssues.length) throw new InvalidToolConfigError(tool.toolId, configIssues);
    }
    result[tool.toolId] = {
      toolId: tool.toolId,
      ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
      outputSchema: tool.outputSchema,
      effect: tool.effect,
      execution: {
        kind: tool.executionKind,
        bindingId,
        ...(bindingDigests[bindingId] ? { digest: bindingDigests[bindingId] } : {}),
        ...(tool.config !== undefined ? { config: tool.config } : {}),
      },
      requiredCapabilities,
    };
  }
  return result;
}

function compileProjections(projections: readonly RawProjectionDefinition[]): Record<string, CompiledProjectionDescriptor> {
  const result: Record<string, CompiledProjectionDescriptor> = {};
  for (const projection of [...projections].sort((a, b) => a.projectionId.localeCompare(b.projectionId))) {
    if (result[projection.projectionId]) throw new Error(`duplicate projection '${projection.projectionId}'`);
    try {
      jsonata(projection.expression);
    } catch (error) {
      throw new Error(`projection '${projection.projectionId}' JSONata compile failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    result[projection.projectionId] = {
      projectionId: projection.projectionId,
      expression: projection.expression,
      dependencies: projection.dependencies.map((dependency) => ({ ...dependency })),
      outputSchema: projection.outputSchema,
    };
  }
  return result;
}

function schemaRecord(raw: LoadedRawDomainPackage): Record<string, JsonSchema> {
  return Object.fromEntries([...raw.schemas.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function compileDomainPackage(input: CompileDomainPackageInput): CompileDomainPackageResult {
  if (!input.domainVersion) throw new Error('domainVersion must be non-empty');
  const tools = input.tools ?? [];
  const projections = input.projections ?? [];
  const requiredCapabilities = collectRequiredCapabilities(input.raw, input.requiredCapabilities ?? [], tools);
  assertTargetCapabilities(input.target, requiredCapabilities);
  const bindingDigests = buildBindingDigests(input.target, requiredCapabilities, input.bindingContents);
  const workflows = Object.fromEntries(
    [...input.raw.workflows.keys()].sort().map((workflowId) => [workflowId, compileWorkflow(input.raw, workflowId)]),
  );
  const manifest = buildCompiledPackageManifest({
    formatVersion: '0.2',
    runtimeContractMajor: 2,
    executionEngineMajor: 2,
    domainId: input.raw.domainId,
    domainVersion: input.domainVersion,
    targetProfileId: input.target.id,
    requiredCapabilities,
    workflows,
    tools: compileTools(tools, input.target, bindingDigests),
    projections: compileProjections(projections),
    schemas: schemaRecord(input.raw),
    bindingDigests,
    compatibility: {
      sourceSchemaVersion: input.raw.schemaVersion,
      legacyChildDependencies: Object.fromEntries(
        [...input.raw.childDependencies.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([id, children]) => [id, [...children]]),
      ),
    },
  });
  assertCompiledPackageManifest(manifest);
  return {
    manifest,
    requiredBindingIds: [...new Set(requiredCapabilities.map((capability) => input.target.bindings[capability]).filter((value): value is string => Boolean(value)))].sort(),
  };
}
