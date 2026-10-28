/**
 * Private, opt-in Host deployment profile. This is not a JavaScript sandbox.
 * The Host owns the approval, parser dependency and protected staging root;
 * a privileged writer of that root remains outside this assurance. The SDK
 * does not obtain a parser from BUILD, a dev dependency or untrusted App data.
 */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { chmod, lstat, mkdir, mkdtemp, open, realpath, rm, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { canonicalSnapshot, sha256Canonical } from '@kaicreator/domain-harness-contracts';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';

export interface VerifiedProviderBundlePolicy {
  readonly profile: 'VERIFIED_PROVIDER_BUNDLE_V1';
  /** Independently protected Host approval; never read from the mutable seal. */
  readonly subjectDigest: string;
  readonly packageClosureDigest: string;
  readonly provider: {
    readonly specifier: string;
    /** Exact approved file, relative to the original deployment root. */
    readonly artifactPath: string;
    readonly artifactSha256: string;
  };
  readonly allowedNodeBuiltins: readonly string[];
  /** Existing, Host-controlled directory outside attacker-writable deployment. */
  readonly stagingRoot: string;
  /** Trusted Host dependency: e.g. Acorn parse(source, { sourceType:'module' }). */
  readonly parseModule: (source: string) => unknown;
}

export interface VerifiedProviderSnapshot {
  readonly deploymentRoot: string;
  dispose(): Promise<void>;
}

type Refuse = (code: string, message: string) => never;
const HEX = /^[0-9a-f]{64}$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const UNSUPPORTED = 'VERIFIED_PROVIDER_ARTIFACT_UNSUPPORTED';
const MISMATCH = 'VERIFIED_PROVIDER_DIGEST_MISMATCH';
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const DANGEROUS_BUILTINS = new Set(['node:module', 'node:vm', 'node:child_process', 'node:worker_threads', 'node:cluster']);
const DYNAMIC_NAMES = new Set(['require', 'eval', 'Function', 'AsyncFunction', 'WebAssembly']);
const REFLECTION_NAMES = new Set(['Reflect', 'getPrototypeOf', '__proto__', 'constructor', 'getBuiltinModule', 'binding']);

function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A private immutable plain-data copy also closes caller mutation across awaits. */
export function snapshotVerifiedProviderApp(app: V10BuiltApp, refuse: Refuse): V10BuiltApp {
  try {
    return canonicalSnapshot(app) as V10BuiltApp;
  } catch {
    return refuse(UNSUPPORTED, 'verified deployment requires a plain-data sealed App');
  }
}

/** The existing BUILD canonical subject algorithm, over its sealed roster. */
function subjectOf(app: V10BuiltApp): string {
  const roster = app.modules.map((module) => ({
    packageId: module.packageId, role: module.role, abiVersion: module.abiVersion,
    moduleSha256: module.moduleSha256, endpoint: module.endpoint,
    dependencies: [...module.dependencies],
    externalImports: { node: [...module.externalImports.node], npm: [...module.externalImports.npm], native: [...module.externalImports.native] },
    provides: [...module.provides], requires: [...module.requires], optional: module.optional,
    providerId: module.providerId, hookExport: module.hookExport, featureExport: module.featureExport,
    capabilityId: module.capabilityId,
    handlers: module.handlers === null ? null : module.handlers.map((handler) => ({ ...handler })),
    externalEffect: module.externalEffect,
  }));
  return sha256Canonical({
    formatVersion: app.formatVersion, appId: app.appId, audience: app.audience,
    buildId: app.buildId, targetProfile: app.targetProfile, runtimeAbi: app.runtimeAbi,
    hostAbi: app.hostAbi, bundlerRevision: app.bundlerRevision,
    importPolicyRevision: app.importPolicyRevision, hardBudget: app.hardBudget,
    roster, loadOrder: [...app.loadOrder], skippedOptional: [...app.skippedOptional],
    routes: app.routes.map((route) => ({ ...route })),
  });
}

function inside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== '' && !isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`);
}

/** Conservative ESTree inspection, not a substitute for trusted source approval. */
function inspect(
  source: string,
  parse: (source: string) => unknown,
  allowed: ReadonlySet<string>,
  bundle: boolean,
  refuse: Refuse,
): readonly string[] {
  let tree: unknown;
  try { tree = parse(source); } catch { return refuse(UNSUPPORTED, 'the Host parser refused the verified ESM source'); }
  if (tree === null || typeof tree !== 'object' || (tree as { type?: unknown }).type !== 'Program') {
    return refuse(UNSUPPORTED, 'the Host parser did not return a supported ESTree Program');
  }
  const names = new Set<string>();
  const seen = new Set<object>();
  const pending: unknown[] = [tree];
  let count = 0;
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    if (++count > 500_000) return refuse(UNSUPPORTED, 'the verified source AST exceeds its bounded profile');
    if (Array.isArray(value)) { for (const child of value as unknown[]) pending.push(child); continue; }
    const node = value as Record<string, unknown>;
    const kind = node.type;
    const callTarget = node.callee as { type?: unknown; name?: unknown } | undefined;
    if (kind === 'ImportExpression' || kind === 'MetaProperty'
      || (bundle && kind === 'Identifier' && DYNAMIC_NAMES.has(String(node.name)))
      || ((kind === 'CallExpression' || kind === 'NewExpression') && callTarget?.type === 'Identifier'
        && DYNAMIC_NAMES.has(String(callTarget.name)))) {
      return refuse(UNSUPPORTED, 'dynamic import, require, eval and runtime code construction are unsupported');
    }
    if (bundle && kind === 'Identifier' && REFLECTION_NAMES.has(String(node.name))) {
      return refuse(UNSUPPORTED, 'reflective code loading is outside the static bundle profile');
    }
    if (bundle && kind === 'MemberExpression' && node.computed === true) {
      return refuse(UNSUPPORTED, 'computed member access is outside the conservative static bundle profile');
    }
    if (kind === 'ImportDeclaration' || kind === 'ExportNamedDeclaration' || kind === 'ExportAllDeclaration') {
      const spec = node.source as { value?: unknown } | undefined;
      if (spec != null && (typeof spec.value !== 'string' || !allowed.has(spec.value))) {
        return refuse(UNSUPPORTED, 'a verified source imports an unapproved executable dependency');
      }
      if (bundle && kind === 'ExportAllDeclaration') return refuse(UNSUPPORTED, 'wildcard re-exports are outside the single bundle profile');
      if (bundle && kind === 'ExportNamedDeclaration') {
        const declaration = node.declaration as { type?: unknown; id?: { name?: unknown }; declarations?: { id?: { name?: unknown } }[] } | null;
        if (typeof declaration?.id?.name === 'string') names.add(declaration.id.name);
        else if (declaration?.id?.name !== undefined) return refuse(UNSUPPORTED, 'non-identifier exports are unsupported');
        for (const item of declaration?.declarations ?? []) {
          if (typeof item.id?.name !== 'string') return refuse(UNSUPPORTED, 'destructured exports are outside the static bundle profile');
          names.add(item.id.name);
        }
        for (const item of (node.specifiers ?? []) as { exported?: { name?: unknown } }[]) {
          if (typeof item.exported?.name !== 'string') return refuse(UNSUPPORTED, 'non-identifier exports are unsupported');
          names.add(item.exported.name);
        }
      }
    }
    if (bundle && kind === 'ExportDefaultDeclaration') names.add('default');
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(node))) {
      if (!('value' in descriptor)) return refuse(UNSUPPORTED, 'the Host parser returned an accessor AST');
      if (descriptor.value !== null && typeof descriptor.value === 'object') pending.push(descriptor.value);
    }
  }
  if (bundle && (names.size === 0 || [...names].some((name) => !IDENTIFIER.test(name)))) {
    return refuse(UNSUPPORTED, 'the bundle has no supported bounded export surface');
  }
  return [...names].sort();
}

/** Trusted Host shim: never inspect a thrown value, including Error getters. */
function guardedExports(names: readonly string[]): string {
  return `
function failure() { const error = new Error('verified provider operation outcome is unknown'); error.name = 'VerifiedProviderOperationError'; error.code = 'VERIFIED_PROVIDER_OPERATION_UNKNOWN'; return error; }
// Host-owned boundary, not a transparent proxy over arbitrary SDK objects.
// V1 supports callable exports with plain-JSON results and plain-JSON constants.
function plain(value, seen = new Set(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || depth > 64 || seen.has(value)) throw failure();
  const proto = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && proto !== Object.prototype && proto !== null) throw failure();
  const fields = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(fields);
  if (keys.length > 10000 || Object.getOwnPropertySymbols(value).length) throw failure();
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const length = fields.length.value;
      if (!Number.isSafeInteger(length) || length > 10000) throw failure();
      const result = [];
      for (let index = 0; index < length; index++) {
        const field = fields[index];
        if (!field || !Object.hasOwn(field, 'value')) throw failure();
        result.push(plain(field.value, seen, depth + 1));
      }
      return result;
    }
    return Object.fromEntries(keys.map(key => {
      const field = fields[key];
      if (!Object.hasOwn(field, 'value')) throw failure();
      return [key, plain(field.value, seen, depth + 1)];
    }));
  } finally { seen.delete(value); }
}
function guard(value) {
  if (typeof value !== 'function') { try { return plain(value); } catch { throw failure(); } }
  return function(...args) {
    try {
      const result = Reflect.apply(value, undefined, args);
      return result instanceof Promise
        ? result.then(plain, () => { throw failure(); }).catch(() => { throw failure(); })
        : plain(result);
    } catch { throw failure(); }
  };
}
let source;
try { source = await import('./bundle.mjs'); } catch { throw failure(); }
${names.map((name, index) => `const export${index} = guard(source[${JSON.stringify(name)}]); export { export${index} as ${name} };`).join('\n')}
`;
}

/** No original provider byte is evaluated; staging is copied from the open handle. */
export async function prepareVerifiedProviderBundle(
  app: V10BuiltApp,
  policy: VerifiedProviderBundlePolicy,
  sourceRoot: string | undefined,
  closureDigest: string,
  reject: Refuse,
): Promise<VerifiedProviderSnapshot> {
  let stage: string | undefined;
  let ownDenial: unknown;
  const refuse: Refuse = (code, message) => {
    try { return reject(code, message); } catch (error) { ownDenial = error; throw error; }
  };
  try {
    if (typeof policy.parseModule !== 'function' || !HEX.test(policy.subjectDigest)
      || !HEX.test(policy.packageClosureDigest) || !HEX.test(policy.provider?.artifactSha256)) {
      return refuse('VERIFIED_PROVIDER_TRUST_ANCHOR_MISSING', 'the strict profile requires protected exact approval and a trusted Host parser');
    }
    const parser = policy.parseModule;
    const specifier = policy.provider.specifier;
    const artifactPath = policy.provider.artifactPath;
    const expectedArtifact = policy.provider.artifactSha256;
    if (policy.subjectDigest !== app.subjectDigest || policy.packageClosureDigest !== closureDigest || subjectOf(app) !== app.subjectDigest) {
      return refuse(MISMATCH, 'the App does not match the independently approved canonical subject and closure');
    }
    if (typeof sourceRoot !== 'string' || !isAbsolute(sourceRoot) || !PACKAGE.test(specifier)
      || typeof artifactPath !== 'string' || isAbsolute(artifactPath)) {
      return refuse(UNSUPPORTED, 'the profile requires one root package and an approved relative deployment artifact');
    }
    const allowedBuiltins = new Set(policy.allowedNodeBuiltins);
    for (const name of allowedBuiltins) {
      if (!name.startsWith('node:') || !builtinModules.includes(name.slice(5)) || DANGEROUS_BUILTINS.has(name)) {
        return refuse(UNSUPPORTED, 'the strict profile has an unsupported Node builtin allowance');
      }
    }
    let importsProvider = false;
    for (const module of app.modules) {
      if (sha256(module.moduleSource) !== module.moduleSha256) return refuse(MISMATCH, 'a sealed module byte hash does not match its declaration');
      if (!app.loadOrder.includes(module.packageId)) continue;
      if (module.externalImports.native.length > 0 || module.externalImports.npm.some((name) => name !== specifier)) {
        return refuse(UNSUPPORTED, 'the profile covers exactly one static npm bundle and no native sidecars');
      }
      const allowed = new Set([...module.externalImports.node, ...module.externalImports.npm]);
      if (module.externalImports.node.some((name) => !allowedBuiltins.has(name))) return refuse(UNSUPPORTED, 'a sealed module declares an unapproved builtin');
      inspect(module.moduleSource, parser, allowed, false, refuse);
      importsProvider ||= module.externalImports.npm.includes(specifier);
    }
    if (!importsProvider) return refuse(UNSUPPORTED, 'the approved provider is not part of the selected sealed import closure');
    const root = await realpath(sourceRoot);
    const artifact = resolve(root, artifactPath);
    if (!inside(root, artifact) || (await realpath(artifact)) !== artifact || !(await lstat(artifact)).isFile()) {
      return refuse(UNSUPPORTED, 'the approved artifact must be a regular file inside the deployment root without symlinks');
    }
    const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK);
    const handle = await open(artifact, flags);
    let bytes: Buffer;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES) return refuse(UNSUPPORTED, 'the approved bundle must be a bounded regular file');
      // Read from the already-open identity, with a hard allocation/read cap
      // even if an untrusted deployment writer grows the file concurrently.
      const buffer = Buffer.alloc(MAX_SOURCE_BYTES + 1);
      let length = 0;
      while (length < buffer.length) {
        const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
        if (bytesRead === 0) break;
        length += bytesRead;
      }
      bytes = buffer.subarray(0, length);
    } finally { await handle.close(); }
    if (bytes.length > MAX_SOURCE_BYTES || sha256(bytes) !== expectedArtifact) return refuse(MISMATCH, 'the actual provider bytes do not match protected Host approval');
    const source = bytes.toString('utf8');
    if (!Buffer.from(source, 'utf8').equals(bytes)) return refuse(UNSUPPORTED, 'the bundle must be valid UTF-8 ESM');
    const exports = inspect(source, parser, allowedBuiltins, true, refuse);
    const stageRoot = resolve(policy.stagingRoot);
    if (!isAbsolute(policy.stagingRoot) || (await realpath(stageRoot)) !== stageRoot
      || !(await lstat(stageRoot)).isDirectory() || stageRoot === root || inside(root, stageRoot)) {
      return refuse(UNSUPPORTED, 'staging must be an existing protected Host directory outside the mutable deployment');
    }
    stage = await mkdtemp(join(stageRoot, 'verified-provider-'));
    const packageRoot = join(stage, 'node_modules', ...specifier.split('/'));
    await mkdir(packageRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(stage, 'package.json'), '{"private":true,"type":"module"}\n', { flag: 'wx', mode: 0o400 });
    await writeFile(join(packageRoot, 'package.json'), '{"type":"module","exports":"./guarded.mjs"}\n', { flag: 'wx', mode: 0o400 });
    await writeFile(join(packageRoot, 'bundle.mjs'), bytes, { flag: 'wx', mode: 0o400 });
    await writeFile(join(packageRoot, 'guarded.mjs'), guardedExports(exports), { flag: 'wx', mode: 0o400 });
    // New private stage contains no original mutable package.json/sidecar; the
    // existing Microkernel's deploymentRoot resolves only this verified copy.
    await chmod(packageRoot, 0o500);
    const snapshotRoot = stage;
    return Object.freeze({ deploymentRoot: snapshotRoot, async dispose() {
      await chmod(packageRoot, 0o700);
      for (const file of ['package.json', 'bundle.mjs', 'guarded.mjs']) await chmod(join(packageRoot, file), 0o600);
      await rm(snapshotRoot, { recursive: true, force: true });
    } });
  } catch (error) {
    if (stage !== undefined) await rm(stage, { recursive: true, force: true });
    // Preserve only our own fixed typed denials, never inspect thrown getters.
    if (error === ownDenial) throw error;
    return refuse(UNSUPPORTED, 'the Host could not establish an immutable verified provider snapshot');
  }
}
