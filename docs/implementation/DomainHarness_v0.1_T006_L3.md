# DomainHarness v0.1 — T-006 L3 Implementation Evidence

**Task:** T-006 ExpressionRuntime + deterministic clock  
**Status:** FROZEN FOR IMPLEMENTATION  
**Frozen Inputs:** v0.1 PRD + L2 Architecture + Task DAG  

## 1. Tests First

Required behavior:

1. `$random` and `$eval` are rejected before evaluation.
2. `$now()` returns the persisted logical timestamp as ISO-8601 UTC.
3. `$millis()` returns the exact persisted logical timestamp in epoch milliseconds.
4. Re-evaluating the same expression with the same input and logical timestamp produces the same result.
5. Route expressions must return the literal JSON Boolean type; truthy strings/numbers are rejected as `expression_error`.
6. hard timeout terminates the Worker and reports `timeout`.
7. AbortSignal termination reports `cancelled`.
8. input/output must be JSON-only and respect serialized-size bounds.
9. Worker receives `env: {}` and V8 `resourceLimits`.
10. optional-argument forms of `$now(...)` are rejected in v0.1 because Runtime clock replacement only guarantees the frozen deterministic zero-argument clock contract.

## 2. Contract / Interface

```ts
ExpressionRuntime.evaluate(expression, scope, logicalTime, options?)
  -> Promise<JsonValue>

ExpressionRuntime.evaluateBoolean(expression, scope, logicalTime, options?)
  -> Promise<boolean>
```

`logicalTime` is an ISO timestamp previously persisted by the Runtime (Step `started_at`, accepted-event timestamp, or workflow-frame decision time as defined by L2).

The Runtime never lets an expression read Host environment variables or perform external I/O.

## 3. Core Implementation

Execution boundary:

```text
main Runtime
→ static JSONata AST policy inspection
→ JSON-size check
→ fresh Worker
→ env: {}
→ JSONata 2.2.2+
→ register deterministic now/millis functions
→ evaluate
→ validate JSON-only result + size
→ post normalized JSON string
→ terminate Worker
```

The parent owns the hard timeout and AbortSignal. JSONata's own evaluator guardrail, when available, is defense-in-depth and not the durable timeout authority.

### Deterministic clock

The Worker registers expression-local functions named `now` and `millis` so the Runtime-owned logical timestamp shadows the library functions for the evaluation.

v0.1 supports only the frozen deterministic forms:

```text
$now()
$millis()
```

Calls to `$now` with formatting/timezone arguments are rejected by policy rather than silently producing wall-clock or altered semantics.

## 4. Failure Handling

| Failure | Runtime result |
|---|---|
| forbidden `$random` / `$eval` | `expression_error` |
| JSONata parse/evaluate error | `expression_error` |
| non-Boolean route result | `expression_error` |
| timeout | `timeout` |
| AbortSignal | `cancelled` |
| non-JSON/oversized input or output | `expression_error` |
| Worker abnormal exit | `expression_error` |

No generic retry is introduced.

## 5. Evidence / References

- JSONata embedding API: `evaluate`, bindings, `registerFunction`, `ast()`.
- JSONata date/time contract: `$now()` and `$millis()` share one evaluation timestamp.
- JSONata 2.2 type definitions expose evaluator guardrail options and AST nodes.
- JSONata security advisories published in 2026 require 2.2.1+ for expression execution safety and 2.2.0+ for `$toMillis` resource-exhaustion fix; v0.1 pins the compatible minimum to 2.2.2.
- Node Worker Threads provide `env`, `resourceLimits`, and `worker.terminate()`; resource limits are defense-in-depth rather than a hostile-code sandbox.

## 6. Escape Hatch

If real JSONata 2.2.2 contract tests prove expression-local registration cannot shadow built-in `$now/$millis`, do **not** fall back to uncontrolled wall-clock behavior. Keep this Task blocked, open an architecture implementation issue, and evaluate a deterministic adapter that preserves the frozen JSONata language and clock contract without changing product scope.
