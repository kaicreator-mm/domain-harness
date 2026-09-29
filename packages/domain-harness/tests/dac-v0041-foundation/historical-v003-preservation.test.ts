// Issue #355 / A41-001 — executable HISTORICAL_V003_PRESERVED proof. Every
// historical `dac-v003*` source and test byte (src/dac-v003,
// src/dac-v003-compatibility, src/dac-v003-external, src/dac-v003-manifest,
// tests/dac-v003, tests/dac-v003-conformance) is pinned to its SHA-256 at
// the exact task base v0.4@c2b43b3a1ff0d88a2f7a5220e270bc5635437bf8. The
// successor foundation must not rewrite, relabel or re-order a single
// historical byte; the historical v0.0.3 lane stays version-bound and
// separately valid, and its evidence is never relabeled as v0.0.4/v0.0.4.1
// conformance.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { DAC_V003_BASELINE } from '../../src/dac-v003/index.js';
import { DAC_V0041_BASELINE } from '../../src/dac-v0041/index.js';

/** Exact base SHA the historical bytes are pinned to (Issue #355). */
export const A41_001_EXACT_BASE = 'c2b43b3a1ff0d88a2f7a5220e270bc5635437bf8' as const;

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

function toRepoRelative(path: string): string {
  return path.split(sep).join('/');
}

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(path, found);
    } else {
      found.push(path);
    }
  }
  return found;
}

