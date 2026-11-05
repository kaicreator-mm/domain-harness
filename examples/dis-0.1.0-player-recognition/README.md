# DIS 0.1.0 Demo — xDownload Player Recognition

This isolated demo exercises the initial DIS 0.1.0 candidate against a bounded xDownload-style media-player recognition problem. It does not import or modify the DomainHarness SDK and does not perform network access or media downloads.

Run from this directory with npm test and npm run demo. Node.js 22+ is sufficient for this dependency-free proof; the DomainHarness repository itself retains its existing Node >=24 requirement.

The demo proves that a Recognizer is a contract-bearing Unit, Decision routes known recognition to a private Procedure and ambiguous/unknown recognition to a bounded handoff, Validator checks the terminal outcome and evidence, a private Procedure is not wrapped or reclassified as a Tool, and invalid/unknown/ambiguous inputs do not silently become success.

Initial design probe: the initial graph edge combines transition control (when) and data transfer (map). Decision and Procedure therefore echo recognition/evidence for later nodes. Tests preserve this observation so the standard can be revised from execution evidence. See validation/dis-0.1.0/INITIAL_VALIDATION.md.

This is a standards proof, not a production xDownload implementation and not evidence that the current DomainHarness Runtime already consumes DIS.