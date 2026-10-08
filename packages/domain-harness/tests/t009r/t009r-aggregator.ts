/**
 * T009R aggregator core — fresh full-manifest rerun (issue #919, gate contract
 * frozen at #720; controller #537 LOCAL_FIRST_MAX_SAFE_PARALLELISM).
 *
 * Ported VERBATIM-SEMANTICS from the proven parked aggregator (PR #909,
 * branch task/dh-t009-905, gate issue #905) and refreshed per #720@6042071497:
 * the E7 row binds the #913 successor chain (merge 2b50ba01) and the old
 * #898/PR#903 row is recorded in manifest-level supersededRows[] as a
 * SUPERSEDED stale disposition — recorded, never averaged, never silently
 * dropped; E7 is satisfied ONLY by the #913 chain.
 *
 * Frozen contract semantics (unchanged):
 *   - consume exact current E1-E10 terminal identities + subject HEAD/tree/
 *     fixture digests + stale/replacement dispositions;
 *   - preserve every individual SUPPORTED|PARTIAL|REFUTED verdict verbatim
 *     (PRODUCT/L2/SDK impacts carried through for T011);
 *   - stale/replaced evidence blocks aggregation; NO averaging, majority
 *     vote, severity suppression, or PASS coercion;
 *   - T009=PASS means completeness+currentness of the matrix ONLY — not
 *     architecture acceptance, not Release PASS;
 *   - deterministic ordering; duplicate/conflicting evidence fails closed.
 *
 * Rerun-strengthening (fail-closed, additive to the parked schema):
 *   - supersededRows[] is REQUIRED: a rerun manifest must record every
 *     replaced row; silently dropping one is a schema violation;
 *   - a superseded row must carry a STALE disposition token (SUPERSEDED /
 *     STALE / REPLACED) — if the OLD #898 E7 row is presented as CURRENT /
 *     admissible, aggregation is refused (AGG_SUPERSEDED_INVALID);
 *   - supersededBy must chain to a real gate row of the same gate id whose
 *     mergeCommit matches (AGG_SUPERSEDED_CHAIN_BROKEN otherwise);
 *   - superseded-row comment ids must not collide with gate-row ids
 *     (AGG_CONFLICT) and superseded rows NEVER enter the output matrix.
 *
 * NETWORK-FREE: GitHub fidelity is re-proven separately by
 * t009r-fidelity-check.mjs. Local git verifies that manifest-bound subject
 * HEAD/tree and merge anchors resolve on the accepted ancestry.
 *
 * SOURCE_MUTATION=NONE. Tests/evidence-only write set.
 */

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..', '..', '..');

/** Frozen deterministic gate order (E8a and E8b are DISTINCT rows of gate E8). */
export const GATE_ORDER = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8a', 'E8b', 'E9', 'E10'] as const;

export const ALLOWED_VERDICTS = ['SUPPORTED', 'PARTIAL', 'REFUTED'] as const;
export type Verdict = (typeof ALLOWED_VERDICTS)[number];

/** Dispositions under which a gate's evidence is admissible for aggregation. */
export const ADMISSIBLE_CURRENTNESS = new Set([
  'CURRENT',
  'CURRENT_REBIND_RECORDED',
  'SUCCESSOR_RERUN_ACCEPTED',
]);

/** Dispositions under which a superseded row may be RECORDED (never admissible). */
export const STALE_DISPOSITIONS = new Set(['SUPERSEDED', 'STALE', 'REPLACED']);

const HEX40 = /^[0-9a-f]{40}$/;

export type GateEntry = {
  gate: string;
  issue: number;
  pr: number;
  verdict: string;
  currentness: string;
  productImpact: string;
  l2Impact: string;
  sdkImpact: string;
  subjectHead: string;
  subjectTree: string;
  mergeCommit: string;
  terminalCommentIds: Record<string, string>;
  fixtureDigests: Record<string, string>;
  staleReplacedDisposition: string;
};

export type SupersededRow = {
  gate: string;
  disposition: string;
  issue: number;
  pr: number;
  verdict: string;
  subjectHead: string;
  subjectTree: string;
  mergeCommit: string;
  terminalCommentIds: Record<string, string>;
  supersededBy?: {
    issue: number;
    pr: number;
    mergeCommit: string;
    mergeRecordCommentId?: string;
  };
  record?: string;
};

export type Manifest = {
  schema: string;
  schemaVersion: number;
  integrationHead: string;
  gateOrder: string[];
  gates: GateEntry[];
  supersededRows?: SupersededRow[];
};

export class AggregationRefused extends Error {
  code: string;
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'AggregationRefused';
    this.code = code;
  }
}

