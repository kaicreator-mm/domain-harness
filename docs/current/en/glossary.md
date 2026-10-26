# DomainHarness v0.10.2 · Glossary

[Index](index.md) · [中文版](../zh-CN/glossary.md)

| Term | Meaning |
| --- | --- |
| **Domain Package** | Independently selected, identified/ABI-bound K/S/B/C module; **not** every JS function |
| **Domain App** | Trusted sealed plain-data App created by external BUILD and consumed at runtime |
| **BUILD** | Pre-runtime selection and validation of hashes, ABI, imports and routes |
| **Microkernel** | Minimal loader, binding and lifecycle; **not** an independent business state engine |
| **K Primary** | Unique authority for State/Admission/Journal/Effect/Replay/UNKNOWN |
| **K Extension** | Read-only advisory Hook; not a second K Primary |
| **S Primary / Feature** | Selected semantic/Workflow/Rule interpretation and optional Features |
| **B Business** | Domain Intent, policy and workflow |
| **C Capability / Tool** | Explicit declared Operation boundary; external Effect requires K permit |
| **Host / DocStore** | Physical persistence, SQLite/CAS, trusted caller binding and adapters |
| **CAS** | Conditional compare-and-swap atomic write; Tiny file example is not cross-process CAS |
| **Replay** | K-governed idempotent replay for identical Message/Intent/Input |
| **UNKNOWN** | Preserved ambiguous external Effect outcome; not synthetic success or blind retry |
| **Scoped Query** | Explicit Business/Workflow/Instance target with actual Host-bound caller authority |
| **RQ CONDITIONAL** | Release under reviewed, scope-limited exception—not an all-tests-green receipt |

See [architecture](architecture.md) and [SDK API](sdk.md). These explanations do not override frozen typed ABI definitions.

---

**Authority:** tagged source `cee14399d9d0af4e20e34b9111861b16a465b690`; v0.10.2 was qualified **CONDITIONALLY**. Post-release docs do not alter that SHA or authority.
