/** BUILD 的源代码门禁：遍历最终 ESM 模块闭包，拒绝未声明的跨 Package 调用入口。 */
import { posix } from 'node:path';
import * as ts from 'typescript';
import type { DomainPackageManifest, ResourceRef } from '@kaicreator/domain-harness-contracts';
import { isRelativeResourcePath, contentDigestOf, type JsonValue } from '@kaicreator/domain-harness-contracts';
import { ResourceScope, digestOfBytes } from './resources.js';
import { refusal } from './refusal.js';
import { resolveExportedModule } from './app-package.js';

const SAFE_BUILTINS = new Set(['node:buffer', 'node:crypto', 'node:path', 'node:url', 'node:util']);
const OPAQUE_IDENTIFIERS = new Set(['require', 'eval', 'Function', 'Worker', 'Reflect']);
// 仅为当前受信任 Node Package 的静态准入拒绝，不构成任意代码的沙箱证明。
const AMBIENT_EFFECT_GLOBALS = new Set(['fetch', 'process', 'WebSocket', 'XMLHttpRequest', 'navigator', 'Deno', 'Bun']);
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

/** Target 必须有可证明的稳定可调用绑定。只接受函数声明或 const 函数表达式，
 * local export {fn as init} 必须追溯到同模块的可调用绑定。let/var 不足以证明
 * 最终 ESM 导出类型；函数声明即使初始可调用，只要存在赋值/更新也必须拒绝。
 * 动态/反射装载另由 verifyGeneratedPackageImports 继续 fail-closed。
 */
function staticallyCallableExportNames(source: ts.SourceFile): Set<string> {
  const localCallable = new Set<string>();
  const reassignableFunctions = new Set<string>();
  const exported = new Map<string, string>();
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const name = statement.name.text;
      localCallable.add(name);
      reassignableFunctions.add(name);
      if (hasExportModifier(statement)) exported.set(name, name);
    }
    if (ts.isVariableStatement(statement)) {
      const stable = (statement.declarationList.flags & ts.NodeFlags.Const) !== 0;
      if (!stable) continue;
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer ||
            (!ts.isArrowFunction(declaration.initializer) && !ts.isFunctionExpression(declaration.initializer))) continue;
        const name = declaration.name.text;
        localCallable.add(name);
        if (hasExportModifier(statement)) exported.set(name, name);
      }
    }
  }
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier ||
        !statement.exportClause || !ts.isNamedExports(statement.exportClause)) continue;
    for (const named of statement.exportClause.elements) {
      const localName = named.propertyName?.text ?? named.name.text;
      if (localCallable.has(localName)) exported.set(named.name.text, localName);
    }
  }
  // JavaScript 函数声明的绑定仍可被赋值；必须在整个语法树扫描直接赋值、
  // 复合赋值、解构赋值和 for-of/in 写入，不能仅以声明时可调用作最终证明。
  // 作用域同名写入可能被保守拒绝，但不能把无法证明的目标误判为可调用。
  const invalidated = new Set<string>();
  const markTarget = (target: ts.Node): void => {
    if (ts.isIdentifier(target)) {
      if (reassignableFunctions.has(target.text)) invalidated.add(target.text);
      return;
    }
    ts.forEachChild(target, markTarget);
  };
  const walkWrites = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      markTarget(node.left);
    }
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken)) {
      markTarget(node.operand);
    }
    if (ts.isForOfStatement(node) || ts.isForInStatement(node)) {
      if (!ts.isVariableDeclarationList(node.initializer)) markTarget(node.initializer);
    }
    ts.forEachChild(node, walkWrites);
  };
  walkWrites(source);
  const names = new Set<string>();
  for (const [publicName, localName] of exported) {
    if (!invalidated.has(localName)) names.add(publicName);
  }
  return names;
}

