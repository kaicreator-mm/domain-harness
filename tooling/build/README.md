# DomainHarness v0.10.2 BUILD package (T05 draft)

This package owns static closed-world Domain App BUILD composition, selected-closure resolution and sealed ordinary-import policy. It MUST NOT import or expose Microkernel/Host runtime authority. It consumes only canonical shared types/errors/constants from `@kaicreator/domain-harness-contracts` and Node built-ins.

The parser is a vendored Acorn 8.19.0 migration from the previously pinned compiler v09 parser. `src/generated/acorn.ts` preserves the upstream vendored source plus a TypeScript no-check directive and emits one `dist/generated/acorn.js` through normal tsc (no runtime compiler import). The emitted bytes are pinned in `src/parser.ts` to SHA-256 `fcc0f872458c16ec224c202de4bdf49c01be03f707394e3897176084bf4a5373` (physical Node v24.21.0 / typescript 5.8.3 build, 2026-10-24); `assertVendoredParserBytes` fails closed on any drift, from both the `dist/` layout and the `src/` (tsx) layout against the same built file.

## Required gates before source PASS

- Source inspection and minimal correction of `src/import-policy.ts`: DONE — the surviving old compiler-v09 Acorn type import (`../v09build/generated/acorn.mjs`, dead path after the split) was removed and the three `V09_BUILD_PARSER_PIN` references now use `BUILD_PARSER_PIN`.
- Node24 `npm run build -w @kaicreator/domain-harness-build`: DONE — emitted `dist/generated/acorn.js` pinned to `fcc0f872458c16ec224c202de4bdf49c01be03f707394e3897176084bf4a5373`; clean-rebuild byte determinism and the fail-closed tamper negative (one tampered byte ⇒ `VENDORED_PARSER_DRIFT`) verified. Existing vendored acorn.mjs reference blob is `aee191eb880c1eb7733665be63b48038dd61f726` with SHA256 `76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b` (re-verified as the exact `// @ts-nocheck`-prefixed content of `src/generated/acorn.ts`).
- Scoped tests: DONE — `node --import tsx --test tooling/build/tests/*.test.ts` (4/4) and the frozen `tests/compiler/v010-selected-closure.test.ts`, `v10build-composition.test.ts` (16/16) pass on Node v24.21.0; workspace typecheck green.
- Independent packing: DONE — `npm pack` of `@kaicreator/domain-harness-build` + `@kaicreator/domain-harness-contracts` installed into a scratch dir; the installed `dist/generated/acorn.js` hashes to the pin, `assertVendoredParserBytes` passes from the installed layout, a full 4-role composition builds positively, `V10_TARGET_UNSUPPORTED` refuses negatively, and the installed tree contains no compiler package.
- Do not edit package manifests, lockfile, Microkernel or Host. Compiler compatibility shim/cutover must respect T05/T11/T07b ownership and not break existing clean consumers.
- Independent exact-head review P0/P1/P2 before merge to v0.10.2. No premature main merge.

**Status**: Physical build + pin + scoped tests + independent packing verified on Node v24.21.0 (evidence logs on the PR). Dist SHA pinned; still NOT merge-ready until the independent exact-head review P0/P1/P2 and controller `task-check` pass. This document is operational source handoff, not a new design authority.
