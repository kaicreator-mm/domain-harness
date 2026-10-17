/**
 * DomainHarness v0.9 N06 (#1032) — BUILD zero-import ESM AST gate
 * (frozen L2 §11 D01, BUILD side).
 * ================================================================
 *
 * Full AST parse of every sealed package module with the pinned vendored
 * parser (never a regex, never a caller-provided parser), refusing the
 * EMPTY-allowlist violations:
 * static `import`, `export ... from` / `export * from`, dynamic `import()`
 * (literal or computed), `import.meta`, CommonJS `require(...)`, and
 * code-string evaluation via `eval` / `Function` / the analogous generator
 * and async constructors. Unparseable or unsupported syntax refuses typed.
 *
 * This is the same bounded policy the protected H re-runs on the stored
 * bytes before any evaluation (`host-v9/ast-gate.ts`); the two sides are
 * held byte-identical at the parser level by the vendored pin.
 */
import { parse } from './generated/acorn.mjs';
import { V09BuildError } from './errors.js';
import { assertVendoredParserBytes, V09_BUILD_PARSER_PIN } from './parser.js';
const MAX_AST_DEPTH = 2_000;
const CODE_STRING_CONSTRUCTORS = new Set(['Function', 'GeneratorFunction', 'AsyncFunction', 'AsyncGeneratorFunction']);
function moduleGraphDenied(moduleLabel, reason) {
    return new V09BuildError('MODULE_GRAPH_DENIED', `sealed module ${moduleLabel} is refused by the v0.9 zero-import AST gate (parser acorn@${V09_BUILD_PARSER_PIN.version}): ${reason}`);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function nodeName(node) {
    const name = node.name;
    return typeof name === 'string' ? name : '';
}
/**
 * Full-AST zero-import check over one module's exact bytes. `moduleLabel`
 * identifies the module (its sealed packageId/modulePath) in refusals.
 */
export function assertZeroImportBuildModule(moduleLabel, source) {
    assertVendoredParserBytes();
    let program;
    try {
        program = parse(source, {
            ecmaVersion: V09_BUILD_PARSER_PIN.ecmaVersion,
            sourceType: V09_BUILD_PARSER_PIN.sourceType,
        });
    }
    catch (error) {
        const loc = error.loc;
        const at = loc ? `${String(loc.line ?? '?')}:${String(loc.column ?? '?')}` : '?';
        const detail = error instanceof Error ? error.message : String(error);
        throw moduleGraphDenied(moduleLabel, `the module does not parse as a supported ES2022 ESM module and is therefore refused, not skipped (${at}): ${detail}`);
    }
    const visit = (node, depth) => {
        if (depth > MAX_AST_DEPTH) {
            throw moduleGraphDenied(moduleLabel, `AST depth exceeds the bounded walk limit (${String(MAX_AST_DEPTH)})`);
        }
        switch (node.type) {
            case 'ImportDeclaration': {
                throw moduleGraphDenied(moduleLabel, 'static import declaration (the package import allowlist is EMPTY)');
            }
            case 'ExportAllDeclaration': {
                throw moduleGraphDenied(moduleLabel, "export * from '...' declaration");
            }
            case 'ImportExpression': {
                throw moduleGraphDenied(moduleLabel, 'dynamic import() expression (literal or computed)');
            }
            case 'MetaProperty': {
                const meta = node.meta;
                if (meta !== undefined && meta.type === 'Identifier' && nodeName(meta) === 'import') {
                    throw moduleGraphDenied(moduleLabel, 'import.meta access');
                }
                break;
            }
            case 'ExportNamedDeclaration': {
                const sourceSpecifier = node.source;
                if (sourceSpecifier !== null && sourceSpecifier !== undefined) {
                    throw moduleGraphDenied(moduleLabel, "export ... from '...' re-export declaration");
                }
                break;
            }
            case 'CallExpression': {
                const callee = node.callee;
                if (callee !== undefined && callee.type === 'Identifier') {
                    const name = nodeName(callee);
                    if (name === 'require') {
                        throw moduleGraphDenied(moduleLabel, 'CommonJS require() call');
                    }
                    if (name === 'eval') {
                        throw moduleGraphDenied(moduleLabel, 'eval() code-string evaluation');
                    }
                    if (CODE_STRING_CONSTRUCTORS.has(name)) {
                        throw moduleGraphDenied(moduleLabel, `${name}(...) code-string constructor invocation`);
                    }
                }
                break;
            }
            case 'NewExpression': {
                const callee = node.callee;
                if (callee !== undefined && callee.type === 'Identifier' && CODE_STRING_CONSTRUCTORS.has(nodeName(callee))) {
                    throw moduleGraphDenied(moduleLabel, `new ${nodeName(callee)}(...) code-string constructor`);
                }
                break;
            }
            default:
                break;
        }
        for (const key of Object.keys(node)) {
            if (key === 'type' || key === 'start' || key === 'end') {
                continue;
            }
            const value = node[key];
            if (isRecord(value)) {
                if (typeof value.type === 'string') {
                    visit(value, depth + 1);
                }
                continue;
            }
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (isRecord(item) && typeof item.type === 'string') {
                        visit(item, depth + 1);
                    }
                }
            }
        }
    };
    for (const statement of program.body) {
        visit(statement, 1);
    }
}
