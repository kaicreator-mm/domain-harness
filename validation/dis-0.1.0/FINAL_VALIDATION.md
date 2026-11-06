# DIS 0.1.0 — Historical Demo Validation (PASS at d8c516e)

<badge>PASS</badge>

**Historical scope only:** this report validates the Demo/standard artifact recorded below at commit d8c516e. It does not validate the later L2 R1/R2 candidate, does not qualify PR #1482, and does not establish current DomainHarness Runtime/SDK support for DIS.

- Branch: `dis-0.1.0`
- Tested standard/demo commit: `d8c516e7b564db8572631d2d2d435491b8f43b33`
- Final validation commit: this commit
- Report: `final-validation.json`
- Validation time: 2026-11-05 10:44:24 UTC

## Environment

- Node.js v22.16.0
- npm 10.9.2
- Python 3.13.5
- jsonschema 4.26.0
- Linux x86_64

This is an isolated DIS demo qualification. It is not the DomainHarness repository's Node >=24 CI qualification.

## Commands

```sh
npm test
npm run demo
python -m pip install -r requirements-validation.txt
python scripts/validate.py
```

## Results

| Area | Result |
|---|---:|
| Node test suite | **15/15 PASS** |
| Demo scenarios | **4/4 PASS** |
| DIS JSON Schema self-validation | **5/5 PASS** |
| Intelligence Unit descriptors | **6/6 PASS** |
| Graph / Definition / Resource Closure | **PASS** |
| Executed Node input contracts | **16/16 PASS** |
| Executed Node output contracts | **16/16 PASS** |
| Unsafe resource reference negatives | **6/6 rejected** |
| Resource SHA-256 pins | **9/9 PASS** |

### Demo scenarios

| Scenario | Terminal result | Control path |
|---|---|---|
| Known jwplayer | READY | Recognizer → Decision → private Procedure → Validator |
| Ambiguous jwplayer + videojs | NEEDS_INPUT | Recognizer → Decision → bounded fallback → Validator |
| Unknown player | NEEDS_REVIEW | Recognizer → Decision → bounded fallback → Validator |
| Fixture-backed hls.js | READY | Recognizer → Decision → private Procedure → Validator |

The fixture-backed path proves that the Unit Evidence references are the actual runtime sources, not merely documentary links.

## Findings closed

- **DIS-F-001 (P1):** Split control, data and evidence edges. No implicit whole-output pass-through.
- **DIS-F-002 (P2):** Added safe package-relative Schema closure, nested local `$ref` resolution and SHA-256 pinning.
- **DIS-F-003 (P1):** Aligned Decision/Procedure output Schemas with actual no-pass-through behavior and independently carried evidence.
- **DIS-F-004 (P1):** Repaired the Validation Report Schema JSON syntax.
- **DIS-F-005 (P2):** Rejected absolute, remote, traversal, empty-segment, dot-segment and backslash paths.
- **DIS-F-006 (P2):** Changed Recognizer and Procedure to consume the referenced package fixture catalogs.

## Explicit 0.1.0 limits

- Graph JSON Pointers support the root output object or one top-level property only. Nested pointers are rejected, not partially interpreted.
- The demo uses a bounded local signature catalog and does not claim production xDownload player coverage.
- The runner is a reference consumer for the DIS model, not the DomainHarness Runtime or KDP.
- This does not prove current DomainHarness Runtime/SDK consumption of DIS.

## Scope boundary

No SDK source, public ABI, Manifest/BUILD ABI, KDP, Host, Hook, v0.10.3 tag, release, deployment or `main` branch was changed. The initial draft and initial validation remain immutable in Git history. This final report is a separate artifact and does not promote/freeze Product/L1 or L2.
