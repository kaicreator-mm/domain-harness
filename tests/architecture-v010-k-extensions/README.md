# v0.10 K-Extension feasibility spike (#1150)

Executable research evidence for the L2 R0 `K_EXTENSION_FEASIBILITY_HOLD`
(parent: #1148). This directory is a **research write set** — it adds no
production code and changes nothing under `packages/**`.

## What runs here

- the **REAL selected v0.9 payload bytes** (`kernel-mechanism-v1.mjs`,
  `standard-sdk-v1.mjs` + vendored pure `workflow-router.mjs`,
  `business-approval.mjs`, `capability-quote-tools.mjs`), imported as real ESM
  through private per-activation `data:` URLs exactly like the v0.9 protected
  Host does;
- the **REAL v0.9 zero-import AST gate** (`assertZeroImportEsmModule`)
  re-run by the v0.10-candidate loader on every selected module before ANY
  import;
- a minimal **v0.10 candidate loader/Host seam** (`harness/v10-loader.ts`):
  whole-closure preflight (roles, provider/hook uniqueness, dependency
  completeness/acyclicity, features, ABI, byte digests) → topological import
  → sealed-export check → bounded extension init → ONE K Primary facade;
- a **K Primary composition** (`harness/v10-kernel-primary.ts`) that alone
  invokes the real `createOccurrenceRuntime` and alone owns
  Admission/State/Journal/Effect/Replay/UNKNOWN; extensions participate only
  through two data-only advisory hooks (`admission-budget-advice/v1`,
  `recovery-diagnostics/v1`);
- physically distinct **kernel-extension ESM fixtures** (`fixtures/`):
  two benign useful providers plus malicious/fault variants (oversize and
  smuggled advice, malformed returns, forged recovery terminal, privileged
  init returns, protected-port probes, post-preflight init failure,
  evaluation side-effect sentinel).

## Run

```bash
node --import tsx --test tests/architecture-v010-k-extensions/v010-k-extensions.test.ts
```

Optionally materialize measured counters:

```bash
V10_EVIDENCE_DIR=docs/experiments/v010-k-extension-feasibility/evidence \
  node --import tsx --test tests/architecture-v010-k-extensions/v010-k-extensions.test.ts
```

NOT claimed: malicious-JS isolation (same-realm trusted JS is not a sandbox),
SQLite/process-kill/network, #1124/#1126 principal/permit machinery,
multi-Host CAS interleaving (K01/C01 scope).
