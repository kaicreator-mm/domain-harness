/**
 * T011 — architecture-gate disposition core (gate issue #924).
 *
 * ROLE: aggregation/adjudication ONLY on top of the accepted evidence
 * sources — this module consumes:
 *   - the accepted T009R full-manifest rerun (E1–E10) via
 *     `aggregateManifest()` from tests/t009r/t009r-aggregator.js
 *     (imported, NOT duplicated — T009R remains the completeness/currentness
 *     authority; T011 adds the architecture-dimension adjudication layer);
 *   - the accepted E11 terminal chain of #921 (builder 6047764502, fresh
 *     review 6047975173 PASS, validation 6048043527 CONFIRMED, merge record
 *     6048065030) via the committed binding
 *     t011-e11-terminal-binding.json, git-verified at this base.
 *
 * FROZEN #727 CONTRACT (disposition, exact and non-diluting):
 *   - consume the COMPLETE matrix E1..E11: per-gate verdict (preserved
 *     verbatim), exact terminal/subject HEAD/tree/fixture identity,
 *     Product/L2/SDK impact, known limits;
 *   - stale/replaced evidence cannot satisfy the matrix; duplicate/conflicting
 *     evidence fails closed (inherited from the T009R aggregator);
 *   - NO averaging, majority vote, test-count confidence, or PASS coercion;
 *   - any REFUTED verdict, or material PARTIAL requiring Product/L2 repair,
 *     => T012_PLUS=HOLD with the bounded ChatGPT Web repair/re-review lane
 *     (this module NEVER repairs production source or rewrites Product/L2);
 *   - all frozen architecture claims sufficiently SUPPORTED with only
 *     explicitly accepted non-material limits => T012_T013_AUTHORIZED=YES,
 *     which is NOT Version Closure and NOT Release PASS;
 *   - seven falsifiable architecture dimensions (#727), each mapped to the
 *     concrete gates/terminals that support it, cited by exact identity.
 *
 * SOURCE_MUTATION=NONE. Tests/evidence-only write set under tests/t011/.
 */

import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  aggregateManifest,
  isAncestor,
  type AggregatedMatrix,
  type Verdict,
} from '../t009r/t009r-aggregator.js';
import { T010A_FREEZE_RECORD } from '../fixtures/t010a-neutral-definition.freeze.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = join(HERE, '..', '..', '..', '..');

/** Deterministic T011 matrix order: the frozen E1..E10 order plus E11. */
export const T011_GATE_ORDER = [...'E1 E2 E3 E4 E5 E6 E7 E8a E8b E9 E10 E11'.split(' ')] as const;

const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** Tokens that must never appear as confidence fields anywhere in the input. */
const TEST_COUNT_CONFIDENCE_KEYS = [
  'passCount',
  'testCount',
  'supportingTestCount',
  'confidence',
  'overallVerdict',
  'average',
  'majority',
  'gatePass',
];

export class DispositionRefused extends Error {
  code: string;
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'DispositionRefused';
    this.code = code;
  }
}

export type E11Binding = {
  schema: string;
  schemaVersion: number;
  gate: string;
  gateIssue: number;
  pr: number;
  verdict: string;
  currentness: string;
  productImpact: string;
  l2Impact: string;
  sdkImpact: string;
  subjectHead: string;
  subjectTree: string;
  mergeCommit: string;
  t011BaseHead: string;
  terminalCommentIds: Record<string, string>;
  fixtureDigests: Record<string, string>;
  acceptedLimits?: Array<{ id: string; text: string; materiality: string; acceptanceAuthority: string }>;
};

export type T011Row = {
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
};

export type DimensionSupport = {
  gate: string;
  issue: number;
  pr: number;
  verdict: Verdict;
  mergeCommit: string;
  subjectHead: string;
  subjectTree: string;
};

export type DimensionAdjudication = {
  dimension: string;
  claim: string;
  planningSource: string;
  disposition: 'SUPPORTED' | 'PARTIAL' | 'REFUTED';
  supporting: DimensionSupport[];
};

export type LimitClassification = {
  id: string;
  gate: string;
  materiality: 'MATERIAL' | 'NON_MATERIAL';
  acceptanceAuthority: string;
  text: string;
};

