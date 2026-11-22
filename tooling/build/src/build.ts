/** SDK App 组合入口：消费已合格的 Package，进行选择与确定性封存；不负责源码静态正确性。 */
import {
  DH_LOCK_SCHEMA_VERSION,
  NODE22_ESM_PROFILE,
  contentDigestOf,
  isRelativeResourcePath,
  isUnknownContentKind,
  validateElementDefinition,
  type ContentBlock,
  type ContentDigest,
  type DomainAppDescriptor,
  type DomainAppLock,
  type DomainPackageManifest,
  type EffectIntent,
  type ElementDefinition,
  type ElementRef,
  type FunctionContract,
  type FunctionRef,
  type JsonValue,
  type ResolvedTarget,
  type ResourceRef,
  type SealedHookBinding,
  type SelectedElement,
  type SelectedFunction,
  type SelectedPackage,
  type SemVer,
  type TargetSelector,
  type BuildErrorCode,
  type ValidationIssue,
} from '@kaicreator/domain-harness-contracts';
import { canonicalJson } from '@kaicreator/domain-harness-contracts';
import type {
  BuildInput,
  BuildResult,
  BuildSuccess,
} from './types.js';
import { BuildRefusal, refusal } from './refusal.js';
import { SchemaChecker } from './schema-check.js';
import { ResourceScope, digestOfBytes } from './resources.js';
import { compareSemver, kahnTopologicalOrder, satisfiesSemver } from './graph.js';
import { composeAppPackage, sameAppPackageBytes, sealPackageManifest } from './app-package.js';
import { TRUSTED_WORKFLOW_NPM_ARCHIVES } from './trusted-runtime.js';
import { selectWorkflows, workflowKey } from './workflow-selection.js';
import type { LoadedElement, ResolvedFunction } from './selection-types.js';
import { selectPackageClosure } from './package-selection.js';


function elementNamespace(id: string): string {
  const dot = id.indexOf('.');
  if (dot <= 0) {
    throw refusal(
      'DH_BUILD_SCHEMA_INVALID',
      `element id '${id}' is not domain-qualified (expected '<domain>.<name>')`,
    );
  }
  return id.slice(0, dot);
}

/** Element 的逻辑查询键必须同时包含 Namespace 和 ID；Owner/Digest 再独立核对。 */
function qualifiedElementIdentity(namespace: string, id: string): string {
  return JSON.stringify([namespace, id]);
}

function isCompatibleTarget(target: TargetSelector): boolean {
  return (
    target.runtime === 'node' &&
    target.module === 'esm' &&
    (target.nodeMajor === undefined || target.nodeMajor === 22)
  );
}

function isCompatibleVariantTarget(target: TargetSelector): boolean {
  return target.runtime === 'node' && target.module === 'esm' && target.nodeMajor === 22;
}

function toJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function firstIssue(issues: readonly ValidationIssue[]): ValidationIssue {
  const issue = issues[0]!;
  return issue;
}


/** 生成期静态验证专用注入点；SDK 发行版不携带其实现。 */
export type GenerationSourceCheck = (
  scope: ResourceScope,
  manifests: readonly DomainPackageManifest[],
  artifacts: readonly ResourceRef[],
  functions: readonly SelectedFunction[],
  elements: readonly LoadedElement[],
) => void;

/** App 组合：验证选定关系与资源封存一致性；源码正确性由生成期的独立验证工具负责。 */
export function composeApp(input: BuildInput, generationCheck?: GenerationSourceCheck): BuildResult {
  try {
    return { ok: true, ...runBuild(input, generationCheck) };
  } catch (error) {
    if (error instanceof BuildRefusal) {
      return {
        ok: false,
        code: error.code,
        message: error.message,
        ...(error.refPath !== undefined ? { path: error.refPath } : {}),
      };
    }
    throw error;
  }
}

