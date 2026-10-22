# #1267 — Decision S Features dispatched by the S Primary inside the K turn (exact SHA)

- Task brief: `C:\xDev\kAiCreator\_tmp\dh-i1267-zcode\brief.md`; worktree `dh-i1267-zcode`,
  branch `task/dh-i1267-zcode`, stacked base `task/dh-i1265-zcode@7aa0a20a` (PR #1271 over
  #1264/PR #1269). No merge/rebase onto newer dependency-branch commits (controller syncs later).
- Environment: LOCAL Windows Node `v24.21.0` (Node 24 gate satisfied).
- Selected payload bytes per this task (git blob sha1):
  - Kernel `payload/kernel-mechanism-v1.mjs`: base `aa4382ceeecac3a15e46f4d681e3aa5f85a563d4`
    → head `d25670c51aa32faf3993d88417f6771ce62d86d7` (#1267: `admissionResolverEvidence`
    additive `featureDispatch` citation + absent-fact tolerance; admission decisions unchanged).
    Re-pinned witnesses with provenance comments: `k02-combined-splice-physical.test.ts`,
    `k02-namespace-two-b-physical.test.ts`, `t10-multib-query-physical.test.ts`
    (`K02_SPLICED_KERNEL_BLOB_SHA1`), `v08-tf-oracle-fr02-fr07.test.ts` (`V08_K_BLOB`).
  - Standard `payload/standard-sdk-v1.mjs`: `9b86835bf12262ef53548e0031550fcecd97a7f2`
    → `5fb90236acc68d4b6ffadec62dc353972c1834ea` (#1267: `createFeatureDecisionDispatcher`
    + `DECISION_FEATURE_KEYS` added; plain `interpret` semantics unchanged).
    Re-pinned witness: `v08-tf-oracle-fr02-fr07.test.ts` (`V08_S_BLOB`).

## What changed (summary)

- BUILD (`v10build/build.ts` + `digest.ts`): a route row MAY name `featureKey` — the selected,
  decision-capable Standard Feature that interprets that intent inside the K turn. The closed
  decision-capable set `V10_DECISION_FEATURE_KEYS` (frozen; `['standard:semantic-decision/1']`)
  is mirrored byte-for-byte by the S payload's `DECISION_FEATURE_KEYS` (parity test
  `1267-PARITY`). BUILD rejects, typed `V10_ROUTE_INVALID`, a `featureKey` that is not
  decision-capable or not provided by a SELECTED `standard-feature` (skipped optionals refuse).
  Absent `featureKey` ⇒ today's behavior byte-for-byte (Tiny unchanged; the route digest input
  is unchanged when the key is absent).
- S Primary dispatch (`payload/standard-sdk-v1.mjs`): `createFeatureDecisionDispatcher(wiring)`
  returns the ONE `interpret` the Kernel calls. A declaration is identified descriptor-only by
  its kernel-digest-verified `declarationDigest`; unbound declarations take the plain interpreter
  byte-for-byte; a bound entry dispatches to EXACTLY its selected feature export (no fallback to
  the S Primary, no first-match). The Business declaration (policy `featureDecisions[intent]`)
  supplies the T02 request material and the finite AW-01 outcome→event map; the occurrence input
  is projected through the declaration's exact `inputSelection` before the feature ever sees it.
  The mapped result is produced in the exact shape the Kernel already admits
  (`structuredDecision.event` / `semanticStatus:'unavailable'`), so the Kernel's admission path
  is unchanged. Host model/tool/procedure dependencies ride ONE new activation option
  (`decisionDependencies`, analogous to `queryAuthority`; validated typed at activation); absent
  ⇒ no-model mode (rule / exact-reuse / pinned-procedure still work; a model fallback degrades
  to the typed zero-effect `SEMANTIC_UNAVAILABLE` terminal with `unmeasured` evidence).
- Isolation guard: EVERY feature result is consumed through the sealed payload's
  descriptor-safe `data()` snapshot — accessors/Proxies/exotic prototypes/thenables/non-finite
  values/own `__proto__` keys refuse WITHOUT invoking any getter — then scanned (bounded depth)
  for Kernel/Host authority fields (T02 `OWNED_AUTHORITY_FIELDS` by value). A throwing,
  lying, unmapped, malformed or deadline-exceeded dispatch degrades to
  `semanticStatus:'unavailable'`; nothing is awaited beyond the selected feature's own promise,
  bounded by the declared `limits.deadlineEpochMs` when present (loser detached, never adopted).
