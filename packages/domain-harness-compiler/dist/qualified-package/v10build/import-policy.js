/**
 * DomainHarness v0.10 T00 (#1166) — sealed ordinary-import closure gate.
 * =====================================================================
 *
 * The v0.10 successor of the v0.9 zero-import BUILD gate
 * (`v09build/import-closure.ts`, which stays frozen for v0.9). Under the
 * accepted Product A01 the v0.10 BUILD no longer refuses imports outright:
 * ordinary Node ESM imports — `node:*` builtins, npm dependencies and
 * installed native add-ons — are allowed implementation details, sealed
 * per module in the composition's `externalImports` allowance
 * (A01-PC05: "Normal Node ESM imports, Node built-in modules, npm
 * dependencies and installed native add-ons are allowed implementation
 * details; no per-Package zero-import ESM obligation").
 *
 * What still refuses, deterministically, at BUILD (one pinned-parser pass,
 * zero evaluation):
 *
 *  - any module edge whose specifier is NOT declared in that module's
 *    sealed allowance (`node:*`, bare npm/native specifiers alike) —
 *    undeclared ordinary imports are a BUILD failure. Declared literal
 *    edges are sealed, but static analysis is not a complete JS sandbox;
 *  - computed (non-literal) dynamic `import()` — a non-deterministic edge
 *    is a discovery edge, and BUILD enables no unselected discovery;
 *  - direct/indirect references to `require`, `eval` and `Function`-family
 *    constructors, plus explicit `.constructor` access — code-string
 *    evaluation and CommonJS discovery are not ordinary module imports;
 *    this bounded AST hygiene does NOT prove that all dynamic aliases,
 *    computed properties, or global capabilities are unreachable;
 *  - relative/absolute file edges and `data:` edges — the sealed-bytes
 *    composition wires modules through the SDK connect step, not through
 *    filesystem edges inside sealed bytes (packed-app file layout belongs
 *    to deployment/T11);
 *  - a specifier naming another selected packageId — cross-package wiring
 *    is the activation connect step, never an import statement.
 *
 * `import.meta` access is ordinary ESM and is NOT a module-graph edge; it
 * is allowed. The gate reasons only about module edges and code strings,
 * never about business semantics — a sealed ordinary import grants module
 * mechanics, not Effect authority (A01 §4).
 *
 * The parser is the same vendored pinned acorn as the v0.9 BUILD gate
 * (byte pin asserted before any parse, fail closed), so the two gates
 * share one parser identity while their POLICIES differ per version.
 */
import { isBuiltin } from 'node:module';
import { isObjectRecord } from './guards.js';
import { parse } from '../v09build/generated/acorn.mjs';
import { assertVendoredParserBytes, V09_BUILD_PARSER_PIN } from '../v09build/parser.js';
import { V10BuildError } from './errors.js';
const MAX_AST_DEPTH = 2_000;
const CODE_STRING_CONSTRUCTORS = new Set(['Function', 'GeneratorFunction', 'AsyncFunction', 'AsyncGeneratorFunction']);
const CODE_STRING_GLOBALS = new Set([...CODE_STRING_CONSTRUCTORS, 'eval', 'require']);
/**
 * Evaluator spellings refused as explicit property/KEY names. `require` is
 * deliberately absent: sealed ESM bytes have no reachable CommonJS global
 * (the CommonJS seam stays covered by the bare-identifier checks below),
 * while ordinary method names — including the vendored kernel's own
 * instance-registry `require(address)` — must stay sealable.
 */
const EVALUATOR_PROPERTY_NAMES = new Set([...CODE_STRING_CONSTRUCTORS, 'eval', 'constructor']);
/**
 * Non-computed object/class keys and `obj.prop` property names are spellings
 * the module DEFINES or selects, not references to global evaluators; their
 * specific dangers have dedicated checks (forbiddenMemberName, ObjectPattern
 * destructuring). Computed keys stay walked as ordinary expressions.
 */
