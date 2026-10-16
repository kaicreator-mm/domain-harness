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
import type { AcornNode } from './generated/acorn.mjs';
import { V09HostError, governanceRefusal } from './errors.js';
import { V09_IMPORT_POLICY_REVISION } from './digest.js';
import { assertVendoredParserBytes, VENDORED_PARSER_PIN } from './parser-pin.js';

const MAX_AST_DEPTH = 2_000;

const CODE_STRING_CONSTRUCTORS = new Set(['Function', 'GeneratorFunction', 'AsyncFunction', 'AsyncGeneratorFunction']);

function moduleGraphDenied(moduleLabel: string, reason: string): V09HostError {
  return governanceRefusal(
    'MODULE_GRAPH_DENIED',
    `package module ${moduleLabel} is refused by the v0.9 zero-import AST gate (policy ${V09_IMPORT_POLICY_REVISION}, parser acorn@${VENDORED_PARSER_PIN.version}): ${reason}`,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nodeName(node: AcornNode): string {
  const name = (node as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
}

/**
 * Full-AST zero-import check over one module's exact bytes. `moduleLabel`
 * identifies the module in refusals (packageId/moduleSha256 at H; module
 * path at BUILD). Runs the pinned-parser byte assertion first: unverified
 * parser bytes never parse anything.
 */
export function assertZeroImportEsmModule(moduleLabel: string, source: string): void {
  assertVendoredParserBytes();
  let program: { type: string; body: readonly AcornNode[] };
  try {
    program = parse(source, {
      ecmaVersion: VENDORED_PARSER_PIN.ecmaVersion,
      sourceType: VENDORED_PARSER_PIN.sourceType,
    });
  } catch (error) {
    const detail = error instanceof Error ? `${error.message} (${String((error as { loc?: { line?: number } }).loc?.line ?? '?')}:${String((error as { loc?: { column?: number } }).loc?.column ?? '?')})` : String(error);
    throw moduleGraphDenied(moduleLabel, `the module does not parse as a supported ES2022 ESM module and is therefore refused, not skipped: ${detail}`);
  }
  const visit = (node: AcornNode, depth: number): void => {
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
        const meta = (node as { meta?: AcornNode }).meta;
        if (meta !== undefined && meta.type === 'Identifier' && nodeName(meta) === 'import') {
          throw moduleGraphDenied(moduleLabel, 'import.meta access');
        }
        break;
      }
      case 'ExportNamedDeclaration': {
        const sourceSpecifier = (node as { source?: unknown }).source;
        if (sourceSpecifier !== null && sourceSpecifier !== undefined) {
          throw moduleGraphDenied(moduleLabel, "export ... from '...' re-export declaration");
        }
        break;
      }
      case 'CallExpression': {
        const callee = (node as { callee?: AcornNode }).callee;
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
        const callee = (node as { callee?: AcornNode }).callee;
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
          visit(value as AcornNode, depth + 1);
        }
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (isRecord(item) && typeof item.type === 'string') {
            visit(item as AcornNode, depth + 1);
          }
        }
      }
    }
  };
  for (const statement of program.body) {
    visit(statement, 1);
  }
}
