# DomainHarness v0.1 — Validation Report

**Report stage:** Version Closure preparation  
**Version integration baseline after T-017:** `bfbce9f11776d7e2c12af6f267b5012951e9c5f9`  
**Release qualification:** BLOCKED / NOT COMPLETE

This report distinguishes repository integration from release qualification. No unexecuted gate is marked PASS.

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

### T-014 synthetic Critical Journeys / crash recovery — PASS

GitHub Issue `kaicreator-mm/domain-harness#32` is closed after Build Host validation on exact merged `v0.1` SHA `22969fcca156ab47dfafff259490affed9d82baa`:

- clean `npm ci`: PASS, 0 vulnerabilities;
- `npm run typecheck`: PASS;
- `npm test`: PASS — 112/112;
- `npm run build`: PASS;
- `critical-journeys.test.ts`: 1/1;
- `process-crash-recovery.test.ts`: 8/8 using real child-process kills across one SQLite file;
- `recovery-lifecycle.test.ts`: 8/8;
- `script-executor.test.ts`: 7/7;
- `expression-runtime.test.ts`: 10/10;
- CJ-01 `Skill -> Tool -> Expr -> Script -> Child Workflow -> Waiting Event -> completed`: PASS with AI/Tool each invoked exactly once;
- idempotent replay, non-idempotent `interrupted`, completed-output reuse, definition-lock and running-only `resume()` behavior: PASS.

T-013 and T-014 evidence prove their validated candidates. They do not substitute for the final closure candidate regression and cross-domain gates.

## Open mandatory validation

### T-015 Tally cross-repo validation — NOT_RUN

External candidate: `kaicreator-mm/tally@256e3daba951fa6e400c1c73de02221571aafc59`  
Tracking: `kaicreator-mm/tally#54`.

Assets and executable runner exist. Required Build Host run must prove Skill + host Tool + Expr + Child Workflow + waiting event, stable DomainHarness public contracts, exactly-once fake AI/Tool calls for the validation run, and preservation of Tally Active TaskDAG / CompletionContract / verification / human-authority boundaries.

### T-016 City Atlas cross-repo validation — NOT_RUN

External candidate: `kaicreator-mm/city-atlas@c58be0945acff58b02bee07c269cc28c8af61f76`  
Tracking: `kaicreator-mm/city-atlas#23`.

Assets and executable runner exist. Required Build Host run must use the same DomainHarness candidate as T-015, prove the required primitive categories, and confirm City Atlas canonical-state, provenance, privacy and Task/API semantics remain outside Runtime.

### Final closure-candidate full regression — NOT_RUN

After version integration reaches `main`, freeze that exact repository candidate SHA and execute at minimum:

```text
npm ci
npm run typecheck
npm test
npm run build
npm pack -w @kaicreator/domain-harness
```

The final regression must include the clean package-consumer smoke, synthetic Critical Journeys, process-kill recovery, cancellation/event races, Child Workflow recovery, expression/script worker constraints, and successful execution of both cross-domain runners against the same DomainHarness candidate.

### Hidden Validation — NOT_RUN

Hidden Validation may run only after the visible candidate SHA is frozen and the visible entry conditions pass. Preparation rules are in `DomainHarness_v0.1_HIDDEN_VALIDATION_PREP.md`.

## Current decision

```text
Task implementation aggregation: COMPLETE (T-001..T-017)
Visible package/CJ validation: PASS through T-014
Version branch integration to main: READY
Cross-domain validation: NOT_RUN (Tally #54, City Atlas #23)
Final exact-SHA regression: NOT_RUN
Hidden Validation: NOT_RUN
Release qualification: NOT READY
Tag/publish/release: BLOCKED BY MANDATORY VALIDATION
```

Merging the completed version branch into `main` establishes the repository integration baseline only; it does not certify or publish v0.1. No architecture contradiction has been identified, and no PRD scope or frozen technology choice was changed to reach this state.
