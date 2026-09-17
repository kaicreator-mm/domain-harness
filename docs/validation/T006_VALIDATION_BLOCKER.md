# T-006 Validation Blocker — RESOLVED / SUPERSEDED

**Historical status:** this file originally tracked an environment-only blocker before real JSONata/Worker execution was available. It is retained only as validation history and is **not a current blocker**.

## Resolution

Real Build Host validation later exercised the selected JSONata 2.2.2 / Worker implementation through the package suites and release qualification evidence. The verified behavior includes:

- deterministic `$now()` / `$millis()` binding from the Runtime logical clock;
- `$random()` / `$eval()` rejection;
- strict-Boolean route evaluation;
- Worker timeout / AbortSignal termination;
- JSON-only and serialized-size boundaries;
- Script/Expression focused suites and plain-ESM host execution.

Current validation truth belongs to `docs/validation/DomainHarness_v0.1_VALIDATION_REPORT.md` and exact-SHA GitHub Issue evidence. Do not use this historical blocker file to infer current release status.
