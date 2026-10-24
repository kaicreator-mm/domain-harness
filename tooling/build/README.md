# DomainHarness v0.10.2 BUILD package (T05 draft)

This package owns static closed-world Domain App BUILD composition, selected-closure resolution and sealed ordinary-import policy. It MUST NOT import or expose Microkernel/Host runtime authority. It consumes only canonical shared types/errors/constants from `@kaicreator/domain-harness-contracts` and Node built-ins.

The parser is a vendored Acorn 8.19.0 migration from the previously pinned compiler v09 parser. `src/generated/acorn.ts` preserves the upstream vendored source plus a TypeScript no-check directive and emits one `dist/generated/acorn.js` through normal tsc (no runtime compiler import). The exact emitted bytes must be pinned before acceptance; `src/parser.ts` currently fails closed with `PENDING_PHYSICAL_T05_DIST_PIN` until a real Node24 build computes the SHA256 and confirms the source provenance.

## Required gates before source PASS

- Source inspection and minimal correction of `src/import-policy.ts`: remove any surviving old compiler-v09 Acorn type import / `V09_BUILD_PARSER_PIN` symbols after the split.
- Run Node24 `npm run build -w @kaicreator/domain-harness-build`; pin actual emitted Acorn JS SHA-256 and prove fail-closed tamper negative. Existing vendored acorn.mjs reference blob is `aee191eb880c1eb7733665be63b48038dd61f726` with SHA256 `76254fc76529713b4dfd2532972d17a991ffd9aafeebb1f977445b5506b9fb0b`.
- Run scoped `node --import tsx --test tooling/build/tests/*.test.ts` and the frozen `tests/compiler/v010-selected-closure.test.ts`, `v10build-composition.test.ts`; check catalog, wire literals and positive/negative BUILD vectors.
- Confirm `tooling/build` clean packed dist and Acorn parser installed without the old compiler; record stdout/exit/hashes.
- Do not edit package manifests, lockfile, Microkernel or Host. Compiler compatibility shim/cutover must respect T05/T11/T07b ownership and not break existing clean consumers.
- Independent exact-head review P0/P1/P2 before merge to v0.10.2. No premature main merge.

**Status**: Web draft, tests NOT_RUN and parser dist SHA NOT_PINNED; NOT merge-ready. This document is operational source handoff, not a new design authority.
