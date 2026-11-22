/**
 * Package/Element 生成期独立准入；发行 SDK 不导入本模块。
 * 作者可选用静态分析与 Schema 验证，交付前先证明源内容正确性。
 */
import {
  isUnknownContentKind,
  validateDomainDefinition,
  type BuildErrorCode,
  type JsonValue,
} from '@kaicreator/domain-harness-contracts';
import { composeApp } from './build.js';
import { BuildRefusal, refusal } from './refusal.js';
import { SchemaChecker } from './schema-check.js';
import { verifyGeneratedPackageImports, verifyImplementationExport } from './static-package-guard.js';
import type { ResourceScope } from './resources.js';
import type { LoadedElement } from './selection-types.js';
import type { BuildInput, BuildResult } from './types.js';

/** 未参与 App 选择的独立 Domain 文档只由创建者检查，SDK 不读取它们作正确性判定。 */
function validateAuthoredDomains(schemas: SchemaChecker, domains: readonly unknown[]): void {
  for (const [index, domain] of domains.entries()) {
    const result = validateDomainDefinition(domain);
    if (!result.ok) {
      const issue = result.issues[0]!;
      throw new BuildRefusal(
        issue.code as BuildErrorCode,
        `domains[${index}]: ${issue.message}`,
        issue.path,
      );
    }
    schemas.validateDocument('domain', domain);
  }
}

/** 内容值是否满足作者声明的业务 Schema 是生成期职责，不属于 App 技术封存。 */
function validateAuthoredContent(
  schemas: SchemaChecker,
  scope: ResourceScope,
  elements: readonly LoadedElement[],
): void {
  for (const loaded of elements) {
    for (const block of loaded.def.content) {
      // 未知的可选 Content 类型不参与选定资源闭包；必需类型由组合 Profile 拒绝。
      if (isUnknownContentKind(block.contentKind)) continue;
      const path = `${loaded.def.id}/${block.id}`;
      let value: JsonValue;
      if (block.ref) {
        const bytes = scope.verify(block.ref);
        try {
          value = JSON.parse(Buffer.from(bytes).toString('utf8')) as JsonValue;
        } catch {
          if (block.contentKind === 'document') continue;
          throw refusal('DH_BUILD_SCHEMA_INVALID',
            `content block '${path}' (kind '${block.contentKind}') carries non-JSON ref bytes; only document content may be opaque`, path);
        }
      } else {
        value = block.value as JsonValue;
      }

      let schema: JsonValue;
      if ('inline' in block.schemaRef) {
        schema = block.schemaRef.inline;
      } else {
        const ref = block.schemaRef;
        const bytes = scope.verify(ref);
        try {
          schema = JSON.parse(Buffer.from(bytes).toString('utf8')) as JsonValue;
        } catch {
          throw refusal('DH_BUILD_SCHEMA_INVALID',
            `schema resource '${ref.packageId}/${ref.path}' for content block '${path}' is not JSON`, path);
        }
      }
      const validate = schemas.compileInlineSchema(schema, `${path}.schemaRef`);
      if (!validate(value)) {
        throw refusal('DH_BUILD_SCHEMA_INVALID',
          `content block '${path}' does not pass its declared schema`, path);
      }
    }
  }
}

/**
 * 生成期验证和 App 组合使用同一受选资源作用域。
 * 作者合法性、静态 ESM/导出及源码闭包验证先于 Lock/安装包封存。
 */
export function buildApp(input: BuildInput): BuildResult {
  return composeApp(input, (scope, manifests, artifacts, functions, elements) => {
    const schemas = new SchemaChecker();
    validateAuthoredDomains(schemas, input.domains ?? []);
    validateAuthoredContent(schemas, scope, elements);
    for (const selected of functions) {
      verifyImplementationExport(
        scope,
        selected.implementation,
        `${selected.ref.element.id}.${selected.ref.functionId}`,
      );
    }
    verifyGeneratedPackageImports(scope, manifests, artifacts);
  });
}
