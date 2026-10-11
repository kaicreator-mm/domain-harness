/**
 * TypeScript-AST module closure analysis for v0.8 BUILD qualification
 * (T-A, #1000).
 *
 * Issue #1000 mandates an AST-based closure check — a regex-only import
 * filter is not acceptable because comment-obfuscated dynamic imports such
 * as `import/*x*\/('...')` must still be detected. This module walks the
 * real TypeScript syntax tree of every sealed module and refuses:
 *   - any dynamic `import()` call expression (IMPORT_NOT_STATIC),
 *   - any `require()` call expression (IMPORT_NOT_STATIC),
 *   - any relative static import that is not part of the declared sealed
 *     module set (IMPORT_UNRESOLVED) — sealed qualified packages are
 *     self-contained; transitive code outside the sealed bytes cannot
 *     become executable,
 *   - any relative specifier escaping the module root (IMPORT_ESCAPE).
 */
import { posix } from 'node:path';
import ts from 'typescript';
export class ClosureError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ClosureError';
        this.code = code;
    }
}
function isRelative(specifier) {
    return specifier.startsWith('./') || specifier.startsWith('../');
}
function normalizeModuleSpecifier(fromPath, specifier) {
    const joined = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
    return joined.replace(/^\.\//, '');
}
function parseModule(path, moduleSource) {
    const sourceFile = ts.createSourceFile(path, moduleSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    return { path, sourceFile };
}
/**
 * Analyze the transitive static-import closure of `entryPath` over the
 * declared sealed `moduleSources`. Every violation throws typed before any
 * qualification is granted.
 */
export function analyzeModuleClosure(input) {
    const entry = input.moduleSources.get(input.entryPath);
    if (entry === undefined) {
        throw new ClosureError('IMPORT_UNRESOLVED', `entry module ${input.entryPath} is not part of the declared sealed module set`);
    }
    const staticImports = [];
    const visited = new Set();
    const queue = [parseModule(input.entryPath, entry)];
    while (queue.length > 0) {
        const node = queue.shift();
        if (visited.has(node.path))
            continue;
        visited.add(node.path);
        for (const statement of node.sourceFile.statements) {
            // Static import declaration: import ... from '<specifier>'
            if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
                const specifier = statement.moduleSpecifier.text;
                recordStaticImport(node.path, specifier);
                continue;
            }
            // Re-export declaration: export ... from '<specifier>'
            if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined && ts.isStringLiteral(statement.moduleSpecifier)) {
                const specifier = statement.moduleSpecifier.text;
                recordStaticImport(node.path, specifier);
                continue;
            }
            // Dynamic import() / require() anywhere in the statement is a typed
            // violation — the AST scanner is not a text filter, so obfuscation
            // inside comments or expressions cannot hide it.
            scanForDynamicImports(node.path, statement);
        }
    }
    function recordStaticImport(fromPath, specifier) {
        if (!isRelative(specifier)) {
            // Bare specifiers (node:*, npm packages) never resolve inside a sealed
            // self-contained qualified package.
            throw new ClosureError('IMPORT_UNRESOLVED', `module ${fromPath} statically imports non-sealed bare specifier '${specifier}'; a qualified package module set must be self-contained`);
        }
        const resolved = normalizeModuleSpecifier(fromPath, specifier);
        if (resolved.startsWith('..') || resolved === '..') {
            throw new ClosureError('IMPORT_ESCAPE', `module ${fromPath} imports '${specifier}' which escapes the sealed module root`);
        }
        const target = input.moduleSources.get(resolved);
        if (target === undefined) {
            throw new ClosureError('IMPORT_UNRESOLVED', `module ${fromPath} statically imports '${specifier}' (resolves to ${resolved}) which is not part of the declared sealed module set`);
        }
        staticImports.push({ from: fromPath, to: resolved });
        if (!visited.has(resolved)) {
            queue.push(parseModule(resolved, target));
        }
    }
    function scanForDynamicImports(fromPath, statement) {
        const visit = (node) => {
            if (ts.isCallExpression(node)
                && (node.expression.kind === ts.SyntaxKind.ImportKeyword
                    || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
                throw new ClosureError('IMPORT_NOT_STATIC', `module ${fromPath} contains a dynamic import()/require() expression (line ${node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1}); sealed qualified packages admit static imports only`);
            }
            ts.forEachChild(node, visit);
        };
        visit(statement);
    }
    return Object.freeze({
        entryPath: input.entryPath,
        closurePaths: Object.freeze([...visited].sort()),
        staticImports: Object.freeze(staticImports),
    });
}
/**
 * AST-based check that a module really exports the required ABI members as
 * declared exports (namespaced runtime verification happens later at the
 * trusted installer; this is the BUILD-time byte/source identity check).
 */
export function assertDeclaredExports(modulePath, moduleSource, requiredExports) {
    const sourceFile = ts.createSourceFile(modulePath, moduleSource, ts.ScriptTarget.ES2022, true, ts.ScriptKind.JS);
    const declared = new Set();
    for (const statement of sourceFile.statements) {
        if (ts.isExportDeclaration(statement) && statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)) {
            for (const element of statement.exportClause.elements) {
                const name = element.propertyName !== undefined ? element.propertyName.text : element.name.text;
                declared.add(name);
            }
            continue;
        }
        const modifiers = statement.modifiers;
        if (modifiers === undefined || !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
            continue;
        if (ts.isVariableStatement(statement)) {
            for (const declaration of statement.declarationList.declarations) {
                if (ts.isIdentifier(declaration.name))
                    declared.add(declaration.name.text);
            }
            continue;
        }
        if (ts.isFunctionDeclaration(statement)
            || ts.isClassDeclaration(statement)
            || ts.isInterfaceDeclaration(statement)
            || ts.isTypeAliasDeclaration(statement)
            || ts.isEnumDeclaration(statement)) {
            if (statement.name !== undefined)
                declared.add(statement.name.text);
        }
    }
    for (const required of requiredExports) {
        if (!declared.has(required)) {
            throw new ClosureError('QUALIFY_EXPORT_MISSING', `module ${modulePath} does not declare required ABI export ${required} (AST-verified, not a text match)`);
        }
    }
}