function publicFunctionExportNames(pkg: DomainPackageManifest, module: ResourceRef): Set<string> {
  const names = new Set<string>();
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
      // 唯一受信 KDP Host Profile 只允许精确的 SDK Host 激活端口。
      // 这是生成期许可，不能借此导入任何其他 SDK 能力、动态模块或任意包。
      if (consumer.role === 'primary' && consumer.layer === 'kernel' && consumer.order === 0 &&
          specifier === '@kaicreator/domain-harness-microkernel' && !dynamic &&
          declaration?.importClause && !declaration.importClause.name &&
          declaration.importClause.namedBindings &&
          ts.isNamedImports(declaration.importClause.namedBindings) &&
          declaration.importClause.namedBindings.elements.length === 1 &&
          declaration.importClause.namedBindings.elements[0]?.name.text === 'activateSelectedKdpHostInit' &&
          (declaration.importClause.namedBindings.elements[0]?.propertyName?.text ??
            declaration.importClause.namedBindings.elements[0]?.name.text) === 'activateSelectedKdpHostInit') {
        return 'node:builtin';
      }
      if (specifier === 'yaml') {
        // 仅所选且显式声明精确版本的 SDK/Business Package 可导入受信第三方库。
        // 此范围只支持预先审核并具有受控 SRI 的 Node ESM 子集。
        // 未选定、未经声明或动态加载的外部依赖全部拒绝。
        const json = JSON.parse(Buffer.from(scope.read(ref.packageId, 'package.json')).toString('utf8')) as {
          readonly dependencies?: Readonly<Record<string, string>>;
        };
        if (dynamic || (consumer.layer !== 'business' && consumer.layer !== 'sdk') ||
            json.dependencies?.yaml !== '2.9.1') {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `Package '${ref.packageId}' imports unapproved external npm capability '${specifier}'`);
        }
        return 'node:builtin';
      }
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
          const ownerPackage = selected.get(owner)!;
          const publicNames = publicFunctionExportNames(ownerPackage, target);
          for (const element of clause.namedBindings.elements) {
            const importedName = element.propertyName?.text ?? element.name.text;
            if (!actual.has(importedName) || !publicNames.has(importedName)) {
              throw refusal('DH_BUILD_EXPORT_MISSING',
                `Package '${ref.packageId}' imports private or missing export '${importedName}' from '${specifier}'`);
            }
            // 仅声明直接 Package dependsOn 不提供具体 Element.Function 的调用权；
            // 必须同时持有已选 owner 的真实 Element 内容摘要 + 精确 FunctionRef。
            const matched = ownerPackage.targetVariants.some((variant) =>
              variant.implementations.some((binding) => {
                if (binding.entry.exportName !== importedName ||
                    binding.entry.module.packageId !== target.packageId ||
                    binding.entry.module.path !== target.path ||
                    binding.entry.module.digest !== target.digest) return false;
                const entry = ownerPackage.elements.find((candidate) =>
                  candidate.id === binding.elementId);
                if (!entry) return false;
                const definition = JSON.parse(new TextDecoder('utf-8', { fatal: true })
                  .decode(scope.verify(entry.definitionRef))) as JsonValue;
                const digest = contentDigestOf(definition);
                return consumer.imports.some((authorized) =>
                  authorized.element.id === binding.elementId &&
                  authorized.element.namespace === binding.elementId.split('.')[0] &&
                  authorized.element.version === entry.version &&
                  authorized.element.digest === digest &&
                  authorized.functionId === binding.functionId &&
                  authorized.contractVersion === binding.contractVersion);
              }));
            if (!matched) {
              throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
                `Package '${ref.packageId}' imports '${importedName}' without exact FunctionRef authorization`);
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
      if (ts.isIdentifier(node) && AMBIENT_EFFECT_GLOBALS.has(node.text) &&
          !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) &&
          !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `unapproved ambient process/network global '${node.text}' in '${key}'`);
      }
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
          ts.isIdentifier(node.expression) && (node.expression.text === 'globalThis' || node.expression.text === 'global') &&
          AMBIENT_EFFECT_GLOBALS.has(propertyName(node) ?? '')) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `unapproved ambient process/network access in '${key}'`);
      }
      if (ts.isElementAccessExpression(node) &&
          !ts.isStringLiteral(node.argumentExpression) &&
          !ts.isNumericLiteral(node.argumentExpression)) {
        // 即便尚未调用，计算得出的属性也可能是 Function/createRequire 等动态加载器。
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `computed member access in '${key}' is not in the statically provable ESM subset`);
      }
      if (ts.isComputedPropertyName(node) && !ts.isStringLiteral(node.expression) &&
          !ts.isNumericLiteral(node.expression)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `computed property declaration in '${key}' is not statically provable`);
      }
      if ((ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))) {
        const name = propertyName(node);
        if (name !== null && OPAQUE_MEMBERS.has(name)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `opaque reflective member '${name}' in '${key}'`);
        }
      }
      // 已获授权的外部 Function 只可直接调用，不能把原始句柄装入对象、
      // 赋值、透传或作为回调参数泄露给没有直接 Extension 声明的第三方。
      if (ts.isIdentifier(node) && foreignHandles.has(node.text) &&
          !ts.isImportSpecifier(node.parent) &&
          !(ts.isCallExpression(node.parent) && node.parent.expression === node)) {
        rejectHandle(node.text, 'a non-call use');
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
          // KDP 必须在首次 ESM 求值前完成闭包验证，延迟 import 即使字面量也不可出现。
          // 普通 Business/SDK 仍按各自受选静态子集规则处理，不能用 KDP 权限放行。
          if (consumer.role === 'primary' && consumer.layer === 'kernel' && consumer.order === 0) {
            throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
              `selected KDP module '${key}' cannot use dynamic import (including literal imports)`);
          }
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

/** 已选 Function Target 必须在真实封存 ESM 中拥有该具名静态导出。 */
export function verifyImplementationExport(
  scope: ResourceScope,
  target: { readonly module: ResourceRef; readonly exportName: string },
  identity: string,
): void {
  const source = parseModule(target.module, scope.verify(target.module));
  if (!staticallyCallableExportNames(source).has(target.exportName)) {
    throw refusal('DH_BUILD_IMPLEMENTATION_MISSING',
      `selected Function '${identity}' Target '${target.module.packageId}/${target.module.path}' has no statically callable export '${target.exportName}'`);
  }
}
