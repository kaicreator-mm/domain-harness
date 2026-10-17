# DomainHarness v0.9 — N09 Release Qualification state (#1037 evidence round)

> Qualification STATE record over ONE immutable integrated candidate, per the
> frozen N09 definition (independent release assurance; validation/evidence
> only — no source written into the candidate). Release decision belongs to
> the real release owner after independent review of this evidence PR.

## Candidate

Commit `6af0f8098bd7d847b9dc92a3fe76f61d4d2d8aa2` / tree
`2efa4a325bfd1a6dbcba3b1b1d57d192a4f40765` (main HEAD after the #1136 merge).
Integrated lineage: #1036/#1120 (#1129/#1131), #1118 (#1132), #1119 (#1133),
#1132 full-suite guard realignment (#1134), #1133-residue test typecheck
repairs (#1135, #1136). All native blockers closed: #1028, #1032, #1035,
#1036, #1118, #1119, #1120.

## Supported profile (first cohort, exactly as qualified)

- Node 24 ESM (`v24.21.0`, real Ubuntu 26.04 build host and clean consumers);
  no Windows/Linux/WSL2/QuickJS matrix claimed.
- Public surface: `@kaicreator/domain-harness/v9` (consumer app API:
  `DomainHarness.load(installedRef)` only) + `@kaicreator/domain-harness/v9/deployment`
  (the ONE deployment-owned trusted bootstrap entry). Legacy subpaths v0.2–v0.8
  unchanged.
- Physical store: injected `V09HostDocumentStore` port (true-CAS discipline);
  SQLite/PostgreSQL adapters remain deployment material outside this package.

## Gate evidence

| Gate | Evidence |
|---|---|
| Full Regression (ONE full reproducible run, exact candidate, real Node24 Ubuntu build host) | `npm ci` EXIT 0 · `npm run build` (incl. committed-dist guard) EXIT 0 · `npm run lint` EXIT 0 · `npm run typecheck` EXIT 0 · `npm test` EXIT 0 — **4007 tests, 0 fail, 0 skip** (workspace suites 3285 / 424 / 227 / 62 / 9). Pinned run below. |
| Full Regression (CI) | Woodpecker manual pipeline 1417 on main@`06cf9ab6`: verify step PASS; the `full-regression` (`npm test`) step was **killed at the worker's ~28-minute step wall-clock** — recorded as an environmental fact, not a code signal. Authoritative full suite therefore rests on the pinned build-host run above (the v0.8 precedent) plus per-head verify pipelines: 1410 (#1133 head), 1412 (#1133 final head), 1418 (#1135 head), 1421 (#1136 head) all PASS. |
| Hidden Validation | Private pack `DH09-FP-1037-01` (hidden-validation PR #64, merged): 9/9 adversarial vectors PASS on a clean-room install of the pinned tarball (surface pin; dist byte identity; no-scope refusal with a real ref; forged registrar via PHYSICAL deep file-URL import of the shipped channel module; cross-tenant borrowing; grant lattice + intent authority-field smuggling; revocation; error-cause discipline; strict consumer types). `IDENTITY_POLICY=SELF_DECLARED_UNVERIFIED`. |
| Critical Journeys | CJ-1 external clean packed two-B `load/send/query/subscribe/stop` journey — `tests/v09-external-consumer.test.ts` green in the pinned run (packs the exact candidate, installs outside the repo, 20-step journey). CJ-2 protected bridge E2E — two real Apps/two hosts, selected-Kernel effects, one-shot permits, #1120 delivery recheck + scoped lifecycle: `tests/v09-operation-bridge.test.ts`, `tests/v09-lifecycle-integration.test.ts`, `tests/v09-lifecycle-scoped-delivery.test.ts` green in the pinned run. CJ-3 re-load durability / restart-safe journal/CAS behavior — in-repo v0.9 suites green in the pinned run. |
| Independent Security Review | Integrated-candidate review (exact pins verified) over the whole v0.9 surface: **P0=0 P1=0 P2=0 P3=3**. Executed at `06cf9ab6`/tree `6f744967`; the final candidate `6af0f809` differs by exactly 4 type-annotation lines in one TEST file (`git diff --stat` = `tests/v09-external-consumer.test.ts`, +4/−4) — src/dist/package.json byte-identical, packed tarball SHA256 identical, so the review binding carries over with `VALIDATION_IMPACT=none`. P3s recorded: (1) AST-gate eval-ban is identifier-shallow — within the frozen trust model that explicitly claims no malicious same-realm sandboxing, all syntactic import edges are caught; (2) committed-dist guard cannot detect a dist file whose source was deleted (structural hardening note); (3) `V09ComposedBridge.harness` raw handle bypasses the request-scope wrapper if a DEPLOYMENT leaks it to consumer code — documentation/naming hardening within the deployment's own blast radius. |
| Clean packed consumer | #1119/#1133 external journey (CI 1410/1412) re-proven inside the pinned full run at the final candidate. |
| Supply chain | Reproducible pack (ARC01 double-pack byte identity); core tarball SHA256 `23505b4a989fd9dee4dd144536f142a01663bdc500436292474c74b5a85917da` (1204 files, integrity `sha512-kB+LXGSYVvkB8d+qAe6goj1iK6G6eGW+EYUM/xwthalID+DnITiKovA52NMqqbhi+x9vpKVEfrDBSnXlYMK4MQ==`) — identical bytes at `06cf9ab6` and `6af0f809`; committed dist guarded byte-fresh (incl. vendored parser assets, `sha256:76254fc7…` pin verified in review and hidden pack); runtime deps ajv/json-schema-library/xstate pinned by the lock. |
| Public error/ABI contract | frozen D04 families only; `UNSUPPORTED_RUNTIME_ABI` activation refusal proven on packed bytes (external journey + hidden H-vector). |

## Pinned run record (build host)

```ini
CANDIDATE=6af0f8098bd7d847b9dc92a3fe76f61d4d2d8aa2
TREE=2efa4a325bfd1a6dbcba3b1b1d57d192a4f40765
HOST=Ubuntu 26.04 LTS (WSL2), fnm Node v24.21.0, npm 11.19.0
REGISTRY=npmmirror (pull-through cache)
FRESH_CLONE=_mirror/domain-harness.git → detached checkout at the candidate
NPM_CI_EXIT=0
BUILD_EXIT=0            # workspaces + scripts/check-committed-dist.mjs
LINT_EXIT=0             # scripts/lint.mjs + eslint .
TYPECHECK_EXIT=0        # tsc --noEmit, all workspaces
TEST_EXIT=0
TEST_COUNTS=3285+424+227+62+9=4007  FAIL=0  SKIP=0
WALL=~6min (test phase)
```

Two earlier pinned runs at `06cf9ab6`/`1dbd5880` caught, honestly and exactly
as designed, the test-file typecheck residues repaired by #1135/#1136 (the
package test tail `tsc -p tsconfig.test.json --noEmit` is bypassed by the
verify smoke list and single-file tsx runs); no product source or dist ever
changed across those rounds.

## L3 acceptance checklist (V09_PRODUCTION_READY)

1. v0.8 accepted baseline inherited — non-negotiable gates carried (v0.8
   release-qualification record + 44-row ledger lineage).
2. N06/N07/N08 production P0 + N01/N02 minimums complete — #1032/#1035/#1036/
   #1120/#1118/#1119 all CLOSED.
3. Exact-v0.9 tarball installed in a fresh external repo, executed against
   two real Domain App families + targeted negative/fault suite — #1133
   journey + hidden pack, at the identical tarball bytes.
4. Documented APIs/Host/target profile + incident/operability +
   supply-chain/provenance — this record + `docs/quickstart/v09/` +
   `examples/v09-clean-consumer/` + `docs/release/v0.9-release-qualification.md`.
5. Full Regression + Hidden + Critical Journeys + independent Security Review
   + Release Qualification — all executed and recorded above, zero unwaived
   Product/security P0/P1 (security review P0/P1=0).

`V09_PRODUCTION_READY=PASS` under the recorded supported cohort, with two
environment-honest caveats carried forward: IDENTITY_POLICY=SELF_DECLARED_UNVERIFIED
(single-account environment for builder/reviewer/recorder) and the CI
full-regression step's structural wall-clock kill (the authoritative full
suite is the pinned build-host run).

## Explicit non-claims

- No OS/browser matrix beyond the cohort above; no npm-publish claim (git-pin
  + tarball distribution only); no migration/upgrade-tooling claim.
- Nothing upgrades PR-CI green at predecessor SHAs into candidate evidence;
  every row above is executed at the candidate or explicitly recorded as an
  environmental fact.
- Hidden vectors remain solely in the private repository (pack identity,
  execution result and counts only are recorded here).
