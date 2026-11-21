/** BUILD 的源代码门禁：遍历最终 ESM 模块闭包，拒绝未声明的跨 Package 调用入口。 */
import { posix } from 'node:path';
import * as ts from 'typescript';
import type { DomainPackageManifest, ResourceRef } from '@kaicreator/domain-harness-contracts';
import { isRelativeResourcePath } from '@kaicreator/domain-harness-contracts';
import { ResourceScope, digestOfBytes } from './resources.js';
import { refusal } from './refusal.js';

/**
 * 只接受已封存的静态 ESM 模块。动态求值和未知模块无法证明直接依赖合法，必须拒绝。
 * 不运行生成代码；通过 AST（而非正则）解析 import/export/import() 的静态目标。
 */
export function verifyGeneratedPackageImports(
  scope: ResourceScope,
  manifests: readonly DomainPackageManifest[],
  entries: readonly ResourceRef[],
): void {
  const selected = new Map(manifests.map((pkg) => [pkg.id, pkg]));
  const done = new Set<string>();
  const ids = [...selected.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b));
  const visit = (ref: ResourceRef): void => {
    const key = `${ref.packageId}/${ref.path}`;
    if (done.has(key)) return;
    done.add(key);
    const bytes = scope.verify(ref);
    const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const source = ts.createSourceFile(ref.path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const consumer = selected.get(ref.packageId);
    if (!consumer) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `module '${key}' has no selected Package owner`);
    }
    const allowed = new Set(consumer.dependsOn.map((dep) => dep.package));
    const inspectModule = (specifier: string): void => {
      if (specifier.startsWith('node:')) return;
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const relative = posix.normalize(posix.join(posix.dirname(ref.path), specifier));
        if (!isRelativeResourcePath(relative) || !/\.(?:mjs|js)$/u.test(relative)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `module '${key}' has unresolved or escaping relative import '${specifier}'`);
        }
        const childBytes = scope.read(ref.packageId, relative);
        visit({ packageId: ref.packageId, path: relative, digest: digestOfBytes(childBytes) });
        return;
      }
      const owner = ids.find((id) => specifier === id || specifier.startsWith(`${id}/`));
      if (!owner || (owner !== ref.packageId && !allowed.has(owner))) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `package '${ref.packageId}' imports undeclared or unknown Extension '${specifier}' from '${ref.path}'`);
      }
    };
    const walk = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        const module = node.moduleSpecifier;
        if (module && ts.isStringLiteral(module)) inspectModule(module.text);
      }
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg = node.arguments[0];
          if (!arg || !ts.isStringLiteral(arg)) {
            throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `dynamic import with nonliteral target in '${key}'`);
          }
          inspectModule(arg.text);
        }
        if (ts.isIdentifier(node.expression) && ['require', 'eval', 'Function'].includes(node.expression.text)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `opaque code-loading call '${node.expression.text}' in '${key}'`);
        }
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) &&
          ['Function', 'Worker'].includes(node.expression.text)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `opaque code constructor '${node.expression.text}' in '${key}'`);
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  };
  for (const entry of entries) visit(entry);
}

/**
 * BUILD 不能只相信 Manifest 中的 EntryRef：最终 artifact 必须真实导出可调用的 Init，
 * Exit 可选，但声明时也必须在相同模块以静态函数导出。
 */
export function verifyLifecycleExports(scope: ResourceScope, pkg: DomainPackageManifest, artifact: ResourceRef): void {
  const source = ts.createSourceFile(
    artifact.path,
    new TextDecoder('utf-8', { fatal: true }).decode(scope.read(artifact.packageId, artifact.path)),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const found = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement) || !statement.name) continue;
    if (!statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) continue;
    found.add(statement.name.text);
  }
  for (const name of [pkg.init && 'init', pkg.exit && 'exit'].filter((item): item is string => !!item)) {
    if (!found.has(name)) {
      throw refusal('DH_BUILD_SCHEMA_INVALID',
        `Package '${pkg.id}' declares ${name} Element but artifact '${artifact.path}' does not statically export a function named '${name}'`);
    }
  }
}
