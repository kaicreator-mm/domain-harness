# CI Issue #261 — local-backend clone prerequisite fix

## Problem

Woodpecker local-backend PR pipelines were terminating before repository validation because `.woodpecker/verify.yaml` required the agent-specific executable `/usr/local/bin/plugin-git` for the clone step.

## Fix

The workflow now uses `skip_clone: true` and performs an explicit host-Git checkout in the verify step:

1. `git init .`;
2. fetch exact `$CI_COMMIT_SHA` from `$CI_REPO_CLONE_URL` with depth 1;
3. checkout detached `FETCH_HEAD`;
4. assert `git rev-parse HEAD == $CI_COMMIT_SHA` before any repository command.

This removes the `plugin-git` binary prerequisite while preserving exact-SHA validation semantics. The repository is public, so the manual HTTPS fetch does not require injected clone credentials.

The workflow also resolves the local-backend shell from `PATH` (`bash`) instead of an agent-specific absolute executable path, and includes `v0.3` in push verification so the integration branch receives configured CI after merges.

## Validation requirement

The repair is complete only when Woodpecker executes the unchanged repository gates (`build`, `lint`, `typecheck`, `test`) successfully on the exact current PR HEAD. After merge to `v0.3`, PRs #256/#262/#263/#265/#266 must be refreshed onto the repaired base and revalidated at their new exact HEADs. Historical evidence bound to their old HEADs must not be reused after refresh.

A pending run on the previous CI-only candidate is historical only. The current candidate must obtain a fresh terminal Woodpecker result; no pending/canceled/older-head status is inherited as validation evidence.

## Follow-up: deterministic gate failures on the repaired pipeline

After the clone repair, exact-head pipelines began executing repository gates and exposed failures that earlier infra errors had masked:

- Pipeline `400/1` (commit `d6f1672`) failed inside `npm ci` with `ETXTBSY` from the `esbuild` postinstall during a Woodpecker server instability window; the checkout mechanism itself (host-Git fetch of the exact SHA plus `HEAD == $CI_COMMIT_SHA` assertion) was proven correct. A later run passed `npm ci` unchanged, confirming the `ETXTBSY` was transient.
- Pipeline `406/1` (commit `ab66124`) then failed deterministically at the `lint` gate: two `@typescript-eslint/no-unnecessary-type-assertion` errors in `packages/domain-harness/src/harness/harness-machine.ts` and `packages/domain-harness/src/runtime/process-command.ts`, inherited from the `v0.3` tree.
- A full local gate sequence additionally exposed one deterministic `test`-gate failure: `tsc -p tsconfig.test.json` rejected `packages/domain-harness/tests/harness/business-harness-machine.test.ts` because `.result` was accessed on the `BusinessHarnessModelResponse` union across two separate `finalResponse()` calls without narrowing.

The same commit that carries this note fixes all three source-level failures. Local `npm ci → build → lint → typecheck → test` passes on the fixed tree; the local pass is diagnostic evidence only. Acceptance remains a truthful `ci/woodpecker/pr/verify = success` on the exact pushed HEAD.

Note: `npm@11.19.0` blocks unapproved dependency install scripts (`better-sqlite3`, `esbuild`) with an `install-scripts` warning; both the local run and pipeline `406/1` show the blocked scripts do not break `build`/`test` on this tree, so no `allowScripts` change is required.