function git(args: string[]): string {
  try {
    return execFileSync('git', ['-C', REPO_ROOT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    // Fail closed: any git failure (missing object, not-a-repo) refuses.
    throw new AggregationRefused(
      'AGG_GIT_UNAVAILABLE',
      `git ${args.join(' ')} failed: ${String(err && (err as Error).message).split('\n')[0]}`,
    );
  }
}

export function isAncestor(commit: string, ancestorOf: string): boolean {
  try {
    execFileSync('git', ['-C', REPO_ROOT, 'merge-base', '--is-ancestor', commit, ancestorOf], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

export type AggregatedMatrix = {
  matrix: Array<{
    gate: string;
    issue: number;
    pr: number;
    verdict: Verdict;
    currentness: string;
    productImpact: string;
    l2Impact: string;
    sdkImpact: string;
    subjectHead: string;
    subjectTree: string;
    mergeCommit: string;
    terminalCommentIds: Record<string, string>;
  }>;
  superseded: Array<{
    gate: string;
    issue: number;
    pr: number;
    verdict: Verdict;
    disposition: string;
    mergeCommit: string;
    supersededByMergeCommit: string;
  }>;
  t009Pass: boolean;
  nonSupportedVerdicts: Array<{ gate: string; verdict: Verdict }>;
  completenessCurrentness: 'PASS';
};

/**
 * Aggregate the E1-E10 evidence manifest per the frozen T009 contract.
 *
 * Returns the deterministic matrix (fixed gate order, verdicts preserved
 * verbatim) plus the recorded superseded rows. Throws AggregationRefused on
 * ANY completeness, conflict, stale-anchor, supersession-integrity, or
 * integrity violation — fail closed, no partial results.
 *
 * The result deliberately carries NO aggregate gate verdict: T009 does not
 * average, vote, or coerce; T011 consumes the per-gate verdicts verbatim.
 */
export function aggregateManifest(raw: unknown): AggregatedMatrix {
  const m = raw as Manifest;

  // --- shape / schema (fail closed) ---
  if (!m || typeof m !== 'object') throw new AggregationRefused('AGG_SCHEMA', 'manifest is not an object');
  if (m.schema !== 'v0.7/t009-evidence-manifest') throw new AggregationRefused('AGG_SCHEMA', `unknown schema ${String(m.schema)}`);
  if (m.schemaVersion !== 1) throw new AggregationRefused('AGG_SCHEMA', `unsupported schemaVersion ${String(m.schemaVersion)}`);
  if (typeof m.integrationHead !== 'string' || !HEX40.test(m.integrationHead)) {
    throw new AggregationRefused('AGG_SCHEMA', 'integrationHead missing or not a full sha');
  }
  if (!Array.isArray(m.gateOrder) || !Array.isArray(m.gates)) {
    throw new AggregationRefused('AGG_SCHEMA', 'gateOrder/gates must be arrays');
  }

  // --- deterministic ordering: the manifest must declare the frozen order ---
  if (JSON.stringify(m.gateOrder) !== JSON.stringify(GATE_ORDER)) {
    throw new AggregationRefused('AGG_ORDER', `gateOrder must be exactly ${GATE_ORDER.join(',')}`);
  }

  // --- completeness: exactly the 11 input rows (10 gates; E8a+E8b distinct) ---
  if (m.gates.length !== GATE_ORDER.length) {
    throw new AggregationRefused('AGG_INCOMPLETE', `expected ${GATE_ORDER.length} gate entries, found ${m.gates.length}`);
  }
  const seen = new Set<string>();
  for (const g of m.gates) {
    const id = g?.gate;
    if (seen.has(id)) throw new AggregationRefused('AGG_DUPLICATE_GATE', `gate ${id} appears more than once (duplicate/conflicting evidence)`);
    seen.add(id);
  }
  for (const required of GATE_ORDER) {
    if (!seen.has(required)) throw new AggregationRefused('AGG_INCOMPLETE', `gate ${required} missing from matrix`);
  }

  // --- per-gate field validation (fail closed; no defaults, no coercion) ---
  const byId = new Map<string, GateEntry>();
  for (const g of m.gates) {
    if (!g || typeof g !== 'object') throw new AggregationRefused('AGG_SCHEMA', 'gate entry not an object');
    if (!ALLOWED_VERDICTS.includes(g.verdict as Verdict)) {
      throw new AggregationRefused('AGG_VERDICT_INVALID', `gate ${g.gate} verdict ${JSON.stringify(g.verdict)} is not an exact SUPPORTED|PARTIAL|REFUTED token (possible coercion)`);
    }
    if (!ADMISSIBLE_CURRENTNESS.has(g.currentness)) {
      throw new AggregationRefused(
        'AGG_STALE_EVIDENCE',
        `gate ${g.gate} currentness=${String(g.currentness)} — stale/replaced evidence blocks aggregation until rerun`,
      );
    }
    for (const field of ['subjectHead', 'subjectTree', 'mergeCommit'] as const) {
      if (typeof g[field] !== 'string' || !HEX40.test(g[field])) {
        throw new AggregationRefused('AGG_SCHEMA', `gate ${g.gate} ${field} missing or not a full sha`);
      }
    }
    if (!g.terminalCommentIds || Object.keys(g.terminalCommentIds).length < 4) {
      throw new AggregationRefused('AGG_SCHEMA', `gate ${g.gate} must cite evidence/validation/fresh-review/merge-record comment ids`);
    }
    if (!g.fixtureDigests || Object.keys(g.fixtureDigests).length < 1) {
      throw new AggregationRefused('AGG_SCHEMA', `gate ${g.gate} must bind at least one fixture digest`);
    }
    byId.set(g.gate, g);
  }

  // --- superseded rows (rerun-strengthened): required, recorded-only ---
  if (!Array.isArray(m.supersededRows) || m.supersededRows.length < 1) {
    throw new AggregationRefused(
      'AGG_SUPERSEDED_MISSING',
      'supersededRows[] is required and must be non-empty for this rerun schema — every replaced row must be recorded; silently dropping one is a fail-closed schema violation',
    );
  }
  const superseded: AggregatedMatrix['superseded'] = [];
  for (const s of m.supersededRows) {
    if (!s || typeof s !== 'object') throw new AggregationRefused('AGG_SCHEMA', 'superseded row not an object');
    if (!STALE_DISPOSITIONS.has(s.disposition)) {
      throw new AggregationRefused(
        'AGG_SUPERSEDED_INVALID',
        `superseded row ${s.gate}/#${s.issue} carries disposition=${JSON.stringify(s.disposition)} — the old row must be recorded SUPERSEDED/STALE/REPLACED; presenting it as current/admissible is refused`,
      );
    }
    if (!ALLOWED_VERDICTS.includes(s.verdict as Verdict)) {
      throw new AggregationRefused('AGG_VERDICT_INVALID', `superseded row ${s.gate}/#${s.issue} verdict is not an exact SUPPORTED|PARTIAL|REFUTED token`);
    }
    for (const field of ['subjectHead', 'subjectTree', 'mergeCommit'] as const) {
      if (typeof s[field] !== 'string' || !HEX40.test(s[field])) {
        throw new AggregationRefused('AGG_SCHEMA', `superseded row ${s.gate} ${field} missing or not a full sha`);
      }
    }
    if (!s.terminalCommentIds || Object.keys(s.terminalCommentIds).length < 4) {
      throw new AggregationRefused('AGG_SCHEMA', `superseded row ${s.gate} must cite its terminal comment ids (recorded, never dropped)`);
    }
    // A superseded row may not ALSO pose as the live gate row (duplicate/conflict).
    if (byId.has(s.gate) && byId.get(s.gate)!.mergeCommit === s.mergeCommit) {
      throw new AggregationRefused(
        'AGG_CONFLICT',
        `superseded row ${s.gate}/#${s.issue} merge ${s.mergeCommit.slice(0, 8)} is also the live gate row — duplicate/conflicting evidence`,
      );
    }
    // Supersession chain must resolve to the authoritative successor row.
    const successor = byId.get(s.gate);
    if (!s.supersededBy || successor?.issue !== s.supersededBy.issue || successor?.pr !== s.supersededBy.pr) {
      throw new AggregationRefused('AGG_SUPERSEDED_CHAIN_BROKEN', `superseded row ${s.gate}/#${s.issue} does not chain to the live gate row`);
    }
    if (s.supersededBy.mergeCommit !== successor!.mergeCommit) {
      throw new AggregationRefused(
        'AGG_SUPERSEDED_CHAIN_BROKEN',
        `superseded row ${s.gate}: supersededBy.mergeCommit ${s.supersededBy.mergeCommit.slice(0, 8)} != live gate mergeCommit ${successor!.mergeCommit.slice(0, 8)}`,
      );
    }
    // Local git bindings for the recorded row (recorded identity must be real).
    if (!isAncestor(s.mergeCommit, m.integrationHead)) {
      throw new AggregationRefused(
        'AGG_STALE_ANCHOR',
        `superseded row ${s.gate} merge anchor ${s.mergeCommit.slice(0, 8)} is not on the accepted ancestry of ${m.integrationHead.slice(0, 8)}`,
      );
    }
    const resolvedTree = git(['rev-parse', `${s.subjectHead}^{tree}`]);
    if (resolvedTree !== s.subjectTree) {
      throw new AggregationRefused(
        'AGG_DIGEST_MISMATCH',
        `superseded row ${s.gate} subjectHead->tree resolves to ${resolvedTree}, manifest binds ${s.subjectTree}`,
      );
    }
    superseded.push({
      gate: s.gate,
      issue: s.issue,
      pr: s.pr,
      verdict: s.verdict as Verdict,
      disposition: s.disposition,
      mergeCommit: s.mergeCommit,
      supersededByMergeCommit: s.supersededBy.mergeCommit,
    });
  }

  // --- duplicate/conflict fail-closed across gates AND superseded rows ---
  const commentOwner = new Map<string, string>();
  for (const g of m.gates) {
    for (const [kind, cid] of Object.entries(g.terminalCommentIds)) {
      const owner = commentOwner.get(cid);
      if (owner !== undefined && owner !== g.gate) {
        throw new AggregationRefused('AGG_CONFLICT', `comment ${cid} (${kind}) cited by both ${owner} and ${g.gate}`);
      }
      commentOwner.set(cid, g.gate);
    }
  }
  for (const s of m.supersededRows) {
    for (const [kind, cid] of Object.entries(s.terminalCommentIds ?? {})) {
      const owner = commentOwner.get(cid);
      if (owner !== undefined) {
        throw new AggregationRefused('AGG_CONFLICT', `superseded row ${s.gate}/#${s.issue} reuses comment ${cid} (${kind}) owned by ${owner} — duplicate/conflict`);
      }
      commentOwner.set(cid, `${s.gate}:superseded#${s.issue}`);
    }
  }
  // fixture-digest collisions across gates: same key AND same value bound to
  // two different gates means one fixture identity is claimed twice.
  const digestOwner = new Map<string, string>();
  for (const g of m.gates) {
    for (const [k, v] of Object.entries(g.fixtureDigests)) {
      const key = `${k}=${v}`;
      const owner = digestOwner.get(key);
      if (owner !== undefined && owner !== g.gate) {
        throw new AggregationRefused('AGG_FIXTURE_COLLISION', `fixture digest ${k}=${v} claimed by both ${owner} and ${g.gate}`);
      }
      digestOwner.set(key, g.gate);
    }
  }

  // --- currentness of git-bound identities (local, deterministic) ---
  for (const g of m.gates) {
    if (!isAncestor(g.mergeCommit, m.integrationHead)) {
      throw new AggregationRefused(
        'AGG_STALE_ANCHOR',
        `gate ${g.gate} merge anchor ${g.mergeCommit} is not on the accepted ancestry of ${m.integrationHead}`,
      );
    }
    const resolvedTree = git(['rev-parse', `${g.subjectHead}^{tree}`]);
    if (resolvedTree !== g.subjectTree) {
      throw new AggregationRefused(
        'AGG_DIGEST_MISMATCH',
        `gate ${g.gate} subjectHead->tree resolves to ${resolvedTree}, manifest binds ${g.subjectTree}`,
      );
    }
  }

  // --- deterministic output: fixed gate order regardless of input order ---
  // Superseded rows are RECORDED in superseded[] but NEVER enter the matrix:
  // they cannot satisfy, augment, or average into any gate row.
  const matrix = GATE_ORDER.map((id) => {
    const g = byId.get(id)!;
    return {
      gate: g.gate,
      issue: g.issue,
      pr: g.pr,
      verdict: g.verdict as Verdict,
      currentness: g.currentness,
      productImpact: g.productImpact,
      l2Impact: g.l2Impact,
      sdkImpact: g.sdkImpact,
      subjectHead: g.subjectHead,
      subjectTree: g.subjectTree,
      mergeCommit: g.mergeCommit,
      terminalCommentIds: g.terminalCommentIds,
    };
  });

  const nonSupportedVerdicts = matrix
    .filter((r) => r.verdict !== 'SUPPORTED')
    .map((r) => ({ gate: r.gate, verdict: r.verdict }));

  return {
    matrix,
    superseded,
    // Frozen semantics: T009=PASS == completeness+currentness ONLY. Individual
    // non-SUPPORTED verdicts are preserved verbatim and surfaced here; they are
    // never coerced, averaged, or suppressed, and they are T011's input.
    t009Pass: true,
    nonSupportedVerdicts,
    completenessCurrentness: 'PASS',
  };
}
