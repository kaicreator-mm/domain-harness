/** BUILD 的源代码门禁：遍历最终 ESM 模块闭包，拒绝未声明的跨 Package 调用入口。 */
import { posix } from 'node:path';
import * as ts from 'typescript';
import type { DomainPackageManifest, ResourceRef } from '@kaicreator/domain-harness-contracts';
import { isRelativeResourcePath } from '@kaicreator/domain-harness-contracts';
import { ResourceScope, digestOfBytes } from './resources.js';
import { refusal } from './refusal.js';
import { resolveExportedModule } from './app-package.js';

const SAFE_BUILTINS = new Set(['node:buffer', 'node:crypto', 'node:path', 'node:url', 'node:util']);
const OPAQUE_IDENTIFIERS = new Set(['require', 'eval', 'Function', 'Worker', 'Reflect']);
const OPAQUE_MEMBERS = new Set([
  'require',
  'eval',
  'Function',
  'Worker',
  'Reflect',
  'createRequire',
  'getBuiltinModule',
  'compileFunction',
  'runInContext',
  'runInNewContext',
  'runInThisContext',
  'getOwnPropertyDescriptor',
  'getOwnPropertyDescriptors',
  'getPrototypeOf',
  'constructor',
  'instantiate',
  'evaluate',
]);

function propertyName(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : null;
}

function callableName(node: ts.Expression): string | null {
  if (ts.isIdentifier(node)) return node.text;
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return propertyName(node);
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  return ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) =>
    modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function parseModule(ref: ResourceRef, bytes: Uint8Array): ts.SourceFile {
  const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const source = ts.createSourceFile(ref.path, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const parseDiagnostics = (source as ts.SourceFile & { readonly parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
  if (parseDiagnostics.length > 0) {
    throw refusal('DH_BUILD_SCHEMA_INVALID',
      `generated module '${ref.packageId}/${ref.path}' contains a JavaScript syntax error (TS${parseDiagnostics[0]!.code})`);
  }
  return source;
}

function staticallyExportedNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.name && hasExportModifier(statement)) {
      names.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement) && hasExportModifier(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    }
    if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier &&
        statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) names.add(element.name.text);
    }
  }
  return names;
}

function publicFunctionExportNames(pkg: DomainPackageManifest, module: ResourceRef): Set<string> {
  const names = new Set<string>();
  if (pkg.init.module.packageId === module.packageId && pkg.init.module.path === module.path) {
    names.add(pkg.init.exportName);
  }
  for (const variant of pkg.targetVariants) {
    for (const implementation of variant.implementations) {
      if (implementation.entry.module.packageId !== module.packageId || implementation.entry.module.path !== module.path) continue;
      const exported = pkg.exports.some((entry) =>
        (entry.elementId === undefined || entry.elementId === implementation.elementId) &&
        (entry.functionId === undefined || entry.functionId === implementation.functionId) &&
        (entry.elementId !== undefined || entry.functionId !== undefined));
      if (exported) names.add(implementation.entry.exportName);
    }
  }
  return names;
}

