/** 作者/Agent 在生成期检查静态 ESM Package 组合；不属于 SDK 运行时。 */
import { existsSync, readFileSync, statSync } from 'node:fs';
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

function staticMetadataObject(expression) {
  let current = expression;
  // 普通 TS 的 as const / satisfies / 括号不应被误判为动态 Metadata。
  while (current && (ts.isAsExpression(current) ||
          ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current))) {
    current = current.expression;
  }
  if (!current || !ts.isObjectLiteralExpression(current)) refuse('GEN_NONSTATIC_METADATA');
  return current;
}

function staticMetadataFields(metadata) {
  const fields = new Map();
  for (const property of metadata.properties) {
    // 只限制需要执行的 Metadata；Package 的其余 TypeScript 代码保持原生能力。
    if (!ts.isPropertyAssignment(property) ||
        !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
      refuse('GEN_NONSTATIC_METADATA');
    }
    const name = property.name.text;
    if (fields.has(name)) refuse('GEN_DUPLICATE_METADATA_FIELD');
    fields.set(name, property.initializer);
  }
  return fields;
}


function isTypeOnlyEdge(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    if (clause.name) return false;
    const bindings = clause.namedBindings;
    return bindings && ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 && bindings.elements.every(item => item.isTypeOnly);
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const clause = node.exportClause;
    return clause && ts.isNamedExports(clause) &&
      clause.elements.length > 0 && clause.elements.every(item => item.isTypeOnly);
  }
  return false;
}

function fileExists(path, sourceKind) {
  const isFile = (candidate) => existsSync(candidate) && statSync(candidate).isFile();
  if (isFile(path)) return true;
  // TypeScript NodeNext 使用 .js/.mjs/.cjs specifier 指向生成后的文件。
  if (sourceKind !== ts.ScriptKind.TS) return false;
  const mappings = [
    [/\\.js$/u, ['.ts', '.tsx']],
    [/\\.mjs$/u, ['.mts']],
    [/\\.cjs$/u, ['.cts']],
  ];
  for (const [suffix, candidates] of mappings) {
    if (!suffix.test(path)) continue;
    for (const ext of candidates) {
      if (isFile(path.replace(suffix, ext))) return true;
    }
  }
  return false;
}

function modifiesMetadataTarget(target) {
  if (ts.isParenthesizedExpression(target)) return modifiesMetadataTarget(target.expression);
  if (ts.isIdentifier(target)) return target.text === 'packageMeta';
  if (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) {
    return modifiesMetadataTarget(target.expression);
  }
  return false;
}

function inspectMetadataMutation(file) {
  let mutation = false;
  let alias = false;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.initializer) &&
        node.initializer.text === 'packageMeta') alias = true;
    if (ts.isBinaryExpression(node) &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment &&
        modifiesMetadataTarget(node.left)) mutation = true;
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
        (node.operator === ts.SyntaxKind.PlusPlusToken ||
         node.operator === ts.SyntaxKind.MinusMinusToken) &&
        modifiesMetadataTarget(node.operand)) mutation = true;
    if (ts.isDeleteExpression(node) && modifiesMetadataTarget(node.expression)) mutation = true;
    if (ts.isCallExpression(node) && node.arguments.length > 0 &&
        ts.isPropertyAccessExpression(node.expression) &&
        ((ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Object' &&
          ['assign','defineProperty','defineProperties','setPrototypeOf'].includes(node.expression.name.text)) ||
         (ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'Reflect' &&
          ['set','defineProperty','deleteProperty'].includes(node.expression.name.text))) &&
        modifiesMetadataTarget(node.arguments[0])) mutation = true;
    ts.forEachChild(node, visit);
  }
  ts.forEachChild(file, visit);
  return { mutation, alias };
}

/**
 * 仅使用静态 AST / package.json；不会 import/执行候选 Package。
 * 正确性由 Package 生成者承担，SDK runtime 不为这些条款重做校验。
 */
export function validateNativeApp(manifestPath, corePaths) {
  if (!Array.isArray(corePaths) || corePaths.length === 0) refuse('GEN_NO_CORES');
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
  const dependencies = new Set(Object.keys(manifest.dependencies ?? {}));
  const typeDependencies = new Set([...dependencies, ...Object.keys(manifest.devDependencies ?? {})]);
  const seenOrders = new Set(), seenIds = new Set();
  let kdpCount = 0;
  const report = [];
  const manualReview = [];

  for (const givenPath of corePaths) {
    const path = resolve(givenPath);
    const source = readFileSync(path, 'utf8');
    const kind = /\.(?:ts|mts|cts)$/u.test(path) ? ts.ScriptKind.TS : ts.ScriptKind.JS;
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, kind);
    if (file.parseDiagnostics.length) refuse('GEN_SYNTAX_INVALID');

    let metadata;
    const imports = new Map();
    const collect = (specifier, typeOnly) => {
      imports.set(specifier, (imports.get(specifier) ?? true) && typeOnly);
    };
    for (const node of file.statements) {
      if (ts.isVariableStatement(node) &&
          node.modifiers?.some((item) => item.kind === ts.SyntaxKind.ExportKeyword)) {
        for (const declaration of node.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name) && declaration.name.text === 'packageMeta') {
            if (metadata) refuse('GEN_DUPLICATE_METADATA');
            if ((node.declarationList.flags & ts.NodeFlags.Const) === 0) {
              refuse('GEN_MUTABLE_METADATA');
            }
            metadata = staticMetadataObject(declaration.initializer);
          }
        }
      }
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
        collect(node.moduleSpecifier.text, Boolean(isTypeOnlyEdge(node)));
      }
    }
    // 原生 import() 是语言能力，不能一律当作不合法的代码子集。
    // 字面量目标与静态 import 同样核对直接依赖；计算得到的目标仅标记待作者复核。
    let unresolvedImport = false;
    function inspectDynamicImport(node) {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const target = node.arguments[0];
        if (target && ts.isStringLiteralLike(target)) collect(target.text, false);
        else unresolvedImport = true;
      }
      ts.forEachChild(node, inspectDynamicImport);
    }
    ts.forEachChild(file, inspectDynamicImport);
    if (!metadata) refuse('GEN_MISSING_METADATA');
    const changes = inspectMetadataMutation(file);
    if (changes.mutation) refuse('GEN_MUTATED_METADATA');

    const fields = staticMetadataFields(metadata);
    const idNode = fields.get('id');
    const roleNode = fields.get('role');
    const orderNode = fields.get('order');
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

    for (const [specifier, typeOnly] of imports) {
      const external = externalName(specifier);
      if (external && !(typeOnly ? typeDependencies : dependencies).has(external)) {
        refuse('GEN_UNDECLARED_DIRECT_DEPENDENCY');
      }
      if (specifier.startsWith('.') &&
          !fileExists(resolve(dirname(path), specifier), kind)) {
        refuse('GEN_MISSING_DIRECT_IMPORT');
      }
    }
    report.push({ id, order });
    if (unresolvedImport || changes.alias) manualReview.push(id);
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
