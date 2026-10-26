# SDK Issue triage and continuous improvement / 使用反馈治理

This is a **documentation/process aid for maintainers**, not a change to DomainHarness runtime, ABI, ADS pinned version, frozen v0.10.2 release or a promise of continuous background monitoring.

## 1. Intake contract

Source: [GitHub Issue selection](https://github.com/kaicreator-mm/domain-harness/issues/new/choose). Select **SDK Bug Report** when reproducible SDK behavior is wrong; select **SDK Usage Feedback** for migration pain, confusing docs, needs, successful integrations and uncertain ownership.

Every accepted report identifies a real SDK **exact commit SHA** (tag alone may be ambiguous for development branches), affected **public Package/Capability/API**, selected **K/S/B/C** scope if relevant, caller/Host mode, **expected vs actual** and **literal test evidence or NOT_RUN**. Links to private consuming projects are optional and must not reveal unauthorized details.

## 2. Review and decision stages

| Stage | Responsible | Output |
| --- | --- | --- |
| Receive / deduplicate | Issue triager or assigned Agent | Existing Issue reference or one new sanitized Issue |
| Classify | Source-aware reviewer | SDK defect / BUILD contract / Host integration / consumer misuse / docs / OS runner / feature / success |
| Impact | Product or source owner | Actual severity (P0/P1/P2 or UNKNOWN), affected SHA, public ABI and impacted use case |
| Resolve | Assigned owner | Docs PR / code Issue+PR / future Product→L2→Task DAG, with explicit scope |
| Verify | Separate reviewer where appropriate | Exact SHA, relevant positive/negative tests, actual EXIT, no invented PASS |
| Close feedback loop | Issue owner | Link PR/decision, fixed version or reason not applicable; notify through Issue comments if appropriate |

**No bug from evidence-free symptoms alone.** If a Host has insufficient memory/pagefile/process slots, distinguish the runner failure from real SDK assertions. Conversely, an SDK defect with a minimal repro should get an Issue even if downstream discovers it before DomainHarness's own tests.

## 3. What to measure (explicit opt-in, no secret collection)

For a future analysis, aggregate **from voluntary, public-safe GitHub Issues**, not from SDK runtime telemetry:

- Issue counts by SDK SHA, API stage, category, severity and **duplicate rate**.
- Time to first triage, time from reproduction to fix and reopened Issue rate.
- Common setup friction/unclear permission boundaries; improvements to docs/sample packs.
- Positive verified use cases (Tiny, Rich, real producer, selected Packages) and reuse across projects.
- Evidence gaps: ¦NOT_RUN¦, missing repro or ambiguous environment classification.

Avoid identifying consumer users, enumerating private project names, storing prompts or analyzing secret raw logs. A future **task-meta/Tally consumption** of structured GitHub issue metadata requires its **own Product/authority work** and user permission; no implicit SDK→Tally pipeline exists.

## 4. Prioritization / release handoff

- **P0/P1 real SDK defect**: create a precise GitHub Issue, add narrow reproduction and domain affected, prioritize separately under current project standards. Repair in an authorized branch; do not silently rewrite a frozen tag.
- **P2 or docs fix**: group independent changes by concern, scoped PR review/CI; no gratuitous whole repo regression for docs.
- **Product feature**: collect requirement and evidence; schedule for a **future** Product/L2/DAG version, rather than implementing a feature directly from comments.
- **Positive integration pattern**: link to a reusable public-safe tutorial/fixture or sample, with user permission.
- **Consumer/operator issue**: redirect to consuming project/Host team and record a short explanation; don't corrupt DomainHarness product backlog.
- **No action/duplicate**: close transparently with rationale and links, not as a claimed fix.

Future releases must independently satisfy their own Full/Hidden/Critical and release qualification; the v0.10.2 `EX-v0.10.2-R01-FULL-OS-01` exception does not propagate.

## 5. Agent behavior

A coding/review Agent helping users should **propose draft content first**, search existing public Issues, scrub data and ask permission **before** opening a cross-project Issue. It may create an Issue only when the user has authorized publication. It may add evidence to an existing Issue after the same privacy review. It must return a real GitHub URL/number only after the API confirms success.

For practical integration use the [canonical SDK Skill](../../.agents/skills/domain-harness-sdk/SKILL.md); for human instructions the [feedback page](SDK_USAGE_FEEDBACK.md).