/** 依次建立包闭包、Element 所有权和依赖图，校验资源内容后生成确定性 Lock；所有步骤必须先于启动执行。 */
function runBuild(input: BuildInput, generationCheck?: GenerationSourceCheck): Omit<BuildSuccess, 'ok'> {
  // 仅核验 App 选型输入与 Manifest 的必要机器结构；独立 Domain 作者正确性归生成期。
  const schemas = new SchemaChecker();

  schemas.validateDocument('descriptor', input.descriptor);
  const descriptor = input.descriptor as DomainAppDescriptor;

  const pool = new Map<string, DomainPackageManifest>();
  for (const [index, candidate] of input.packages.entries()) {
    schemas.validateDocument('manifest', candidate);
    const manifest = candidate as DomainPackageManifest;
    if (pool.has(manifest.id)) {
      throw refusal(
        'DH_BUILD_SCHEMA_INVALID',
        `duplicate manifest id '${manifest.id}' in the package pool`,
        `packages[${index}].id`,
      );
    }
    pool.set(manifest.id, manifest);
  }

  if (!isCompatibleTarget(descriptor.target)) {
    throw refusal(
      'DH_BUILD_TARGET_INVALID',
      `descriptor target ${JSON.stringify(descriptor.target)} is not the unique supported node22-esm/1 family`,
      'target',
    );
  }
  const target: ResolvedTarget = {
    runtime: 'node',
    module: 'esm',
    ...(descriptor.target.nodeMajor !== undefined ? { nodeMajor: descriptor.target.nodeMajor } : {}),
    profile: NODE22_ESM_PROFILE,
  };

  // KDP Host 入口仅能从受选 KDP.Init Function 的 Target 推导，
  // 不再接受独立 kdpArtifact/bootstrap 作为第二真相源。

  // 第 2 段：从稳定 KDP 与 App 实际选用的 SDK/Business Packages 确定封闭依赖图。
  const { selected, dependsOnEdges } = selectPackageClosure(descriptor, pool);
  const kdpId = descriptor.roots.kernelPrimary.package;

  // 第 3 段：按真实文件字节验证 Element 定义及资源；同一 Element 的 ID/版本只能有一个 owner。
  const scope = new ResourceScope(input.packageRoots);
  const elements = new Map<string, LoadedElement>();
  const byQualifiedId = new Map<string, Map<SemVer, LoadedElement>>();
  const packagesSorted = [...selected.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  for (const manifest of packagesSorted) {
    for (const entry of manifest.elements) {
      if (entry.definitionRef.packageId !== manifest.id) {
        throw refusal(
          'DH_BUILD_SCHEMA_INVALID',
          `'${manifest.id}' declares element '${entry.id}' with definitionRef pointing at package '${entry.definitionRef.packageId}'; an owner declares its own definition source`,
        );
      }
      const definitionBytes = scope.verify(entry.definitionRef);
      let parsed: unknown;
      try {
        parsed = JSON.parse(Buffer.from(definitionBytes).toString('utf8'));
      } catch {
        throw refusal(
          'DH_BUILD_SCHEMA_INVALID',
          `element definition '${entry.definitionRef.packageId}/${entry.definitionRef.path}' is not JSON`,
        );
      }
      const checked = validateElementDefinition(parsed);
      if (!checked.ok) {
        const issue = firstIssue(checked.issues);
        throw new BuildRefusal(issue.code as BuildErrorCode, issue.message, issue.path);
      }
      schemas.validateDocument('element', parsed);
      const def = parsed as ElementDefinition;
      const namespace = elementNamespace(def.id);
      if (def.id !== entry.id || def.version !== entry.version) {
        throw refusal(
          'DH_BUILD_VERSION_CONFLICT',
          `manifest entry '${entry.id}@${entry.version}' resolves to definition '${def.id}@${def.version}'`,
        );
      }
      const key = `${namespace}|${def.id}|${def.version}`;
      if (elements.has(key)) {
        throw refusal(
          'DH_BUILD_ELEMENT_DUPLICATE_OWNER',
          `element '${def.id}@${def.version}' is declared by more than one selected package`,
        );
      }
      const loaded: LoadedElement = {
        def,
        namespace,
        key,
        definitionDigest: contentDigestOf(toJson(def)),
        owner: manifest,
        visibility: entry.visibility,
      };
      elements.set(key, loaded);
      const qualified = qualifiedElementIdentity(namespace, def.id);
      const versions = byQualifiedId.get(qualified) ?? new Map<SemVer, LoadedElement>();
      versions.set(def.version, loaded);
      byQualifiedId.set(qualified, versions);
    }
  }
  for (const [qualifiedId, versions] of byQualifiedId) {
    if (versions.size > 1) {
      throw refusal(
        'DH_BUILD_VERSION_CONFLICT',
        `element '${qualifiedId}' is required at multiple versions: ${[...versions.keys()].sort().join(', ')}`,
      );
    }
  }

  // Element.dependencies 是 BUILD 时静态 DAG；循环与未选定引用在封存前拒绝，不等于任务执行 Workflow。
  const elementDeps = new Map<string, readonly string[]>();
  for (const loaded of elements.values()) {
    const deps: string[] = [];
    for (const dep of loaded.def.dependencies ?? []) {
      const versions = byQualifiedId.get(qualifiedElementIdentity(elementNamespace(dep.element), dep.element));
      const resolved = versions
        ? [...versions.values()].find((candidate) => satisfiesSemver(candidate.def.version, dep.version))
        : undefined;
      if (!resolved) {
        throw refusal(
          'DH_BUILD_REF_UNRESOLVED',
          `element '${loaded.def.id}' depends on '${dep.element}@${dep.version}' which is not in the selected closure`,
        );
      }
      if (resolved.owner.id !== loaded.owner.id &&
          !(dependsOnEdges.get(loaded.owner.id) ?? []).includes(resolved.owner.id)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `element '${loaded.def.id}' references '${resolved.owner.id}' without declaring it as a direct Extension`);
      }
      deps.push(resolved.key);
      for (const fnId of dep.functions ?? []) {
        const fn = resolved.def.functions.find((candidate) => candidate.id === fnId);
        if (!fn) {
          throw refusal(
            'DH_BUILD_REF_UNRESOLVED',
            `element '${loaded.def.id}' pins function '${fnId}' which does not exist on '${dep.element}'`,
          );
        }
        if (resolved.owner.id !== loaded.owner.id && !isExported(resolved.owner, resolved, fn)) {
          throw refusal(
            'DH_BUILD_EXPORT_MISSING',
            `element '${loaded.def.id}' pins non-exported function '${dep.element}.${fnId}'`,
          );
        }
      }
    }
    elementDeps.set(loaded.key, deps);
  }
  if (kahnTopologicalOrder([...elements.keys()], elementDeps) === null) {
    throw refusal('DH_BUILD_ELEMENT_CYCLE', 'element build-time dependency DAG carries a cycle');
  }

  for (const manifest of packagesSorted) {
    const owned = [...elements.values()].filter((loaded) => loaded.owner.id === manifest.id);
    for (const [index, entry] of manifest.exports.entries()) {
      if (entry.elementId !== undefined) {
        if (!owned.some((loaded) => loaded.def.id === entry.elementId)) {
          throw refusal(
            'DH_BUILD_REF_UNRESOLVED',
            `'${manifest.id}' exports element '${entry.elementId}' it does not own`,
            `exports[${index}]`,
          );
        }
      } else if (entry.functionId !== undefined) {
        const carriers = owned.filter((loaded) =>
          loaded.def.functions.some((fn) => fn.id === entry.functionId),
        );
        if (carriers.length !== 1) {
          throw refusal(
            'DH_BUILD_REF_UNRESOLVED',
            `'${manifest.id}' exports function '${entry.functionId}' resolved to ${carriers.length} owned elements`,
            `exports[${index}]`,
          );
        }
      }
    }
  }

  const resolveFunctionRef = (ref: FunctionRef, refPath: string): ResolvedFunction => {
    const versions = byQualifiedId.get(qualifiedElementIdentity(ref.element.namespace, ref.element.id));
    const loaded = versions?.get(ref.element.version);
    if (!loaded || loaded.namespace !== ref.element.namespace) {
      throw refusal('DH_BUILD_REF_UNRESOLVED', `function reference '${ref.element.id}' is not in the selected closure`, refPath);
    }
    if (loaded.definitionDigest !== ref.element.digest) {
      throw refusal(
        'DH_BUILD_REF_UNRESOLVED',
        `function reference '${ref.element.id}@${ref.element.version}' digest does not match the selected definition`,
        refPath,
      );
    }
    const fn = loaded.def.functions.find((candidate) => candidate.id === ref.functionId);
    if (!fn || fn.contractVersion !== ref.contractVersion) {
      throw refusal(
        'DH_BUILD_REF_UNRESOLVED',
        `function '${ref.functionId}' (contract ${ref.contractVersion}) does not exist on '${ref.element.id}'`,
        refPath,
      );
    }
    return { element: loaded, fn, owner: loaded.owner };
  };
  const requireExported = (resolved: ResolvedFunction, consumer: string | null): void => {
    if (consumer !== null && resolved.owner.id === consumer) return;
    if (consumer !== null && !(dependsOnEdges.get(consumer) ?? []).includes(resolved.owner.id)) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
        `package '${consumer}' imports '${resolved.owner.id}' without a direct Extension declaration`);
    }
    if (!isExported(resolved.owner, resolved.element, resolved.fn)) {
      throw refusal(
        'DH_BUILD_EXPORT_MISSING',
        `'${consumer ?? descriptor.id}' references '${resolved.element.def.id}.${resolved.fn.id}' which its owner does not export`,
      );
    }
  };

  // 真实生命周期 Element 的 Function/Target 由唯一选定逻辑身份解析，不从裸 artifact 推断。
  const lifecycle = new Map<string, { init: ResolvedFunction; exit?: ResolvedFunction }>();
  const lifecycleFunction = (pkg: DomainPackageManifest, ref: ElementRef, id: 'init' | 'exit'): ResolvedFunction => {
    const loaded = elements.get(`${ref.namespace}|${ref.id}|${ref.version}`);
    if (!loaded || loaded.owner.id !== pkg.id || loaded.definitionDigest !== ref.digest) {
      throw refusal('DH_BUILD_REF_UNRESOLVED', `Package '${pkg.id}' ${id} must be an exact owned selected ElementRef`);
    }
    const fns = loaded.def.functions.filter((fn) => fn.id === id);
    if (fns.length !== 1) {
      throw refusal('DH_BUILD_IMPLEMENTATION_MISSING', `Package '${pkg.id}' ${id} Element requires exactly one '${id}' Function`);
    }
    return { element: loaded, fn: fns[0]!, owner: pkg };
  };
  for (const pkg of packagesSorted) {
    const init = lifecycleFunction(pkg, pkg.init, 'init');
    const exit = pkg.exit ? lifecycleFunction(pkg, pkg.exit, 'exit') : undefined;
    lifecycle.set(pkg.id, { init, ...(exit ? { exit } : {}) });
  }
  const hookFunctions: ResolvedFunction[] = [];
  for (const pkg of packagesSorted) {
    for (const contribution of pkg.contributesTo) {
      const fn = resolveFunctionRef(contribution.function, `contributesTo.${pkg.id}.${contribution.hookId}`);
      if (fn.owner.id !== pkg.id || !isExported(pkg, fn.element, fn.fn)) {
        throw refusal('DH_BUILD_EXPORT_MISSING', `Hook provider '${pkg.id}' must be an owned exported selected FunctionRef`);
      }
      hookFunctions.push(fn);
    }
  }

  const importedFunctions = new Map<string, ResolvedFunction>();
  for (const manifest of packagesSorted) {
    for (const ref of manifest.imports) {
      const resolved = resolveFunctionRef(ref, `imports.${manifest.id}`);
      requireExported(resolved, manifest.id);
      importedFunctions.set(`${resolved.element.key}|${resolved.fn.id}`, resolved);
    }
  }

  const selectedFunctions = new Map<string, ResolvedFunction>();
  const addSelected = (resolved: ResolvedFunction): void => {
    selectedFunctions.set(`${resolved.element.key}|${resolved.fn.id}`, resolved);
  };
  for (const pair of lifecycle.values()) {
    addSelected(pair.init);
    if (pair.exit) addSelected(pair.exit);
  }
  for (const fn of hookFunctions) addSelected(fn);
  for (const resolved of importedFunctions.values()) addSelected(resolved);
  for (const loaded of elements.values()) {
    for (const fn of loaded.def.functions) {
      if (isExported(loaded.owner, loaded, fn)) addSelected({ element: loaded, fn, owner: loaded.owner });
    }
  }

  // 原有 BUILD 唯一可信入口内部执行选定 Workflow 阶段，结果继续进入同一个 Lock。
  const { sealedWorkflows, selectedWorkflowRoots } = selectWorkflows({
    elements, dependsOnEdges, selected, scope, schemas, packagesSorted,
    resolveFunctionRef, requireExported, isExported, addSelected,
  });

  // 第 4 段：只为真正选中的 Function 查找恰好一个目标实现，并封存实现字节与声明资源的摘要。
  const sealedFunctions: SelectedFunction[] = [];
  for (const resolved of [...selectedFunctions.values()].sort(compareResolvedFunction)) {
    const hostAbi = resolved.fn.invocationAbi === 'kdp-host-init/1';
    if (hostAbi) {
      if (resolved.owner.id !== kdpId || resolved.owner.role !== 'primary' ||
          resolved.owner.layer !== 'kernel' || resolved.owner.order !== 0 ||
          resolved.fn.id !== 'init' || resolved.fn.contractVersion !== '1') {
        throw refusal('DH_BUILD_SCHEMA_INVALID', 'kdp-host-init/1 is only permitted on the unique Order 0 Kernel Init');
      }
    } else if (resolved.owner.id === kdpId && resolved.fn.id === 'init') {
      throw refusal('DH_BUILD_SCHEMA_INVALID', 'Order 0 KDP.Init requires the special kdp-host-init/1 ABI');
    }
    if (!hostAbi) validateSelectedFunctionSchemas(schemas, scope, selected, resolved);
    if (!hostAbi && resolved.fn.effects !== 'none') {
      throw refusal(
        'DH_BUILD_EFFECT_PROFILE_UNSUPPORTED',
        `selected function '${resolved.element.def.id}.${resolved.fn.id}' declares effects '${resolved.fn.effects as EffectIntent}'; 0.11.0 implements 'none' only`,
      );
    }
    const candidates: { manifest: DomainPackageManifest; binding: DomainPackageManifest['targetVariants'][number]['implementations'][number] }[] = [];
    for (const manifest of packagesSorted) {
      for (const variant of manifest.targetVariants) {
        if (!isCompatibleVariantTarget(variant.target)) continue;
        for (const binding of variant.implementations) {
          if (
            binding.elementId === resolved.element.def.id &&
            binding.functionId === resolved.fn.id &&
            binding.contractVersion === resolved.fn.contractVersion
          ) {
            candidates.push({ manifest, binding });
          }
        }
      }
    }
    if (candidates.length === 0) {
      throw refusal(
        'DH_BUILD_IMPLEMENTATION_MISSING',
        `selected function '${resolved.element.def.id}.${resolved.fn.id}' has no compatible node22-esm/1 implementation binding`,
      );
    }
    if (candidates.length > 1) {
      throw refusal(
        'DH_BUILD_FUNCTION_AMBIGUOUS_IMPLEMENTATION',
        `selected function '${resolved.element.def.id}.${resolved.fn.id}' has ${candidates.length} compatible implementation bindings`,
      );
    }
    const { manifest: implementor, binding } = candidates[0]!;
    if (hostAbi) {
      if (binding.invocationAbi !== 'kdp-host-init/1' || implementor.id !== kdpId) {
        throw refusal('DH_BUILD_SCHEMA_INVALID', 'Host ABI Function must use the KDP-owned matching Host Target');
      }
    } else if (binding.invocationAbi !== undefined) {
      throw refusal('DH_BUILD_SCHEMA_INVALID', 'ordinary Function cannot claim the privileged Host ABI');
    }
    // 只检查必要的 Target/Owner 授权；生成期负责实际源码正确性。
    // BUILD 对真正的 Function 调用方证明权限；实现属于另一 Package，
    // 不等于逻辑 Owner 或进口调用方自动获得了这个实现 Package 的访问权。
    const directExtension = (callerId: string, providerId: string): boolean =>
      callerId === providerId ||
      ((dependsOnEdges.get(callerId) ?? []).includes(providerId) &&
        selected.get(providerId)?.role === 'extension');
    if (implementor.id !== resolved.owner.id && !directExtension(resolved.owner.id, implementor.id)) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
        `Function '${resolved.element.def.id}.${resolved.fn.id}' owner '${resolved.owner.id}' does not declare implementation Extension '${implementor.id}' directly`);
    }
    // 对显式导入该 Function 的 Package 同样不能隐藏真实实现提供者。
    for (const caller of packagesSorted) {
      if (!caller.imports.some((ref) =>
        ref.element.id === resolved.element.def.id &&
        ref.element.version === resolved.element.def.version &&
        ref.element.digest === resolved.element.definitionDigest &&
        ref.functionId === resolved.fn.id &&
        ref.contractVersion === resolved.fn.contractVersion)) continue;
      if (!directExtension(caller.id, implementor.id)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `Function importer '${caller.id}' lacks direct Extension declaration for implementation '${implementor.id}'`);
      }
    }
    if (binding.entry.module.packageId !== implementor.id) {
      throw refusal(
        'DH_BUILD_SCHEMA_INVALID',
        `'${implementor.id}' binds function '${resolved.element.def.id}.${resolved.fn.id}' with an entry module from package '${binding.entry.module.packageId}'; a binding carries its own package's artifact`,
      );
    }
    if (implementor.id !== resolved.owner.id) {
      const ownerEntry = resolved.owner.elements.find(
        (entry) => entry.id === resolved.element.def.id && entry.version === resolved.element.def.version,
      );
      if (!ownerEntry || ownerEntry.visibility !== 'public' || !isExported(resolved.owner, resolved.element, resolved.fn)) {
        throw refusal(
          'DH_BUILD_EXPORT_MISSING',
          `implementation owner '${implementor.id}' binds '${resolved.element.def.id}.${resolved.fn.id}' which is not visible through the definition owner's exports`,
        );
      }
    }
    scope.verify(binding.entry.module);
    for (const resource of binding.resources ?? []) {
      if (!directExtension(implementor.id, resource.packageId)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `Function implementation in '${implementor.id}' uses resource from undeclared direct Extension '${resource.packageId}'`);
      }
      // 生命周期 Init 的资源句柄会直接授予逻辑 Element 所属 Package；
      // 因此逻辑 Owner 必须独立声明资源的直系 Extension 授权，
      // 不能把物理实现者拥有的权限隐式转赠给 Init 调用方。
      if (!directExtension(resolved.owner.id, resource.packageId)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `Function '${resolved.element.def.id}.${resolved.fn.id}' owner '${resolved.owner.id}' lacks direct Extension authorization for resource '${resource.packageId}/${resource.path}'`);
      }
      scope.verify(resource);
    }
    sealedFunctions.push(hostAbi ? {
      ref: toFunctionRef(resolved),
      invocationAbi: 'kdp-host-init/1',
      implementation: binding.entry,
      resources: [...(binding.resources ?? [])],
    } : {
      ref: toFunctionRef(resolved),
      outcomes: [...resolved.fn.outcomes],
      effects: resolved.fn.effects,
      implementation: binding.entry,
      resources: [...(binding.resources ?? [])],
    });
  }

  // Hook 先验证所有选中 owner 的接口 Schema，再把贡献者按稳定顺序封存；Hook 不是额外 Runtime。
  const hookBindings: SealedHookBinding[] = [];
  for (const owner of packagesSorted) {
    const declared = owner.provides?.hooks ?? [];
    for (const hook of declared) {
      // Hook 接口是 BUILD 阶段的公开合同，必须与 Function Schema 一样先解析并验证。
      const schemaPath = `provides.${owner.id}.hooks.${hook.id}.interfaceSchemaRef`;
      try {
        const ref = hook.interfaceSchemaRef;
        if ('inline' in ref) {
          schemas.compileContentSchema(ref.inline, schemaPath);
        } else {
          if (!selected.has(ref.packageId)) {
            throw refusal('DH_BUILD_HOOK_TARGET_INVALID',
              `hook '${owner.id}/${hook.id}' schema references unselected package '${ref.packageId}'`, schemaPath);
          }
          const schema = parseSchemaResource(scope, ref, schemaPath, `hook '${owner.id}/${hook.id}'`);
          schemas.compileContentSchema(schema, schemaPath);
        }
      } catch (error) {
        if (error instanceof BuildRefusal) {
          throw refusal('DH_BUILD_HOOK_TARGET_INVALID',
            `hook '${owner.id}/${hook.id}' schema is invalid: ${error.message}`, schemaPath);
        }
        throw error;
      }
      const providers: FunctionRef[] = [];
      for (const manifest of packagesSorted) {
        for (const contribution of manifest.contributesTo) {
          if (contribution.ownerPackageId !== owner.id || contribution.hookId !== hook.id) continue;
          if (!(dependsOnEdges.get(owner.id) ?? []).includes(manifest.id)) {
            throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
              `Hook owner '${owner.id}' must declare provider '${manifest.id}' as direct Extension`);
          }
          const fn = resolveFunctionRef(contribution.function, `hook.${hook.id}`);
          if (fn.owner.id !== manifest.id || !isExported(manifest, fn.element, fn.fn)) {
            throw refusal('DH_BUILD_EXPORT_MISSING', `Hook '${hook.id}' provider must be an exported FunctionRef`);
          }
          providers.push(contribution.function);
        }
      }
      if (hook.cardinality === 'single' && providers.length > 1) {
        throw refusal(
          'DH_BUILD_HOOK_CARDINALITY',
          `single hook '${owner.id}/${hook.id}' received ${providers.length} provider bindings`,
        );
      }
      providers.sort((a, b) => canonicalJson(toJson(a)).localeCompare(canonicalJson(toJson(b))));
      hookBindings.push({
        ownerPackageId: owner.id,
        hookId: hook.id,
        cardinality: hook.cardinality,
        providers,
      });
    }
  }
  for (const manifest of packagesSorted) {
    for (const contribution of manifest.contributesTo) {
      const owner = selected.get(contribution.ownerPackageId);
      const declared = owner?.provides?.hooks ?? [];
      if (!owner || !declared.some((hook) => hook.id === contribution.hookId)) {
        throw refusal(
          'DH_BUILD_HOOK_TARGET_INVALID',
          `'${manifest.id}' contributes to hook '${contribution.ownerPackageId}/${contribution.hookId}' which is not declared by the selected owner package`,
        );
      }
    }
  }

  // 统一 Init/Exit Element：Init 必需，Exit 可选；Core.Order 唯一且 Order 0 只能属于 KDP。
  const coreOrders = new Map<number, string>();
  for (const manifest of packagesSorted) {
    if (manifest.role === 'primary') {
      if (!Number.isSafeInteger(manifest.order) || manifest.order! < 0) {
        throw refusal('DH_BUILD_SCHEMA_INVALID', `Core '${manifest.id}' requires a non-negative integer Order`);
      }
      const conflicting = coreOrders.get(manifest.order!);
      if (conflicting) {
        throw refusal('DH_BUILD_PRIMARY_DUPLICATE',
          `Core.Order ${manifest.order} is duplicated by '${conflicting}' and '${manifest.id}'`);
      }
      coreOrders.set(manifest.order!, manifest.id);
    } else if (manifest.order !== undefined && (!Number.isSafeInteger(manifest.order) || manifest.order < 0)) {
      throw refusal('DH_BUILD_SCHEMA_INVALID', `Extension '${manifest.id}' has invalid optional Order`);
    }
    const artifactPath = input.packageArtifacts[manifest.id];
    if (!artifactPath || !isRelativeResourcePath(artifactPath)) {
      throw refusal('DH_BUILD_RESOURCE_MISSING', `package '${manifest.id}' artifact path is not a canonical in-package path`);
    }
    // 物理入口只来自已选 Target，实现所在模块不必是 Package artifact。
  }
  if (coreOrders.get(0) !== kdpId) {
    throw refusal('DH_BUILD_PRIMARY_MISSING', `Order 0 KDP '${kdpId}' must own the unique selected Host Init`);
  }
  const kdpLifecycle = lifecycle.get(kdpId);
  const kdpInitRef = kdpLifecycle ? toFunctionRef(kdpLifecycle.init) : undefined;
  const selectedHostInit = sealedFunctions.find((fn) =>
    kdpInitRef && canonicalJson(toJson(fn.ref)) === canonicalJson(toJson(kdpInitRef)));
  if (!kdpInitRef || !selectedHostInit ||
      selectedHostInit.invocationAbi !== 'kdp-host-init/1' ||
      selectedHostInit.implementation.module.packageId !== kdpId) {
    throw refusal('DH_BUILD_PRIMARY_MISSING', 'KDP selected Init must uniquely bind Host ABI, FunctionRef and Target');
  }
  const coreOrder = [...coreOrders].sort(([a], [b]) => a - b).map(([, id]) => id);
  // Core 链与 Extension DAG 分开：核心间链接不需要伪装成 Extension 依赖。
  const initGraphOrder = kahnTopologicalOrder(packagesSorted.map((p) => p.id), dependsOnEdges);
  if (initGraphOrder === null) {
    throw refusal('DH_BUILD_PACKAGE_CYCLE', 'Package direct dependency graph carries a cycle');
  }

  // 未知且 optional 的内容仅记排除证据，不混入已选 contentDigests；required 未知内容直接拒绝。
  const excludedUnknownContent: string[] = [];
  const sealedElements: SelectedElement[] = [];
  for (const loaded of [...elements.values()].sort(compareLoadedElement)) {
    const contentDigests: ContentDigest[] = [];
    for (const block of loaded.def.content) {
      if (block.ref && block.ref.packageId !== loaded.owner.id &&
          !(dependsOnEdges.get(loaded.owner.id) ?? []).includes(block.ref.packageId)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `Element '${loaded.def.id}' uses content from undeclared direct Extension '${block.ref.packageId}'`);
      }
      if (isUnknownContentKind(block.contentKind)) {
        if (block.required) {
          throw refusal(
            'DH_BUILD_SCHEMA_UNKNOWN_REQUIRED',
            `required content block '${loaded.def.id}/${block.id}' carries unknown contentKind '${block.contentKind}'`,
          );
        }
        excludedUnknownContent.push(`${loaded.def.id}/${block.id}`);
        continue;
      }
      if (!('inline' in block.schemaRef)) {
        if (block.schemaRef.packageId !== loaded.owner.id &&
            !(dependsOnEdges.get(loaded.owner.id) ?? []).includes(block.schemaRef.packageId)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `Element '${loaded.def.id}' uses a content Schema from undeclared Extension '${block.schemaRef.packageId}'`);
        }
        // SchemaRef 的选定归属与字节是组合技术合同，业务 Schema 的有效性由生成者证明。
        scope.verify(block.schemaRef);
      }
      contentDigests.push(sealBlockContent(loaded, block, scope));
    }
    if (loaded.def.validation) scope.verify(loaded.def.validation.ref);
    sealedElements.push({
      ref: toElementRef(loaded),
      ownerPackageId: loaded.owner.id,
      visibility: loaded.visibility,
      contentDigests,
      contractDigests: loaded.def.functions.map((fn) => contentDigestOf(toJson(fn))),
    });
  }

  const sealedPackages: SelectedPackage[] = [];
  let selectedTrustedYaml = false;
  for (const manifest of packagesSorted) {
    const artifactPath = input.packageArtifacts[manifest.id];
    if (!artifactPath) {
      throw refusal('DH_BUILD_RESOURCE_MISSING', `no artifact path provided for selected package '${manifest.id}'`);
    }
    const bytes = scope.read(manifest.id, artifactPath);
    const digest = digestOfBytes(bytes);
    scope.record(manifest.id, artifactPath, digest);
    // 已选 Target 的真实命名导出在 sealedFunctions 构造时逐个检验。
    sealPackageManifest(scope, manifest,
      manifest.id === kdpId ? selectedHostInit.implementation.module.path : undefined);
    // 只读取已验证的 Package npm 元数据，外部依赖不得绕过 BUILD 已准入的精确范围。
    // 未经 BUILD 校验的第三方库不得扩大运行时依赖范围。
    const npmManifest = JSON.parse(Buffer.from(scope.read(manifest.id, 'package.json')).toString('utf8')) as {
      readonly dependencies?: Readonly<Record<string, string>>;
    };
    if (npmManifest.dependencies?.yaml === '2.9.1') selectedTrustedYaml = true;
    const pair = lifecycle.get(manifest.id)!;
    const initRef = toFunctionRef(pair.init);
    const initSelected = sealedFunctions.find((fn) => canonicalJson(toJson(fn.ref)) === canonicalJson(toJson(initRef)))!;
    sealedPackages.push({
      packageId: manifest.id,
      version: manifest.version,
      layer: manifest.layer,
      role: manifest.role,
      artifact: { packageId: manifest.id, path: artifactPath, digest },
      ...(manifest.order !== undefined ? { order: manifest.order } : {}),
      init: manifest.init,
      initFunction: initRef,
      ...(pair.exit ? { exit: manifest.exit!, exitFunction: toFunctionRef(pair.exit) } : {}),
      initResources: [...initSelected.resources],
      imports: [...manifest.imports],
      ...(selectedWorkflowRoots.has(manifest.id)
        ? { workflowRoots: selectedWorkflowRoots.get(manifest.id)! } : {}),
      ...(manifest.recordInitFrom === true ? { recordInitFrom: true as const } : {}),
      dependsOn: [...(dependsOnEdges.get(manifest.id) ?? [])].sort(),
    });
  }
  // 已验证生成者可以注入静态源码检查，检查产生的传递闭包直接封入 Lock。
  // 发行 SDK 仅接受已提供的正确性结果，不自行引入 JS Parser/第二生成期验证器。
  const selectedArtifacts = [
    ...sealedPackages.map((pkg) => pkg.artifact),
    ...sealedFunctions.map((fn) => fn.implementation.module),
    ...hookBindings.flatMap((hook) => hook.providers.map((ref) => {
      const selected = sealedFunctions.find((fn) => canonicalJson(toJson(fn.ref)) === canonicalJson(toJson(ref)));
      if (!selected) throw refusal('DH_BUILD_IMPLEMENTATION_MISSING', 'Hook provider implementation missing');
      return selected.implementation.module;
    })),
  ];
  generationCheck?.(scope, packagesSorted, selectedArtifacts, sealedFunctions, [...elements.values()]);
  // 若生成者已提交静态闭包资源，SDK 仅对选定 Package 内字节及摘要作封存一致性检查。
  const allowedResourceOwners = new Set(packagesSorted.map((pkg) => pkg.id));
  for (const ref of input.generatedResources ?? []) {
    if (!allowedResourceOwners.has(ref.packageId)) {
      throw refusal('DH_BUILD_RESOURCE_MISSING', 'generated resource owner is not selected in this App');
    }
    scope.verify(ref);
  }
  // 真正 KDP Init Target 的字节已在 selected Function 实现中封存，无第二 bootstrap 物理资源。

  // 第 6 段：同时封存描述符语义、KDP 入口字节、Package/Function/Hook 与资源闭包。
  const descriptorDigest = contentDigestOf(toJson(descriptor));
  const assemble = (): DomainAppLock => {
    const withoutDigest = {
      kind: 'DomainAppLock' as const,
      schemaVersion: DH_LOCK_SCHEMA_VERSION,
      appIdentity: { id: descriptor.id, version: descriptor.version, descriptorDigest },
      target,
      bootstrapKdpPin: {
        kdpPackageId: kdpId,
        kdpInitFunction: kdpInitRef,
        invocationAbi: 'kdp-host-init/1' as const,
        kdpInitModule: selectedHostInit.implementation.module,
      },
      selectedPackages: sealedPackages,
      selectedElements: sealedElements,
      selectedFunctions: sealedFunctions,
      hookBindings: [...hookBindings].sort(compareHookBinding),
      ...(sealedWorkflows.size > 0
        ? { selectedWorkflows: [...sealedWorkflows.values()].sort((a, b) =>
            workflowKey(a.ref).localeCompare(workflowKey(b.ref))) } : {}),
      ...(sealedWorkflows.size > 0 || selectedTrustedYaml
        ? { trustedRuntimeIntegrity: TRUSTED_WORKFLOW_NPM_ARCHIVES.map((item) => ({ ...item })) } : {}),
      coreOrder,
      resourceDigests: scope.toLockMap(),
      excludedUnknownContent: [...excludedUnknownContent].sort(),
    };
    return {
      ...withoutDigest,
      closureDigest: contentDigestOf(toJson(withoutDigest)),
    };
  };
  // 两次按确定性顺序重建并对比规范 JSON；仅返回 Lock 字节，不安装模块，也不启动任意业务代码。
  const lock = assemble();
  const lockText = canonicalJson(toJson(lock));
  if (canonicalJson(toJson(assemble())) !== lockText) {
    throw refusal('DH_BUILD_LOCK_NOT_REPRODUCIBLE', 'double-build self-check produced divergent Lock bytes');
  }
  const lockBytes = new TextEncoder().encode(lockText);
  const appPackage = composeAppPackage(scope, descriptor, lock, lockBytes);
  const secondAppPackage = composeAppPackage(scope, descriptor, lock, lockBytes);
  if (!sameAppPackageBytes(appPackage, secondAppPackage)) {
    throw refusal('DH_BUILD_LOCK_NOT_REPRODUCIBLE', 'double-build self-check produced divergent App Package bytes');
  }
  return { lock, lockBytes, appPackage };
}


