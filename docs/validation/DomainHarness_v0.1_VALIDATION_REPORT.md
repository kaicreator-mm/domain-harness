# DomainHarness v0.1 — Validation Report

**Report stage:** T-017 closeout preparation  
**Version integration baseline entering T-017:** `22969fcca156ab47dfafff259490affed9d82baa`  
**Release qualification:** BLOCKED / NOT COMPLETE

This report distinguishes implemented evidence from actually executed validation. No unexecuted gate is marked PASS.

## Executed evidence

### T-013 package / clean-consumer gate — PASS

GitHub Issue `kaicreator-mm/domain-harness#30` is closed after Build Host validation on descendant SHA `dd0bdd7`:

- clean `npm ci`: PASS;
- `npm run typecheck`, `npm test`, `npm run build`: PASS;
- 111/111 tests at that candidate;
- `npm pack` artifact installed into a fresh consumer: PASS;
- package-root TypeScript import/use: PASS;
- public lifecycle consumer smoke: PASS;
- internal module/subpath leakage checks: PASS;
- invalid Harness startup-before-SQLite and missing Tool mapping negative paths: PASS.

This evidence proves T-013 at its validated descendant. It does not substitute for final exact-SHA full regression after T-014/T-015/T-016/T-017 merge.

## Open mandatory validation

### T-014 synthetic Critical Journeys — NOT_RUN on final merged descendant

Tracking: `kaicreator-mm/domain-harness#32`.

Required exact-SHA execution includes clean install, typecheck, full tests/build, the public-SDK CJ (`Skill -> Tool -> Expr -> Script -> Child Workflow -> Waiting Event`) and the process-kill/recovery suites.

### T-015 Tally cross-repo validation — NOT_RUN

External candidate: `kaicreator-mm/tally@256e3daba951fa6e400c1c73de02221571aafc59`  
Tracking: `kaicreator-mm/tally#54`.

Assets and executable runner exist. Required Build Host run must prove the five primitive categories, stable public contract and preservation of Tally authority boundaries.

### T-016 City Atlas cross-repo validation — NOT_RUN

External candidate: `kaicreator-mm/city-atlas@c58be0945acff58b02bee07c269cc28c8af61f76`  
Tracking: `kaicreator-mm/city-atlas#23`.

Assets and executable runner exist. Required Build Host run must use the same DomainHarness candidate as T-015 and prove the five primitive categories without moving City Atlas privacy/provenance/canonical-state semantics into Runtime.

### Final exact-SHA full regression — NOT_RUN

After T-017 is merged, freeze one `v0.1` candidate SHA and execute at minimum:

```text
npm ci
npm run typecheck
npm test
npm run build
npm pack -w @kaicreator/domain-harness
```

The final regression must include the package consumer smoke, synthetic Critical Journeys, process-kill recovery, cancellation/event races, Child Workflow recovery, expression/script worker constraints and both cross-domain runners.

### Hidden Validation — NOT_RUN

Hidden Validation may run only after the visible candidate SHA is frozen. Preparation rules are in `DomainHarness_v0.1_HIDDEN_VALIDATION_PREP.md`.

## Current decision

```text
Implementation aggregation: READY FOR T-017 CLOSEOUT MERGE
Release qualification: NOT READY
Merge v0.1 -> main: BLOCKED BY MANDATORY VALIDATION
Tag/release: BLOCKED BY MANDATORY VALIDATION
```

No architecture contradiction has been identified. No PRD scope or frozen technology choice was changed to reach this state.
