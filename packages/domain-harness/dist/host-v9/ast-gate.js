/**
 * DomainHarness v0.9 N06 (#1032) — protected H zero-import ESM AST gate
 * (frozen L2 §11 D01, H-side repeat).
 * ======================================================================
 *
 * Independently of whatever BUILD already sealed, the protected H re-runs
 * the SAME bounded import-closure check on the exact stored bytes — full
 * AST parse with the pinned vendored parser (never a regex, never a
 * caller-provided parser) — before ANY module evaluation. The package ESM
 * import allowlist is EMPTY for the first cohort; refused, with no
 * exception:
 *
 *   - static `import` declarations (`ImportDeclaration`),
 *   - `export ... from` / `export * from` (`ExportNamedDeclaration` with a
 *     source, `ExportAllDeclaration`),
 *   - dynamic `import()` literal OR computed (`ImportExpression`),
 *   - `import.meta` (`MetaProperty` with the `import` meta — `new.target`
 *     is left alone),
 *   - CommonJS `require(...)` calls,
 *   - locally invoked code-string evaluation: `eval(...)`,
 *     `new Function(...)`, direct `Function(...)` calls and the analogous
 *     `GeneratorFunction` / `AsyncFunction` / `AsyncGeneratorFunction`
 *     constructors.
 *
 * Unparseable or unsupported syntax (anything beyond ecmaVersion 2022
 * module grammar, hostile hashbang included) refuses typed — fail closed.
 * The walk carries a depth bound so pathologically deep trees refuse
 * instead of overflowing the stack.
 */
import { parse } from './generated/acorn.mjs';
import { V09HostError, governanceRefusal } from './errors.js';
import { V09_IMPORT_POLICY_REVISION } from './digest.js';
import { assertVendoredParserBytes, VENDORED_PARSER_PIN } from './parser-pin.js';
const MAX_AST_DEPTH = 2_000;
const CODE_STRING_CONSTRUCTORS = new Set(['Function', 'GeneratorFunction', 'AsyncFunction', 'AsyncGeneratorFunction']);
function moduleGraphDenied(moduleLabel, reason) {
    return governanceRefusal('MODULE_GRAPH_DENIED', `package module ${moduleLabel} is refused by the v0.9 zero-import AST gate (policy ${V09_IMPORT_POLICY_REVISION}, parser acorn@${VENDORED_PARSER_PIN.version}): ${reason}`);
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
 * identifies the module in refusals (packageId/moduleSha256 at H; module
 * path at BUILD). Runs the pinned-parser byte assertion first: unverified
 * parser bytes never parse anything.
 */
export function assertZeroImportEsmModule(moduleLabel, source) {
    assertVendoredParserBytes();
    let program;
    try {
        program = parse(source, {
            ecmaVersion: VENDORED_PARSER_PIN.ecmaVersion,
            sourceType: VENDORED_PARSER_PIN.sourceType,
        });
    }
    catch (error) {
        const detail = error instanceof Error ? `${error.message} (${String(error.loc?.line ?? '?')}:${String(error.loc?.column ?? '?')})` : String(error);
        throw moduleGraphDenied(moduleLabel, `the module does not parse as a supported ES2022 ESM module and is therefore refused, not skipped: ${detail}`);
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
//# sourceMappingURL=ast-gate.js.map