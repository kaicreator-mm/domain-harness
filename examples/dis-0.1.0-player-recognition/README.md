# DIS 0.1.0 Demo — xDownload Player Recognition

This isolated demo exercises the demo-revised DIS 0.1.0 candidate against a bounded xDownload-style media-player recognition problem. It does not import or modify the DomainHarness SDK and does not perform network access or media downloads.

The bounded observation profile accepts `claims` with source and player identifiers and explicit `encryptedPlayer` / `unsupportedPlayerFamily` flags. Conflicting claims are preserved as structured evidence and require clarification. Non-HTTP(S) observations and either exclusion flag yield `out_of_scope` and are rejected by the selected policy. Unrecognized applicability or failure actions fail closed. Lifecycle reports and the reference governance grant are deliberately synthetic and demonstrate binding only; they do not claim production validation or authority.

Run from this directory with `npm test` and `npm run demo`. For schema and end-to-end I/O conformance, install `python -m pip install -r requirements-validation.txt` and run `python scripts/validate.py` (or `npm run validate`). Node.js 22+ is sufficient for this isolated proof; the DomainHarness repository itself retains its existing Node >=24 requirement.

The demo proves:
- Recognizer, Decision, Procedure, Workflow and Validator are contract-bearing Units.
- Control edges select execution paths; data edges bind values without scheduling nodes; evidence edges preserve provenance independently.
- The known-player route resolves through a private Procedure; ambiguous/unknown cases go to bounded clarification/review.
- Required inputs and evidence slots must be bound.
- All required Unit, Graph, Definition, Schema, fixture, implementation and conformance resources are closed by path, kind, owner and SHA-256; the Package descriptor pins the exact manifest digest. Symlink escapes are rejected.
- Missing resources, path traversal and symlink escapes are rejected.
- Private Procedures remain private and are not wrapped or reclassified as Tools.

The first iteration and its findings remain in Git history and validation/dis-0.1.0/INITIAL_VALIDATION.md. The revised 15-test suite, five-schema self-validation, six Unit checks, Graph/Definition/resource closure checks, and all 16 node input/output contract checks are recorded in `validation/dis-0.1.0/FINAL_VALIDATION.md`.

This is a standards proof, not a production xDownload implementation or evidence that v0.10.3 consumes DIS or implements the #1484 successor Boot → KDP Primary authority. The lifecycle records and governance actors in the Package descriptor are synthetic fixtures, not real production approvals.


The signature and strategy catalogs under `fixtures/` are the actual sources consumed by Recognizer and Procedure; Unit evidence references these package resources. The 0.1.0 Graph pointer profile intentionally supports only the root output object or one top-level property pointer. Nested JSON Pointers are rejected rather than partially validated.

The descriptor pins a digest of the complete selection lock. The caller MUST supply an independently trusted `expectedSelectionLockSha256` to `loadDemo`; the command-line examples and tests take it from `DIS_EXPECTED_SELECTION_LOCK_SHA256`. Missing or mismatched pins fail closed. Obtain this value from the authorized Package BUILD/deployment boundary, not from an untrusted descriptor being checked. For this synthetic fixture, use the lock digest recorded by a trusted exact-SHA validation receipt; fixture actor identities do not establish real production authority.
