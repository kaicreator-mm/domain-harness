# Consumer SDK feedback guide for Agents

When a real downstream integration exposes a bug or unexpected successful pattern, route it to **kaicreator-mm/domain-harness**; give the consuming project its own separate task/Issue if changes are required there.

## Classification first

| Observation | Channel | Minimum evidence |
| --- | --- | --- |
| Reproducible SDK runtime/BUILD/contract bug | `SDK Bug Report` GitHub Issue form | Exact SDK SHA, selected module identifiers (safe), behavior gap, steps, focused failing ID, actual EXIT, minimum sanitized test |
| Incorrect manual/API example | SDK Usage Feedback → `documentation` | Page URL/heading, source API check, expected correction |
| Missing operation or useful feature | SDK Usage Feedback → `feature-request` | Workflow goal, alternatives, boundaries and value; request Product/L2 in future version, **not** unscoped patch |
| Integration friction / ambiguity | SDK Usage Feedback → `integration-friction` | Which phase, confusing contract, failed approach and improvement |
| Successful use or repeatable adoption pattern | SDK Usage Feedback → `success-story` | Tiny/Rich/Host/Package pattern, what was effective, redacted metrics or verification |
| OS pressure/runner capacity with no SDK evidence | Local environment/consumer ticket, not SDK product bug | Actual OS status, failing process, exit; do not demand v0.10.2 source change |

## Required privacy and dedup gates

1. Search GitHub open and closed Issues for relevant error code / code path; comment on an existing one if matched.
2. Reduce to the smallest *public-safe* reproduction. **Do not expose proprietary downstream source, customer data, tokens, raw production logs, K/permit secrets, private Hidden Oracle/fixtures or install paths.** Use fake/test values; redact package payloads.
3. Explain whether tests were **run and passed**, failed with real exit, or **NOT_RUN**. Never infer a PASS from a docs command or copied console transcript.
4. Draft the Issue for the human/user; obtain **explicit approval to publish** any cross-project data to this public repo. With no approval, stop at draft; do not auto-report.
5. Only create an Issue through authenticated GitHub tooling after authorization; record the returned link/number; link it to the downstream task if approved.
6. End of meaningful integration milestone: optionally collect *one* structured feedback Issue summarizing success, friction and valuable reusable patterns. Avoid per-request chatter or silent background telemetry.

## Safe copyable payload

~~~text
SDK Release / exact SHA:
Consumer source SHA (optional/public-safe):
Selected packages / Host mode (safe identifiers):
Stage: BUILD | load | send | query | subscribe | effect | Host | packaging | docs
Category: SDK defect | integration friction | docs | feature request | success
Expected behavior:
Observed behavior:
Minimal sanitized reproduction:
Actual command + exit / assertion ID (or NOT_RUN):
Security/privacy scrubbed? YES/NO
Existing issue search/link:
Suggested bounded fix or follow-up:
Permission to publish? Explicit YES required
~~~

**Route feedback to improvement:** once confirmed, record severity and impact, source/ABI evidence, linked impacted consumers, and disposition to Product/L2, backlog Task DAG or docs patch. Do **not** retroactively edit the frozen v0.10.2 Product or apply its Full exception to later versions. SDK feedback collection is optional project tooling and **must never become compulsory Microkernel telemetry**.

See https://github.com/kaicreator-mm/domain-harness/blob/main/docs/feedback/SDK_USAGE_FEEDBACK.md for user guidance and the two Issue forms under `.github/ISSUE_TEMPLATE/`.
