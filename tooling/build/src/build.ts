/** 构建期职责：校验并封存选定的依赖、资源和函数，保证生成确定性 Lock。 */
import {
  DH_LOCK_SCHEMA_VERSION,
  NODE22_ESM_PROFILE,
  contentDigestOf,
  isRelativeResourcePath,
  isUnknownContentKind,
  validateDomainDefinition,
  validateElementDefinition,
  validateWorkflowDefinition,
  WORKFLOW_DEFINITION_JSON_SCHEMA,
  type WorkflowRef,
  type WorkflowDefinition,
  type SelectedWorkflow,
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
import { parseDocument } from 'yaml';
import type {
  BuildInput,
  BuildResult,
  BuildSuccess,
} from './types.js';
import { BuildRefusal, refusal } from './refusal.js';
import { SchemaChecker } from './schema-check.js';
import { ResourceScope, digestOfBytes } from './resources.js';
import { compareSemver, kahnTopologicalOrder, satisfiesSemver } from './graph.js';
import { verifyGeneratedPackageImports, verifyImplementationExport } from './static-package-guard.js';
import { composeAppPackage, sameAppPackageBytes, sealPackageManifest } from './app-package.js';
import { TRUSTED_WORKFLOW_NPM_ARCHIVES } from './trusted-runtime.js';


interface LoadedElement {
  readonly def: ElementDefinition;
  readonly namespace: string;
  readonly key: string;
  readonly definitionDigest: ContentDigest;
  readonly owner: DomainPackageManifest;
  readonly visibility: 'public' | 'private';
}

interface ResolvedFunction {
  readonly element: LoadedElement;
  readonly fn: FunctionContract;
  readonly owner: DomainPackageManifest;
}

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


/** 构建入口只处理已声明的域定义与资源闭包。错误返回稳定拒绝码，不修复输入，也不在运行期重新选择实现。 */
export function buildApp(input: BuildInput): BuildResult {
  try {
    return { ok: true, ...runBuild(input) };
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
function runBuild(input: BuildInput): Omit<BuildSuccess, 'ok'> {
  // 第 1 段：先验证 App、Domain 和 Manifest 的机器合同，再允许任何包进入候选池。
  const schemas = new SchemaChecker();

  schemas.validateDocument('descriptor', input.descriptor);
  const descriptor = input.descriptor as DomainAppDescriptor;

  for (const [index, domain] of (input.domains ?? []).entries()) {
    const result = validateDomainDefinition(domain);
    if (!result.ok) {
      const issue = firstIssue(result.issues);
      throw new BuildRefusal(
        issue.code as BuildErrorCode,
        `domains[${index}]: ${issue.message}`,
        issue.path,
      );
    }
    schemas.validateDocument('domain', domain);
  }

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

  if (!isRelativeResourcePath(input.kdpArtifact.path)) {
    throw refusal('DH_BUILD_RESOURCE_MISSING', 'KDP bootstrap artifact path is not a canonical in-package path');
  }

  // 第 2 段：从唯一 KDP 与 BUILD 选定的任意数量 Core 出发，沿 dependsOn 扩展闭包。
  const selected = new Map<string, DomainPackageManifest>();
  const rootCoreIds = new Set<string>();
  const selectCore = (
    ref: DomainAppDescriptor['roots']['cores'][number],
    slot: string,
    requiredLayer?: 'kernel',
  ): void => {
    const manifest = pool.get(ref.package);
    if (!manifest || manifest.version !== ref.version) {
      throw refusal(
        'DH_BUILD_REF_UNRESOLVED',
        `descriptor roots.${slot} references '${ref.package}@${ref.version}' which is not in the package pool`,
        `roots.${slot}`,
      );
    }
    if (manifest.role !== 'primary') {
      throw refusal(
        'DH_BUILD_LAYER_ROLE_MISMATCH',
        `roots.${slot} package '${ref.package}' declares role='${manifest.role}'; a Core root must reference a primary package`,
        `roots.${slot}`,
      );
    }
    if (requiredLayer !== undefined && manifest.layer !== requiredLayer) {
      throw refusal(
        'DH_BUILD_PRIMARY_MISSING',
        `roots.${slot} package '${ref.package}' declares layer='${manifest.layer}'; KDP must be the kernel Core`,
        `roots.${slot}`,
      );
    }
    if (rootCoreIds.has(manifest.id)) {
      throw refusal('DH_BUILD_PRIMARY_DUPLICATE', `Core '${manifest.id}' is selected by more than one root entry`);
    }
    rootCoreIds.add(manifest.id);
    selected.set(manifest.id, manifest);
  };
  selectCore(descriptor.roots.kernelPrimary, 'kernelPrimary', 'kernel');
  descriptor.roots.cores.forEach((ref, index) => selectCore(ref, `cores[${index}]`));
  for (const [index, ref] of descriptor.extensions.entries()) {
    const manifest = pool.get(ref.package);
    if (!manifest || manifest.version !== ref.version) {
      throw refusal(
        'DH_BUILD_REF_UNRESOLVED',
        `descriptor extensions[${index}] references '${ref.package}@${ref.version}' which is not in the package pool`,
        `extensions[${index}]`,
      );
    }
    selected.set(manifest.id, manifest);
  }

  const queue = [...selected.keys()].sort();
  const dependsOnEdges = new Map<string, readonly string[]>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    const manifest = selected.get(id)!;
    const edges: string[] = [];
    for (const dep of manifest.dependsOn) {
      const targetManifest = pool.get(dep.package);
      if (!targetManifest || !satisfiesSemver(targetManifest.version, dep.version)) {
        throw refusal(
          'DH_BUILD_DEPENDS_ON_UNSELECTED',
          `'${id}' depends on '${dep.package}@${dep.version}' which is not selected and cannot be resolved`,
          'dependsOn',
        );
      }
      const exportedInterfaces = new Set(
        targetManifest.exports
          .map((entry) => entry.interfaceId)
          .filter((value): value is string => value !== undefined),
      );
      if (!exportedInterfaces.has(dep.interface)) {
        throw refusal(
          'DH_BUILD_EXPORT_MISSING',
          `'${id}' depends on interface '${dep.interface}' which '${dep.package}' does not export`,
          'dependsOn',
        );
      }
      edges.push(dep.package);
      if (!selected.has(dep.package)) {
        selected.set(dep.package, targetManifest);
        queue.push(dep.package);
        queue.sort();
      }
    }
    dependsOnEdges.set(id, edges);
  }

  for (const manifest of selected.values()) {
    if (manifest.role === 'primary' && !rootCoreIds.has(manifest.id)) {
      throw refusal(
        'DH_BUILD_PRIMARY_MISSING',
        `selected Core '${manifest.id}' is not declared in descriptor roots; every Core must be BUILD-selected explicitly`,
      );
    }
  }

  // 第 3 段：按真实文件字节验证 Element 定义及资源；同一 Element 的 ID/版本只能有一个 owner。
  const scope = new ResourceScope(input.packageRoots);
  const elements = new Map<string, LoadedElement>();
  const byLogicalId = new Map<string, Map<SemVer, LoadedElement>>();
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
      const versions = byLogicalId.get(def.id) ?? new Map<SemVer, LoadedElement>();
      versions.set(def.version, loaded);
      byLogicalId.set(def.id, versions);
    }
  }
  for (const [id, versions] of byLogicalId) {
    if (versions.size > 1) {
      throw refusal(
        'DH_BUILD_VERSION_CONFLICT',
        `element '${id}' is required at multiple versions: ${[...versions.keys()].sort().join(', ')}`,
      );
    }
  }

  // Element.dependencies 是 BUILD 时静态 DAG；循环与未选定引用在封存前拒绝，不等于任务执行 Workflow。
  const elementDeps = new Map<string, readonly string[]>();
  for (const loaded of elements.values()) {
    const deps: string[] = [];
    for (const dep of loaded.def.dependencies ?? []) {
      const versions = byLogicalId.get(dep.element);
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
    const versions = byLogicalId.get(ref.element.id);
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

  // 0.11.1 T12：只在原 BUILD 中静态闭合 WorkflowRoots→子 Workflow→实际 Element.Function。
  // 这不是第二套 Compiler/Lock：所有节点仍加入上面的 selectedFunctions，
  // 资源仍经原 ResourceScope，封存后供同一个 KDP 执行，不允许运行期发现功能。
  const sealedWorkflows = new Map<string, SelectedWorkflow>();
  const visitingWorkflows = new Set<string>();
  const selectedWorkflowRoots = new Map<string, readonly WorkflowRef[]>();
  const workflowKey = (ref: WorkflowRef): string => canonicalJson(toJson(ref));
  const workflowElement = (ref: WorkflowRef, caller: string): LoadedElement => {
    const loaded = elements.get(`${ref.element.namespace}|${ref.element.id}|${ref.element.version}`);
    if (!loaded || loaded.definitionDigest !== ref.element.digest) {
      throw refusal('DH_BUILD_REF_UNRESOLVED',
        `WorkflowRef '${ref.element.id}/${ref.contentId}' does not resolve to the exact selected Element`);
    }
    if (loaded.owner.id !== caller) {
      if (!(dependsOnEdges.get(caller) ?? []).includes(loaded.owner.id) ||
          selected.get(loaded.owner.id)?.role !== 'extension') {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `Package '${caller}' invokes Workflow from undeclared direct Extension '${loaded.owner.id}'`);
      }
      if (!isExported(loaded.owner, loaded, undefined)) {
        throw refusal('DH_BUILD_EXPORT_MISSING',
          `Package '${caller}' invokes non-public Workflow Element '${loaded.def.id}'`);
      }
    }
    return loaded;
  };
  const parseWorkflow = (loaded: LoadedElement, ref: WorkflowRef): WorkflowDefinition => {
    const blocks = loaded.def.content.filter((block) => block.id === ref.contentId);
    if (blocks.length !== 1 || blocks[0]!.contentKind !== 'workflow-definition') {
      throw refusal('DH_BUILD_REF_UNRESOLVED',
        `WorkflowRef '${loaded.def.id}/${ref.contentId}' requires exactly one workflow-definition ContentBlock`);
    }
    const block = blocks[0]!;
    let raw: unknown = block.value;
    if (block.ref) {
      if (block.ref.packageId !== loaded.owner.id &&
          (!(dependsOnEdges.get(loaded.owner.id) ?? []).includes(block.ref.packageId) ||
           selected.get(block.ref.packageId)?.role !== 'extension')) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `Workflow '${loaded.def.id}' content resource is outside directly selected Extensions`);
      }
      const bytes = scope.verify(block.ref);
      try {
        raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
      } catch {
        throw refusal('DH_BUILD_SCHEMA_INVALID',
          `Workflow '${loaded.def.id}/${ref.contentId}' content must be valid UTF-8 JSON`);
      }
    }
    const valid = validateWorkflowDefinition(raw);
    if (!valid.ok) {
      const issue = firstIssue(valid.issues);
      throw new BuildRefusal(issue.code as BuildErrorCode, issue.message, issue.path);
    }
    const schema = schemas.compileContentSchema(
      WORKFLOW_DEFINITION_JSON_SCHEMA, `${loaded.def.id}/${ref.contentId}/workflow-definition`);
    if (!schema(raw)) {
      throw refusal('DH_BUILD_SCHEMA_INVALID',
        `Workflow '${loaded.def.id}/${ref.contentId}' violates versioned machine Schema`);
    }
    return raw as WorkflowDefinition;
  };
  const addWorkflowFunction = (
    ref: FunctionRef, caller: DomainPackageManifest, path: string,
  ): void => {
    const resolved = resolveFunctionRef(ref, path);
    requireExported(resolved, caller.id);
    // 与普通 Package.imports 一样严格：引用一个跨包 Function 不能只因声明
    // dependsOn 就自动获得它；必须把确切 FunctionRef 列入 Manifest.imports。
    if (resolved.owner.id !== caller.id && !caller.imports.some((item) =>
      canonicalJson(toJson(item)) === canonicalJson(toJson(ref)))) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
        `Workflow '${caller.id}' must import exact FunctionRef '${ref.element.id}.${ref.functionId}'`);
    }
    addSelected(resolved);
  };
  const selectWorkflow = (ref: WorkflowRef, caller: string, stackDepth: number): void => {
    if (stackDepth > 32) {
      throw refusal('DH_BUILD_SCHEMA_INVALID', 'selected Workflow nesting exceeds bounded stack depth');
    }
    const loaded = workflowElement(ref, caller); // 每个调用点独立检查访问权限。
    const key = workflowKey(ref);
    if (visitingWorkflows.has(key)) {
      throw refusal('DH_BUILD_ELEMENT_CYCLE',
        `Workflow nesting recursively invokes active Workflow '${ref.element.id}/${ref.contentId}'`);
    }
    if (sealedWorkflows.has(key)) return;
    visitingWorkflows.add(key);
    const def = parseWorkflow(loaded, ref);
    const owner = loaded.owner;
    sealedWorkflows.set(key, {
      ref, ownerPackageId: owner.id, definitionDigest: contentDigestOf(toJson(def)),
      definition: def,
    });
    for (const node of def.nodes) {
      if (node.kind === 'workflow') {
        selectWorkflow(node.workflow, owner.id, stackDepth + 1);
        continue;
      }
      addWorkflowFunction(node.function, owner, `workflow.${def.id}.nodes.${node.id}.function`);
      if (node.hooks?.start) {
        addWorkflowFunction(node.hooks.start, owner, `workflow.${def.id}.nodes.${node.id}.hooks.start`);
      }
      if (node.hooks?.end) {
        addWorkflowFunction(node.hooks.end, owner, `workflow.${def.id}.nodes.${node.id}.hooks.end`);
      }
      if (node.data) {
        const data = node.data;
        const resourceOwner = data.resource.packageId;
        if (resourceOwner !== owner.id &&
            (!(dependsOnEdges.get(owner.id) ?? []).includes(resourceOwner) ||
             selected.get(resourceOwner)?.role !== 'extension')) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `Workflow Reader in '${owner.id}' requests resource from undeclared direct Extension '${resourceOwner}'`);
        }
        const bytes = scope.verify(data.resource);
        if (bytes.byteLength > data.maxBytes) {
          throw refusal('DH_BUILD_SCHEMA_INVALID',
            `Workflow Reader resource '${resourceOwner}/${data.resource.path}' exceeds declared maxBytes`);
        }
        let utf8: string;
        try {
          utf8 = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
          throw refusal('DH_BUILD_SCHEMA_INVALID', 'Workflow Reader resource must be strict UTF-8');
        }
        // JSON/YAML 都在 BUILD 中真实解析为可规范化的纯 JSON 数据；
        // YAML 使用 core schema、唯一键和有限 alias，拒绝 tag/循环/恶意扩展。
        if (data.format === 'json') {
          try { canonicalJson(JSON.parse(utf8)); } catch {
            throw refusal('DH_BUILD_SCHEMA_INVALID', 'selected JSON Reader resource contains invalid JSON data');
          }
        } else {
          try {
            const document = parseDocument(utf8, {
              schema: 'core', strict: true, uniqueKeys: true,
              version: '1.2', logLevel: 'silent', intAsBigInt: false,
            });
            if (document.errors.length > 0 || document.warnings.length > 0) throw new Error('YAML parse rejected');
            const parsed: unknown = document.toJS({ maxAliasCount: 32 });
            canonicalJson(parsed);
          } catch {
            throw refusal('DH_BUILD_SCHEMA_INVALID', 'selected YAML Reader resource contains unsafe or invalid YAML data');
          }
        }
      }
    }
    visitingWorkflows.delete(key);
  };
  for (const manifest of packagesSorted) {
    if (!manifest.workflowRoots?.length) continue;
    const roots = [...manifest.workflowRoots];
    const unique = new Set<string>();
    for (const ref of roots) {
      const key = workflowKey(ref);
      if (unique.has(key)) {
        throw refusal('DH_BUILD_SCHEMA_INVALID',
          `Package '${manifest.id}' declares duplicate selected WorkflowRoot '${ref.element.id}/${ref.contentId}'`);
      }
      unique.add(key);
      selectWorkflow(ref, manifest.id, 0);
    }
    selectedWorkflowRoots.set(manifest.id, roots);
  }

  // 第 4 段：只为真正选中的 Function 查找恰好一个目标实现，并封存实现字节与声明资源的摘要。
  const sealedFunctions: SelectedFunction[] = [];
  for (const resolved of [...selectedFunctions.values()].sort(compareResolvedFunction)) {
    validateSelectedFunctionSchemas(schemas, scope, selected, resolved);
    if (resolved.fn.effects !== 'none') {
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
    verifyImplementationExport(scope, binding.entry, `${resolved.element.def.id}.${resolved.fn.id}`);
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
    sealedFunctions.push({
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
  const kdpId = descriptor.roots.kernelPrimary.package;
  if (coreOrders.get(0) !== kdpId || input.kdpArtifact.packageId !== kdpId) {
    throw refusal(
      'DH_BUILD_PRIMARY_MISSING',
      `Order 0 KDP '${kdpId}' must also own bootstrap artifact '${input.kdpArtifact.packageId}'`,
    );
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
      contentDigests.push(validateBlockContent(schemas, loaded, block, scope));
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
  for (const manifest of packagesSorted) {
    const artifactPath = input.packageArtifacts[manifest.id];
    if (!artifactPath) {
      throw refusal('DH_BUILD_RESOURCE_MISSING', `no artifact path provided for selected package '${manifest.id}'`);
    }
    const bytes = scope.read(manifest.id, artifactPath);
    const digest = digestOfBytes(bytes);
    scope.record(manifest.id, artifactPath, digest);
    // 已选 Target 的真实命名导出在 sealedFunctions 构造时逐个检验。
    sealPackageManifest(scope, manifest, manifest.id === kdpId ? input.kdpArtifact.path : undefined);
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
  // 对最终选定的 ESM 模块字节做静态检查；依赖无法证明时 BUILD 拒绝。
  verifyGeneratedPackageImports(scope, packagesSorted, [
    ...sealedPackages.map((pkg) => pkg.artifact),
    ...sealedFunctions.map((fn) => fn.implementation.module),
    ...hookBindings.flatMap((hook) => hook.providers.map((ref) => {
      const selected = sealedFunctions.find((fn) => canonicalJson(toJson(fn.ref)) === canonicalJson(toJson(ref)));
      if (!selected) throw refusal('DH_BUILD_IMPLEMENTATION_MISSING', 'Hook provider implementation missing');
      return selected.implementation.module;
    })),
  ]);
  const kdpBytes = scope.read(input.kdpArtifact.packageId, input.kdpArtifact.path);
  const kdpDigest = digestOfBytes(kdpBytes);
  scope.record(input.kdpArtifact.packageId, input.kdpArtifact.path, kdpDigest);

  // 第 6 段：同时封存描述符语义、KDP 入口字节、Package/Function/Hook 与资源闭包。
  const descriptorDigest = contentDigestOf(toJson(descriptor));
  const assemble = (): DomainAppLock => {
    const withoutDigest = {
      kind: 'DomainAppLock' as const,
      schemaVersion: DH_LOCK_SCHEMA_VERSION,
      appIdentity: { id: descriptor.id, version: descriptor.version, descriptorDigest },
      target,
      bootstrapKdpPin: {
        kdpPackageId: input.kdpArtifact.packageId,
        kdpPrimaryEntry: 'bootstrap' as const,
        kdpPrimaryDigest: kdpDigest,
      },
      selectedPackages: sealedPackages,
      selectedElements: sealedElements,
      selectedFunctions: sealedFunctions,
      hookBindings: [...hookBindings].sort(compareHookBinding),
      ...(sealedWorkflows.size > 0
        ? { selectedWorkflows: [...sealedWorkflows.values()].sort((a, b) =>
            workflowKey(a.ref).localeCompare(workflowKey(b.ref))) } : {}),
      ...(sealedWorkflows.size > 0
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
  const appPackage = composeAppPackage(scope, descriptor, lock, lockBytes, input.runtimeDependencies);
  const secondAppPackage = composeAppPackage(scope, descriptor, lock, lockBytes, input.runtimeDependencies);
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
function validateBlockContent(
  schemas: SchemaChecker,
  loaded: LoadedElement,
  block: ContentBlock,
  scope: ResourceScope,
): ContentDigest {
  const blockPath = `${loaded.def.id}/${block.id}`;
  if (!block.ref) {
    const value = toJson(block.value);
    validateAgainstSchema(schemas, scope, block, value, blockPath);
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
  validateAgainstSchema(schemas, scope, block, parsed, blockPath);
  return contentDigestOf(parsed);
}

function validateAgainstSchema(
  schemas: SchemaChecker,
  scope: ResourceScope,
  block: ContentBlock,
  value: JsonValue,
  blockPath: string,
): void {
  const validate =
    'inline' in block.schemaRef
      ? schemas.compileInlineSchema(block.schemaRef.inline, `${blockPath}.schemaRef`)
      : schemas.compileInlineSchema(
          parseSchemaResource(scope, block.schemaRef, blockPath),
          `${blockPath}.schemaRef`,
        );
  if (!validate(value)) {
    throw refusal(
      'DH_BUILD_SCHEMA_INVALID',
      `content block '${blockPath}' does not pass its declared schema`,
      blockPath,
    );
  }
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
