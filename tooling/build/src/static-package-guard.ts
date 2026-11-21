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
    // BUILD 必须拒绝生成产物本身的语法错误，而不是推迟至 Node 首次 import。
    const parseDiagnostics = (source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
    if (parseDiagnostics.length > 0) {
      throw refusal('DH_BUILD_SCHEMA_INVALID',
        `generated module '${key}' contains a JavaScript syntax error (TS${parseDiagnostics[0]!.code})`);
    }
    const consumer = selected.get(ref.packageId);
    if (!consumer) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `module '${key}' has no selected Package owner`);
    }
    const allowed = new Set(consumer.dependsOn.map((dep) => dep.package));
    const inspectModule = (specifier: string): void => {
      // 不允许 Package 自己通过 Node 内置装载器/文件/进程能力重新发现其他 Package。
      if (specifier.startsWith('node:')) {
        const safeBuiltins = new Set(['node:buffer', 'node:crypto', 'node:path', 'node:url', 'node:util']);
        if (!safeBuiltins.has(specifier)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `Package '${ref.packageId}' uses unapproved Node capability '${specifier}'`);
        }
        return;
      }
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
        if (module && ts.isStringLiteral(module)) {
          // export * from Dependency 会把祖孙 Extension 原始句柄透传给消费者。
          if (ts.isExportDeclaration(node) && !module.text.startsWith('./') && !module.text.startsWith('../')) {
            throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
              `Package '${ref.packageId}' reexports a foreign Package API from '${module.text}'`);
          }
          inspectModule(module.text);
        }
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
      if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) &&
          node.expression.text === 'globalThis' && ['eval', 'Function', 'require'].includes(node.name.text)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `opaque dynamic code loader '${node.name.text}' in '${key}'`);
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
