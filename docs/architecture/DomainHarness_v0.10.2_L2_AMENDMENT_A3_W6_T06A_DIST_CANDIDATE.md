# DomainHarness v0.10.2 — A3 W6 exact derived-dist write-set exception for T06a

**Status:** PROSPECTIVE_SOURCE_ONLY_REVIEW_CANDIDATE / NOT_ADOPTED. **Only** concerns T06a #1348 under adopted A3 #1345; original frozen L2 §8/§12, A3 document blob `2e2a6d64b592652216b07ef4b6b9f86253ca5307` and existing accepted task evidence are unchanged.

## Why this small exception is necessary

T06a's adopted A3 source write set contains *exactly two new paths*: `packages/microkernel/src/subscription-projection.ts` and `packages/microkernel/tests/subscription-projection.test.ts`. They already exist as isolated, not-merged draft source on `task/dh-v0102-t06a-pure-projection-source-1348-web@cd47ffe979e53e35c92d9c63e3ba6741d0e1cb44`. Real Node24 v24.21.0 targeted tests **6/6 PASS**, typecheck PASS; actual observer and governed event delivery belongs to T06b #1326 and remains NOT_RUN.

Microkernel TS build uses `tsconfig.build.json` extending `tsconfig.json` (`include: src/**/*.ts`, `declaration: true`, `outDir: dist`), without source/declaration maps. Compiling the new `src/subscription-projection.ts` produces **two new output files**:
1. `packages/microkernel/dist/subscription-projection.js`
2. `packages/microkernel/dist/subscription-projection.d.ts`

`scripts/check-committed-dist.mjs` guards all non-private workspace dist trees with `git status --porcelain`. Without tracking the two derived files, every post-build PR verification can fail despite green T06a semantic tests.

## Narrow amended permission (EXACT TWO GENERATED PATHS ONLY)

Original exact two source/test files remain owned by T06a and **only** the two mechanically compiled JS/d.ts files above are appended to its allowed writes. No `package.json`, `package-lock.json`, `tsconfig`, `src/index.ts`, `dist/index.*`, catalogue, K/S source payload, root tests or .woodpecker modifications are authorized. No Test DAG successor edge changes, no new task, no version jump.

T06a must still start **only after** exact reviewed T04 #1324 merges and closes; re-pin final PR onto latest `v0.10.2`. Compare draft original source bytes before cherry-pick, produce real Node24 emitted dist (not manual edited/generated guessed text), commit both outputs, run source 6/6, package typecheck, `npm run build` / committed-dist and appropriate scoped tests, request distinct independent exact-SHA source review before version merge. T03b and T06b own their separate write sets; T06b must not silently edit T06a outputs.

## Review request

Independent read-only reviewer to verify (1) current actual TypeScript config, (2) `check-committed-dist.mjs` shipped guard behavior, (3) exact two output paths and no declaration/source maps, (4) source test evidence correctly scoped, (5) no broader authorization, (6) A3 original DAG unchanged. Return P0/P1/P2, PASS/BLOCK, `A3_W6_WRITESET_READY`, exact HEAD. Merge only this docs amendment to `v0.10.2` **after** independent PASS; never treat docs-only approval as physical T06a PASS.
