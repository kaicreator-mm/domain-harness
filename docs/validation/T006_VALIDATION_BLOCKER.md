# T-006 Validation Blocker

Status: BLOCKED only for real-package execution; implementation may continue.

The current ChatGPT execution environment cannot resolve GitHub/npm hosts, so the real `jsonata@2.2.2` and Worker integration suite cannot execute here.

Required Build Host checks on the exact merged descendant:

1. install canonical npm dependencies and lockfile;
2. run `npm run typecheck`, `npm test`, `npm run build`;
3. prove expression-local registration shadows built-in `$now()` and `$millis()` with the persisted logical clock;
4. prove `$random()` / `$eval()` are rejected and normalized to `expression_error`;
5. prove strict-Boolean route evaluation;
6. prove hard Worker timeout and AbortSignal termination;
7. prove JSON-only + serialized-size boundaries and Worker resource limits.

If deterministic clock shadowing fails with the selected JSONata 2.2.2 implementation, do not fall back to wall-clock time. Treat it as an implementation blocker for T-006/recovery semantics and preserve the frozen JSONata language choice.
