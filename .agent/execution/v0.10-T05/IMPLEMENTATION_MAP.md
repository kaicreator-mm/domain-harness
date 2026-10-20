# Exact new files
NEW packages/domain-harness-compiler/src/qualified-package/payload/sfeature-context-assembly-v1.mjs
NEW tests/assembly/v010-t05-context-feature.test.ts
NEW tests/assembly/fixtures-v010/business-agent-workflow-v1.mjs
NEW tests/assembly/fixtures-v010/capability-agent-memory-v1.mjs
NEW tests/assembly/fixtures-v010/capability-agent-tool-v1.mjs
NEW tests/assembly/v010-t05-agent-workflow.test.ts

The Agent is one ordinary selected Business package (workflow `agent-context-loop`):
the Host drives public intents through `facade.send`, the selected T05/T02/T03
Standard features are pure semantic producers, and the one governed mutation is
the Business commit effect (scoped C Memory put) through the real Kernel effect
journal/dispatch. The Tool capability seals ONE read-only operation. No product
source, shared activation seam or Kernel byte is modified by this slice.

T03 standard workflow-control, T02 semantic resolver, T04 selected Memory adapter, v10build composition ABI READ ONLY; Kernel/K01/K02/C01 and `v10build/activation.ts` protected. No independent Agent Runtime.