/** 只验证被选定函数的输入输出 Schema，禁止通过未选中 Schema 扩大运行时授权边界。 */
function validateSelectedFunctionSchemas(
  schemas: SchemaChecker,
  scope: ResourceScope,
  selectedPackages: ReadonlyMap<string, DomainPackageManifest>,
  resolved: ResolvedFunction,
): void {
  const functionPath = `${resolved.element.def.id}.${resolved.fn.id}`;
  if (resolved.fn.invocationAbi === 'kdp-host-init/1') return;
  for (const channel of ['inputSchemaRef', 'outputSchemaRef'] as const) {
    const ref = resolved.fn[channel];
    const refPath = `${functionPath}.${channel}`;
    if (!('inline' in ref) && !selectedPackages.has(ref.packageId)) {
      throw refusal(
        'DH_BUILD_SCHEMA_INVALID',
        `runtime Function schema resource '${ref.packageId}/${ref.path}' is not in the selected package closure`,
        refPath,
      );
    }
    const inline = 'inline' in ref;
    const schema = inline
      ? ref.inline
      : parseSchemaResource(scope, ref, refPath, `runtime Function '${functionPath}.${channel}'`);
    schemas.compileFunctionSchema(schema, `${refPath}${inline ? '.inline' : ''}`);
  }
}

