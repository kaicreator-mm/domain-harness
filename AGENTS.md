# AGENTS.md

This project follows the immutable `kaicreator-mm/ai-development-standard` revision recorded in `.dev-standard/VERSION`.

## Read order

1. Read `.dev-standard/VERSION`.
2. Read `.dev-standard/PROJECT_OVERRIDES.md`.
3. Read the pinned standard's `AGENTS.md`.
4. **For any DomainHarness Product/L1, L2, Task DAG, SDK/Package/Host change or new version**, read `docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md` and its freeze/amendment status. This project-wide baseline survives version transitions; chat or a version-specific Issue does not replace it.
5. For lifecycle work, read `standards/DEVELOPMENT_WORKFLOW.md`.
6. For repository structure/docs/tests, read `standards/PROJECT_STRUCTURE.md`, `DOCUMENTATION_STANDARD.md`, `TESTING_STANDARD.md`, and `REPOSITORY_STANDARD.md` as relevant.
7. For validation/release work, read `VALIDATION_STANDARD.md` and `RELEASE_STANDARD.md`.

## Project rules

- GitHub repository state, commit, Issue, PR and CI are execution facts; chat history is not.
- Do not change frozen product/architecture semantics to make implementation or CI easier.
- All new version Product/L2 documents MUST briefly declare whether cross-version principles CV-01..12 are inherited unchanged or explicitly amended; do not silently drop them or re-create build-time validation in the SDK. A documented intention does not bypass an unamended frozen Product requirement.
- Use the commands and project-specific boundaries in `.dev-standard/PROJECT_OVERRIDES.md`.
- Formal Stage/Task outputs that become downstream dependencies require a remote checkpoint.
- Never report a required gate as PASS when it was not executed.

Keep this file short. Project-specific detail belongs in `PROJECT_OVERRIDES.md`; product and architecture facts belong in `docs/`.

## Current released-line navigation: v0.10.2

For **users or coding Agents** targeting the already qualified v0.10.2 source, start at [docs/v0.10.2/README.md](docs/v0.10.2/README.md), then [architecture diagrams](docs/architecture/V0102_RUNTIME_DIAGRAMS.md), [public API quick reference](docs/manual/V0102_API_CHEATSHEET.md), [Agent task playbook](docs/agents/V0102_PLAYBOOK.md) and [copyable prompts](docs/agents/V0102_TASK_TEMPLATES.md). Prefer current exported code and real example fixtures over historical v0.1/v0.3 guide text.

**Immutable boundary:** `refs/tags/v0.10.2` pins `cee14399d9d0af4e20e34b9111861b16a465b690`. User/Agent handbook changes are **post-release docs-only PRs**; they do not change tagged source or inherit a new runtime/RQ. Record real command exits; v0.10.2 RQ is **CONDITIONAL** under exact-SHA-only exception (historical Full EXIT1/root NOT_RUN), not a repeatable waiver for future versions. Never infer an npm registry release from the Git tag or the `0.10.2-rc.0` package manifests. Keep product/build/host/agent responsibilities separate; no OS RAM/vendor prerequisites are introduced by release incident logs.
## Consuming the SDK / reporting genuine feedback

- When implementing DomainHarness SDK integration in this or a downstream repo, prefer the reusable [domain-harness-sdk Skill](.agents/skills/domain-harness-sdk/SKILL.md) and [installation guide](docs/agents/V0102_SDK_SKILL_INSTALL.md). Read the actual tagged SDK exports instead of inferring unpublished registry packages.
- Suspected SDK defects found while using it should be **triaged and proposed as Issues** in `kaicreator-mm/domain-harness` with exact source SHA, reproducible safe evidence and duplicate search. Integration friction, documentation corrections, feature needs and successful use cases belong in [SDK usage feedback](docs/feedback/SDK_USAGE_FEEDBACK.md).
- Never automatically publish downstream code, proprietary data, raw runtime logs, secrets or private held-out tests. Agents must obtain explicit authorization to post any consumer information to public GitHub. Do not add Microkernel telemetry or treat OS-only test-runner failures as SDK bugs.

## Documentation language and routing (current v0.10.2)

**Read English first in Agent sessions:** [docs/current/en/index.md](docs/current/en/index.md) → [architecture](docs/current/en/architecture.md) → [SDK API](docs/current/en/sdk.md) → [Agent workflow](docs/current/en/agent.md) and [Skill](docs/current/en/skill.md). Human-facing default and support instructions are Chinese: [docs/current/zh-CN/index.md](docs/current/zh-CN/index.md).

**Two-language maintenance contract:** every actively maintained current topic MUST have a meaning-equivalent counterpart at `docs/current/zh-CN/<topic>.md` and `docs/current/en/<topic>.md`. Update both in the **same PR** and check paired topics, reciprocal language links and valid local paths. Code identifiers, API names, Git SHA, literal test exits and commands must match exactly. Preserve historical frozen Product/L2/validation records without rewriting them for translations. For routine docs, check links/source semantics, not mandatory Full/Hidden regression.

Machine-facing `AGENTS.md`, `llms.txt`, canonical `.agents/skills/domain-harness-sdk/SKILL.md` and its metadata remain **English**, to maximize Agent consistency; the complete human-facing Skill usage is paired at [English Skill guide](docs/current/en/skill.md) and [Chinese Skill guide](docs/current/zh-CN/skill.md). An Agent producing a user-facing project document must default to Chinese unless the user requests otherwise.
