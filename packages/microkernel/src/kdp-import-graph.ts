/** 可信 Boot 的独立 Node22 KDP Host ESM 词法闭包校验。
 * 与 BUILD 使用的 TypeScript AST 不共享解析器；此处只接受更窄、可证明的 JS 子集。
 * 拒绝模板/正则/division/Unicode identifier 等复杂词法形式，而不是猜测导入关系。
 */
import { posix } from 'node:path';
import { isRelativeResourcePath } from '@kaicreator/domain-harness-contracts';

type Token = { readonly kind: 'word' | 'string' | 'punct'; readonly value: string; readonly escaped?: boolean };
export interface VerifiedHostImports {
  readonly dependencies: readonly string[];
  readonly trustedImports: readonly string[];
}

const NODE_BUILTINS = new Set(['node:buffer', 'node:crypto', 'node:path', 'node:url', 'node:util']);
export const TRUSTED_KDP_SDK = '@kaicreator/domain-harness-microkernel';
const DISALLOWED = new Set([
  'require', 'createRequire', 'eval', 'Function', 'globalThis', 'global',
  'process', 'Reflect', 'Worker', 'WebAssembly',
]);

function lexicalTokens(source: string): readonly Token[] {
  const tokens: Token[] = [];
  let index = 0;
  if (source.charCodeAt(0) === 0xfeff) index++;
  while (index < source.length) {
    const ch = source[index]!;
    const next = source[index + 1];
    if (/\s/u.test(ch)) { index++; continue; }
    if (ch === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index++;
      continue;
    }
    if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) throw new Error('KDP ESM contains unterminated block comment');
      index = end + 2;
      continue;
    }
    // 禁止无法以有限词法证明的正则表达式、除法和模板插值。
    // 生产 KDP Host 入口应是微型静态 ESM 薄层，不运行不透明代码。
    if (ch === '/' || ch === '`' || ch === '\\') {
      throw new Error('KDP ESM uses an unprovable lexical construct');
    }
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let raw = '';
      let escaped = false;
      index++;
      let ended = false;
      while (index < source.length) {
        const current = source[index++]!;
        if (current === '\\') {
          escaped = true;
          if (index >= source.length) break;
          index++;
          continue;
        }
        if (current === quote) { ended = true; break; }
        if (current === '\n' || current === '\r') break;
        raw += current;
      }
      if (!ended) throw new Error('KDP ESM contains unterminated string literal');
      tokens.push({ kind: 'string', value: raw, escaped });
      continue;
    }
    if (/[A-Za-z_$]/u.test(ch)) {
      let end = index + 1;
      while (end < source.length && /[A-Za-z0-9_$]/u.test(source[end]!)) end++;
      tokens.push({ kind: 'word', value: source.slice(index, end) });
      index = end;
      continue;
    }
    if (/[0-9]/u.test(ch)) {
      let end = index + 1;
      while (end < source.length && /[0-9._]/u.test(source[end]!)) end++;
      tokens.push({ kind: 'word', value: source.slice(index, end) });
      index = end;
      continue;
    }
    if (!'(){}[];,.=:+-*?!&|<>%^~#'.includes(ch)) {
      throw new Error('KDP ESM contains unrecognized source token');
    }
    tokens.push({ kind: 'punct', value: ch });
    index++;
  }
  return tokens;
}

/** 只识别真实 top-level 静态 import/export-from 的字面量 specifier。
 * 所有 import()、不可证明的加载器及不完整语法都 fail-closed。
 */
export function inspectKdpHostImports(bytes: Uint8Array, filePath: string): VerifiedHostImports {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const tokens = lexicalTokens(source);
  const dependencies = new Set<string>();
  const trustedImports = new Set<string>();

  const record = (token: Token | undefined): void => {
    if (!token || token.kind !== 'string' || token.escaped) {
      throw new Error('KDP ESM import specifier is not a plain quoted literal');
    }
    const specifier = token.value;
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const resolved = posix.normalize(posix.join(posix.dirname(filePath), specifier));
      if (!isRelativeResourcePath(resolved) || !/\.(?:mjs|js)$/u.test(resolved)) {
        throw new Error('KDP ESM import resolves outside the approved relative JS subset');
      }
      dependencies.add(resolved);
    } else if (NODE_BUILTINS.has(specifier) || specifier === TRUSTED_KDP_SDK) {
      trustedImports.add(specifier);
    } else {
      throw new Error('KDP ESM imports an unapproved bare package or builtin');
    }
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.kind !== 'word') continue;
    if (DISALLOWED.has(token.value)) {
      throw new Error('KDP ESM references an unprovable loader');
    }
    if (token.value === 'import') {
      // import.meta 是运行时 meta 属性，不是加载边。
      if (tokens[i - 1]?.value === '.') continue;
      if (tokens[i + 1]?.value === '.') {
        if (tokens[i + 2]?.value !== 'meta') throw new Error('KDP ESM has malformed import.meta');
        i += 2;
        continue;
      }
      if (tokens[i + 1]?.value === '(') throw new Error('KDP ESM contains deferred import()');
      if (tokens[i + 1]?.kind === 'string') {
        record(tokens[++i]);
        if (tokens[i + 1]?.value === 'with' || tokens[i + 1]?.value === 'assert') {
          throw new Error('KDP ESM import attributes are outside the static profile');
        }
        continue;
      }
      // import {name} from 'target' 或 import name from 'target'；
      // from 必须处于导入声明花括号之外。
      let depth = 0;
      let found = false;
      for (let j = i + 1; j < tokens.length; j++) {
        const value = tokens[j]!.value;
        if (value === '{') depth++;
        if (value === '}') depth--;
        if (depth < 0 || value === ';' || (value === 'export' && depth === 0)) break;
        if (value === 'from' && depth === 0) {
          record(tokens[j + 1]);
          i = j + 1;
          found = true;
          break;
        }
      }
      if (!found) throw new Error('KDP ESM import has no provable from specifier');
      continue;
    }
    if (token.value === 'export') {
      if (tokens[i + 1]?.value !== '*' && tokens[i + 1]?.value !== '{') continue;
      // 导出星号、命名空间及花括号重导出：都必须封存其 from 依赖目标。
      const opening = tokens[i + 1]?.value === '{';
      let depth = 0;
      let seenClose = !opening;
      for (let j = i + 1; j < tokens.length; j++) {
        const value = tokens[j]!.value;
        if (value === '{') depth++;
        if (value === '}') { depth--; if (depth === 0) seenClose = true; }
        if (value === ';') break;
        if (seenClose && depth === 0 && value === 'from') {
          record(tokens[j + 1]);
          i = j + 1;
          break;
        }
        if (opening && seenClose && depth === 0 && value !== '}') break;
      }
    }
  }

  return {
    dependencies: [...dependencies].sort(),
    trustedImports: [...trustedImports].sort(),
  };
}
