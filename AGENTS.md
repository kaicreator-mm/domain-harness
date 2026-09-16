# AGENTS.md

This project follows the immutable `kaicreator-mm/ai-development-standard` revision recorded in `.dev-standard/VERSION`.

## Read order

1. Read `.dev-standard/VERSION`.
2. Read `.dev-standard/PROJECT_OVERRIDES.md`.
3. Read the pinned standard's `AGENTS.md`.
4. For lifecycle work, read `standards/DEVELOPMENT_WORKFLOW.md`.
5. For repository structure/docs/tests, read `standards/PROJECT_STRUCTURE.md`, `DOCUMENTATION_STANDARD.md`, `TESTING_STANDARD.md`, and `REPOSITORY_STANDARD.md` as relevant.
6. For validation/release work, read `VALIDATION_STANDARD.md` and `RELEASE_STANDARD.md`.

## Project rules

- GitHub repository state, commit, Issue, PR and CI are execution facts; chat history is not.
- Do not change frozen product/architecture semantics to make implementation or CI easier.
- Use the commands and project-specific boundaries in `.dev-standard/PROJECT_OVERRIDES.md`.
- Formal Stage/Task outputs that become downstream dependencies require a remote checkpoint.
- Never report a required gate as PASS when it was not executed.

Keep this file short. Project-specific detail belongs in `PROJECT_OVERRIDES.md`; product and architecture facts belong in `docs/`.