export type T011Disposition = {
  schema: 'v0.7/t011-architecture-disposition';
  gateOrder: readonly string[];
  matrix: T011Row[];
  superseded: AggregatedMatrix['superseded'];
  dimensions: DimensionAdjudication[];
  limits: LimitClassification[];
  nonSupportedVerdicts: Array<{ gate: string; verdict: Verdict }>;
  currentnessPolicy: string;
  acceptedLimitRule: string;
  t012PlusDisposition: 'T012_T013_AUTHORIZED=YES' | 'T012_PLUS=HOLD';
  holdRoute: 'BOUNDED_CHATGPT_WEB_REPAIR_REVIEW_LANE' | null;
  versionClosure: 'NO';
  releasePass: 'NO';
  prPassNotReleasePass: true;
};

/**
 * The seven falsifiable architecture dimensions (#727 contract), each mapped
 * to the concrete gates whose accepted, exact-current evidence supports it.
 * Planning semantics are cited from the frozen #517 Product freeze and #526
 * L2 freeze — never rewritten here. `keyTerminals` bind named terminal
 * comment ids that MUST be present in the cited gate row's
 * terminalCommentIds (exact-identity citation, fail-closed).
 */
export const ARCHITECTURE_DIMENSIONS: ReadonlyArray<{
  dimension: string;
  claim: string;
  planningSource: string;
  gates: readonly string[];
  keyTerminals: Readonly<Record<string, string>>;
}> = [
  {
    dimension: 'D1_ONE_RUNTIME_CENTRAL_ADMISSION',
    claim:
      'Exactly ONE authoritative Runtime/admission/effect authority is preserved: every effectful Tool invocation is anchored to an admitted authoritative Domain occurrence and the existing Central Admission/durable effect authority; DONE is Runtime-owned, never Tool/UX/model-return-owned; exactly ONE durable record on the ONE host-supplied effect journal.',
    planningSource: '#517 Product freeze (one authoritative Runtime/effect authority); #526 L2 freeze (one authoritative Runtime/admission/effect authority)',
    gates: ['E4', 'E6', 'E9', 'E11'],
    keyTerminals: {
      E11: '6048043527', // validation terminal: DONE read ONLY from result.outcome; ONE journal record
      E6: '6039236493', // builder terminal: workflow path/recovery/one Runtime
      E9: '6029449239', // builder terminal: full T004B/C chain via the ONE Central Admission
      E4: '6039511391', // builder terminal: FROZEN_FIVE_MATRIX + NO_AGENT_AUTHORITY
    },
  },
  {
    dimension: 'D2_DEFINITION_VS_ASSEMBLY_IDENTITY_SPLIT',
    claim:
      'Definition and Assembly are distinct content-addressed identities: the Definition graph digest is composition/identity ONLY (never provider-selection/authorization authority); Runtime Assembly is content-addressed, assembly-pins the already-selected provider implementations, and is atomically referenced by activation/execution authority with exact pins — no parallel pin hierarchy, no torn activation.',
    planningSource: '#526 L2 freeze (Domain Definition = Domain Component Graph; content-addressed Runtime Assembly; assembly binds already-selected providers; exact assembly pins)',
    gates: ['E1', 'E7', 'E8a', 'E10', 'E11'],
    keyTerminals: {
      E7: '6044280062', // successor rerun: definitionGraphDigest vs assemblyBase/successor digests over REAL candidates
      E10: '6040759939', // replay/currentness exact Assembly pins
      E11: '6047764502', // builder claim: identity binding across A/B/C, digest deep-match
      E8a: '6029349438', // DefinitionGraphDigest + CorrespondenceDigest freeze
      E1: '6038951284', // successor rerun: current Definition/Assembly exposure binding
    },
  },
  {
    dimension: 'D3_TOOL_CAPABILITY_RESOURCE_EXACTNESS',
    claim:
      'Tool Component / Tool Implementation / Runtime Resource are distinct architecture roles with exact identities: Capability is a stable requires/provides contract identity (not a parallel component hierarchy); capability ambiguity/missing/incompatibility fails closed; effect enum stays none|idempotent|non-idempotent; resource currentness pins are exact and non-secret.',
    planningSource: '#526 L2 freeze (Tool/Implementation/Resource distinct roles; Capability contract identity; minimal effect enum); #517 Product freeze (Capability = stable requires/provides identity)',
    gates: ['E2', 'E3', 'E5', 'E9'],
    keyTerminals: {
      E5: '6028622834', // capability ambiguity/missing/incompatibility evidence
      E2: '6036039917', // generic tool invocation, KIND/TOOL pins
      E3: '6028552352', // simulation tool substitution, PROD/SIM pins
      E9: '6029775510', // validation: resource injection/currentness pins
    },
  },
  {
    dimension: 'D4_STANDARD_WORKFLOW_LEGACY_BOUNDARIES',
    claim:
      'Standard/Workflow/legacy boundaries hold: Domain provider selection belongs to admitted Definition semantics and assembly only binds already-selected providers; Standard Components (approval-workflow / canonical-digest) are exercised through the public Component mechanism over REAL production candidates; legacy Raw compatibility is an additive versioned strangler path with evidence-visible legacy→Component correspondence, never an identity rewrite; v0.6 semantic fail-closed behavior is preserved.',
    planningSource: '#526 L2 freeze (Standard descriptors via public mechanism; legacy additive compatibility; v0.6 fail-closed preservation; no identity rewrite)',
    gates: ['E6', 'E7', 'E8a', 'E8b'],
    keyTerminals: {
      E7: '6044823037', // merge record: E7_DISPOSITION=AUTHORITY_ADMISSIBLE_ACCEPTED over real PR #912 candidates
      E8a: '6029734136', // validation: legacy Raw compatibility
      E8b: '6036391742', // builder terminal: final v0.6 reconciliation, historical identity baseline
      E6: '6039907518', // validation: workflow engine digest variants
    },
  },
  {
    dimension: 'D5_AGENT_UX_AUTHORITY_BOUNDARY',
    claim:
      'Agent/UX caller intent never becomes Runtime transition/effect authority: the Agent Tool is a controlled Tool exposure/projection with a hard no-agent-authority boundary; the UX plane is closed-world (intent/provenance only) — frozen operations are invisible to it, forged occurrence/authority/exposure material mints NOTHING, stale UX currentness claims refuse typed, and the Harness query/mutation seam stays fail-closed for mutation.',
    planningSource: '#517 Product freeze (UX/Agent/Tool caller intent never becomes Runtime transition/effect authority; Agent Tool = controlled exposure/projection); #526 L2 freeze (Agent/UX cannot directly exercise effect authority)',
    gates: ['E4', 'E11'],
    keyTerminals: {
      E4: '6039929599', // fresh review: PASS, no-agent-authority boundary
      E11: '6047975173', // fresh review: unauthorized path R1-R6 + I3/I4, PASS
    },
  },
  {
    dimension: 'D6_CURRENTNESS_REPLAY_INVARIANTS',
    claim:
      'Currentness/replay invariants hold: exact-current Definition/Assembly pins are re-proved before dispatch with no fallback/rebind for stale claims; replay executes against exact Assembly pins; stale/replaced evidence cannot satisfy any gate (successor reruns re-prove at current head); bounded drift is admissible only with an explicit NO_IMPACT audit.',
    planningSource: '#526 L2 freeze (exact assembly pins; must-understand validation at admission); #727 (stale/replaced evidence cannot satisfy the matrix)',
    gates: ['E1', 'E8b', 'E9', 'E10', 'E11'],
    keyTerminals: {
      E10: '6041634546', // validation CONFIRMED: replay/currentness exact Assembly pins
      E1: '6039802398', // validation: successor rerun at current head
      E8b: '6036992409', // validation: v0.6 reconciliation currentness
      E11: '6048043527', // validation: pre-dispatch currentness, stale UX claim refuses typed
    },
  },
  {
    dimension: 'D7_MICROKERNEL_REPLACEMENT_INVARIANTS',
    claim:
      'Microkernel replacement invariants hold: SDK self-bootstrap is Minimal Microkernel + Standard Components using the SAME public Component abstraction, retaining an irreducible Microkernel — no heavyweight plugin framework, no generic Product Plugin ontology; Workflow/XState/Rule/Skill/Projection/AI/HTTP semantics remain outside the Microkernel; legacy identities use additive versioned compatibility, never identity rewrite.',
    planningSource: '#517 Product freeze (Minimal Microkernel + Standard Components, same public abstraction); #526 L2 freeze (irreducible Microkernel retained; legacy strangler paths; semantics outside the Microkernel)',
    gates: ['E7', 'E8a', 'E8b'],
    keyTerminals: {
      E8a: '6029349438', // builder terminal: legacy Raw compatibility evidence
      E8b: '6036756515', // fresh review: v0.6 compatibility SUPPORTED
      E7: '6044792324', // fresh review: standard components over real candidates, PASS
    },
  },
];