function isDefinitionKeyName(container, key) {
    if (container.type === 'MemberExpression') {
        return key === 'property' && !container.computed;
    }
    if (key !== 'key')
        return false;
    if (container.type === 'Property' || container.type === 'MethodDefinition' || container.type === 'PropertyDefinition') {
        return !container.computed;
    }
    return false;
}
/**
 * This is static hygiene, NOT a sandbox: trusted closed-world code can still
 * compute a property name or obtain an evaluator through arbitrary aliases.
 * These explicit spellings must not bypass the BUILD diagnostic, however.
 */
function forbiddenMemberName(node) {
    if (node.type !== 'MemberExpression')
        return null;
    const member = node;
    const property = member.property;
    if (property === undefined)
        return null;
    const name = member.computed ? specifierOf(property) : property.type === 'Identifier' ? nodeName(property) : null;
    return name !== null && EVALUATOR_PROPERTY_NAMES.has(name) ? name : null;
}
export function emptyExternalImports() {
    return Object.freeze({ node: Object.freeze([]), npm: Object.freeze([]), native: Object.freeze([]) });
}
function denied(moduleLabel, reason) {
    return new V10BuildError('V10_IMPORT_POLICY_DENIED', `sealed module ${moduleLabel} is refused by the v0.10 import-closure gate (parser acorn@${V09_BUILD_PARSER_PIN.version}): ${reason}`);
}
function nodeName(node) {
    const name = node.name;
    return typeof name === 'string' ? name : '';
}
function specifierOf(literal) {
    return typeof literal === 'object' && literal !== null && literal.type === 'Literal'
        && typeof literal.value === 'string'
        ? literal.value
        : null;
}
/**
 * One-pass static collection of the module's import edges and forbidden
 * constructs. Pure analysis: the source is never evaluated.
 */