function isExported(
  owner: DomainPackageManifest,
  element: LoadedElement,
  fn: FunctionContract | undefined,
): boolean {
  const entry = owner.elements.find(
    (candidate) => candidate.id === element.def.id && candidate.version === element.def.version,
  );
  if (!entry || entry.visibility !== 'public') return false;
  return owner.exports.some((exported) => {
    if (exported.elementId === undefined && exported.functionId === undefined) return false;
    if (exported.elementId !== undefined && exported.elementId !== element.def.id) return false;
    if (exported.functionId !== undefined) {
      if (fn === undefined || exported.functionId !== fn.id) return false;
    }
    return true;
  });
}

function toElementRef(loaded: LoadedElement): ElementRef {
  return {
    namespace: loaded.namespace,
    id: loaded.def.id,
    version: loaded.def.version,
    digest: loaded.definitionDigest,
  };
}

function toFunctionRef(resolved: ResolvedFunction): FunctionRef {
  return {
    element: toElementRef(resolved.element),
    functionId: resolved.fn.id,
    contractVersion: resolved.fn.contractVersion,
  };
}

function compareLoadedElement(a: LoadedElement, b: LoadedElement): number {
  if (a.def.id !== b.def.id) return a.def.id < b.def.id ? -1 : 1;
  return compareSemver(a.def.version, b.def.version);
}

