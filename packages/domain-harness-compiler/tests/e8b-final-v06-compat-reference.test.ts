/**
 * E8b executable reference — final-v0.6 compatibility evidence: Semantic
 * Decision public/package/currentness, packed public compatibility,
 * historical identity profile and one-runtime/effect authority
 * (issue #873; authority #589@5980540397 PACK-E E8b + #719 readiness terminal
 * + #873 WEB_REFERENCE_FIXTURE_FREEZE; predecessors T000-SD PR#843 accepted,
 * T000 currentness #528@6024748740, T008E #726@6032592242 NO_DELTA_REQUIRED,
 * E8a #877 accepted as supporting legacy evidence).
 *
 * ENVIRONMENT=LOCAL_AGENT (ZCode kimi-executor, kimi-for-coding).
 * REAL_HOST_POSTURE=REAL_SUPPORTED_NODE_HOST_FOR_NPM_PACK_CLEAN_CONSUMER
 * (Node v24.21.0; packed core+compiler tarballs installed into a fresh
 * mkdtemp-isolated consumer — no workspace links, no source imports).
 * SOURCE_MUTATION=NONE (tests-only write set: this single bounded file).
 *
 * Matrix rows under test:
 *  - packed-public-compat: the `/v2` Semantic Decision contract, the compiled
 *    artifact profile constants and the compiler root remain usable from the
 *    packed candidate tarballs (tsc skipLibCheck:false + runtime evaluation);
 *  - semantic-decision: the packed compiler compiles a final-v0.6-compatible
 *    package carrying a valid Semantic Decision declaration; the compiled
 *    manifest carries the exact semanticDecisionContractVersion +
 *    semanticDecisions material + the semantic-decision@1 capability; the
 *    public descriptor validation seam (semanticDecisionManifestIssues) fails
 *    closed on malformed declarations before any activation consumer could
 *    use them; the compiler fails closed on mutation-tool query capabilities
 *    and on targets that do not declare the semantic capability;
 *  - historical-identity-profile: the frozen final-v0.6 owner files
 *    (semantic-decision.ts / message-identity.ts / process-command.ts /
 *    compiled-artifact-profile.ts at FINAL_V06_BASELINE=7c367188) are
 *    byte-identical to the candidate worktree files (git-object identity,
 *    non-retroactive); the packed `/v2` profile semantics remain exactly
 *    LEGACY=0.2/2/2 and successor scaffold 0.3/2/3, and a retroactively
 *    reinterpreted profile (0.2/2/3) is NOT supported;
 *  - one-runtime-effect-authority: the compiled Semantic Decision descriptor
 *    is pure data (recursive walk: no functions, no handles, no executable
 *    material anywhere); caller-constructed assembly/JSON is rejected by the
 *    public activation anti-forgery brand gate (ASSEMBLY_NOT_SEALED) before
 *    any durable bind, so compat/SD material can never mint runtime authority
 *    or bypass the sealed-Assembly + Central Admission seam.
 *
 * OBSERVED_LIMIT (#873 does not publish the canonical-JSON grammar behind
 * MANIFEST_CANONICAL_JSON_SHA256): the freeze is bound here by manifest
 * id/version/verbatim field values, matching the accepted E8a convention.
 * OBSERVED_BOUND: the full-package activation gate (recomputed stale-digest
 * rejection, activation-time capability presence, package reference closure)
 * is a core-internal seam not re-exported by the packed public barrels; it is
 * covered by the candidate's own committed core suite
 * (packages/domain-harness/tests/package/semantic-decision-manifest.test.ts,
 * executed as part of this gate's verification run — see the E8b terminal),
 * not reimplemented inside the clean consumer.
 *
 * Fixture identity: E8B_FINAL_V06_COMPAT_V1 (#873 freeze,
 * MANIFEST_SHA256=10354b6d51962938ed5e9ca56960f9335bbd0a0598665f669a0f4d31bd7b84c4).
 *
 * #953 (Controller 090): the packed candidate tarballs now come from the
 * shared immutable stage (tests/packed-fixture-stage.ts) instead of an
 * in-test `npm run build -w @kaicreator/domain-harness` + live-dist
 * `npm pack` — the parallel test files used to rewrite the shared dist while
 * packing it (Woodpecker 1083/1: npm pack unexpected EOF). Every vector below
 * still installs the packed tarballs into its own fresh clean consumer and
 * keeps every reference assertion.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { stagePackedWorkspaces } from './packed-fixture-stage.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(PACKAGE_ROOT, '../..');
const FINAL_V06_BASELINE = '7c367188d5c8cffa41bc22cd5269672a665c436f';

// Frozen final-v0.6 T000 owner files whose immutable identity E8b re-binds.
const BASELINE_OWNER_FILES = [
  'packages/domain-harness/src/v2/contracts/semantic-decision.ts',
  'packages/domain-harness/src/v2/contracts/message-identity.ts',
  'packages/domain-harness/src/v2/contracts/compiled-artifact-profile.ts',
  'packages/domain-harness/src/runtime/process-command.ts',
] as const;

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
  });
}

function runNpm(args: readonly string[], cwd: string): string {
  if (process.platform !== 'win32') {
    return run('npm', args, cwd);
  }
  // Windows resolves npm to npm.cmd and Node refuses to spawn batch files
  // without a shell (same accepted pattern as tests/public-consumer.test.ts).
  const command = ['npm.cmd', ...args.map((arg) => `"${arg}"`)].join(' ');
  return execFileSync(command, {
    cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  } as Parameters<typeof execFileSync>[1]) as string;
}

function runGit(args: readonly string[]): string {
  return run('git', args, REPO_ROOT);
}

function gitBlobSha256(revisionPath: string): string {
  return createHash('sha256').update(runGit(['show', revisionPath]), 'utf8').digest('hex');
}

interface ConsumerFixture {
  readonly consumerDirectory: string;
  readonly coreTarballSha256: string;
  readonly compilerTarballSha256: string;
}

let consumerPromise: Promise<ConsumerFixture> | undefined;

/**
 * Install the staged candidate core+compiler tarballs ONCE per run into a
 * fresh clean consumer, recording the tarball SHA256 identities BEFORE any
 * behavioral vector consumes them (#873 DERIVED_ARTIFACT_RULE). The tarballs
 * are the immutable per-process stage from packed-fixture-stage.ts — no
 * live workspace dist is written or packed here.
 */