export function collectModuleEdges(moduleLabel, source) {
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
        throw denied(moduleLabel, `the module does not parse as a supported ES2022 ESM module and is therefore refused, not skipped (${at}): ${detail}`);
    }
    const edges = [];
    const visit = (node, depth) => {
        if (depth > MAX_AST_DEPTH) {
            throw denied(moduleLabel, `AST depth exceeds the bounded walk limit (${String(MAX_AST_DEPTH)})`);
        }
        const forbiddenMember = forbiddenMemberName(node);
        if (forbiddenMember !== null) {
            throw denied(moduleLabel, `member access to '${forbiddenMember}' can alias code-string evaluation or CommonJS discovery`);
        }
        switch (node.type) {
            case 'Identifier': {
                const name = nodeName(node);
                if (CODE_STRING_GLOBALS.has(name)) {
                    throw denied(moduleLabel, `reference to '${name}' can alias code-string evaluation or CommonJS discovery`);
                }
                break;
            }
            case 'ObjectPattern': {
                // Destructuring is property access by another spelling: pulling an
                // evaluator-named key off any object aliases code-string evaluation.
                for (const property of node.properties ?? []) {
                    if (property.type !== 'Property' || property.computed)
                        continue;
                    const key = property.key;
                    const name = key !== undefined && key.type === 'Identifier' ? nodeName(key) : null;
                    if (name !== null && EVALUATOR_PROPERTY_NAMES.has(name)) {
                        throw denied(moduleLabel, `destructuring '${name}' can alias code-string evaluation`);
                    }
                }
                break;
            }
            case 'ImportDeclaration': {
                edges.push({ kind: 'static-import', specifier: specifierOf(node.source) });
                if (specifierOf(node.source) === null) {
                    throw denied(moduleLabel, 'static import carries a non-literal module specifier');
                }
                break;
            }
            case 'ExportAllDeclaration': {
                edges.push({ kind: 'export-from', specifier: specifierOf(node.source) });
                if (specifierOf(node.source) === null) {
                    throw denied(moduleLabel, "export * from '...' carries a non-literal module specifier");
                }
                break;
            }
            case 'ExportNamedDeclaration': {
                const source = node.source;
                if (source !== null && source !== undefined) {
                    edges.push({ kind: 'export-from', specifier: specifierOf(source) });
                    if (specifierOf(source) === null) {
                        throw denied(moduleLabel, "export ... from '...' carries a non-literal module specifier");
                    }
                }
                break;
            }
            case 'ImportExpression': {
                const specifier = specifierOf(node.source ?? node.argument);
                if (specifier === null) {
                    throw denied(moduleLabel, 'computed (non-literal) dynamic import() — a non-deterministic module edge is a discovery edge and cannot be sealed');
                }
                edges.push({ kind: 'dynamic-import', specifier });
                break;
            }
            case 'CallExpression': {
                const callee = node.callee;
                if (callee !== undefined && callee.type === 'Identifier') {
                    const name = nodeName(callee);
                    if (name === 'require') {
                        throw denied(moduleLabel, 'CommonJS require() call');
                    }
                    if (name === 'eval') {
                        throw denied(moduleLabel, 'eval() code-string evaluation');
                    }
                    if (CODE_STRING_CONSTRUCTORS.has(name)) {
                        throw denied(moduleLabel, `${name}(...) code-string constructor invocation`);
                    }
                }
                break;
            }
            case 'NewExpression': {
                const callee = node.callee;
                if (callee !== undefined && callee.type === 'Identifier' && CODE_STRING_CONSTRUCTORS.has(nodeName(callee))) {
                    throw denied(moduleLabel, `new ${nodeName(callee)}(...) code-string constructor`);
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
            if (isDefinitionKeyName(node, key)) {
                continue;
            }
            const value = node[key];
            if (isObjectRecord(value)) {
                if (typeof value.type === 'string') {
                    visit(value, depth + 1);
                }
                continue;
            }
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (isObjectRecord(item) && typeof item.type === 'string') {
                        visit(item, depth + 1);
                    }
                }
            }
        }
    };
    for (const statement of program.body) {
        visit(statement, 1);
    }
    return edges;
}
function classify(specifier, moduleLabel) {
    if (specifier.startsWith('node:'))
        return 'node';
    // Node also resolves bare builtins (e.g. 'fs' and 'fs/promises'). Do not
    // misclassify these as npm/native entries even if the caller lists them.
    if (isBuiltin(specifier)) {
        throw denied(moduleLabel, `bare Node builtin '${specifier}' must use its explicit 'node:' specifier and node allowance`);
    }
    if (specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('data:') || specifier.startsWith('file:')) {
        throw denied(moduleLabel, `import edge '${specifier}' is a file/data edge; sealed module bytes wire through the SDK connect step, not filesystem edges (packed file layout belongs to deployment)`);
    }
    return 'npm-or-native';
}
/**
 * Verify that every module edge of `source` is sealed by `allowance`
 * (and that no edge targets a selected sibling packageId). Static,
 * deterministic, zero evaluation.
 */
export function assertSealedImportClosure(moduleLabel, source, allowance, selectedPackageIds) {
    const edges = collectModuleEdges(moduleLabel, source);
    const nodeAllowed = new Set(allowance.node);
    const bareAllowed = new Set([...allowance.npm, ...allowance.native]);
    for (const edge of edges) {
        const specifier = edge.specifier;
        if (selectedPackageIds.has(specifier)) {
            throw denied(moduleLabel, `import edge '${specifier}' names a selected package; cross-package wiring is the SDK connect step, never an import statement`);
        }
        const kind = classify(specifier, moduleLabel);
        if (kind === 'node') {
            if (!nodeAllowed.has(specifier)) {
                throw denied(moduleLabel, `node builtin import '${specifier}' is not declared in this module's sealed externalImports allowance`);
            }
            continue;
        }
        if (!bareAllowed.has(specifier)) {
            throw denied(moduleLabel, `ordinary import '${specifier}' is not declared in this module's sealed externalImports allowance (npm/native)`);
        }
    }
}
