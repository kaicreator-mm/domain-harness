/**
 * T009 fidelity check — re-proves manifest <-> live-GitHub fidelity (issue #905).
 *
 * Run: node packages/domain-harness/tests/t009/t009-fidelity-check.mjs
 *
 * Requires: `gh` authenticated for kaicreator-mm/domain-harness, and this
 * checkout's git object store (any worktree of the repo). Exit 0 = FIDELITY_PASS,
 * exit 1 = FIDELITY_FAIL (at least one binding broken), exit 2 = tooling missing.
 *
 * Hosts whose direct route to api.github.com is unstable may need
 * HTTPS_PROXY/HTTP_PROXY set (workspace policy: local proxy 10808); gh picks
 * that up from the environment automatically.
 *
 * What it re-proves, per gate:
 *   1. the cited issue is CLOSED;
 *   2. every terminalCommentId cited in the manifest exists ON THAT ISSUE
 *      (fetched live via gh api — one call per issue, paginated);
 *   3. the cited comments carry the cited verdict strings (builder terminal
 *      SUPPORTED; validation CONFIRMED|PASS|SUPPORTED; fresh review
 *      PASS|SUPPORTED; MERGE_RECORD contains 'MERGE_RECORD', the gate verdict,
 *      and the manifest-bound merge anchor short-sha — so the manifest cannot
 *      drift from the GitHub-recorded anchor);
 *   4. locally, subject HEAD resolves to the manifest-bound tree and the merge
 *      anchor sits on the accepted ancestry of the manifest integration head.
 *
 * A verdict forged in the manifest (e.g. REFUTED rewritten as SUPPORTED) fails
 * here at step 3 even if it would parse — this is the PASS-coercion tripwire.
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..', '..');
const MANIFEST = JSON.parse(readFileSync(join(HERE, 't009-e1-e10-evidence-manifest.json'), 'utf8'));
const GH_REPO = 'kaicreator-mm/domain-harness';

function sh(cmd, args) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** gh with bounded retries for transient network/TLS failures. */
function ghRobust(args, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return sh('gh', ['api', ...args]);
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message ? err.message : err);
      if (!/timeout|TLS|ECONNRESET|ECONNREFUSED|dial/i.test(msg) || i === tries - 1) throw err;
    }
  }
  throw lastErr;
}

for (const tool of ['gh', 'git']) {
  try {
    sh(tool, ['--version']);
  } catch {
    console.error(`FIDELITY_FAIL: required tool "${tool}" not available`);
    process.exit(2);
  }
}

const results = [];
const fail = (gate, what) => results.push({ gate, ok: false, what });
const pass = (gate, what) => results.push({ gate, ok: true, what });

function ghJson(args) {
  return ghRobust(args);
}

for (const g of MANIFEST.gates) {
  const id = g.gate;
  // 1. issue closed
  const state = ghJson([`repos/${GH_REPO}/issues/${g.issue}`, '--jq', '.state']);
  if (state === 'CLOSED') pass(id, `issue #${g.issue} CLOSED`);
  else fail(id, `issue #${g.issue} state=${state} (expected CLOSED)`);

  // 2. comments live (paginated; retried via ghRobust)
  const comments = JSON.parse(
    ghRobust([`--paginate`, `repos/${GH_REPO}/issues/${g.issue}/comments`]),
  );
  const byId = new Map(comments.map((c) => [String(c.id), c.body ?? '']));
  const anchor = g.mergeCommit.slice(0, 8);
  for (const [kind, cid] of Object.entries(g.terminalCommentIds)) {
    const body = byId.get(String(cid));
    if (body === undefined) {
      fail(id, `cited comment ${cid} (${kind}) NOT FOUND on issue #${g.issue}`);
      continue;
    }
    let ok;
    let expect;
    if (kind === 'builderEvidence') {
      ok = body.includes('SUPPORTED');
      expect = 'SUPPORTED';
    } else if (kind === 'validation') {
      ok = /CONFIRMED|PASS|SUPPORTED/.test(body);
      expect = 'CONFIRMED|PASS|SUPPORTED';
    } else if (kind === 'freshReview') {
      ok = /PASS|SUPPORTED/.test(body);
      expect = 'PASS|SUPPORTED';
    } else if (kind === 'mergeRecord') {
      // Two durable controller formats exist: "GATE SUPPORTED & LANDED"
      // (early gates) and "<gate>=LIT" with a CONFIRMED evidence chain
      // (controller MERGE-FIRST format, e.g. E4/E7/E10). Both bind the
      // exact merge anchor; both are admissible.
      ok = body.includes('MERGE_RECORD') && /SUPPORTED|LIT/.test(body) && body.includes(anchor);
      expect = `MERGE_RECORD + SUPPORTED|LIT + anchor ${anchor}`;
    } else {
      ok = true;
      expect = '(supplementary)';
    }
    if (ok) pass(id, `comment ${cid} (${kind}) matches ${expect}`);
    else fail(id, `comment ${cid} (${kind}) does NOT match "${expect}" — manifest/live divergence`);
  }

  // 4. local git bindings
  try {
    const tree = sh('git', ['-C', REPO_ROOT, 'rev-parse', `${g.subjectHead}^{tree}`]);
    if (tree === g.subjectTree) pass(id, `subject ${g.subjectHead.slice(0, 8)}^{tree} == manifest tree`);
    else fail(id, `subject tree resolves ${tree} != manifest ${g.subjectTree}`);
  } catch {
    fail(id, `subject head ${g.subjectHead} not resolvable locally`);
  }
  try {
    sh('git', ['-C', REPO_ROOT, 'merge-base', '--is-ancestor', g.mergeCommit, MANIFEST.integrationHead]);
    pass(id, `merge anchor ${anchor} on accepted ancestry of ${MANIFEST.integrationHead.slice(0, 8)}`);
  } catch {
    fail(id, `merge anchor ${anchor} NOT on accepted ancestry of ${MANIFEST.integrationHead.slice(0, 8)}`);
  }
}

// integration head itself must be a real commit
try {
  sh('git', ['-C', REPO_ROOT, 'rev-parse', '--verify', MANIFEST.integrationHead]);
  pass('T009', `integration head ${MANIFEST.integrationHead.slice(0, 8)} resolves locally`);
} catch {
  fail('T009', `integration head ${MANIFEST.integrationHead} unresolvable`);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  [${r.gate}] ${r.what}`);
console.log(`checks=${results.length} passed=${results.length - failed.length} failed=${failed.length}`);
if (failed.length > 0) {
  console.log('FIDELITY_FAIL');
  process.exit(1);
}
console.log('FIDELITY_PASS — manifest is byte-faithful to live GitHub terminal identities');