function consumerFixture(): Promise<ConsumerFixture> {
  if (consumerPromise !== undefined) return consumerPromise;
  consumerPromise = (async (): Promise<ConsumerFixture> => {
    const staged = await stagePackedWorkspaces();
    const consumerDirectory = mkdtempSync(join(tmpdir(), 'domain-harness-e8b-consumer-'));
    try {
      writeFileSync(join(consumerDirectory, 'package.json'), JSON.stringify({
        name: 'domain-harness-e8b-clean-consumer',
        private: true,
        type: 'module',
      }, null, 2));

      runNpm(
        ['install', '--ignore-scripts', '--no-audit', '--no-fund', '@types/node@^22.0.0', staged.coreTarball.path, staged.compilerTarball.path],
        consumerDirectory,
      );

      console.log('E8B_PACKED_ARTIFACTS', JSON.stringify({
        coreTarball: staged.coreTarball.fileName,
        coreTarballSha256: staged.coreTarball.sha256,
        compilerTarball: staged.compilerTarball.fileName,
        compilerTarballSha256: staged.compilerTarball.sha256,
        subjectHead: runGit(['rev-parse', 'HEAD']).trim(),
      }));

      return {
        consumerDirectory,
        coreTarballSha256: staged.coreTarball.sha256,
        compilerTarballSha256: staged.compilerTarball.sha256,
      };
    } catch (error) {
      rmSync(consumerDirectory, { recursive: true, force: true });
      throw error;
    }
  })();
  return consumerPromise;
}

