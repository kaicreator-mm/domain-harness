# T-009 CI Revalidation

This document records post-waiver CI revalidation for DomainHarness v0.3 T-009 / Issue #227.

## Context

T-009 was implemented from fixed baseline `v0.3@be65e41e652d70c17ca10af66bc5f25abed2658a` and merged by PR #254 while CI infrastructure was unavailable. The implementation PR exact HEAD was `345cc8445dd7dd591dd246bb95c3aa207283de64` and the merge commit was `fc5b0490ef23c8f0d1aef9a9c6f3b7f4efe82340`.

The original Woodpecker PR status later resolved as failure while the CI service was impaired. That result must not be treated as a code PASS or as final validation evidence.

## Revalidation scope

This follow-up PR exists only to run the restored PR verification pipeline against the current integrated `v0.3` branch, which already contains T-009 together with subsequently merged Wave A work.

Required evidence:

- restored `ci/woodpecker/pr/verify` completes successfully on this PR exact HEAD;
- repository typecheck/tests exercised by the PR verify pipeline complete successfully;
- no T-009 code or architecture scope is expanded solely to make CI pass;
- any genuine failure is fixed through a separate minimal code change in this branch and documented before merge.

Real Node/Expo crash/restart durability remains deferred to T-022/T-023 exactly as defined by the v0.3 Task DAG. This revalidation does not claim real host crash/restart evidence.
