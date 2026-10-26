# Contributing to DomainHarness / 贡献与 SDK 使用反馈

The SDK v0.10.2 release is tagged and its historical RQ was **CONDITIONAL**. The repository's live `main` may contain **post-release documentation updates**, not changes to the `v0.10.2` tagged implementation.

## Using the SDK? Please report your experience

- [Open or search DomainHarness Issues](https://github.com/kaicreator-mm/domain-harness/issues).
- [Choose an SDK Bug or SDK Usage Feedback form](https://github.com/kaicreator-mm/domain-harness/issues/new/choose).
- [Current English SDK issue and feedback guide](docs/current/en/feedback.md).
- [Contribution triage & version planning](docs/feedback/ISSUE_TRIAGE_PROTOCOL.md) · [Chinese contributing guide](CONTRIBUTING.zh-CN.md).

A useful bug report includes the **SDK version + exact source SHA**, public API/BUILD/Host stage, expected and observed behavior, a minimal **sanitized** reproduction, real command/exit/assertion results or `NOT_RUN`, and an existing-Issue search. If the concern is an OS test-runner problem rather than SDK behavior, do not file it as a DomainHarness product defect.

**Usage feedback is welcome even without a bug:** producer/Tiny/Rich installation friction, incorrect docs, missing Feature/Capability needs, useful Agent workflows, and successful implementations with measurable, sanitized evidence. Group feedback after meaningful milestones. Don't automatically upload app telemetry.

**Privacy:** Issues can be public. Never paste tokens, consumer proprietary source, K permit secrets, customer payloads or private Hidden Validation. Coding Agents require explicit user approval before publishing cross-project materials; draft locally if unsure.

## Scoped contributions

1. Read [AGENTS.md](AGENTS.md), the pinned `.dev-standard/VERSION` and the [English current SDK documentation](docs/current/en/index.md) before touching behavior.
2. Confirm which **source SHA and target version** the proposed fix affects. Do not edit an already released Git Tag.
3. Scope the smallest independent PR. Documentation corrections can usually merge to `main` with a docs-only review; behavior/API changes require Product/L2/Task DAG authority for a future version.
4. Test only affected risk and preserve real exit status; `PR PASS` is not `Release PASS`. Open a bug/feedback Issue first when actual use reveals a problem, and link the eventual fix PR.
5. Review independently by exact SHA, write P0/P1/P2, update docs and close the Issue with verified user-visible resolution/version.

For external coding Agents use [domain-harness-sdk Skill](.agents/skills/domain-harness-sdk/SKILL.md) and the [English installation guide](docs/current/en/skill.md). For documentation changes update **both** language trees `docs/current/{zh-CN,en}/` and run `node docs/current/validate.mjs`; do not silently rewrite frozen Product/L2/evidence.