function writeConsumerTsconfig(consumerDirectory: string): void {
  writeFileSync(join(consumerDirectory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      noEmit: true,
      skipLibCheck: false,
      lib: ['ES2022'],
    },
    include: ['index.ts'],
  }, null, 2));
}

function typecheckConsumer(consumerDirectory: string): void {
  const tsc = join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc');
  run(process.execPath, [tsc, '--project', 'tsconfig.json'], consumerDirectory);
}

/** Write the multi-step runtime evidence script into the consumer and run it. */
function runConsumerScript(consumerDirectory: string, scriptName: string, source: string): string {
  writeFileSync(join(consumerDirectory, scriptName), source);
  return run(process.execPath, [join(consumerDirectory, scriptName)], consumerDirectory);
}

/** Authoring material for one final-v0.6-compatible raw package with one SD. */
const RAW_WORKFLOW_YAML = [
  'initial: calculate',
  'states:',
  '  calculate:',
  '    invoke:',
  '      expr: "$.value * 2"',
  '    on:',
  '      done:',
  '        target: completed',
  '      error:',
  '        target: failed',
  '  completed:',
  '    final: true',
  '  failed:',
  '    final: true',
  '',
].join('\n');

const E8B_RESULT_SCHEMA = JSON.stringify({
  type: 'object',
  required: ['outcome'],
  additionalProperties: false,
  properties: { outcome: { enum: ['approve', 'reject'] } },
});

function e8bDecisionYaml(queryCapabilities: string): string {
  return [
    'decisionId: quote.approval',
    'inputSelection: "$.claim"',
    'resultSchema: schemas/quote-approval.result.json',
    'allowedOutcomes: [approve, reject]',
    'allowedEventTypes: [QuoteApproved, QuoteRejected]',
    `queryCapabilities: ${queryCapabilities}`,
    'policy:',
    '  maxSteps: 8',
    'unavailable: { kind: declared-event, eventType: QuoteRejected, outcome: reject }',
    '',
  ].join('\n');
}

function writeRawPackage(
  consumerDirectory: string,
  name: string,
  options: { readonly queryCapabilities?: string; readonly includeDecision?: boolean } = {},
): string {
  const root = join(consumerDirectory, name);
  mkdirSync(join(root, 'workflows'), { recursive: true });
  writeFileSync(
    join(root, 'harness.yaml'),
    'schemaVersion: "0.1"\nid: e8b-final-v06-compat\nlimits:\n  maxSteps: 16\n',
  );
  writeFileSync(join(root, 'workflows', 'basic.yaml'), RAW_WORKFLOW_YAML);
  if (options.includeDecision !== false) {
    mkdirSync(join(root, 'decisions'), { recursive: true });
    mkdirSync(join(root, 'schemas'), { recursive: true });
    writeFileSync(
      join(root, 'decisions', 'quote-approval.yaml'),
      e8bDecisionYaml(options.queryCapabilities ?? '[claims.lookup]'),
    );
    writeFileSync(join(root, 'schemas', 'quote-approval.result.json'), E8B_RESULT_SCHEMA);
  }
  return root;
}

