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

## Current SDK / language routing

**Coding/review Agents → English:** [docs/current/en/index.md](docs/current/en/index.md) → [architecture](docs/current/en/architecture.md) → [SDK](docs/current/en/sdk.md) → [Agent workflow](docs/current/en/agent.md). The installable [domain-harness-sdk Skill](.agents/skills/domain-harness-sdk/SKILL.md) implements this workflow.

**User-facing explanations → Chinese:** [docs/current/zh-CN/index.md](docs/current/zh-CN/index.md). When writing for users, prefer Chinese unless they request English. Current docs form **15 matched topic pairs** in `docs/current/{zh-CN,en}/`; update both languages in one PR, check reciprocal links and equivalent public APIs/commands, and run `node docs/current/validate.mjs` when available. Machine config (`AGENTS.md`, `llms.txt`, canonical `SKILL.md`) stays English; its human usage has paired topic docs.

**Release boundary:** `refs/tags/v0.10.2` stays at `cee14399d9d0af4e20e34b9111861b16a465b690`. RQ **CONDITIONAL**; historical Full `EXIT1` and root `NOT_RUN` remain true under an exact-source, non-precedential exception. Package manifests `0.10.2-rc.0` do not establish registry publication. Node24 is the physical qualification lane; no OS vendor/RAM requirement.

## SDK issue and feedback discipline

Search existing issues first. Classify reproducible SDK bugs vs consumer/Host/OS incidents; provide sanitized minimal reproduction, exact SHA and literal EXIT (or NOT_RUN). See [English feedback](docs/current/en/feedback.md) and [Chinese feedback](docs/current/zh-CN/feedback.md). Agents must get **explicit user permission before publishing consumer data** to public GitHub. Do not add automatic Microkernel telemetry, invent reviewer independence or run Full/Hidden simply for docs-only changes.