// SHA-256 of every historical dac-v003* file at the exact base, in repo
// relative POSIX form. Generated once from the base tree; any successor
// change to one of these bytes must fail this pin.
const HISTORICAL_V003_FILE_DIGESTS: Readonly<Record<string, string>> = {
  'src/dac-v003-compatibility/contracts.ts': 'b393334c75ec4de385dd42558c163576618c1c5328347779769c6f039d12b340',
  'src/dac-v003-compatibility/guards.ts': '6a8e198458accb236f3d0b929fce6eb1a91d74d8f673acea27565bfb063fd989',
  'src/dac-v003-compatibility/index.ts': '17a571dd7a3dd45cbb55aa481659f0ab62aeb73e74f8f09beac7838d135a0fac',
  'src/dac-v003-compatibility/validate.ts': '1ed198db657a0bfb0386dcd8a38c978c38cfd6231ae10de3b3f52830e0abb6cf',
  'src/dac-v003-external/contracts.ts': '5a440a92f9edb5e62f719831375448399c9053fe137ff0dcfa7aec3f4c83bdff',
  'src/dac-v003-external/evaluate.ts': '60b3dff977fc7698f6e60d2d1db3183fa1ac8a064b067586b8e2d195386e3a8f',
  'src/dac-v003-external/guards.ts': 'fe23358856fed5ed7ab99210452d787659cc1c54c373ffe319458a1dc39ce3e6',
  'src/dac-v003-external/index.ts': '568791ef84208f6b537a8c5983ed3b21d91c7f5ed57ee716fdd3731710dc7c07',
  'src/dac-v003-manifest/contracts.ts': 'b5ecaeaff3cd6078458c71bb489640a19585a78ed3a1a68259e5d777711c1fca',
  'src/dac-v003-manifest/guards.ts': 'b33b8d38799b2fc5ff7b78e435e7b18bdb0319a00bde4592e72ff2d53cadb87e',
  'src/dac-v003-manifest/index.ts': 'c736d47a70e67831e99daa02385942245736fc5ab69c129843b49b701abe48ed',
  'src/dac-v003-manifest/registry.ts': 'a7d25f2df5e4354cb9d6f13b1ede9418929b0137be8d7b715685e38cd860403b',
  'src/dac-v003/contracts.ts': '5c7490c9cc8eac711ba5a64c34ed62366dfd7fbbff384a7669b0214609a350e7',
  'src/dac-v003/guards.ts': 'a5d1b4e33c35aa381b200a9a2369ea15b9d346a03caaa5eb6c7fe3052ad2b3f6',
  'src/dac-v003/index.ts': 'e0e6b881dcebdb5d9eb4b67d5a62c9994f4d3fd8e4c0705ba6ebd47d00a9b622',
  'tests/dac-v003-conformance/COVERAGE.md': '8ac25593f9fbd87cf2fd0698c50d591a0b0f65cc2b108647dfd43756bea92ded',
  'tests/dac-v003-conformance/adversarial-shortcuts.test.ts': '62d5a064e0efcbbfa8860a5f96946112f021ed423b76f3bcb8279c98c7fddaf2',
  'tests/dac-v003-conformance/c39-c44-shared-reference.test.ts': 'c4f06d32295f3b2a3be337824639ac9ea5b3c8dc81dbabb57bd88f6e19653828',
  'tests/dac-v003-conformance/c45-c52-authoring-evolution-boundary.test.ts': 'c3984faa3a6438f4cd270a6d90bad9b12b5bbd34b37942c77ac8767b2d11cef9',
  'tests/dac-v003-conformance/c53-c61-composition.test.ts': '373cc83c63260bdbd4c986865acb33a10fe32fca28d20190feb3c4b09fbe345a',
  'tests/dac-v003-conformance/c62-c70-external-operation.test.ts': 'ee6c45e8485dcf5803d27259fd70982398042e2f7cc97576cb3818115cace1b3',
  'tests/dac-v003-conformance/c71-c77-cross-lane.test.ts': '14ead984251890cf22882b78f689125749456e725a70ef64a7df6e10a300823e',
  'tests/dac-v003-conformance/c77-positive-boundary-path.test.ts': 'd3f6ab0da4cacf9988349e282666244cd0da858ad2660d05e14ab5d92e43a431',
  'tests/dac-v003-conformance/conformance-matrix.ts': '05c9099d1177a678ff4e565b07506eddf552a1af5a5281e7ba18bcfd77e48580',
  'tests/dac-v003-conformance/journey-runtime-fixture.ts': '8c0d338c1ed0a8a5e781f72b18960615aaf553d304f749d06d2afbab9cd1e2a7',
  'tests/dac-v003-conformance/matrix-closure.test.ts': 'a70dd1a3d388de144bfb85a0f95ee1932894353c1cc3fd9bb614433bac7c615b',
  'tests/dac-v003/compatibility-fixture.ts': '12eabd9a283ecda298b68b81f494336f2deb9d45043d0e1d81d7f80be8b047d8',
  'tests/dac-v003/dac-v003-compatibility-authority.test.ts': 'fe572284bffbfeae79f0205d7d5e2e7877e0ad25f247522f8a31400f35989268',
  'tests/dac-v003/dac-v003-compatibility-closure.test.ts': '00252f246a6ddbc344effc294f4f434524945ef388b8f55fef0239334176338c',
  'tests/dac-v003/dac-v003-compatibility-separation.test.ts': '6efe5decc43dcf3c4321f6c7dcd4d7f1d82a23d6ed6981ed0417091822eef51a',
  'tests/dac-v003/dac-v003-compatibility-target.test.ts': 'b071e59c8a5b39ef70b851505afed44dfae71513e848f02d4e68ff346c445303',
  'tests/dac-v003/dac-v003-compatibility-ux.test.ts': '7211c25300c2131914b2d71abfe9d0a38481da4ad4914c82be45e821c809887b',
  'tests/dac-v003/dac-v003-external-capabilities.test.ts': '8ab0be7f22c137955bd44da6ab94a51e2d849898ce4440215c2e976a20a276ea',
  'tests/dac-v003/dac-v003-external-observation.test.ts': '373739848c19c14fe35b5612965ec09d665876d6bec9386a65d6c672083e5b4c',
  'tests/dac-v003/dac-v003-external-outcomes.test.ts': 'edbb7740e667f40dcb3d208d09effa064eea48a365bfefe1bc90482c46ff9435',
  'tests/dac-v003/dac-v003-external-reconciliation.test.ts': '0e787cf5fa611ebae0620a8a7fa47d5597567c4c5a4b0312e5f5a6358dedc3a6',
  'tests/dac-v003/dac-v003-external-retry.test.ts': '706118829d21e1fdd2ddbed86db61ca90d353e34d4c5c3c971c4623d56c611ad',
  'tests/dac-v003/dac-v003-external-roles.test.ts': '4d5dfb786471927f8c1b06bad36f40686f435aca258cdea18a3cbbaabb82c2af',
  'tests/dac-v003/dac-v003-foundation.test.ts': 'd878b8245c171fea725f0c268d5c28212c562572ec30be25afd505f87dcc0124',
  'tests/dac-v003/dac-v003-manifest-adoption.test.ts': '71d64b9f03918f82efe25673c5b08feea87696f530482fda3b7a79c9e9d01915',
  'tests/dac-v003/dac-v003-manifest-association.test.ts': '406cb3f598a3dbf8a959c7276a88bc8a4ae08c9198b027c84f81c85bc81c918f',
  'tests/dac-v003/dac-v003-manifest-boundary.test.ts': 'cb2841218c3a0af8792c8c3bb56a83ce7371e9fd0e0228aa6d6b4753505d9ed7',
  'tests/dac-v003/dac-v003-manifest-closure.test.ts': '79d16b1d8eb3063de933b391b041c689d675ce8e819c41d753eb1a97e43c2980',
  'tests/dac-v003/dac-v003-profiles.test.ts': '943cb210d16d1ac6f8fbacad216fcb2b7d0bd1cd9d279934b2eb750513ac352f',
  'tests/dac-v003/dac-v003-roles.test.ts': 'a89b8a88a9892a8e14b42e96973e9c123a07ec67670e355c30ab88299976ce6f',
  'tests/dac-v003/dac-v003-separation.test.ts': '88e22ff4f2df2f80df437c0082cbc0d161e51346c939fb298e66b365e9cd6204',
  'tests/dac-v003/dac-v003-target-state.test.ts': '729f6027d868ac4828c5f8d5d9778f99852d0acfe2661f8613682b3a33539d0d',
  'tests/dac-v003/external-fixture.ts': 'eaf9792f386135e1ebd360133eb94c8f5df1dfb684df946a87bbc2509d501cab',
  'tests/dac-v003/manifest-fixture.ts': '716fc3f73db5b5a3d934b59cf6025b4dcaf2cfff083579e9d811c8d33d9b0d1f',
};

