/**
 * T016 — release-qualification record companion contract-assertion test (gate #943).
 *
 * ROLE: bind the governance/divergence claims of
 * `packages/domain-harness/tests/t016/t016-divergence-audit.md` and
 * `t016-rq-record.md` to landed reality so drift goes red:
 *   - a carried v0.6 freeze doc disappears -> red;
 *   - the v0.7 successor governance record loses the candidate binding, the
 *     frozen tree, or any of the four quadruple-proven pack digests -> red;
 *   - README currentness stops naming v0.7 -> red;
 *   - the RQ record stops covering any #733 dimension, or silently drops the
 *     P0/P1-zero posture -> red.
 *
 * Tests-only by construction; everything asserted here lives outside every
 * workspace package `files` list, so packed bytes are unaffected.
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(HERE, '..', '..');
const REPO_ROOT = join(PACKAGE_ROOT, '..', '..');

const GOVERNANCE = readFileSync(join(REPO_ROOT, '.dev-standard', 'PROJECT_OVERRIDES.md'), 'utf8');
const README = readFileSync(join(REPO_ROOT, 'README.md'), 'utf8');
const AUDIT = readFileSync(join(HERE, 't016-divergence-audit.md'), 'utf8');
const RQ = readFileSync(join(HERE, 't016-rq-record.md'), 'utf8');

const CANDIDATE_SHA = '86110c616b8cb18c730553e4cdab7ef555214521';
const CANDIDATE_TREE = 'dd4e4596d02be7012468a475db8f6fcc6c756542';

const PACK_DIGESTS = [
  'f9400728bc99f8516c2f7f69db55cf8589d29e79127a77a36c2fb44f08a2d332',
  '549262618bc3bc7961f325271d7cd000bc2a6fea9e337d2f1e3fd1222ad83c78',
  '3a254c6288736553afe2a7294172cb41a9aa4563e9345995613bdb816a030480',
  'd4c6ef8ae7b9d19b447e3b859607e464814c338553327136e53a9dd72c40bde1',
];

// packedTarballSetSha256 — the RQ record owns the set-level digest (the 823797bd
// governance convention cites the per-artifact digests only).
const PACK_SET_DIGEST = '0b5772fc7aaf57373759bf9c11b3f9294d60fbfcb22aa56c991fa7924fd3d98e';

const V06_FREEZE_DOCS = [
  'docs/product/DomainHarness_v0.6_PRD_REVIEW_CANDIDATE.md',
  'docs/product/DomainHarness_v0.6_PRODUCT_FREEZE.md',
  'docs/architecture/DomainHarness_v0.6_L2_ARCHITECTURE_EVIDENCE_REVIEW_CANDIDATE.md',
  'docs/architecture/DomainHarness_v0.6_L2_ARCHITECTURE_EVIDENCE_COMPLETENESS_ADDENDUM.md',
  'docs/architecture/DomainHarness_v0.6_L2_FREEZE.md',
  'docs/implementation/DomainHarness_v0.6_TASK_DAG.md',
];

const RQ_DIMENSIONS = [
  'EXACT_CANDIDATE_BINDING',
  'BLOCKERS_CURRENTNESS',
  'REPRODUCIBLE_PACKAGE',
  'RELEASE_NOTES_COMPAT',
  'EXPECTED_HEAD_INTEGRATION',
  'REPO_POLICY_BASELINE',
  'POST_INTEGRATION_VERIFY',
  'INTEGRATION_CHANGE_INVALIDATES_RQ',
  'VISIBLE_P0_P1_ZERO',
  'EVIDENCE_CURRENTNESS',
  'NO_UNAUTHORIZED_WAIVER',
  'ROLE_INDEPENDENCE',
  'PR_CLOSURE_RQ_SEPARATION',
  'PRODUCT_L2_DAG',
];

test('t016: carried v0.6 freeze docs exist at their frozen paths', () => {
  for (const rel of V06_FREEZE_DOCS) {
    assert.ok(existsSync(join(REPO_ROOT, ...rel.split('/'))), `missing ${rel}`);
  }
});

test('t016: governance record binds the v0.7 closure candidate, tree, and all pack digests', () => {
  assert.ok(GOVERNANCE.includes(CANDIDATE_SHA), 'PROJECT_OVERRIDES must bind candidate SHA');
  assert.ok(GOVERNANCE.includes(CANDIDATE_TREE), 'PROJECT_OVERRIDES must bind candidate tree');
  assert.ok(GOVERNANCE.includes('**`v0.7`**'), 'PROJECT_OVERRIDES must name v0.7');
  for (const d of PACK_DIGESTS) {
    assert.ok(GOVERNANCE.includes(d), `PROJECT_OVERRIDES must carry pack digest ${d.slice(0, 12)}…`);
  }
});

test('t016: README currentness names the v0.7 line at the closure candidate', () => {
  assert.ok(README.includes('**v0.7**'), 'README must name v0.7');
  assert.ok(README.includes(CANDIDATE_TREE), 'README must bind the v0.7 tree');
});

test('t016: divergence audit carries the (a)/(b)/(c) classification and lane constraint', () => {
  assert.ok(AUDIT.includes('(b) genuinely-absent docs/governance'));
  assert.ok(AUDIT.includes('(a) v0.6-era content byte-present in v0.7 via T000 recovery'));
  assert.ok(AUDIT.includes('(c) v0.7-superseded'));
  assert.ok(AUDIT.includes('MAIN_ONLY_FILE_DELTAS=121'));
  assert.ok(AUDIT.includes('ZERO changes under `packages/**/src`'));
});

test('t016: RQ record covers every #733 dimension and the P0/P1-zero posture', () => {
  for (const dim of RQ_DIMENSIONS) {
    assert.ok(RQ.includes(dim), `RQ record must cover ${dim}`);
  }
  assert.ok(RQ.includes(PACK_SET_DIGEST), 'RQ record must carry the packedTarballSetSha256');
  assert.ok(RQ.includes('STOP before the RQ terminal'), 'freeze-rebind stop must be recorded');
  assert.ok(RQ.includes('86110c616b8cb18c730553e4cdab7ef555214521'));
});
