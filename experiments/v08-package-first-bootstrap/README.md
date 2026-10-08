# Issue #938 — Isolated Package-first self-bootstrap spike

This is a **clean-room, deletable toy architecture probe**, not the production SDK, a Domain App, a v0.7 modification, a release gate, or v0.8 Product/L1/PRD/L2 authorization.

## Fresh checkout / one-command check

From the repository root with Node.js >=22:

```sh
node --test experiments/v08-package-first-bootstrap/tests/spike.test.mjs
```

Runnable sample: `node experiments/v08-package-first-bootstrap/demo.mjs`. No install, LLM, network, v0.7 source, extra runtime dependencies, or global registries.

## What is real, and what is deliberately tiny

1. Prelinked `bootstrap.mjs` has only the pinned **Kernel manifest Git-blob SHA-1** and local byte/integrity loader. It verifies **both** manifest and executable module content. It calls an implementation from the loaded Kernel's `pkg.link@1` Component; only that Kernel-supplied implementation validates, links, seals, and activates subsequent Packages. The loader is not domain-specific. `pins.json` contains exact SDK and alternative Business Package manifest pins supplied to the caller, not floating aliases. `generate-fixtures.mjs` is a **developer-only** fixture/pin regenerator, never called by bootstrap.
2. A Package owns semantic `definitionId`, exact Package `id/version`, Component definitions, exact `requires/provides` operation contracts, concrete implementation IDs, selected Provider refs and byte digests. Assembly identities and derived Capability Graph are **computed**, not independently authored. No implicit `latest`, unordered winner, implicit default, or mutable post-activation registry.
3. Three **logical** layers are exercised (Kernel -> SDK -> one Business), not a universal three-bundle architectural mandate. `kernel` and `sdk` contain both semantic and tool Components. `approval` and `learning` swap as alternative Business Packages without changing Kernel/SDK code. SDK workflow invokes loaded rule, business action, effect and state Components only through declared operation-scoped `ctx.invoke`. Node eligibility is constrained to a finite set; 0 -> WAIT, 1 -> select, N -> stable `(priority, node.id)` ordering; stop after at most 8 steps, completion requires declared `endWhen`.
4. The toy state has a single revisioned `state.commit@1` writer; denied commit leaves revision unchanged. `effect.record@1` stores in-process receipts tied to exact Assembly digest; UNKNOWN/CANCELLED cause explicit stop, not success or automatic retry. SUCCESS receipt is written **after** the in-memory commit. This is NOT the production effect-journal ordering, durable effect intent, replay, recovery, crash consistency or Central Admission parity. The generator is not an untrusted code sandbox: local Package JS is **trusted executable code** after pin verification, and its ambient Node permissions are not constrained. Do not use this prototype to load third-party code.
5. Business version/manifest drift produces a **new sealed Assembly** and different declared routing; replacing business executable bytes with an explicitly updated pin changes the actual outcome. The old occurrence and receipts remain bound to their own exact identities. The exposed assembly description is deeply frozen and rebind is refused.

## Explicit limitations

- The Package format, operation scopes, hash shape, workflow DSL, single-writer sketch and effect receipts are **experimental and non-normative**.
- A trusted local caller chooses the expected SDK/Business package pin. Build/deployment must enforce source trust; a voluntarily repinned malicious module can execute ambient Node code. No signatures, sandbox, ACL policy, host secrets, multi-tenant scopes, or cross-host portability were tested.
- No durable filesystem journal, retries across process restarts, idempotent recovery, real out-of-process tool, concurrency, cancellation race, external system, mobile/Expo/Hermes or v0.7 regression/behavioral equivalence is claimed.
- The demo intentionally handles one occurrence per runtime object. Independent repeated commands need new occurrence/operation IDs in production; the stable toy effect key refuses a duplicate dispatch rather than silently replaying it.
- `generate-fixtures.mjs` is for controlled experimentation only. Running it after altering Kernel rewrites the trusted root pin; it is **not** a secure verification mechanism for untrusted packages.

## Decision posture

Gate A is demonstrated by an actual clean GitHub-hosted Linux Build Host on exact commit `21382c66eb1c05b0d21e9aa4006f0b1b66e3bc86`: **19/19 PASS**, including an independent derived Capability dependency-cycle falsification test, with a completed approval + learning smoke demonstration. That is **not** the project's designated Windows/ECF Build Host. Gate B, v0.7 behavioral parity, release qualification and genuinely independent read-only review are separate and unexecuted. See `evidence/decision.md` and the final #938 exact-SHA terminal for the latest test run.

## Follow-up #938 bounded repair — composition, Component Workflow, receipt diagnosis

- A controlled fourth package can be linked **only** through the Business Package's exact declared dependency, with a caller-supplied `dependencyPins` map. The bounded loader checks the dependency closure before activation; unlisted dependencies, duplicate IDs, orphans and cycles fail closed. The three-package cases remain unchanged. No network or dynamic registry was added.
- Workflow definition now resides inside the Business Package's `workflow.definition@1` **Semantic Component**, exposed as `business.workflow@1.resolve` and consumed by SDK Workflow through its scoped capability context. Kernel refuses missing/malformed or top-level manifest workflow shortcuts. Assembly pins that component's provider and package bytes.
- **P2 diagnostic, not a production fix:** the toy commits a SUCCESS state revision before effect receipt. An injected receipt failure leaves revision=1 and zero receipts; redispatch after a successful run can increment revision again before duplicate-receipt refusal. Production Gate B must design/test admission + journal-first intent, commit/receipt ordering, idempotency/recovery and UNKNOWN outcomes as one authority path; this spike does not claim parity.