- Truthful receipt: `admissionResolverEvidence` carries, additively, the validated
  `featureDispatch { dispatch:'s-primary-feature', featureKey }` next to the decision
  `source` (rule/reuse/procedure/model) and structured `modelCallEvidence`
  (measured `{count, scope:'v10-feature-dispatch-model-port'}` vs `unmeasured`). Absent facts
  (`source`/`llmAvoided` on a refused dispatch) are omitted instead of materializing
  non-canonical `undefined`. Every legacy/unbound receipt is byte-identical (pinned literal in
  `1267-P5/N-BASE`, plus the base-vs-head two-App equivalence inside one dispatcher-wired App).
- T06 observer (`v10evidence/decision-evidence-observer.ts`): a BOUND intent (read from the
  facade's new read-only `boundDecisionFeatureOf`) is observed from the K receipt's OWN resolver
  evidence (`semanticOutcome`/`source`/`evidence.decisionFeature`/
  `modelCallStatus:'k-receipt-resolver-evidence'`) — never a second, separately invoked decision
  (zero new feature/model calls; asserted with a poisoned deployment boundary). The non-bound
  direct-invocation path is unchanged (T06-1267-N1 + all pre-existing T06 cases green).
- T03 workflow-control: NOT bound, deliberately. Its `planWorkflowControl` results are data-only
  PROPOSALS for SUBSEQUENT K turns (next loop step with a new messageId, child-open,
  wait-open, control-resume) executed by the trusted Host durable-controls coordinators — not a
  decision about THIS turn's admitted event. Binding it would force a second submission engine
  inside the K turn (forbidden by CT-05 one-K-turn authority and NF05's one-admission chain).
  It remains a CT-02 direct named semantic call via `facade.invokeSelectedStandardFeature`.
  The same holds for Context Assembly, Shadow and Candidate validation, and Evidence
  normalization: none of them produces an admission, so none is BUILD-bound; see the dated
  addendum in `docs/architecture/DomainHarness_v0.10_HOST_RUNTIME_ABSTRACTION_AUDIT.md`.

## Tests (focused)

- `tests/assembly/v010-feature-decision-dispatch.test.ts` (19): P1 rule admits exactly the
  mapped event with source+featureDispatch citation; P2 exact-reuse maps 'review' to the
  DISTINCT QUOTE_REVIEWED event (escalated) with `cacheRead:'hit'`; P3 pinned procedure through
  Host-wired deps; P4 model fallback with measured count, `llmAvoided:false`, no K port in the
  model payload, caller-injected material projected away; P5/N-BASE unbound byte-identity
  (literal base resolver + two-App equivalence); P6 guard denial carries the resolver evidence;
  N1 no-deps fallback ⇒ SEMANTIC_UNAVAILABLE zero Journal/Effect; N2 replay returns the original
  receipt with zero new model calls/effects; N3 hostile feature results (permit, top-level
  permit, forged status/terminal ignored, throwing, unmapped outcome, malformed measured claim)
  never admitted as given; N4 throwing getter + hostile Proxy trap refused without inspection
  (counts stay zero); N5 public input cannot inject deps/material; N6 BUILD typed refusals
  (not decision-capable, unselected, unknown route field); N7 stripped policy material refuses
  the K turn typed before admission; PARITY closed-set mirror; F1–F5 dispatcher-factory
  isolation regressions (descriptor-only reads, non-thenable/thenable returns, never-settling
  promise + declared deadline with late settlement never adopted, unbound fall-through, forged
  wiring refusals).
- `tests/assembly/v010-t06-decision-evidence.test.ts` (+4): bound evidence read from the K
  receipt with zero separate calls (poisoned boundary stays at 0), bound measured counts from
  the receipt, bound unavailable terminal, direct path unchanged.
- Suites re-run green: tests/assembly (178), tests/compiler (56), compiler package (430),
  domain-harness package (3326, incl. the re-pinned K02/T10 blob witnesses and the
  WEB-ORACLE-1 K/S rebind META), `tests/hosts/node/v010-t08-*` (27),
  `tests/integration/v010-clean-consumers` (1), error-code catalog PASS.

## Residual risks

- A hostile forwarding Proxy over genuinely plain data yields a faithful plain snapshot and
  may admit through the real gates; only descriptor-hostile material (accessors, exotic
  prototypes, lying/throwing traps) is refused. This is inherent to Proxy undistinguishability
  and safe: what enters admission is plain JSON captured via descriptors.
- A bound decision whose material declares NO `deadlineEpochMs` waits unbounded on a hanging
  selected feature — the same trust level as the Kernel's plain `interpret` await. The declared
  deadline is the bounded-wait contract (F3 covers the bounded case).
- The BUILD `featureKey` and the policy `featureDecisions` material are validated at their own
  seams (BUILD: selection/decision-capability; activation/dispatcher factory: material depth).
  An App that binds a route but omits the material fails typed at the first K turn (N7),
  not silently.
