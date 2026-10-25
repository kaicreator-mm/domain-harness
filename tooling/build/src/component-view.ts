/**
 * v0.10.2 A8b #1364 — published BUILD-only, BUILD-input-preserving Component view.
 *
 * This source is the canonical BUILD workspace's bounded authoring adapter.
 * It is NOT a runtime dispatcher, new manifest authority or Tool executor.
 * Selection, byte digests, imports and effects remain validated by buildV10App.
 */
import { V10BuildError, type V10ModuleInput } from '@kaicreator/domain-harness-contracts';

export type ComponentClass = 'semantic' | 'hook' | 'tool';
export type SemanticKind =
  | 'skill' | 'rule' | 'workflow' | 'decision' | 'context'
  | 'validator' | 'schema' | 'diagnostics' | 'knowledge' | 'evidence';
export type ToolPlacement = 'package-operation' | 'system-operation' | 'remote-operation';

interface ComponentBase {
  /** Declaration identity, not another selected-package or authority identity. */
  readonly componentId: string;
  /** Identity of an already-selected sealed V10ModuleInput, not a file path. */
  readonly modulePackageId: string;
}
export interface SemanticComponent extends ComponentBase {
  readonly class: 'semantic';
  readonly kind: SemanticKind;
  /** Existing standard-feature featureExport, not an arbitrary private function. */
  readonly entry: string;
}
export interface HookComponent extends ComponentBase {
  readonly class: 'hook';
  readonly kind: 'kernel-advisory' | 'event' | 'lifecycle' | 'observer';
  /** Existing K advisory kernel-extension hookExport. */
  readonly entry: string;
}
export interface ToolComponent extends ComponentBase {
  readonly class: 'tool';
  readonly kind: ToolPlacement;
  readonly operationId: string;
  readonly handler: string;
  /** Claimed module-level externalEffect. Never inferred from Tool placement. */
  readonly externalEffect: boolean;
}
export type ComponentDeclaration = SemanticComponent | HookComponent | ToolComponent;

export interface ComponentProjection {
  /** Selected original source objects, in caller's BUILD module order. */
  readonly modules: readonly V10ModuleInput[];
  /** This map is a producer-side explanation only, not a second BUILD artifact. */
  readonly bindings: readonly Readonly<{
    componentId: string;
    modulePackageId: string;
    class: ComponentClass;
    entry: string;
  }>[];
}

const COMPONENT_ID = /^[A-Za-z][A-Za-z0-9._:@/-]{0,127}$/;
const MAX_COMPONENTS = 256;
const SEMANTIC_KINDS = new Set<SemanticKind>([
  'skill', 'rule', 'workflow', 'decision', 'context',
  'validator', 'schema', 'diagnostics', 'knowledge', 'evidence',
]);

function refuse(code: 'BUILD_INPUT_INVALID' | 'BUILD_GRAPH_INVALID' | 'V10_EXPORT_CONTRACT_REFUSED', message: string): never {
  throw new V10BuildError(code, message);
}

function id(value: unknown, field: string): string {
  if (typeof value !== 'string' || !COMPONENT_ID.test(value)) {
    refuse('BUILD_INPUT_INVALID', `${field} must be a bounded explicit identity`);
  }
  return value;
}
function validateKeys(raw: object, allowed: readonly string[]): void {
  if (Object.getPrototypeOf(raw) !== Object.prototype) {
    refuse('BUILD_INPUT_INVALID', 'Component declaration must be plain data');
  }
  for (const key of Reflect.ownKeys(raw)) {
    if (typeof key !== 'string' || !allowed.includes(key)) {
      refuse('BUILD_INPUT_INVALID', 'Component declaration contains unsupported keys');
    }
    const descriptor = Object.getOwnPropertyDescriptor(raw, key);
    if (!descriptor || !('value' in descriptor)) {
      refuse('BUILD_INPUT_INVALID', 'Component declaration contains accessor data');
    }
  }
}
const BASE_KEYS = ['class', 'componentId', 'modulePackageId', 'kind'] as const;

/**
 * Array.isArray alone narrows a readonly T[] parameter to any[] (every
 * subsequent access would be unchecked), so list guards go through an
 * unknown-typed predicate that preserves the original element types.
 */
function isNonEmptyList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * Map explicitly selected declarations onto already selected V10 BUILD inputs.
 * Never loads/evaluates an ESM module and never registers a Tool or Hook.
 * Unsupported semantics fail closed; BUILD must still seal modules and routes.
 */