const HISTORICAL_DIRECTORIES = [
  'src/dac-v003',
  'src/dac-v003-compatibility',
  'src/dac-v003-external',
  'src/dac-v003-manifest',
  'tests/dac-v003',
  'tests/dac-v003-conformance',
] as const;

test('a41-001 preservation: every historical dac-v003* byte is unchanged from the exact base', () => {
  const found = new Map<string, string>();
  for (const directory of HISTORICAL_DIRECTORIES) {
    for (const path of walk(join(packageRoot, directory))) {
      const repoRelative = toRepoRelative(relative(packageRoot, path));
      // Hash the LF-normalized content so the pin binds the committed blob
      // bytes on any checkout line-ending configuration (this Windows build
      // host checks out CRLF; the repository blob is LF).
      const normalized = readFileSync(path, 'utf8').replace(/\r\n/gu, '\n');
      const digest = createHash('sha256').update(normalized, 'utf8').digest('hex');
      found.set(repoRelative, digest);
    }
  }
  assert.equal(
    found.size,
    Object.keys(HISTORICAL_V003_FILE_DIGESTS).length,
    'historical dac-v003* file count must exactly match the base pin (no file added, removed or renamed)',
  );
  const mismatches: string[] = [];
  for (const [path, digest] of found) {
    const expected = HISTORICAL_V003_FILE_DIGESTS[path];
    if (expected === undefined) {
      mismatches.push(`${path}: not part of the base pin`);
    } else if (expected !== digest) {
      mismatches.push(`${path}: byte drift (${digest} != ${expected})`);
    }
  }
  assert.deepEqual(mismatches, [], 'all historical dac-v003* bytes match the base pin exactly');
});

test('a41-001 preservation: the historical adapter stays version-bound and distinct from the successor pin', () => {
  // The historical v0.0.3 adapter keeps its own exact freeze identity and it
  // is NOT the successor baseline — successor adoption of a v0.0.3-baseline
  // carrier fails closed (see the baseline-pin suite), and no v0.0.3
  // evidence is relabeled as v0.0.4.1 conformance.
  assert.equal(DAC_V003_BASELINE.version, 'v0.0.3');
  assert.equal(DAC_V003_BASELINE.semanticFreezeCommit, '3322b2152253b3c60f254c23a4f9ab1a14e063d1');
  assert.notEqual(DAC_V003_BASELINE.semanticFreezeCommit, DAC_V0041_BASELINE.semanticFreezeCommit);
  assert.notEqual(DAC_V003_BASELINE.semanticFreezeTree, DAC_V0041_BASELINE.semanticFreezeTree);
});
