/** 作者/Agent 在生成期检查静态 ESM Package 组合；不属于 SDK 运行时。 */
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const builtins = new Set(builtinModules.map((name) => name.replace(/^node:/u, '')));

function refuse(code) {
  throw new Error(code);
}

function externalName(specifier) {
  if (specifier.startsWith('node:') || builtins.has(specifier)) return null;
  if (specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    if (parts.length < 2) refuse('GEN_INVALID_IMPORT');
    return parts.slice(0, 2).join('/');
  }
  return specifier.split('/')[0];
}

function readProperty(object, key) {
  const entry = object.properties.find((item) =>
    ts.isPropertyAssignment(item) &&
    (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) &&
    item.name.text === key);
  return entry?.initializer;
}

/**
 * 仅使用静态 AST / package.json；不会 import/执行候选 Package。
 * 正确性由 Package 生成者承担，SDK runtime 不为这些条款重做校验。
 */
export function validateNativeApp(manifestPath, corePaths) {
  if (!Array.isArray(corePaths) || corePaths.length === 0) refuse('GEN_NO_CORES');
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
  const dependencies = new Set(Object.keys(manifest.dependencies ?? {}));
  const seenOrders = new Set(), seenIds = new Set();
  let kdpCount = 0;
  const report = [];
  const manualReview = [];

  for (const givenPath of corePaths) {
    const path = resolve(givenPath);
    const source = readFileSync(path, 'utf8');
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (file.parseDiagnostics.length) refuse('GEN_SYNTAX_INVALID');

    let metadata;
    const imports = new Set();
    for (const node of file.statements) {
      if (ts.isVariableStatement(node) &&
          node.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === 'packageMeta') {
            if (metadata) refuse('GEN_DUPLICATE_METADATA');
            if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) {
              refuse('GEN_NONSTATIC_METADATA');
            }
            metadata = declaration.initializer;
          }
        }
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        imports.add(node.moduleSpecifier.text);
      }
    }
    // 原生 import() 是语言能力，不能一律当作不合法的代码子集。
    // 字面量目标与静态 import 同样核对直接依赖；计算得到的目标仅标记待作者复核。
    let unresolvedImport = false;
    function inspectDynamicImport(node) {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const target = node.arguments[0];
        if (target && ts.isStringLiteralLike(target)) imports.add(target.text);
        else unresolvedImport = true;
      }
      ts.forEachChild(node, inspectDynamicImport);
    }
    ts.forEachChild(file, inspectDynamicImport);
    if (!metadata) refuse('GEN_MISSING_METADATA');

    const idNode = readProperty(metadata, 'id');
    const roleNode = readProperty(metadata, 'role');
    const orderNode = readProperty(metadata, 'order');
    if (!idNode || !ts.isStringLiteral(idNode) ||
        !roleNode || !ts.isStringLiteral(roleNode) || roleNode.text !== 'core' ||
        !orderNode || !ts.isNumericLiteral(orderNode)) refuse('GEN_NONSTATIC_CORE');
    const id = idNode.text;
    const order = Number(orderNode.text);
    if (!/^[a-z][a-z0-9-]*$/u.test(id) ||
        !Number.isSafeInteger(order) || order < 0) refuse('GEN_INVALID_ORDER_OR_ID');
    if (seenOrders.has(order)) refuse('GEN_DUPLICATE_ORDER');
    if (seenIds.has(id)) refuse('GEN_DUPLICATE_PACKAGE');
    seenOrders.add(order);
    seenIds.add(id);
    if (order === 0) kdpCount++;

    for (const specifier of imports) {
      const external = externalName(specifier);
      if (external && !dependencies.has(external)) refuse('GEN_UNDECLARED_DIRECT_DEPENDENCY');
      if (specifier.startsWith('.') &&
          !existsSync(resolve(dirname(path), specifier))) refuse('GEN_MISSING_DIRECT_IMPORT');
    }
    report.push({ id, order });
    if (unresolvedImport) manualReview.push(id);
  }
  if (kdpCount !== 1) refuse('GEN_KDP_ORDER_ZERO_MISSING');
  return {
    packages: report.sort((a, b) => a.order - b.order),
    checked: report.length,
    ...(manualReview.length > 0 ? { manualReviewPackages: manualReview } : {}),
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2);
  const index = args.indexOf('--manifest');
  const manifest = index >= 0 ? args[index + 1] : undefined;
  const cores = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--core' && args[i + 1]) cores.push(args[i + 1]);
  }
  if (!manifest) {
    console.error('GEN_USAGE: --manifest path --core path [--core path...]');
    process.exitCode = 2;
  } else {
    try {
      const result = validateNativeApp(manifest, cores);
      const partial = 'manualReviewPackages' in result;
      console.log(JSON.stringify({
        status: partial ? 'GEN_PARTIAL_REVIEW_REQUIRED' : 'GEN_VALIDATED',
        ...result,
      }));
      if (partial) process.exitCode = 3;
    } catch (error) {
      const code = error instanceof Error ? error.message : 'GEN_FAILED';
      console.error(/^GEN_[A-Z_]+$/u.test(code) ? code : 'GEN_FAILED');
      process.exitCode = 1;
    }
  }
}