function compareResolvedFunction(a: ResolvedFunction, b: ResolvedFunction): number {
  const byElement = compareLoadedElement(a.element, b.element);
  if (byElement !== 0) return byElement;
  return a.fn.id < b.fn.id ? -1 : a.fn.id > b.fn.id ? 1 : 0;
}

function compareHookBinding(a: SealedHookBinding, b: SealedHookBinding): number {
  return a.ownerPackageId < b.ownerPackageId
    ? -1
    : a.ownerPackageId > b.ownerPackageId
      ? 1
      : a.hookId < b.hookId
        ? -1
        : 1;
}

/** 内容块的内联值与外部资源在解析后应产生同一语义摘要，同时保留原始文件字节校验。 */
function sealBlockContent(
  loaded: LoadedElement,
  block: ContentBlock,
  scope: ResourceScope,
): ContentDigest {
  const blockPath = `${loaded.def.id}/${block.id}`;
  if (!block.ref) {
    const value = toJson(block.value);
    return contentDigestOf(value);
  }
  const bytes = scope.verify(block.ref);
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString('utf8')) as JsonValue;
  } catch {
    if (block.contentKind !== 'document') {
      throw refusal(
        'DH_BUILD_SCHEMA_INVALID',
        `content block '${blockPath}' (kind '${block.contentKind}') carries non-JSON ref bytes; only document content may be opaque`,
        blockPath,
      );
    }
    return block.ref.digest;
  }
  return contentDigestOf(parsed);
}

function parseSchemaResource(
  scope: ResourceScope,
  ref: ResourceRef,
  refPath: string,
  subject = `content block '${refPath}'`,
): JsonValue {
  const bytes = scope.verify(ref);
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as JsonValue;
  } catch {
    throw refusal(
      'DH_BUILD_SCHEMA_INVALID',
      `schema resource '${ref.packageId}/${ref.path}' for ${subject} is not JSON`,
      refPath,
    );
  }
}