/**
 * 只接受已封存的静态 ESM 子集。动态求值、未知模块、非公开导出和原始跨包句柄
 * 无法证明直接依赖合法，必须在 BUILD 拒绝；运行时不重复这套静态检查。
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
    const source = parseModule(ref, scope.verify(ref));
    const consumer = selected.get(ref.packageId);
    if (!consumer) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `module '${key}' has no selected Package owner`);
    }
    const allowed = new Set(consumer.dependsOn.map((dep) => dep.package));
    const inspectModule = (specifier: string, declaration?: ts.ImportDeclaration, dynamic = false): string => {
      if (specifier.startsWith('node:')) {
        if (!SAFE_BUILTINS.has(specifier)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `Package '${ref.packageId}' uses unapproved Node capability '${specifier}'`);
        }
        return 'node:builtin';
      }
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const relative = posix.normalize(posix.join(posix.dirname(ref.path), specifier));
        if (!isRelativeResourcePath(relative) || !/\.(?:mjs|js)$/u.test(relative)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `module '${key}' has unresolved or escaping relative import '${specifier}'`);
        }
        const childBytes = scope.read(ref.packageId, relative);
        visit({ packageId: ref.packageId, path: relative, digest: digestOfBytes(childBytes) });
        return ref.packageId;
      }
      const owner = ids.find((id) => specifier === id || specifier.startsWith(`${id}/`));
      if (!owner || (owner !== ref.packageId && !allowed.has(owner))) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `package '${ref.packageId}' imports undeclared or unknown Extension '${specifier}' from '${ref.path}'`);
      }
      if (dynamic && owner !== ref.packageId) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `dynamic cross-Package import '${specifier}' in '${key}' cannot preserve direct-handle provenance`);
      }
      const subpath = specifier === owner ? '.' : `./${specifier.slice(owner.length + 1)}`;
      const target = resolveExportedModule(scope, owner, subpath);
      const clause = declaration?.importClause;
      if (owner !== ref.packageId && clause) {
        if (clause.name || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))) {
          throw refusal('DH_BUILD_EXPORT_MISSING',
            `Package '${ref.packageId}' may use only named public imports from '${specifier}'`);
        }
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          const actual = staticallyExportedNames(parseModule(target, scope.verify(target)));
          const publicNames = publicFunctionExportNames(selected.get(owner)!, target);
          for (const element of clause.namedBindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;
            if (!actual.has(importedName) || !publicNames.has(importedName)) {
              throw refusal('DH_BUILD_EXPORT_MISSING',
                `Package '${ref.packageId}' imports private or missing export '${importedName}' from '${specifier}'`);
            }
          }
        }
      }
      visit(target);
      return owner;
    };
    const rejectHandle = (name: string, where: string): void => {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
        `module '${key}' passes raw cross-Package handle '${name}' through ${where}`);
    };

    const foreignHandles = new Set<string>();
    for (const statement of source.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const owner = inspectModule(statement.moduleSpecifier.text, statement);
      if (owner === ref.packageId || owner === 'node:builtin') continue;
      const clause = statement.importClause;
      if (!clause) continue;
      if (clause.name) foreignHandles.add(clause.name.text);
      const bindings = clause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) foreignHandles.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) foreignHandles.add(element.name.text);
      }
    }
    let aliasChanged = true;
    while (aliasChanged) {
      aliasChanged = false;
      const collectAliases = (node: ts.Node): void => {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer &&
            ts.isIdentifier(node.initializer) && foreignHandles.has(node.initializer.text) &&
            !foreignHandles.has(node.name.text)) {
          foreignHandles.add(node.name.text);
          aliasChanged = true;
        }
        ts.forEachChild(node, collectAliases);
      };
      ts.forEachChild(source, collectAliases);
    }

    const walk = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && OPAQUE_IDENTIFIERS.has(node.text)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `opaque code-loading identifier '${node.text}' in '${key}'`);
      }
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
        const name = propertyName(node);
        if (name !== null && OPAQUE_MEMBERS.has(name)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `opaque reflective member '${name}' in '${key}'`);
        }
      }
      if (ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `module '${key}' re-exports a Package API instead of owning its public boundary`);
        }
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            const local = element.propertyName?.text ?? element.name.text;
            if (foreignHandles.has(local)) rejectHandle(local, 'an export clause');
          }
        }
      }
      if (ts.isExportAssignment(node) && ts.isIdentifier(node.expression) && foreignHandles.has(node.expression.text)) {
        rejectHandle(node.expression.text, 'a default export');
      }
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isIdentifier(node.initializer) &&
          foreignHandles.has(node.initializer.text) && hasExportModifier(node.parent.parent)) {
        rejectHandle(node.initializer.text, 'an exported variable');
      }
      if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer) &&
          hasExportModifier(node.parent.parent) && ts.isIdentifier(node.initializer.body) &&
          foreignHandles.has(node.initializer.body.text)) {
        rejectHandle(node.initializer.body.text, 'an exported arrow function');
      }
      if (ts.isReturnStatement(node) && node.expression && ts.isIdentifier(node.expression) &&
          foreignHandles.has(node.expression.text)) {
        rejectHandle(node.expression.text, 'a return value');
      }
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          const arg = node.arguments[0];
          if (!arg || !ts.isStringLiteral(arg)) {
            throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `dynamic import with nonliteral target in '${key}'`);
          }
          inspectModule(arg.text, undefined, true);
        } else {
          if (ts.isElementAccessExpression(node.expression) && !ts.isStringLiteral(node.expression.argumentExpression)) {
            throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `computed call target in '${key}' is not statically provable`);
          }
          const name = callableName(node.expression);
          if (name !== null && OPAQUE_MEMBERS.has(name)) {
            throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `opaque code-loading call '${name}' in '${key}'`);
          }
        }
      }
      if (ts.isNewExpression(node)) {
        if (ts.isElementAccessExpression(node.expression) && !ts.isStringLiteral(node.expression.argumentExpression)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `computed constructor target in '${key}' is not statically provable`);
        }
        const name = callableName(node.expression);
        if (name !== null && OPAQUE_MEMBERS.has(name)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `opaque code constructor '${name}' in '${key}'`);
        }
      }
      ts.forEachChild(node, walk);
    };
    walk(source);
  };
  for (const entry of entries) visit(entry);
}

/** BUILD 不能只相信 Manifest 中的 EntryRef：最终 artifact 必须真实导出可调用的 Init/Exit。 */
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
