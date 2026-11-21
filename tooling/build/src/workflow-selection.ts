/** BUILD 选定 Workflow 与访问授权的唯一内部阶段；仅消费已有 Package/Function 图。 */
import {
  canonicalJson,
  contentDigestOf,
  validateWorkflowDefinition,
  WORKFLOW_DEFINITION_JSON_SCHEMA,
  type BuildErrorCode,
  type DomainPackageManifest,
  type FunctionContract,
  type FunctionRef,
  type JsonValue,
  type SelectedWorkflow,
  type ValidationIssue,
  type WorkflowDefinition,
  type WorkflowRef,
} from '@kaicreator/domain-harness-contracts';
import { parseDocument } from 'yaml';
import { BuildRefusal, refusal } from './refusal.js';
import type { SchemaChecker } from './schema-check.js';
import type { ResourceScope } from './resources.js';
import type { LoadedElement, ResolvedFunction } from './selection-types.js';

/** 只接收原 BUILD 已选的闭包和现有函数解析器，不重新计算任何权限来源。 */
interface WorkflowSelectionContext {
  readonly elements: ReadonlyMap<string, LoadedElement>;
  readonly dependsOnEdges: ReadonlyMap<string, readonly string[]>;
  readonly selected: ReadonlyMap<string, DomainPackageManifest>;
  readonly scope: ResourceScope;
  readonly schemas: SchemaChecker;
  readonly resolveFunctionRef: (ref: FunctionRef, path: string) => ResolvedFunction;
  readonly requireExported: (fn: ResolvedFunction, consumer: string | null) => void;
  readonly isExported: (owner: DomainPackageManifest, loaded: LoadedElement, fn: FunctionContract | undefined) => boolean;
  readonly addSelected: (fn: ResolvedFunction) => void;
  readonly packagesSorted: readonly DomainPackageManifest[];
}

function toJson(value: unknown): JsonValue {
  return value as JsonValue;
}

function firstIssue(issues: readonly ValidationIssue[]): ValidationIssue {
  return issues[0]!;
}

/** 对完整 WorkflowRef 使用同一份规范 JSON 键，避免 Lock 映射键在模块拆分后漂移。 */
export function workflowKey(ref: WorkflowRef): string {
  return canonicalJson(toJson(ref));
}

/** 根与子 Workflow 均在 BUILD 选定，KDP 不再重新搜索任何函数或权限。 */
export function selectWorkflows({
  elements, dependsOnEdges, selected, scope, schemas,
  resolveFunctionRef, requireExported, isExported, addSelected, packagesSorted,
}: WorkflowSelectionContext): {
  sealedWorkflows: Map<string, SelectedWorkflow>;
  selectedWorkflowRoots: Map<string, readonly WorkflowRef[]>;
} {
  // 0.11.1 T12：只在原 BUILD 中静态闭合 WorkflowRoots→子 Workflow→实际 Element.Function。
  // 这不是第二套 Compiler/Lock：所有节点仍加入上面的 selectedFunctions，
  // 资源仍经原 ResourceScope，封存后供同一个 KDP 执行，不允许运行期发现功能。
  const sealedWorkflows = new Map<string, SelectedWorkflow>();
  const visitingWorkflows = new Set<string>();
  const selectedWorkflowRoots = new Map<string, readonly WorkflowRef[]>();

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

  return { sealedWorkflows, selectedWorkflowRoots };
}
