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
