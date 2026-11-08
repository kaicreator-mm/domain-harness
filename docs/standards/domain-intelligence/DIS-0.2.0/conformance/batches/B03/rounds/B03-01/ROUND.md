# B03-01 / R38 — Exact selected Target binding over canonical V10 BUILD

**CI_PENDING;** independent round source/test commit. Parent `44ab1177f0c8c7f5a66a258feba1fcfbb7228bbe` Woodpecker #2281/1–3 **SUCCESS**.

R38 adds an **optional** `program.target` contract: `schema:'dis.v0.2.selected-target/1'`, `platform` (linux/windows/android), `architecture` (x64/arm64), `runtime:'node'`, and **complete selected canonical BUILD module ID → SHA256 roster**. The native DIS AOT qualifier ensures no selected module can be omitted, relabeled or independently modified. The module source bytes and real Tally/xDownload/KDP route remain trusted by existing V10 BUILD; Target claims are part of the sealed AOT digest. Existing untargeted experimental DIS v0.2 artifacts remain admissible and qualify `target:null` for backwards compatibility.

Native positive uses the actual original selected Tally/xDownload Business, the real canonical KDP/C module roster, and independent original source Git Blobs. Negative cases: incomplete modules, unknown/duplicate Package, altered module SHA and invalid/unapproved Target fields.

**Important:** An AOT producer's `platform:'linux'` label plus digest coverage is **not independent proof of a native Linux implementation**, and no Windows or Android host was tested. An installer must separately supply a trusted Target identity before targeted KDP boot (validated in R39). This is a bounded Draft ABI experiment, not Product/L1-approved Target applicability, and CORE-008 remains PARTIAL.

[Machine round receipt](round.json) will bind actual final source SHA and Woodpecker checks after CI readback. No release/freeze.