export function projectSelectedComponents(
  declarations: readonly ComponentDeclaration[],
  selectedModules: readonly V10ModuleInput[],
): ComponentProjection {
  if (!isNonEmptyList(declarations) || declarations.length > MAX_COMPONENTS ||
      !isNonEmptyList(selectedModules)) {
    refuse('BUILD_INPUT_INVALID', 'Component selection requires bounded declarations and selected modules');
  }

  const modulesById = new Map<string, V10ModuleInput>();
  for (const module of selectedModules) {
    if (!module || typeof module !== 'object') {
      refuse('BUILD_INPUT_INVALID', 'Selected BUILD module must be a record');
    }
    const moduleId = id(module.packageId, 'module.packageId');
    if (modulesById.has(moduleId)) {
      refuse('BUILD_GRAPH_INVALID', 'Duplicate selected BUILD module identity');
    }
    modulesById.set(moduleId, module);
  }

  const seenComponents = new Set<string>();
  const usedModules = new Set<string>();
  const bindings: ComponentProjection['bindings'][number][] = [];
  for (const declaration of declarations) {
    if (!declaration || typeof declaration !== 'object') {
      refuse('BUILD_INPUT_INVALID', 'Component declaration must be a record');
    }
    // Inspect own data properties before reading any user-supplied identity/getter.
    validateKeys(declaration, [...BASE_KEYS, 'entry', 'operationId', 'handler', 'externalEffect']);
    const componentId = id(declaration.componentId, 'componentId');
    const moduleId = id(declaration.modulePackageId, 'modulePackageId');
    if (seenComponents.has(componentId)) {
      refuse('BUILD_GRAPH_INVALID', 'Duplicate Component identity');
    }
    seenComponents.add(componentId);
    const selected = modulesById.get(moduleId);
    if (!selected) {
      refuse('V10_EXPORT_CONTRACT_REFUSED', 'Component names an unselected BUILD module');
    }

    let entry: string;
    if (declaration.class === 'semantic') {
      validateKeys(declaration, [...BASE_KEYS, 'entry']);
      if (!SEMANTIC_KINDS.has(declaration.kind) ||
          selected.role !== 'standard-feature' || selected.featureExport !== declaration.entry) {
        refuse('V10_EXPORT_CONTRACT_REFUSED', 'Semantic Component needs an existing selected S Feature export');
      }
      entry = id(declaration.entry, 'semantic.entry');
    } else if (declaration.class === 'hook') {
      validateKeys(declaration, [...BASE_KEYS, 'entry']);
      if (declaration.kind !== 'kernel-advisory' ||
          selected.role !== 'kernel-extension' || selected.hookExport !== declaration.entry) {
        refuse('V10_EXPORT_CONTRACT_REFUSED', 'Only selected K advisory hooks are supported; generic lifecycle hooks are not');
      }
      entry = id(declaration.entry, 'hook.entry');
    } else if (declaration.class === 'tool') {
      validateKeys(declaration, ['class', 'componentId', 'modulePackageId', 'kind', 'operationId', 'handler', 'externalEffect']);
      if (declaration.kind !== 'package-operation') {
        refuse('V10_EXPORT_CONTRACT_REFUSED', 'System/remote Tool placement requires a selected provider adapter not in A8a');
      }
      const operationId = id(declaration.operationId, 'tool.operationId');
      entry = id(declaration.handler, 'tool.handler');
      if (selected.role !== 'capability' || typeof declaration.externalEffect !== 'boolean' ||
          (selected.externalEffect ?? false) !== declaration.externalEffect ||
          !selected.handlers?.some((h) => h.operationId === operationId && h.handler === entry)) {
        refuse('V10_EXPORT_CONTRACT_REFUSED', 'Tool must bind a declared selected C Operation with module-level effect parity');
      }
    } else {
      refuse('BUILD_INPUT_INVALID', 'Unsupported Component class');
    }

    usedModules.add(moduleId);
    bindings.push(Object.freeze({
      componentId,
      modulePackageId: moduleId,
      class: declaration.class,
      entry,
    }));
  }
  return Object.freeze({
    modules: Object.freeze(selectedModules.filter((module) => usedModules.has(module.packageId))),
    bindings: Object.freeze(bindings),
  });
}