test('E8b packed-public-compat: the /v2 Semantic Decision + profile surface and the compiler root typecheck and run from the packed candidate tarballs', async () => {
  const fxConsumer = await consumerFixture();
  const { consumerDirectory } = fxConsumer;
  try {
    writeFileSync(join(consumerDirectory, 'index.ts'), `// E8b clean-consumer fixture: the frozen final-v0.6 Semantic Decision public
// contract and compiled-artifact profile commitments, plus the compiler root
// build API, proven against the packed dist by tsc (skipLibCheck: false).
import {
  LEGACY_COMPILED_ARTIFACT_PROFILE,
  SEMANTIC_DECISION_CAPABILITY,
  SEMANTIC_DECISION_CONTRACT_VERSION_V1,
  SUCCESSOR_COMPILED_ARTIFACT_PROFILE,
  compiledArtifactProfileKey,
  isSupportedCompiledArtifactProfile,
  semanticDecisionManifestIssues,
  type CompiledPackageManifest,
  type CompiledSemanticDecisionDescriptor,
  type SemanticDecisionContractVersion,
} from '@kaicreator/domain-harness/v2';
import {
  COMPILER_PUBLIC_API_VERSION,
  compileDomainPackage,
  compileSemanticDecisions,
  DOMAIN_HARNESS_COMPILER_PACKAGE,
  loadRawDomainPackage,
  SemanticDecisionCompileError,
  type TargetHostProfile,
} from '@kaicreator/domain-harness-compiler';

const contractVersion: SemanticDecisionContractVersion = SEMANTIC_DECISION_CONTRACT_VERSION_V1;
const descriptor: CompiledSemanticDecisionDescriptor | undefined = undefined;
const manifest: CompiledPackageManifest | undefined = undefined;
const profile = LEGACY_COMPILED_ARTIFACT_PROFILE;

void SEMANTIC_DECISION_CAPABILITY;
void contractVersion;
void descriptor;
void manifest;
void profile;
void SUCCESSOR_COMPILED_ARTIFACT_PROFILE;
void compiledArtifactProfileKey;
void isSupportedCompiledArtifactProfile;
void semanticDecisionManifestIssues;
void COMPILER_PUBLIC_API_VERSION;
void compileDomainPackage;
void compileSemanticDecisions;
void DOMAIN_HARNESS_COMPILER_PACKAGE;
void loadRawDomainPackage;
void SemanticDecisionCompileError;
const targetProfile: TargetHostProfile | undefined = undefined;
void targetProfile;
`);
    writeConsumerTsconfig(consumerDirectory);
    typecheckConsumer(consumerDirectory);

    // The packed dist runtime inventory is exercised by direct evaluation.
    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
const v2 = await import('@kaicreator/domain-harness/v2');
if (v2.SEMANTIC_DECISION_CAPABILITY !== 'semantic-decision@1') throw new Error('SD capability commitment changed');
if (v2.SEMANTIC_DECISION_CONTRACT_VERSION_V1 !== 'semantic-declaration.v1') throw new Error('SD contract version changed');
if (JSON.stringify(v2.LEGACY_COMPILED_ARTIFACT_PROFILE) !== '{"formatVersion":"0.2","runtimeContractMajor":2,"executionEngineMajor":2}') throw new Error('legacy compiled-artifact profile changed');
if (JSON.stringify(v2.SUCCESSOR_COMPILED_ARTIFACT_PROFILE) !== '{"formatVersion":"0.3","runtimeContractMajor":2,"executionEngineMajor":3}') throw new Error('successor compiled-artifact profile changed');
if (typeof v2.semanticDecisionManifestIssues !== 'function') throw new Error('public SD descriptor validation seam missing');
const compiler = await import('@kaicreator/domain-harness-compiler');
if (typeof compiler.compileDomainPackage !== 'function') throw new Error('packed compiler build API missing');
if (typeof compiler.loadRawDomainPackage !== 'function') throw new Error('packed compiler raw loader missing');
if (typeof compiler.compileSemanticDecisions !== 'function') throw new Error('packed compiler SD compile API missing');
`,
      ],
      consumerDirectory,
    );
  } finally {
    rmSync(fxConsumer.consumerDirectory, { recursive: true, force: true });
    consumerPromise = undefined;
  }
}, { timeout: 600000 });

test('E8b semantic-decision: the packed compiler compiles a final-v0.6-compatible SD-bearing package; manifest carries the exact contract identity; malformed/mutation-capability material fails closed', async () => {
  const fxConsumer = await consumerFixture();
  const { consumerDirectory } = fxConsumer;
  try {
    const validRoot = writeRawPackage(consumerDirectory, 'raw-valid');
    const mutationRoot = writeRawPackage(consumerDirectory, 'raw-mutation-query', {
      queryCapabilities: '[claims.mutate]',
    });

    const output = runConsumerScript(consumerDirectory, 'e8b-sd-vector.mjs', `
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const v2 = await import('@kaicreator/domain-harness/v2');
const compiler = await import('@kaicreator/domain-harness-compiler');

const BINDING_CONTENTS = {
  '@host/hash': 'export default function hash(data) { return digest(data); }\\n',
  '@host/module': 'export default function loadModule(ref) { return import(ref); }\\n',
  '@host/expression': 'export default function evaluate(expression, input) { return jsonata(expression).evaluate(input); }\\n',
  '@host/semantic-decision': 'export default function semanticDecisionAdapter() { return boundedHarness; }\\n',
};

function target(withSemantic) {
  const capabilities = ['crypto-hash-sha256@1', 'compiled-package-module@1', 'expression-jsonata@1'];
  const bindings = { 'crypto-hash-sha256@1': '@host/hash', 'compiled-package-module@1': '@host/module', 'expression-jsonata@1': '@host/expression' };
  if (withSemantic) { capabilities.push('semantic-decision@1'); bindings['semantic-decision@1'] = '@host/semantic-decision'; }
  return {
    id: 'e8b-consumer-target@1',
    capabilities,
    bindings,
    packageDataBounds: {
      maxDomainDataEntries: 16,
      maxDomainDataEntryCanonicalBytes: 2048,
      maxTotalDomainDataCanonicalBytes: 8192,
      maxBusinessSources: 8,
      maxSchemaCanonicalBytes: 4096,
    },
  };
}

async function compile(root, { withSemantic = true, tools = [] } = {}) {
  const loaded = await compiler.loadRawDomainPackage({ root });
  return compiler.compileDomainPackage({
    raw: loaded,
    domainVersion: '1.0.0-e8b',
    target: target(withSemantic),
    bindingContents: BINDING_CONTENTS,
    tools,
  }).manifest;
}

const READONLY_TOOL = {
  toolId: 'claims.lookup',
  outputSchema: { type: 'object', additionalProperties: true },
  effect: 'none',
  executionKind: 'runtime-read',
};
const MUTATION_TOOL = {
  toolId: 'claims.mutate',
  outputSchema: { type: 'object', additionalProperties: true },
  effect: 'idempotent',
  executionKind: 'runtime-mutate',
};

// Positive: a valid SD-bearing final-v0.6-compatible package compiles, and
// the manifest carries the exact frozen contract identity.
const manifest = await compile(${JSON.stringify(validRoot)}, { tools: [READONLY_TOOL] });
if (manifest.semanticDecisionContractVersion !== 'semantic-declaration.v1') throw new Error('manifest contract version mismatch: ' + manifest.semanticDecisionContractVersion);
if (!Array.isArray(manifest.semanticDecisions) || manifest.semanticDecisions.length !== 1) throw new Error('manifest semanticDecisions missing');
if (!manifest.requiredCapabilities.includes('semantic-decision@1')) throw new Error('semantic-decision@1 capability not required by manifest');
if (manifest.domainId !== 'e8b-final-v06-compat') throw new Error('historical domain identity not preserved: ' + manifest.domainId);
if (manifest.domainVersion !== '1.0.0-e8b') throw new Error('package version identity not preserved');
const descriptor = manifest.semanticDecisions[0];
if (descriptor.decisionId !== 'quote.approval') throw new Error('decision identity mismatch');
if (!/^[0-9a-f]{64}$/.test(descriptor.declarationDigest)) throw new Error('declarationDigest is not a lowercase sha256 hex digest');
const issues = v2.semanticDecisionManifestIssues(manifest.semanticDecisions);
if (issues.length !== 0) throw new Error('valid descriptor flagged: ' + JSON.stringify(issues));

// The compiled descriptor is pure data: recursive walk finds no executable
// material anywhere (no handles, no functions, no runtime authority).
(function walk(value, path) {
  if (typeof value === 'function') throw new Error('executable material at ' + path);
  if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) walk(entry, path + '.' + key);
  }
})(descriptor, 'descriptor');

// Negative (descriptor seam): malformed declarations fail closed publicly.
const malformed = JSON.parse(JSON.stringify(descriptor));
delete malformed.declarationDigest;
const malformedIssues = v2.semanticDecisionManifestIssues([malformed]);
if (malformedIssues.length === 0) throw new Error('malformed descriptor (missing digest) passed the public seam');
const unknownKey = JSON.parse(JSON.stringify(descriptor));
unknownKey.providerModel = 'gpt-x';
const unknownKeyIssues = v2.semanticDecisionManifestIssues([unknownKey]);
if (unknownKeyIssues.length === 0) throw new Error('descriptor with unknown authority key passed the public seam');
const badPolicy = JSON.parse(JSON.stringify(descriptor));
badPolicy.policy = { maxSteps: 0 };
const badPolicyIssues = v2.semanticDecisionManifestIssues([badPolicy]);
if (badPolicyIssues.length === 0) throw new Error('descriptor with zero-maxSteps policy passed the public seam');

// Negative (compile seam): a mutation Tool is never allowed to semantic
// reasoning, even when named as a query capability.
let mutationRejected = false;
try {
  await compile(${JSON.stringify(mutationRoot)}, { tools: [MUTATION_TOOL] });
} catch (error) {
  mutationRejected = error instanceof compiler.SemanticDecisionCompileError;
}
if (!mutationRejected) throw new Error('mutation tool as query capability compiled');

// Negative (compile seam): a target that does not declare the semantic
// capability fails closed instead of silently ignoring the declaration.
let capabilityRejected = false;
try {
  await compile(${JSON.stringify(validRoot)}, { withSemantic: false, tools: [READONLY_TOOL] });
} catch (error) {
  capabilityRejected = /capabilit/i.test(String(error?.message ?? error));
}
if (!capabilityRejected) throw new Error('SD package compiled for a non-semantic target');

console.log('E8B_SD_VECTOR', JSON.stringify({
  contractVersion: manifest.semanticDecisionContractVersion,
  decisionId: descriptor.decisionId,
  declarationDigest: descriptor.declarationDigest,
  requiredCapabilities: manifest.requiredCapabilities,
  domainId: manifest.domainId,
  profileKey: v2.compiledArtifactProfileKey(manifest),
}));
`);
    const marker = output.split('\n').find((line) => line.startsWith('E8B_SD_VECTOR'));
    assert.ok(marker, 'consumer script did not emit E8B_SD_VECTOR');
    console.log(marker);
  } finally {
    rmSync(fxConsumer.consumerDirectory, { recursive: true, force: true });
    consumerPromise = undefined;
  }
}, { timeout: 600000 });

test('E8b historical-identity-profile: baseline owner bytes are immutable (git-object identity) and the packed profile semantics remain exact/non-retroactive', async () => {
  // Byte identity between the frozen final-v0.6 baseline and the candidate:
  // each T000 owner file's git object at FINAL_V06_BASELINE must be the exact
  // object the candidate worktree hashes to — history is not rewritten under
  // v0.7 identity rules. (git-object identity is compared rather than raw
  // worktree bytes so platform line-ending normalization cannot masquerade
  // as a semantic drift; the recorded SHA256 is over the blob bytes.)
  const identityRows = BASELINE_OWNER_FILES.map((path) => {
    const baselineBlob = runGit(['rev-parse', `${FINAL_V06_BASELINE}:${path}`]).trim();
    const candidateBlob = runGit(['hash-object', path]).trim();
    return { path, baselineBlob, candidateBlob, baselineSha256: gitBlobSha256(`${FINAL_V06_BASELINE}:${path}`) };
  });
  for (const row of identityRows) {
    assert.equal(
      row.candidateBlob,
      row.baselineBlob,
      `${row.path}: candidate git object diverged from the frozen final-v0.6 baseline`,
    );
  }
  console.log('E8B_BASELINE_IDENTITY', JSON.stringify({
    baseline: FINAL_V06_BASELINE,
    files: identityRows.map(({ path, baselineBlob, baselineSha256 }) => ({
      path, gitBlob: baselineBlob, sha256: baselineSha256,
    })),
  }));

  // Packed /v2 profile semantics: LEGACY=0.2/2/2 and successor scaffold
  // 0.3/2/3 remain exact; a retroactively reinterpreted profile is refused.
  const fxConsumer = await consumerFixture();
  const { consumerDirectory } = fxConsumer;
  try {
    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
const v2 = await import('@kaicreator/domain-harness/v2');
if (v2.compiledArtifactProfileKey(v2.LEGACY_COMPILED_ARTIFACT_PROFILE) !== '0.2/2/2') throw new Error('legacy profile key changed');
if (v2.compiledArtifactProfileKey(v2.SUCCESSOR_COMPILED_ARTIFACT_PROFILE) !== '0.3/2/3') throw new Error('successor profile key changed');
if (!v2.isSupportedCompiledArtifactProfile(v2.LEGACY_COMPILED_ARTIFACT_PROFILE)) throw new Error('legacy profile no longer supported');
if (!v2.isSupportedCompiledArtifactProfile(v2.SUCCESSOR_COMPILED_ARTIFACT_PROFILE)) throw new Error('successor profile no longer supported');
if (v2.isSupportedCompiledArtifactProfile({ formatVersion: '0.2', runtimeContractMajor: 2, executionEngineMajor: 3 })) throw new Error('retroactively reinterpreted profile 0.2/2/3 accepted');
if (v2.isSupportedCompiledArtifactProfile({ formatVersion: '0.4', runtimeContractMajor: 2, executionEngineMajor: 3 })) throw new Error('unknown profile accepted');
`,
      ],
      consumerDirectory,
    );
  } finally {
    rmSync(fxConsumer.consumerDirectory, { recursive: true, force: true });
    consumerPromise = undefined;
  }
}, { timeout: 600000 });