function git(args: string[]): string {
  try {
    return execFileSync('git', ['-C', REPO_ROOT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (err) {
    throw new DispositionRefused(
      'DISP_GIT_UNAVAILABLE',
      `git ${args.join(' ')} failed: ${String(err && (err as Error).message).split('\n')[0]}`,
    );
  }
}

const VERDICT_TOKENS = ['SUPPORTED', 'PARTIAL', 'REFUTED'] as const;
const ADMISSIBLE_CURRENTNESS = new Set([
  'CURRENT',
  'CURRENT_REBIND_RECORDED',
  'SUCCESSOR_RERUN_ACCEPTED',
]);

/** Deep-scan for test-count-confidence / aggregate-verdict substitution. */
function scanForConfidenceFields(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((v, i) => scanForConfidenceFields(v, `${path}[${i}]`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (TEST_COUNT_CONFIDENCE_KEYS.includes(k)) {
        throw new DispositionRefused(
          'DISP_TEST_COUNT_CONFIDENCE',
          `${path}.${k} — test-count confidence / aggregate-verdict substitution is forbidden by the frozen #727 contract (no averaging, majority vote, test-count confidence, or severity suppression)`,
        );
      }
      scanForConfidenceFields(v, `${path}.${k}`);
    }
  }
}

function validateE11Binding(raw: unknown): E11Binding {
  const b = raw as E11Binding;
  if (!b || typeof b !== 'object') throw new DispositionRefused('DISP_SCHEMA', 'e11 binding is not an object');
  if (b.schema !== 'v0.7/t011-e11-terminal-binding') {
    throw new DispositionRefused('DISP_SCHEMA', `unknown schema ${String(b.schema)}`);
  }
  if (b.schemaVersion !== 1) throw new DispositionRefused('DISP_SCHEMA', 'unsupported schemaVersion');
  if (b.gate !== 'E11') throw new DispositionRefused('DISP_SCHEMA', `gate must be E11, got ${String(b.gate)}`);
  if (b.gateIssue !== 921 || b.pr !== 922) {
    throw new DispositionRefused('DISP_SCHEMA', `E11 binds gate issue #921 / PR #922 exactly, got #${String(b.gateIssue)}/${String(b.pr)}`);
  }
  if (!VERDICT_TOKENS.includes(b.verdict as Verdict)) {
    throw new DispositionRefused('DISP_VERDICT_INVALID', `E11 verdict ${JSON.stringify(b.verdict)} is not an exact SUPPORTED|PARTIAL|REFUTED token`);
  }
  if (!ADMISSIBLE_CURRENTNESS.has(b.currentness)) {
    throw new DispositionRefused('DISP_STALE_EVIDENCE', `E11 currentness=${String(b.currentness)} — stale/replaced evidence cannot satisfy the matrix`);
  }
  for (const field of ['subjectHead', 'subjectTree', 'mergeCommit', 't011BaseHead'] as const) {
    if (typeof b[field] !== 'string' || !HEX40.test(b[field])) {
      throw new DispositionRefused('DISP_SCHEMA', `E11 ${field} missing or not a full sha`);
    }
  }
  if (!b.terminalCommentIds || Object.keys(b.terminalCommentIds).length < 4) {
    throw new DispositionRefused('DISP_SCHEMA', 'E11 must cite builder/validation/fresh-review/merge-record comment ids');
  }
  if (!b.fixtureDigests || Object.keys(b.fixtureDigests).length < 1) {
    throw new DispositionRefused('DISP_SCHEMA', 'E11 must bind at least one fixture digest');
  }
  // Freeze-digest binding: the E11 row binds the SAME landed T010A freeze
  // record the integrated terminal recomputed — a foreign digest fails closed.
  if (
    b.fixtureDigests.FREEZE_DEFINITION_GRAPH_DIGEST !== T010A_FREEZE_RECORD.definition.definitionGraphDigest ||
    b.fixtureDigests.FREEZE_BINDING_DIGEST !== T010A_FREEZE_RECORD.toolBinding.bindingDigest ||
    b.fixtureDigests.FREEZE_FINAL_ASSEMBLY_DIGEST !== T010A_FREEZE_RECORD.finalAssembly.assemblyDigest ||
    !HEX64.test(b.fixtureDigests.FREEZE_DEFINITION_GRAPH_DIGEST ?? '') ||
    !HEX64.test(b.fixtureDigests.FREEZE_BINDING_DIGEST ?? '') ||
    !HEX64.test(b.fixtureDigests.FREEZE_FINAL_ASSEMBLY_DIGEST ?? '')
  ) {
    throw new DispositionRefused('DISP_DIGEST_MISMATCH', 'E11 binding freeze digests do not deep-match the landed T010A freeze record');
  }
  // Git bindings: subject HEAD -> tree, merge anchor on accepted ancestry.
  const resolvedTree = git(['rev-parse', `${b.subjectHead}^{tree}`]);
  if (resolvedTree !== b.subjectTree) {
    throw new DispositionRefused(
      'DISP_DIGEST_MISMATCH',
      `E11 subjectHead->tree resolves to ${resolvedTree}, binding binds ${b.subjectTree}`,
    );
  }
  if (!isAncestor(b.mergeCommit, b.t011BaseHead)) {
    throw new DispositionRefused(
      'DISP_STALE_ANCHOR',
      `E11 merge anchor ${b.mergeCommit.slice(0, 8)} is not on the accepted ancestry of base ${b.t011BaseHead.slice(0, 8)}`,
    );
  }
  return b;
}

/**
 * Build the T011 architecture-gate disposition matrix over E1..E11.
 *
 * Throws DispositionRefused / AggregationRefused on ANY integrity violation —
 * fail closed, no partial results, no repair. Never emits an aggregate gate
 * verdict; individual verdicts are preserved verbatim.
 */
export function dispositionMatrix(manifestRaw: unknown, e11Raw: unknown): T011Disposition {
  // Confidence-subpression tripwire runs over BOTH inputs before anything else.
  scanForConfidenceFields(manifestRaw, 'manifest');
  scanForConfidenceFields(e11Raw, 'e11');

  // E1–E10: completeness/currentness via the accepted T009R aggregator
  // (all of its fail-closed semantics inherited, including superseded rows).
  const t009r = aggregateManifest(manifestRaw);
  const binding = validateE11Binding(e11Raw);

  const e11Row: T011Row = {
    gate: 'E11',
    issue: binding.gateIssue,
    pr: binding.pr,
    verdict: binding.verdict as Verdict,
    currentness: binding.currentness,
    productImpact: binding.productImpact,
    l2Impact: binding.l2Impact,
    sdkImpact: binding.sdkImpact,
    subjectHead: binding.subjectHead,
    subjectTree: binding.subjectTree,
    mergeCommit: binding.mergeCommit,
    terminalCommentIds: binding.terminalCommentIds,
  };

  const byId = new Map<string, T011Row>();
  for (const row of t009r.matrix) byId.set(row.gate, row);
  if (byId.has('E11')) {
    throw new DispositionRefused('DISP_DUPLICATE_GATE', 'E11 appears more than once (duplicate/conflicting evidence)');
  }
  byId.set('E11', e11Row);
  for (const required of T011_GATE_ORDER) {
    if (!byId.has(required)) {
      throw new DispositionRefused('DISP_INCOMPLETE', `gate ${required} missing from the T011 matrix`);
    }
  }

  const matrix = T011_GATE_ORDER.map((id) => byId.get(id)!);

  // Exact-identity duplicate/conflict scan across all 12 rows.
  const commentOwner = new Map<string, string>();
  for (const row of matrix) {
    for (const [kind, cid] of Object.entries(row.terminalCommentIds)) {
      const owner = commentOwner.get(cid);
      if (owner !== undefined && owner !== row.gate) {
        throw new DispositionRefused('DISP_CONFLICT', `comment ${cid} (${kind}) cited by both ${owner} and ${row.gate}`);
      }
      commentOwner.set(cid, row.gate);
    }
  }

  // --- Seven-dimension adjudication (the T011-added layer) ---
  const dimensions: DimensionAdjudication[] = ARCHITECTURE_DIMENSIONS.map((d) => {
    const supporting: DimensionSupport[] = [];
    for (const gateId of d.gates) {
      const row = byId.get(gateId);
      if (!row) {
        throw new DispositionRefused('DISP_DIMENSION_BINDING', `dimension ${d.dimension} cites missing gate ${gateId}`);
      }
      // Exact-identity terminal citation: every keyTerminal must be a comment
      // id actually carried by the cited gate row.
      for (const [g, cid] of Object.entries(d.keyTerminals)) {
        if (g === gateId && !Object.values(row.terminalCommentIds).includes(cid)) {
          throw new DispositionRefused(
            'DISP_DIMENSION_BINDING',
            `dimension ${d.dimension} cites terminal ${cid} for ${gateId}, but that gate row carries ${Object.values(row.terminalCommentIds).join(', ')}`,
          );
        }
      }
      supporting.push({
        gate: row.gate,
        issue: row.issue,
        pr: row.pr,
        verdict: row.verdict,
        mergeCommit: row.mergeCommit,
        subjectHead: row.subjectHead,
        subjectTree: row.subjectTree,
      });
    }
    const verdicts = new Set(supporting.map((s) => s.verdict));
    const disposition: DimensionAdjudication['disposition'] = verdicts.has('REFUTED')
      ? 'REFUTED'
      : verdicts.has('PARTIAL')
        ? 'PARTIAL'
        : 'SUPPORTED';
    return { dimension: d.dimension, claim: d.claim, planningSource: d.planningSource, disposition, supporting };
  });

  // --- Accepted-limit classification (material vs non-material) ---
  const limits: LimitClassification[] = [];
  for (const l of binding.acceptedLimits ?? []) {
    if (l.materiality !== 'NON_MATERIAL' && l.materiality !== 'MATERIAL') {
      throw new DispositionRefused('DISP_SCHEMA', `limit ${l.id} carries unknown materiality ${String(l.materiality)}`);
    }
    if (!l.acceptanceAuthority) {
      throw new DispositionRefused('DISP_SCHEMA', `limit ${l.id} must cite its acceptance authority`);
    }
    limits.push({ id: l.id, gate: 'E11', materiality: l.materiality, acceptanceAuthority: l.acceptanceAuthority, text: l.text });
  }
  const materialLimits = limits.filter((l) => l.materiality === 'MATERIAL');

  // --- Disposition semantics (frozen #727) ---
  const nonSupportedVerdicts = [
    ...t009r.nonSupportedVerdicts,
    ...(e11Row.verdict !== 'SUPPORTED' ? [{ gate: 'E11', verdict: e11Row.verdict }] : []),
  ];
  const refutedDimensions = dimensions.filter((d) => d.disposition === 'REFUTED');
  const partialDimensions = dimensions.filter((d) => d.disposition === 'PARTIAL');
  // Fail closed: a REFUTED verdict is ALWAYS material. A PARTIAL verdict is
  // material unless a committed accepted-limit entry explicitly names its gate
  // and classifies the partiality NON_MATERIAL (none exists in the current
  // matrix; the downgrade path is exercised only by the negative controls).
  const refuted = nonSupportedVerdicts.filter((v) => v.verdict === 'REFUTED');
  const materialPartial = nonSupportedVerdicts.filter((v) => {
    if (v.verdict !== 'PARTIAL') return false;
    return !limits.some((l) => l.gate === v.gate && l.materiality === 'NON_MATERIAL');
  });
  const hold =
    refuted.length > 0 ||
    materialPartial.length > 0 ||
    refutedDimensions.length > 0 ||
    partialDimensions.length > 0 ||
    materialLimits.length > 0;

  return {
    schema: 'v0.7/t011-architecture-disposition',
    gateOrder: T011_GATE_ORDER,
    matrix,
    superseded: t009r.superseded,
    dimensions,
    limits,
    nonSupportedVerdicts,
    currentnessPolicy:
      'NO_IMPACT_CURRENTNESS_ACCEPTED: admissible currentness = CURRENT | CURRENT_REBIND_RECORDED | SUCCESSOR_RERUN_ACCEPTED, each carrying an explicit NO_IMPACT drift/rebind/successor audit in the accepted manifest (E2/E5/E8a/E8b rebinds, E1/E7 successor reruns); stale/replaced evidence can never satisfy the matrix',
    acceptedLimitRule:
      'A known limit is NON_MATERIAL only with a committed accepted-limit entry citing its acceptance authority (#725 representative-subset and derived-variant adjudications, PR#912/#918 review limits, disclosed environment deviations); every MATERIAL limit, any REFUTED verdict, and any unaccepted PARTIAL routes T012_PLUS=HOLD with the bounded ChatGPT Web repair/re-review lane — never local repair',
    t012PlusDisposition: hold ? 'T012_PLUS=HOLD' : 'T012_T013_AUTHORIZED=YES',
    holdRoute: hold ? 'BOUNDED_CHATGPT_WEB_REPAIR_REVIEW_LANE' : null,
    versionClosure: 'NO',
    releasePass: 'NO',
    prPassNotReleasePass: true,
  };
}
