# DIS 0.1.0 Demo — xDownload Player Recognition

This isolated demo exercises the demo-revised DIS 0.1.0 candidate against a bounded xDownload-style media-player recognition problem. It does not import or modify the DomainHarness SDK and does not perform network access or media downloads.

Run from this directory with npm test and npm run demo. Node.js 22+ is sufficient for this dependency-free proof; the DomainHarness repository itself retains its existing Node >=24 requirement.

The demo proves:
- Recognizer, Decision, Procedure, Workflow and Validator are contract-bearing Units.
- Control edges select execution paths; data edges bind values without scheduling nodes; evidence edges preserve provenance independently.
- The known-player route resolves through a private Procedure; ambiguous/unknown cases go to bounded clarification/review.
- Required inputs and evidence slots must be bound.
- Schema references and nested local references are resolved inside the package resource closure and receive SHA-256 digests.
- Missing resources and path traversal are rejected.
- Private Procedures remain private and are not wrapped or reclassified as Tools.

The first iteration and its findings remain in Git history and validation/dis-0.1.0/INITIAL_VALIDATION.md. The revised 13-test suite is recorded separately in FINAL_VALIDATION.md.

This is a standards proof, not a production xDownload implementation and not evidence that the current DomainHarness Runtime already consumes DIS. The runner is a small reference consumer for the DIS model, not a replacement Runtime or KDP.
