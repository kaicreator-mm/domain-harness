# DIS 0.1.0 Demo — xDownload Player Recognition

This isolated demo exercises the demo-revised DIS 0.1.0 candidate against a bounded xDownload-style media-player recognition problem. It does not import or modify the DomainHarness SDK and does not perform network access or media downloads.

Run from this directory with `npm test` and `npm run demo`. For schema and end-to-end I/O conformance, install `python -m pip install -r requirements-validation.txt` and run `python scripts/validate.py` (or `npm run validate`). Node.js 22+ is sufficient for this isolated proof; the DomainHarness repository itself retains its existing Node >=24 requirement.

The demo proves:
- Recognizer, Decision, Procedure, Workflow and Validator are contract-bearing Units.
- Control edges select execution paths; data edges bind values without scheduling nodes; evidence edges preserve provenance independently.
- The known-player route resolves through a private Procedure; ambiguous/unknown cases go to bounded clarification/review.
- Required inputs and evidence slots must be bound.
- Schema references and nested local references are resolved inside the package resource closure and receive SHA-256 digests.
- Missing resources and path traversal are rejected.
- Private Procedures remain private and are not wrapped or reclassified as Tools.

The first iteration and its findings remain in Git history and validation/dis-0.1.0/INITIAL_VALIDATION.md. The revised 15-test suite, five-schema self-validation, six Unit checks, Graph/Definition/resource closure checks, and all 16 node input/output contract checks are recorded in `validation/dis-0.1.0/FINAL_VALIDATION.md`.

This is a standards proof, not a production xDownload implementation and not evidence that the current DomainHarness Runtime already consumes DIS. The runner is a small reference consumer for the DIS model, not a replacement Runtime or KDP.


The signature and strategy catalogs under `fixtures/` are the actual sources consumed by Recognizer and Procedure; Unit evidence references these package resources. The 0.1.0 Graph pointer profile intentionally supports only the root output object or one top-level property pointer. Nested JSON Pointers are rejected rather than partially validated.
