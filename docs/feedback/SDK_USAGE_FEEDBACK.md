# SDK usage feedback and bug reports / SDK 使用反馈与提 Issue

**Project:** [kaicreator-mm/domain-harness Issues](https://github.com/kaicreator-mm/domain-harness/issues/new/choose). This workflow applies when another product integrates DomainHarness as an SDK. Feedback is welcome both when **something fails** and when **a real integration succeeds but is difficult or could be improved**.

## When to open what?

| What you observed | Action | Owner |
| --- | --- | --- |
| Reproducible defect in `buildV10App`, `load`, selected K governance, public Facade, Host CAS, exported ABI/distribution | File **SDK Bug Report**; minimal reproduction and exact source SHA | DomainHarness source/SDK |
| Documentation inconsistency, confusing API/ownership, missing integration step | File **SDK Usage Feedback** with `documentation` / `integration friction` | DomainHarness docs/design |
| Useful missing SDK/Domain Package capability | File **SDK Usage Feedback** with `feature request`; decide next Product/L2/DAG before implementation | Future scoped version |
| Successfully built Tiny/Rich/producer/app with an unexpected useful pattern | File **SDK Usage Feedback** with `success story` and sanitized positive proof | Docs/examples/learning backlog |
| Pure OS memory pressure/CI child spawn unrelated to SDK functional behavior | Track in the consumer/build environment, **not** a DomainHarness product Bug | OS/CI owner |
| Uncertain responsibility | First follow [troubleshooting](../manual/V0102_TROUBLESHOOTING.md); submit after minimal triage as feedback if still ambiguous | Joint triage |

GitHub issue forms (on `main`): `.github/ISSUE_TEMPLATE/sdk-bug-report.yml` and `.github/ISSUE_TEMPLATE/sdk-usage-feedback.yml`. If the GitHub form is unavailable, use the same fields in an ordinary Issue. **Do not automatically open one Issue for every error trace or every Agent turn.**

## Minimal information

Required: **DomainHarness version and exact SHA**, actual affected package/root/API, producer vs runtime vs Host stage, expected vs actual, sanitized reproduction or scenario, true command/exit/failure ID if run (`NOT_RUN` if not), consumer Node version/Host mode, and whether the issue reproduces without private data. Helpful optional data: related downstream issue link (only if approved to disclose), stable typed error code, privacy-cleared acceptance evidence and a proposed fix.

**Privacy and authority gate:** GitHub Issues in this repository may be publicly visible. Remove credentials, client information, private consumer package source, raw K permit/document secrets, private Hidden Validation material, production request bodies, proprietary prompts and real customer datasets. When an Agent is submitting **on someone else's project’s behalf**, it must show the sanitized draft and get explicit user approval before publishing to this repository. If the user declines, keep it as a local note.

**Deduplicate:** Search existing open and closed Issues by error code, module name and symptom first. Add a focused comment to an existing Issue if it matches, rather than filing duplicates. Keep unrelated concerns separate.

## Example: short SDK bug / Issue

~~~text
Title: [SDK Bug] Query refuses an explicitly authorized two-B target

SDK version/SHA: v0.10.2 / cee14399d9d0af4e20e34b9111861b16a465b690
Consumer / Host: private JS app / Node24 / Rich SQLite
Public API: @kaicreator/domain-harness-microkernel.query
Selected roles: K Primary, S Primary, two B (sanitized identifiers)
Expected: authorized target query returns the proper business snapshot
Actual: typed QUERY_READ_FAILED / wrong target, reproducible on isolated fixture
Minimal repro: <public-safe test file or clear exact steps>
Actual test command / EXIT / failing ID: <real receipt or NOT_RUN>
Impact: affects read visibility, no production credential disclosed
Possible duplicate: <searched link/result>
Permission to publish: YES (confirmed by user before creating Issue)
~~~

This is an **illustrative report**, not a claim that the released SDK has this bug.

## Continuous improvement, without Microkernel telemetry

Feedback is converted to an evidence-first loop:
1. **Intake**: bug, integration friction, documentation gap, feature, success story. Include exact source identity.
2. **Triage**: separate product defect from consumer misuse, optional Host configuration or OS problems. Identify verified P0/P1/P2 vs UNKNOWN, actual reproduction, duplicates and affected paths.
3. **Decide**: docs-only repair, focused current-line patch (if version policy permits), or **prospective** Product → L2 → Task DAG Issue for a new version. File observed use-case gaps as *needs*, not presumed solution implementations.
4. **Execute and validate**: use independent small PR/review and smallest relevant physical proof; link the consumer feedback Issue with the implementation Issue/PR.
5. **Close the loop**: write back resolved version/SHA, test/evidence, known caveats and documentation updates; optionally notify the reporter through the Issue. Adoption and recurring pain points can later be aggregated by Tally/task-meta **only through a separately authorized integration**, not a hidden SDK callback.

Do **not** send usage, prompts, logs or API keys automatically. Do not add an SDK-level background reporter or make Microkernel depend on GitHub/Tally/task-meta. Agent-assisted issue filing is an **opt-in, user-approved workflow**.

For Agents: use [the SDK skill](../../.agents/skills/domain-harness-sdk/SKILL.md), [feedback reference](../../.agents/skills/domain-harness-sdk/references/FEEDBACK.md) and [task templates](../agents/V0102_TASK_TEMPLATES.md).
