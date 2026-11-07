# Textile Pattern Process Selection — DIS F012 reference profile

This experimental REFERENCE package proposes a **candidate sample-planning route**. It is not a production qualification, supplier recommendation, machine-control program or proof that DomainHarness Runtime adopts DIS (#1486). All briefs are synthetic and are unrelated to claims about ethnic textile traditions. No Tally assets are used.

The frozen standard is HEAD `9504c78f4651f6c1ebc48c7858fca2d8b061544b`, TREE `c8bab9f5931f0a8e2fa97b4e98c9a77f33962149`. Its five schemas are consumed without modification. Unlike xDownload's page/player ontology, this profile models warp/weft structure, pattern placement and surface process evidence. Jacquard embeds design during weaving; block printing applies pattern to fabric; embroidery adds stitching. Plain/twill/satin describe weave structure and are not interchangeable surface-decoration methods.

## Source ledger

The machine-readable ledger in `fixtures/textile-knowledge.json` records authority, URL, exact section locator, access date and limitations. Only short original paraphrases are stored; no images or substantial text are copied.

1. [NC State Weaving Studio](https://textiles.ncsu.edu/industry/labs-and-facilities/weaving-studio/): “Weaving Studio”, “Unique Capabilities”, “Equipment”; current capture lines 64–88. Educational sampling and individual-thread-control Jacquard capability.
2. [NC State Weaving Lab](https://textiles.ncsu.edu/zte/weaving-lab/): “Weaving Lab”, “What is Shedding?”, “Whats is dobby shedding?”, “What is jacquard shedding?”; current capture lines 35–40, 90–101. Shedding and individual warp control distinctions.
3. [GWU Textile Traditions](https://museum.gwu.edu/textile-traditions): “Block Printing in India” (114–116), “Suzani in Uzbekistan” (129–131), “Jacquard in Japan” (140–142). These sections support process distinctions, not a cultural attribution of synthetic inputs.
4. [NPS Weaving Patterns](https://www.nps.gov/articles/000/weaving-patterns.htm): “Weaving Patterns” (19–25), “Plain Weave” (26–36), “Twill” (37–49), “Satin” (52–54). The last locator includes the Satin text beyond the original Issue's shortened capture range. Section headings are stable locators; web line numbers are capture-specific.

All were accessed 2026-11-07. No evidence establishes Myanmar/local availability, price, MOQ, lead time, machine suitability or commercial feasibility. Each outcome preserves those UNKNOWN questions and requires supplier/sample validation.

## Consumer profile

`loadPackage({expectedClosureSha256})` verifies the caller's exact closure pin, every admitted byte and local realpath containment before creating a private snapshot. This pin is an integrity selection for a REFERENCE experiment, not production promotion authority. Units do not claim PROMOTED maturity; no synthetic governance grant is manufactured. Changing a selected fixture requires a newly admitted pin. The Knowledge mutation test disables Jacquard in an isolated temporary package, reseals its references, selects the new pin and demonstrates actual UNKNOWN output; the old loaded snapshot still returns Jacquard.

`runPipeline(brief, handle)` performs no file/network/Tool/Effect operations. It executes the verified DAG: Recognizer → Decision → Validator. Its structured brief distinguishes placement and surface method, records source claims, rejects malformed input, and preserves UNKNOWN/AMBIGUOUS/CONFLICT/OUT_OF_SCOPE/NEEDS_INPUT/FAILED outcomes. READY means only that one source-backed candidate route was found. A reported failed sample check produces FAILED. There are no machine settings, prices or production commitments.

## Reproduction

Use Windows-native Node **24.21.0** and Python 3.13.15 with `jsonschema==4.26.0`; no WSL. First run `node --check src/runner.mjs`, `node --check test/runner.test.mjs` and Python syntax compilation with a temporary pycache prefix. Then run `npm test`, `npm run demo` and `npm run validate`. Tests use Node's built-in runner and no package installation. The Python validator independently loads frozen schemas, hashes all resources, reconstructs Graph inputs/control/outputs and checks actual Node traces and the changed-Knowledge result.

`domain/resource-closure.json` includes all 16 consumed definition, graph, Unit, schema, knowledge, scenario, implementation, conformance and README resources. It excludes the descriptor/manifest envelopes and four generated validation outputs to avoid a self-hashing cycle. The descriptor pins the manifest's raw-byte SHA256. Generated traces/report are validated as outputs, never treated as source authority. `validation/FINAL_VALIDATION.md` and the external exact-SHA receipt describe validation scope and limitations.
