# T06 intended isolated write set
NEW packages/domain-harness-compiler/src/qualified-package/payload/sfeature-decision-evidence-v1.mjs
NEW tests/assembly/v010-t06-decision-evidence.test.ts
NEW packages/domain-harness-compiler/src/qualified-package/v10evidence/decision-evidence-observer.ts (LOCAL slice: Host-origin read-only observation bridge; deployment module, NOT BUILD-sealed, imports only public facade/digest surfaces)
NEW tests/assembly/fixtures-v010/business-restricted-approval-v1.mjs (LOCAL slice: restricted-role Business for the real business-caller-role denial receipt)
Potential consumer integration must reuse already merged T02 selected S facade; no edits to activation.ts while C01 owns that same file. No selected Kernel, K02 receipts or K01 fence modification. No parallel writer collision.
Tests run on actual Node24 required before closed; no invented pass. Consult actual selected T02 feature source (Rule→Reuse→Procedure→Model/Tool), T04 optional persistence pattern and v0.10 BUILD featureEntry helper.