test('E8b one-runtime-effect-authority: caller-constructed assembly JSON is rejected by the public activation brand gate before any durable bind', async () => {
  const fxConsumer = await consumerFixture();
  const { consumerDirectory } = fxConsumer;
  try {
    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
const { AssemblyExecutionActivator, GovernanceExecutionBindingError } = await import('@kaicreator/domain-harness');
const { createHash } = await import('node:crypto');
const sha256 = { async digestUtf8(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); } };

// Public anti-forgery gate (reachable from the packed root): inert
// dependencies are sufficient because the rejection is synchronous in
// PHASE 1, before any store/pin interaction — compat/SD JSON can never
// mint runtime authority or bypass the sealed-Assembly + admission seam.
const activator = new AssemblyExecutionActivator({}, {}, {}, sha256);
const binding = {
  domainId: 'e8b-final-v06-compat',
  packageId: 'pkg-e8b',
  domainIntelligenceContentDigest: 'cdi-e8b',
  governanceBaseline: {
    domainId: 'e8b-final-v06-compat',
    governanceId: 'governance-e8b',
    schemaVersion: '1',
    contentDigest: 'baseline-e8b',
  },
};
const request = {
  workflowTarget: 'workflow.e8b',
  workflowInstanceId: 'e8b.instance.bypass',
  binding,
  assembly: { components: [], forged: true },
  authorityClass: 'PRODUCTION',
  currentDefinitionGraph: { components: [] },
};
let rejected = null;
try {
  await activator.activate(request);
} catch (error) {
  rejected = error;
}
if (!(rejected instanceof GovernanceExecutionBindingError)) throw new Error('activation gate did not reject caller-constructed assembly: ' + String(rejected));
if (rejected.code !== 'ASSEMBLY_NOT_SEALED') throw new Error('unexpected rejection code: ' + rejected.code);
console.log('E8B_AUTHORITY_GATE', JSON.stringify({ code: rejected.code }));
`,
      ],
      consumerDirectory,
    );
  } finally {
    rmSync(fxConsumer.consumerDirectory, { recursive: true, force: true });
    consumerPromise = undefined;
  }
}, { timeout: 600000 });
