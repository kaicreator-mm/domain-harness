/** BUILD 封存 Order-0 KDP 的静态 ESM 依赖闭包；执行前由可信 Boot 独立验字节。 */
import { posix } from 'node:path';
import * as ts from 'typescript';
import {
  isRelativeResourcePath,
  type ResourceRef,
  type TrustedKdpModule,
} from '@kaicreator/domain-harness-contracts';
import { ResourceScope, digestOfBytes } from './resources.js';
import { refusal } from './refusal.js';

const NODE_BUILTINS = new Set(['node:buffer', 'node:crypto', 'node:path', 'node:url', 'node:util']);
const TRUSTED_SDK = '@kaicreator/domain-harness-microkernel';
const MAX_MODULES = 256;
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * 只支持可穷举的 Node22 静态 ESM；bare SDK 依赖仍属已安装的可信 SDK TCB，
 * 不代表本阶段完成其归档 SRI/安装证明（见 Foundation #1668）。
 */
export function sealKdpModuleClosure(
  scope: ResourceScope,
  entry: { readonly packageId: string; readonly path: string },
): readonly TrustedKdpModule[] {
  const visited = new Map<string, TrustedKdpModule>();
  let bytesRead = 0;

  const visit = (path: string): ResourceRef => {
    if (!isRelativeResourcePath(path) || !/\.(?:js|mjs)$/u.test(path)) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
        `KDP ESM path '${path}' is not a resolved in-package JavaScript module`);
    }
    const previous = visited.get(path);
    if (previous) return previous.module;
    if (visited.size >= MAX_MODULES) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', 'KDP static ESM graph exceeds 256 modules');
    }
    const bytes = scope.read(entry.packageId, path);
    bytesRead += bytes.byteLength;
    if (bytesRead > MAX_BYTES) {
      throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', 'KDP static ESM graph exceeds 4 MiB');
    }
    const ref: ResourceRef = { packageId: entry.packageId, path, digest: digestOfBytes(bytes) };
    scope.record(ref.packageId, ref.path, ref.digest);
    // 先登记再递归：合法静态 ESM 环不可导致 BUILD 无限递归。
    const mutable: { module: ResourceRef; dependencies: ResourceRef[]; trustedImports: string[] } = {
      module: ref, dependencies: [], trustedImports: [],
    };
    visited.set(path, mutable);
    const source = ts.createSourceFile(path,
      new TextDecoder('utf-8', { fatal: true }).decode(bytes), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const errors = (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
    if (errors.length) {
      throw refusal('DH_BUILD_SCHEMA_INVALID', `KDP ESM '${path}' has a syntax error TS${errors[0]!.code}`);
    }
    const specifiers = new Set<string>();
    for (const statement of source.statements) {
      if (ts.isImportEqualsDeclaration(statement)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `KDP '${path}' uses CommonJS import alias`);
      }
      if (ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement)) {
        const spec = statement.moduleSpecifier;
        if (spec !== undefined) {
          if (!ts.isStringLiteral(spec)) {
            throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED', `KDP '${path}' has nonliteral static import`);
          }
          specifiers.add(spec.text);
        }
      }
    }
    const rejectDynamic = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `KDP '${path}' uses deferred import(), including literal import`);
        }
      }
      if (ts.isIdentifier(node) && ['require', 'createRequire', 'eval', 'Function'].includes(node.text)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `KDP '${path}' uses non-provable executable loader '${node.text}'`);
      }
      if (ts.isPropertyAccessExpression(node) &&
          ['require', 'createRequire', 'getBuiltinModule', 'resolve'].includes(node.name.text)) {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `KDP '${path}' uses non-provable module resolution '${node.name.text}'`);
      }
      ts.forEachChild(node, rejectDynamic);
    };
    rejectDynamic(source);

    for (const specifier of [...specifiers].sort()) {
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const resolved = posix.normalize(posix.join(posix.dirname(path), specifier));
        if (!isRelativeResourcePath(resolved) || !/\.(?:js|mjs)$/u.test(resolved)) {
          throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
            `KDP ESM '${path}' imports escaping/ambiguous '${specifier}'`);
        }
        mutable.dependencies.push(visit(resolved));
      } else if (NODE_BUILTINS.has(specifier) || specifier === TRUSTED_SDK) {
        mutable.trustedImports.push(specifier);
      } else {
        throw refusal('DH_BUILD_DEPENDS_ON_UNSELECTED',
          `KDP ESM '${path}' imports unpinned package or builtin '${specifier}'`);
      }
    }
    mutable.dependencies.sort((a, b) => a.path.localeCompare(b.path));
    mutable.trustedImports.sort();
    return ref;
  };
  visit(entry.path);
  return [...visited.values()].sort((a, b) => a.module.path.localeCompare(b.module.path));
}
